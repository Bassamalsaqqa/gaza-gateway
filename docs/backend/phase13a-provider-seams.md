# Phase 13A — Bounded Local Mail and Private Storage Provider Seams

Status: In Progress (Foundation Provider Seams Established).
Baseline: locally reviewed Foundation01 checkpoint `92b7eb45beab11f701619640b5b5bd5f73d21a5d`; full Phase 13A awaits independent review.
Architecture: Laravel 13 / PHP 8.4 dependency-free service contracts, immutable DTOs, honest local adapters, and fail-closed unconfigured deployment adapters. No real delivery, S3, cloud buckets, SMTP, external API routes, or Phase 13B domain logic.

---

## 1. Architectural Purpose and Seams

Phase 13A establishes dependency-free injection seams for asynchronous operations that will be consumed in subsequent phases (Phase 13B identity verification tokens, Phase 13D booking confirmation receipts, and Phase 13E editorial asset staging):
1. **Mail Submission Seam**: A bounded contract for submitting plain-text notifications, capturing them privately to disk in local development, and failing closed in production/staging until an owner-approved delivery provider is onboarded.
2. **Private Object Storage Seam**: A bounded contract for private binary/text object storage with opaque keys, atomic write semantics, and declared metadata, strictly avoiding public URLs, remote uploads, or directory traversal.

Both seams are registered through `App\Providers\FoundationServicesProvider` and configured via `config/foundation-services.php`.

---

## 2. Contracts and Immutable DTOs

### 2.1 Mail Seam
- **Contract**: `App\Contracts\Mail\MailSubmissionInterface`
  - `submit(MailMessage $message): MailReceipt`
  - `send(MailMessage $message): MailReceipt` (semantic alias)
- **Input DTO**: `App\Contracts\Mail\MailMessage` (immutable `readonly class`)
  - Bounds: Single recipient email ($\le 254$ characters), single-line subject ($\le 255$ characters), plain-text body ($\le 64$ KiB, valid UTF-8).
  - Validation: Strict CRLF, newline (`\r`, `\n`), and null byte (`\0`) rejection before any I/O.
  - Privacy: Implements `__debugInfo()` redacting recipient and subject, excluding raw message body to prevent leakages in exception traces or logs.
- **Receipt DTO**: `App\Contracts\Mail\MailReceipt` (immutable `readonly class`)
  - Status: Strictly `captured_locally`. Never claims external delivery or dispatch.
  - Fields: `captureId` (opaque prefix `cap_` with random hex), `capturedAt` (ISO-8601 UTC timestamp), `status`, `payloadHash` (SHA-256 of persisted record), `bytesWritten`.
  - Privacy: Excludes recipient email and message body.

### 2.2 Storage Seam
- **Contract**: `App\Contracts\Storage\PrivateStorageInterface`
  - `put(string $key, string $contents, array $declaredMetadata = [], bool $overwrite = true): StoragePutReceipt`
  - `get(string $key): ?StoredObject`
  - `has(string $key): bool`
  - `delete(string $key): StorageDeleteReceipt`
  - *Invariant*: Strictly no `url()`, `temporaryUrl()`, or public access methods.
- **Key Validation**: `App\Contracts\Storage\StorageKey`
  - Bounds: 1 to 128 characters, matching `/^[a-zA-Z0-9][a-zA-Z0-9_\-\.]{0,127}$/`.
  - Traversal Guards: Rejects `/`, `\`, `..`, leading/trailing dots, null bytes, and control characters.
- **Receipt DTOs**:
  - `App\Contracts\Storage\StoragePutReceipt`: Truthfully reports status (`stored` or `no_op_exists`), `byteLength`, `sha256`, `declaredMetadata`, `storedAt`.
  - `App\Contracts\Storage\StorageDeleteReceipt`: Truthfully reports status (`deleted` or `not_found`), `deletedAt`.
  - `App\Contracts\Storage\StoredObject`: Immutable object representation with raw bytes, length, hash, declared metadata, and modification timestamp.

---

## 3. Implementations and Adapters

### 3.1 Honest Local Adapters (`local` and `testing` environments only)
- **`App\Services\Foundation\Mail\LocalFileMailGateway`**:
  - Writes private JSON records to a dedicated local directory (`storage/app/private/mail_sink`).
  - Permissions: Restrictive directory permissions (`0700`) and file permissions (`0600`), strictly rejecting unsafe group/world permissions (e.g. `0777`).
  - Atomic write: Writes payload to temporary `.cap_*.tmp` file and executes atomic filesystem `rename()`.
  - Rejects empty or forbidden system roots (`/`, `C:\`, `/etc`, etc.) and symlink targets.
- **`App\Services\Foundation\Storage\LocalPrivateStorage`**:
  - Writes private objects to `storage/app/private/object_storage` using a single atomic envelope (`{key}.object.json`) containing payload base64, hash, byte length, and declared metadata.
  - Atomic Publication & Safe No-Clobber: All envelopes are fully written, flushed, closed, and chmodded (0600) inside `.tmp/` before publication. Overwrite (`$overwrite = true`) publishes instantaneously via atomic `rename()`. No-clobber (`$overwrite = false`) publishes via same-filesystem hard-link (`link()`), guaranteeing that partially written envelopes are never visible, and if the target exists, preserving existing bytes while returning truthful `no_op_exists`.
  - Preserves existing bytes: Failures during staging or publication leave existing target files completely untouched.
  - Read Error Isolation: `get()` returns `null` strictly when the object file does not exist (`!file_exists`); read failures or unreadable files throw `StorageSecurityException` rather than masking failures as absent objects.
  - Temporary Directory & Symlink Guards: Strictly validates `.tmp` directory against symlink redirection and ensures 0700 permissions; target paths and configured roots are checked against symlink escapes.
  - Fail-Safe Deletion: Inspects actual filesystem `unlink()` outcome and verifies removal, throwing `StorageSecurityException` if deletion cannot proceed (e.g. read-only permissions).
  - Declared Metadata Bounding: Validates metadata structure (scalar or null values only, maximum 50 keys, key identifier grammar $\le 64$ chars, total serialized size $\le 64$ KiB). Metadata is stored in the single atomic envelope and treated as declared only.

### 3.2 Unconfigured Deployment Adapters (`staging` and `production`)
- **`App\Services\Foundation\Mail\UnconfiguredMailGateway`**:
  - Throws `App\Contracts\Mail\Exceptions\UnconfiguredMailProviderException` on invocation.
  - Zero network dispatch, zero filesystem I/O, zero credential leaks.
- **`App\Services\Foundation\Storage\UnconfiguredPrivateStorage`**:
  - Throws `App\Contracts\Storage\Exceptions\UnconfiguredStorageProviderException` on invocation.
  - Zero disk operations; ephemeral service disks are not authoritative asset storage.

---

## 4. Production Isolation Gate

The provider binding in `App\Providers\FoundationServicesProvider` strictly enforces environment gates:
```php
$isLocalOrTesting = $app->environment('local', 'testing');
$driver = $app['config']->get('foundation-services.mail.driver', 'local');

if ($isLocalOrTesting && $driver === 'local') {
    return new LocalFileMailGateway(...);
}

return new UnconfiguredMailGateway();
```
- In `staging` and `production`, the binding **always** selects `UnconfiguredMailGateway` and `UnconfiguredPrivateStorage`, even if configuration flags attempt to set `driver=local`.
- Local sink or storage cannot be accidentally enabled in deployed environments.
- Unused provider seams do not trigger I/O during framework boot.

---

## 5. Verification and QA Evidence

All implementations are verified using isolated PHPUnit 13 unit tests running inside the pinned `gaza-gateway-backend:phase13a` Docker container with zero dependencies on PostgreSQL or network services:

```bash
docker run --rm --user 1001:1001 -v "${PWD}/backend:/app" -w /app gaza-gateway-backend:phase13a php vendor/bin/phpunit --do-not-record-test-run-history --do-not-cache-test-index tests/Unit
```
- **Tests executed**: 65 tests, 198 assertions.
- **Outcome**: 100% PASS, 0 failures, 0 errors, 0 warnings.
- **Coverage**:
  - Mail: Message bounds, custom parameter limits bounded by architectural ceilings, UTF-8 validation on subject and body, CRLF rejection before trim, null byte rejection, recipient redaction, local capture receipts, atomic writes, permission enforcement, unconfigured exceptions.
  - Storage: Key grammar, directory traversal negative probes, symlink negative probes, `.tmp` symlink escape rejection, put/get/has/delete roundtrip, single atomic envelope, hard-link atomic publication without partial visibility, race-safe no-clobber semantics preserving existing bytes, unreadable file exception handling, fail-safe unlink checking, metadata schema and size bounding ($\le 64$ KiB), unconfigured fail-closed exceptions.
  - Provider: Environment gating across `local`, `testing`, `staging`, and `production`.
