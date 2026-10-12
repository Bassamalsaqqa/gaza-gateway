<?php

declare(strict_types=1);

namespace App\Identity\Passenger\Profile;

use App\Identity\Audit\AuditActor;
use App\Identity\Audit\AuditOutcome;
use App\Identity\Audit\AuditTargetType;
use App\Identity\Audit\AuditWriter;
use App\Identity\Contracts\CommandViolation;
use App\Identity\Contracts\IdentityCommandValidator;
use App\Identity\Passenger\Profile\Exceptions\MealCatalogUnavailableException;
use App\Identity\Passenger\Profile\Exceptions\ProfileNotFoundException;
use App\Identity\Passenger\Profile\Exceptions\ProfileValidationException;
use App\Support\DatabaseClock;
use App\Support\RequestCorrelation;
use Carbon\CarbonImmutable;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Http\Request;

/**
 * Domain coordinator for passenger profile read and update operations.
 *
 * Implements:
 * 1. GET /auth/passenger/profile (getPassengerProfile) -> 200 PassengerProfileResponse
 * 2. PUT /auth/passenger/profile (putPassengerProfile) -> 200 exact profile receipt
 *
 * Invariants:
 * - Email is sourced from users.email and is immutable; requests containing email fail 422.
 * - Missing profile is a data integrity fault (500 internal_error), never silent implicit creation.
 * - Narrow MealCatalog boundary: changed meal requires available catalog context; fails 503 before writes.
 * - Unchanged or retired preferences survive; unrelated updates leave retired preferences untouched.
 * - Fixed safe error messages with declared field names only; no caller inputs echoed.
 * - Append-only audit events logged with conn:$tx named argument.
 */
final class PassengerProfileCoordinator
{
    public const array VALID_SEAT_PREFERENCES = ['none', 'window', 'aisle', 'extra_legroom'];

    public function __construct(
        private readonly PassengerProfileAuthorizer $authorizer,
        private readonly IdentityCommandValidator $validator,
        private readonly AuditWriter $auditWriter,
        private readonly MealCatalogInterface $mealCatalog,
    ) {
    }

    /**
     * GET /auth/passenger/profile (getPassengerProfile)
     *
     * @return array{
     *     email: string,
     *     firstName: string,
     *     lastName: string,
     *     phone: string,
     *     seatPreference: string,
     *     mealPreference: string,
     *     newsletter: bool
     * }
     */
    public function getProfile(Request $request): array
    {
        $validationResult = $this->validator->validateJson('getPassengerProfile', $request->getContent());
        if (!$validationResult->isValid()) {
            $fields = $this->formatViolations($validationResult->getViolations());
            throw new ProfileValidationException('The given data was invalid.', $fields);
        }

        return $this->authorizer->executeProfileRead($request, $this);
    }

    /**
     * Internal execution for GET /auth/passenger/profile under locked transaction.
     *
     * @return array{
     *     email: string,
     *     firstName: string,
     *     lastName: string,
     *     phone: string,
     *     seatPreference: string,
     *     mealPreference: string,
     *     newsletter: bool
     * }
     */
    public function executeProfileReadInternal(
        AuthorizedPassengerContext $authContext,
        ConnectionInterface $tx,
        Request $request
    ): array {
        $requestId = RequestCorrelation::fromRequest($request);

        $profile = $tx->table('passenger_profiles')
            ->where('user_id', $authContext->userId)
            ->lockForUpdate()
            ->first([
                'user_id', 'first_name', 'last_name', 'phone',
                'seat_preference', 'meal_preference', 'newsletter'
            ]);

        if (!$profile) {
            throw new ProfileNotFoundException('Passenger profile record is missing.');
        }

        $seatPreference = in_array($profile->seat_preference, self::VALID_SEAT_PREFERENCES, true)
            ? $profile->seat_preference
            : 'none';

        $mealPreference = ($profile->meal_preference !== null && $profile->meal_preference !== '')
            ? (string) $profile->meal_preference
            : 'standard';

        $data = [
            'email' => $authContext->getUserEmail(),
            'firstName' => (string) ($profile->first_name ?? ''),
            'lastName' => (string) ($profile->last_name ?? ''),
            'phone' => (string) ($profile->phone ?? ''),
            'seatPreference' => $seatPreference,
            'mealPreference' => $mealPreference,
            'newsletter' => (bool) $profile->newsletter,
        ];

        $this->auditWriter->record(
            actor: AuditActor::passenger($authContext->userId),
            action: 'getPassengerProfile',
            outcome: AuditOutcome::Success,
            targetType: AuditTargetType::User,
            targetId: $authContext->userId,
            metadata: ['success' => true],
            requestId: $requestId,
            conn: $tx,
        );

        return $data;
    }

    /**
     * PUT /auth/passenger/profile (putPassengerProfile)
     *
     * @return array{
     *     changed: bool,
     *     account: array{
     *         email: string,
     *         firstName: string,
     *         lastName: string,
     *         phone: string,
     *         seatPreference: string,
     *         mealPreference: string,
     *         newsletter: bool
     *     }
     * }
     */
    public function updateProfile(Request $request): array
    {
        $rawContent = (string) $request->getContent();

        // 1. Validate JSON schema via IdentityCommandValidator
        $validationResult = $this->validator->validateJson('putPassengerProfile', $rawContent);
        if (!$validationResult->isValid()) {
            $fields = $this->formatViolations($validationResult->getViolations());
            throw new ProfileValidationException('The given data was invalid.', $fields);
        }

        $payload = json_decode($rawContent, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($payload)) {
            throw new ProfileValidationException('Invalid profile payload.', ['payload' => ['Must be a JSON object']]);
        }

        // 2. Semantic invariants check before transaction
        if (array_key_exists('email', $payload)) {
            throw new ProfileValidationException(
                'Identity invariant: email is read-only and cannot be modified via profile update',
                ['email' => ['Email is read-only and immutable in profile update']]
            );
        }

        if (array_key_exists('id', $payload) || array_key_exists('userId', $payload)) {
            throw new ProfileValidationException(
                'Identity invariant: security identifiers cannot be injected into profile update',
                ['id' => ['Cannot inject identity identifiers into profile update']]
            );
        }

        if (array_key_exists('seatPreference', $payload) && !in_array($payload['seatPreference'], self::VALID_SEAT_PREFERENCES, true)) {
            throw new ProfileValidationException(
                'Invalid seat preference option.',
                ['seatPreference' => ['Invalid seat preference option']]
            );
        }

        return $this->authorizer->executeProfileUpdate($request, $payload, $this);
    }

    /**
     * Internal execution for PUT /auth/passenger/profile under locked transaction.
     *
     * @param array<string, mixed> $payload
     * @return array{
     *     changed: bool,
     *     account: array{
     *         email: string,
     *         firstName: string,
     *         lastName: string,
     *         phone: string,
     *         seatPreference: string,
     *         mealPreference: string,
     *         newsletter: bool
     *     }
     * }
     */
    public function executeProfileUpdateInternal(
        AuthorizedPassengerContext $authContext,
        ConnectionInterface $tx,
        array $payload,
        Request $request
    ): array {
        $requestId = RequestCorrelation::fromRequest($request);

        $current = $tx->table('passenger_profiles')
            ->where('user_id', $authContext->userId)
            ->lockForUpdate()
            ->first([
                'user_id', 'first_name', 'last_name', 'phone',
                'seat_preference', 'meal_preference', 'newsletter'
            ]);

        if (!$current) {
            throw new ProfileNotFoundException('Passenger profile record is missing.');
        }

        // 3. Authoritative meal boundary check
        $currentStoredMeal = $current->meal_preference !== null ? trim((string) $current->meal_preference) : '';
        $isMealProvided = array_key_exists('mealPreference', $payload);
        $incomingMeal = $isMealProvided ? trim((string) $payload['mealPreference']) : $currentStoredMeal;

        if ($isMealProvided && $incomingMeal !== $currentStoredMeal) {
            // Meal preference genuinely changed
            if (!$this->mealCatalog->isAvailable()) {
                // Fail closed with 503 BEFORE any writes
                throw new MealCatalogUnavailableException(
                    'Authoritative commercial catalog context is required to validate changed meal preference.'
                );
            }

            $activeMeals = $this->mealCatalog->getActiveMealIds();
            if (!in_array($incomingMeal, $activeMeals, true)) {
                // Return fixed safe error message with declared field names only; no caller inputs echoed
                throw new ProfileValidationException(
                    'Changed meal preference is not an active commercial catalog option.',
                    ['mealPreference' => ['Selected meal preference is not an active commercial catalog option.']]
                );
            }
        }

        // 4. Derive merged target values
        $newFirstName = array_key_exists('firstName', $payload)
            ? trim((string) $payload['firstName'])
            : (string) ($current->first_name ?? '');

        $newLastName = array_key_exists('lastName', $payload)
            ? trim((string) $payload['lastName'])
            : (string) ($current->last_name ?? '');

        $newPhone = array_key_exists('phone', $payload)
            ? trim((string) $payload['phone'])
            : (string) ($current->phone ?? '');

        $newSeat = array_key_exists('seatPreference', $payload)
            ? (string) $payload['seatPreference']
            : (string) ($current->seat_preference ?? 'none');

        // Do not normalize stored retired meal values on unrelated update; preserve exact stored authority
        $newMeal = $isMealProvided
            ? $incomingMeal
            : ($current->meal_preference !== null ? (string) $current->meal_preference : null);

        $newNewsletter = array_key_exists('newsletter', $payload)
            ? (bool) $payload['newsletter']
            : (bool) $current->newsletter;

        // Detect if anything actually changed
        $changed = (
            $newFirstName !== (string) ($current->first_name ?? '') ||
            $newLastName !== (string) ($current->last_name ?? '') ||
            $newPhone !== (string) ($current->phone ?? '') ||
            $newSeat !== (string) ($current->seat_preference ?? 'none') ||
            $newMeal !== ($current->meal_preference !== null ? (string) $current->meal_preference : null) ||
            $newNewsletter !== (bool) $current->newsletter
        );

        if ($changed) {
            $tx->table('passenger_profiles')
                ->where('user_id', $authContext->userId)
                ->update([
                    'first_name' => $newFirstName,
                    'last_name' => $newLastName,
                    'phone' => $newPhone,
                    'seat_preference' => $newSeat,
                    'meal_preference' => $newMeal,
                    'newsletter' => $newNewsletter,
                    'updated_at' => DatabaseClock::raw(),
                ]);
        }

        $effectiveMealDisplay = ($newMeal !== null && $newMeal !== '') ? $newMeal : 'standard';

        $account = [
            'email' => $authContext->getUserEmail(),
            'firstName' => $newFirstName,
            'lastName' => $newLastName,
            'phone' => $newPhone,
            'seatPreference' => in_array($newSeat, self::VALID_SEAT_PREFERENCES, true) ? $newSeat : 'none',
            'mealPreference' => $effectiveMealDisplay,
            'newsletter' => $newNewsletter,
        ];

        $this->auditWriter->record(
            actor: AuditActor::passenger($authContext->userId),
            action: 'putPassengerProfile',
            outcome: AuditOutcome::Success,
            targetType: AuditTargetType::User,
            targetId: $authContext->userId,
            metadata: ['version' => $changed ? 2 : 1],
            requestId: $requestId,
            conn: $tx,
        );

        return [
            'changed' => $changed,
            'account' => $account,
        ];
    }

    /**
     * @param list<CommandViolation> $violations
     * @return array<string, list<string>>
     */
    private function formatViolations(array $violations): array
    {
        $fields = [];
        foreach ($violations as $violation) {
            $path = $violation->getPath() !== '' ? $violation->getPath() : 'payload';
            $fields[$path][] = $violation->getMessage();
        }
        return $fields;
    }
}
