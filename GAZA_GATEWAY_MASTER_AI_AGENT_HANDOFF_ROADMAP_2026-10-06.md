# Gaza Gateway / Gaza International Airport
# Master AI-Agent Handoff, Engineering Roadmap & Production Plan

**Authoritative planning snapshot:** 2026-10-06\
**Repository:** `github.com/Bassamalsaqqa/gaza-gateway`\
**Production site:** `https://www.gazaairport.com`\
**Hosting:** HostPapa / cPanel static deployment\
**Product Owner:** Bassam Alsaqqa\
**Primary implementation worker:** Codex\
**Secondary implementation / browser / visual worker:** AGY / Antigravity\
**Architect / independent reviewer / QA authority / roadmap keeper:** the supervising AI agent / ChatGPT role described below

---

# 0. How to use this file

This file is intended to let a capable AI engineering agent take over day-to-day orchestration of the Gaza Gateway project without requiring Bassam to micromanage implementation details.

The agent should:

1. independently verify Git and source before making phase decisions;
2. own architecture, decomposition, implementation prompts, review, corrections, and roadmap status;
3. use Codex as the primary bounded coding worker;
4. use AGY / Antigravity when browser, visual, responsive, or secondary implementation proof is useful;
5. escalate to Bassam only for genuine product decisions, visual direction decisions, publication/rights decisions, material scope changes, or final owner deployment;
6. never treat a worker report, screenshot, test count, PR description, or AI review as acceptance by itself;
7. proceed phase-by-phase using the review gates in this file rather than asking Bassam to supervise individual files, tests, or corrections.

This file supersedes older handoffs when they conflict with the verified checkpoint recorded here.

---

# 1. One-page current brief

## Current independent verdict

**Phase 6B2C2B — Canonical Dated-Service Discovery & Booking Cutover**

**ENGINEERING ACCEPTED**

Accepted engineering SHA:

`b4cd96a3eda97ae1442119c4fde03c0a463c7cb4`

This is Correction 01 on top of the original implementation:

- original implementation: `ff46f8e7ab606731be679eaedbada9e07d09e91a`
- Correction 01 / accepted engineering: `b4cd96a3eda97ae1442119c4fde03c0a463c7cb4`
- accepted C2A baseline / current `main`: `412fc2b4f79e01da0607b5bca44e01d76156a634`

Independent review verified that Correction 01 fixes the three blocking findings:

1. confirmed-PNR fallback is now **booking-specific** by `(PNR, leg)`, preventing two PNRs with the same stable `svc1-*` service ID from borrowing each other's historical Flight snapshot;
2. Admin Check-in has a bounded confirmed-PNR compatibility read during Schedule/Network authority failure while public/new-sale discovery continues to fail truthfully;
3. cancelled PNRs retain their own history but cannot independently resurrect retired compatibility-only Flights on operational/public boards.

No remaining engineering blocker was found in the Correction 01 delta.

## Important evidence boundary

The worker reports:

- focused tests: `33/33`;
- full units: `906/906`, 168 suites;
- typecheck passed;
- lint: 0 errors / 56 existing warnings;
- focused EN/AR browser: `4/4`;
- full smoke: `132/132`;
- application/static builds passed;
- HostPapa prepare/verify passed;
- 521 packaged files, 46 HTML pages, 193 references, zero missing.

These are **local worker QA results**, not GitHub CI results.

GitHub independently reports for the accepted engineering SHA:

- `0` check runs;
- `0` commit statuses;
- `0` Actions runs;
- no PR associated with the SHA.

The supervising reviewer independently verified source, tests, exact commit ancestry, branch refs, diff scope, failure semantics, and repository architecture through the connected GitHub repository. A separate local clone/rerun could not be performed in the reviewer sandbox because outbound DNS access to GitHub was unavailable. Do not misrepresent the local worker suite as independently rerun CI.

## Exact current Git checkpoint

As of this handoff:

- `main` = `412fc2b4f79e01da0607b5bca44e01d76156a634`
- `origin/main` = same
- feature branch `phase6b2c2b/discovery-booking-cutover` = `b4cd96a3eda97ae1442119c4fde03c0a463c7cb4`
- feature branch is 2 commits ahead / 0 behind `main`
- `hostpapa-deploy` = `2751e22be91ad74eacc9213489a57a21baf04807`
- current production runtime source = `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`
- current owner-deployed production phase = **Phase 6B2A**

Production intentionally lags accepted source engineering.

## Immediate next action

Do **not** start Phase 6C yet.

Perform **Phase 6B2C2B Accepted-Source Finalization**:

- baseline: `b4cd96a3eda97ae1442119c4fde03c0a463c7cb4`
- same feature branch
- documentation/status-test reconciliation only
- zero runtime behavior changes
- record C2B engineering acceptance at `b4cd96a3...`
- mark Phase 6B2C2B `Complete / Accepted Source`
- because C2B closes the remaining 6B engineering lane, mark **Phase 6B as Complete / Accepted Source**
- commit and push
- fast-forward `main` to the finalization SHA only after independent verification
- no merge commit, squash, rebase, force push, HostPapa movement, release, or deployment during finalization

After that, create and independently review a **consolidated Phase 6B HostPapa release** before beginning Phase 6C.

That consolidated release should bring the currently unreleased accepted-source work to production in one controlled milestone:

- Phase 6B2B Fleet authority
- Phase 6B2C1 Network authority
- Phase 6B2C2A dated-service foundation
- Phase 6B2C2B current discovery/booking cutover

The deliberate release postponement has served its purpose. Continuing into 6C while production remains four authority migrations behind source would unnecessarily enlarge the future release blast radius.

---

# 2. Roles and decision authority

## Bassam — Product Owner

Bassam owns:

- business and product requirements;
- brand and visual direction;
- owner-provided media;
- historical/publication decisions;
- rights/publication authorization;
- acceptance of product direction;
- material scope decisions;
- final manual production deployment;
- final business judgment.

The statement **“I deployed”** is authoritative for the fact that Bassam performed the manual deployment, but source/release provenance must still be independently verified afterward.

Bassam should not be asked to supervise implementation details such as individual functions, fixture changes, test repairs, query keys, refactoring strategy, or correction numbering unless a decision has product consequences.

## Supervising AI agent — Architect / Independent Reviewer / QA Authority

The supervising agent owns:

- architecture;
- phase boundaries;
- decomposition of risky phases;
- canonical domain authority decisions;
- Git/source verification;
- independent worker review;
- correction briefs;
- engineering acceptance;
- accepted-source acceptance;
- release-review decisions;
- roadmap/status truth;
- continuity handoffs;
- Codex/AGY implementation prompts;
- scope control;
- duplicate-authority prevention;
- truthfulness of production claims.

The agent should be skeptical by default.

It must not accept:

- worker summaries alone;
- test counts alone;
- screenshots alone;
- PR descriptions alone;
- bot reviews alone;
- “everything passed” claims without source inspection.

## Codex — Primary bounded implementation worker

Codex should:

- receive an exact baseline SHA;
- work on a named feature branch;
- implement only the requested phase/correction;
- write/repair tests;
- run required local gates;
- commit;
- push;
- provide exact handback and attempt history;
- stop for independent review.

Codex must never self-authorize:

- engineering acceptance;
- merge/main movement;
- accepted-source status;
- release acceptance;
- production deployment.

A reviewable implementation must be committed and pushed before handback.

## AGY / Antigravity — Secondary worker

Use AGY for:

- browser verification;
- responsive inspection;
- visual QA;
- finalization support;
- secondary implementation tasks;
- live UI inspection;
- independent proof where helpful.

AGY is not an acceptance authority.

If AGY changes code, its exact pushed Git source must be reviewed under the same rules as Codex.

---

# 3. Autonomous operating model — minimize owner micromanagement

The supervising AI agent is authorized to make ordinary engineering decisions inside the approved product/architecture direction.

## The agent may proceed without asking Bassam for:

- implementation decomposition;
- naming of internal helpers;
- repository/service/query structure consistent with existing architecture;
- test strategy;
- bug fixes;
- correction loops;
- performance refactoring that preserves behavior;
- accessibility fixes;
- responsive corrections;
- documentation reconciliation;
- phase-internal sequencing;
- choosing Codex vs AGY for implementation/validation;
- rejecting worker work that violates contracts.

## The agent should ask Bassam only when:

- a new product feature is proposed;
- the visible UX direction materially changes;
- a historical/media publication decision is required;
- rights/provenance treatment changes;
- scope meaningfully expands;
- existing product behavior has two legitimate business interpretations;
- a destructive data migration is genuinely required;
- a production deployment needs owner execution;
- a real external integration creates cost, credentials, legal, privacy, or operational obligations.

## Default behavior

If a phase is large, decompose it internally and proceed through bounded subphases.

Do not ask Bassam to choose between low-level implementation alternatives unless they produce meaningfully different product outcomes.

At the end of each **large phase**, provide Bassam a concise executive status:

- what changed;
- what was independently verified;
- accepted SHA;
- what remains;
- whether production changed;
- next major phase.

---

# 4. Standard engineering lifecycle

Every significant phase follows this lifecycle.

## Gate 1 — Architecture / source audit

Before implementation:

- verify exact `main`;
- verify exact release branch;
- inspect exact-ref source;
- identify current authorities;
- identify forbidden duplicate authorities;
- define failure semantics;
- define compatibility requirements;
- define explicit exclusions.

## Gate 2 — Bounded implementation prompt

A worker brief must contain:

- exact baseline SHA;
- exact branch;
- objective;
- authority model;
- required behavior;
- failure semantics;
- explicit exclusions;
- expected runtime surfaces;
- unit/browser/visual gates;
- Git boundaries;
- handback requirements.

## Gate 3 — Worker implementation

Worker:

- implements;
- tests;
- commits;
- pushes;
- stops.

No merge or deployment.

## Gate 4 — Independent engineering review

The supervising agent independently checks:

- branch heads;
- parent SHA;
- merge base;
- ahead/behind;
- changed-file scope;
- exact runtime implementation;
- authority ownership;
- failure handling;
- compatibility paths;
- tests and source guards;
- GitHub statuses/checks/Actions;
- PR/bot review evidence if a PR exists;
- phase boundary.

If defects exist, issue `Correction 01`, `Correction 02`, etc.

Each correction:

- stays on the same feature branch unless there is a deliberate reason otherwise;
- has the exact reviewed parent;
- is committed and pushed;
- does not move `main`;
- does not move HostPapa;
- stops for independent review.

## Gate 5 — Engineering acceptance

Only after independent review:

**ENGINEERING ACCEPTED**

Record exact engineering SHA.

Engineering acceptance is not yet accepted source.

## Gate 6 — Accepted-source finalization

Finalization is deliberately boring.

Allowed:

- documentation status reconciliation;
- roadmap reconciliation;
- bounded status/source-guard test updates;
- acceptance SHA recording.

Not allowed:

- new runtime feature behavior;
- opportunistic refactoring;
- UI redesign;
- new scope.

Then:

- commit finalization;
- push feature;
- independently inspect finalization diff;
- verify engineering SHA is ancestor;
- verify no unauthorized runtime changes;
- fast-forward `main`;
- no merge commit;
- no squash;
- no rebase;
- no force push.

Then record:

**Complete / Accepted Source**

## Gate 7 — Release

When a release milestone is authorized:

- start from exact Accepted Source;
- clean build;
- static/prerender build;
- HostPapa prepare;
- HostPapa verify;
- package inventory;
- reference audit;
- contamination audit;
- `SOURCE_COMMIT.txt`;
- linear release commit on `hostpapa-deploy`;
- independent release review.

Only after accepted release should Bassam deploy.

## Gate 8 — Owner deployment / production reconciliation

After Bassam deploys:

- verify source/release provenance;
- perform live browser verification where possible;
- reconcile production status in docs;
- keep post-deployment reconciliation docs-only unless a real production defect is discovered.

---

# 5. Git governance

## Never

- force push accepted history;
- rewrite accepted commits;
- silently rebase accepted work;
- merge implementation before independent review;
- move `hostpapa-deploy` during ordinary engineering;
- deploy from a feature branch;
- claim production changed because `main` changed;
- claim CI passed when only local tests ran.

## Branch meanings

- `main` = Accepted Source line.
- `hostpapa-deploy` = Accepted Release / production artifact line.
- production may intentionally lag `main`.

## Important governance weakness to address

GitHub currently reports `main`, the current feature branch, and `hostpapa-deploy` as **not GitHub-protected branches**.

They are process-protected by our workflow, not platform-enforced.

For a more autonomous agent workflow, enable GitHub branch/ruleset protection when practical:

- prohibit force pushes;
- restrict direct writes to `main`;
- restrict direct writes to `hostpapa-deploy`;
- require review or an approved release workflow where appropriate;
- add lightweight GitHub Actions for at least typecheck/unit/build if hosting/workflow cost is acceptable.

Until then, the supervising AI agent must treat process controls as mandatory because GitHub itself is not enforcing them.

---

# 6. Product identity and non-negotiable truth

Product:

**Gaza International Airport (GZA) / Palestinian Airlines (PS) digital prototype**

Core stack:

- React 19
- TypeScript
- TanStack Router
- TanStack Query
- Vite
- Tailwind CSS 4
- Radix-based UI primitives
- Node native tests
- Playwright-core/browser smoke
- static/prerender HostPapa output

The current product is intentionally browser-local.

It does **not** currently have a real:

- backend database;
- GDS;
- payment gateway;
- production authentication server;
- staff directory server;
- passenger auth backend;
- SMTP transport;
- production CMS server;
- server-side seat inventory;
- persistent generated Flight-instance database.

The UI and documentation must never pretend these capabilities exist.

---

# 7. Visual / UX / content direction

## Visual identity

Target:

- premium;
- calm;
- dignified;
- Palestinian / Mediterranean aviation identity;
- technically credible;
- culturally grounded;
- historically responsible.

Avoid generic SaaS/startup appearance.

Core visual language:

- deep olive / dark green;
- ink;
- limestone / sand;
- warm neutrals;
- clay/red;
- brass/gold accents.

Typography:

- Bricolage Grotesque
- Manrope
- IBM Plex Sans Arabic
- IBM Plex Mono for technical identifiers

## Language

Arabic quality is first-class.

Requirements:

- EN/AR parity;
- correct RTL;
- technical IDs remain LTR;
- do not place Arabic and English labels side-by-side merely to show both languages.

Technical LTR examples:

- Flight IDs;
- PNRs;
- registrations;
- aircraft IDs;
- Schedule IDs;
- seat codes.

## Responsive targets

Normal certification should include at least:

- 390px
- 768px
- 1440px

Phase 9 expands this to a broader 320px–1920px certification.

## Booking UI

Owner-approved direction:

- slim premium aviation search console;
- deliberately designed desktop/tablet/mobile layouts;
- not generic stacked form cards.

## Admin UI

Direction:

- aviation operations/control-panel feel;
- dense but readable;
- calm;
- strong operational status hierarchy;
- proper Arabic/English separation;
- responsive.

Do not wholesale-redesign accepted surfaces outside a phase explicitly dedicated to visual finalization.

---

# 8. Historical media / archive requirements

Do not regress the accepted documentary work.

HC-3 established:

- 67 canonical archive records;
- 58 owner intake records;
- 8 video intake records;
- 1 Gisha ruins record;
- 37 published photographs;
- 1 owner-directed document;
- 4 verified external video references;
- 124 responsive WebP derivatives.

Publication bases include:

- `rights-cleared`
- `product-owner-directed-display`
- `external-embed`

Important accepted areas include:

- Home
- Airport Overview
- Airport Past
- Airport Present
- Airport Future
- Gallery
- archive video section
- historical documentary strips

Never replace documentary assets with generic stock or AI imagery.

Phase 7B may improve media administration, but it must preserve provenance and truth classification.

---

# 9. Canonical authorities and browser stores

The governing principle is:

> **One authoritative domain owner for each fact.**

## `gza.repo.v1`

Canonical:

- Bookings
- Flight operational overrides

Owners:

- BookingRepository
- FlightRepository

## `gza.passenger.v1`

Canonical:

- local passenger/account state;
- profile;
- travelers.

Owner:

- PassengerRepository

## `gza.booking.draft.v1`

Canonical:

- active booking wizard draft.

Owner:

- BookingDraftRepository

## `gza.commercial.v1`

Canonical:

- fare products/configuration;
- cabin multipliers;
- baggage pricing/configuration;
- meals;
- assistance;
- default meal;
- active/retired commercial-service lifecycle.

Owner:

- CommercialCatalogRepository

Historical confirmed pricing:

- BookingPricingSnapshot

## `gza.fleet.v1`

Canonical:

- aircraft identity;
- registration;
- active lifecycle;
- seat geometry;
- cabin zones;
- extra-legroom classification;
- structural unavailable seats.

Owner:

- FleetRepository

Derived:

- capacity;
- supported cabins.

Historical confirmed physical geometry:

- BookingSeatLayouts snapshot

## `gza.network.v1`

Canonical operational network reference:

- code;
- airport names EN/AR;
- city EN/AR;
- country EN/AR;
- timezone;
- block minutes;
- active lifecycle.

Owner:

- NetworkRepository

Network does **not** own:

- pricing;
- recurring days;
- frequency;
- CMS copy;
- SEO;
- media;
- aircraft.

## `gza.schedule.v1`

Canonical recurring planning:

- Schedule identity;
- flight number;
- direction;
- destination;
- weekdays;
- times;
- aircraft linkage/snapshot;
- effective range;
- active lifecycle;
- structured exceptions.

Owner:

- ScheduleRepository

Schedule IDs, destination, and direction are immutable after creation.

No destructive Schedule deletion.

`active=false` is retirement.

## Dated current Flight authority

No persistent `gza.flight-instance.v1` exists.

Current dated base Flight is derived:

`Schedule + Network + date + route merchandising price`
→ pure dated-service projection

Then:

`FlightOverride`
→ effective operational Flight

Stable ID:

`svc1-<base64url exact UTF-8 Schedule ID>-YYYY-MM-DD`

Identity does not depend on:

- flight number;
- time;
- aircraft;
- route display name.

## Existing PNR compatibility

For one Booking leg:

1. current canonical dated service if it still resolves;
2. otherwise **that exact Booking leg's stored Flight snapshot**;
3. current matching FlightOverride overlays either base.

Do not globally deduplicate PNR history to determine a passenger's Flight facts.

## Operational board compatibility

Board relevance is composed from:

1. current Schedule-derived services;
2. confirmed-PNR Flight snapshots for the date;
3. explicit relevant legacy override-only Flights.

Cancelled PNRs retain history but do not independently resurrect a retired Flight.

## `gza.contact.v1`

Canonical local contact workflow and Admin Inbox.

Owner:

- ContactRepository

## `gza.settings.draft.v1`

Canonical settings/contact/appearance drafts.

Owner:

- SettingsRepository

## `gza.content.draft.v1`

Canonical editorial drafts.

Owner:

- ContentRepository

## `gza.admin.v1`

Staff/session simulation only.

Do not put product-domain state back into AdminProvider.

## `gza.store.v1`

Closed legacy migration source.

No new writers.

## `gza.skin.preview.v1`

Dormant/legacy preview fallback.

---

# 10. Completed roadmap through the current phase

| Phase | Status | Summary / checkpoint |
|---|---|---|
| 0 / 0.1 | Complete | Baseline audit, accuracy and semantic lint gate. |
| 1 | Complete | HostPapa static/prerender architecture, 46-page static output. |
| 2 | Complete | Visual design-system certification and typography/token system. |
| 3A / Design Shaping / 3B | Complete | Whole-product audits, design direction, component/interaction modernization. |
| 3.9 / 3.9.1 | Complete | Truth reset, regression foundation, booking correctness, flight-detail bookability. |
| 4 / 4.0.1 | Complete | Canonical Booking/Flight domain and repository layer; authority closure. |
| 4B | Complete | Typed content/CMS schema and draft architecture. |
| 4C / 4C.0.1 | Complete | Settings/Appearance store convergence and hardening. |
| 5A | Complete | Passenger/account convergence on PassengerRepository. |
| HC-0 / HC-1 | Accepted | Present dossier and archive foundation. |
| 5B | Complete | Booking Draft + Flight Search convergence. |
| 5C | Complete / Accepted Source | Manage, Check-in and Boarding Pass convergence. |
| HC-2 | Complete / Accepted Source | Historical archive publication foundation. |
| HC-3 | Complete / Accepted Source | Owner archive visual integration and media experience. |
| 5D | Complete / Accepted Source / Deployed | Contact workflow convergence. Accepted/deployed source `2e166ed815010728d25a891939b84db4109ae65e`; release `898adc36701f138b54787fa14caecf55321b453f`. |
| 6A | Complete / Accepted Source / Accepted Release / Deployed | Admin Commercial Desk convergence. Engineering `59e2e0ce9b56bc492d7c7a2bfc5a0df15fd58fea`; source `2ae1a876018992649074cbed1ebf0560e4da03ff`; release `b5cff4db4b6e087907a9733ffd841880439fbfdb`. |
| 6B1 | Complete / Accepted Source / Accepted Release / Deployed | Dated Flight operations + recurring Schedule persistence. Engineering `b2e37ba4f7d2b0ae66a444747340acfe818a3832`; runtime source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`; release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`. |
| 6B2A | Complete / Accepted Source / Accepted Release / Deployed | Commercial catalog/pricing authority. Engineering `1c5e6b6259add7b59199725f6b23324e8d1c58eb`; current production runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`; current production release `2751e22be91ad74eacc9213489a57a21baf04807`. |
| 6B2B | Complete / Accepted Source | Fleet identity, seat layout and Booking seat authority. Accepted source `d0a411cb8a882298eb32a3222478fbc782ba5556`; intentionally unreleased. |
| 6B2C1 | Complete / Accepted Source | Network reference authority. Engineering `9846f9ad90760a5e47ca231a838d146c4d7096a0`; accepted source `f5506a2ae467b2eb5b8182d7d5b009f258115eb4`; unreleased. |
| 6B2C2A | Complete / Accepted Source | Stable dated-service identity/materialization foundation. Engineering `429ca82dfa3db0453feeab5b53bb45e9e14cf45a`; accepted source/current main `412fc2b4f79e01da0607b5bca44e01d76156a634`; unreleased. |
| 6B2C2B | **ENGINEERING ACCEPTED; source finalization next** | Discovery/Booking cutover. Original `ff46f8e7...`; Correction 01 and accepted engineering `b4cd96a3eda97ae1442119c4fde03c0a463c7cb4`. |

---

# 11. Phase 6B2C2B — accepted engineering contract

The accepted engineering now establishes the actual Flight authority cutover.

## Current discovery

New-sale discovery uses Schedule-derived current services only.

No old generator fallback.

Valid empty Schedule storage yields zero current services.

Corrupt Schedule/Network authority fails truthfully.

## FlightRepository

Responsibilities now include:

- current Schedule-derived search;
- current-only detail for sale eligibility;
- monthly sellability from Schedule materialization;
- broader operational list with compatibility;
- PNR-specific Booking-leg resolution;
- legacy ID compatibility;
- current FlightOverride composition;
- Schedule/Network/Repo subscription invalidation.

## BookingRepository

New normal sales:

- require current dated services;
- re-resolve authoritative service IDs at command time;
- ignore stale caller Flight facts;
- compose transaction-current overrides;
- validate route/date/operational status;
- validate Fleet/cabin/seat authority;
- preserve pricing and physical-layout snapshots;
- commit PNR only after authoritative validation.

Committed submission replay occurs before external authority reads.

Existing PNR seat/check-in operations survive planning retirement/corruption using that Booking's stored Flight snapshot plus current override.

## Drafts

Uncommitted drafts follow current authority.

If selected Flight is no longer current:

- clear affected Flight;
- clear only affected leg seats;
- preserve passengers;
- preserve fare;
- preserve extras;
- preserve contact;
- preserve unaffected leg;
- return passenger to Flight selection with localized explanation.

Do not silently translate legacy IDs.

## Static metadata

Static HostPapa prerender cannot read browser-local Schedule/Network.

Therefore:

- `svc1-*` Flight Detail uses safe generic static metadata;
- runtime loads actual Flight authority;
- legacy IDs may use explicit legacy static metadata.

## Studio

Appearance Studio retains isolated legacy fixture simulation only through explicit in-memory resolver injection.

Persistent registries reject fixture resolver injection.

Studio is not production Flight authority.

---

# 12. Immediate work order — C2B Accepted-Source Finalization

The next worker task should be approximately:

## Baseline

`b4cd96a3eda97ae1442119c4fde03c0a463c7cb4`

## Branch

`phase6b2c2b/discovery-booking-cutover`

## Objective

Finalize independently accepted Phase 6B2C2B engineering into accepted source.

## Allowed changes

- roadmap/status documentation;
- architecture/status documentation;
- acceptance SHA recording;
- narrowly necessary status/source-guard tests.

## Required truth

Record:

- Phase 6B2C2B Engineering Accepted at `b4cd96a3eda97ae1442119c4fde03c0a463c7cb4`;
- Phase 6B2C2B Complete / Accepted Source after finalization;
- Phase 6B now Complete / Accepted Source;
- production still Phase 6B2A until a new release is built and owner-deployed;
- 6B2B/C1/C2A/C2B have not yet individually been deployed after 6B2A.

## Forbidden

- runtime code changes;
- product behavior changes;
- Phase 6C implementation;
- HostPapa movement;
- release creation;
- deployment;
- rebase/squash/force push/history rewrite.

## Publication

- commit finalization;
- push;
- stop;
- independent reviewer confirms accepted engineering SHA is ancestor;
- independently verify finalization is docs/status only;
- fast-forward `main` to finalization SHA.

---

# 13. Consolidated Phase 6B release — recommended immediately after finalization

After C2B Accepted Source, Phase 6B becomes a natural production milestone.

## Why release here

Production currently stops at 6B2A while source contains three additional accepted authority foundations plus the C2B cutover.

Moving into 6C first would increase:

- deployment delta;
- rollback complexity;
- diagnostic ambiguity;
- browser-local migration surface;
- chance that a future staff/CMS change obscures an operational-authority regression.

Therefore release Phase 6B before starting 6C.

## Release gates

From exact Phase 6B accepted-source `main`:

1. clean install/build environment;
2. full unit suite;
3. typecheck;
4. lint — no new warnings;
5. full browser smoke;
6. EN/AR:
   - booking search;
   - new PNR;
   - legacy/existing PNR;
   - Manage;
   - check-in;
   - boarding pass;
   - Admin Flights;
   - Admin Check-in;
   - Counter Booking;
   - Schedule/Network failure behavior;
7. 390 / 768 / 1440 responsive matrix on changed operational surfaces;
8. application build;
9. static/prerender build;
10. HostPapa prepare;
11. HostPapa verify;
12. package inventory/reference checks;
13. contamination checks;
14. exact `SOURCE_COMMIT.txt`;
15. linear HostPapa release commit;
16. independent release review.

## Deployment

Bassam performs final owner deployment.

After deployment:

- live browser verify representative EN/AR journeys;
- confirm no blank/static route regression;
- confirm `svc1-*` detail works at runtime;
- confirm booking creation;
- confirm old PNR compatibility;
- confirm historical/media surfaces unaffected;
- reconcile documentation.

Only then start Phase 6C.

---

# 14. Future roadmap — large phases the supervising agent may run autonomously

The supervising agent may decompose each large phase into subphases as required, but Bassam should generally review only the large-phase result.

---

## Phase 6C — Admin Directory, Staff & Activity Convergence

**Status:** Planned / Unstarted

### Goal

Close remaining administrative identity/directory/activity simulation shortcuts without reintroducing a monolithic AdminProvider.

### Expected scope

- canonical staff directory;
- stable staff identity;
- roles/permissions model;
- RBAC convergence;
- customer/directory surfaces currently depending on static/mock datasets;
- canonical activity/audit records for important admin actions;
- actor attribution;
- consistent admin navigation/search use of canonical staff/customer data;
- browser-local prototype truth unless/until backend phases begin.

### Non-goals

- no fake server authentication;
- no real enterprise identity provider;
- no backend;
- no email invitations;
- no pretending browser-local staff accounts are secure production auth;
- no Phase 7 CMS scope.

### Exit criteria

- no duplicate authoritative staff directory;
- permissions derived from one canonical model;
- important admin mutations emit coherent activity records;
- EN/AR admin flows;
- responsive;
- unit + browser regression coverage;
- Accepted Source;
- release decision at phase end based on accumulated delta.

---

## Phase 7 — CMS Admin Workflows

**Status:** Planned / Unstarted

### Goal

Turn existing typed editorial draft infrastructure into coherent real admin authoring workflows while preserving truthful publication semantics.

### Expected scope

- destination editorial content;
- airport historical chapter authoring;
- travel guidance;
- public copy currently compiled/read-only where appropriate;
- draft validation;
- preview;
- save/discard;
- explicit publish truth appropriate to the browser-local architecture.

### Important constraint

Do not claim cross-device/global publication if content is still browser-local.

If a true server publication model is desired, defer that authority to Phase 13.

### Exit criteria

- one editorial owner per field/document;
- strict schemas;
- EN/AR editing;
- preview isolation;
- no loss of provenance;
- no accidental overwrite of documentary records;
- durable browser regressions.

---

## Phase 7B — Media & Provenance Admin

**Status:** Planned / Unstarted

### Goal

Provide structured administration of media without weakening archive truth.

### Expected scope

- canonical media catalog UI;
- provenance display/editing where authorized;
- publication-basis visibility;
- truth classification;
- variant inspection;
- responsive WebP metadata;
- focal point / crop metadata;
- external video references;
- documentary rights notes.

### Non-negotiables

- never replace documentary material with generic AI/stock imagery;
- preserve owner-directed vs rights-cleared vs external-embed distinctions;
- do not fabricate provenance.

---

## Phase 8 — Visual System & Assets Finalization

**Status:** Planned

### Goal

Perform the final deliberate whole-product visual polish after authority/CMS structures are stable.

### Scope

- whole-site UI/UX audit;
- visual hierarchy;
- surface grammar;
- token consistency;
- spacing/density;
- icon consistency;
- image placement/cropping;
- asset optimization;
- booking console;
- admin dashboard/operations surfaces;
- archive/storytelling surfaces;
- empty/loading/error states;
- desktop/tablet/mobile parity.

### Rule

Do not treat this as “make everything different.”

Preserve accepted brand direction and improve coherence, polish, and product quality.

Use real historical/documentary assets in documentary contexts.

### Owner gate

Bassam should review the major visual result, not individual CSS changes.

---

## Phase 9 — Arabic, RTL, Accessibility & Responsive Certification

**Status:** Planned

### Goal

Certify the entire product, not only touched pages.

### Required matrix

- Arabic + English;
- RTL + LTR;
- approximately 320px–1920px;
- keyboard-only navigation;
- focus order;
- focus restoration;
- dialogs/sheets/popovers;
- reduced-motion behavior where applicable;
- screen-reader semantics;
- forms/errors;
- tables;
- technical LTR IDs inside RTL;
- touch targets;
- zoom/overflow.

### Accessibility target

Use WCAG 2.2 AA as the practical target where applicable.

### Exit criteria

No known critical keyboard, focus, semantic, RTL, or horizontal-overflow defects.

---

## Phase 10 — Comprehensive Durable Regressions Program

**Status:** Planned

### Goal

Make future development safer and reduce dependence on manual memory.

### Scope

- repository authority invariants;
- storage corruption cases;
- cross-tab behavior;
- booking races;
- seat collisions;
- override races;
- idempotent submission;
- archived/historical PNR behavior;
- EN/AR end-to-end user journeys;
- admin workflows;
- visual overflow checks;
- selected screenshot baselines where stable;
- source guards against legacy-authority resurrection.

### Governance improvement

This is a strong place to introduce GitHub Actions if not already done.

At minimum consider:

- typecheck;
- unit;
- build;
- selected smoke/static validation.

Do not create brittle CI whose only function is to be bypassed.

---

## Phase 11 — SEO, Performance & HostPapa Production Certification

**Status:** Planned

### Goal

Certify the browser-local/static product as a mature HostPapa production release before backend transformation.

### SEO

- EN/AR metadata parity;
- canonical URLs;
- sitemap;
- robots;
- structured data where appropriate;
- route head parity;
- social metadata;
- no fake dynamic metadata for browser-local facts;
- Arabic home/route metadata review.

### Performance

- bundle inspection;
- route splitting;
- image sizing;
- preload/preconnect only where justified;
- WebP/AVIF strategy if beneficial;
- Core Web Vitals;
- static cache headers / `.htaccess`;
- avoid shipping editor-only data in public startup bundles.

### Production certification

- all 46+ static routes;
- deep-link fallback;
- static asset references;
- no source maps unless deliberately allowed;
- no development artifacts;
- correct `SOURCE_COMMIT.txt`;
- deployment rehearsal;
- live post-deploy smoke.

### Result

A fully certified static/browser-local production product.

This is **not yet** the final real backend airline system.

---

# 15. Backend path to real production

The current prototype is valuable and production-deployed as a static site, but real airline-grade transactional production requires server authority.

---

## Phase 12 — Backend Readiness & API Contract Design

**Status:** Planned

### Goal

Design the migration without prematurely rewriting the frontend.

### Required outputs

- domain/API boundary map;
- REST/RPC contracts;
- auth/session contract;
- staff identity/RBAC contract;
- passenger identity contract;
- booking command API;
- Flight/Schedule/Network/Fleet/Commercial APIs;
- payment boundary;
- media/CMS API;
- contact/inbox transport;
- audit log contract;
- database schema;
- migrations;
- idempotency model;
- optimistic concurrency model;
- error model;
- background jobs/events;
- observability;
- backup/recovery;
- environment/secrets strategy.

### Key rule

Do not simply expose browser-local storage shapes as the server API.

Use the mature domain concepts as inputs, then design server-grade transactional boundaries.

### Architecture review gate

This phase requires an explicit architecture review before implementation.

---

## Phase 13 — Production Backend, Authentication, Database & Payments

**Status:** Planned

This phase should almost certainly be decomposed.

Recommended major subphases:

### 13A — Backend foundation

- production runtime;
- environments;
- database;
- migrations;
- secrets;
- logging;
- health checks;
- deployment pipeline.

### 13B — Identity and auth

- passenger auth;
- staff auth;
- secure sessions;
- password/identity provider;
- RBAC;
- account recovery;
- rate limits;
- security audit.

### 13C — Core reference authorities

Migrate server authority for:

- Network;
- Fleet;
- Schedule;
- Commercial;
- staff/directory.

### 13D — Booking and inventory

Server-authoritative:

- PNR creation;
- idempotency;
- seat inventory;
- transaction boundaries;
- capacity;
- check-in;
- cancellation;
- audit.

At this point a real inventory model may be needed; do not assume the prototype `seatsLeft` simulation is sufficient.

### 13E — CMS/media/contact

- server publication workflow;
- real inbox/message transport;
- media catalog;
- provenance;
- editorial workflow.

### 13F — Payments

Only after booking/inventory transaction boundaries are stable:

- payment provider;
- PCI-minimizing design;
- payment intents;
- webhook idempotency;
- refunds;
- failure recovery;
- reconciliation.

### 13G — Migration and cutover

- browser-local → server migration policy;
- do not silently upload synthetic/demo data;
- environment separation;
- staged rollout;
- rollback plan;
- monitoring.

### Production gate

Before calling the system a real production backend:

- security review;
- auth review;
- database constraints;
- concurrency/race testing;
- idempotency proof;
- backup/restore test;
- monitoring/alerts;
- privacy review;
- rate limiting;
- dependency audit;
- penetration testing appropriate to scope;
- end-to-end production rehearsal.

---

## Phase 14+ — Optional Ecosystem Integrations

Only after the core production backend is stable.

Potential areas:

- GDS / airline schedule feeds;
- loyalty;
- cargo/logistics;
- partner APIs;
- real email/SMS;
- analytics;
- external operational systems;
- payment expansions.

Every integration must have a clear owner and must not duplicate canonical internal authority.

---

# 16. Production definitions — avoid ambiguity

There are two different meanings of “production” in this project.

## A. Static prototype production

Today:

- real public HostPapa deployment;
- browser-local prototype state;
- no real backend authority.

Phase 11 represents full certification of this product mode.

## B. Real transactional production

Requires Phase 13:

- server database;
- real authentication;
- server booking authority;
- transaction-safe inventory;
- secure staff authorization;
- real CMS/contact transport;
- real payments if enabled;
- operational monitoring and recovery.

Never call A equivalent to B.

---

# 17. Large-phase acceptance checklist

For each large phase, the supervising agent should independently verify all applicable items.

## Git

- exact parent;
- exact branch head;
- exact main head;
- merge base;
- ahead/behind;
- no unexpected merges;
- no history rewrite;
- clean pushed source;
- expected changed-file scope.

## Architecture

- one canonical owner per fact;
- no duplicate store;
- no hidden raw fixture authority;
- no cross-domain ownership leak;
- compatibility is explicit;
- failures are truthful;
- history is preserved where required.

## Runtime

- happy path;
- empty state;
- corrupt/unavailable authority;
- stale client input;
- cancellation/retirement;
- idempotent replay;
- concurrency/race cases;
- cross-tab invalidation if relevant.

## QA

- focused tests;
- full units;
- typecheck;
- lint;
- app build;
- static build;
- full smoke;
- EN/AR;
- responsive;
- accessibility for changed surfaces;
- package/references/contamination for releases.

## Evidence

Always distinguish:

- worker local QA;
- independently inspected source;
- GitHub CI/status evidence;
- live production verification.

Never collapse these into one generic “verified.”

---

# 18. Known strategic risks

## 1. No GitHub CI / platform branch protection

Current workflow is strong but relies heavily on process discipline.

Mitigation:

- branch protection/rulesets;
- lightweight CI;
- exact-SHA review;
- no direct accepted-history mutation.

## 2. Browser-local architecture

Storage is intentionally local.

Risks:

- device-specific state;
- no shared inventory;
- no true staff synchronization;
- no real security boundary.

Mitigation:

- truthful UX now;
- Phase 12/13 server migration later.

## 3. Production lag

At this handoff, production is still 6B2A.

Mitigation:

- finalize C2B;
- release consolidated 6B;
- deploy;
- verify;
- only then continue to 6C.

## 4. Historical/media truth

The project has real documentary material.

Risk:

- future visual/CMS work accidentally treats it as interchangeable decoration.

Mitigation:

- provenance is canonical;
- Phase 7B must preserve publication basis;
- Phase 8 must not replace documentary media with AI/stock assets.

## 5. AI-agent overreach

Risk:

- worker introduces convenient duplicate authority;
- worker treats tests as proof of architecture;
- agent expands scope to “improve” unrelated code.

Mitigation:

- exact bounded prompts;
- source guards;
- independent review;
- phase exclusions;
- accepted-source finalization with zero runtime changes.

---

# 19. What the supervising AI agent should do when a new conversation starts

1. Read this file.
2. Verify GitHub exact refs before trusting the snapshot.
3. If C2B finalization has not happened:
   - start there.
4. If C2B accepted source exists but consolidated Phase 6B release has not been deployed:
   - build/review/release Phase 6B.
5. If Bassam confirms deployment:
   - verify provenance;
   - run/obtain live browser checks;
   - reconcile docs.
6. Start Phase 6C only after the Phase 6B production milestone is clean.
7. Continue through the large phases in order unless source evidence justifies a bounded reordering.
8. Decompose internally when necessary.
9. Review every worker handback independently.
10. Do not ask Bassam to micromanage routine engineering.
11. Stop and ask Bassam only at real product/visual/publication/production-deployment decisions.

---

# 20. Agent-level roadmap summary

```text
NOW
│
├─ C2B Accepted-Source Finalization
│   └─ main fast-forward after independent docs-only verification
│
├─ Consolidated Phase 6B Release
│   ├─ build / package / verify
│   ├─ independent release review
│   ├─ owner deploy
│   └─ production verification
│
├─ Phase 6C — Staff / Directory / Activity
│
├─ Phase 7 — CMS Admin
│
├─ Phase 7B — Media / Provenance Admin
│
├─ Phase 8 — Visual / Assets Finalization
│
├─ Phase 9 — Arabic / RTL / Accessibility / Responsive Certification
│
├─ Phase 10 — Durable Regression Program + CI hardening
│
├─ Phase 11 — SEO / Performance / HostPapa Production Certification
│
├─ Phase 12 — Backend Readiness / API & DB Design
│
├─ Phase 13 — Real Backend / Auth / DB / Inventory / CMS / Payments
│   ├─ 13A Backend foundation
│   ├─ 13B Identity & RBAC
│   ├─ 13C Reference authorities
│   ├─ 13D Booking & inventory
│   ├─ 13E CMS/media/contact
│   ├─ 13F Payments
│   └─ 13G Migration/cutover
│
└─ Phase 14+ — Optional external integrations
```

---

# 21. Definition of final success

The project is not “done” merely because the site looks good.

A strong final product has all of the following:

- coherent premium airport/airline UX;
- authentic historical and Palestinian identity;
- excellent Arabic and English;
- responsive and accessible interaction;
- one source of truth per domain;
- no hidden fixture authority;
- truthful failure states;
- durable regression coverage;
- clear release provenance;
- production-grade SEO/performance;
- secure real authentication when backend mode begins;
- transaction-safe booking/inventory when backend mode begins;
- real observability/backups/recovery;
- preserved documentary provenance;
- maintainable architecture an AI worker cannot casually corrupt.

Until Phase 13 is complete, the project remains a sophisticated browser-local operational prototype and public site—not a real transactional airline backend.

---

# 22. Current authoritative checkpoint in one paragraph

As of 2026-10-06, Gaza Gateway production remains owner-deployed **Phase 6B2A**, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`, HostPapa release `2751e22be91ad74eacc9213489a57a21baf04807`. `main` remains at accepted C2A source `412fc2b4f79e01da0607b5bca44e01d76156a634` while Phase 6B2C2B engineering has now been independently accepted on feature branch `phase6b2c2b/discovery-booking-cutover` at Correction 01 SHA `b4cd96a3eda97ae1442119c4fde03c0a463c7cb4`. C2B closes the dated-service discovery/booking authority cutover by making Schedule+Network materialization authoritative for current discovery/new sales, preserving exact PNR-specific historical Flight snapshots and overrides, retaining explicit legacy compatibility, isolating Studio fixtures, and preventing cancelled PNRs from resurrecting retired board rows. The immediate next task is docs/status-only accepted-source finalization and fast-forward of `main`; after that, build and deploy a consolidated Phase 6B release before starting Phase 6C.

---

# 23. Evidence references for the next agent

Important repository documents to inspect at exact refs:

- `roadmap.md`
- `PRODUCT.md`
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/CANONICAL_REPOSITORIES.md`
- `docs/DATA_FLOW.md`
- `docs/DATED_SERVICE_MODEL.md`
- `docs/FLEET_MODEL.md`
- `docs/NETWORK_MODEL.md`
- `docs/SCHEDULE_MODEL.md`
- `docs/COMMERCIAL_MODEL.md`
- `docs/PHASE_6B2C2B_HANDOFF.md`
- `docs/PHASE_6B2C2B_CORRECTION_01.md`

Correction 01 runtime files particularly relevant to the independent acceptance:

- `src/lib/dated-services/compatibility.ts`
- `src/lib/repositories/flight-repository.ts`
- `src/lib/repositories/types.ts`
- `src/lib/repositories/queries.ts`
- `src/lib/repositories/keys.ts`
- `src/lib/domain/desk.ts`
- `src/routes/{-$locale}.admin.check-in.tsx`
- `src/routes/{-$locale}.account.boarding-passes.tsx`
- `src/routes/{-$locale}.admin.bookings.$ref.tsx`

Correction 01 durable proof:

- `tests/unit/dated-service-cutover-correction-01.test.ts`
- `tests/unit/dated-service-cutover.test.ts`
- `tests/smoke/phase6b2c2b-correction-01.mjs`
- `tests/smoke/phase6b2c2b-cutover.mjs`

Always fetch exact files at the exact reviewed SHA rather than relying on default-branch code search for feature-branch conclusions.

---

**End of master handoff.**
