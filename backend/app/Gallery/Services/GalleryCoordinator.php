<?php

declare(strict_types=1);

namespace App\Gallery\Services;

use App\Gallery\Exceptions\GalleryConflictException;
use App\Gallery\Exceptions\GalleryCorruptSnapshotException;
use App\Gallery\Exceptions\GalleryNotFoundException;
use App\Gallery\Exceptions\GalleryUnpublishedException;
use App\Gallery\Exceptions\GalleryValidationException;
use App\Gallery\Validation\GalleryValidator;
use App\Support\DatabaseClock;
use App\Support\DatabaseFailure;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class GalleryCoordinator
{
    public const DEFAULT_SLUG = 'default';

    public function __construct(
        private readonly GalleryValidator $validator = new GalleryValidator()
    ) {
    }

    public function getPublished(): array
    {
        $doc = DB::table('gallery_documents')->where('slug', self::DEFAULT_SLUG)->first();
        if ($doc === null || ($doc->published_revision === null && !$doc->tombstoned)) {
            throw new GalleryNotFoundException('Gallery configuration was never published.');
        }

        if ($doc->tombstoned) {
            throw new GalleryUnpublishedException('Gallery configuration is unpublished.');
        }

        $revRow = DB::table('gallery_revisions')
            ->where('slug', self::DEFAULT_SLUG)
            ->where('revision', (int) $doc->published_revision)
            ->first();

        if ($revRow === null) {
            throw new GalleryCorruptSnapshotException('Published revision record is missing from repository.');
        }

        $calculatedHash = hash('sha256', (string) $revRow->snapshot_bytes);
        if (!hash_equals((string) $revRow->snapshot_hash, $calculatedHash)) {
            throw new GalleryCorruptSnapshotException('Published revision snapshot hash digest mismatch.');
        }

        try {
            $payload = json_decode((string) $revRow->snapshot_bytes, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException $e) {
            throw new GalleryCorruptSnapshotException('Published revision payload is invalid JSON: ' . $e->getMessage(), 0, $e);
        }

        try {
            $this->validator->validate($payload);
        } catch (GalleryValidationException $e) {
            throw new GalleryCorruptSnapshotException('Published revision payload violates validation constraints: ' . $e->getMessage(), 0, $e);
        }

        return [
            'id' => 'gallery',
            'kind' => 'gallery',
            'slug' => self::DEFAULT_SLUG,
            'revisionNumber' => (int) $doc->published_revision,
            'status' => 'published',
            'updatedAt' => CarbonImmutable::parse($doc->updated_at)->toIso8601String(),
            'payload' => $payload,
        ];
    }

    public function getEditorial(): array
    {
        $doc = DB::table('gallery_documents')->where('slug', self::DEFAULT_SLUG)->first();
        if ($doc === null) {
            throw new GalleryNotFoundException('Gallery configuration has not been created or drafted.');
        }

        return self::formatEditorialDto($doc);
    }

    public function saveDraft(
        array $payload,
        int $expectedRevision,
        string $staffId,
        callable $revalidateAuthorizer
    ): array {
        try {
            return DB::transaction(function () use ($payload, $expectedRevision, $staffId, $revalidateAuthorizer): array {
                // 1. Authorize at transaction entry (verifies staff/session locks)
                $revalidateAuthorizer();

                // 2. Domain row lock
                $doc = DB::table('gallery_documents')->where('slug', self::DEFAULT_SLUG)->lockForUpdate()->first();
                // Fresh authority after any waited aggregate lock, before mutation.
                $revalidateAuthorizer();

                if ($doc === null) {
                    if ($expectedRevision !== 0) {
                        throw new GalleryConflictException(
                            "Revision conflict: document is uninitialized (version 0), but expected revision $expectedRevision was specified."
                        );
                    }

                    $this->validator->validate($payload);
                    $canonicalJson = self::canonicalJson($payload);
                    $newCurrentRevision = 1;
                    $newContentRevision = 1;

                    DB::table('gallery_documents')->insert([
                        'slug' => self::DEFAULT_SLUG,
                        'kind' => self::DEFAULT_SLUG,
                        'status' => 'draft',
                        'current_revision' => $newCurrentRevision,
                        'published_revision' => null,
                        'draft_revision' => null,
                        'tombstoned' => false,
                        'tombstoned_at' => null,
                        'created_at' => DatabaseClock::raw(),
                        'updated_at' => DatabaseClock::raw(),
                    ]);

                    DB::table('gallery_revisions')->insert([
                        'slug' => self::DEFAULT_SLUG,
                        'revision' => $newContentRevision,
                        'snapshot_json' => $canonicalJson,
                        'snapshot_bytes' => $canonicalJson,
                        'snapshot_hash' => hash('sha256', $canonicalJson),
                        'created_at' => DatabaseClock::raw(),
                    ]);

                    // MySQL checks foreign keys immediately; publish the pointer only after its revision exists.
                    DB::table('gallery_documents')->where('slug', self::DEFAULT_SLUG)
                        ->update(['draft_revision' => $newContentRevision]);

                    DB::table('gallery_audit_events')->insert([
                        'id' => (string) Str::uuid(),
                        'slug' => self::DEFAULT_SLUG,
                        'revision' => $newContentRevision,
                        'staff_id' => $staffId,
                        'action' => 'draft.save',
                        'outcome' => 'success',
                        'restored_from_revision' => null,
                        'created_at' => DatabaseClock::raw(),
                    ]);

                    return [
                        'slug' => self::DEFAULT_SLUG,
                        'changed' => true,
                        'revision' => $newContentRevision,
                        'currentRevision' => $newCurrentRevision,
                        'status' => 'draft',
                    ];
                }

                $currentRevision = (int) $doc->current_revision;
                if ($expectedRevision !== $currentRevision) {
                    throw new GalleryConflictException(
                        "Revision conflict: current revision is $currentRevision, but expected revision $expectedRevision was specified."
                    );
                }

                $activeRevNumber = $doc->draft_revision !== null
                    ? (int) $doc->draft_revision
                    : ($doc->published_revision !== null ? (int) $doc->published_revision : null);

                if ($activeRevNumber !== null) {
                    $activeRev = DB::table('gallery_revisions')
                        ->where('slug', self::DEFAULT_SLUG)
                        ->where('revision', $activeRevNumber)
                        ->first();
                    if ($activeRev !== null) {
                        $existingPayload = json_decode($activeRev->snapshot_bytes, true, 512, JSON_THROW_ON_ERROR);
                        if (self::sameValue($existingPayload, $payload)) {
                            return [
                                'slug' => self::DEFAULT_SLUG,
                                'changed' => false,
                                'revision' => $activeRevNumber,
                                'currentRevision' => $currentRevision,
                                'status' => $doc->status,
                            ];
                        }
                    }
                }

                $this->validator->validate($payload);
                $canonicalJson = self::canonicalJson($payload);

                $maxContentRev = (int) DB::table('gallery_revisions')->where('slug', self::DEFAULT_SLUG)->max('revision');
                $newContentRevision = $maxContentRev + 1;
                $newCurrentRevision = $currentRevision + 1;

                DB::table('gallery_revisions')->insert([
                    'slug' => self::DEFAULT_SLUG,
                    'revision' => $newContentRevision,
                    'snapshot_json' => $canonicalJson,
                    'snapshot_bytes' => $canonicalJson,
                    'snapshot_hash' => hash('sha256', $canonicalJson),
                    'created_at' => DatabaseClock::raw(),
                ]);

                DB::table('gallery_documents')->where('slug', self::DEFAULT_SLUG)->update([
                    'current_revision' => $newCurrentRevision,
                    'draft_revision' => $newContentRevision,
                    'status' => 'draft',
                    'updated_at' => DatabaseClock::raw(),
                ]);

                DB::table('gallery_audit_events')->insert([
                    'id' => (string) Str::uuid(),
                    'slug' => self::DEFAULT_SLUG,
                    'revision' => $newContentRevision,
                    'staff_id' => $staffId,
                    'action' => 'draft.save',
                    'outcome' => 'success',
                    'restored_from_revision' => null,
                    'created_at' => DatabaseClock::raw(),
                ]);

                return [
                    'slug' => self::DEFAULT_SLUG,
                    'changed' => true,
                    'revision' => $newContentRevision,
                    'currentRevision' => $newCurrentRevision,
                    'status' => 'draft',
                ];
            });
        } catch (QueryException $e) {
            if (DatabaseFailure::isDuplicate($e)) {
                throw new GalleryConflictException(
                    "Revision conflict: document was concurrently initialized.",
                    previous: $e
                );
            }
            throw $e;
        }
    }

    public function discardDraft(
        int $expectedRevision,
        string $staffId,
        callable $revalidateAuthorizer
    ): array {
        return DB::transaction(function () use ($expectedRevision, $staffId, $revalidateAuthorizer): array {
            $revalidateAuthorizer();

            $doc = DB::table('gallery_documents')->where('slug', self::DEFAULT_SLUG)->lockForUpdate()->first();
                // Fresh authority after any waited aggregate lock, before mutation.
                $revalidateAuthorizer();

            if ($doc === null) {
                throw new GalleryNotFoundException('Gallery configuration not found.');
            }

            $currentRevision = (int) $doc->current_revision;
            if ($expectedRevision !== $currentRevision) {
                throw new GalleryConflictException(
                    "Revision conflict: current revision is $currentRevision, but expected revision $expectedRevision was specified."
                );
            }

            if ($doc->draft_revision === null) {
                return self::formatEditorialDto($doc);
            }

            $discardedDraftRevision = (int) $doc->draft_revision;
            $newStatus = $doc->published_revision !== null
                ? ($doc->tombstoned ? 'unpublished' : 'published')
                : 'draft';

            $newCurrentRevision = $currentRevision + 1;

            DB::table('gallery_documents')->where('slug', self::DEFAULT_SLUG)->update([
                'current_revision' => $newCurrentRevision,
                'draft_revision' => null,
                'status' => $newStatus,
                'updated_at' => DatabaseClock::raw(),
            ]);

            DB::table('gallery_audit_events')->insert([
                'id' => (string) Str::uuid(),
                'slug' => self::DEFAULT_SLUG,
                'revision' => $discardedDraftRevision,
                'staff_id' => $staffId,
                'action' => 'draft.discard',
                'outcome' => 'success',
                'restored_from_revision' => null,
                'created_at' => DatabaseClock::raw(),
            ]);

            $updatedDoc = DB::table('gallery_documents')->where('slug', self::DEFAULT_SLUG)->first();
            return self::formatEditorialDto($updatedDoc);
        });
    }

    public function publish(
        int $expectedRevision,
        string $staffId,
        callable $revalidateAuthorizer
    ): array {
        return DB::transaction(function () use ($expectedRevision, $staffId, $revalidateAuthorizer): array {
            $revalidateAuthorizer();

            $doc = DB::table('gallery_documents')->where('slug', self::DEFAULT_SLUG)->lockForUpdate()->first();
                // Fresh authority after any waited aggregate lock, before mutation.
                $revalidateAuthorizer();

            if ($doc === null) {
                throw new GalleryNotFoundException('Gallery configuration not found.');
            }

            $currentRevision = (int) $doc->current_revision;
            if ($expectedRevision !== $currentRevision) {
                throw new GalleryConflictException(
                    "Revision conflict: current revision is $currentRevision, but expected revision $expectedRevision was specified."
                );
            }

            if ($doc->draft_revision === null && $doc->published_revision !== null && !$doc->tombstoned) {
                return self::formatEditorialDto($doc);
            }

            $revToPublish = $doc->draft_revision !== null
                ? (int) $doc->draft_revision
                : ($doc->published_revision !== null ? (int) $doc->published_revision : null);

            if ($revToPublish === null || $revToPublish === 0) {
                throw new GalleryValidationException('No draft or revision available to publish for gallery.');
            }

            DB::statement(
                'INSERT IGNORE INTO gallery_published_revisions (slug, revision, staff_id, published_at)
                 VALUES (?, ?, ?, UTC_TIMESTAMP(6))',
                [self::DEFAULT_SLUG, $revToPublish, $staffId]
            );

            $newCurrentRevision = $currentRevision + 1;

            DB::table('gallery_documents')->where('slug', self::DEFAULT_SLUG)->update([
                'current_revision' => $newCurrentRevision,
                'published_revision' => $revToPublish,
                'draft_revision' => null,
                'status' => 'published',
                'tombstoned' => false,
                'tombstoned_at' => null,
                'updated_at' => DatabaseClock::raw(),
            ]);

            DB::table('gallery_audit_events')->insert([
                'id' => (string) Str::uuid(),
                'slug' => self::DEFAULT_SLUG,
                'revision' => $revToPublish,
                'staff_id' => $staffId,
                'action' => 'publish',
                'outcome' => 'success',
                'restored_from_revision' => null,
                'created_at' => DatabaseClock::raw(),
            ]);

            $updatedDoc = DB::table('gallery_documents')->where('slug', self::DEFAULT_SLUG)->first();
            return self::formatEditorialDto($updatedDoc);
        });
    }

    public function unpublish(
        int $expectedRevision,
        string $staffId,
        callable $revalidateAuthorizer
    ): array {
        return DB::transaction(function () use ($expectedRevision, $staffId, $revalidateAuthorizer): array {
            $revalidateAuthorizer();

            $doc = DB::table('gallery_documents')->where('slug', self::DEFAULT_SLUG)->lockForUpdate()->first();
                // Fresh authority after any waited aggregate lock, before mutation.
                $revalidateAuthorizer();

            if ($doc === null) {
                throw new GalleryNotFoundException('Gallery configuration not found.');
            }

            $currentRevision = (int) $doc->current_revision;
            if ($expectedRevision !== $currentRevision) {
                throw new GalleryConflictException(
                    "Revision conflict: current revision is $currentRevision, but expected revision $expectedRevision was specified."
                );
            }

            if ($doc->tombstoned) {
                return self::formatEditorialDto($doc);
            }

            if ($doc->published_revision === null) {
                throw new GalleryValidationException('Cannot unpublish gallery because it was never published.');
            }

            $rev = (int) $doc->published_revision;
            $newCurrentRevision = $currentRevision + 1;

            DB::table('gallery_documents')->where('slug', self::DEFAULT_SLUG)->update([
                'current_revision' => $newCurrentRevision,
                'status' => 'unpublished',
                'tombstoned' => true,
                'tombstoned_at' => DatabaseClock::raw(),
                'updated_at' => DatabaseClock::raw(),
            ]);

            DB::table('gallery_audit_events')->insert([
                'id' => (string) Str::uuid(),
                'slug' => self::DEFAULT_SLUG,
                'revision' => $rev,
                'staff_id' => $staffId,
                'action' => 'unpublish',
                'outcome' => 'success',
                'restored_from_revision' => null,
                'created_at' => DatabaseClock::raw(),
            ]);

            $updatedDoc = DB::table('gallery_documents')->where('slug', self::DEFAULT_SLUG)->first();
            return self::formatEditorialDto($updatedDoc);
        });
    }

    public function restore(
        int $targetRevision,
        int $expectedRevision,
        string $staffId,
        callable $revalidateAuthorizer
    ): array {
        return DB::transaction(function () use ($targetRevision, $expectedRevision, $staffId, $revalidateAuthorizer): array {
            $revalidateAuthorizer();

            $doc = DB::table('gallery_documents')->where('slug', self::DEFAULT_SLUG)->lockForUpdate()->first();
                // Fresh authority after any waited aggregate lock, before mutation.
                $revalidateAuthorizer();

            if ($doc === null) {
                throw new GalleryNotFoundException('Gallery configuration not found.');
            }

            $currentRevision = (int) $doc->current_revision;
            if ($expectedRevision !== $currentRevision) {
                throw new GalleryConflictException(
                    "Revision conflict: current revision is $currentRevision, but expected revision $expectedRevision was specified."
                );
            }

            $publishedRecord = DB::table('gallery_published_revisions')
                ->where('slug', self::DEFAULT_SLUG)
                ->where('revision', $targetRevision)
                ->first();

            if ($publishedRecord === null) {
                throw new GalleryValidationException(
                    "Target revision $targetRevision was never published. Only previously published revisions can be restored."
                );
            }

            $targetRevRow = DB::table('gallery_revisions')
                ->where('slug', self::DEFAULT_SLUG)
                ->where('revision', $targetRevision)
                ->first();

            if ($targetRevRow === null) {
                throw new GalleryNotFoundException("Target revision $targetRevision data not found.");
            }

            $maxContentRev = (int) DB::table('gallery_revisions')->where('slug', self::DEFAULT_SLUG)->max('revision');
            $newContentRevision = $maxContentRev + 1;
            $newCurrentRevision = $currentRevision + 1;

            DB::table('gallery_revisions')->insert([
                'slug' => self::DEFAULT_SLUG,
                'revision' => $newContentRevision,
                'snapshot_json' => $targetRevRow->snapshot_bytes,
                'snapshot_bytes' => $targetRevRow->snapshot_bytes,
                'snapshot_hash' => $targetRevRow->snapshot_hash,
                'created_at' => DatabaseClock::raw(),
            ]);

            DB::table('gallery_published_revisions')->insert([
                'slug' => self::DEFAULT_SLUG,
                'revision' => $newContentRevision,
                'staff_id' => $staffId,
                'published_at' => DatabaseClock::raw(),
            ]);

            DB::table('gallery_documents')->where('slug', self::DEFAULT_SLUG)->update([
                'current_revision' => $newCurrentRevision,
                'published_revision' => $newContentRevision,
                'draft_revision' => null,
                'status' => 'published',
                'tombstoned' => false,
                'tombstoned_at' => null,
                'updated_at' => DatabaseClock::raw(),
            ]);

            DB::table('gallery_audit_events')->insert([
                'id' => (string) Str::uuid(),
                'slug' => self::DEFAULT_SLUG,
                'revision' => $newContentRevision,
                'staff_id' => $staffId,
                'action' => 'restore',
                'outcome' => 'success',
                'restored_from_revision' => $targetRevision,
                'created_at' => DatabaseClock::raw(),
            ]);

            $updatedDoc = DB::table('gallery_documents')->where('slug', self::DEFAULT_SLUG)->first();
            return self::formatEditorialDto($updatedDoc);
        });
    }

    private static function formatEditorialDto(object $doc): array
    {
        $targetRev = $doc->draft_revision !== null
            ? (int) $doc->draft_revision
            : ($doc->published_revision !== null ? (int) $doc->published_revision : 0);

        $status = $doc->draft_revision !== null
            ? 'draft'
            : ($doc->tombstoned ? 'unpublished' : ($doc->published_revision !== null ? 'published' : 'draft'));

        $revRow = null;
        if ($targetRev > 0) {
            $revRow = DB::table('gallery_revisions')
                ->where('slug', self::DEFAULT_SLUG)
                ->where('revision', $targetRev)
                ->first();
        }

        $payload = $revRow !== null
            ? json_decode($revRow->snapshot_bytes, true, 512, JSON_THROW_ON_ERROR)
            : null;

        return [
            'id' => 'gallery',
            'kind' => 'gallery',
            'slug' => self::DEFAULT_SLUG,
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
