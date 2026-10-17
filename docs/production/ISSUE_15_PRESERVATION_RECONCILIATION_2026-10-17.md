# Issue #15: bounded read-only preservation certification handback

Prepared 2026-10-17. Local validation completed at **2026-10-17T11:33:48.590457Z**. No production contact, SQL execution/import, archive extraction, data mutation, upgrade retry, marker removal, Git publication or issue modification was performed for this handback. No private inputs were sent to AGY.

## Disposition

The retained evidence supports **preservation of durable pre-upgrade records and shared configuration in the observed 2026-10-15 post-upgrade snapshot**. All baseline users/profiles, staff user, existing MVP reservation/passenger/seat claims, CMS, mail configuration/state, schedules and 21 migration rows were full-row matches. This is separate recovery evidence; the original invocation `e80037aa6b189e98` remains FAIL at final post-verification after MySQL HY000/4031. No success receipt is created or implied.

It does **not** certify current production database state, business validity of all subsequently added activity, or correctness of a future release/operator. Current source integration and corrected verifier acceptance remain separate gates.

## Immutable retained inputs independently checked

| Artifact | Result |
| --- | --- |
| Retained SQL dump | 859,173 bytes; SHA256 `8a574edbb7cda51ecb2985f38ef904e5a658174dbfb2eeaac8bcffb4f067a557` |
| Private archive | 25,629,729 bytes; SHA256 `c8e673ec825e45bbfbe6418d4e36c196a9f647a6f8e5a2ccf001b15263c8e38f` |
| Private archive readability | All 6,694 regular members read without extraction |
| Archived pointer | `rel_20261013T204811_b3afa9c_clean` (pre-upgrade baseline, not the current installed release) |
| Archived shared runtime environment | SHA256 `d6eae7b28fb16d471ffb972b6d548d38e67da89423d18ede0b4ae46904f39e2a`; exact equality with retained downloaded post-upgrade live environment bytes |
| Existing reconciliation summary | SHA256 `81275495dde7fcdc9c87e5c3138ae093e7b601d93e891afe322d3bb42dd057de` |

SQL contains 79 CREATE TABLE and 53 INSERT statements. The reviewed local parser accounts for explicit column lists, generated-column exclusions, NULLs and escaped literals; it builds hashes over every dumped column including primary keys. Timestamp fields are normalized to UTC in SELECT comparison. Five transient tables (cache, cache_locks, jobs, job_batches, failed_jobs) are excluded from durable comparison. No SQL dump was imported or executed.

## Snapshot results and exact bounds

Seven retained result captures cover **74 unique tables / 1,009 baseline rows / 1,014 observed live rows / 1,008 exact full-row matches**. The captures contain cumulative earlier results: all 180 repeated table entries agree. Independently aggregating their unique results reproduces the existing summary exactly.

| Table | Baseline | Observed live | Exact baseline matches | Delta |
| --- | ---: | ---: | ---: | --- |
| audit_events | 99 | 101 | 99 | 2 new rows; baseline preserved |
| security_rate_limits | 63 | 65 | 63 | 2 new rows; baseline preserved |
| staff_sessions | 4 | 5 | 4 | 1 new row; baseline preserved |
| passenger_sessions | 3 | 3 | 2 | 1 existing row differs |
| All other compared tables | 840 | 840 | 840 | None |

The separate passenger-session SELECT reports 3 retained baseline IDs, 3 unchanged fingerprints excluding `idle_expires_at`, `last_seen_at`, and `revoked_at`, and 1 session seen after the backup boundary. This is consistent with normal post-upgrade session activity/expiry, but the aggregate evidence does not identify which excluded field changed, associate the changed row with the later-activity row, or independently prove a revocation change legitimate. Do not describe every security delta as independently verified legitimate. Nothing was restored, deleted or rewritten to force equality.

The seven comparison captures were saved **2026-10-15T21:45:45Z through 21:52:51Z**, and the session capture at **21:53:56Z**. These are retained local file modification timestamps, not server-signed or transaction-wide observation times. The original summary was saved at **22:06:03Z**. Comparisons were bounded SELECT-only batches, not one atomic database snapshot. Their source hashes and precise saved times are in `scratch/issue15-local-evidence-validation-20261017.json`.

## Minimal remaining acceptance / next release requirements

1. An independent reviewer can accept the preserved durable baseline and matching shared environment as the historical incident reconciliation, explicitly retaining the session/additional-activity caveat and original FAIL. A current full rescan is unnecessary to prove what the retained snapshot already observed.
2. If acceptance requires affirmative security-delta attribution, obtain one additional **SELECT-only, count-only** session comparison distinguishing baseline `revoked_at`, `idle_expires_at`, and `last_seen_at` by baseline primary key, plus aggregate event/session provenance for added rows. Keep hash literals and all private data local; do not publish SQL fingerprints. Current results may include further legitimate activity and must not be coerced to the old counts. No maintenance, locks or mutations are needed for this diagnostic. This follow-up has not been executed.
3. Before any new release, perform its own freshly pinned, read-only installed-baseline preflight against actual application **96538d9affdc843d08ef3c801f15c7f92dfd46b3**, retained active manifest/bytes and exact migration ledger. Recheck actual public-directory modes and resource headroom. The old b3 archive proves historical provenance only; it must never be rebound as the next updater baseline.
4. Independently review/integrate the MySQL lifecycle fix: create a fresh PDO only at final read-only comparison boundary, verify database and database-user identity, reject replacement of an active transaction, and preserve all checks/locks/backup/one-shot safeguards. Installer must preserve the outer maintenance owner through nested switch/rollback. Neither source correction nor a later passing rehearsal retroactively changes the original result.
5. Keep source acceptance/integration, historical certification disposition, final exact-source candidate/rehearsal/read-only preflight, and final owner deployment GO distinct. The old 87.4 MiB preparation ZIP is superseded by the newly required corrections.

## Evidence locations (private/local)

- `scratch/production-incident-20261015/live-reconciliation-1.json` through `live-reconciliation-7.json`
- `scratch/production-incident-20261015/live-session-delta.json`
- `scratch/production-incident-20261015/reconciliation-summary.json`
- `scratch/production-incident-20261015/reconcile.py`, `reconcile-*.sql`, `summarize.py`
- `scratch/issue15-local-evidence-validation-20261017.json` (new sanitized local validation receipt)

The private dump, environment, archive and hash-bearing SQL remain outside source control and AGY workspaces. This document contains counts and artifact digests only; it must not be represented as a production upgrade success receipt.
