# Typed editorial content model

Phase 4B establishes three canonical editorial documents. This is a client-side, pre-operational prototype on static HostPapa hosting. The compiled source records are the only globally published content. A browser-local draft is a private preview in that browser; saving it does not publish it.

## Content inventory and ownership

| Current material | Classification | Owner after Phase 4B |
| --- | --- | --- |
| Home hero, heritage, chapter summaries, destination/travel/archive introductions | Editorial content | `src/content/published/home.ts` |
| Travel introduction, five guide sections and checklist points | Editorial content | `src/content/published/travel.ts` |
| Airport Past introduction, five timeline records and placeholder media seeds | Historical editorial content | `src/content/published/airport-past.ts` |
| Book, Cancel, Search, Save, validation, flight/booking status, form and workflow labels | Application UI strings | `src/lib/i18n-public.ts`, `src/lib/i18n-admin2.ts` |
| Flights, gates, aircraft, fares, seats, booking records and operational destination facts | Domain data | `src/lib/data.ts` and Phase 4 repositories |
| Approved imagery, truth class and accessible descriptions | Media metadata | `src/lib/media.ts` and `media-policy.ts`; full management is Phase 7B |
| Site-wide contact, navigation, footer, appearance and service settings | Settings | Existing modules pending Phase 4C |
| Privacy, terms and critical prototype disclosure | Legal/system safety | Current compiled source; later governance requires stronger permission and revision workflow |
| Present documentary text, Future concepts, About, Contact, destination editorial text and archive | Editorial content pending migration | Current route/i18n/admin fixtures; Phase 7 and later bounded slices |
| Admin inbox, check-in desk, analytics, CRM and operational simulation | Simulation fixtures | Existing Admin modules; Phase 6/7 |

Some legacy editorial keys remain in i18n while other routes still reference them. The three migrated public routes read the canonical documents. `data.ts` no longer maintains separate Travel and Past arrays; `admin-mock.ts` no longer maintains separate Home, Travel and Past proof arrays.

## Domain and publishing

`src/content/types.ts` owns `LocalizedText` with explicit `en` and `ar`, `HomeContent`, `TravelContent`, `AirportPastContent`, page SEO, stable section/item IDs, `EvidenceState` and `MediaReference`. Ordered arrays are the single ordering convention; IDs survive reordering and copy changes. Home's hero, search and board positions are required and locked. Other Home section policies declare whether later editors may hide/reorder them; Phase 4B does not provide a Home editor.

`src/content/schema.ts` validates document identity and schema version, known fields, bilingual text, unique IDs, visibility, provenance and media references. No HTML blobs, executable URLs or arbitrary media paths are accepted. Past currently has only approved placeholder seeds. The approved media catalog has no documentary historical assets, so Past media references to current brand or Future concept assets are rejected. The one `verified` timeline classification already present in the source remains as it was; the page's overall provisional prototype disclosure remains visible. Empty `sourceRefs` do not become invented evidence.

The published records are plain serializable TypeScript data imported by their respective routes at build/prerender time. Normal public URLs always use them, even if that browser has a draft. SEO editorial fields are typed and available for later route-head convergence; route identity and canonical URLs remain code-owned.

## Local draft and preview

`LocalContentRepository` has an async contract for published, draft and preview reads, save, discard and subscription. Drafts live only in `localStorage["gza.content.draft.v1"]` as `{ schemaVersion: 1, drafts: { ... } }`. The repository validates reads and writes. Missing, malformed or unknown-version storage falls back to published content. A failed storage write rejects before notification; the Admin editor shows an error and keeps unsaved text on screen. Browser `storage` events refresh explicit previews in other tabs.

`?contentPreview=1` selects a local draft after hydration. The initial server and client render use compiled content, avoiding a hydration mismatch. Preview shows “Stored in this browser” and “Not published”. Normal `/travel`, `/ar/travel`, Home and Past routes never apply drafts.

The Admin Website Travel tab is the bounded real authoring proof: edit English or Arabic section title, body and checklist text; Save Draft; refresh; preview both locales; Discard Draft. The other language remains in the same document. `content.edit` gates mutation. Home and Past Admin proof panels read the same published documents through transitional view adapters and are read-only. Other Admin CMS fixture controls remain simulation work for Phase 7.

There is no browser-global Publish action for the migrated Travel module. Interim promotion is: owner reviews a local draft, exports or supplies the approved serialized payload, engineering updates the compiled published source, tests and builds, then deploys a verified HostPapa release. A future backend may implement secure shared drafts and publication behind the same content contract. No browser-local draft can publish the static site.

## Boundaries

Phase 4B does not migrate appearance preview (`gza.skin.preview.v1`), booking/flight repositories (`gza.repo.v1`), staff simulation (`gza.admin.v1`), booking draft/account/travelers (`gza.store.v1`), or OpsState. Phase 4C addresses settings and appearance. Phase 7 expands CMS authoring/search/dashboards. Phase 7B adds media provenance and asset controls. Backend publication is a later phase.
