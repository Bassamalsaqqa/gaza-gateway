# Gaza Gateway — Settings Model Architecture (Phase 4C)

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
| **Bookings & Operational Flights** | `gza.repo.v1` | **Canonical Repository Store**. Governed by `RepoStorageCoordinator`. Bookings & overrides. |
| **Booking Wizard Draft** | `gza.booking.draft.v1` | **Canonical Booking Draft Store**. Governed by `BookingDraftRepository` for active booking wizard flows. |
| **Passenger Account & Travelers** | `gza.passenger.v1` | **Canonical Passenger Store**. Governed by `PassengerRepository` for account profile and saved travelers. |
| **Content & Travel CMS** | `gza.content.draft.v1`| **Canonical Content Draft Store**. Travel CMS, destination media, and editorial drafts. |
| **Legacy Public State** | `gza.store.v1` | Closed legacy migration/rollback source only, no active public writer. |
| **Staff & Admin Auth** | `gza.admin.v1` | Staff session token (`staffId`) and legacy admin overrides. |
| **Airport Operations** | In-memory `OpsState` | Airport operations operational control board state. |

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

Phase 5D is Complete / Accepted Source / Deployed by Owner. Phase 6A — Admin Commercial Desk Convergence — is Complete / Accepted Source / Accepted Release / Deployed by Owner (accepted engineering SHA: `59e2e0ce9b56bc492d7c7a2bfc5a0df15fd58fea`). Phase 6B1 is Implemented / Awaiting Independent Review on its feature branch. Phase 6B2 (Network, Fleet & Sellable Product Authority), Phase 6C (Admin Directory Staff & Activity Convergence), Phase 7, and Phase 7B remain Planned / Unstarted.

## Current Phase 6A production checkpoint and Phase 5D deployment history

Phase 6A — Admin Commercial Desk Convergence — is Complete / Accepted Source / Accepted Release / Deployed by Owner. Current owner-deployed production release: `b5cff4db4b6e087907a9733ffd841880439fbfdb`; deployed runtime source: `2ae1a876018992649074cbed1ebf0560e4da03ff`; accepted engineering SHA: `59e2e0ce9b56bc492d7c7a2bfc5a0df15fd58fea`. Deployment is confirmed by the product owner. Git/release provenance and the package were independently verified before deployment; no independent live-browser verification from the ChatGPT environment is claimed. Main may advance through documentation-only commits while the deployed runtime source remains unchanged. Phase 5D is a historical completed phase: Complete / Accepted Source / Deployed by Owner (release `898adc36701f138b54787fa14caecf55321b453f`, source `2e166ed815010728d25a891939b84db4109ae65e`). Phase 6B1 — Dated Flight Operations & Recurring Schedule Persistence (Implemented / Awaiting Independent Review). Phase 6B2 — Network, Fleet & Sellable Product Authority (Planned / Unstarted). Phase 6C — Admin Directory Staff & Activity Convergence, Phase 7 and Phase 7B remain Planned / Unstarted.

## Phase 6B1 feature candidate

Phase 6B1 — Dated Flight Operations & Recurring Schedule Persistence — is **Implemented / Awaiting Independent Review** on `phase6b1/flight-ops-schedule-persistence`, based on source `43369c032ae9f7c3b08b5997dae35957050c6bb4`. Admin dated-flight reads and booking/check-in metrics use canonical repository queries; override writers commit through FlightRepository. Recurring planning schedules have a separate `ScheduleRepository` / `gza.schedule.v1` authority, independent of dated-flight generation. Schedule edits do not change Public Flights, booking search or persisted flight IDs. Products and destination configuration remain session-only; there is no monolithic durable OpsState. See [Schedule model](SCHEDULE_MODEL.md) for the storage and planning boundary.

Phase 6B2 — Network, Fleet & Sellable Product Authority — is Planned / Unstarted. Phase 6C, Phase 7 and Phase 7B remain Planned / Unstarted. Phase 6B as a whole is not complete. The owner-deployed Phase 6A release/source checkpoint recorded above is unchanged. Local HostPapa commands validate this candidate only; no new release or deployment is performed.
