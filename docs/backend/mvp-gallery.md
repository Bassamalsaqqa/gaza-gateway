# Gaza Gateway MVP — Gallery Publication Architecture

## Scope and Invariants

This slice implements the **W3 gallery publication runtime slice** for Gaza International Airport.

Existing Admin staff can curate, order, toggle visibility, and customize bilingual display titles/captions for the Historical & Documentary Gallery. Separate public visitors load the active published configuration directly from PostgreSQL at runtime.

### Engineering Invariants

1. **Compiled Baseline Authority & Integrity**:
   - The compiled documentary archive (`src/lib/archive/catalog.ts` and `sources.ts`) remains the authoritative foundation.
   - Editable fields are strictly limited to:
     * `recordId` selection and ordering
     * `visible` boolean
     * plain bilingual display title overrides (`title.en`, `title.ar`)
     * plain bilingual display caption overrides (`caption.en`, `caption.ar`)
   - Source provenance, historical dates, date precision, evidence verification statuses, rights holders/licenses, subjects, phases, and media asset URLs remain compiled authority. No user uploads, invented archive provenance, or AI concept reclassifications are permitted.

2. **Deterministic Approved Manifest**:
   - Only IDs already eligible for published display in the genuine compiled gallery (currently 42 curated records: 38 documentary records and 4 verified video presentations) may be selected.
   - Generated deterministically from genuine source catalog via `backend/scripts/generate-gallery-manifest.mjs` into `backend/resources/gallery/manifest.json`.
   - Arbitrary, held, or unknown IDs and duplicate IDs are rejected by the validator with HTTP 422.
   - Caller `ownerApproved` booleans are strictly forbidden and rejected recursively across all payloads.

3. **Database Isolation & Append-Only Revision History**:
   - Isolated tables: `gallery_documents`, `gallery_revisions`, `gallery_published_revisions`, `gallery_audit_events`.
   - Optimistic concurrency control via `expectedRevision`.
   - Revisions, published revisions, and audit records are strictly immutable at the PostgreSQL level via trigger `gallery_history_immutable()` preventing UPDATE, DELETE, or TRUNCATE.
   - Revisions compute deterministic cryptographic digests via `sha256(convert_to(snapshot_bytes, 'UTF8'))`.

4. **Public & Editorial Isolation**:
   - Unauthenticated public reader endpoint `GET /gallery/published` only returns the active published configuration. Drafts and unapproved mutations are never visible to the public.
   - Empty database (never published) returns HTTP 404, which signals the public browser to render the default compiled gallery.
   - Tombstoned (unpublished) gallery returns HTTP 410.
   - Network errors on the public site never fall back silently to stale local storage; errors surface actionable failure states.

5. **Lock Hierarchy & Staff Authentication**:
   - Mutating operations require staff authentication via `RequireEditorialStaffAuth`.
   - Lock acquisition order:
     1. Principal row lock (`staff_users` FOR UPDATE)
     2. Session row lock (`staff_sessions` FOR UPDATE)
     3. Advisory domain lock (`pg_advisory_xact_lock(hashtext('gallery_doc:default'))`)
     4. Gallery document row lock (`gallery_documents` FOR UPDATE)
   - Staff credentials and permissions (`content.edit` for drafts, `admin.manage` for publications/restores) are re-verified within the locked transaction.

## API Operations

| Method | Path | Operation ID | Realm | Required Permission | Description |
|---|---|---|---|---|---|
| `GET` | `/v1/gallery/published` | `getGalleryPublished` | Public | None | Read active published gallery configuration |
| `GET` | `/v1/gallery/editorial` | `getGalleryEditorial` | Staff | `content.view` | Read full gallery configuration with draft/revision state |
| `PUT` | `/v1/gallery/editorial/draft` | `putGalleryDraft` | Staff | `content.edit` | Create or update working draft |
| `POST` | `/v1/gallery/editorial/discard` | `postGalleryDiscard` | Staff | `content.edit` | Discard current working draft |
| `POST` | `/v1/gallery/editorial/publish` | `postGalleryPublish` | Staff | `admin.manage` | Publish draft or revision to public authority |
| `POST` | `/v1/gallery/editorial/unpublish` | `postGalleryUnpublish` | Staff | `admin.manage` | Tombstone active publication from public read |
| `POST` | `/v1/gallery/editorial/restore` | `postGalleryRestore` | Staff | `admin.manage` | Restore previously published revision as new publication |

## Non-Production Gating

Controlled via `backend/config/gallery.php`:
`'enabled' => in_array(env('APP_ENV'), ['local', 'testing'], true)`.
Remote production cutover is disabled until explicit product-owner authorization.


## Codex integration evidence ? 12 October 2026

AGY produced the initial isolated gallery package. Subsequent headless completion attempts timed out without a final report; Codex repaired and independently checked the integrated source. Worker narrative is not acceptance evidence.

- `scratch/gaza_gallery_gate_8cc848fce7383dfe6e7113d724d9bd69`: nine gallery PHP/PostgreSQL tests, 155 assertions passed. That run then failed on missing negative-capture coverage; it is preserved as a failed gate, not relabeled green.
- `scratch/gaza_gallery_gate_aeafe6bf0e89c32332dcdbfb06e9749d`: focused modified capture test passed (71 assertions); seven actual success responses and 51 actual error responses passed schema, content-type and undocumented-status controls. Includes digest/schema corruption returning generic 500, never a compiled fallback. Earlier failures remain preserved.
- Three focused Node adapter tests passed: genuine manifest identity parity, recursive closure/record validation, and display projection preserving provenance. The additional empty-text-object probe passed its focused rerun. Retained HTTP captures were checked against the final text bounds/nullability amendment.
- `scratch/gaza_mvp_browser_a2f642987f6014d2ec4fdf8b`: actual Admin gallery editor Save Draft/Publish followed by independent English desktop and Arabic mobile shared reads passed. Visual inspection retained the existing gallery design and documentary classification. Aborted transport requests are recorded but not certified; completed response bodies are schema-validated. Earlier browser capture-race failures remain preserved.
- Focused frontend compiler/lint checks passed. These are proposed-source snapshots, not the final consolidated W5 gate. No remote services, production cutover, owner deployment approval or external provider delivery are certified.
