# Archive administration — Phase 7B

Status: Phase 7B Complete / Accepted Source at `deb9f6e2a4246f4f5c70ca1b56797ccf0588388e`. Phase 7 accepted source is `6b0240f1692beecc3f030775c0a25a68758a279b`.

## Authorities

Public Gallery, Past and Home continue to use compiled `ARCHIVE_CATALOG`, `SOURCE_REGISTRY` and registered `MEDIA`. The canonical intake catalog contains 67 records, including 38 compiled published image/document records. Eight catalog entries contain YouTube references; only four separately curated, host/ID-validated references are public video presentations. Catalog presence is not publication approval.

`gza.archive.draft.v1` owns local proposed archive metadata and source changes. It is separate from `gza.content.draft.v1`: rights, owner-intake eligibility, evidence and source relationships require contextual domain validation. It does not own assets, raw media masters, public static publication or generic editorial documents.

The version-1 envelope is `{schemaVersion: 1, revision, records, sources}`. Records and sources are keyed by stable ID. Missing or valid empty storage means no local drafts, with no write on read. Corrupt or unsupported storage fails closed and is not repaired. Registry construction is lazy; archive failures do not require unrelated booking domains to fail. Studio uses an isolated in-memory repository.

## Draft validation

The accepted HC schema checks are retained in `createArchiveRecordSchema(sources)`. The public `archiveRecordSchema` remains bound to compiled `SOURCE_REGISTRY`. Draft validation supplies a detached compiled-plus-local source projection and revalidates the entire catalog inside the write lock. Editing or discarding a source cannot silently break linked drafts, compiled published records, or the four curated public video references.

Record ID, slug, medium, media ID, YouTube ID, original filename, intake reference, duplicate lineage and audited curator status are immutable. There is no arbitrary record/asset creation or upload path. Metadata, rights, evidence, references and proposed state may be staged only when valid. Proposed published state requires an explicit permitted publication basis and all accepted licensing/owner-eligibility/duplicate/documentary/video guards. Unknown reuse rights never become license clearance merely through owner-directed display.

Added draft constraints enforce bounded plain text, safe HTTP/HTTPS URLs without credentials, valid calendar dates and precision, unique relationships, known record/timeline references and bounded envelopes. New local sources require unique canonical `src-*` identity; they remain proposed citations, not independently verified upstream facts.

## Concurrency and failure

Every write requires the caller's expected saved draft (null when absent). Same-origin Web Locks serialize writes; a per-instance queue serializes local commands. The locked reread rejects a changed baseline with `draft_conflict`. Current sibling/source changes are preserved and revalidated. Failed persistence causes zero adoption or subscriber notification. Genuine repeat saves/discards produce zero revision increase or audit event. Storage events invalidate the centralized archive query; reads never silently repair raw bytes.

Administrative command wrappers enforce editor/admin role and use detached committed receipts. The archive command commits first, then a bounded semantic activity event records the target, changed root field names and state. Full captions, notes and records are not dumped into activity storage. Audit failure warns after a successful save; it does not claim the save rolled back. No cross-store ACID or server audit is implied.

## Publication and media truth

Saving or discarding a local draft does not change the public Gallery/Past/Home, static head or HostPapa package. Proposed publication transitions require later engineering promotion, source review and release; there is no live Publish action or false publication toast. Asset variants resolve from registered runtime paths and dimensions. Format is read from the actual path suffix, not assumed to be WebP. File size and public usage are explicitly unavailable where the runtime registry does not track them. Raw intake filenames are plain metadata, not downloadable owner-master links. External video players are not eagerly loaded or mirrored.

## Curator workspace

Archive and source catalogs use the effective local proposal overlay, with explicit draft badges. Archive aggregate publication counts remain compiled facts; proposal-state chips do not represent public publication. Media variants remain registered compiled asset truth. Source proposals can be created, edited and referenced, but are never automatically promoted or described as independently verified facts.

Record editing supports both locales, chronology, people, subjects, source and timeline/record relationships, featured status, notes, rights/evidence and proposed publication basis. Immutable intake/asset/duplicate lineage is displayed read-only. Editors/admins use audited commands; viewers inspect only. A failed read discloses compiled-only inspection and disables archive writers without disabling the independent Phase 7 CMS.

Open editor inputs and their expected saved baseline are retained across background refreshes. Native cross-tab changes show a conflict; keeping local edits cannot bypass the locked baseline check. Explicit reload adopts the latest effective proposal. Validation switches to the invalid locale, associates errors with fields/groups, focuses the first invalid field, retains drafts, and lists any affected references outside the current editor. Dirty close/tab/navigation requires confirmation.

Asset intake remains an engineering workflow: checksum/deduplicate and inspect owner originals outside public output, generate optimized derivatives, register truth/provenance, validate rights and promote through reviewed source. The browser exposes neither raw masters nor an upload/publish action. No new owner asset intake was requested in this phase.
