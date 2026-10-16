<?php

declare(strict_types=1);

namespace App\Mvp\Reservations;

use DateTimeImmutable;
use InvalidArgumentException;

/**
 * Validates and normalizes atomic two-leg round-trip reservation commands.
 * Closed shape, deterministic child submission UUID derivation, and passenger identity alignment.
 */
final class ReservationTripCommand
{
    private const UUID_REGEX = '/\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/i';

    /**
     * Parses and normalizes a round-trip reservation payload.
     *
     * @param array<string, mixed> $input
     * @return array{
     *     submissionId: string,
     *     contact: array{email: string, phone: string},
     *     legs: array<int, array{
     *         submissionId: string,
     *         serviceId: string,
     *         passengers: list<array{
     *             id: string,
     *             type: string,
     *             firstName: string,
     *             lastName: string,
     *             dob: string,
     *             nationality: string,
     *             document: string,
     *             seatCode: string,
     *             mealId: ?string
     *         }>,
     *         contact: array{email: string, phone: string}
     *     }>
     * }
     */
    public static function parse(array $input): array
    {
        self::keys($input, ['submissionId', 'contact', 'legs']);

        $topSubmissionId = $input['submissionId'] ?? null;
        if (!is_string($topSubmissionId) || preg_match(self::UUID_REGEX, $topSubmissionId) !== 1) {
            throw new InvalidArgumentException('Invalid reservation trip command: submissionId.');
        }

        $contact = $input['contact'] ?? null;
        if (!is_array($contact)) {
            throw new InvalidArgumentException('Invalid reservation trip command: contact.');
        }
        self::keys($contact, ['email', 'phone']);
        $email = self::text($contact['email'] ?? null, 254);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Invalid reservation trip command: email.');
        }
        $phone = self::text($contact['phone'] ?? null, 32, false);
        if ($phone !== '' && preg_match('/\A\+?[0-9 ()-]{5,32}\z/', $phone) !== 1) {
            throw new InvalidArgumentException('Invalid reservation trip command: phone.');
        }
        $normalizedContact = ['email' => $email, 'phone' => $phone];

        $legs = $input['legs'] ?? null;
        if (!is_array($legs) || !array_is_list($legs) || count($legs) !== 2) {
            throw new InvalidArgumentException('Invalid reservation trip command: exactly two legs required.');
        }

        $childSubId0 = self::deriveChildSubmissionId($topSubmissionId, 0);
        $childSubId1 = self::deriveChildSubmissionId($topSubmissionId, 1);

        $parsedLegs = [];
        foreach ($legs as $idx => $leg) {
            if (!is_array($leg)) {
                throw new InvalidArgumentException('Invalid reservation trip command: leg.');
            }
            self::keys($leg, ['serviceId', 'passengers']);

            $childSubId = $idx === 0 ? $childSubId0 : $childSubId1;
            $legInput = [
                'submissionId' => $childSubId,
                'serviceId' => $leg['serviceId'] ?? null,
                'passengers' => $leg['passengers'] ?? null,
                'contact' => $normalizedContact,
            ];

            // Delegate single-leg parsing to authoritative ReservationCommand parser
            $parsedLegs[$idx] = ReservationCommand::parse($legInput);
        }

        // Two different services required
        if ($parsedLegs[0]['serviceId'] === $parsedLegs[1]['serviceId']) {
            throw new InvalidArgumentException('Invalid reservation trip command: identical services.');
        }

        // Compare passenger identity fields across legs (seatCode and mealId may differ)
        $pCount0 = count($parsedLegs[0]['passengers']);
        $pCount1 = count($parsedLegs[1]['passengers']);
        if ($pCount0 !== $pCount1) {
            throw new InvalidArgumentException('Invalid reservation trip command: passenger count mismatch across legs.');
        }

        for ($i = 0; $i < $pCount0; $i++) {
            $p0 = $parsedLegs[0]['passengers'][$i];
            $p1 = $parsedLegs[1]['passengers'][$i];

            if ($p0['id'] !== $p1['id']
                || $p0['type'] !== $p1['type']
                || $p0['firstName'] !== $p1['firstName']
                || $p0['lastName'] !== $p1['lastName']
                || $p0['dob'] !== $p1['dob']
                || $p0['nationality'] !== $p1['nationality']
                || $p0['document'] !== $p1['document']
            ) {
                throw new InvalidArgumentException('Invalid reservation trip command: passenger identity mismatch across legs.');
            }
        }

        return [
            'submissionId' => strtolower($topSubmissionId),
            'contact' => $normalizedContact,
            'legs' => $parsedLegs,
        ];
    }

    /**
     * Derives deterministic, domain-separated RFC 4122 UUID v5 child submission ID.
     */
    public static function deriveChildSubmissionId(string $parentSubmissionId, int $legIndex): string
    {
        $name = 'gza-reservation-trip:leg:' . $legIndex . ':' . strtolower($parentSubmissionId);
        $namespaceBytes = hex2bin('6ba7b8119dad11d180b400c04fd430c8');
        $hash = sha1($namespaceBytes . $name);
        $timeHi = (hexdec(substr($hash, 12, 4)) & 0x0fff) | 0x5000;
        $clockSeq = (hexdec(substr($hash, 16, 4)) & 0x3fff) | 0x8000;

        return sprintf(
            '%08s-%04s-%04x-%04x-%12s',
            substr($hash, 0, 8),
            substr($hash, 8, 4),
            $timeHi,
            $clockSeq,
            substr($hash, 20, 12)
        );
    }

    private static function text(mixed $value, int $max, bool $required = true): string
    {
        if (!is_string($value) || !mb_check_encoding($value, 'UTF-8') || preg_match('/[\x00-\x1f\x7f]/', $value)) {
            throw new InvalidArgumentException('Invalid reservation trip command.');
        }
        $value = trim($value);
        if (($required && $value === '') || mb_strlen($value) > $max) {
            throw new InvalidArgumentException('Invalid reservation trip command.');
        }
        return $value;
    }

    private static function keys(array $value, array $allowed): void
    {
        if (array_diff(array_keys($value), $allowed) !== []) {
            throw new InvalidArgumentException('Invalid reservation trip command: unexpected keys.');
        }
    }
}
