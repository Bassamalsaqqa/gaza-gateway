# Gaza Gateway

<!-- proprietary-license-notice: Bassamalsaqqa -->
> **License:** Proprietary. Copyright (c) 2026 Bassamalsaqqa. All rights reserved for original application code. Third-party components retain their own licenses. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Gaza Gateway ([https://www.gazaairport.com](https://www.gazaairport.com)) is a bilingual Arabic/English digital archive of Gaza International Airport (`GZA`) and Palestinian Airlines (`PS`), incorporating artist Ayman Alazraq's internet-based art project (*Palestine Airways Limited*). The platform provides commemorative free bookings, dynamic boarding passes and tickets, guest verification, an authenticated Admin workspace, revision-controlled CMS, and a curated documentary archive.

> [!IMPORTANT]
> **Art Project & Historical Commemoration:** Gaza Gateway is an internet-based art and documentary project providing symbolic free bookings and tickets. It does **not** conduct real airline operations, commercial ticketing, payments, live check-in, or GDS integration.

---

## Active Production Baseline

Gaza Gateway is live in production at [https://www.gazaairport.com](https://www.gazaairport.com) on HostPapa shared cPanel (`gaza5045`), running against a private Laravel 13 / PHP 8.4+ / MySQL 8.4+ InnoDB backend with prebuilt React 19 frontend. Active release pointer: `rel_20261024T045400_26e3155_clean` (application commit `26e3155`, 27 migrations applied). For complete verified baseline identities, checksums, and backup receipts, see [docs/STATUS.md](docs/STATUS.md).

---

## Documentation Handbook

The four-guide handbook consists of this README and the Architecture, Deployment and Status guides below. Attributions are retained separately:

- **[System Architecture](docs/ARCHITECTURE.md)** — Domain repositories, canonical data ownership, flat routing, bilingual conventions, design tokens, auth/privacy boundaries, and machine contracts.
- **[HostPapa Deployment & Operations](docs/HOSTPAPA_DEPLOYMENT.md)** — Guarded full-stack deployment runbook, cPanel execution, UP-only migrations, operational administration, CMS publication workflow, archive handling, and forward recovery.
- **[Status & Provenance](docs/STATUS.md)** — Dated installed baseline identities, production CMS state, honest live acceptance limitations, open backlog, and compact index of tracked historical receipts.
- **[Attributions & Provenance](docs/ATTRIBUTIONS.md)** — Citations, historical press sources, international agreements, and media provenance.

Coordinator engineering instructions and production boundaries are defined in [AGENTS.md](AGENTS.md).

---

## Local Setup & Development

### System Requirements
- **Node.js**: v22.12+ (use a supported LTS release) and npm v11.x or later
- **PHP**: 8.4+ CLI and web SAPI (production observes PHP 8.5)
- **PHP Extensions**: `pdo_mysql`, `gd` (FreeType + WebP), `pcntl`, `intl`, `mbstring`, `openssl`, `fileinfo`
- **Composer**: v2.x
- **Database**: MySQL 8.4 with InnoDB engine (`utf8mb4`)

> [!NOTE]
> Local Docker containers are optional local development conveniences. Production runs solely on HostPapa shared cPanel without Docker or Node runtimes.

### 1. Frontend Setup
```bash
npm ci
npm run dev
```
The default Vite development port is 8080. The default config does not proxy Laravel. Backend-connected local QA requires explicit API configuration and a trusted HTTPS setup; do not assume `npm run dev` exercises the server. Inspect the existing preview tooling and backend configuration before running authenticated workflows.

### 2. Backend Setup
```bash
cd backend
composer install
cp .env.example .env
# Configure DB_DATABASE, DB_USERNAME, DB_PASSWORD in .env
php artisan key:generate
php artisan migrate
php artisan serve --port=8000
```

### 3. Focused Verification Commands
```bash
npm run typecheck                           # TypeScript verification (tsc --noEmit)
npm test                                   # Unit test suite
npm run test:unit:booking                  # Focused booking tests
npm run test:unit:operations               # Focused operations tests
npm run test:unit:admin                    # Focused admin tests
node scripts/validate-backend-contracts.mjs # OpenAPI & backend contract validator
git diff --check                           # Whitespace & formatting verification
```

---

## Core Technical Invariants

1. **Design Tokens & Surfaces:** Customized OKLCH tokens defined in `src/styles.css`: Limestone/Sand (`--sand`, `--sand-deep`), Deep Olive (`--brand`, `--primary`), Terracotta/Clay (`--clay`), and Dark Ink (`--ink`). Responsive layouts adapt across 320px to 1920px viewports.
2. **Bilingual Routing:** Flat route files under `src/routes/` using TanStack dot notation and optional `{-$locale}` for English (`/`) and Arabic (`/ar`). Never hand-edit `src/routeTree.gen.ts`.
3. **Arabic LTR Isolation:** Technical identifiers remain strictly LTR in Arabic views: flight numbers (`PS 204`), booking references (`GZA-7K8P`), IATA codes (`GZA`, `AMM`), ISO dates/times, phone numbers, and email addresses.
4. **Commemorative Tickets:** Tickets adhere to 8 × 3.25-inch landscape proportions with TrueType font rendering (`backend/resources/documents/fonts/`).
5. **Production Authority & Data Safety:** HostPapa shared cPanel is the only production host. Deployment and CMS publication require explicit owner authorization. Accounts, confirmed bookings, passenger profiles, staff credentials, CMS revisions, and backups are strictly preserved.
