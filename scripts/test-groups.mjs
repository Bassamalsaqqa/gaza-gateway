// Cross-domain regressions may belong to several groups; the runner deduplicates their union.
export const unitGroups = Object.freeze({
  booking: [
    "booking-rules", "booking-draft-repository", "boarding-pass", "draft-recovery", "repositories", "sellable-service-matrix",
    "phase5c-manage-checkin-boarding-pass", "phase6a-admin-commercial-desk", "phase6a-correction", "phase6a-correction-02",
    "fleet-booking-snapshots", "fleet-occupancy-collision", "dated-service-cutover", "dated-service-cutover-correction-01", "commercial-catalog",
  ],
  operations: [
    "dated-service-foundation", "dated-service-corrections", "dated-service-cutover", "dated-service-cutover-correction-01",
    "flight-identity-regression", "legacy-freeze-baseline", "fleet-repository", "fleet-source-guards", "fleet-independent-review-01",
    "fleet-correction-01", "fleet-booking-snapshots", "fleet-occupancy-collision", "network-repository", "phase6b1-schedules",
    "phase6b1-correction-01", "sellable-service-matrix", "repositories", "commercial-catalog",
  ],
  passenger: ["passenger-repository", "booking-draft-repository", "draft-recovery", "customer-directory", "phase5c-manage-checkin-boarding-pass"],
  admin: [
    "staff-repository", "admin-session", "activity-repository", "admin-audit-orchestration", "customer-directory",
    "phase6c-source-guards", "phase6c-correction-01", "phase6c-correction-04", "phase6c-correction-05",
    "settings", "contact-repository", "contact-correction", "phase6a-admin-commercial-desk",
  ],
  content: ["content", "content-storage", "content-inventory", "content-domains", "content-commands", "cms-website-editor", "cms-translations", "cms-edit-session", "phase7-content-boundaries"],
  archive: ["archive-foundation", "archive-drafts", "archive-admin-editor", "archive-admin-catalog", "phase7b-boundaries"],
  ui: ["surface-grammar", "studio-protocol", "public-media", "destination-media", "i18n-parity", "format", "phase9-translations", "network-status", "cms-translations", "seo-metadata"],
  tooling: [],
});
