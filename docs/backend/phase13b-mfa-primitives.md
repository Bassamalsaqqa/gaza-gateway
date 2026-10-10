# Phase 13B — Multi-Factor Authentication (MFA) Primitives Implementation

Status: Codex Reviewed / Durable MFA Integration Pending (PHPUnit 13.4.1, PHP 8.4.26).
Baseline: `93ffaeb5619c6c5115512b57ebf069cbd153e60e` (accepted Phase 13A baseline at `91a918caf0b22e565a43f52e46cf85ca4eb4825c` plus acceptance documentation).
Scope: Pure RFC 6238 TOTP, RFC 4226 HOTP, RFC 4648 Base32, and cryptographic recovery-code primitives. Zero database mutations, session promotion, HTTP routes, provider registrations, configuration edits, or auth flows are included.

---

## 1. Architectural Purpose and Security Boundaries

Phase 13B introduces pure, dependency-free cryptographic primitives for Time-based One-Time Password (TOTP) multi-factor authentication and recovery codes for Gaza Gateway staff accounts, conforming strictly to `docs/backend/auth-rbac.md`, `docs/backend/identity-lifecycle.v1.json`, `docs/backend/threat-model.md`, and the Codex MFA normative specifications.

### Security Invariants & Review Directives
1. **Isolated Cryptographic Foundation**: These classes implement pure mathematics, hashing, and encoding algorithms. They do not simulate or claim working authentication, session elevation, or database replay protection on their own. Pure match tests are not database replay proof.
2. **Replay Direction & Collision Sets (Codex Architectural Invariant)**:
   - TOTP `match()` returns a `list<int>` of ALL matching counter steps in stable ascending order, never a boolean.
   - Downstream database integration must lock credential/authorization, then inspect the entire set of returned matching counter steps.
   - Do NOT fall through from an already-consumed match to another collision match for the same OTP.
   - If ANY matching counter step in the returned set has already been consumed, the OTP is a replay and MUST be rejected immediately.
   - Otherwise, downstream must atomically consume EVERY matching counter step in the set together (with unique staff/version/counter constraints and purpose/session binding).
3. **Strict Information Hiding & Closure Encapsulation**:
   - Plaintext secrets and recovery codes are never stored in public or ordinary private string properties.
   - Credentials and persistent digests are enclosed within opaque `\Closure` instances in memory, defeating generic `var_export()` property reflection from dumping credential material.
   - Object representations (`__debugInfo()`, `jsonSerialize()`, `__toString()`) strictly emit `'[REDACTED]'` for both raw secrets/codes AND persistent digests.
   - Native PHP serialization (`__serialize()`, `__unserialize()`) throws `BadMethodCallException` to eliminate credential serialization attack surfaces.
   - All secret-bearing arguments across all primitives (including `Base32Codec::encode(#[SensitiveParameter] string $bytes)`) are attributed with `#[\SensitiveParameter]`.
   - Exception messages strictly exclude supplied user inputs, secrets, OTPs, or recovery codes.
4. **Bounded Allocation & Entropy Pinning**:
   - `RecoveryCode::generate(int $entropyBytes = self::ENTROPY_BYTES)` pins exact 16 bytes (128 bits) of cryptographic randomness. Any other value (0, 15, 17, PHP_INT_MAX, negative integers) is rejected BEFORE calling `random_bytes()`, preventing unbounded allocation.
   - `RecoveryCodeBatch::generate()` generates exactly 10 independent codes with no public parameter override.
5. **Consistent Secret Bounds**:
   - Both `TotpSecret` and `TotpService::resolveBinarySecret()` strictly enforce identical secret bounds: minimum 20 bytes (160 bits) to maximum 64 bytes (512 bits).

---

## 2. Package Architecture (`App\Identity\Mfa`)

The package resides under `backend/app/Identity/Mfa` with zero external composer dependencies:

```
backend/app/Identity/Mfa/
├── Base32Codec.php
├── TotpSecret.php
├── TotpService.php
├── RecoveryCode.php
├── RecoveryCodeBatch.php
└── Exceptions/
    ├── MfaException.php
    ├── InvalidSecretException.php
    ├── InvalidOtpException.php
    └── InvalidRecoveryCodeException.php
```

### 2.1 Strict RFC 4648 Base32 Codec (`Base32Codec`)
- **Alphabet**: RFC 4648 standard Base32 (`A-Z`, `2-7`), canonical uppercase only.
- **Strict Parsing**:
  - Rejects padding characters (`=`).
  - Rejects lowercase characters and ambiguous digits (`0, 1, 8, 9`).
  - Rejects unpadded lengths modulo 8 of `1, 3, 6` (mathematically invalid for byte payloads).
  - Rejects non-canonical extra bits: unused bits in the final 5-bit character must strictly be zero.
  - Bounded input: rejects inputs exceeding 512 characters.
- **Sensitive Parameter**: Input `$bytes` on `encode()` and `$base32` on `decode()` are annotated `#[\SensitiveParameter]`.

### 2.2 Encapsulated TOTP Secret (`TotpSecret`)
- Value object wrapping validated Base32 and binary secret material.
- Enforces identical bounded secret policy: minimum 20 bytes (160 bits) and maximum 64 bytes (512 bits) entropy bounds.
- Secrets held via opaque `\Closure` accessors.
- Methods: `revealBase32Secret()`, `getBinarySecret()`, `getEntropyBits()`.

### 2.3 TOTP & HOTP Cryptographic Service (`TotpService`)
- **Standards**: RFC 6238 (TOTP) and RFC 4226 (HOTP).
- **Hardened Invariants**:
  - Algorithm: HMAC-SHA1 (`sha1`) only.
  - Digits: 6 decimal digits, zero-padded.
  - Period: 30 seconds.
  - Skew window: strictly $\pm 1$ counter step (`[-1, 0, +1]`), filtering out negative counters.
  - Secret bounds: identically enforces 20..64 bytes when given string Base32 or `TotpSecret`.
  - Non-configurable: no widening of algorithm, digits, or skew window.
- **Arithmetic Safety**: Non-negative integer time arithmetic using `intdiv($timestamp, 30)`. Rejects negative unix timestamps with `InvalidOtpException`. Safe 64-bit integer handling for `PHP_INT_MAX` timestamps and counters.
- **Counter Matching**:
  - Validates exact 6 ASCII digits (`/^[0-9]{6}$/D`).
  - Evaluates candidate steps in the window: `$currentStep - 1` (if $\ge 0$), `$currentStep`, `$currentStep + 1`.
  - Timing-safe comparison using `hash_equals()`.
  - Returns complete `list<int>` of all matching counter integers in stable ascending order.

### 2.4 Recovery Code Primitive (`RecoveryCode`)
- **Entropy**: Pinned to exactly 16 bytes (128 bits) of cryptographic randomness.
- **Encoding**: Canonical unambiguous 32-character lowercase hexadecimal (`/^[0-9a-f]{32}$/D`).
- **Strict Bounded Validation / Canonicalization**:
  - Rejects any whitespace (leading, trailing, or interior spaces, tabs, newlines).
  - Rejects hyphens, dashes, punctuation, or separators.
  - Rejects non-hex characters and lookalikes (`o, l, I, g, z`).
  - Rejects Unicode homoglyphs and non-ASCII characters.
  - Validates exact 32 characters length.
  - Converts valid ASCII hex to lowercase.
- **Digest**: SHA-256 (`hash('sha256', $canonicalCode)`), 64 lowercase hex characters matching `staff_mfa_recovery_codes.code_digest` (`CHAR(64)`).
- **Closed Explicit Purpose**: `staff_mfa_recovery`.
- **Comparison Helper**: Constant-time `verifyDigest(string $knownDigest, string $suppliedCode): bool` using `hash_equals()`.
- **Information Hiding**: Both plaintext code and digest held via opaque `\Closure $secretHolder`. Redacted debug, JSON, string representations. Serialization prohibited. Explicit raw access via `revealPlaintextForEnrollmentOnly()` and `getDigest()`.

### 2.5 Recovery Code Batch Collection (`RecoveryCodeBatch`)
- Encapsulates exactly 10 independent recovery codes matching `identity-lifecycle.v1.json` (`recoveryCount: 10`) and OpenAPI specs.
- Fixed 10 codes generation (`generate(): self`) with no public parameters.
- Rejects requested counts other than 10 in constructor.
- Guarantees pairwise uniqueness across all 10 plaintexts and digests.
- Methods: `revealPlaintextCodesForEnrollmentOnly()`, `getDigests()`, `getCodes()`, `getPurpose()`, `count()`.
- Redacts both codes and digests in `__debugInfo()` and `jsonSerialize()`.

---

## 3. Verification & Test Evidence

Tests extend `PHPUnit\Framework\TestCase` and execute against real **PHPUnit 13.4.1 on PHP 8.4.26 CLI** in an ephemeral, isolated container (`--network none`) using the supplied locked dev vendor mount:

### Reproduction Recipe

Complete the locked local bootstrap in [phase13a-foundation.md](phase13a-foundation.md) in an isolated checkout, including the dev Composer dependencies in `backend/vendor`. From the repository root, run only these pure tests; no PostgreSQL connection is required:

```powershell
docker run --rm --network none --entrypoint php `
  --mount "type=bind,source=$PWD/backend,target=/var/www/html,readonly" `
  --workdir /var/www/html gaza-gateway-backend:phase13a `
  vendor/bin/phpunit --configuration phpunit.xml `
  --do-not-record-test-run-history --fail-on-phpunit-deprecation tests/Unit/IdentityMfa
```

### Test Suite Execution Outcome (`70 tests, 410 assertions`)
```
PHPUnit 13.4.1 by Sebastian Bergmann and contributors.

Runtime:       PHP 8.4.26

................................................................. 65 / 70 ( 92%)
.....                                                             70 / 70 (100%)

Time: 00:00.081, Memory: 22.00 MB

OK (70 tests, 410 assertions)
```
Codex independently reran the locked PHPUnit CLI with the current history flag and `--fail-on-phpunit-deprecation`: exit 0, no deprecations. The earlier worker compatibility assertion harness is not PHPUnit evidence. Codex also independently verified all 16 HOTP/TOTP vectors, eight Base32 roundtrip lengths, entropy/secret bounds and populated recovery-code/digest redaction probes. These checks establish the pure primitives only; they do not establish durable MFA authentication.

1. **`Base32CodecTest`** (14 tests):
   - RFC 4648 official test vectors (`f` -> `MY`, `fo` -> `MZXQ`, `foo` -> `MZXW6`, `foob` -> `MZXW6YQ`, `fooba` -> `MZXW6YTB`, `foobar` -> `MZXW6YTBOI`, 20-byte key -> `GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ`).
   - Roundtrip fidelity across 1..35 byte lengths.
   - Rejection of padding (`=`), lowercase, non-Base32 digits (`0, 1, 8, 9`), empty inputs, oversized inputs.
   - Rejection of invalid unpadded lengths modulo 8 (1, 3, 6).
   - Rejection of non-canonical extra bits across all valid unpadded modulo lengths (mod 2, 4, 5, 7).
   - Entropy minimum enforcement ($\ge 160$ bits).
2. **`TotpSecretTest`** (9 tests):
   - Instantiation from Base32 string and cryptographic generation.
   - Sub-160-bit and oversized secret rejection.
   - Information hiding across `var_export()`, `__debugInfo()`, `json_encode()`, `(string)`, and `serialize()`.
3. **`TotpServiceTest`** (21 tests):
   - Authoritative RFC 4226 HOTP test vectors for counters 0..9:
     - Count 0: `755224`, Count 1: `287082`, Count 2: `359152`, Count 3: `969429`, Count 4: `338314`
     - Count 5: `254676`, Count 6: `287922`, Count 7: `162583`, Count 8: `399871`, Count 9: `520489`
   - Authoritative RFC 6238 TOTP SHA-1 test vectors (last 6 digits of 8-digit vectors):
     - Time 59 (step 1): `287082`
     - Time 1111111109 (step 37037036): `081804` (leading zero preserved)
     - Time 1111111111 (step 37037037): `050471` (leading zero preserved)
     - Time 1234567890 (step 41152263): `005924` (double leading zero preserved)
     - Time 2000000000 (step 66666666): `279037`
     - Time 20000000000 (step 666666666): `353130` (64-bit integer timestamp without overflow)
   - Step 0 and timestamp 0 handling.
   - Negative timestamp and negative counter rejections.
   - Exact window matching (offsets -1, 0, +1).
   - Window boundary at timestamp 0 (candidate steps strictly `[0, 1]`, negative counter omitted).
   - Outside-window rejection (offsets -2, +2 return empty array).
   - Malformed code validation (non-digits, lengths $\ne 6$, whitespace).
   - Collision deterministic counter-set handling (returns all matching counters in stable order).
   - Consistent secret bounds: string secrets < 20 bytes and > 64 bytes strictly rejected.
   - Non-negative 64-bit integer boundaries: `PHP_INT_MAX` for timestamp and counter handled safely without overflow.
4. **`RecoveryCodeTest`** (15 tests):
   - Canonical 32-character hex generation.
   - Closed purpose `staff_mfa_recovery`.
   - Bounded entropy pinning: exact 16 bytes accepted; `0, 15, 17, -1, PHP_INT_MAX` strictly rejected before allocation.
   - Timing-safe `verifyDigest()` positive and negative controls.
   - Rejection of whitespace, dashes, non-hex characters, lookalikes, Unicode homoglyphs, wrong length.
   - Information hiding across `var_export()`, `__debugInfo()`, `json_encode()`, string casting, and `serialize()` (both code and digest redacted).
5. **`RecoveryCodeBatchTest`** (8 tests):
   - Exactly 10 independent codes generated per batch (`generate(): self`).
   - Pairwise uniqueness across all 10 plaintexts and digests.
   - Consistency between `getCodes()`, `getDigests()`, and `revealPlaintextCodesForEnrollmentOnly()`.
   - Rejection of batch size $\ne 10$ and duplicate codes in candidate sets.
   - Information hiding across all views and serialization guards (both codes and digests redacted).
6. **`MfaSecurityInformationHidingTest`** (3 tests):
   - Reflection verification that `#[\SensitiveParameter]` attribute is present on all sensitive arguments across all primitives (including `Base32Codec::encode`).
   - Reflection verification that classes have zero public properties.
   - Reflection verification that `var_export()` does not expose credentials or digests through closure encapsulation.

---

## 4. Pending Downstream Integration (Out of Scope for Primitives Package)

The following components belong to later Phase 13B assignments and are explicitly deferred:
1. **Durable MFA Storage**:
   - Staging candidate credentials in `staff_mfa_credentials` (`encrypted_secret`).
   - Atomic counter consumption in `staff_mfa_counter_consumptions` with `unique(staff_id, mfa_version, counter_step)`.
   - Persistent recovery code digests in `staff_mfa_recovery_codes` with `unique(staff_id, mfa_version, code_digest)`.
2. **HTTP Middleware & Routes**:
   - `POST /staff/mfa/challenge` and `POST /staff/mfa/verify` (login MFA flow).
   - `POST /staff/mfa/setup` and `POST /staff/mfa/setup/confirm` (initial enrollment and replacement).
   - `POST /staff/mfa/recovery-codes/regenerate` (regeneration flow under step-up).
   - `POST /staff/step-up` (session-bound step-up proof recording `mfa_verified_at`).
3. **Sentinel Concurrency**:
   - Row-level lock on `staff_directory_control(id = 1)` ensuring no directory update leaves fewer than one active, verified, usable-password, confirmed-current-MFA administrator.
