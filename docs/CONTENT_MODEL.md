# Typed editorial content model

Phase 4B establishes three canonical editorial documents. This is a client-side, pre-operational prototype on static HostPapa hosting. The compiled source records are the only globally published content. A browser-local draft is a private preview in that browser; saving it does not publish it.

## Content inventory and ownership

| Current material | Classification | Owner after Phase 4B / HC-0 |
| --- | --- | --- |
| Home hero, heritage, chapter summaries, destination/travel/archive introductions | Editorial content | `src/content/published/home.ts` |
| Travel introduction, five guide sections and checklist points | Editorial content | `src/content/published/travel.ts` |
| Airport Past introduction, five source-backed timeline chapters with verified source citations | Historical editorial content | `src/content/published/airport-past.ts` |
| Airport Present introduction, four fact cards, three dossiers, spatial & forward outlook | Documentary editorial content | `src/content/published/airport-present.ts` |
| Book, Cancel, Search, Save, validation, flight/booking status, form and workflow labels | Application UI strings | `src/lib/i18n-public.ts`, `src/lib/i18n-admin2.ts` |
| Flights, gates, aircraft, fares, seats, booking records and operational destination facts | Domain data | `src/lib/data.ts` and Phase 4 repositories |
| Approved imagery, truth class and accessible descriptions | Media metadata | `src/lib/media.ts` and `media-policy.ts`; full management is Phase 7B |
| Site-wide contact, appearance settings | Settings | `src/lib/settings/` (`SettingsRepository`, `gza.settings.draft.v1`) |
| Visitor contact enquiries, admin inbox workflow | Contact domain aggregate | `src/lib/contact/` (`ContactRepository`, `gza.contact.v1`) |
| Privacy, terms and critical prototype disclosure | Legal/system safety | Current compiled source; later governance requires stronger permission and revision workflow |
| Future concepts, About, destination editorial text and archive | Editorial content pending migration | Current route/i18n/admin fixtures; Phase 7 and later bounded slices |
| Check-in desk, analytics, CRM and operational simulation | Simulation fixtures | Existing Admin modules; Phase 6/7 |

Some legacy editorial keys remain in i18n while other routes still reference them. The four migrated public routes read the canonical documents. `data.ts` no longer maintains separate Travel and Past arrays; `admin-mock.ts` no longer maintains separate Home, Travel and Past proof arrays.

## Domain and publishing

`src/content/types.ts` owns `LocalizedText` with explicit `en` and `ar`, `HomeContent`, `TravelContent`, `AirportPastContent`, `AirportPresentContent`, page SEO, stable section/item IDs, `EvidenceState` and `MediaReference`. Ordered arrays are the single ordering convention; IDs survive reordering and copy changes. Home's hero, search and board positions are required and locked. Other Home section policies declare whether later editors may hide/reorder them; Phase 4B does not provide a Home editor.

`src/content/schema.ts` validates document identity and schema version, known fields, bilingual text, unique IDs, visibility, provenance and media references. No HTML blobs, executable URLs or arbitrary media paths are accepted. In HC-2, `airportPastSchema` was hardened with a `documentaryMedia` validator requiring approved media IDs with `"historical-documentary"` truth class, and a refinement requiring every verified timeline entry to have at least one valid source reference resolvable in `SOURCE_REGISTRY`. Seeded placeholder timeline photos were removed, and all 5 chapters (planning, opening, operations, closure, memory) are source-backed with verified citations (Oslo II 1995 Annex I Article XIII, The New York Times 1998 opening, The Washington Post 1998 Clinton dedication, World Bank 2007, UNSCO 2000, UNRWA 2001, ICAO Council 2002, Gisha 2008, Saleh & Hegab). Empty `sourceRefs` on verified entries are strictly rejected by schema.

The published records are plain serializable TypeScript data imported by their respective routes at build/prerender time. Normal public URLs always use them, even if that browser has a draft. SEO editorial fields are typed and available for later route-head convergence; route identity and canonical URLs remain code-owned.

## Local draft and preview

`LocalContentRepository` has an async contract for published, draft and preview reads, save, discard and subscription. Drafts live only in `localStorage["gza.content.draft.v1"]` as `{ schemaVersion: 1, drafts: { ... } }`. The repository validates reads and writes. Missing, malformed or unknown-version storage falls back to published content. A failed storage write rejects before notification; the Admin editor shows an error and keeps unsaved text on screen. Browser `storage` events refresh explicit previews in other tabs.

`?contentPreview=1` selects a local draft after hydration. The initial server and client render use compiled content, avoiding a hydration mismatch. Preview shows “Stored in this browser” and “Not published”. Normal `/travel`, `/ar/travel`, Home and Past routes never apply drafts.

The Admin Website Travel tab is the bounded real authoring proof: edit English or Arabic section title, body and checklist text; Save Draft; refresh; preview both locales; Discard Draft. The other language remains in the same document. `content.edit` gates mutation. Home and Past Admin proof panels read the same published documents through transitional view adapters and are read-only. Other Admin CMS fixture controls remain simulation work for Phase 7.

There is no browser-global Publish action for the migrated Travel module. Interim promotion is: owner reviews a local draft, exports or supplies the approved serialized payload, engineering updates the compiled published source, tests and builds, then deploys a verified HostPapa release. A future backend may implement secure shared drafts and publication behind the same content contract. No browser-local draft can publish the static site.

## Boundaries

Phase 4B established typed editorial content. Phase 4C converged settings and appearance drafts into `SettingsRepository` (`gza.settings.draft.v1`). Phase 5A converged passenger accounts and saved companions into `PassengerRepository` (`gza.passenger.v1`), establishing that passenger state never stores passwords or security credentials. Phase 5B converged booking draft state (`BookingDraftRepository`) and effective flight discovery. Phase 5C converged Manage, Check-in, and Boarding Pass onto canonical repositories (`BookingRepository`, `FlightRepository`), accepted and merged into main. HC-0 and HC-1 established the Present documentary dossier (`airport.present`) and archive foundation (`src/lib/archive/`). HC-2 established canonical archive publication (`getPublishedArchiveRecords()`), authoritative external source references (`SOURCE_REGISTRY`), source-backed Past timeline chapters, and intake audit, accepted and merged into main. HC-3 is Complete / Accepted Source on main: owner archive visual integration models explicit publication basis (`rights-cleared`, `product-owner-directed-display`, `external-embed`), displaying 37 photographs (36 owner-directed + 1 licensed Gisha) and 1 owner-directed document, with 124 responsive WebP derivatives for the 37 owner records, and rendering 4 verified external video references in a lightweight player without local video files. Phase 5D — Public Contact Workflow Convergence is implemented on feature branch `phase5d/public-contact-workflow-convergence` awaiting independent review (not accepted/complete). Staff simulation (`gza.admin.v1`), booking wizard draft (`gza.booking.draft.v1`), and OpsState remain for subsequent phases. Phase 6 addresses admin workflows. Phase 7 expands CMS authoring/search/dashboards. Phase 7B adds media provenance and asset controls. Backend publication is a later phase.

HC-3 owner-directed display is a publication decision, not copyright clearance. Eligible intake IDs are bound to their audited filename, intake reference, medium and media ID; unknown rights and cautious evidence status remain explicit. Known rights/provenance holds, the duplicate and the digital illustration remain excluded from public selectors. Verified YouTube references are external embeds, not locally published video assets.

## Accepted HC-3 source and production checkpoint

The owner reports deployment of the verified HostPapa package `86bb9d7ff5d05279824ecb495140bd294558e499`, built from accepted HC-3 implementation `e99fefa62d1be76050ec11ee962e1ea524b21974`. Source `main` contains that same implementation plus this documentation reconciliation, intentionally one documentation-only commit ahead of production source. No independent live browser verification is claimed; the release and production are unchanged by this reconciliation.
