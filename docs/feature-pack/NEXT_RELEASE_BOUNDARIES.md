# Next release: proposal and gates

This feature branch prepares source only. No production build, production ZIP,
remote staging, cron change, migration, deployment or GitHub Actions run is part
of the current authorization.

## Installed authority

The owner-recorded installed application is
`96538d9affdc843d08ef3c801f15c7f92dfd46b3`, release
`rel_20261015T042635_96538d9_clean`. Reverify the actual installed pointer,
retained manifest, immutable file hashes and migration identities before the next
upgrade. Neither historical `7a8` nor `b3_21` is a valid assumed next baseline.
An unexpected installed state stops preparation or execution.

Issue #15 remains a separate release gate: complete the read-only preservation
reconciliation against retained backups and legitimate post-deployment changes.
Do not rerun the October 15 upgrade, remove its attempt marker, reset data, or
create a replacement success receipt. Pending incident tooling in the owner's
root checkout is not silently included in this feature branch.

## Smallest owner workflow after source acceptance

1. Review the source and EN/AR local UX evidence; authorize integration separately.
2. Authorize release preparation. Produce one clean, exact-main full-stack ZIP,
   its manifest/hashes, and a locally rehearsed operator kit compatible with the
   verified installed `96538d9` baseline and the new guest schema.
3. Run one pinned read-only HostPapa preflight. Report its reason code if it
   fails, investigate that reason and do not retry blindly.
4. Present the exact artifact hashes, preservation evidence, backup coverage,
   rollback compatibility and remaining owner actions for explicit deployment GO.
5. After GO, execute the guarded one-shot update and certify it. Keep the single
   bounded existing dispatcher; do not change cadence or add another cron job.

The schedule batch must be previewed against actual staff authority and applied
through the existing authenticated, audited Admin API. It removes manual typing
of 40 schedules; it does not authorize overwriting staff edits or publishing live
data during local development. Include its exact proposed changes and partial
failure recovery in the release review.

## Permanent simplification to evaluate after this release

Use one stable private operator entry point that reads the installed release
manifest and verifies an explicit expected source SHA. A source-pinned package
declares supported upgrade/rollback compatibility and its own exact hashes.
Preparation generates the binding automatically from verified installed evidence,
instead of requiring the owner to edit historical baseline profiles by hand.

Keep preflight, backup verification, one-shot execution, rollback and final
certification distinct operations in that entry point. A failed operation retains
its marker and diagnostic reason. This is a proposal for a later bounded tooling
change, not permission to replace the reviewed operator or weaken any safeguard.
