export const PUBLICATION_CONTRACT = {
  version: "1.0.0",
  seal: {
    transaction:
      "repeatable-read snapshot; lock publication control then document keys ASC and settings rows; compare all expected revisions",
    documents: [
      "home",
      "travel",
      "airport.past",
      "airport.present",
      "airport.future",
      "destinations.presentation",
      "destinations.editorial",
      "pages.information",
    ],
    members: [
      "CMS revisions",
      "contact settings",
      "appearance settings",
      "public archive records",
      "public archive sources",
      "approved asset variants",
    ],
    immutable: true,
    checksum: "SHA-256 of recursively key-sorted UTF-8 JSON without whitespace",
    rights:
      "preserve source publication basis including product-owner-directed-display without upgrading rights/evidence; new restricted intake held; documentary uncertainty and illustration labels retained",
  },
  pin: {
    name: "releaseId",
    location: "path or query",
    requiredOn: ["getArchiveRecords", "getArchiveSources"],
    missingStatus: 400,
    unknownStatus: 404,
    read: "sealed public payload only; never current drafts or mutable catalog",
    retention:
      "retain every previously deployed release and its content-addressed assets until owner-approved retirement",
  },
  build: {
    sourceSha: "40 lowercase hex",
    snapshotHash: "64 lowercase hex",
    artifactHash: "SHA-256 of canonical ordered file manifest",
    files:
      "relative POSIX paths; no traversal, absolute paths, duplicate paths, executable PHP, symlinks, private data or runtime secrets",
    receipt:
      "append-only; releaseId, environment, sourceSha, snapshotHash, artifactHash, file hashes, builder identity, build time",
  },
  activation: {
    permission: "admin.manage",
    recentStepUpSeconds: 300,
    requires: [
      "successful build receipt",
      "owner deployment receipt",
      "server probe of fixed configured frontend origin and expected release.json plus critical file hashes",
      "expected active revision",
    ],
    transaction:
      "compare-and-swap active pointer and append activation event; sealed payload stays immutable",
    automaticDeployment: false,
    rollback:
      "same verified receipt/probe and new activation event pointing to retained prior release; no Git history rewrite",
  },
  isolation: {
    staging: {
      frontend: "https://staging.gazaairport.com",
      api: "https://staging-api.gazaairport.com",
      workspace: "separate Render workspace from production",
      payments: "sandbox only",
      mail: "sink/verified test recipients only",
      database: "distinct DB and credentials; no production PII",
    },
    production: {
      frontend: "https://www.gazaairport.com",
      api: "https://api.gazaairport.com",
      workspace: "dedicated production Render workspace",
      payments: "owner-approved merchant only",
    },
    sharedSecrets: false,
    sharedQueues: false,
    sharedBuckets: false,
    externalDatabaseIngress: false,
    proxy:
      "exact provider edge/header behavior must be verified in Phase 13A; never trust arbitrary forwarded hosts",
  },
  constraints: [
    {
      table: "static_releases",
      primary: ["id"],
      unique: [["environment", "snapshot_hash"]],
      foreignKeys: ["sealed_by -> staff_users.id"],
      checks: [
        "environment IN ('staging','production')",
        "sealed_payload IS NOT NULL",
        "snapshot_hash IS NOT NULL",
      ],
      immutable: [
        "id",
        "environment",
        "source_sha",
        "sealed_payload",
        "snapshot_hash",
        "sealed_at",
      ],
    },
    {
      table: "static_release_memberships",
      primary: ["release_id", "kind", "member_key"],
      foreignKeys: ["release_id -> static_releases.id"],
      checks: ["revision >= 0", "member_hash IS NOT NULL"],
    },
    {
      table: "static_build_receipts",
      primary: ["id"],
      unique: [["release_id", "artifact_hash"]],
      foreignKeys: ["release_id -> static_releases.id", "created_by -> staff_users.id"],
      checks: [
        "snapshot_hash IS NOT NULL",
        "artifact_hash IS NOT NULL",
        "status IN ('succeeded','failed')",
      ],
      appendOnly: true,
    },
    {
      table: "static_artifact_files",
      primary: ["build_id", "path"],
      foreignKeys: ["build_id -> static_build_receipts.id"],
      checks: ["byte_length >= 0", "sha256 IS NOT NULL"],
    },
    {
      table: "owner_deployment_receipts",
      primary: ["id"],
      foreignKeys: ["build_id -> static_build_receipts.id", "owner_staff_id -> staff_users.id"],
      checks: ["observed_origin IS NOT NULL", "verification_status IN ('verified','failed')"],
      appendOnly: true,
    },
    {
      table: "publication_control",
      primary: ["environment"],
      foreignKeys: ["active_release_id -> static_releases.id (nullable)"],
      checks: ["revision >= 0"],
    },
    {
      table: "publication_activation_events",
      primary: ["id"],
      foreignKeys: [
        "release_id -> static_releases.id",
        "deployment_receipt_id -> owner_deployment_receipts.id",
        "actor_staff_id -> staff_users.id",
      ],
      checks: ["action IN ('activate','rollback')"],
      appendOnly: true,
    },
  ],
  boundary:
    "No cloud resources, live probes, HostPapa upload or production publication was performed in Phase 12.",
};
