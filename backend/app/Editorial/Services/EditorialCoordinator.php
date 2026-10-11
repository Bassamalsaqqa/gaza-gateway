<?php

declare(strict_types=1);

namespace App\Editorial\Services;

use App\Editorial\Exceptions\EditorialConflictException;
use App\Editorial\Exceptions\EditorialNotFoundException;
use App\Editorial\Exceptions\EditorialUnpublishedException;
use App\Editorial\Exceptions\EditorialValidationException;
use App\Editorial\Validation\EditorialValidator;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Strict cross-domain lock hierarchy across all editorial mutations:
 * 1. Principal row: staff_users (WHERE id = ? FOR UPDATE) via StaffSessionStore::read().
 * 2. Session row: staff_sessions (WHERE id = ? FOR UPDATE) via StaffSessionStore::read().
 * 3. Advisory domain lock: pg_advisory_xact_lock(hashtext('editorial_doc:' || $slug)).
 * 4. Document row: editorial_documents (WHERE slug = ? FOR UPDATE).
 *
 * Each write operation validates authorization at transaction entry (holding principal and session
 * locks), serializes on the domain advisory lock, and re-validates authorization immediately after
 * acquiring the domain lock. This prevents expired/revoked sessions from mutating after waiting in
 * the serialization queue while eliminating lock inversion deadlocks.
 */
final class EditorialCoordinator
{
    public function __construct(
        private readonly EditorialValidator $validator = new EditorialValidator()
    ) {
    }

    public function getPublished(string $slug): array
    {
        if (!in_array($slug, EditorialValidator::ALLOWED_SLUGS, true)) {
            throw new EditorialNotFoundException("Unknown document '$slug'.");
        }

        $doc = DB::table('editorial_documents')->where('slug', $slug)->first();
        if ($doc === null || ($doc->published_revision === null && !$doc->tombstoned)) {
            throw new EditorialNotFoundException("Document '$slug' was never published.");
        }

        if ($doc->tombstoned) {
            throw new EditorialUnpublishedException("Document '$slug' is unpublished.");
        }

        $revRow = DB::table('editorial_revisions')
            ->where('slug', $slug)
            ->where('revision', (int) $doc->published_revision)
            ->first();

        if ($revRow === null) {
            throw new EditorialNotFoundException("Published revision not found for '$slug'.");
        }

        return [
            'id' => $slug,
            'kind' => $slug,
            'slug' => $slug,
            'revisionNumber' => (int) $doc->published_revision,
            'status' => 'published',
            'updatedAt' => CarbonImmutable::parse($doc->updated_at)->toIso8601String(),
            'payload' => json_decode($revRow->snapshot_bytes, true, 512, JSON_THROW_ON_ERROR),
        ];
    }

    public function getEditorial(string $slug): array
    {
        if (!in_array($slug, EditorialValidator::ALLOWED_SLUGS, true)) {
            throw new EditorialNotFoundException("Unknown document '$slug'.");
        }

        $doc = DB::table('editorial_documents')->where('slug', $slug)->first();
        if ($doc === null) {
            throw new EditorialNotFoundException("Document '$slug' has not been created or drafted.");
        }

        return self::formatEditorialDto($slug, $doc);
    }

    public function saveDraft(
        string $slug,
        array $payload,
        int $expectedRevision,
        string $staffId,
        callable $revalidateAuthorizer
    ): array {
        return DB::transaction(function () use ($slug, $payload, $expectedRevision, $staffId, $revalidateAuthorizer): array {
            // 1. Authorize at transaction entry before advisory/doc lock (verifies staff/session locks)
            $revalidateAuthorizer();

            // 2. Transactional per-slug advisory lock to serialize concurrent mutations on the same slug
            // (including concurrent initial saves with expectedRevision=0 where no row exists yet)
            DB::select('SELECT pg_advisory_xact_lock(hashtext(?))', ['editorial_doc:' . $slug]);

            // 3. Reauthorize after the domain wait (verifies session did not expire in lock queue)
            $revalidateAuthorizer();

            // 4. Domain row lock
            $doc = DB::table('editorial_documents')->where('slug', $slug)->lockForUpdate()->first();

            if ($doc === null) {
                if ($expectedRevision !== 0) {
                    throw new EditorialConflictException(
                        "Revision conflict: document is uninitialized (version 0), but expected revision $expectedRevision was specified."
                    );
                }

                $this->validator->validate($slug, $payload);
                $canonicalJson = self::canonicalJson($payload);
                $newCurrentRevision = 1;
                $newContentRevision = 1;

                DB::table('editorial_documents')->insert([
                    'slug' => $slug,
                    'kind' => $slug,
                    'status' => 'draft',
                    'current_revision' => $newCurrentRevision,
                    'published_revision' => null,
                    'draft_revision' => $newContentRevision,
                    'tombstoned' => false,
                    'tombstoned_at' => null,
                    'created_at' => DB::raw('clock_timestamp()'),
                    'updated_at' => DB::raw('clock_timestamp()'),
                ]);

                DB::table('editorial_revisions')->insert([
                    'slug' => $slug,
                    'revision' => $newContentRevision,
                    'snapshot_json' => $canonicalJson,
                    'snapshot_bytes' => $canonicalJson,
                    'snapshot_hash' => hash('sha256', $canonicalJson),
                    'created_at' => DB::raw('clock_timestamp()'),
                ]);

                DB::table('editorial_audit_events')->insert([
                    'id' => (string) Str::uuid(),
                    'slug' => $slug,
                    'revision' => $newContentRevision,
                    'staff_id' => $staffId,
                    'action' => 'draft.save',
                    'outcome' => 'success',
                    'restored_from_revision' => null,
                    'created_at' => DB::raw('clock_timestamp()'),
                ]);

                return [
                    'slug' => $slug,
                    'changed' => true,
                    'revision' => $newContentRevision,
                    'currentRevision' => $newCurrentRevision,
                    'status' => 'draft',
                ];
            }

            $currentRevision = (int) $doc->current_revision;
            if ($expectedRevision !== $currentRevision) {
                throw new EditorialConflictException(
                    "Revision conflict: current revision is $currentRevision, but expected revision $expectedRevision was specified."
                );
            }

            $activeRevNumber = $doc->draft_revision !== null
                ? (int) $doc->draft_revision
                : ($doc->published_revision !== null ? (int) $doc->published_revision : null);

            if ($activeRevNumber !== null) {
                $activeRev = DB::table('editorial_revisions')
                    ->where('slug', $slug)
                    ->where('revision', $activeRevNumber)
                    ->first();
                if ($activeRev !== null) {
                    $existingPayload = json_decode($activeRev->snapshot_bytes, true, 512, JSON_THROW_ON_ERROR);
                    if (self::sameValue($existingPayload, $payload)) {
                        return [
                            'slug' => $slug,
                            'changed' => false,
                            'revision' => $activeRevNumber,
                            'currentRevision' => $currentRevision,
                            'status' => $doc->status,
                        ];
                    }
                }
            }

            $this->validator->validate($slug, $payload);
            $canonicalJson = self::canonicalJson($payload);

            $maxContentRev = (int) DB::table('editorial_revisions')->where('slug', $slug)->max('revision');
            $newContentRevision = $maxContentRev + 1;
            $newCurrentRevision = $currentRevision + 1;

            DB::table('editorial_revisions')->insert([
                'slug' => $slug,
                'revision' => $newContentRevision,
                'snapshot_json' => $canonicalJson,
                'snapshot_bytes' => $canonicalJson,
                'snapshot_hash' => hash('sha256', $canonicalJson),
                'created_at' => DB::raw('clock_timestamp()'),
            ]);

            DB::table('editorial_documents')->where('slug', $slug)->update([
                'current_revision' => $newCurrentRevision,
                'draft_revision' => $newContentRevision,
                'status' => 'draft',
                'updated_at' => DB::raw('clock_timestamp()'),
            ]);

            DB::table('editorial_audit_events')->insert([
                'id' => (string) Str::uuid(),
                'slug' => $slug,
                'revision' => $newContentRevision,
                'staff_id' => $staffId,
                'action' => 'draft.save',
                'outcome' => 'success',
                'restored_from_revision' => null,
                'created_at' => DB::raw('clock_timestamp()'),
            ]);

            return [
                'slug' => $slug,
                'changed' => true,
                'revision' => $newContentRevision,
                'currentRevision' => $newCurrentRevision,
                'status' => 'draft',
            ];
        });
    }

    public function discardDraft(
        string $slug,
        int $expectedRevision,
        string $staffId,
        callable $revalidateAuthorizer
    ): array {
        return DB::transaction(function () use ($slug, $expectedRevision, $staffId, $revalidateAuthorizer): array {
            // 1. Authorize at transaction entry before advisory/doc lock (verifies staff/session locks)
            $revalidateAuthorizer();

            // 2. Transactional per-slug advisory lock
            DB::select('SELECT pg_advisory_xact_lock(hashtext(?))', ['editorial_doc:' . $slug]);

            // 3. Reauthorize after domain wait
            $revalidateAuthorizer();

            // 4. Domain row lock
            $doc = DB::table('editorial_documents')->where('slug', $slug)->lockForUpdate()->first();

            if ($doc === null) {
                throw new EditorialNotFoundException("Document '$slug' not found.");
            }

            $currentRevision = (int) $doc->current_revision;
            if ($expectedRevision !== $currentRevision) {
                throw new EditorialConflictException(
                    "Revision conflict: current revision is $currentRevision, but expected revision $expectedRevision was specified."
                );
            }

            if ($doc->draft_revision === null) {
                return self::formatEditorialDto($slug, $doc);
            }

            $discardedDraftRevision = (int) $doc->draft_revision;
            $newStatus = $doc->published_revision !== null
                ? ($doc->tombstoned ? 'unpublished' : 'published')
                : 'draft';

            $newCurrentRevision = $currentRevision + 1;

            DB::table('editorial_documents')->where('slug', $slug)->update([
                'current_revision' => $newCurrentRevision,
                'draft_revision' => null,
                'status' => $newStatus,
                'updated_at' => DB::raw('clock_timestamp()'),
            ]);

            DB::table('editorial_audit_events')->insert([
                'id' => (string) Str::uuid(),
                'slug' => $slug,
                'revision' => $discardedDraftRevision,
                'staff_id' => $staffId,
                'action' => 'draft.discard',
                'outcome' => 'success',
                'restored_from_revision' => null,
                'created_at' => DB::raw('clock_timestamp()'),
            ]);

            $updatedDoc = DB::table('editorial_documents')->where('slug', $slug)->first();
            return self::formatEditorialDto($slug, $updatedDoc);
        });
    }

    public function publish(
        string $slug,
        int $expectedRevision,
        string $staffId,
        callable $revalidateAuthorizer
    ): array {
        return DB::transaction(function () use ($slug, $expectedRevision, $staffId, $revalidateAuthorizer): array {
            // 1. Authorize at transaction entry before advisory/doc lock (verifies staff/session locks)
            $revalidateAuthorizer();

            // 2. Transactional per-slug advisory lock
            DB::select('SELECT pg_advisory_xact_lock(hashtext(?))', ['editorial_doc:' . $slug]);

            // 3. Reauthorize after domain wait
            $revalidateAuthorizer();

            // 4. Domain row lock
            $doc = DB::table('editorial_documents')->where('slug', $slug)->lockForUpdate()->first();

            if ($doc === null) {
                throw new EditorialNotFoundException("Document '$slug' not found.");
            }

            $currentRevision = (int) $doc->current_revision;
            if ($expectedRevision !== $currentRevision) {
                throw new EditorialConflictException(
                    "Revision conflict: current revision is $currentRevision, but expected revision $expectedRevision was specified."
                );
            }

            if ($doc->draft_revision === null && $doc->published_revision !== null && !$doc->tombstoned) {
                // Already active published with no draft; no-op
                return self::formatEditorialDto($slug, $doc);
            }

            $revToPublish = $doc->draft_revision !== null
                ? (int) $doc->draft_revision
                : ($doc->published_revision !== null ? (int) $doc->published_revision : null);

            if ($revToPublish === null || $revToPublish === 0) {
                throw new EditorialValidationException("No draft or revision available to publish for '$slug'.");
            }

            // Record into published history (ON CONFLICT DO NOTHING for idempotency / re-publish)
            DB::statement(
                'INSERT INTO editorial_published_revisions (slug, revision, staff_id, published_at)
                 VALUES (?, ?, ?, clock_timestamp())
                 ON CONFLICT (slug, revision) DO NOTHING',
                [$slug, $revToPublish, $staffId]
            );

            $newCurrentRevision = $currentRevision + 1;

            DB::table('editorial_documents')->where('slug', $slug)->update([
                'current_revision' => $newCurrentRevision,
                'published_revision' => $revToPublish,
                'draft_revision' => null,
                'status' => 'published',
                'tombstoned' => false,
                'tombstoned_at' => null,
                'updated_at' => DB::raw('clock_timestamp()'),
            ]);

            DB::table('editorial_audit_events')->insert([
                'id' => (string) Str::uuid(),
                'slug' => $slug,
                'revision' => $revToPublish,
                'staff_id' => $staffId,
                'action' => 'publish',
                'outcome' => 'success',
                'restored_from_revision' => null,
                'created_at' => DB::raw('clock_timestamp()'),
            ]);

            $updatedDoc = DB::table('editorial_documents')->where('slug', $slug)->first();
            return self::formatEditorialDto($slug, $updatedDoc);
        });
    }

    public function unpublish(
        string $slug,
        int $expectedRevision,
        string $staffId,
        callable $revalidateAuthorizer
    ): array {
        return DB::transaction(function () use ($slug, $expectedRevision, $staffId, $revalidateAuthorizer): array {
            // 1. Authorize at transaction entry before advisory/doc lock (verifies staff/session locks)
            $revalidateAuthorizer();

            // 2. Transactional per-slug advisory lock
            DB::select('SELECT pg_advisory_xact_lock(hashtext(?))', ['editorial_doc:' . $slug]);

            // 3. Reauthorize after domain wait
            $revalidateAuthorizer();

            // 4. Domain row lock
            $doc = DB::table('editorial_documents')->where('slug', $slug)->lockForUpdate()->first();

            if ($doc === null) {
                throw new EditorialNotFoundException("Document '$slug' not found.");
            }

            $currentRevision = (int) $doc->current_revision;
            if ($expectedRevision !== $currentRevision) {
                throw new EditorialConflictException(
                    "Revision conflict: current revision is $currentRevision, but expected revision $expectedRevision was specified."
                );
            }

            if ($doc->tombstoned) {
                return self::formatEditorialDto($slug, $doc);
            }

            if ($doc->published_revision === null) {
                throw new EditorialValidationException("Cannot unpublish document '$slug' because it was never published.");
            }

            $rev = (int) $doc->published_revision;
            $newCurrentRevision = $currentRevision + 1;

            DB::table('editorial_documents')->where('slug', $slug)->update([
                'current_revision' => $newCurrentRevision,
                'status' => 'unpublished',
                'tombstoned' => true,
                'tombstoned_at' => DB::raw('clock_timestamp()'),
                'updated_at' => DB::raw('clock_timestamp()'),
            ]);

            DB::table('editorial_audit_events')->insert([
                'id' => (string) Str::uuid(),
                'slug' => $slug,
                'revision' => $rev,
                'staff_id' => $staffId,
                'action' => 'unpublish',
                'outcome' => 'success',
                'restored_from_revision' => null,
                'created_at' => DB::raw('clock_timestamp()'),
            ]);

            $updatedDoc = DB::table('editorial_documents')->where('slug', $slug)->first();
            return self::formatEditorialDto($slug, $updatedDoc);
        });
    }

    public function restore(
        string $slug,
        int $targetRevision,
        int $expectedRevision,
        string $staffId,
        callable $revalidateAuthorizer
    ): array {
        return DB::transaction(function () use ($slug, $targetRevision, $expectedRevision, $staffId, $revalidateAuthorizer): array {
            // 1. Authorize at transaction entry before advisory/doc lock (verifies staff/session locks)
            $revalidateAuthorizer();

            // 2. Transactional per-slug advisory lock
            DB::select('SELECT pg_advisory_xact_lock(hashtext(?))', ['editorial_doc:' . $slug]);

            // 3. Reauthorize after domain wait
            $revalidateAuthorizer();

            // 4. Domain row lock
            $doc = DB::table('editorial_documents')->where('slug', $slug)->lockForUpdate()->first();

            if ($doc === null) {
                throw new EditorialNotFoundException("Document '$slug' not found.");
            }

            $currentRevision = (int) $doc->current_revision;
            if ($expectedRevision !== $currentRevision) {
                throw new EditorialConflictException(
                    "Revision conflict: current revision is $currentRevision, but expected revision $expectedRevision was specified."
                );
            }

            // Enforce restore only previously published revision
            $publishedRecord = DB::table('editorial_published_revisions')
                ->where('slug', $slug)
                ->where('revision', $targetRevision)
                ->first();

            if ($publishedRecord === null) {
                throw new EditorialValidationException(
                    "Target revision $targetRevision was never published. Only previously published revisions can be restored."
                );
            }

            $targetRevRow = DB::table('editorial_revisions')
                ->where('slug', $slug)
                ->where('revision', $targetRevision)
                ->first();

            if ($targetRevRow === null) {
                throw new EditorialNotFoundException("Target revision $targetRevision data not found.");
            }

            $maxContentRev = (int) DB::table('editorial_revisions')->where('slug', $slug)->max('revision');
            $newContentRevision = $maxContentRev + 1;
            $newCurrentRevision = $currentRevision + 1;

            DB::table('editorial_revisions')->insert([
                'slug' => $slug,
                'revision' => $newContentRevision,
                'snapshot_json' => $targetRevRow->snapshot_bytes,
                'snapshot_bytes' => $targetRevRow->snapshot_bytes,
                'snapshot_hash' => $targetRevRow->snapshot_hash,
                'created_at' => DB::raw('clock_timestamp()'),
            ]);

            DB::table('editorial_published_revisions')->insert([
                'slug' => $slug,
                'revision' => $newContentRevision,
                'staff_id' => $staffId,
                'published_at' => DB::raw('clock_timestamp()'),
            ]);

            DB::table('editorial_documents')->where('slug', $slug)->update([
                'current_revision' => $newCurrentRevision,
                'published_revision' => $newContentRevision,
                'draft_revision' => null,
                'status' => 'published',
                'tombstoned' => false,
                'tombstoned_at' => null,
                'updated_at' => DB::raw('clock_timestamp()'),
            ]);

            DB::table('editorial_audit_events')->insert([
                'id' => (string) Str::uuid(),
                'slug' => $slug,
                'revision' => $newContentRevision,
                'staff_id' => $staffId,
                'action' => 'restore',
                'outcome' => 'success',
                'restored_from_revision' => $targetRevision,
                'created_at' => DB::raw('clock_timestamp()'),
            ]);

            $updatedDoc = DB::table('editorial_documents')->where('slug', $slug)->first();
            return self::formatEditorialDto($slug, $updatedDoc);
        });
    }

    private static function formatEditorialDto(string $slug, object $doc): array
    {
        $targetRev = $doc->draft_revision !== null
            ? (int) $doc->draft_revision
            : ($doc->published_revision !== null ? (int) $doc->published_revision : 0);

        $status = $doc->draft_revision !== null
            ? 'draft'
            : ($doc->tombstoned ? 'unpublished' : ($doc->published_revision !== null ? 'published' : 'draft'));

        $revRow = null;
        if ($targetRev > 0) {
            $revRow = DB::table('editorial_revisions')
                ->where('slug', $slug)
                ->where('revision', $targetRev)
                ->first();
        }

        $payload = $revRow !== null
            ? json_decode($revRow->snapshot_bytes, true, 512, JSON_THROW_ON_ERROR)
            : null;

        return [
            'id' => $slug,
            'kind' => $slug,
            'slug' => $slug,
            'revisionNumber' => $targetRev,
            'currentRevision' => (int) $doc->current_revision,
            'publishedRevision' => $doc->published_revision !== null ? (int) $doc->published_revision : null,
            'draftRevision' => $doc->draft_revision !== null ? (int) $doc->draft_revision : null,
            'status' => $status,
            'hasDraft' => $doc->draft_revision !== null,
            'tombstoned' => (bool) $doc->tombstoned,
            'updatedAt' => CarbonImmutable::parse($doc->updated_at)->toIso8601String(),
            'payload' => $payload,
        ];
    }

    public static function sameValue(mixed $a, mixed $b): bool
    {
        if ($a === $b) {
            return true;
        }
        if (is_array($a) && is_array($b)) {
            $aIsList = array_is_list($a);
            $bIsList = array_is_list($b);
            if ($aIsList !== $bIsList) {
                return false;
            }
            if ($aIsList) {
                if (count($a) !== count($b)) {
                    return false;
                }
                foreach ($a as $i => $val) {
                    if (!self::sameValue($val, $b[$i])) {
                        return false;
                    }
                }
                return true;
            }
            if (count($a) !== count($b)) {
                return false;
            }
            foreach ($a as $key => $val) {
                if (!array_key_exists($key, $b) || !self::sameValue($val, $b[$key])) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    public static function canonicalJson(mixed $data): string
    {
        $normalize = static function ($value) use (&$normalize) {
            if (!is_array($value)) {
                return $value;
            }
            if (array_is_list($value)) {
                return array_map($normalize, $value);
            }
            ksort($value, SORT_STRING);
            foreach ($value as $k => $v) {
                $value[$k] = $normalize($v);
            }
            return $value;
        };

        return json_encode(
            $normalize($data),
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR
        );
    }
}
