import crypto from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { PUBLICATION_CONTRACT as C } from "./backend-publication-policy.mjs";
const canonical = (v) =>
  v === null || typeof v !== "object"
    ? JSON.stringify(v)
    : Array.isArray(v)
      ? "[" + v.map(canonical).join(",") + "]"
      : "{" +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ":" + canonical(v[k]))
          .join(",") +
        "}";
export const publicationHash = (v) =>
  crypto.createHash("sha256").update(canonical(v)).digest("hex");
export function validatePublicationManifest(manifest) {
  const valid = isDeepStrictEqual(manifest, C);
  return { valid, errors: valid ? [] : ["Publication contract differs from approved design"] };
}
export function sealPublication(input, ctx) {
  if (
    !["staging", "production"].includes(ctx.environment) ||
    !ctx.releaseId ||
    !/^[a-f0-9]{40}$/.test(ctx.sourceSha) ||
    !isDeepStrictEqual(Object.keys(input.documents).sort(), [...C.seal.documents].sort()) ||
    !isDeepStrictEqual(input.revisions, ctx.expectedRevisions) ||
    !ctx.provenanceVerified
  )
    return { ok: false, status: 409 };
  if (
    !isDeepStrictEqual(
      Object.keys(input.revisions ?? {}).sort(),
      [...C.seal.documents, "contact", "appearance", "archive"].sort(),
    ) ||
    !Object.values(input.revisions).every((n) => Number.isSafeInteger(n) && n >= 0)
  )
    return { ok: false, status: 409 };
  const payload = structuredClone({
    documents: input.documents,
    settings: input.settings,
    archive: input.archive,
    assets: input.assets,
  });
  const release = {
    id: ctx.releaseId,
    environment: ctx.environment,
    sourceSha: ctx.sourceSha,
    snapshotHash: publicationHash(payload),
    payload,
  };
  return { ok: true, release };
}
export function readPublication(releases, releaseId, environment) {
  if (!releaseId) return { ok: false, status: 400 };
  const r = releases.find((r) => r.id === releaseId && r.environment === environment);
  if (!r) return { ok: false, status: 404 };
  if (publicationHash(r.payload) !== r.snapshotHash) return { ok: false, status: 409 };
  return {
    ok: true,
    snapshot: structuredClone(r.payload),
    releaseId: r.id,
    snapshotHash: r.snapshotHash,
  };
}
export function buildReceipt(release, files, ctx) {
  if (
    !release ||
    ctx.environment !== release.environment ||
    ctx.sourceSha !== release.sourceSha ||
    ctx.snapshotHash !== release.snapshotHash ||
    publicationHash(release.payload) !== release.snapshotHash ||
    !Array.isArray(files) ||
    !files.length
  )
    return { ok: false };
  if (
    files.some(
      (f) =>
        typeof f.path !== "string" ||
        !f.path ||
        f.path.startsWith("/") ||
        /[\\:]/.test(f.path) ||
        f.path.split("/").some((x) => [".", "..", ""].includes(x)) ||
        /\.php$/i.test(f.path) ||
        !/^[a-f0-9]{64}$/.test(f.sha256) ||
        !Number.isSafeInteger(f.byteLength) ||
        f.byteLength < 0,
    ) ||
    new Set(files.map((f) => f.path)).size !== files.length
  )
    return { ok: false };
  const manifest = [...files].sort((a, b) => a.path.localeCompare(b.path, "en"));
  if (!manifest.some((f) => f.path === "release.json")) return { ok: false };
  return {
    ok: true,
    receipt: {
      id: ctx.receiptId,
      releaseId: release.id,
      environment: release.environment,
      sourceSha: release.sourceSha,
      snapshotHash: release.snapshotHash,
      artifactHash: publicationHash(manifest),
      files: structuredClone(manifest),
      status: "succeeded",
    },
  };
}
export function activatePublication(control, release, build, deployment, ctx) {
  if (
    !release ||
    !build ||
    !deployment ||
    !ctx ||
    control.environment !== release.environment ||
    build.environment !== release.environment ||
    build.releaseId !== release.id ||
    deployment.buildId !== build.id ||
    deployment.environment !== release.environment ||
    build.status !== "succeeded" ||
    build.snapshotHash !== release.snapshotHash ||
    build.sourceSha !== release.sourceSha ||
    build.artifactHash !== publicationHash(build.files) ||
    publicationHash(release.payload) !== release.snapshotHash
  )
    return { ok: false };
  const origin = C.isolation[release.environment]?.frontend;
  if (
    ctx.permission !== "admin.manage" ||
    ctx.recentStepUpSeconds > 300 ||
    ctx.recentStepUpSeconds < 0 ||
    !Number.isFinite(ctx.recentStepUpSeconds) ||
    deployment.origin !== origin ||
    deployment.artifactHash !== build.artifactHash ||
    deployment.ownerApproved !== true ||
    ctx.liveProbeVerified !== true ||
    ctx.probedArtifactHash !== build.artifactHash ||
    control.revision !== ctx.expectedRevision ||
    !["activate", "rollback"].includes(ctx.action)
  )
    return { ok: false, status: 409 };
  return {
    ok: true,
    control: { ...control, activeReleaseId: release.id, revision: control.revision + 1 },
    event: {
      action: ctx.action,
      releaseId: release.id,
      buildId: build.id,
      deploymentId: deployment.id,
      priorReleaseId: control.activeReleaseId,
    },
  };
}

export function validatePublicationApi(spec) {
  const errors = [],
    S = spec.components?.schemas;
  for (const [path, method, request, response] of [
    ["/publication-snapshots/{releaseId}", "get", null, "PublicationSnapshotResponse"],
    ["/cms/publications/{releaseId}/snapshot", "get", null, "PublicationSnapshotResponse"],
    [
      "/cms/publications/{releaseId}/build-receipts",
      "post",
      "PublicationBuildReceiptRequest",
      "PublicationBuildReceiptResponse",
    ],
    [
      "/cms/publications/{releaseId}/deployment-receipts",
      "post",
      "PublicationDeploymentReceiptRequest",
      "PublicationDeploymentReceiptResponse",
    ],
    [
      "/cms/publications/{releaseId}/activate",
      "post",
      "PublicationActivationRequest",
      "PublicationActivationResponse",
    ],
    [
      "/cms/publications/{releaseId}/rollback",
      "post",
      "PublicationActivationRequest",
      "PublicationActivationResponse",
    ],
  ]) {
    const op = spec.paths?.[path]?.[method];
    if (
      !op ||
      op.responses?.["200"]?.content?.["application/json"]?.schema?.$ref !==
        "#/components/schemas/" + response
    )
      errors.push(path + " missing exact response");
    if (
      request &&
      op?.requestBody?.content?.["application/json"]?.schema?.$ref !==
        "#/components/schemas/" + request
    )
      errors.push(path + " missing exact command");
  }
  for (const p of ["/archive/records", "/archive/sources"])
    if (
      !spec.paths?.[p]?.get?.parameters?.some(
        (x) => x.name === "releaseId" && x.in === "query" && x.required === true,
      )
    )
      errors.push(p + " requires immutable release pin");
  if (
    !isDeepStrictEqual(
      S?.TriggerPublicationRequest?.properties?.expectedRevisions?.required?.slice().sort(),
      [...C.seal.documents, "contact", "appearance", "archive"].sort(),
    )
  )
    errors.push("Seal revision coverage mismatch");
  if (
    S?.PublicationBuildReceiptRequest?.additionalProperties !== false ||
    S?.PublicationActivationRequest?.additionalProperties !== false
  )
    errors.push("Publication commands must be closed");
  return { valid: !errors.length, errors };
}
