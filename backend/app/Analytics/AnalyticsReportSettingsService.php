<?php

declare(strict_types=1);

namespace App\Analytics;

use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class AnalyticsReportSettingsService
{
    public const DEFAULT_RECIPIENT = 'notifications@gazaairport.com';

    public function read(): array
    {
        $row = DB::table('analytics_report_settings')->where('id', 1)->first();
        if (!$row) {
            return [
                'enabled' => false,
                'recipientEmail' => self::DEFAULT_RECIPIENT,
                'revision' => 0,
                'updatedBy' => '00000000-0000-0000-0000-000000000000',
                'updatedAt' => null,
            ];
        }

        return [
            'enabled' => (bool) $row->enabled,
            'recipientEmail' => (string) $row->recipient_email,
            'revision' => (int) $row->revision,
            'updatedBy' => (string) $row->updated_by,
            'updatedAt' => (string) $row->updated_at,
        ];
    }

    public function save(array $input, string $staffId): array
    {
        // 1. Structural and type validation
        if (!array_key_exists('expectedRevision', $input) || !is_int($input['expectedRevision'])) {
            throw new InvalidArgumentException('Missing or invalid expectedRevision.');
        }

        if (!array_key_exists('enabled', $input) || !is_bool($input['enabled'])) {
            throw new InvalidArgumentException('Missing or invalid enabled flag.');
        }

        if (!array_key_exists('recipientEmail', $input) || !is_string($input['recipientEmail'])) {
            throw new InvalidArgumentException('Missing recipientEmail.');
        }

        $email = trim($input['recipientEmail']);

        // Prevent header injection characters in recipient email
        if (preg_match('/[\x00-\x1f\x7f]/', $email)) {
            throw new InvalidArgumentException('Header injection detected in recipient email.');
        }

        if ($email === '' || strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Invalid recipientEmail format.');
        }

        // 2. Transactional optimistic concurrency control
        return DB::transaction(function () use ($input, $email, $staffId): array {
            $row = DB::table('analytics_report_settings')
                ->where('id', 1)
                ->lockForUpdate()
                ->first();

            $currentRevision = (int) ($row->revision ?? 0);
            if ($currentRevision !== $input['expectedRevision']) {
                throw new HttpException(409, 'Analytics report settings conflict; expected revision mismatch.');
            }

            $newRevision = $currentRevision + 1;

            DB::table('analytics_report_settings')->updateOrInsert(
                ['id' => 1],
                [
                    'revision' => $newRevision,
                    'enabled' => $input['enabled'],
                    'recipient_email' => $email,
                    'updated_by' => $staffId,
                    'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
                ]
            );

            return $this->read();
        });
    }
}
