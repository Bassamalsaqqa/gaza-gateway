# Phase 13B local identity review gate

Status: final integration verification prepared / Awaiting Independent Review. This record does not accept the phase or authorize remote exposure.

## Reproduction and scope

Install the locked backend dependencies and build the existing `gaza-gateway-backend:phase13a` Docker image using the foundation recipe. Run `node backend/scripts/run-identity-gate.mjs` from the repository root. If Composer dependencies are installed in a different isolated worktree, supply its absolute `backend/vendor` path in `IDENTITY_GATE_VENDOR`; the gate checks the installed platform and Composer metadata. Use the exact reviewed source and lockfile.

The gate creates a randomly named private Docker network, a temporary PostgreSQL 17 instance with tmpfs data, and a temporary PHP runner. It publishes no ports and reuses no retained database or volumes. Both process and resolved database guards remain enforced. Random local APP_KEY/OTP pepper values remain in process/container memory; no credentials are emitted in the receipt. Cleanup removes only those exact run-owned resources.

Migration verification runs before identity fixtures: all migrations up, explicit dependency/profile/persistence/index rollback, core/infrastructure preservation, and reapply. The migration test now includes the later cleanup-index migration and requires the disposable-instance flag; it cannot silently roll back the retained database's identity/audit tables.

`backend/tests/identity-final.xml` selects cross-package identity HTTP, PostgreSQL concurrency, admission, CSRF, retention/outbox and cryptographic/RBAC cases. This is one identity-focused integration run, not the entire frontend/backend regression suite. It includes actual-kernel lifecycle chains and independently generated separate-process races. Optional capture instrumentation records the first genuine successful response per closed identity operation, with no request bodies/cookies/headers. Its private exclusive directory is deleted after validation. All 46 operation successes must validate against their actual OpenAPI status/media schema; canonical false-success tampering must fail. The gate also checks generated client parity, backend contracts and the affected identity client/UI boundary tests.

Logs and a secret-free SHA-256 receipt remain under `scratch/gaza_identity_gate_<run>/`. The receipt pins the Git head, source hashes, commands, exit codes, migrations, response artifact hashes and test summaries. A failed command produces no passing receipt. Preserve failures; after a correction rerun only the affected checks and distinguish cumulative evidence from a single green run.

## Browser and narrow corrections

The local Chromium 154.0.8037.92 browser evidence is cumulative: 13 focused checks passed across passenger and staff flows on a 390 × 844 viewport. Same-host HTTPS origins used distinct ports and a CA confined to the disposable browser's private trust store. TLS verification remained enabled. Evidence covers prototype-storage rejection, real registration/verification/login, profile/traveler mutations, Arabic RTL and LTR email, Secure/HttpOnly/host-only/SameSite=Lax cookies, logout revocation, invitation/pending isolation, genuine TOTP enrollment, recovery-code replay denial, Origin/raw-CSRF rejection, and horizontal overflow. It is not a broad browser/viewport matrix or remote provider-delivery test.

The browser exposed a missing `Cache-Control` preflight allowlist entry. The narrow server correction retains exact-origin/header checks; its new regression passed 1 test / 11 assertions after correcting expected error punctuation. Scratch-harness failures from stopped preview, hydration timing, a PHP BOM and prematurely checking logout were repaired. All 13 assertions subsequently passed; the final fixture teardown initially failed and was repaired separately without repeating browser assertions. No production certificate trust or cookie policy was weakened.

Review inline #4240836878 is addressed locally by a 250 ms successful challenge-response floor after admission and transaction commit, for both guest and account-claim creation. No lock is held during the bounded remaining wait, and decoys still have no booking binding/outbox. Four alternating-order synthetic samples per class passed 1 test / 84 assertions: warm real/wrong-surname/unknown-reference requests were approximately 258–260 ms; the first cold real request took 2729.82 ms. This hides ordinary enqueue work asymmetry, not cold-start, contention or remote statistical differences. Measured staging timing and edge admission remain required before exposure.

## Boundaries

Phase 12 contracts and Phase 13A local foundation remain the architectural baseline. Remote provider idempotency/acceptance/delivery, trusted proxy/edge attribution, scheduler supervision, initial administrator custody, staging TLS/secrets, paid infrastructure, DNS and production cutover remain deferred and unmet. Synthetic accepted-provider fixtures prove local authority transitions only. Receipt/itinerary consumers and booking mutations remain Phase 13D dependencies. Issue #1's five normative findings remain open with their existing 13D/13E/13F/13G owners.

No Actions, merge, Render provisioning, HostPapa release change, deployment or Phase 13C is authorized by this gate. PR #2 requires fresh independent review.
