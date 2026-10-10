# Phase 13B independent review disposition

Status: **In Progress / Changes Requested**. PR #2 remains draft. This record assigns open findings; it does not accept Phase 13B or close Issue #1.

Review: [PR #2 changes requested](https://github.com/Bassamalsaqqa/gaza-gateway/pull/2#pullrequestreview-5479158852), [anonymous bootstrap follow-up](https://github.com/Bassamalsaqqa/gaza-gateway/pull/2#pullrequestreview-5479690765), [roadmap ownership thread](https://github.com/Bassamalsaqqa/gaza-gateway/pull/2#discussion_r4238213069), [Issue #1](https://github.com/Bassamalsaqqa/gaza-gateway/issues/1). Inspected 2026-10-10: the follow-up regards the original bootstrap finding as substantively addressed in source; the later independent review accepts the narrow phase-ownership correction at `b8e86d642216d56fa815b80ea12e3f9def071dbe`. Integrated and staging gates remain pending, and the prior changes-requested disposition still applies. Codex has not resolved either inline thread on the reviewer's behalf.

## Current Phase 13B blockers

- Anonymous CSRF bootstrap admission and durable cleanup: source correction received a scoped positive independent follow-up; see [design and evidence](phase13b-bootstrap-admission.md). The thread remains open, with final integrated verification and measured proxy/edge admission behavior required before external exposure.
- Proof/outbox: shared primitives integrated at `1c9000c98fd645fb06bb0da913a137bd6b24d66e` after independent correction review. Mandatory pre-write reservations, failed-deletion accounting, owned test roots, bounded subprocess I/O and retained child locks replace the failing handback. The final narrowed PHP/PostgreSQL gate passed 5 tests / 29 assertions, including double erasure and a genuine two-process revocation/dispatch race; see [evidence and durability limits](phase13b-lifecycle-primitives.md). Full HTTP lifecycle, scheduled dispatch/cleanup wiring, final integrated certification and independent PR review remain pending. Local capture never proves provider acceptance.
- Passenger, staff MFA/directory, guest access/ownership HTTP lifecycles and EN/AR opt-in identity UI: incomplete. Existing persistence, command schemas and browser clients do not establish implemented routes.
- Guest/ownership write protection: explicit operation-bound Origin, CSRF, grant and ownership predicates must be verified before those routes are enabled. Existing middleware coverage of auth/staff routes is not evidence for future guest writes.
- Final integrated local gate: deferred until the complete Phase 13B head; require independently reproducible PHP/PostgreSQL, real races, HTTP/cookie and focused browser evidence with source/artifact provenance. Automatic GitHub Actions remain disabled.

## Issue #1 cross-phase findings

All five normative contract findings remain **OPEN**. Repair their machine contracts and persistence before activating the owning capability; this table is not a substitute for those repairs.

| Finding | Owning phase | Required correction and activation gate |
| --- | --- | --- |
| Source/snapshot uniqueness prevents code-only releases | 13E Editorial/Publications; additional 13G cutover gate | Before 13E publication activation, environment + source SHA + snapshot identity must allow unchanged content with changed code. Preserve immutable artifact receipts and test uniqueness/replay. Reverify the boundary at 13G cutover. |
| Sealed inactive snapshots can be publicly read | 13E Editorial/Publications; additional 13G cutover gate | Before 13E public snapshot activation, public reads require an activated or previously activated approved release. Separate authorized build/preview reads; knowing an inactive ID grants no public access. Test environment and approval binding before 13E activation and 13G cutover. |
| Provider refund identity and multiple captured payments | 13F Payments; additional 13G cutover gate | Before 13F payment activation, persist verified provider refund ID/account/original capture/amount/currency and deduplicated event binding. Completion requires reconciliation of all captured amounts, not the first successful refund. Provider sandbox/remote acceptance and 13G cutover remain separate gates. |
| One infant per adult and genuine adult linkage | 13D booking | Add partial uniqueness on `(booking_id, linked_adult_passenger_id)` for infants and durable adult-type enforcement. A same-booking FK alone is insufficient. Prove competing writers with PostgreSQL. |
| Genuine owner deployment approval | 13E Editorial/Publications; additional 13G deployment/cutover gate | Before 13E release approval or activation, require independent authenticated owner custody and approval bound to environment/release/source/artifact with expiry/replay controls. A client `ownerApproved: true` or ordinary staff permission is insufficient. Preserve separate owner authorization and live deployment evidence gates at 13G. |

Codex owns architectural closure and independent review; AGY implements bounded assignments. Phases 13C-G remain unstarted. No provisioning, DNS, credentials or deployment is authorized by this disposition.

## Acceptance attribution and resolved items

Owner-supplied conversation instructions authorized advancing Phase 12 source `7dab821d7d205b41ae925e013fe9c69a97a7e875` as accepted. The public Issue #1 record accepts the historical-status/CI Correction 01 specifically; it does **not** establish closure of the five contract findings above or a separate overall public acceptance. Historical source advancement remains recorded; overall independent acceptance attribution requires reconciliation. Do not infer that accepted-source headers resolved all findings.

The obsolete status guard was corrected at that SHA. The separate locked `source-map-js@1.2.2` fix reached main; GitHub reports Dependabot #1 fixed at `2026-10-09T20:04:35Z`, not dismissed. These resolved items do not close the other findings.

The Phase 8-11 HostPapa release remains `a47afded49e900b75c907e7230ca4dfef5b3f91e`, source `e1b4e3c62238357209990e80b00cc4635f621b76`. Live cPanel deployment remains unverified and owner-managed. Phase 13A local engineering acceptance remains `91a918caf0b22e565a43f52e46cf85ca4eb4825c`; remote staging gates remain deferred.
