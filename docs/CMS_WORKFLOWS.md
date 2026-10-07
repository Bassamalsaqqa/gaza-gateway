# Phase 7 CMS workflows

> **Status**: Phase 7 Complete / Accepted Source. Independently accepted and published to main at `6b0240f1692beecc3f030775c0a25a68758a279b`. Phase 7B media/provenance administration is implemented separately and awaiting independent review. No editorial batch release or deployment yet.

## Content and authority

Eight typed documents share `ContentRepository`: `home`, `travel`, `airport.past`, `airport.present`, `airport.future`, `destinations.presentation`, `destinations.editorial`, and `pages.information`.

Compiled `src/content/published/` documents remain the only globally published editorial authority. Drafts use the existing `gza.content.draft.v1` envelope: `{ schemaVersion: 1, drafts: { ... } }`. No new persistence key or read-time migration is introduced.

Editorial documents contain bilingual plain text, stable item identities, ordering, visibility, approved media references, source citations where required, and SEO. They do not own route availability, schedules, aircraft, fares, bookings, contact settings, or archive publication decisions. Network, Schedule, Fleet, Commercial, Booking, Settings and the archive retain those authorities.

Future concepts retain their mandatory illustrative classification outside editable prose. Past verified chapters require known source citations. General-page editing does not remove the fixed prototype disclosures or replace the real Contact form and Settings-owned contact details. Navigation remains code-owned through the shared definitions in `src/lib/site-navigation.ts`; this phase does not invent a navigation draft schema.

## Storage and conflict semantics

Missing storage and a valid empty draft collection mean no drafts. Corrupt envelopes, unsupported versions, unavailable storage and invalid requested documents produce typed `ContentError` failures. Reads preserve raw bytes and do not silently repair storage. Malformed sibling documents remain untouched and do not prevent a healthy document from being edited.

Writes detach and validate the caller's values, serialize commands, acquire the browser Web Lock where available, reread canonical storage, and compare the requested document's stored draft against `expectedDraft`. A stale baseline produces `draft_conflict`, with no overwrite or success notification. Other documents are preserved. Identical saves and absent-draft discards suppress writes and notifications.

Persistence completes before adopting the next in-memory state. Failed writes retain the operator's draft and show a localized error. Storage events refresh readers in other tabs. A dirty editor retains local input when a remote draft changes until the operator explicitly reloads it. Late reads and late command completions must not replace a newer editing session.

The repository registry supplies the shared persistent content repository. Studio uses an explicitly isolated in-memory repository, without writing production draft or activity stores.

## Permissions and activity

Administrative draft commands require an admin/editor actor. Viewer controls are read-only. Successful meaningful saves/discards produce semantic events in `gza.activity.v1`; genuine no-ops and failed content commands produce no event.

Content commits first; the audit append is a separate local-store command. An audit failure warns truthfully without pretending the committed content change rolled back. Events contain document identity, action and bounded structural counts, rather than complete authored prose or serialized documents.

## Public preview and static metadata

Normal public URLs always show compiled content. `?contentPreview=1` explicitly requests the current browser's local draft after hydration. First server/client paint uses compiled data. Preview failure shows published content with a localized explanation and leaves stored bytes unchanged.

Static route heads consume compiled bilingual SEO only. HostPapa prerender cannot read a visitor's browser-local drafts. Saving a draft is not publishing, deploying, emailing or remotely sharing it.

## Inventory and implementation boundary

Admin content inventory, dashboard draft counts and global content search derive from the eight typed documents. They show unavailable draft authority explicitly and do not invent publication dates, translation gaps or fixture entities.

Codex collected and independently reviewed AGY's Home/Travel and Airport/destination/informational-page editor tasks. Integration includes corrected field associations/focus, busy and dirty-navigation protection, explicit storage errors and retry, remote-draft conflict handling, read-only evidence classification, truthful deferred reference catalogs, and Arabic mobile wrapping. Navigation is read-only; approved archive/media/provenance administration remains deferred to Phase 7B.

Phase 7B media/provenance administration, backend publication, email, remote CMS and unrelated visual redesign are deferred. Whole Phase 7 must be committed and pushed before independent ChatGPT engineering review.
