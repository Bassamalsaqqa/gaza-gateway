# Phase 13B independent review disposition

Status: **In Progress / Changes Requested**. PR #2 remains draft. This record assigns open findings; it does not accept Phase 13B or close Issue #1.

Review: [PR #2 changes requested](https://github.com/Bassamalsaqqa/gaza-gateway/pull/2#pullrequestreview-5479158852), [anonymous bootstrap admission thread](https://github.com/Bassamalsaqqa/gaza-gateway/pull/2#discussion_r4237821053), [Issue #1](https://github.com/Bassamalsaqqa/gaza-gateway/issues/1). Inspected 2026-10-10: one review submission and one unresolved inline thread; no PR issue comments at inspection.

## Current Phase 13B blockers

- Anonymous CSRF bootstrap admission and durable cleanup: bounded correction under independent verification; see [design and evidence](phase13b-bootstrap-admission.md). The thread remains open until evidence-backed review.
- Proof/outbox: excluded. Independent double-deletion failure left a newly written raw capture without durable retention accounting. A passing package suite did not close that failure. Mandatory pre-write reservations, accounting for every failed deletion, owned test roots and bounded subprocesses are required before integration.
- Passenger, staff MFA/directory, guest access/ownership HTTP lifecycles and EN/AR opt-in identity UI: incomplete. Existing persistence, command schemas and browser clients do not establish implemented routes.
- Guest/ownership write protection: explicit operation-bound Origin, CSRF, grant and ownership predicates must be verified before those routes are enabled. Existing middleware coverage of auth/staff routes is not evidence for future guest writes.
- Final integrated local gate: deferred until the complete Phase 13B head; require independently reproducible PHP/PostgreSQL, real races, HTTP/cookie and focused browser evidence with source/artifact provenance. Automatic GitHub Actions remain disabled.

## Issue #1 cross-phase findings

All five normative contract findings remain **OPEN**. Repair their machine contracts and persistence before activating the owning capability; this table is not a substitute for those repairs.

| Finding | Owning phase | Required correction and activation gate |
| --- | --- | --- |
| Source/snapshot uniqueness prevents code-only releases | 13G publication | Environment + source SHA + snapshot identity must allow unchanged content with changed code. Preserve immutable artifact receipts and test uniqueness/replay. |
| Sealed inactive snapshots can be publicly read | 13G publication | Public reads require an activated or previously activated approved release. Separate authorized build/preview reads; knowing an inactive ID grants no public access. Test environment and approval binding. |
| Provider refund identity and multiple captured payments | 13E payments | Persist verified provider refund ID/account/original capture/amount/currency and deduplicated event binding. Completion requires reconciliation of all captured amounts, not the first successful refund. Provider sandbox/remote acceptance remains a separate gate. |
| One infant per adult and genuine adult linkage | 13D booking | Add partial uniqueness on `(booking_id, linked_adult_passenger_id)` for infants and durable adult-type enforcement. A same-booking FK alone is insufficient. Prove competing writers with PostgreSQL. |
| Genuine owner deployment approval | 13G publication/deployment | A client `ownerApproved: true` or ordinary staff permission is insufficient. Require independent authenticated owner custody and approval bound to environment/release/source/artifact with expiry/replay controls. Preserve separate live deployment evidence gates. |

Codex owns architectural closure and independent review; AGY implements bounded assignments. Phases 13C-G remain unstarted. No provisioning, DNS, credentials or deployment is authorized by this disposition.

## Acceptance attribution and resolved items

Owner-supplied conversation instructions authorized advancing Phase 12 source `7dab821d7d205b41ae925e013fe9c69a97a7e875` as accepted. The public Issue #1 record accepts the historical-status/CI Correction 01 specifically; it does **not** establish closure of the five contract findings above or a separate overall public acceptance. Historical source advancement remains recorded; overall independent acceptance attribution requires reconciliation. Do not infer that accepted-source headers resolved all findings.

The obsolete status guard was corrected at that SHA. The separate locked `source-map-js@1.2.2` fix reached main; GitHub reports Dependabot #1 fixed at `2026-10-09T20:04:35Z`, not dismissed. These resolved items do not close the other findings.

The Phase 8-11 HostPapa release remains `a47afded49e900b75c907e7230ca4dfef5b3f91e`, source `e1b4e3c62238357209990e80b00cc4635f621b76`. Live cPanel deployment remains unverified and owner-managed. Phase 13A local engineering acceptance remains `91a918caf0b22e565a43f52e46cf85ca4eb4825c`; remote staging gates remain deferred.
