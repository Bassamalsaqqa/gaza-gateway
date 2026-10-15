# Upgrade preflight incident — 2026-10-15

The attempted application upgrade to `96538d9affdc843d08ef3c801f15c7f92dfd46b3` stopped before activation. The original exception was discarded by the runner's generic catch. Its root cause has not been established; a later successful check cannot reconstruct that exception.

## Observed evidence

- Retained failure time: `2026-10-15T07:40:07+00:00`, stage `preflight`, checkpoint `active_release_and_schema`. Both maintenance fields were false.
- Installed baseline remained `b3afa9cf08fc746a9ff7e3e9fbee66c38244fb87`, release `rel_20261013T204811_b3afa9c_clean`, manifest SHA-256 `2c5f93cd4e1772a018e1f125575acdc8950f9678f879a9039e388186b58f42a0`. No target activation or upgrade attempt marker was observed.
- The private kit's later check log reported a successful baseline/candidate check. File modification times alone do not establish the full command chronology.
- An owner-authorized private read-only host probe completed at `2026-10-15T08:42:02Z` under CLI PHP 8.5.11. It verified all 6,687 immutable baseline private files, the manifest hash, and the same 21 exact ordered migration identities before and after the file scan. The scan took 0.4331 seconds. The same PDO connection succeeded afterward under a 60-second idle timeout. No mismatch or database error was observed.
- Host report `idle-diagnostic-report-20261015T084202Z-aa472e15.json` has SHA-256 `33b24b4106c945d42a77506f7f6634cb215977ffc1f7b77fc78723bbee404562`. The owner's repository-root copy matches the downloaded report.

The temporary diagnostic cron was guarded to run once and removed after execution. The existing application cron was left unchanged. The diagnostic did not alter application files, database records/schema, shared configuration, the release pointer or maintenance. Private diagnostic evidence remains retained.

## Interpretation and next step

At the recorded checkpoint, a baseline invocation can fail because the active pointer differs, the manifest migration inventory differs, the queried ledger identities differ, the earlier migration count differs, or the database query throws. The old receipt does not distinguish these conditions.

A forced local idle-expiration experiment produced a PDO failure (driver code 4031). That establishes a possible mechanism, not the cause of this host incident. The host probe did not reproduce it. Do not raise server timeouts, reconnect blindly, remove attempt markers, reset migrations or infer that a production upgrade succeeded.

Corrected operator tooling must preserve exact bindings and safety guards while recording a bounded reason code, precise substep and invocation identity. A newly reviewed and hashed kit must first pass focused local checks and rehearsal. Its application payload and operator-tooling provenance must be attributed separately if they differ. Run a new read-only host preflight before requesting final owner release GO; never edit the retained failed kit in place.

The observed existing application cron used a historical release wrapper at a ten-minute cadence. The published wrapper source at `7a8f0fa` resolves `current-release.txt`, so its historical pathname alone does not establish that it runs the old application. Its live wrapper bytes were not verified in this investigation. The cadence differs from previous documentation and requires separate owner-directed reconciliation. It is not evidence of the preflight failure and was not changed. The owner's one-minute HostPapa permission remains accepted.

This record authorizes no merge, deployment, production retry or cron change.
