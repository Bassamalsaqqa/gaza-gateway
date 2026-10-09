# Gaza Gateway — Settings Model Architecture (Phase 4C)

> **Current Source Status**: Phase 6 Complete / Accepted Source; Phase 6C Complete / Accepted Source; Phase 7 and Phase 7B Complete / Accepted Source. Phase 8 — Visual System & Assets Finalization is Complete / Accepted Source. Phase 9 — Arabic, RTL, Accessibility & Responsive Certification is Complete / Accepted Source. Phase 10 is Complete / Accepted Source; Phase 11 is Complete / Accepted Source (Release Published). Phase 12 — Backend Readiness & API Contracts is Complete / Accepted Source at 7dab821d7d205b41ae925e013fe9c69a97a7e875 ([docs/backend/README.md](./backend/README.md)). Proposed Phase 13A local backend foundation candidate Implemented / Awaiting Independent Review (not accepted/deployed; Phase 13B–G remain Planned / Unstarted). Phase 6B2C1 Complete / Accepted Source; Phase 6B2C2A Complete / Accepted Source; Phase 6B2C2B Complete / Accepted Source. See the current checkpoint below.

## 1. Overview & Governing Principles

Phase 4C unifies the runtime configuration layer under a single governed Settings model. The application remains a static, client-side prototype hosted on shared infrastructure (HostPapa cPanel static hosting), without persistent Node.js, Express, or backend databases.

Settings adhere to the following invariants:
1. **Compilation vs. Local Draft Separation**: Published settings are compiled, SSR/prerender-safe constants baked into source. Local drafts reside strictly in browser storage (`gza.settings.draft.v1`) and never contaminate production visitors.
2. **Explicit Preview Boundaries**: Ordinary public routes (`/contact`, `/`, etc.) consume compiled published defaults. Preview overlays require explicit opt-in query parameters (`?settingsPreview=1`, `?skinPreview=1`, `?studioPreview=1`).
3. **No False Persistence**: If browser storage fails (quota exceeded, privacy blockers, private browsing), mutations throw `StorageCommitError`, working previews retain uncommitted state, and no false "Save succeeded" toast is issued.
4. **Studio & Repository Isolation**: Operations in Appearance Studio or Booking/CAP-PROOF fixtures do not write to `gza.settings.draft.v1` unless an explicit "Save Draft" user action is triggered.

---

## 2. Complete Field Classification

| Tab | Field Name | Type | Classification | Writer / Consumer Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **Airport** | Airport Name | Text | Compiled Product Identity | Read-only in Admin. Source constant: "Gaza International Airport". |
| **Airport** | IATA Code (`GZA`) | Text (3) | Domain / System Fact | Read-only in Admin. Technical identifier, fixed LTR. |
| **Airport** | Airline Name | Text | Compiled Product Identity | Read-only in Admin. Source constant: "Palestinian Airlines". |
| **Airport** | Airline Code (`PS`) | Text (2) | Domain / System Fact | Read-only in Admin. Technical identifier, fixed LTR. |
| **Airport** | Time Zone | Text | Domain / System Fact | Read-only in Admin. Station reference `Asia/Gaza (UTC+3)`. |
| **Airport** | Terminals | Text | Operations Fact | Read-only in Admin. Operational fixture: "Terminal 1". |
| **Airport** | Gates | Text | Operations Fact | Read-only in Admin. Operational fixture: "A1, A2, A4, B1, B3". |
| **Service** | Check-in Opens | Text | Service Policy | Read-only in Admin. Rule: 24h prior to departure. |
| **Service** | Check-in Closes | Text | Service Policy | Read-only in Admin. Rule: 60 min prior to departure. |
| **Service** | Boarding Cutoff | Text | Service Policy | Read-only in Admin. Rule: 20 min prior to departure. |
| **Service** | Cabin Baggage | Text | Service Policy | Read-only in Admin. Standard allowance: 7 kg. |
| **Service** | Checked Baggage | Text | Service Policy | Read-only in Admin. Standard allowance: 23 kg. |
| **Service** | Extra Bag Price | Text / Number | Service Policy | Read-only in Admin. Standard pricing: $35. |
| **Service** | Currency | Code | Domain Policy | Read-only in Admin. Standard base currency: `USD`. |
| **Contact** | Phone | Phone string | **Editable Draft Setting** | Controlled draft in Admin. Published default: `+970 8 000 0000`. |
| **Contact** | Email | Email string | **Editable Draft Setting** | Controlled draft in Admin. Published default: `hello@gza-airport.ps`. |
| **Contact** | Address (EN) | Text | **Editable Draft Setting** | Controlled draft in Admin. Published default: `Gaza International Airport, Gaza`. |
| **Contact** | Address (AR) | Text | **Editable Draft Setting** | Controlled draft in Admin. Published default: `مطار غزة الدولي، غزة`. |
| **Contact** | Social (Instagram) | HTTPS URL / empty | **Editable Draft Setting** | Controlled draft in Admin. Published default: empty (renders non-clickable). |
| **Contact** | Social (X) | HTTPS URL / empty | **Editable Draft Setting** | Controlled draft in Admin. Published default: empty (renders non-clickable). |
| **Contact** | Social (Facebook) | HTTPS URL / empty | **Editable Draft Setting** | Controlled draft in Admin. Published default: empty (renders non-clickable). |
| **Contact** | Social (YouTube) | HTTPS URL / empty | **Editable Draft Setting** | Controlled draft in Admin. Published default: empty (renders non-clickable). |
| **Localization**| English Enabled | Boolean | Build / Product Fact | Read-only in Admin (disabled Switch). English is canonical primary locale. |
| **Localization**| Arabic Enabled | Boolean | Build / Product Fact | Read-only in Admin (disabled Switch). Arabic is primary RTL locale. |
| **Localization**| Default Language | Select | Build / Product Fact | Read-only in Admin. Build root route is English. |
| **Localization**| Date / Time / Cur | Text | Domain Display Format | Read-only in Admin. `DD/MM/YYYY`, `24 h`, `$1,234`. |
| **Appearance** | Canvas Skins | Object | **Editable Draft Setting** | Appearance Studio working copy / explicit draft. Default: `DEFAULT_SITE_SKIN`. |
| **Appearance** | Surface Grammar | Object | **Editable Draft Setting** | Surface Grammar overrides & family presets. Default: `DEFAULT_SURFACE_GRAMMAR_CONFIG`. |

---

## 3. Storage Key Matrix & Domain Separation

Every persistent domain has an authoritative, isolated storage key. No domain writes to another's key:

| Domain | Key | Authority & Lifecycle |
| :--- | :--- | :--- |
| **Settings (Contact & Appearance)** | `gza.settings.draft.v1` | **Authoritative Settings Draft Store**. Versioned envelope `{ schemaVersion: 1, site: { contact?, appearance? } }`. |
| **Contact Enquiries & Inbox** | `gza.contact.v1` | **Canonical Contact Domain Store**. Governed by `ContactStorageCoordinator` / `ContactRepository`. Customer enquiries submitted via `/contact` and processed via `/admin/inbox`. Completely separate from settings draft (`gza.settings.draft.v1`). |
| **Appearance (Legacy working copy)**| `gza.skin.preview.v1` | **Legacy Non-Authoritative**. Read once for deterministic migration when `site.appearance` is absent. Left byte-for-byte untouched; no dual writes. |
| **Appearance (Export Artifact)** | `gza.appearance.v1` | **Export file format identifier**. Used for JSON export/import of skin configuration. |
| **Fleet & Seat Layouts** | `gza.fleet.v1` | **Canonical Fleet Repository Store**. Governed by `FleetRepository`. Fleet aircraft and seat layout definitions. |
| **Bookings & Operational Flights** | `gza.repo.v1` | **Canonical Repository Store**. Governed by `RepoStorageCoordinator`. Bookings & overrides. |
| **Booking Wizard Draft** | `gza.booking.draft.v1` | **Canonical Booking Draft Store**. Governed by `BookingDraftRepository` for active booking wizard flows. |
| **Passenger Account & Travelers** | `gza.passenger.v1` | **Canonical Passenger Store**. Governed by `PassengerRepository` for account profile and saved travelers. |
| **Content & Travel CMS** | `gza.content.draft.v1`| **Canonical Content Draft Store**. Travel CMS, destination media, and editorial drafts. |
| **Legacy Public State** | `gza.store.v1` | Closed legacy migration/rollback source only, no active public writer. |
| **Staff & Admin Auth** | `gza.admin.v1` | Staff session simulation (`staffId`), no product-domain state or flight overrides. |
| **Network reference** | `gza.network.v1` | Canonical NetworkRepository airport/reference operations; no pricing, CMS or SEO. |

---

## 4. Multi-Document Envelope & Per-Document Storage Authority

`SettingsRepository` manages two independent documents within a single versioned draft envelope:

```typescript
export interface SettingsDraftEnvelope {
  schemaVersion: 1;
  site?: {
    contact?: ContactSettings;
    appearance?: AppearanceSettings;
  };
  meta?: {
    legacyAppearanceMigrated?: boolean;
  };
}
```

Key lifecycle behaviors:
1. **Per-Document Atomic Mutations**:
   - `saveContactDraft(contact)` reads the latest envelope, updates only `site.contact`, preserves any existing `site.appearance` and `meta`, and commits atomically.
   - `saveAppearanceDraft(appearance)` reads the latest envelope, updates only `site.appearance`, preserves any existing `site.contact` and `meta`, and commits atomically.
2. **Independent Discard & The Tombstone Exception**:
   - `discardContactDraft()` removes only `site.contact`. Any saved `site.appearance` draft survives untouched.
   - `discardAppearanceDraft()` removes only `site.appearance`. Any saved `site.contact` draft survives untouched.
   - **Tombstone Exception to Empty-Key Cleanup**: When both documents are empty, if legacy migration was previously performed (`meta.legacyAppearanceMigrated === true`), a tombstone envelope `{ schemaVersion: 1, site: {}, meta: { legacyAppearanceMigrated: true } }` is retained in `gza.settings.draft.v1` instead of deleting the key. This prevents subsequent reads from re-importing the discarded legacy skin, while strictly preserving `gza.skin.preview.v1` byte-for-byte on disk for rollback safety. If legacy migration never ran, standard empty-key cleanup completely removes `gza.settings.draft.v1`.
3. **Deterministic Legacy Appearance Migration**:
   - If canonical `site.appearance` is absent and `meta.legacyAppearanceMigrated` is not set, `loadSettingsEnvelope()` inspects `gza.skin.preview.v1`.
   - If a valid legacy skin exists, it sanitizes it and commits it once to `site.appearance` in the canonical store (preserving any existing `site.contact` and setting `meta.legacyAppearanceMigrated = true`).
   - The legacy `gza.skin.preview.v1` key remains byte-for-byte untouched (preventing rollback breakage) and is never written to after migration.
   - Canonical `site.appearance` draft always wins over legacy key. Once migrated or discarded, legacy resurrection is impossible.
4. **Root-Safe Preview Reader Authority**:
   - `src/lib/skin.ts::readPreviewSkin()` adheres to the identical authority hierarchy. It inspects `gza.settings.draft.v1` first. If the canonical draft key exists (including when tombstoned or containing only Contact), it reads `site.appearance` or returns `DEFAULT_SITE_SKIN`. It falls back to `gza.skin.preview.v1` only if the canonical settings store was never initialized in the browser.
5. **Preview Event Contract & Cross-Tab Immunity**:
   - `SKIN_PREVIEW_EVENT` (`"gza:skin-preview-update"`) carries active `SiteSkinConfig` detail for live, uncommitted Studio iframe synchronization.
   - `SETTINGS_DRAFT_EVENT` (`"gza:settings-draft-update"`) carries `SettingsDraftEnvelope | null` detail.
   - `SkinPreviewListener` explicitly discriminates between these two event types: on a settings draft event, it extracts `envelope.site.appearance`. If present and non-default, it applies the skin; if absent (Contact-only save or Appearance discard), it clears DOM skin overrides via `clearDomSkinOverrides()`. Contact draft mutations cannot pass envelopes to the skin renderer, stomp appearance state, or throw errors.
6. **Invalid Child Recovery**:
   - When `loadSettingsEnvelope()` reads `gza.settings.draft.v1`, it strictly verifies contact drafts with `validateContactSettings(contact).valid === true`.
   - If a stored contact draft is invalid (e.g. invalid phone number, invalid email shape, empty bilingual address, or unsafe social URL), the contact draft is omitted from `site.contact`.
   - Valid sibling drafts (`site.appearance`) and migration tombstones (`meta.legacyAppearanceMigrated`) are strictly preserved.
   - Normal `/contact` and explicit `/contact?settingsPreview=1` fall back safely to compiled published settings without false saved-draft banners.
7. **Clean / Dirty Cross-Tab Synchronization & Document Isolation**:
   - When external storage changes or `gza:settings-draft-update` events fire, subscriber callbacks execute via pure `computeExternalSettingsSync`:
     - **Per-Document Isolation**: An editor only reacts if its own target document's saved baseline has actually changed (`hasSavedChanged`). Unrelated sibling document saves (e.g. Appearance save while editing Contact, or Contact save while editing Appearance) do nothing to that editor and never trigger false notices.
     - **Clean Editors**: If the editor's in-memory working state is clean (matches its previous saved baseline), it immediately adopts the incoming saved (or discarded) draft, and Appearance Studio synchronizes its preview iframe (`shouldAdopt`).
     - **Dirty Editors & Conflict Notice**: If the user has unsaved local edits in memory, the editor preserves the local working state and updates its saved baseline reference. A restrained bilingual notice (`a2.se.externalChangeNotice`) is displayed ONLY if the incoming saved baseline differs from the local working edits.
     - **Working Value Convergence**: If an external save happens to match the editor's local working edits, the editor transitions to clean without showing an unsaved/conflict notice.
8. **Failure Resilience**:
   - Quota or storage security errors throw `StorageCommitError`. In-memory state is preserved, and subscribers are not notified of failed commits.
   - Corrupted JSON or unhandled schema versions safely return `null` (falling back to compiled published defaults) without crashing.

---

## 5. Contact Proof & Validation Rules

- **Phone**: Sanitized string matching valid international or regional format (`/^\+?[0-9\s\-()]{7,25}$/`).
- **Email**: Strict RFC-compliant email shape (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) with required domain.
- **Bilingual Addresses**: Both `addressEn` and `addressAr` are strictly validated and preserved independently. Non-empty string (>= 3 chars) required. Editing English does not overwrite or erase Arabic, and vice-versa.
- **Social URLs**: Evaluated with `new URL()`. Must be valid `https://` URLs with a valid hostname containing a period, or empty strings. Insecure (`http://`) or arbitrary protocol-relative URLs are rejected with validation errors.
- **Public Action Safety**: When social links have empty URLs, the public Contact page renders non-clickable pill badges (`<span className="... cursor-not-allowed opacity-50">`) rather than dummy `href="#"` links.
- **Preview Query & Hydration**: Public Contact page reads compiled published constants during SSR/initial render. When `?settingsPreview=1` is active, it overlays the validated contact draft client-side and displays a visible "Stored in this browser • Not published" banner. Leaving `?settingsPreview=1` via SPA navigation immediately resets to published defaults and removes the banner.

---

## 6. Appearance Studio Workflow & Save Semantics

1. **Immediate Working Preview**: Changes made within Appearance Studio immediately post messages (`GZA_STUDIO_CONFIG_SYNC`) to the embedded preview iframe and update in-memory React state. **Storage is not touched on every slider or pattern adjustment.**
2. **Three-State Tracking**:
   - **Published baseline**: No draft exists; working state matches compiled published defaults.
   - **Saved draft**: Saved draft exists in storage and matches working state.
   - **Unsaved changes**: Working state differs from the saved draft (or published baseline).
3. **Save Draft**: Persists sanitized config to `settingsRepository.saveAppearanceDraft()`. On success, transitions to "Saved" status and displays a toast. On failure, catches error, displays a visible `role="alert"` in the studio sidebar, displays an error toast, and remains in "Unsaved" state (never claiming success).
4. **Discard Unsaved**: Reverts in-memory state and preview iframe to the last saved draft (or published defaults if no draft was saved).
5. **Discard Saved Draft**: Calls `settingsRepository.discardAppearanceDraft()`, removes `site.appearance` from storage, resets studio and iframe to `PUBLISHED_APPEARANCE_SETTINGS`, and returns to "Published baseline" status. Label is "Discard Saved Draft" / "حذف المسودة المحفوظة" (`a2.se.discardSaved`), distinct from "Discard Unsaved".
6. **Export**: The JSON export feature exports the active sanitized **working** configuration (`gza.appearance.v1`).

---

## 7. Designer Asset Promotion Path & Future Backend Replacement

- **Designer Promotion Path**: When the design team finalizes brand tokens, surface patterns, or hero artwork, the configurations in `site.appearance` drafts are promoted by replacing the constants in `src/lib/skin.ts` (`DEFAULT_SITE_SKIN`) and `src/design/surfaces/presets.ts` (`DEFAULT_SURFACE_GRAMMAR_CONFIG`).
- **Future Backend Replacement**:
  The `SettingsRepository` interface (`getPublishedContact`, `getContactDraft`, `saveContactDraft`, `discardContactDraft`, `getPublishedAppearance`, `getAppearanceDraft`, `saveAppearanceDraft`, `discardAppearanceDraft`, `subscribe`) is designed as a drop-in seam:
  - Phase 4C provides `LocalSettingsRepository` backed by `localStorage`.
  - In a future phase with a real backend, a `RemoteSettingsRepository` implementing the identical interface can be wired in with REST/GraphQL endpoints (`GET /api/v1/settings`, `POST /api/v1/settings/draft`), without changing any UI consumers in Admin Settings, Appearance Studio, or the public Contact page.

## Accepted Phase 5D boundary

`gza.contact.v1` stores enquiries only in browser-local storage. Public submissions do not transmit data to airport staff. Admin Inbox shares those records only within the same browser/storage origin, with no cross-device synchronization or server persistence. There is no backend Contact service, SMTP service or email reply delivery; replies are locally saved drafts. User-entered enquiries may contain real PII, which remains browser-local. Contact settings remain independent in `gza.settings.draft.v1`.

Phase 5D is Complete / Accepted Source / Deployed by Owner. Phase 6A — Admin Commercial Desk Convergence — is Complete / Accepted Source / Accepted Release / Deployed by Owner (accepted engineering SHA: `59e2e0ce9b56bc492d7c7a2bfc5a0df15fd58fea`). Phase 6B1 is Complete / Accepted Source / Accepted Release / Deployed by Owner (accepted engineering SHA: `b2e37ba4f7d2b0ae66a444747340acfe818a3832`). Phase 6B2A is Complete / Accepted Source / Accepted Release / Deployed by Owner (accepted engineering SHA: `1c5e6b6259add7b59199725f6b23324e8d1c58eb`; deployed runtime source: `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`; owner-deployed release: `2751e22be91ad74eacc9213489a57a21baf04807`); Phase 6B2B is Complete / Accepted Source; Phase 6B2C1 - Network Reference Authority & Destination Operations Convergence is Complete / Accepted Source; Phase 6B2C2A - Stable Dated-Service Materialization Foundation is Complete / Accepted Source; Phase 6B2C2B is Complete / Accepted Source. Phase 6C (Admin Directory Staff & Activity Convergence), Phase 7, and Phase 7B remain Planned / Unstarted.

## Current Phase 6B2A production checkpoint and earlier deployment history

Phase 6B2A — Sellable Commercial Catalog & Pricing Authority — is Complete / Accepted Source / Accepted Release / Deployed by Owner, the current production checkpoint. Current owner-deployed production release: `2751e22be91ad74eacc9213489a57a21baf04807`; deployed runtime source: `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`; accepted engineering SHA: `1c5e6b6259add7b59199725f6b23324e8d1c58eb`. Deployment is confirmed by the product owner. Git/source/release provenance was independently checked after deployment; no independent live-browser verification from the ChatGPT/Codex environment is claimed. Main may advance through accepted source engineering and documentation commits while the deployed runtime source remains unchanged. Phase 6B1 is a historical completed production phase: Complete / Accepted Source / Accepted Release / Deployed by Owner (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`, source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`, engineering `b2e37ba4f7d2b0ae66a444747340acfe818a3832`). Phase 6A is a historical completed production phase: Complete / Accepted Source / Accepted Release / Deployed by Owner (release `b5cff4db4b6e087907a9733ffd841880439fbfdb`, source `2ae1a876018992649074cbed1ebf0560e4da03ff`, engineering `59e2e0ce9b56bc492d7c7a2bfc5a0df15fd58fea`). Phase 5D is a historical completed phase: Complete / Accepted Source / Deployed by Owner (release `898adc36701f138b54787fa14caecf55321b453f`, source `2e166ed815010728d25a891939b84db4109ae65e`). Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority (Complete / Accepted Source); Phase 6B2C2A (Complete / Accepted Source); Phase 6B2C2B (Complete / Accepted Source). Phase 6C — Admin Directory Staff & Activity Convergence, Phase 7 and Phase 7B remain Planned / Unstarted.

## Phase 6B1 accepted source (historical completed production phase)

Phase 6B1 — Dated Flight Operations & Recurring Schedule Persistence — is **Complete / Accepted Source / Accepted Release / Deployed by Owner** (accepted engineering SHA: `b2e37ba4f7d2b0ae66a444747340acfe818a3832`), a historical completed production phase reconciled onto main and deployed by Bassam (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`, deployed runtime source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`). Admin dated-flight reads and booking/check-in metrics use canonical repository queries; override writers commit through FlightRepository. Recurring planning schedules have a separate `ScheduleRepository` / `gza.schedule.v1` authority, independent of dated-flight generation. Schedule edits do not change Public Flights, booking search or persisted flight IDs. In accepted Phase 6B2B source, aircraft and seat layouts use `FleetRepository`; Network reference configuration now uses NetworkRepository in Phase 6B2C1; public editorial and merchandising fixtures remain compiled. Commercial product configuration uses `CommercialCatalogRepository`; there is no monolithic durable OpsState. See [Schedule model](SCHEDULE_MODEL.md) for the storage and planning boundary.

Phase 6B is **Complete / Accepted Source / Accepted Release / Deployed by Owner** (deployed production release: `8e3136c22156c9acf800d25e94e8cd3d29a8bfc8`, deployed runtime source: `2749c26714258871c32bd2b14a75fc4e87a68b62`). Phase 6B consolidated Phase 6B1, Phase 6B2A, Phase 6B2B, Phase 6B2C1, and Phase 6B2C2 (6B2C2A & 6B2C2B). Historical production releases include Phase 6B2A (release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`, engineering `1c5e6b6259add7b59199725f6b23324e8d1c58eb`), Phase 6B1 (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`), Phase 6A (release `b5cff4db4b6e087907a9733ffd841880439fbfdb`), and Phase 5D (release `898adc36701f138b54787fa14caecf55321b453f`).

Phase 6C — Admin Directory Staff & Activity Convergence is **Implemented / Awaiting Independent Review**; Phase 6 as a whole is Pending Phase 6C Independent Acceptance. Phase 7 and Phase 7B remain Planned / Unstarted. Deployment was owner-confirmed (HTTP 200 confirmed live; no independent live bundle verification claimed).

AdminProvider owns staff session / RBAC simulation and toast/UI helpers only. Product-domain OpsState is eliminated; NetworkRepository owns airport references and network lifecycle in `gza.network.v1`. It does not own or proxy canonical flight overrides. Admin Flight List, Flight Detail, Dashboard and shared Quick Edit use FlightRepository query/mutation hooks directly; FlightRepository is the dated/effective-flight authority. ScheduleRepository owns recurring planning and structured effects; DatedServiceResolver now projects current service discovery from Schedule and Network authority.

## Phase 6B2A — Sellable Commercial Catalog & Pricing Authority

**Complete / Accepted Source / Accepted Release / Deployed by Owner (historical checkpoint)**, accepted engineering SHA: `1c5e6b6259add7b59199725f6b23324e8d1c58eb`; deployed runtime source: `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`; owner-deployed release: `2751e22be91ad74eacc9213489a57a21baf04807`. Deployment was confirmed by the product owner; Git/source/release provenance was independently checked after deployment. Phase 6B1 remains a historical completed phase (release `f8c0d0bdc579c5c2719670c8387fa543d8d6a170`, runtime source `bcf284df3f0d7b24ec59372bb038ed9ae1e8c934`).

`CommercialCatalogRepository` owns fares, cabin pricing, baggage, meals and assistance on browser-local `gza.commercial.v1`. Public booking, Manage, account meal preferences and the commercial Admin Products tabs share its query/mutation path. Fixed fare/cabin IDs and Essential/Economy multiplier anchors remain structural. Retired services remain resolvable; new selections require active options. BookingRepository independently reads the catalog at command time and commits a versioned pricing snapshot with its calculated total. Existing PNR mutations use their historical snapshot; snapshotless PNRs resolve a literal frozen legacy basis and seal it only on a real mutation. Catalog and booking stores are separate aggregates, not a server-grade multi-store ACID transaction. See [COMMERCIAL_MODEL.md](COMMERCIAL_MODEL.md) for the complete contract.

AdminProvider owns staff session / RBAC simulation and toast/UI helpers only. Product-domain OpsState is eliminated; NetworkRepository owns airport references and network lifecycle in `gza.network.v1`. Aircraft and seat maps are canonicalized under `FleetRepository` (`gza.fleet.v1`). Existing Flight IDs remain compatibility identities; current services use stable Schedule-derived IDs with canonical Network and Schedule facts, retaining additive `aircraftId` linkage. Phase 6B is Complete / Accepted Source / Accepted Release / Deployed by Owner. Phase 6C is Complete / Accepted Source; Phase 7 and Phase 7B are Planned / Unstarted. No backend, payment, or GDS; deployment is owner-confirmed.

Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority (Complete / Accepted Source). Phase 6B2C2A (Complete / Accepted Source); Phase 6B2C2B (Complete / Accepted Source).

## Phase 6B2B accepted-source checkpoint

**Phase 6B2B — Fleet Identity, Seat Layout & Booking Seat Authority: Complete / Accepted Source.** ChatGPT independently accepted engineering at `7f8a2bef613fa0cd37af4f05684c98aebe94d23e` (Correction 01 parent: `1463dee30782d0cc35514c5af55d3f0abfbe32a8`).

Accepted Phase 6B2B source: `d0a411cb8a882298eb32a3222478fbc782ba5556`. Its release and deployment are intentionally pending.

Release status: **Not yet Accepted Release**. Deployment status: **Not yet Deployed**. No Phase 6B2B HostPapa release has been created. Independent accepted-source review precedes any release construction.

Production remains **Phase 6B2A — Complete / Accepted Source / Accepted Release / Deployed by Owner**: release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`. Deployment is owner-confirmed; no independent live-browser verification is claimed.

Phase 6B2C2A is **Complete / Accepted Source**; Phase 6B2C2B remains **Complete / Accepted Source**. Phase 6C, Phase 7 and Phase 7B remain Planned / Unstarted. Phase 6B as a whole is Complete / Accepted Source.

## Phase 6B2C1 - Network Reference Authority & Destination Operations Convergence

**Complete / Accepted Source.** Independently accepted engineering SHA: `9846f9ad90760a5e47ca231a838d146c4d7096a0`. C1 has no Accepted Release and is not deployed. The accepted-source checkpoint is the source-finalization commit on main following this engineering SHA; its immutable SHA is recorded in the finalization handback. Engineering baseline: `d0a411cb8a882298eb32a3222478fbc782ba5556`. NetworkRepository owns fixed AMM/CAI/IST/DOH/DXB/JED/RUH airport names, city/country names, timezone, block duration and active lifecycle in `gza.network.v1`. No product-domain OpsState remains in AdminProvider.

Admin Destination Basics persist operational fields; planning frequency and Route summaries come from ScheduleRepository. Compiled starting fares, public copy and SEO remain read-only. ContentRepository photograph/focal-point preview drafts remain independent and unpublished. First-time Schedule creation validates known Network identity, including inactive destinations. Exact committed replay consults neither Network nor Fleet. Schedule id, destination and direction are immutable; safe non-route edits and stored history remain usable during Network failure.

Phase 6B2B is Complete / Accepted Source; their release/deployment is intentionally pending. Production remains **Phase 6B2A - Complete / Accepted Source / Accepted Release / Deployed by Owner**, release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`. No independent live-browser production verification is claimed.

Phase 6B2C2 - Network & Dated-Service Materialization: Phase 6B2C2A is Complete / Accepted Source; Phase 6B2C2B is Complete / Accepted Source. Public Flight generation, Flight IDs and Booking Flight resolution are unchanged in C1. Phase 6C/7/7B remain Planned / Unstarted; Phase 6B as a whole is Complete / Accepted Source. See [NETWORK_MODEL.md](NETWORK_MODEL.md) for persistence, lifecycle and failure isolation.

## Phase 6B2C2A - Stable Dated-Service Materialization Foundation

**Complete / Accepted Source.** Establishes pure, deterministic projection of recurring schedules onto concrete calendar dates with structured operational effects (`cancelled`, `time`, `aircraft`, `extra`). Versioned URL-safe reversible codec `svc1-<base64url>-<date>` preserves exact Schedule identity without loss. Schedule lifecycle eliminates destructive `remove`; `active = false` is the sole retirement mechanism.

*Historical note (at time of Phase 6B2C2A)*: Prior production was Phase 6B2A (`2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`). Current production is the consolidated Phase 6B owner deployment (`8e3136c22156c9acf800d25e94e8cd3d29a8bfc8`, source `2749c26714258871c32bd2b14a75fc4e87a68b62`). Phase 6C is Implemented / Awaiting Independent Review; Phase 7 and Phase 7B remain Planned / Unstarted. See [DATED_SERVICE_MODEL.md](DATED_SERVICE_MODEL.md).

## Phase 6B2C2A accepted-source checkpoint

**Phase 6B2C2A Complete / Accepted Source.** ChatGPT independently accepted engineering at `429ca82dfa3db0453feeab5b53bb45e9e14cf45a` (reviewed original implementation: `2e1a3e626c48836384cb22ed57a4d6c4a13e7be3`). Accepted C2A source is `412fc2b4f79e01da0607b5bca44e01d76156a634`; the source-finalization handback records its provenance. C2A has no Accepted Release and is not deployed.

Phase 6B2B and Phase 6B2C1 are Complete / Accepted Source; their release/deployment is intentionally pending. Production remains owner-deployed Phase 6B2A, Complete / Accepted Source / Accepted Release / Deployed by Owner: release `2751e22be91ad74eacc9213489a57a21baf04807`, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`. Phase 6B2C2B remains Complete / Accepted Source; Phase 6C, Phase 7 and Phase 7B remain Planned / Unstarted. Phase 6B as a whole is Complete / Accepted Source. The historical C2A finalization performed no public or Booking discovery cutover, stored identity migration, release or deployment. C2B current behavior is described below.

## Phase 6B2C2B - Canonical Dated-Service Discovery & Booking Cutover

**Complete / Accepted Source.** Baseline accepted source: `412fc2b4f79e01da0607b5bca44e01d76156a634`. Phase 6B2C2A remains Complete / Accepted Source (accepted engineering `429ca82dfa3db0453feeab5b53bb45e9e14cf45a`). Phase 6B as a whole is Complete / Accepted Source.

Current authority is NetworkRepository + ScheduleRepository + read-only compiled route merchandising price, projected by the shared DatedServiceResolver into `svc1-*` Flights, then composed with canonical FlightOverride. Current search, monthly sellability, Home/public boards, Admin search and new public/desk Booking creation use this chain. Valid empty Schedule storage produces zero current services; corrupt Schedule/Network authority fails truthfully without legacy discovery fallback.

New Booking commands resolve current service IDs only. Committed submission replay precedes every external authority read. Command-time Commercial/Fleet/Schedule/Network snapshots are composed with transaction-current FlightOverrides, and Flight/pricing/seat-layout snapshots plus total commit together in `gza.repo.v1`. This is browser command-time snapshot composition, not multi-store ACID.

Broad Flight lookup retains stored Booking Flight snapshots for history. Operational boards retain only confirmed-PNR snapshots and relevant override-only legacy Flights; cancelled PNRs cannot independently retain a retired board row. Current bases take precedence when available. Existing PNR mutations can fall back to their stored Flight plus current override during planning removal or authority corruption. Historical pricing and seat-layout snapshots remain authoritative. Planning deactivation is not retroactive cancellation: explicit structured cancellation or FlightOverride cancellation supplies operational truth.

The frozen legacy generator is compatibility-only. There is no generated Flight persistence store, hardcoded cutover date, PNR/draft/override identity migration, backend or cross-device claim. Browser-local `svc1-*` Flight Detail uses generic static metadata because prerender cannot read local Schedule/Network state. Booking route selectors use active Network routes; compiled destination information pages remain available.

Production remains **Phase 6B2A - Complete / Accepted Source / Accepted Release / Deployed by Owner**, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`, release `2751e22be91ad74eacc9213489a57a21baf04807`. Phase 6B2B, Phase 6B2C1 and Phase 6B2C2A release/deployment remain intentionally pending. C2B engineering is accepted and source is finalized; C2B has no Accepted Release and is not deployed. Phase 6C / 7 / 7B remain Planned / Unstarted.


## Phase 6B2C2B accepted-source checkpoint

**Phase 6B2C2B Complete / Accepted Source. Phase 6B Complete / Accepted Source.** ChatGPT independently accepted engineering at `b4cd96a3eda97ae1442119c4fde03c0a463c7cb4` (original implementation: `ff46f8e7ab606731be679eaedbada9e07d09e91a`; accepted C2A baseline: `412fc2b4f79e01da0607b5bca44e01d76156a634`). Acceptance is recorded in the owner-supplied 2026-10-06 master handoff. The accepted-source candidate is the docs/status-only finalization commit introducing this checkpoint; its exact SHA is recorded in the publication handback. Independent accepted-source verification precedes main fast-forward.

PNR-facing Flight reads use `(Booking reference, leg)`: current service when available, otherwise that exact leg's stored Flight, then current FlightOverride. Historical pricing and seat-layout snapshots remain unchanged. Admin Check-in can discover confirmed PNRs using their own snapshots during planning failure, with an explicit localized warning. Public/new-sale authority still fails truthfully. Cancelled PNRs preserve their own history without independently resurrecting retired operational board rows.

Production remains **Phase 6B2A — Complete / Accepted Source / Accepted Release / Deployed by Owner**, runtime source `ae8c1e8071cf7f6412247f043e16a3ec2c88bd73`, release `2751e22be91ad74eacc9213489a57a21baf04807`. Phase 6B2B, Phase 6B2C1, Phase 6B2C2A and Phase 6B2C2B release/deployment remain pending. Phase 6B has no consolidated Accepted Release and is not deployed as a consolidated milestone. No live production verification is claimed by this finalization.

**Next milestone:** independently verify accepted source, then construct/review the consolidated Phase 6B HostPapa release for owner deployment and production reconciliation. Phase 6C / 7 / 7B remain Planned / Unstarted. This finalization changes no runtime implementation. The immutable planning snapshot is [the 2026-10-06 master handoff](../GAZA_GATEWAY_MASTER_AI_AGENT_HANDOFF_ROADMAP_2026-10-06.md); its pre-finalization refs/status are historical snapshot facts, not moving current refs.

## Phase 6B consolidated release & Phase 6C status (historical checkpoint)

Phase 6 engineering implementation is complete. Phase 6 and Phase 6C are **Complete / Accepted Source**, published to main at `4374e9f37cd6f23798cfd20ccfa7e43bcec77f89`. Accepted Phase 6C engineering and Correction 05: `d5dd2942fad517cc5f1be353ad206511cc0724cc`; original implementation: `3ac3c8a078f7ffa82b411744b656c3575a3955c4`.

The final Phase 6 static package is published on HostPapa at `421101d294674aaa503565cfc4df9fafb62527ba`, packaging source `4374e9f37cd6f23798cfd20ccfa7e43bcec77f89`. Owner deployment of that package has not been confirmed. Phase 6C is not deployed.

Confirmed production remains **Phase 6B - Complete / Accepted Source / Accepted Release / Deployed by Owner**: release `8e3136c22156c9acf800d25e94e8cd3d29a8bfc8`, deployed runtime source `2749c26714258871c32bd2b14a75fc4e87a68b62`. Deployment is confirmed by the product owner. No independent live bundle verification claimed for this reconciliation.

## Current checkpoint — Phase 13A

Phase 6, Phase 7 and Phase 7B are **Complete / Accepted Source**. Phase 7 was independently accepted at `6b0240f1692beecc3f030775c0a25a68758a279b`; Phase 7B was independently accepted and published to main at `deb9f6e2a4246f4f5c70ca1b56797ccf0588388e`.

The combined Phase 7 + 7B HostPapa release is `f68adcc60ec195f8099252b0d2d78da9a7c5ef4e`, packaging source `deb9f6e2a4246f4f5c70ca1b56797ccf0588388e`. Deployment is recorded on the product owner's instruction to consider it done; Codex performed no cPanel deployment or independent live verification. The release also includes accepted Phase 6C.

**Phase 8 — Visual System & Assets Finalization: Complete / Accepted Source**, independently accepted and published to main at `55981908a75a38de31538c387d103e548c04f91d`. No separate Phase 8 release was constructed.

**Phase 9 — Arabic, RTL, Accessibility & Responsive Certification: Complete / Accepted Source**, independently accepted and published to main at `f3d7377720c951ea659c076d2e8128d10c1a827a`. See [Phase 9 implementation and evidence](PHASE9_ACCESSIBILITY_RTL.md). **Phase 10 — Durable Regression & CI Hardening: Complete / Accepted Source**, independently accepted and published to main at `277e07a29188ab5ca07df008c011f42ec964641b`. **Phase 11 — SEO, Performance & HostPapa Certification: Complete / Accepted Source** at `e1b4e3c62238357209990e80b00cc4635f621b76`. See [focused regression and CI policy](REGRESSION_AND_CI.md). **Phase 12 — Backend Readiness & API Contracts: Complete / Accepted Source**, independently accepted at `7dab821d7d205b41ae925e013fe9c69a97a7e875`. Deliverables remain design/contracts and development tooling, not deployed or functioning runtime. Consolidated Phase 8–11 release a47afded49e900b75c907e7230ca4dfef5b3f91e is published on origin/hostpapa-deploy from source e1b4e3c62238357209990e80b00cc4635f621b76; live cPanel deployment remains unverified and owner-managed.

**Proposed Phase 13A local backend foundation candidate: Implemented / Awaiting Independent Review**, not accepted or deployed. Implementation covers isolated Laravel 13 / PHP 8.4 / PostgreSQL 17 infrastructure migrations and system endpoints only. Frontend mock repositories remain default. Typed client operates only via explicit nonproduction opt-in without authentication. Phase 13B–G remain Planned / Unstarted; no authentication, domain inventory, booking persistence, payments or CMS publication have been implemented. Original Phase 13A reachable staging and backend CI definition-of-done gates remain deferred and unmet under owner prohibition on provisioning and automatic GitHub Actions. Local proof does not satisfy remote gates; no paid services, DNS, real credentials, or traffic cutover are authorized or provisioned. Reference final documentation at [docs/backend/phase13a-foundation.md](./backend/phase13a-foundation.md), [docs/backend/phase13a-runtime.md](./backend/phase13a-runtime.md), [docs/backend/phase13a-system-client.md](./backend/phase13a-system-client.md), and [docs/backend/phase13a-provider-seams.md](./backend/phase13a-provider-seams.md).

Editorial and archive proposals remain browser-local drafts, not public publication. HC-2/HC-3 rights, evidence, publication basis and documentary/future media separation remain unchanged. Earlier milestone sections are historical and do not override this checkpoint.
