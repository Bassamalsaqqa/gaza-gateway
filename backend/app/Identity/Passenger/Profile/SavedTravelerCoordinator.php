<?php

declare(strict_types=1);

namespace App\Identity\Passenger\Profile;

use App\Identity\Audit\AuditActor;
use App\Identity\Audit\AuditOutcome;
use App\Identity\Audit\AuditTargetType;
use App\Identity\Audit\AuditWriter;
use App\Identity\Contracts\CommandViolation;
use App\Identity\Contracts\IdentityCommandValidator;
use App\Identity\Passenger\Profile\Exceptions\ProfileValidationException;
use App\Identity\Passenger\Profile\Exceptions\TravelerNotFoundException;
use App\Support\RequestCorrelation;
use Carbon\CarbonImmutable;
use DateTimeImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Domain coordinator for companion saved traveler operations.
 *
 * Implements:
 * 1. GET /auth/passenger/travelers (getSavedTravelers) -> 200 SavedTravelersResponse
 * 2. POST /auth/passenger/travelers (postSavedTraveler) -> 201 SavedTravelerResponse
 * 3. PATCH /auth/passenger/travelers/{id} (patchSavedTraveler) -> 200 SavedTravelerResponse
 * 4. DELETE /auth/passenger/travelers/{id} (deleteSavedTraveler) -> 200 DeleteTravelerResponse / 404
 *
 * Invariants:
 * - Scoped strictly to owner_user_id AND external_id (no cross-tenant visibility).
 * - Stable server-allocated opaque external IDs (trv-UUID).
 * - Single-name support: requires at least one non-empty string among firstName / lastName.
 * - PATCH merges with stored record before enforcing single-name requirement.
 * - DOB empty string maps to nullable DATE; non-empty must be valid Gregorian YYYY-MM-DD.
 * - Travel documents encrypted at rest with Encrypter; fails closed with integrity error if decryption fails.
 * - Zero PII in audit metadata, error messages, or logs; no caller inputs echoed in errors.
 * - Truthful no-ops; immutable path ID.
 * - Append-only audit events logged with conn:$tx named argument.
 */
final class SavedTravelerCoordinator
{
    public function __construct(
        private readonly PassengerProfileAuthorizer $authorizer,
        private readonly IdentityCommandValidator $validator,
        private readonly AuditWriter $auditWriter,
        private readonly Encrypter $encrypter,
    ) {
    }

    /**
     * GET /auth/passenger/travelers (getSavedTravelers)
     *
     * @return list<array{
     *     id: string,
     *     firstName: string,
     *     lastName: string,
     *     dob: string,
     *     nationality: string,
     *     document: string
     * }>
     */
    public function getSavedTravelers(Request $request): array
    {
        return $this->listTravelers($request);
    }

    /**
     * Alias for getSavedTravelers.
     *
     * @return list<array{
     *     id: string,
     *     firstName: string,
     *     lastName: string,
     *     dob: string,
     *     nationality: string,
     *     document: string
     * }>
     */
    public function listTravelers(Request $request): array
    {
        $validationResult = $this->validator->validateJson('getSavedTravelers', $request->getContent());
        if (!$validationResult->isValid()) {
            $fields = $this->formatViolations($validationResult->getViolations());
            throw new ProfileValidationException('The given data was invalid.', $fields);
        }

        return $this->authorizer->executeTravelersList($request, $this);
    }

    /**
     * Internal execution for GET /auth/passenger/travelers under locked transaction.
     *
     * @return list<array{
     *     id: string,
     *     firstName: string,
     *     lastName: string,
     *     dob: string,
     *     nationality: string,
     *     document: string
     * }>
     */
    public function executeTravelersListInternal(
        AuthorizedPassengerContext $authContext,
        ConnectionInterface $tx,
        Request $request
    ): array {
        $requestId = RequestCorrelation::fromRequest($request);

        $rows = $tx->table('saved_travelers')
            ->where('owner_user_id', $authContext->userId)
            ->orderBy('created_at', 'asc')
            ->orderBy('id', 'asc')
            ->get([
                'id', 'external_id', 'first_name', 'last_name',
                'dob', 'nationality', 'encrypted_document'
            ]);

        $travelers = [];
        foreach ($rows as $row) {
            $dob = ($row->dob !== null)
                ? CarbonImmutable::parse($row->dob)->format('Y-m-d')
                : '';

            $document = '';
            if ($row->encrypted_document !== null && $row->encrypted_document !== '') {
                try {
                    $document = (string) $this->encrypter->decrypt($row->encrypted_document);
                } catch (\Throwable) {
                    throw new \RuntimeException('Traveler document decryption integrity fault.');
                }
            }

            $travelers[] = [
                'id' => (string) $row->external_id,
                'firstName' => (string) ($row->first_name ?? ''),
                'lastName' => (string) ($row->last_name ?? ''),
                'dob' => $dob,
                'nationality' => ($row->nationality !== null && $row->nationality !== '')
                    ? (string) $row->nationality
                    : 'Palestinian',
                'document' => $document,
            ];
        }

        $this->auditWriter->record(
            actor: AuditActor::passenger($authContext->userId),
            action: 'getSavedTravelers',
            outcome: AuditOutcome::Success,
            targetType: AuditTargetType::User,
            targetId: $authContext->userId,
            metadata: ['count' => count($travelers)],
            requestId: $requestId,
            conn: $tx,
        );

        return $travelers;
    }

    /**
     * POST /auth/passenger/travelers (postSavedTraveler)
     *
     * @return array{
     *     id: string,
     *     firstName: string,
     *     lastName: string,
     *     dob: string,
     *     nationality: string,
     *     document: string
     * }
     */
    public function createTraveler(Request $request): array
    {
        $rawContent = (string) $request->getContent();

        $validationResult = $this->validator->validateJson('postSavedTraveler', $rawContent);
        if (!$validationResult->isValid()) {
            $fields = $this->formatViolations($validationResult->getViolations());
            throw new ProfileValidationException('The given data was invalid.', $fields);
        }

        $payload = json_decode($rawContent, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($payload)) {
            throw new ProfileValidationException('Invalid traveler payload.', ['payload' => ['Must be a JSON object']]);
        }

        // Semantic validation: aliases forbidden
        $this->assertNoForbiddenAliases($payload);

        return $this->authorizer->executeTravelerCreate($request, $payload, $this);
    }

    /**
     * Internal execution for POST /auth/passenger/travelers under locked transaction.
     *
     * @param array<string, mixed> $payload
     * @return array{
     *     id: string,
     *     firstName: string,
     *     lastName: string,
     *     dob: string,
     *     nationality: string,
     *     document: string
     * }
     */
    public function executeTravelerCreateInternal(
        AuthorizedPassengerContext $authContext,
        ConnectionInterface $tx,
        array $payload,
        Request $request
    ): array {
        $requestId = RequestCorrelation::fromRequest($request);

        $firstName = array_key_exists('firstName', $payload) ? trim((string) $payload['firstName']) : '';
        $lastName = array_key_exists('lastName', $payload) ? trim((string) $payload['lastName']) : '';

        if ($firstName === '' && $lastName === '') {
            throw new ProfileValidationException(
                'Traveler requires at least one non-empty firstName or lastName',
                ['firstName' => ['Traveler requires at least one non-empty firstName or lastName']]
            );
        }

        $dobInput = array_key_exists('dob', $payload) ? trim((string) $payload['dob']) : '';
        if ($dobInput !== '') {
            if (!self::isValidISODate($dobInput)) {
                throw new ProfileValidationException(
                    'Invalid calendar date for dob.',
                    ['dob' => ['Date of birth must be a valid Gregorian calendar date in YYYY-MM-DD format.']]
                );
            }
            $dbDob = $dobInput;
        } else {
            $dbDob = null;
        }

        $nationality = array_key_exists('nationality', $payload) && trim((string) $payload['nationality']) !== ''
            ? trim((string) $payload['nationality'])
            : 'Palestinian';

        $documentInput = array_key_exists('document', $payload) ? trim((string) $payload['document']) : '';
        $encryptedDocument = $documentInput !== '' ? $this->encrypter->encrypt($documentInput) : null;

        // Authoritative server-allocated opaque external ID
        $externalId = 'trv-' . Str::uuid()->toString();
        $travelerDbId = (string) Str::uuid();

        $tx->table('saved_travelers')->insert([
            'id' => $travelerDbId,
            'owner_user_id' => $authContext->userId,
            'external_id' => $externalId,
            'first_name' => $firstName,
            'last_name' => $lastName,
            'dob' => $dbDob,
            'nationality' => $nationality,
            'encrypted_document' => $encryptedDocument,
            'created_at' => $tx->raw('clock_timestamp()'),
            'updated_at' => $tx->raw('clock_timestamp()'),
        ]);

        $this->auditWriter->record(
            actor: AuditActor::passenger($authContext->userId),
            action: 'postSavedTraveler',
            outcome: AuditOutcome::Success,
            targetType: AuditTargetType::SavedTraveler,
            targetId: $travelerDbId,
            metadata: ['is_new' => true],
            requestId: $requestId,
            conn: $tx,
        );

        return [
            'id' => $externalId,
            'firstName' => $firstName,
            'lastName' => $lastName,
            'dob' => $dobInput,
            'nationality' => $nationality,
            'document' => $documentInput,
        ];
    }

    /**
     * PATCH /auth/passenger/travelers/{id} (patchSavedTraveler)
     *
     * @return array{
     *     id: string,
     *     firstName: string,
     *     lastName: string,
     *     dob: string,
     *     nationality: string,
     *     document: string
     * }
     */
    public function patchTraveler(Request $request, string $id): array
    {
        $rawContent = (string) $request->getContent();

        $validationResult = $this->validator->validateJson('patchSavedTraveler', $rawContent, ['id' => $id]);
        if (!$validationResult->isValid()) {
            $fields = $this->formatViolations($validationResult->getViolations());
            throw new ProfileValidationException('The given data was invalid.', $fields);
        }

        $payload = json_decode($rawContent, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($payload)) {
            throw new ProfileValidationException('Invalid traveler patch payload.', ['payload' => ['Must be a JSON object']]);
        }

        // Semantic validation: aliases forbidden
        $this->assertNoForbiddenAliases($payload);

        return $this->authorizer->executeTravelerPatch($request, $id, $payload, $this);
    }

    /**
     * Internal execution for PATCH /auth/passenger/travelers/{id} under locked transaction.
     *
     * @param array<string, mixed> $payload
     * @return array{
     *     id: string,
     *     firstName: string,
     *     lastName: string,
     *     dob: string,
     *     nationality: string,
     *     document: string
     * }
     */
    public function executeTravelerPatchInternal(
        AuthorizedPassengerContext $authContext,
        ConnectionInterface $tx,
        string $id,
        array $payload,
        Request $request
    ): array {
        $requestId = RequestCorrelation::fromRequest($request);

        $current = $tx->table('saved_travelers')
            ->where('owner_user_id', $authContext->userId)
            ->where('external_id', $id)
            ->lockForUpdate()
            ->first([
                'id', 'owner_user_id', 'external_id', 'first_name',
                'last_name', 'dob', 'nationality', 'encrypted_document'
            ]);

        if (!$current) {
            throw new TravelerNotFoundException('Saved traveler not found.');
        }

        // 1. Single-name merging rule:
        $mergedFirstName = array_key_exists('firstName', $payload)
            ? trim((string) $payload['firstName'])
            : (string) ($current->first_name ?? '');

        $mergedLastName = array_key_exists('lastName', $payload)
            ? trim((string) $payload['lastName'])
            : (string) ($current->last_name ?? '');

        if ($mergedFirstName === '' && $mergedLastName === '') {
            throw new ProfileValidationException(
                'Traveler requires at least one non-empty firstName or lastName',
                ['firstName' => ['Traveler requires at least one non-empty firstName or lastName']]
            );
        }

        // 2. DOB handling:
        if (array_key_exists('dob', $payload)) {
            $dobInput = trim((string) $payload['dob']);
            if ($dobInput !== '') {
                if (!self::isValidISODate($dobInput)) {
                    throw new ProfileValidationException(
                        'Invalid calendar date for dob.',
                        ['dob' => ['Date of birth must be a valid Gregorian calendar date in YYYY-MM-DD format.']]
                    );
                }
                $mergedDbDob = $dobInput;
                $mergedWireDob = $dobInput;
            } else {
                $mergedDbDob = null;
                $mergedWireDob = '';
            }
        } else {
            $mergedDbDob = $current->dob;
            $mergedWireDob = ($current->dob !== null)
                ? CarbonImmutable::parse($current->dob)->format('Y-m-d')
                : '';
        }

        // 3. Nationality handling:
        $mergedNationality = array_key_exists('nationality', $payload)
            ? (trim((string) $payload['nationality']) !== '' ? trim((string) $payload['nationality']) : 'Palestinian')
            : (string) ($current->nationality ?? 'Palestinian');

        // 4. Document handling:
        $currentDocument = '';
        if ($current->encrypted_document !== null && $current->encrypted_document !== '') {
            try {
                $currentDocument = $this->encrypter->decrypt($current->encrypted_document);
                if (!is_string($currentDocument)) { throw new \RuntimeException('Invalid document representation.'); }
            } catch (\Throwable) {
                throw new \RuntimeException('Traveler document decryption integrity fault.');
            }
        }
        if (array_key_exists('document', $payload)) {
            $docInput = trim((string) $payload['document']);
            $mergedEncryptedDoc = $docInput === $currentDocument ? $current->encrypted_document
                : ($docInput !== '' ? $this->encrypter->encrypt($docInput) : null);
            $outputDocument = $docInput;
        } else {
            $mergedEncryptedDoc = $current->encrypted_document;
            $outputDocument = $currentDocument;
        }

        // Detect if anything changed
        $changed = (
            $mergedFirstName !== (string) ($current->first_name ?? '') ||
            $mergedLastName !== (string) ($current->last_name ?? '') ||
            $mergedDbDob !== $current->dob ||
            $mergedNationality !== (string) ($current->nationality ?? 'Palestinian') ||
            $mergedEncryptedDoc !== $current->encrypted_document
        );

        if ($changed) {
            $tx->table('saved_travelers')
                ->where('id', $current->id)
                ->where('owner_user_id', $authContext->userId)
                ->update([
                    'first_name' => $mergedFirstName,
                    'last_name' => $mergedLastName,
                    'dob' => $mergedDbDob,
                    'nationality' => $mergedNationality,
                    'encrypted_document' => $mergedEncryptedDoc,
                    'updated_at' => $tx->raw('clock_timestamp()'),
                ]);
        }

        $this->auditWriter->record(
            actor: AuditActor::passenger($authContext->userId),
            action: 'patchSavedTraveler',
            outcome: AuditOutcome::Success,
            targetType: AuditTargetType::SavedTraveler,
            targetId: (string) $current->id,
            metadata: ['version' => $changed ? 2 : 1],
            requestId: $requestId,
            conn: $tx,
        );

        return [
            'id' => (string) $current->external_id,
            'firstName' => $mergedFirstName,
            'lastName' => $mergedLastName,
            'dob' => $mergedWireDob,
            'nationality' => $mergedNationality,
            'document' => $outputDocument,
        ];
    }

    /**
     * DELETE /auth/passenger/travelers/{id} (deleteSavedTraveler)
     *
     * @return array{deleted: bool}
     */
    public function deleteTraveler(Request $request, string $id): array
    {
        $validationResult = $this->validator->validateJson('deleteSavedTraveler', $request->getContent(), ['id' => $id]);
        if (!$validationResult->isValid()) {
            $fields = $this->formatViolations($validationResult->getViolations());
            throw new ProfileValidationException('The given data was invalid.', $fields);
        }

        return $this->authorizer->executeTravelerDelete($request, $id, $this);
    }

    /**
     * Internal execution for DELETE /auth/passenger/travelers/{id} under locked transaction.
     *
     * @return array{deleted: bool}
     */
    public function executeTravelerDeleteInternal(
        AuthorizedPassengerContext $authContext,
        ConnectionInterface $tx,
        string $id,
        Request $request
    ): array {
        $requestId = RequestCorrelation::fromRequest($request);

        $current = $tx->table('saved_travelers')
            ->where('owner_user_id', $authContext->userId)
            ->where('external_id', $id)
            ->lockForUpdate()
            ->first(['id', 'owner_user_id', 'external_id']);

        if (!$current) {
            throw new TravelerNotFoundException('Saved traveler not found.');
        }

        $tx->table('saved_travelers')
            ->where('id', $current->id)
            ->where('owner_user_id', $authContext->userId)
            ->delete();

        $this->auditWriter->record(
            actor: AuditActor::passenger($authContext->userId),
            action: 'deleteSavedTraveler',
            outcome: AuditOutcome::Success,
            targetType: AuditTargetType::SavedTraveler,
            targetId: (string) $current->id,
            metadata: ['revoked' => true],
            requestId: $requestId,
            conn: $tx,
        );

        return [
            'deleted' => true,
        ];
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function assertNoForbiddenAliases(array $payload): void
    {
        if (array_key_exists('dateOfBirth', $payload)) {
            throw new ProfileValidationException(
                "Conflicting alias 'dateOfBirth' forbidden; use canonical 'dob'",
                ['dateOfBirth' => ["Conflicting alias 'dateOfBirth' forbidden; use canonical 'dob'"]]
            );
        }
        if (array_key_exists('passport', $payload) || array_key_exists('passportNumber', $payload)) {
            throw new ProfileValidationException(
                "Conflicting alias 'passport' forbidden; use canonical 'document'",
                ['passport' => ["Conflicting alias 'passport' forbidden; use canonical 'document'"]]
            );
        }
        if (array_key_exists('passportExpiry', $payload)) {
            throw new ProfileValidationException(
                "Fabricated field 'passportExpiry' forbidden; profile saves document string only",
                ['passportExpiry' => ["Fabricated field 'passportExpiry' forbidden; profile saves document string only"]]
            );
        }
    }

    /**
     * Validates Gregorian calendar date format YYYY-MM-DD strictly.
     */
    public static function isValidISODate(string $date): bool
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            return false;
        }

        $d = DateTimeImmutable::createFromFormat('Y-m-d', $date);
        return $d && $d->format('Y-m-d') === $date;
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
