# CMS Reconciliation Review & Release-Readiness Preparation

## Executive Summary

- **Scope**: Documentation and CMS reconciliation preparation only; no live CMS writes, drafts, or database mutations have been performed.
- **Application source authority**: Accepted app main `26e31557f894c5a744da47d7abb9b25172c21e8c` (tree `ff4a194a9f68e4bbc8b7cd1c1449327bd67ee6bd`). Merged PR23 (admin translation scoping), PR24 (private analytics & monthly reports), and PR26 (inline archive intake, credited statement, review corrections; PR25 superseded). Local `main` and `origin/main` are synchronized; dirty primary checkout is preserved.
- **Installed production baseline**: Application `0aacf1452d47bbf5660f060a718409dfff32a54c`, release `rel_20261021T164700_0aacf14_clean`, 25 migration identities. Candidate release contains 27 migrations (2 additive over installed 25).
- **Separation of gates**: Source integration is complete (no longer pending). Arabic editorial translation and bilingual legal wording require owner review and explicit acceptance. Revision-safe CMS publication is an independent owner-controlled gate separate from application code release.
- **Live drafts status**: Authenticated normal-browser GETs on October23 found all three documents (`home`, `pages.information`, `airport.future`) at currentRevision2 / publishedRevision1 / draftRevision null / hasDraft false. No browser-local unsaved state was cleared; re-read before any future save.

## Source Preview & Screenshot Links

The live website is the installed old application. `?contentPreview=1` selects the server/editorial draft in a staff session; it does not show new compiled application code. The accepted compiled candidate is available locally at http://127.0.0.1:5240/about and /ar/about (also /airport, /privacy and /terms in both locales). This is a clearly labelled, read-only source preview with all outgoing API connections blocked by CSP; booking/auth/CMS actions are unavailable. It has no hosted public URL. Use the retained EN/AR screenshots for remote review, or separately authorize a restricted hosted preview if interactive remote access is necessary.

### Source Routes

| Route | English (LTR) | Arabic (RTL) | Preview Query |
| --- | --- | --- | --- |
| About | [`/about`](file:///src/routes/{-$locale}.about.tsx) | [`/ar/about`](file:///src/routes/{-$locale}.about.tsx) | `?contentPreview=1` |
| Privacy | [`/privacy`](file:///src/routes/{-$locale}.privacy.tsx) | [`/ar/privacy`](file:///src/routes/{-$locale}.privacy.tsx) | `?contentPreview=1` |
| Terms | [`/terms`](file:///src/routes/{-$locale}.terms.tsx) | [`/ar/terms`](file:///src/routes/{-$locale}.terms.tsx) | `?contentPreview=1` |
| Archive Contribute | [`/airport#contribute`](file:///src/routes/{-$locale}.airport.tsx) | [`/ar/airport#contribute`](file:///src/routes/{-$locale}.airport.tsx) | Anchor navigation |
| Home | [`/`](file:///src/routes/{-$locale}.index.tsx) | [`/ar`](file:///src/routes/{-$locale}.index.tsx) | `?contentPreview=1` |
| Future Vision | [`/airport/future`](file:///src/routes/{-$locale}.airport.future.tsx) | [`/ar/airport/future`](file:///src/routes/{-$locale}.airport.future.tsx) | `?contentPreview=1` |

### Actual Browser Evidence & Screenshots

- **About surface**:
  - [About EN Desktop](../editorial-oct23/evidence/about-en-desktop.jpg)
  - [About AR Desktop](../editorial-oct23/evidence/about-ar-desktop.jpg)
  - [About EN Mobile (390px)](../editorial-oct23/evidence/about-en-mobile.jpg)
  - [About AR Mobile (390px)](../editorial-oct23/evidence/about-ar-mobile.jpg)
  - [About EN Historical Before Capture](../editorial-oct23/evidence/about-en-before.jpg)
- **Inline contribution surface**:
  - [Contribute EN Desktop](../editorial-oct23/evidence/contribute-en-desktop.jpg)
  - [Contribute AR Desktop](../editorial-oct23/evidence/contribute-ar-desktop.jpg)
  - [Contribute EN Mobile (390px)](../editorial-oct23/evidence/contribute-en-mobile.jpg)
  - [Contribute AR Mobile (390px)](../editorial-oct23/evidence/contribute-ar-mobile.jpg)
  - [Reference Choice Path Mobile](../editorial-oct23/evidence/reference-en-mobile.jpg)
- **Analytics & Admin captures**:
  - [Analytics Admin EN](../editorial-oct23/analytics-admin-en.png)
  - [Analytics Admin AR Mobile](../editorial-oct23/analytics-admin-ar-mobile.png)
  - [Analytics Consent Banner AR Mobile](../editorial-oct23/analytics-consent-ar-mobile.png)
  - [Analytics Report Preview EN](../editorial-oct23/analytics-preview-en.png)
  - [Analytics Report Preview AR](../editorial-oct23/analytics-preview-ar.png)

## Source Original English vs. Arabic Owner Review

- **Verbatim English statement**: Authored by artist Ayman Alazraq. English copy reproduces the supplied original text without alterations or paraphrasing.
- **Editorial Arabic translation**: Prepared as an editorial translation to accompany the artist statement and legal notices. It is presented for owner review and editorial approval before any live publication.
- **Historical and conceptual demarcation**:
  - Operating history: Gaza International Airport opened in late 1998 and carried commercial passengers via Palestinian Airlines (documented in PCBS publications).
  - Artistic conception: Palestine Airways Limited was realized as an art installation at Open Academy (2008) and web project at gazaairport.com (2009). This distinction is held outside the signed artist statement.
- **Contacts and rights**: No artist phone numbers, private physical addresses, or unconfirmed personal email addresses are fabricated. Contributed material rights remain with original rights holders.

## Stable Content IDs & Metadata Requiring Reconciliation

### 1. Document `pages.information`

Live published revision 1 (`2026-10-13T11:23:37+00:00`, response SHA-256 `30052945bc32816414a2efb1812d96165e519c0fa743f18070970a232f83d435`).

#### Page `about`
- **Metadata**:
  - `title`: `{"en": "Gaza International Airport (GZA) — Remade", "ar": "مطار غزة الدولي (GZA) — إعادة صياغة"}`
  - `description`: `{"en": "An internet-based art project by Ayman Alazraq", "ar": "مشروع فني على الإنترنت لأيمن الأزرق"}`
  - `seo`: `title`, `description`, `socialTitle`, `socialDescription` updated to reflect the remade art project and memorial.
- **Stable block IDs to reconcile**:
  - `about-statement-origin`: "Origin (2009)" / "البداية (2009)"
  - `about-statement-response`: "Response (now)" / "الاستجابة (الآن)"
  - `about-statement-forward`: "Forward (the future)" / "إلى الأمام (المستقبل)"
  - `about-statement-archive`: "Contribute to the archive" / "المساهمة في الأرشيف"
  - `about-statement-how`: "How to contribute" / "كيف تساهم"
  - `about-history-context`: "Airport History & Passenger Operations" / "تاريخ المطار والعمليات التجارية للركاب"
  - `about-conceptual-network`: "Palestine Airways Limited — An Artistic Conception" / "الخطوط الجوية الفلسطينية المحدودة — تصوّر فني"
  - `about-material`: "About the material" / "عن المواد المعروضة" (preserves existing material disclosure)
- **Reconciliation action**: Published revision 1 contains only `about-airport` and `about-material`. Outdated operational claims in `about-airport` must be replaced with the structured statement and historical/concept blocks, while preserving `about-material`.

#### Page `privacy`
- **Metadata**: SEO fields updated to describe installed backend commemorative bookings, email OTP verification, private archive submissions, and opt-in first-party analytics.
- **Stable block IDs to reconcile**:
  - `privacy-section-1`: "About this notice" / "عن هذا الإشعار"
  - `privacy-section-2`: "Commemorative bookings and accounts" / "الحجوزات التذكارية والحسابات" (truthful server database, session cookies, OTP codes, no payment data)
  - `privacy-section-3`: "Archive contributions and curatorial review" / "مشاركات الأرشيف والمراجعة التقييمية" (private storage, permissions review before display, contributor rights preserved)
  - `privacy-section-4`: "First-party analytics and privacy choices" / "التحليلات المباشرة وخيارات الخصوصية" (opt-in consent, DNT/GPC compliance, no PII/IP/UA in events, raw events eligible for bounded deletion after90days)
  - `privacy-section-5`: "Payments and commercial transport" / "المدفوعات والنقل التجاري" (no payment taken, non-commercial, no carriage rights)
  - `privacy-section-6`: "Imagery and archive material" / "الصور ومواد الأرشيف" (licensed/owner-supplied material, credits where known)
  - `privacy-section-7`: "Contacting the project" / "التواصل مع المشروع"
- **Reconciliation action**: Published revision 1 contains 6 sections with obsolete "browser-only / no backend / no email" prototype claims. Replace these with truthful 7-section policy matching installed reality.

#### Page `terms`
- **Metadata**: SEO fields updated to reflect art project terms, commemorative bookings, and no commercial carriage.
- **Stable block IDs to reconcile**:
  - `terms-section-1`: "Scope and purpose" / "نطاق الاستخدام والغرض" (art project and digital memorial scope)
  - `terms-section-2`: "Commemorative flight information and bookings" / "معلومات الرحلات والحجوزات التذكارية" (symbolic representations, no travel contract)
  - `terms-section-3`: "No commercial transactions or fees" / "غياب المعاملات التجارية والرسوم" (strictly non-commercial)
  - `terms-section-4`: "Accounts and verification" / "الحسابات والتحقق" (accurate contact for verification, password care)
  - `terms-section-5`: "Archive submissions and permissions" / "مشاركات الأرشيف والتراخيص" (private curatorial review consent, contributor ownership retained)
  - `terms-section-6`: "Content, imagery and the archive" / "المحتوى والصور والأرشيف"
  - `terms-section-7`: "Changes to the site" / "التغييرات على الموقع"
- **Reconciliation action**: Published revision 1 contains 6 sections with obsolete browser-local sample references. Update to 7 truthful sections.

#### Page `contact`
- **Metadata**: SEO title and description.
- **Blocks**: `[]` (empty block array; phone, address, email, and social values are governed by Settings/Contact authority). No fabricated contact values.

---

### 2. Document `home` Narrow Override Handling

- **Published baseline**: Revision 1 (`2026-10-13T11:23:31+00:00`, response SHA-256 `788b05a77932f0ba79f9fa72d6ceeaceaf5da84b4565a89276326663952f5bcd`).
- **Narrow override policy**:
  - Review only approved copy overrides: `sub` (search Palestine Airways Limited schedules), `archiveTitle`, `archiveSub` (documentary records and primary sources).
  - Do NOT overwrite the hero or change section structure (`sections: ["hero", "search", "board", "heritage", "destinations", "manage", "travel", "archive"]`).
  - Retain custom owner SEO overrides unless explicitly instructed to synchronize with compiled source defaults.

---

### 3. Document `airport.future` Narrow Override Handling

- **Published baseline**: Revision 1 (`2026-10-13T11:23:35+00:00`, response SHA-256 `1e550be998a2aa9711d47a9d7f8673329878ea513eaa72286bc07b9a0cb81478`).
- **Narrow override policy**:
  - The short source-level credited quote does not require replacing the entire chapter document.
  - Mandatory illustrative media classification (`disclosure: Plain illustrative concept`) remains outside editable copy and must never be altered or removed.
  - Preserve existing copy keys (`title`, `subtitle`, `notice`, `terminalTitle`, `terminalBody`, `hospitalityTitle`, `hospitalityBody`, `masterplanTitle`, `masterplanBody`, `networkTitle`, `networkBody`).

---

## Revision-Safe Publication Workflow & Concurrency Guardrails

Any future authorized publication must adhere to the following strict guardrails:

1. **Authentication & Session**:
   - Use standard staff session authentication (`/api/v1/cms/editorial/.../draft`) with CSRF tokens.
   - Strictly NO direct SQL execution, database seeders, table truncations, or runtime auto-publishers.

2. **Preserve Live Owner Drafts**:
   - Before building any payload diff, perform an authenticated `GET /api/v1/cms/editorial/pages.information`.
   - Inspect `draftRevision`, `currentRevision`, `publishedRevision`, and `updatedAt`.
   - If an unpublished owner draft is present, preserve its content and present any differences to the owner. Never silently overwrite or delete an owner's draft.

3. **Narrow Targeted Diffs**:
   - Build a JSON diff targeting only the reviewed and accepted block IDs and page metadata.
   - Do NOT submit a full replacement with compiled defaults.
   - Validate the merged payload with Laravel and frontend editorial schema validators before saving.

4. **Optimistic Concurrency Control (`expectedRevision`)**:
   - Always supply `expectedRevision` matching the freshly read revision.
   - If HTTP 409 Conflict is returned, stop execution immediately. Re-read the latest state, compare revision identities, and reconcile; never blindly retry a 409.

5. **Draft-First & Preview Flow**:
   - Save changes as a draft first (`PUT /api/v1/cms/editorial/pages.information/draft`).
   - Staff preview the draft in both English and Arabic at `?contentPreview=1`.
   - Verify that public visitors still receive the unchanged published revision until publication.

6. **Separate Owner Publication Authorization**:
   - Explicit owner GO required specifically for CMS publication.
   - Publish via `POST /api/v1/cms/editorial/pages.information/publish` passing the new `expectedRevision`.
   - Idempotent check: If live content already matches the desired state, do not trigger a redundant publish.

---

## Gaps That Remain & Release Boundary

- **Package and host PASS not claimed**: A clean exact-application build and strict verification passed in the parallel release-preparation lane. This documentation does not independently certify that package or the new operator/host preflight.
- **Observed server draft state**: Authenticated read-only GETs completed for all three documents: currentRevision2, publishedRevision1, no server draft. Re-read immediately before a later authorized draft save.
- **Owner editorial acceptance**: Arabic translation of the artist statement and bilingual legal terms are awaiting explicit owner acceptance.
- **Mobile hardware acceptance (Issue #16)**: Cinematic mobile viewport remains open (P3) pending physical iOS/Android cutout and orientation verification by the owner.
- **Staff auth lookup pre-throttle (Issue #11)**: Remained deferred (P3) to preserve deployment stability.
- **New operator review**: Operator profile for actual installed baseline `0aacf145`/25 to candidate 27 migrations must be independently reviewed; blind reuse of historical PR22 (`173e51a`/23) is prohibited.
