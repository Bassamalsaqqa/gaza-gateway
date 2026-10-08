# Focused regression and CI policy

Phase 10 — **Complete / Accepted Source** at `277e07a29188ab5ca07df008c011f42ec964641b`. The implementation evidence below records its original review checkpoint.
Baseline: accepted Phase 9 `f3d7377720c951ea659c076d2e8128d10c1a827a`.
No application behavior, persistence schema, documentary policy or deployment controls change here.

## Assessment and scope

The accepted repository had no GitHub Actions workflows or protected branches. Its unit command depended on a shell glob; browser filtering could return success with zero checks. The comprehensive browser file also mixed old checks with current journeys, duplicated browser startup and relied on wall-clock dates and external fonts. Some historical CMS checks still referred to the pre-Phase-7 Travel field. Existing domain coverage and the accepted legacy freeze remain valuable; they are retained rather than replaced with another set of parallel assertions.

Explicit domain inventories now drive portable unit commands, including a guard against unassigned new files. Stable check IDs select existing browser assertions without copying their implementation. Cross-system journeys remain in their original modules. Historical matrices stay optional evidence tools; they are not routine CI gates.

## Choose the smallest useful command

| Purpose | Command / authority |
| --- | --- |
| Booking rules, command/storage behavior, pricing/capacity | `npm run test:unit:booking` |
| Current services, Fleet, Network, Schedules and operations | `npm run test:unit:operations` |
| Passenger account, drafts, migration and compatibility | `npm run test:unit:passenger` |
| Staff/session, customers, activity, contact, settings | `npm run test:unit:admin` |
| Content schemas, storage, CMS editing and publication boundaries | `npm run test:unit:content` |
| Archive rights, provenance, draft proposals and editor validation | `npm run test:unit:archive` |
| Localization, media, visual grammar and Studio contracts | `npm run test:unit:ui` |
| Selection, CI scope and harness safeguards | `npm run test:unit:tooling` |
| Inventory without executing tests | `npm run test:unit:list -- booking` |
| Public booking, Manage/pass, account and contact journeys | `npm run test:smoke:public` |
| Counter, operations, staff/claim/audit and session failures | `npm run test:smoke:admin` |
| CMS save/failure/viewer/local-preview separation | `npm run test:smoke:cms` |
| Documentary gallery/provenance and archive administration | `npm run test:smoke:archive` |
| Main/manual checkpoint: selected cross-system journeys | `npm run test:smoke:critical` |
| Comprehensive milestone gates | `npm test`; `npm run test:smoke` |
| Visual/responsive certification | Existing Phase 8/9 and Phase 6C capture scripts, when affected |
| Static package integrity | `npm run build:hostpapa`; `npm run hostpapa:prepare`; `npm run hostpapa:verify` |
| Future backend contracts | Deferred to Phase 13; no fake backend certification |

Unit/domain and repository/storage tests coexist in the domain groups. Migration cases are kept alongside their owning passenger/draft/storage tests. Some cross-domain files belong to more than one group; the selector runs their union once. `npm test` includes all registered unit and tooling tests. Tiny corrections do not require every group.

Historical Phase 6 deployment assertions read the immutable `f5506a2…` milestone instead of demanding old production headers in living docs. Current source/production status is guarded separately by `network-status.test.ts`. The quality checkout therefore fetches complete Git history, also needed by the accepted Phase 7/7B boundary comparisons.

Browser commands require a prior static build. A filter is available for a single failed check, e.g. `npm run test:smoke:cms -- --filter="14. Travel"`. A typo/empty filter that matches nothing fails. `--url=http://127.0.0.1:4173` targets an already running preview. CLI options/groups must be explicit; unknown arguments fail.

## Deterministic browser boundary

The selected smoke entry point installs `TEST_NOW` before importing fixture modules; the default is `2026-10-08T09:00:00.000Z`, in UTC. Tests can explicitly change that clock to exercise another date. Browser contexts get the same clock, private storage and blocked service workers. Existing station-timezone policies still run normally. Monotonic elapsed-time measurement is independent of the fixture clock. Fixture init functions only run on the application origin, avoiding invalid Storage access on `about:blank`.

`SMOKE_BROWSER=chromium` selects the Playwright-managed browser in Linux CI. Install it with `npm exec playwright-core install --with-deps chromium`. Local commands prefer installed Edge/Chrome and then Chromium. Browser availability fallback is not a test retry. There are no assertion retries or increased timeouts.

Google Fonts responses are explicitly replaced with empty CSS so accepted fallback fonts render without network dependency. YouTube frames receive an inert test document: embed URL, disclosure and lazy-loading assertions remain, but remote video playback is not certified. All other external requests fail the harness. Runtime page errors fail the gate. Public assets still load from the real local package. External font/video rendering can be checked manually if that integration changes; this is not an external-service availability test.

The legacy comprehensive file still contains historical scenarios and some shared-context steps. Selective groups use independent contexts for substantive mutations; the complete milestone command is retained, not claimed to be entirely refactored. Legacy standalone matrix/task scripts remain usable but are not all CI browser entry points.

## GitHub Actions

`.github/workflows/ci.yml` runs on main, phase feature pushes, main PRs and manual dispatch. Only root/documentation Markdown changes are classified as docs-only. Unknown paths, workflows, tests, dependencies and scripts fail safe to the application gate. Scope errors fail the workflow. The stable **Quality gate** is always present: docs-only runs check provenance and clean diffs without installing application dependencies; code changes run lockfile install, typecheck, lint (existing ceiling 56), all unit/tooling tests, application build, static build and package prepare/verify. Generated source changes fail rather than being silently committed.

The focused critical browser job runs for meaningful main changes, manual requests, and this Phase 10 bootstrap branch to prove Linux execution. It does not run on every later feature or docs-only push. Node `24.12.0` and official Actions commit SHAs are pinned; token permissions are read-only and checkout credentials are not retained. Failure logs are retained for seven days. Local QA is reported separately from actual Actions results.

`.github/workflows/hostpapa-audit.yml` is a weekly/manual read-only audit of the existing static branch, also run on this Phase 10 bootstrap branch. It exports Git's static tree without checkout metadata and checks manifest/shells/assets/contamination and that packaged source belongs to main. It performs no install, application tests, build, commit or deployment. Scheduled/manual default-branch workflows become available after accepted Phase 10 publication to main; the static branch intentionally contains no source workflow files.

## Git governance

Main and HostPapa protection should reject deletion and force pushes and require linear history. Main's selected required check is **Quality gate**. No automatic PR-review requirement is imposed on the existing independent ChatGPT review + linear publication process. The owner/admin retains emergency bypass for ordinary publication/recovery; that does not authorize history rewriting. HostPapa cannot require source CI statuses that are absent from its static-only commits. Release packaging must pass before an owner-authorized linear release push.

Configured active rulesets: [history protection 24698077](https://github.com/Bassamalsaqqa/gaza-gateway/rules/24698077) covers main and HostPapa with no bypass; [main quality gate 24698079](https://github.com/Bassamalsaqqa/gaza-gateway/rules/24698079) requires **Quality gate** from GitHub Actions (integration 15368), with repository-admin bypass. Administrators can change a rule for emergency recovery; no force push or deletion was attempted as a verification technique. Inspect enforcement with `gh api repos/Bassamalsaqqa/gaza-gateway/rulesets` (then each returned ID). Protections are repository settings and do not change branch refs.

## Verification cadence

During implementation run the affected domain, failed check and relevant type/lint checks. At a material review checkpoint use one coherent quality gate. At release, verify the frozen source/package and affected journeys; copying an already verified package does not justify another full suite. Diagnose a failed assertion before rerunning it. No masks, arbitrary retries, skipped failing checks or timeouts increased to obtain green.

## Phase 10 local implementation evidence

Focused checks: 15 tooling tests, 74 archive-domain tests and 5 documentation/provenance tests passed. The stabilized critical selection passed 13/13 (its archive-administration entry contains nine substantive subchecks); CMS passed 7/7. Typecheck passed; lint remained 0 errors / 56 existing warnings. Static build produced 46 prerendered pages; package verification inspected 531 site files and 199 referenced assets without missing references. Application/full-unit Linux execution is recorded by actual GitHub Actions, separately from this local evidence.

Failures were investigated rather than retried blindly: the initial critical run had a stale `#tr-title` assertion plus an `about:blank` fixture Storage error. The first CMS group failed two historical checks: obsolete save-error/destination selectors, then an ambiguous pair of draft buttons, then a premature read of the SSR image before runtime draft adoption. Only those assertions/fixtures were corrected; isolated rechecks passed, followed by the stabilized group. No application source was changed and no timeout was raised. A patch context mismatch and one interrupted tool session were operational failures, not passing QA.

AGY was assigned the isolated portable unit-runner task. Its first process was interrupted without a handback; a second attempt was stopped after approximately twelve minutes without delivered edits/report. No AGY code or verification claim was integrated. Codex implemented and independently tested that bounded tooling instead. AGY's lack of a handback is not represented as successful review evidence.

The first Linux CI run found 5 unit/provenance failures (1140 passed): shallow checkout omitted historical Git objects and legacy status guards demanded obsolete current headers. Focused correction preserved all historical assertions against their immutable snapshot and enabled full-history checkout; its 70-test group passed locally. Managed Chromium's first browser log was 11/13, while `tee` incorrectly concealed the failing process exit. CI now uses explicit Bash pipefail and an intentional failing-process probe to certify failure propagation. The two failed browser assertions now await actual modal focus return and canonical reply-draft persistence/rendering; no assertions are skipped and no existing timeout is increased. Actual final Actions outcomes are linked in the phase handback, not inferred from the initial misleading job status.

The second Linux run passed the quality gate but correctly failed browser CI at 12/13: Contact submission typed into visible server-rendered inputs before React hydration. The existing controlled-handler readiness check now runs before Contact typing. Its isolated local journey passed; CI was rerun against the pushed correction. This wait preserves the original success, stored-message and inbox assertions without increasing timeouts.
