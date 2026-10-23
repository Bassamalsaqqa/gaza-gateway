# Owner-controlled CMS publication plan

**Preparation only. No draft, published record or production configuration was written.** Public reads and exact response hashes are in [LIVE_CMS_COMPARISON.md](LIVE_CMS_COMPARISON.md). Current published `pages.information`, `home` and `airport.future` are revision1, dated October13. Unpublished owner drafts have not been inspected; their absence is not assumed.

## Scope and editable content

The five credited statement sections use stable `about-statement-origin`, `about-statement-response`, `about-statement-forward`, `about-statement-archive`, `about-statement-how` blocks in existing `pages.information`. Historical context, conceptual-network distinction and material notes remain separate blocks. English reproduces the supplied first-person text; Arabic is an editorial translation for owner review. The 2008 installation/2009 website chronology is artist-supplied provenance, not invented external exhibition documentation.

Information page titles/descriptions/SEO and statement/privacy/terms blocks remain editable through the existing Website CMS. Short contextual excerpts are source UI. Source defaults never silently overwrite a published revision. The About statement renders only when the corresponding blocks exist in the selected document; an old published CMS payload will not acquire it through a source-only deployment.

## Exact later authorized workflow

1. Obtain separate owner authorization for the specific bilingual editorial publication. Integration/deployment permission alone does not imply it.
2. Read `/api/v1/cms/published/pages.information` and authenticated `/api/v1/cms/editorial/pages.information`. Retain the full current published payload and **any draft**, `currentRevision`, `publishedRevision`, `draftRevision` and update time privately. Do the same for `home` if its approved compiled copy is to be published. Re-read immediately before saving; stop on revision drift.
3. Build a narrow payload diff from the current editorial document, not a full compiled-default replacement. Preserve unrelated blocks, contact values, SEO owner edits and drafts. Present conflicts for owner resolution. Replace demonstrably false browser-only/no-backend/no-email statements in EN and AR; add the credited statement blocks and historical/concept distinction. Review cross-references and no-real-transport/no-payment language. Preserve original old About block IDs when mapping historical content, rather than leaving duplicated outdated claims.
4. Validate the merged document with existing frontend and Laravel editorial validators. Save **a draft only** using `PUT /api/v1/cms/editorial/pages.information/draft` with the freshly read `expectedRevision` and payload; use normal staff auth/CSRF/RBAC. No direct SQL, seeder, reset or runtime autopublisher. A 409 means reread/reconcile, never blind retry.
5. Preview EN/AR `/about`, `/contact`, `/privacy`, `/terms` with `?contentPreview=1` in the authorized staff session. Review full original statement, Arabic meaning, private intake rights, backend-held data and actual analytics dimensions/retention. Check ordinary public views still show the previous revision until approved publication.
6. After owner acceptance of that concrete draft, publish via existing `POST /api/v1/cms/editorial/pages.information/publish` with **the new current expectedRevision**. Record the genuine response and public GET revision/payload hash. No email or inbox-delivery claims are inferred from publication.
7. For idempotent continuation, compare semantic content/stable IDs against the desired diff first; if already applied, do nothing. Do not publish a second identical revision. Do not discard, overwrite or restore another owner's draft to simplify the operation.

## Other surfaces

The current home document has stale operating-airline/seven-gateway overrides; review only those approved strings and archive provenance wording alongside the new source-level project invitation. `airport.future` is published revision1; the short source-level credited quote does not require replacing that chapter document wholesale. Contact telephone/address/social values remain unchanged. No personal contact details for Ayman are invented.

## Recovery and release boundary

Use the existing revision-aware CMS restore/draft/preview/publish workflow with recorded prior revision and fresh expectedRevision if a later authorized correction is needed. Restoration is a new audited transition, not a SQL overwrite or deletion of history. No host staging, cron change, operator execution or production mutation is part of this plan.

Source PRs23/24 and this stacked editorial PR require separate acceptance/integration. A later application release targets installed `0aacf145`/25, candidate27 migrations; the historical PR22 operator must not be reused. New exact-source operator, private-data/blob preservation, backups, host compatibility/preflight and explicit owner GO remain release gates.
