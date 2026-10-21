<?php

declare(strict_types=1);

namespace App\Mvp\Archive;

use App\Identity\Protocol\CookieSecurity;
use App\Identity\Sessions\PassengerSessionStore;
use App\Mvp\Mail\MailSettings;
use App\Reference\Shared\ReferenceResponse;
use App\Support\DatabaseClock;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;

final class ArchiveController
{
    private const MAX_FILES_PER_SUBMISSION = 5;
    private const MAX_BYTES_PER_FILE = 10485760; // 10 MB
    private const MAX_TOTAL_BYTES = 26214400; // 25 MB

    private const ALLOWED_EXTENSIONS = [
        'jpg', 'jpeg', 'png', 'webp', 'pdf', 'mp3', 'wav', 'mp4', 'mov', 'aac', 'm4a',
    ];

    private const PROHIBITED_SEGMENT_EXTENSIONS = [
        'php', 'phtml', 'phar', 'sh', 'bash', 'exe', 'bat', 'cmd', 'com', 'scr',
        'msi', 'vbs', 'js', 'jar', 'py', 'pl', 'cgi', 'svg', 'svgz', 'htm', 'html',
        'xhtml', 'shtml', 'xml',
    ];

    private const ALLOWED_MIME_TYPES = [
        'image/jpeg', 'image/png', 'image/webp',
        'application/pdf',
        'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac',
        'video/mp4', 'video/quicktime',
    ];

    private function text(mixed $value, int $min, int $max): string
    {
        if (!is_string($value) || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', $value)) {
            abort(422);
        }
        $value = trim($value);
        $length = mb_strlen($value);
        if ($length < $min || $length > $max) {
            abort(422);
        }
        return $value;
    }

    private function iso(mixed $value): string
    {
        if ($value instanceof \DateTimeInterface) {
            return $value->format(DATE_ATOM);
        }
        return (new \DateTimeImmutable((string) $value))->format(DATE_ATOM);
    }

    /**
     * Public contribution submission endpoint.
     */
    public function submit(Request $request)
    {
        if (!$request->isSecure() || !in_array($request->header('Origin'), config('cors.allowed_origins', []), true)) {
            abort(403);
        }

        // Validate passenger session and CSRF
        $token = CookieSecurity::getCookieValue($request, CookieSecurity::COOKIE_PASSENGER);
        $session = $token ? app(PassengerSessionStore::class)->read($token) : null;
        $csrf = $request->headers->all('x-csrf-token');
        if (!$session || count($csrf) !== 1 || !is_string($csrf[0]) || !hash_equals($session->getCsrfToken(), $csrf[0])) {
            abort(403);
        }

        // Extract input fields
        $submissionId = $this->text($request->input('submissionId') ?? $request->input('submission_id'), 1, 200);
        $contributorName = $this->text($request->input('contributorName') ?? $request->input('contributor_name'), 2, 120);
        $contributorNameAr = $request->filled('contributorNameArabic')
            ? $this->text($request->input('contributorNameArabic'), 1, 120)
            : ($request->filled('contributorNameAr')
                ? $this->text($request->input('contributorNameAr'), 1, 120)
                : ($request->filled('contributor_name_ar') ? $this->text($request->input('contributor_name_ar'), 1, 120) : null));
        $email = strtolower($this->text($request->input('email') ?? $request->input('contributorEmail') ?? $request->input('contributor_email'), 3, 254));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            abort(422);
        }

        $type = $this->text($request->input('contributionType') ?? $request->input('contribution_type'), 3, 32);
        if (!in_array($type, ['photograph', 'document', 'video_reference', 'oral_history', 'artifact', 'future_concept', 'design', 'other'], true)) {
            abort(422);
        }

        $description = $this->text($request->input('description'), 10, 5000);

        $rawConsent = $request->input('permissionConsent') ?? $request->input('permission_consent');
        $permissionConsent = filter_var($rawConsent, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($permissionConsent !== true) {
            abort(422);
        }

        $rawLocale = $request->input('locale') ?? $request->input('language');
        $locale = in_array($rawLocale, ['ar', 'en'], true)
            ? $rawLocale
            : (str_starts_with((string) $request->header('Accept-Language', ''), 'ar') ? 'ar' : 'en');

        // Process file uploads (multipart or JSON base64)
        $processedFiles = $this->processUploadedFiles($request);

        $writtenPaths = [];
        try {
            return DB::transaction(function () use (
                $request, $submissionId, $contributorName, $contributorNameAr,
                $email, $type, $description, $locale, $processedFiles, &$writtenPaths
            ) {
                // Compute idempotency hash
                $metaForHash = [
                    'submissionId' => $submissionId,
                    'contributorName' => $contributorName,
                    'contributorNameArabic' => $contributorNameAr ?? '',
                    'email' => $email,
                    'contributionType' => $type,
                    'description' => $description,
                    'locale' => $locale,
                    'fileHashes' => array_column($processedFiles, 'sha256'),
                ];
                ksort($metaForHash);
                $hash = hash('sha256', json_encode($metaForHash, JSON_THROW_ON_ERROR));

                $existing = DB::table('archive_contributions')
                    ->where('submission_id', $submissionId)
                    ->lockForUpdate()
                    ->first();

                if ($existing) {
                    if (!hash_equals($existing->payload_hash, $hash)) {
                        abort(409);
                    }
                    return ReferenceResponse::success($request, [
                        'reference' => $existing->public_reference,
                        'status' => $existing->status,
                        'createdAt' => $this->iso($existing->created_at),
                    ], 200);
                }

                // Generate secure random public reference
                $publicRef = $this->generateUniqueReference();
                $contributionId = (string) Str::uuid();
                $now = DatabaseClock::now();

                // Insert core contribution record
                DB::table('archive_contributions')->insert([
                    'id' => $contributionId,
                    'public_reference' => $publicRef,
                    'submission_id' => $submissionId,
                    'payload_hash' => $hash,
                    'contributor_name' => $contributorName,
                    'contributor_name_ar' => $contributorNameAr,
                    'email' => $email,
                    'contribution_type' => $type,
                    'description' => $description,
                    'permission_consent' => true,
                    'status' => 'received',
                    'curator_notes' => '',
                    'assigned_staff_id' => null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                // Persist private file records and write disk files
                $storageDir = storage_path('app/private/archive_contributions');
                if (!is_dir($storageDir) && !mkdir($storageDir, 0750, true)) {
                    throw new \RuntimeException('Failed to initialize private archive storage directory.');
                }

                foreach ($processedFiles as $file) {
                    $fileId = (string) Str::uuid();
                    $storageKey = 'arc_' . Str::random(32) . '.' . $file['safeExt'];
                    $destPath = $storageDir . DIRECTORY_SEPARATOR . $storageKey;
                    // Track the exact attempt path before writing so partial writes or chmod failures are cleaned up.
                    $writtenPaths[] = $destPath;

                    if (isset($file['tempPath'])) {
                        $renamed = @rename($file['tempPath'], $destPath);
                        if (!$renamed) {
                            $copied = @copy($file['tempPath'], $destPath);
                            if (!$copied) {
                                throw new \RuntimeException('Failed to copy uploaded archive file to destination.');
                            }
                            @unlink($file['tempPath']);
                        }
                    } elseif (isset($file['rawBytes'])) {
                        $written = @file_put_contents($destPath, $file['rawBytes'], LOCK_EX);
                        if ($written !== strlen($file['rawBytes'])) {
                            throw new \RuntimeException('Failed to write raw archive file bytes to disk.');
                        }
                    } else {
                        throw new \RuntimeException('Missing valid upload payload source for archive file.');
                    }

                    if (!@chmod($destPath, 0640)) {
                        throw new \RuntimeException('Failed to restrict permissions on private archive file.');
                    }

                    DB::table('archive_contribution_files')->insert([
                        'id' => $fileId,
                        'contribution_id' => $contributionId,
                        'storage_key' => $storageKey,
                        'original_filename' => $file['originalFilename'],
                        'file_bytes' => $file['bytes'],
                        'mime_type' => $file['mimeType'],
                        'sha256' => $file['sha256'],
                        'created_at' => $now,
                    ]);
                }

                // Queue outbox emails (Contributor Ack + Admin Notification)
                if (Schema::hasTable('archive_mail_outbox')) {
                    // 1. Contributor acknowledgment email
                    DB::table('archive_mail_outbox')->insert([
                        'id' => (string) Str::uuid(),
                        'purpose' => 'archive_ack',
                        'contribution_id' => $contributionId,
                        'contact_id' => null,
                        'recipient' => $email,
                        'cc_recipient' => null, // Contributor ack never includes CC
                        'encrypted_payload' => Crypt::encryptString(json_encode([
                            'purpose' => 'archive_ack',
                            'reference' => $publicRef,
                            'contributorName' => $contributorName,
                            'contributorNameArabic' => $contributorNameAr,
                            'contributionType' => $type,
                            'description' => $description,
                            'locale' => $locale,
                            'filesCount' => count($processedFiles),
                        ], JSON_THROW_ON_ERROR)),
                        'status' => 'pending',
                        'generation' => 1,
                        'attempts' => 0,
                        'next_attempt_at' => $now,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);

                    // 2. Admin notification email with scoped CC
                    $mailSettings = app(MailSettings::class)->forWorker();
                    $adminRecipient = $mailSettings['notificationEmail'] ?? 'notifications@gazaairport.com';
                    $ccRecipient = ($mailSettings['incomingCcEnabled'] ?? false) && !empty($mailSettings['incomingCcEmail'])
                        ? $mailSettings['incomingCcEmail']
                        : null;

                    DB::table('archive_mail_outbox')->insert([
                        'id' => (string) Str::uuid(),
                        'purpose' => 'archive_notify',
                        'contribution_id' => $contributionId,
                        'contact_id' => null,
                        'recipient' => $adminRecipient,
                        'cc_recipient' => $ccRecipient,
                        'encrypted_payload' => Crypt::encryptString(json_encode([
                            'purpose' => 'archive_notify',
                            'reference' => $publicRef,
                            'contributorName' => $contributorName,
                            'contributorNameArabic' => $contributorNameAr,
                            'email' => $email,
                            'contributionType' => $type,
                            'description' => $description,
                            'filesCount' => count($processedFiles),
                        ], JSON_THROW_ON_ERROR)),
                        'status' => 'pending',
                        'generation' => 1,
                        'attempts' => 0,
                        'next_attempt_at' => $now,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }

                return ReferenceResponse::success($request, [
                    'reference' => $publicRef,
                    'status' => 'received',
                    'createdAt' => $this->iso($now),
                ], 202);
            });
        } catch (\Throwable $e) {
            // Clean up ONLY files written during this failed attempt; no broad orphan sweep
            foreach ($writtenPaths as $path) {
                if (file_exists($path)) {
                    @unlink($path);
                }
            }
            throw $e;
        }
    }

    /**
     * Inspect and validate uploaded files against security policy.
     */
    private function processUploadedFiles(Request $request): array
    {
        $processed = [];
        $totalBytes = 0;

        // Check multipart files
        $uploadedFiles = $request->file('files');
        if ($uploadedFiles !== null) {
            if (!is_array($uploadedFiles)) {
                $uploadedFiles = [$uploadedFiles];
            }
            if (count($uploadedFiles) > self::MAX_FILES_PER_SUBMISSION) {
                abort(422);
            }

            foreach ($uploadedFiles as $file) {
                if (!$file instanceof \Illuminate\Http\UploadedFile || !$file->isValid()) {
                    abort(422);
                }

                $size = $file->getSize();
                if ($size <= 0 || $size > self::MAX_BYTES_PER_FILE) {
                    abort(422);
                }
                $totalBytes += $size;
                if ($totalBytes > self::MAX_TOTAL_BYTES) {
                    abort(422);
                }

                $origName = $file->getClientOriginalName();
                $validated = $this->validateFilenameAndContent($origName, $file->getPathname());
                $validated['tempPath'] = $file->getPathname();
                $validated['bytes'] = $size;
                $processed[] = $validated;
            }
            return $processed;
        }

        // Check JSON base64 encoded files
        $jsonFiles = $request->input('files');
        if (is_array($jsonFiles)) {
            if (count($jsonFiles) > self::MAX_FILES_PER_SUBMISSION) {
                abort(422);
            }
            foreach ($jsonFiles as $item) {
                if (!is_array($item) || !isset($item['filename'], $item['dataBase64'])) {
                    abort(422);
                }
                $origName = (string) $item['filename'];
                $raw = base64_decode((string) $item['dataBase64'], true);
                if ($raw === false) {
                    abort(422);
                }
                $size = strlen($raw);
                if ($size <= 0 || $size > self::MAX_BYTES_PER_FILE) {
                    abort(422);
                }
                $totalBytes += $size;
                if ($totalBytes > self::MAX_TOTAL_BYTES) {
                    abort(422);
                }

                $validated = $this->validateFilenameAndContentBuffer($origName, $raw);
                $validated['rawBytes'] = $raw;
                $validated['bytes'] = $size;
                $processed[] = $validated;
            }
        }

        return $processed;
    }

    /**
     * Validate filename, double-extensions, MIME type and content signatures for disk path.
     */
    private function validateFilenameAndContent(string $rawFilename, string $tempPath): array
    {
        $safeOriginalName = $this->sanitizeFilename($rawFilename);
        $safeExt = $this->validateExtensions($safeOriginalName);

        // MIME via actual content inspection
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $detectedMime = finfo_file($finfo, $tempPath);
        finfo_close($finfo);

        $this->assertAllowedMime($detectedMime);
        $this->scanContentSignatures(file_get_contents($tempPath, false, null, 0, 4096));

        $sha256 = hash_file('sha256', $tempPath);

        return [
            'originalFilename' => $safeOriginalName,
            'safeExt' => $safeExt,
            'mimeType' => $detectedMime,
            'sha256' => $sha256,
        ];
    }

    /**
     * Validate filename, double-extensions, MIME type and content signatures for in-memory buffer.
     */
    private function validateFilenameAndContentBuffer(string $rawFilename, string $buffer): array
    {
        $safeOriginalName = $this->sanitizeFilename($rawFilename);
        $safeExt = $this->validateExtensions($safeOriginalName);

        // MIME via actual content inspection
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $detectedMime = finfo_buffer($finfo, $buffer);
        finfo_close($finfo);

        $this->assertAllowedMime($detectedMime);
        $this->scanContentSignatures(substr($buffer, 0, 4096));

        $sha256 = hash('sha256', $buffer);

        return [
            'originalFilename' => $safeOriginalName,
            'safeExt' => $safeExt,
            'mimeType' => $detectedMime,
            'sha256' => $sha256,
        ];
    }

    private function sanitizeFilename(string $filename): string
    {
        // Strip path traversals, null bytes, and control characters
        $clean = basename(str_replace(['\\', '/', "\0"], '_', $filename));
        $clean = preg_replace('/[\x00-\x1f\x7f]/', '', $clean) ?? 'file';
        if (trim($clean) === '' || strlen($clean) > 255) {
            abort(422);
        }
        return $clean;
    }

    private function validateExtensions(string $filename): string
    {
        $parts = explode('.', strtolower($filename));
        if (count($parts) < 2) {
            abort(422); // File must have an extension
        }

        $finalExt = end($parts);
        if (!in_array($finalExt, self::ALLOWED_EXTENSIONS, true)) {
            abort(422);
        }

        // Deny unsafe double extensions (e.g., photo.php.jpg or archive.exe.pdf)
        $subParts = array_slice($parts, 0, -1);
        foreach ($subParts as $sub) {
            if (in_array($sub, self::PROHIBITED_SEGMENT_EXTENSIONS, true)) {
                abort(422);
            }
        }

        return $finalExt;
    }

    private function assertAllowedMime(string $mime): void
    {
        $mime = strtolower(trim($mime));
        // Explicitly deny SVG, HTML, and executables
        if (str_contains($mime, 'html') || str_contains($mime, 'svg') || str_contains($mime, 'xml')
            || str_contains($mime, 'javascript') || str_contains($mime, 'executable')
            || str_contains($mime, 'dosexec') || str_contains($mime, 'msdownload')) {
            abort(422);
        }

        if (!in_array($mime, self::ALLOWED_MIME_TYPES, true)) {
            abort(422);
        }
    }

    private function scanContentSignatures(string $chunk): void
    {
        $lower = strtolower($chunk);
        $dangerousSignatures = [
            '<?php', '<?=', '#!/', '<html', '<svg', '<script', '<!doctype html',
        ];
        foreach ($dangerousSignatures as $sig) {
            if (str_contains($lower, $sig)) {
                abort(422);
            }
        }
    }

    private function generateUniqueReference(): string
    {
        for ($i = 0; $i < 10; $i++) {
            $ref = 'GZA-ARC-' . strtoupper(Str::random(8));
            if (!DB::table('archive_contributions')->where('public_reference', $ref)->exists()) {
                return $ref;
            }
        }
        throw new \RuntimeException('Failed to generate unique public archive reference.');
    }

    // =========================================================================
    // Staff Admin Endpoints (RequireSiteStaffAuth RBAC protected)
    // =========================================================================

    public function index(Request $request)
    {
        $query = DB::table('archive_contributions');

        $status = $request->query('status');
        if ($status && $status !== 'all') {
            $query->where('status', $status);
        }

        $type = $request->query('type');
        if ($type && $type !== 'all') {
            $query->where('contribution_type', $type);
        }

        $search = $request->query('search');
        if ($search && is_string($search) && strlen($search) <= 200) {
            $query->where(function ($q) use ($search) {
                $term = '%' . $search . '%';
                $q->whereRaw('LOWER(contributor_name) LIKE LOWER(?)', [$term])
                  ->orWhereRaw('LOWER(email) LIKE LOWER(?)', [$term])
                  ->orWhereRaw('LOWER(public_reference) LIKE LOWER(?)', [$term])
                  ->orWhereRaw('LOWER(description) LIKE LOWER(?)', [$term]);
            });
        }

        $items = $query->orderByDesc('created_at')->limit(200)->get()->map(function ($r) {
            $filesCount = DB::table('archive_contribution_files')->where('contribution_id', $r->id)->count();
            return [
                'id' => $r->id,
                'publicReference' => $r->public_reference,
                'submissionId' => $r->submission_id,
                'contributorName' => $r->contributor_name,
                'contributorNameArabic' => $r->contributor_name_ar,
                'email' => $r->email,
                'contributionType' => $r->contribution_type,
                'status' => $r->status,
                'curatorNotes' => $r->curator_notes,
                'assignedStaffId' => $r->assigned_staff_id,
                'filesCount' => $filesCount,
                'createdAt' => $this->iso($r->created_at),
                'updatedAt' => $this->iso($r->updated_at),
            ];
        })->all();

        $countReceived = DB::table('archive_contributions')->where('status', 'received')->count();

        return ReferenceResponse::success($request, [
            'items' => $items,
            'countReceived' => $countReceived,
        ]);
    }

    public function show(Request $request, string $id)
    {
        $row = DB::table('archive_contributions')->where('id', $id)->first();
        if (!$row) {
            abort(404);
        }

        $files = DB::table('archive_contribution_files')
            ->where('contribution_id', $id)
            ->orderBy('created_at')
            ->get()
            ->map(fn($f) => [
                'id' => $f->id,
                'originalFilename' => $f->original_filename,
                'fileBytes' => (int) $f->file_bytes,
                'mimeType' => $f->mime_type,
                'sha256' => $f->sha256,
                'createdAt' => $this->iso($f->created_at),
            ])
            ->all();

        $audits = DB::table('archive_contribution_audits')
            ->where('contribution_id', $id)
            ->orderBy('created_at')
            ->get()
            ->map(fn($a) => [
                'id' => $a->id,
                'staffId' => $a->staff_id,
                'action' => $a->action,
                'details' => $a->details,
                'createdAt' => $this->iso($a->created_at),
            ])
            ->all();

        return ReferenceResponse::success($request, [
            'id' => $row->id,
            'publicReference' => $row->public_reference,
            'submissionId' => $row->submission_id,
            'contributorName' => $row->contributor_name,
            'contributorNameArabic' => $row->contributor_name_ar,
            'email' => $row->email,
            'contributionType' => $row->contribution_type,
            'description' => $row->description,
            'permissionConsent' => (bool) $row->permission_consent,
            'status' => $row->status,
            'curatorNotes' => $row->curator_notes,
            'assignedStaffId' => $row->assigned_staff_id,
            'files' => $files,
            'audits' => $audits,
            'createdAt' => $this->iso($row->created_at),
            'updatedAt' => $this->iso($row->updated_at),
        ]);
    }

    public function updateStatus(Request $request, string $id)
    {
        $session = $request->attributes->get('editorial_staff_session');
        $row = DB::table('archive_contributions')->where('id', $id)->lockForUpdate()->first();
        if (!$row) {
            abort(404);
        }
        ($request->attributes->get('editorial_authorizer'))();

        $status = $this->text($request->input('status'), 1, 32);
        if (!in_array($status, ['received', 'under_review', 'accepted', 'declined', 'archived'], true)) {
            abort(422);
        }

        $now = DatabaseClock::now();
        $changed = $row->status !== $status;
        if ($changed) {
            DB::table('archive_contributions')->where('id', $id)->update([
                'status' => $status,
                'updated_at' => $now,
            ]);
            DB::table('archive_contribution_audits')->insert([
                'id' => (string) Str::uuid(),
                'contribution_id' => $id,
                'staff_id' => $session->getStaffId(),
                'action' => 'status_change',
                'details' => "Status changed from {$row->status} to {$status}",
                'created_at' => $now,
            ]);
        }

        return ReferenceResponse::success($request, [
            'id' => $id,
            'status' => $status,
            'changed' => $changed,
            'beforeStatus' => $row->status,
        ]);
    }

    public function assignStaff(Request $request, string $id)
    {
        $session = $request->attributes->get('editorial_staff_session');
        $row = DB::table('archive_contributions')->where('id', $id)->lockForUpdate()->first();
        if (!$row) {
            abort(404);
        }
        ($request->attributes->get('editorial_authorizer'))();

        $staffId = $request->input('staffId');
        if ($staffId !== null) {
            if (!is_string($staffId) || !Str::isUuid($staffId) || !DB::table('staff_users')->where('id', $staffId)->where('status', 'active')->exists()) {
                abort(422);
            }
        }

        $now = DatabaseClock::now();
        $changed = $row->assigned_staff_id !== $staffId;
        if ($changed) {
            DB::table('archive_contributions')->where('id', $id)->update([
                'assigned_staff_id' => $staffId,
                'updated_at' => $now,
            ]);
            DB::table('archive_contribution_audits')->insert([
                'id' => (string) Str::uuid(),
                'contribution_id' => $id,
                'staff_id' => $session->getStaffId(),
                'action' => 'assignee_change',
                'details' => $staffId ? "Assigned to staff {$staffId}" : "Unassigned",
                'created_at' => $now,
            ]);
        }

        return ReferenceResponse::success($request, [
            'id' => $id,
            'assignedStaffId' => $staffId,
            'changed' => $changed,
            'beforeAssignee' => $row->assigned_staff_id,
        ]);
    }

    public function saveNotes(Request $request, string $id)
    {
        $session = $request->attributes->get('editorial_staff_session');
        $row = DB::table('archive_contributions')->where('id', $id)->lockForUpdate()->first();
        if (!$row) {
            abort(404);
        }
        ($request->attributes->get('editorial_authorizer'))();

        $notes = $this->text($request->input('curatorNotes'), 0, 10000);

        $now = DatabaseClock::now();
        DB::table('archive_contributions')->where('id', $id)->update([
            'curator_notes' => $notes,
            'updated_at' => $now,
        ]);
        DB::table('archive_contribution_audits')->insert([
            'id' => (string) Str::uuid(),
            'contribution_id' => $id,
            'staff_id' => $session->getStaffId(),
            'action' => 'notes_update',
            'details' => 'Curator notes updated',
            'created_at' => $now,
        ]);

        return ReferenceResponse::success($request, [
            'id' => $id,
            'curatorNotes' => $notes,
        ]);
    }

    public function downloadFile(Request $request, string $id, string $fileId)
    {
        ($request->attributes->get('editorial_authorizer'))();

        $fileRow = DB::table('archive_contribution_files')
            ->where('id', $fileId)
            ->where('contribution_id', $id)
            ->first();

        if (!$fileRow) {
            abort(404);
        }

        $storagePath = storage_path('app/private/archive_contributions/' . $fileRow->storage_key);
        if (!file_exists($storagePath) || !is_readable($storagePath)) {
            abort(404);
        }

        $safeDownloadName = preg_replace('/[^a-zA-Z0-9._-]/', '_', $fileRow->original_filename) ?: 'download';

        $response = new BinaryFileResponse($storagePath);
        $response->setContentDisposition(
            ResponseHeaderBag::DISPOSITION_ATTACHMENT,
            $safeDownloadName
        );
        $response->headers->set('Content-Type', $fileRow->mime_type);
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        return $response;
    }
}
