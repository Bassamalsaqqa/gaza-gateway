# PR25 accepted-source follow-up

Independent review accepted96f2692 at source level and identified three nonblocking UX/validation issues. This follow-up changes no backend, migration, permissions, rights/storage/mail pipeline, ticket art, original statement or dependencies.

- Shared frontend reference schema admits only complete HTTP/HTTPS URLs, matching the existing backend scheme restriction. The actual form checks it before submission and focuses the URL field with bilingual guidance. Tests cover HTTP/HTTPS, uppercase scheme, URL-only and citation-only references, malformed/scheme-less URLs and rejected mailto/ftp/javascript/data schemes.
- HTTP409 has a specific EN/AR recovery explanation: the earlier submission may already have arrived; original draft/files/UUID remain; retry unchanged original details if available or contact the project before starting again. No automatic UUID rotation, silent retry or duplicate creation.
- Citation label no longer presents an unconditional required marker. Both reference inputs point to accessible one-of-two guidance: URL or citation is sufficient for private review.

Coordinator focused run: **11 archive client tests passed**, plus integrated TypeScript. No broad rerun, database restart/rehearsal, production build or package. Existing screenshots/build receipt belong to the accepted96f2692-era runtime and are not recertified for this new frontend patch. Source fingerprints remain historical evidence; release preparation must rebuild/pin the final integrated SHA.

AGY was dispatched in an isolated source-only lane on Gemini3.8 Flash High. After several minutes without edits, the exact stalled task process tree was stopped and logs retained; coordinator completed this small correction locally. No worker self-report is used as acceptance evidence.

See NEXT_RELEASE_GATES.md for the already-reconciled stacked candidate and minimal remaining release sequence. Source review is not merge/deployment/CMS approval. Main, production, cron and live CMS remain unchanged; all local Docker containers remain stopped.
