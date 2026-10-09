import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { validatePayloadAgainstSchema, validateContainerReference } from "../../scripts/lib/backend-contract-validation.mjs";
import {
  EXPECTED_PROBE_COUNT,
  DEFAULT_API_PREFIX,
  SAFE_FILENAME_REGEX,
  SHA256_HEX_REGEX,
  REQUIRED_PROBES,
  REQUIRED_PROBES_MAP,
} from "./capture-probes-matrix.mjs";

const VALID_HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERIC_ERROR_STATUSES = new Set([400, 401, 403, 404, 405, 429, 500, 503]);

/**
 * Extracts status, headers, raw body string, and parsed body from an HTTP capture file or string.
 * Retains exact bytes after the header/body delimiter without trimming, preserving raw body presence.
 */
export function extractHeadersAndBody(filePathOrContent) {
  const content = typeof filePathOrContent === "string" && fs.existsSync(filePathOrContent)
    ? fs.readFileSync(filePathOrContent, "utf8")
    : String(filePathOrContent);

  const crlfIndex = content.indexOf("\r\n\r\n");
  const lfIndex = content.indexOf("\n\n");

  let headerBlock = content;
  let rawBody = "";
  let hasRawBody = false;

  let delimiterIndex = -1;
  let delimiterLength = 0;

  if (crlfIndex !== -1 && (lfIndex === -1 || crlfIndex < lfIndex)) {
    delimiterIndex = crlfIndex;
    delimiterLength = 4;
  } else if (lfIndex !== -1) {
    delimiterIndex = lfIndex;
    delimiterLength = 2;
  }

  if (delimiterIndex !== -1) {
    headerBlock = content.slice(0, delimiterIndex);
    rawBody = content.slice(delimiterIndex + delimiterLength);
    hasRawBody = rawBody.length > 0;
  }

  const headers = {};
  const lines = headerBlock.split(/\r?\n/);
  const statusLine = lines[0] || "";
  const statusCodeMatch = statusLine.match(/HTTP\/[0-9.]+\s+(\d+)/);
  const statusCode = statusCodeMatch ? parseInt(statusCodeMatch[1], 10) : null;

  for (let i = 1; i < lines.length; i++) {
    const idx = lines[i].indexOf(":");
    if (idx !== -1) {
      const key = lines[i].slice(0, idx).trim().toLowerCase();
      const val = lines[i].slice(idx + 1).trim();
      headers[key] = val;
    }
  }

  let parsedBody = null;
  if (hasRawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = rawBody;
    }
  }

  return { statusCode, headers, body: parsedBody, rawBody, hasRawBody };
}

/**
 * Resolves the OpenAPI 3.1 response schema or bounded protocol classification.
 * Pure function: takes (specDoc, pathKey, method, statusCode, classification).
 * Resolves reusable response containers and rejects unknown methods, unknown operations,
 * undeclared 204 statuses, and arbitrary protocol escapes.
 */
export function resolveResponseSchema(specDoc, pathKey, method, statusCode, classification = null) {
  const upperMethod = String(method || "").toUpperCase();
  if (!VALID_HTTP_METHODS.has(upperMethod)) {
    return null;
  }

  // 1. Explicitly classified bounded protocol edge cases
  if (classification === "cors_preflight") {
    // Preflight requires OPTIONS and a known implemented operation path
    if (upperMethod !== "OPTIONS") {
      return null;
    }
    if (!specDoc?.paths?.[pathKey]) {
      return null;
    }
    if (statusCode === 204) {
      return { schema: null, source: "classification:cors_preflight:204", is204: true };
    }
    if (statusCode === 403 && specDoc.components?.schemas?.ErrorResponse) {
      return { schema: specDoc.components.schemas.ErrorResponse, source: "classification:cors_preflight:403" };
    }
    return null;
  }

  if (classification === "method_not_allowed") {
    // 405 requires a known path and a disallowed HTTP method
    if (statusCode !== 405) {
      return null;
    }
    if (!specDoc?.paths?.[pathKey]) {
      return null;
    }
    if (specDoc.paths[pathKey]?.[upperMethod.toLowerCase()]) {
      return null; // Method is allowed, not 405
    }
    if (specDoc.components?.schemas?.ErrorResponse) {
      return { schema: specDoc.components.schemas.ErrorResponse, source: "classification:method_not_allowed:405" };
    }
    return null;
  }

  if (classification === "unmatched_route") {
    // Unmatched route requires 404 on the explicit probe path and must not match spec paths
    if (statusCode !== 404) {
      return null;
    }
    if (pathKey !== "/unmatched_route" && pathKey !== "/api/v1/unmatched_route") {
      return null;
    }
    if (specDoc?.paths?.[pathKey]) {
      return null;
    }
    if (specDoc.components?.schemas?.ErrorResponse) {
      return { schema: specDoc.components.schemas.ErrorResponse, source: "classification:unmatched_route:404" };
    }
    return null;
  }

  if (classification === "untrusted_host") {
    if (statusCode !== 400) {
      return null;
    }
    if (!specDoc?.paths?.[pathKey]) {
      return null;
    }
    if (specDoc.components?.schemas?.ErrorResponse) {
      return { schema: specDoc.components.schemas.ErrorResponse, source: "classification:untrusted_host:400" };
    }
    return null;
  }

  if (classification !== null && classification !== undefined) {
    // Unknown classification: fail closed
    return null;
  }

  // 2. Real OpenAPI accepted operation resolution
  const pathItem = specDoc?.paths?.[pathKey];
  if (!pathItem) {
    return null;
  }

  const operation = pathItem[upperMethod.toLowerCase()];
  if (!operation) {
    return null;
  }

  const responses = operation.responses || {};
  const statusKey = String(statusCode);

  let responseEntry = responses[statusKey] || responses["default"];

  // Follow reusable response container $ref if present
  if (responseEntry && typeof responseEntry === "object" && typeof responseEntry.$ref === "string") {
    const container = validateContainerReference(specDoc, responseEntry.$ref, "#/components/responses/", "response");
    if (container.valid && container.target) {
      responseEntry = container.target;
    }
  }

  // Operation 204 No Content: only authorized if explicitly declared on operation
  if (statusCode === 204) {
    if (responses["204"]) {
      return { schema: null, source: `operation:${pathKey}:${upperMethod}:204`, is204: true };
    }
    return null;
  }

  // Declared response schema
  if (responseEntry?.content?.["application/json"]?.schema) {
    return {
      schema: responseEntry.content["application/json"].schema,
      source: `operation:${pathKey}:${upperMethod}:${statusKey}`,
      isErrorFallback: false,
    };
  }

  // Bounded generic error statuses on existing, accepted operations
  if (GENERIC_ERROR_STATUSES.has(statusCode) && specDoc.components?.schemas?.ErrorResponse) {
    return {
      schema: specDoc.components.schemas.ErrorResponse,
      source: `operation:${pathKey}:${upperMethod}:component:ErrorResponse:${statusCode}`,
      isErrorFallback: true,
    };
  }

  return null;
}

/**
 * Validates a single capture specimen against its resolved OpenAPI schema and security header rules.
 * Pure function: takes (captureData, routeMeta, specDoc). Free of process.exit or filesystem side effects.
 */
export function validateCapture(captureData, routeMeta, specDoc) {
  const errors = [];
  const { statusCode, headers, body, rawBody, hasRawBody } = captureData;
  const { path: pathKey, method, expectedStatus, classification } = routeMeta;

  if (statusCode !== expectedStatus) {
    errors.push(`Status code mismatch: expected ${expectedStatus}, received ${statusCode}`);
  }

  // 1. Mandatory security headers
  const cacheControl = headers["cache-control"] || "";
  if (!cacheControl.includes("no-store")) {
    errors.push(`Missing 'no-store' in Cache-Control header: '${cacheControl}'`);
  }

  const xRequestId = headers["x-request-id"];
  if (!xRequestId) {
    errors.push("Missing mandatory 'X-Request-Id' response header");
  } else if (!UUID_REGEX.test(xRequestId)) {
    errors.push(`Invalid UUID in 'X-Request-Id': '${xRequestId}'`);
  }

  const contentTypeOptions = headers["x-content-type-options"];
  if (contentTypeOptions !== "nosniff") {
    errors.push(`Expected 'X-Content-Type-Options: nosniff', got '${contentTypeOptions}'`);
  }

  const frameOptions = headers["x-frame-options"];
  if (frameOptions !== "DENY") {
    errors.push(`Expected 'X-Frame-Options: DENY', got '${frameOptions}'`);
  }

  const referrerPolicy = headers["referrer-policy"];
  if (referrerPolicy !== "strict-origin-when-cross-origin") {
    errors.push(`Expected 'Referrer-Policy: strict-origin-when-cross-origin', got '${referrerPolicy}'`);
  }

  // 2. Resolve authorized operation or explicit bounded protocol mapping FIRST
  const resolved = resolveResponseSchema(specDoc, pathKey, method, statusCode, classification);
  if (!resolved) {
    errors.push(`Could not resolve authorized schema for ${method} ${pathKey} HTTP ${statusCode}`);
    return { valid: false, errors };
  }

  // 3. Strict Bodyless 204 Validation
  if (statusCode === 204) {
    if (hasRawBody || (rawBody !== undefined && rawBody !== null && rawBody.length > 0)) {
      errors.push(`204 No Content response must not contain any body content (got raw body: '${rawBody}')`);
    }
    if (body !== null && body !== undefined && body !== "") {
      errors.push(`204 No Content response must not contain parsed body, got: ${JSON.stringify(body)}`);
    }
    const contentLength = headers["content-length"];
    if (contentLength !== undefined && contentLength !== "0") {
      errors.push(`204 No Content response must have Content-Length: 0 if present, got '${contentLength}'`);
    }
    return { valid: errors.length === 0, errors, schemaSource: resolved.source || "204-bodyless" };
  }

  // 4. Media Type Verification for JSON Responses (parsed token, not startsWith)
  const rawContentType = headers["content-type"] || "";
  const mediaTypeToken = (rawContentType.split(";")[0] || "").trim().toLowerCase();
  if (mediaTypeToken !== "application/json") {
    errors.push(`Expected 'Content-Type: application/json', got '${rawContentType}'`);
  }

  // 5. Rate-limiting header on 429
  if (statusCode === 429) {
    if (!headers["retry-after"]) {
      errors.push("Missing mandatory 'Retry-After' header on HTTP 429 response");
    }
  }

  // 6. Schema Resolution & Payload Validation
  if (!resolved.schema) {
    errors.push(`Could not resolve authorized schema for ${method} ${pathKey} HTTP ${statusCode}`);
    return { valid: false, errors };
  }

  if (body === null || typeof body !== "object") {
    errors.push(`Expected JSON object payload, got: ${typeof body}`);
    return { valid: false, errors };
  }

  // Shared contract validator invocation: (schema, payload, specDoc)
  const schemaResult = validatePayloadAgainstSchema(resolved.schema, body, specDoc);
  if (!schemaResult.valid) {
    errors.push(...schemaResult.errors.map((e) => `Schema error [${resolved.source}]: ${e}`));
  }

  // 7. Correlation ID and metadata consistency
  const metaRequestId = body?.meta?.requestId;
  if (metaRequestId && xRequestId && metaRequestId !== xRequestId) {
    errors.push(`Header 'X-Request-Id' (${xRequestId}) does not match body 'meta.requestId' (${metaRequestId})`);
  }

  const metaTimestamp = body?.meta?.timestamp;
  if (metaTimestamp && isNaN(Date.parse(metaTimestamp))) {
    errors.push(`Invalid ISO 8601 timestamp in 'meta.timestamp': '${metaTimestamp}'`);
  }

  return {
    valid: errors.length === 0,
    errors,
    schemaSource: resolved.source,
  };
}

/**
 * Authoritative negative controls testing the pure validator functions in-process.
 */
export function runNegativeControls(specDoc) {
  console.log("--- Executing Validator Negative Controls ---");
  const testRequestId = "11111111-2222-3333-4444-555555555555";
  const validHeaders = {
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-request-id": testRequestId,
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
  };

  const negativeCases = [
    {
      name: "NEG 01: Flipped success=false on 200 HealthStatusResponse",
      route: { path: "/health", method: "GET", expectedStatus: 200 },
      capture: {
        statusCode: 200,
        headers: { ...validHeaders },
        body: {
          success: false,
          data: { status: "ok", timestamp: "2026-10-09T12:00:00Z" },
          meta: { requestId: testRequestId, timestamp: "2026-10-09T12:00:00Z" },
        },
      },
    },
    {
      name: "NEG 02: Flipped success=true on 503 ErrorResponse",
      route: { path: "/health/ready", method: "GET", expectedStatus: 503 },
      capture: {
        statusCode: 503,
        headers: { ...validHeaders },
        body: {
          success: true,
          error: { code: "service_unavailable", message: "Failed" },
          meta: { requestId: testRequestId, timestamp: "2026-10-09T12:00:00Z" },
        },
      },
    },
    {
      name: "NEG 03: Missing required field in data (status missing)",
      route: { path: "/health", method: "GET", expectedStatus: 200 },
      capture: {
        statusCode: 200,
        headers: { ...validHeaders },
        body: {
          success: true,
          data: { timestamp: "2026-10-09T12:00:00Z" },
          meta: { requestId: testRequestId, timestamp: "2026-10-09T12:00:00Z" },
        },
      },
    },
    {
      name: "NEG 04: Missing required meta.requestId",
      route: { path: "/health", method: "GET", expectedStatus: 200 },
      capture: {
        statusCode: 200,
        headers: { ...validHeaders },
        body: {
          success: true,
          data: { status: "ok", timestamp: "2026-10-09T12:00:00Z" },
          meta: { timestamp: "2026-10-09T12:00:00Z" },
        },
      },
    },
    {
      name: "NEG 05: Unexpected property on strict object (additionalProperties: false)",
      route: { path: "/health", method: "GET", expectedStatus: 200 },
      capture: {
        statusCode: 200,
        headers: { ...validHeaders },
        body: {
          success: true,
          data: { status: "ok", timestamp: "2026-10-09T12:00:00Z", rogue_field: "illegal" },
          meta: { requestId: testRequestId, timestamp: "2026-10-09T12:00:00Z" },
        },
      },
    },
    {
      name: "NEG 06: Header X-Request-Id mismatch with body meta.requestId",
      route: { path: "/health", method: "GET", expectedStatus: 200 },
      capture: {
        statusCode: 200,
        headers: { ...validHeaders, "x-request-id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
        body: {
          success: true,
          data: { status: "ok", timestamp: "2026-10-09T12:00:00Z" },
          meta: { requestId: "ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee", timestamp: "2026-10-09T12:00:00Z" },
        },
      },
    },
    {
      name: "NEG 07: Malformed UUID in X-Request-Id header",
      route: { path: "/health", method: "GET", expectedStatus: 200 },
      capture: {
        statusCode: 200,
        headers: { ...validHeaders, "x-request-id": "not-a-valid-uuid" },
        body: {
          success: true,
          data: { status: "ok", timestamp: "2026-10-09T12:00:00Z" },
          meta: { requestId: "not-a-valid-uuid", timestamp: "2026-10-09T12:00:00Z" },
        },
      },
    },
    {
      name: "NEG 08: Missing 'no-store' in Cache-Control",
      route: { path: "/health", method: "GET", expectedStatus: 200 },
      capture: {
        statusCode: 200,
        headers: { ...validHeaders, "cache-control": "public, max-age=3600" },
        body: {
          success: true,
          data: { status: "ok", timestamp: "2026-10-09T12:00:00Z" },
          meta: { requestId: testRequestId, timestamp: "2026-10-09T12:00:00Z" },
        },
      },
    },
    {
      name: "NEG 09: Body {} (empty object) on 204 No Content response",
      route: { path: "/health", method: "OPTIONS", expectedStatus: 204, classification: "cors_preflight" },
      capture: {
        statusCode: 204,
        headers: { ...validHeaders },
        body: {},
        rawBody: "{}",
        hasRawBody: true,
      },
    },
    {
      name: "NEG 10: Body whitespace only on 204 No Content response",
      route: { path: "/health", method: "OPTIONS", expectedStatus: 204, classification: "cors_preflight" },
      capture: {
        statusCode: 204,
        headers: { ...validHeaders },
        body: "   ",
        rawBody: "   ",
        hasRawBody: true,
      },
    },
    {
      name: "NEG 11: Unknown operation path /banana with method GET",
      route: { path: "/banana", method: "GET", expectedStatus: 404 },
      capture: {
        statusCode: 404,
        headers: { ...validHeaders },
        body: {
          success: false,
          error: { code: "not_found", message: "Not found." },
          meta: { requestId: testRequestId, timestamp: "2026-10-09T12:00:00Z" },
        },
      },
    },
    {
      name: "NEG 12: Unknown HTTP method BANANA on /health 204",
      route: { path: "/unknown-codex-operation", method: "BANANA", expectedStatus: 204 },
      capture: {
        statusCode: 204,
        headers: { ...validHeaders },
        body: null,
        rawBody: "",
        hasRawBody: false,
      },
    },
    {
      name: "NEG 13: Undeclared 204 status on GET /health",
      route: { path: "/health", method: "GET", expectedStatus: 204 },
      capture: {
        statusCode: 204,
        headers: { ...validHeaders },
        body: null,
        rawBody: "",
        hasRawBody: false,
      },
    },
    {
      name: "NEG 14: Non-JSON Content-Type (application/jsonp) on 200 response",
      route: { path: "/health", method: "GET", expectedStatus: 200 },
      capture: {
        statusCode: 200,
        headers: { ...validHeaders, "content-type": "application/jsonp" },
        body: {
          success: true,
          data: { status: "ok", timestamp: "2026-10-09T12:00:00Z" },
          meta: { requestId: testRequestId, timestamp: "2026-10-09T12:00:00Z" },
        },
      },
    },
    {
      name: "NEG 15: Missing Retry-After header on 429 rate limit response",
      route: { path: "/version", method: "GET", expectedStatus: 429 },
      capture: {
        statusCode: 429,
        headers: { ...validHeaders },
        body: {
          success: false,
          error: { code: "too_many_requests", message: "Too many requests. Please retry later." },
          meta: { requestId: testRequestId, timestamp: "2026-10-09T12:00:00Z" },
        },
      },
    },
    {
      name: "NEG 16: Wrong operation schema mapping (Version response to Health route)",
      route: { path: "/health", method: "GET", expectedStatus: 200 },
      capture: {
        statusCode: 200,
        headers: { ...validHeaders },
        body: {
          success: true,
          data: { version: "1.0.0", commit: "abcdef12", schemaVersion: 1 },
          meta: { requestId: testRequestId, timestamp: "2026-10-09T12:00:00Z" },
        },
      },
    },
  ];

  let negativePassed = 0;
  let negativeFailed = 0;

  for (const neg of negativeCases) {
    const result = validateCapture(neg.capture, neg.route, specDoc);
    if (!result.valid) {
      console.log(`  ✓ Correctly rejected: [${neg.name}] (Errors: ${result.errors.length})`);
      negativePassed++;
    } else {
      console.error(`  ✗ FALSE PASS (should have rejected): [${neg.name}]`);
      negativeFailed++;
    }
  }

  console.log(`Negative Controls Result: ${negativePassed} rejected correctly, ${negativeFailed} false passes.\n`);
  return { negativePassed, negativeFailed };
}

/**
 * CLI Entrypoint.
 * Parses arguments: --captures-dir, --manifest, --run-id, --spec.
 * Verifies manifest metadata, file presence, sha256 hashes, and schema conformance.
 */
export function runCli(argv = process.argv.slice(2)) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const rootDir = path.resolve(__dirname, "../..");

  let capturesDir = path.join(rootDir, "scratch/http-captures");
  let manifestPath = null;
  let expectedRunId = null;
  let openapiPath = path.join(rootDir, "docs/backend/openapi.v1.json");

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--captures-dir" && argv[i + 1]) {
      capturesDir = path.resolve(argv[++i]);
    } else if (argv[i] === "--manifest" && argv[i + 1]) {
      manifestPath = path.resolve(argv[++i]);
    } else if (argv[i] === "--run-id" && argv[i + 1]) {
      expectedRunId = argv[++i];
    } else if (argv[i] === "--spec" && argv[i + 1]) {
      openapiPath = path.resolve(argv[++i]);
    } else {
      console.error(`FATAL: Unknown or incomplete CLI argument: ${argv[i]}`);
      return 1;
    }
  }

  if (!manifestPath) {
    manifestPath = path.join(capturesDir, "manifest.json");
  }

  if (!expectedRunId) {
    console.error("FATAL: Phase acceptance gate requires an explicit --run-id argument.");
    return 1;
  }

  if (!fs.existsSync(openapiPath)) {
    console.error(`FATAL: OpenAPI specification not found at ${openapiPath}`);
    return 1;
  }
  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(openapiPath, "utf8"));
  } catch {
    console.error("FATAL: OpenAPI specification is not readable JSON.");
    return 1;
  }

  console.log("=== Phase 13A Backend HTTP Capture & Contract Gate ===");
  console.log(`Spec:        ${openapiPath}`);
  console.log(`Captures:    ${capturesDir}`);
  console.log(`Manifest:    ${manifestPath}`);
  console.log(`Expected Run: ${expectedRunId}\n`);

  // 1. Run in-process negative controls
  const { negativeFailed } = runNegativeControls(spec);
  if (negativeFailed > 0) {
    console.error("FATAL: Negative controls failed! Validator cannot be trusted.");
    return 1;
  }

  // 2. Validate manifest presence and top-level metadata
  if (!fs.existsSync(manifestPath)) {
    console.error(`FATAL: Manifest file not found at ${manifestPath}`);
    return 1;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (e) {
    console.error(`FATAL: Failed to parse manifest JSON at ${manifestPath}: ${e.message}`);
    return 1;
  }

  if (!manifest || typeof manifest !== "object") {
    console.error(`FATAL: Manifest at ${manifestPath} is not a valid JSON object.`);
    return 1;
  }

  if (!manifest.runId || typeof manifest.runId !== "string") {
    console.error("FATAL: Manifest missing required string 'runId' attribute.");
    return 1;
  }

  if (manifest.runId !== expectedRunId) {
    console.error(`FATAL: Stale run identity! Expected run [${expectedRunId}], got manifest run [${manifest.runId}]`);
    return 1;
  }

  const now = Date.now();
  const timestampMillis = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return NaN;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : NaN;
  };
  const generatedAt = timestampMillis(manifest.generatedAt);
  if (!Number.isFinite(generatedAt) || generatedAt > now + 60000) {
    console.error(`FATAL: Manifest missing valid ISO 8601 'generatedAt' timestamp, got: '${manifest.generatedAt}'`);
    return 1;
  }

  if (!Array.isArray(manifest.captures)) {
    console.error("FATAL: Manifest missing 'captures' array.");
    return 1;
  }

  // 3. Structural verification against authoritative 16-probe matrix
  const seenNames = new Set();
  const duplicateNames = new Set();
  const seenFiles = new Set();
  const duplicateFiles = new Set();
  const structuralErrors = [];

  for (let i = 0; i < manifest.captures.length; i++) {
    const item = manifest.captures[i];
    if (!item || typeof item !== "object") {
      structuralErrors.push(`Capture item at index ${i} is null, undefined, or not an object`);
      continue;
    }
    if (typeof item.name === "string") {
      if (seenNames.has(item.name)) duplicateNames.add(item.name);
      seenNames.add(item.name);
    }
    if (typeof item.file === "string") {
      if (seenFiles.has(item.file)) duplicateFiles.add(item.file);
      seenFiles.add(item.file);
    }
  }

  const missingProbes = REQUIRED_PROBES.filter((p) => !seenNames.has(p.name)).map((p) => p.name);
  const unexpectedProbes = [...seenNames].filter((name) => !REQUIRED_PROBES_MAP.has(name));

  if (
    structuralErrors.length > 0 ||
    duplicateNames.size > 0 ||
    duplicateFiles.size > 0 ||
    missingProbes.length > 0 ||
    unexpectedProbes.length > 0 ||
    manifest.captures.length !== EXPECTED_PROBE_COUNT
  ) {
    console.error("FATAL: Manifest capture set does not match the authoritative 16-probe matrix!");
    if (structuralErrors.length > 0) {
      structuralErrors.forEach((e) => console.error(`  - ${e}`));
    }
    if (missingProbes.length > 0) {
      console.error(`  - Missing required probes (${missingProbes.length}): ${missingProbes.join(", ")}`);
    }
    if (unexpectedProbes.length > 0) {
      console.error(`  - Unexpected probes (${unexpectedProbes.length}): ${unexpectedProbes.join(", ")}`);
    }
    if (duplicateNames.size > 0) {
      console.error(`  - Duplicate probe names: ${[...duplicateNames].join(", ")}`);
    }
    if (duplicateFiles.size > 0) {
      console.error(`  - Duplicate probe files: ${[...duplicateFiles].join(", ")}`);
    }
    if (manifest.captures.length !== EXPECTED_PROBE_COUNT) {
      console.error(`  - Expected exactly ${EXPECTED_PROBE_COUNT} captures, got ${manifest.captures.length}`);
    }
    return 1;
  }

  // 4. Validate every capture in manifest against disk bytes, metadata rules, and OpenAPI spec
  console.log(`--- Validating ${manifest.captures.length} Manifest Captures Against Spec ---`);
  let passedCount = 0;
  let failedCount = 0;

  for (const item of manifest.captures) {
    const probeDef = REQUIRED_PROBES_MAP.get(item.name);
    const itemErrors = [];

    // Safe filename check
    if (!item.file || typeof item.file !== "string" || !SAFE_FILENAME_REGEX.test(item.file)) {
      itemErrors.push(`Invalid or unsafe capture filename: '${item.file}'`);
    } else if (item.file !== probeDef.file) {
      itemErrors.push(`Capture filename mismatch: expected '${probeDef.file}', got '${item.file}'`);
    }

    // Pinned requestMethod
    if (item.requestMethod !== probeDef.requestMethod) {
      itemErrors.push(`RequestMethod mismatch: expected '${probeDef.requestMethod}', got '${item.requestMethod}'`);
    }

    // Pinned requestPath
    if (item.requestPath !== probeDef.requestPath) {
      itemErrors.push(`RequestPath mismatch: expected '${probeDef.requestPath}', got '${item.requestPath}'`);
    }

    // Pinned operationPath
    if (item.operationPath !== probeDef.operationPath) {
      itemErrors.push(`OperationPath mismatch: expected '${probeDef.operationPath}', got '${item.operationPath}'`);
    }

    // Wire path consistency: requestPath must equal DEFAULT_API_PREFIX + operationPath
    const expectedWirePath = DEFAULT_API_PREFIX + probeDef.operationPath;
    if (item.requestPath !== expectedWirePath) {
      itemErrors.push(`Contradictory wire path: '${item.requestPath}' does not match prefix '${DEFAULT_API_PREFIX}' + '${probeDef.operationPath}'`);
    }

    // Pinned expectedStatus
    if (item.expectedStatus !== probeDef.expectedStatus) {
      itemErrors.push(`ExpectedStatus mismatch: expected ${probeDef.expectedStatus}, got ${item.expectedStatus}`);
    }

    // Pinned classification
    if (item.classification !== probeDef.classification) {
      itemErrors.push(`Classification mismatch: expected ${JSON.stringify(probeDef.classification)}, got ${JSON.stringify(item.classification)}`);
    }

    // Freshness flag strictly true
    if (item.fresh !== true) {
      itemErrors.push(`Manifest item 'fresh' flag must be strictly true, got: ${item.fresh}`);
    }

    // Valid captureTimestamp
    const capturedAt = timestampMillis(item.captureTimestamp);
    if (!Number.isFinite(capturedAt) || capturedAt < generatedAt || capturedAt > now + 60000 || capturedAt - generatedAt > 1800000) {
      itemErrors.push(`Invalid ISO 8601 captureTimestamp: '${item.captureTimestamp}'`);
    }

    // SHA-256 hash format and presence
    if (!item.sha256 || typeof item.sha256 !== "string" || !SHA256_HEX_REGEX.test(item.sha256)) {
      itemErrors.push(`Missing or invalid SHA-256 hash string: '${item.sha256}'`);
    }

    // Reject malformed metadata before using filenames or hashes in disk operations.
    if (itemErrors.length > 0) {
      console.error(`  FAIL: [${item.name}]: ${itemErrors.join("; ")}`);
      failedCount++;
      continue;
    }

    // Disk file existence & verification
    const filename = item.file || probeDef.file;
    const filePath = path.join(capturesDir, filename);

    if (!fs.existsSync(filePath)) {
      itemErrors.push(`Capture file missing on disk: ${filePath}`);
    } else {
      const rawDiskContent = fs.readFileSync(filePath);
      const actualSha = crypto.createHash("sha256").update(rawDiskContent).digest("hex");

      if (item.sha256 && item.sha256.toLowerCase() !== actualSha.toLowerCase()) {
        itemErrors.push(`SHA-256 hash mismatch for ${filename}! Expected ${item.sha256}, disk content is ${actualSha}`);
      }

      const captureData = extractHeadersAndBody(filePath);

      // Validate actualStatus
      if (item.actualStatus !== item.expectedStatus) {
        itemErrors.push(`actualStatus (${item.actualStatus}) does not match expectedStatus (${item.expectedStatus})`);
      }
      if (item.actualStatus !== captureData.statusCode) {
        itemErrors.push(`actualStatus (${item.actualStatus}) does not match parsed HTTP status (${captureData.statusCode})`);
      }

      // Validate capture data against OpenAPI spec & security headers
      const routeMeta = {
        path: probeDef.operationPath,
        method: probeDef.requestMethod,
        expectedStatus: probeDef.expectedStatus,
        classification: probeDef.classification,
      };

      const result = validateCapture(captureData, routeMeta, spec);
      if (!result.valid) {
        itemErrors.push(...result.errors);
      }
    }

    if (itemErrors.length === 0) {
      console.log(`  ✓ PASS: [${item.name}] (${probeDef.requestMethod} ${probeDef.operationPath} HTTP ${probeDef.expectedStatus}) conforms to spec`);
      passedCount++;
    } else {
      console.error(`  ✗ FAIL: [${item.name || item.file}]:`);
      for (const err of itemErrors) {
        console.error(`      - ${err}`);
      }
      failedCount++;
    }
  }

  console.log(`\nCaptures Result: ${passedCount} passed, ${failedCount} failed.`);
  if (failedCount > 0) {
    return 1;
  }

  console.log("ALL HTTP CAPTURE & NEGATIVE CONTRACT GATES PASSED.");
  return 0;
}

// If invoked as CLI script directly
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const exitCode = runCli();
  process.exit(exitCode);
}
