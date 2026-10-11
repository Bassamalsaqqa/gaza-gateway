#!/usr/bin/env node
/**
 * Phase 13B Passenger Authentication HTTP Response Conformance Checker
 *
 * Verifies that HTTP response captures from the single bounded genuine HTTP
 * lifecycle conform strictly to the authoritative OpenAPI 3.1.0 specifications
 * across all ten passenger authentication operations:
 *
 * 1. postPassengerRegister (202 Accepted)
 * 2. postPassengerLogin (200 OK)
 * 3. postPassengerLogout (200 OK)
 * 4. postPassengerPasswordForgot (202 Accepted)
 * 5. postPassengerPasswordReset (200 OK)
 * 6. postPassengerEmailVerify (200 OK)
 * 7. postPassengerEmailResend (202 Accepted)
 * 8. getPassengerSessions (200 OK)
 * 9. deletePassengerSession (200 OK)
 * 10. putPassengerPassword (200 OK)
 *
 * Invariants:
 * - Pure, bounded in-process execution with zero external I/O or background processes.
 * - Resolves actual OpenAPI operation/status/media schemas intact directly from openapi.v1.json (preserving $ref siblings and object/array shape; no schema guesses).
 * - Enforces bounded input: 512 KiB per capture file, 256 KiB rawResponseBody, max 50 entries.
 * - Rejects symlinks and enforces owned storage permissions (0700 dir, 0600 marker/files on POSIX).
 * - Enforces exclusive capability marker (.exclusive_marker or .gza_owned_test_root_marker).
 * - Rejects any unauthorized fields or sensitive credential leaks (cookies, passwords, tokens, request bodies, CSRF bootstrap bodies).
 * - Executes pure envelope, response-family, and ref-sibling negative controls before validating live captures.
 * - Requires successful resolution and schema conformance for all 10 operations.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validatePayloadAgainstSchema,
  resolveJsonPointer,
} from "../../scripts/lib/backend-contract-validation.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const OPENAPI_PATH = path.join(REPO_ROOT, "docs/backend/openapi.v1.json");
const DEFAULT_CAPTURES_DIR = path.join(
  REPO_ROOT,
  "backend/storage/app/private/passenger-auth-captures"
);

export const REQUIRED_OPERATIONS = Object.freeze([
  { operationId: "postPassengerRegister", expectedStatus: 202, method: "POST", path: "/auth/register" },
  { operationId: "postPassengerLogin", expectedStatus: 200, method: "POST", path: "/auth/login" },
  { operationId: "postPassengerLogout", expectedStatus: 200, method: "POST", path: "/auth/logout" },
  { operationId: "postPassengerPasswordForgot", expectedStatus: 202, method: "POST", path: "/auth/password/forgot" },
  { operationId: "postPassengerPasswordReset", expectedStatus: 200, method: "POST", path: "/auth/password/reset" },
  { operationId: "postPassengerEmailVerify", expectedStatus: 200, method: "POST", path: "/auth/email/verify" },
  { operationId: "postPassengerEmailResend", expectedStatus: 202, method: "POST", path: "/auth/email/resend" },
  { operationId: "getPassengerSessions", expectedStatus: 200, method: "GET", path: "/auth/passenger/sessions" },
  { operationId: "deletePassengerSession", expectedStatus: 200, method: "DELETE", path: "/auth/passenger/sessions/{id}" },
  { operationId: "putPassengerPassword", expectedStatus: 200, method: "PUT", path: "/auth/passenger/password" },
]);

export const ALLOWED_CAPTURE_KEYS = Object.freeze(new Set([
  "operationId",
  "status",
  "contentType",
  "rawResponseBody",
]));

export const FORBIDDEN_LEAK_KEYS = Object.freeze(new Set([
  "cookie",
  "cookies",
  "password",
  "token",
  "rawToken",
  "csrfToken",
  "requestBody",
  "request",
  "headers",
  "body",
]));

const MAX_FILE_BYTES = 512 * 1024; // 512 KiB per capture file
const MAX_RAW_BODY_BYTES = 256 * 1024; // 256 KiB
const MAX_CAPTURES_COUNT = 50;

/**
 * Loads and parses the authoritative OpenAPI 3.1.0 document.
 */
export function loadOpenApiSpec(specPath = OPENAPI_PATH) {
  const resolved = path.resolve(specPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`OpenAPI specification file not found at: ${resolved}`);
  }
  const content = fs.readFileSync(resolved, "utf8");
  return JSON.parse(content);
}

/**
 * Resolves the declared response schema intact from openapi.v1.json.
 * Preserves ref siblings and JSON object/array shape; never uses handwritten substitutes or guesses.
 */
export function resolveOperationResponseSchema(specDoc, operationId, statusCode, mediaType = "application/json") {
  if (!specDoc || typeof specDoc !== "object" || !specDoc.paths) {
    throw new Error("Invalid OpenAPI specification document.");
  }

  let matchedOp = null;
  let matchedPath = null;
  let matchedMethod = null;

  for (const [pathKey, pathItem] of Object.entries(specDoc.paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    for (const [methodKey, op] of Object.entries(pathItem)) {
      if (op && typeof op === "object" && op.operationId === operationId) {
        matchedOp = op;
        matchedPath = pathKey;
        matchedMethod = methodKey.toUpperCase();
        break;
      }
    }
    if (matchedOp) break;
  }

  if (!matchedOp) {
    throw new Error(`Operation ID '${operationId}' not found in OpenAPI specification.`);
  }

  const responses = matchedOp.responses;
  if (!responses || typeof responses !== "object") {
    throw new Error(`Operation '${operationId}' has no responses defined.`);
  }

  const statusKey = String(statusCode);
  let responseEntry = responses[statusKey];

  if (!responseEntry) {
    throw new Error(`Operation '${operationId}' has no declared response for HTTP status ${statusKey}.`);
  }

  // Follow reusable response container $ref if present
  if (responseEntry && typeof responseEntry === "object" && typeof responseEntry.$ref === "string") {
    const resolved = resolveJsonPointer(specDoc, responseEntry.$ref);
    if (!resolved.valid || !resolved.target) {
      throw new Error(`Dangling response container reference '${responseEntry.$ref}' in operation '${operationId}'.`);
    }
    responseEntry = resolved.target;
  }

  const content = responseEntry.content;
  if (!content || typeof content !== "object") {
    throw new Error(`Operation '${operationId}' status ${statusKey} has no content block.`);
  }

  // Parse media type token (e.g. "application/json" from "application/json; charset=UTF-8")
  const normalizedMediaType = (mediaType.split(";")[0] || "").trim().toLowerCase();
  const mediaEntry = content[normalizedMediaType];
  if (!mediaEntry) {
    throw new Error(`Operation '${operationId}' status ${statusKey} does not declare media type '${normalizedMediaType}'.`);
  }

  const schema = mediaEntry.schema;
  if (!schema || typeof schema !== "object") {
    throw new Error(`Operation '${operationId}' status ${statusKey} media type '${normalizedMediaType}' has no schema.`);
  }

  // Return schema node intact, preserving $ref siblings and nested shape
  return {
    schema,
    operationId,
    path: matchedPath,
    method: matchedMethod,
    statusCode,
    mediaType: normalizedMediaType,
  };
}

/**
 * Validates a single capture record against its declared OpenAPI schema and security constraints.
 */
export function validateCaptureRecord(capture, specDoc) {
  const errors = [];

  if (!capture || typeof capture !== "object" || Array.isArray(capture)) {
    return { valid: false, errors: ["Capture record must be a JSON object."] };
  }

  // 1. Strict key check: ONLY operationId, status, contentType, rawResponseBody
  const captureKeys = Object.keys(capture);
  for (const k of captureKeys) {
    if (!ALLOWED_CAPTURE_KEYS.has(k)) {
      errors.push(`Disallowed key '${k}' in capture record (captures must contain ONLY operationId, status, contentType, rawResponseBody).`);
    }
  }

  for (const forbidden of FORBIDDEN_LEAK_KEYS) {
    if (forbidden in capture) {
      errors.push(`Forbidden sensitive field '${forbidden}' detected in capture record.`);
    }
  }

  const { operationId, status, contentType, rawResponseBody } = capture;

  if (typeof operationId !== "string" || !/^[a-zA-Z0-9_]{1,64}$/.test(operationId)) {
    errors.push(`Invalid or missing 'operationId': '${operationId}'`);
  }

  if (typeof status !== "number" || !Number.isInteger(status) || status < 100 || status > 599) {
    errors.push(`Invalid or missing HTTP 'status': '${status}'`);
  }

  if (typeof contentType !== "string" || contentType.trim() === "") {
    errors.push(`Invalid or missing 'contentType': '${contentType}'`);
  } else {
    const mediaToken = (contentType.split(";")[0] || "").trim().toLowerCase();
    if (mediaToken !== "application/json") {
      errors.push(`Expected 'contentType' to resolve to application/json, got: '${contentType}'`);
    }
  }

  if (typeof rawResponseBody !== "string") {
    errors.push("Missing or non-string 'rawResponseBody'");
  } else if (Buffer.byteLength(rawResponseBody, "utf8") > MAX_RAW_BODY_BYTES) {
    errors.push(`'rawResponseBody' exceeds bound of ${MAX_RAW_BODY_BYTES} bytes (length: ${rawResponseBody.length})`);
  }

  if (errors.length > 0) {
    return { valid: false, errors, operationId, status };
  }

  // 2. Parse raw response body
  let parsedBody;
  try {
    parsedBody = JSON.parse(rawResponseBody);
  } catch (err) {
    return { valid: false, errors: [`Failed to parse 'rawResponseBody' as JSON: ${err.message}`], operationId, status };
  }

  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    return { valid: false, errors: ["Parsed response body must be a JSON object."], operationId, status };
  }

  // 3. Resolve OpenAPI schema intact
  let resolved;
  try {
    resolved = resolveOperationResponseSchema(specDoc, operationId, status, contentType);
  } catch (err) {
    return { valid: false, errors: [err.message], operationId, status };
  }

  // 4. Validate payload against resolved schema using shared contract validator
  const schemaResult = validatePayloadAgainstSchema(resolved.schema, parsedBody, specDoc);
  if (!schemaResult.valid) {
    errors.push(...schemaResult.errors.map((e) => `[${operationId}:${status}] ${e}`));
  }

  return {
    valid: errors.length === 0,
    errors,
    operationId,
    status,
    schemaSource: `${resolved.method} ${resolved.path} (${resolved.statusCode})`,
  };
}

/**
 * Loads captures from an owned private directory or file with bounded input and permission verification.
 */
export function loadCaptures(capturesTarget) {
  const dir = path.resolve(capturesTarget);
  const stat = fs.lstatSync(dir);
  const privateParent = path.join(REPO_ROOT, "backend/storage/app/private");
  if (stat.isSymbolicLink() || !stat.isDirectory()
      || fs.realpathSync(path.dirname(dir)) !== fs.realpathSync(privateParent)
      || !/^passenger-auth-captures-[A-Za-z0-9-]{1,80}$/.test(path.basename(dir))) {
    throw new Error("Capture directory must be an owned immediate private child.");
  }
  if (process.platform !== "win32" && (stat.mode & 0o777) !== 0o700) throw new Error("Capture directory permissions must be 0700.");
  const names = fs.readdirSync(dir).sort();
  if (JSON.stringify(names) !== JSON.stringify([".exclusive_marker", "captures.json"])) throw new Error("Unexpected capture directory entries.");
  for (const name of names) {
    const item = fs.lstatSync(path.join(dir, name));
    if (item.isSymbolicLink() || !item.isFile() || item.size > MAX_FILE_BYTES
        || (process.platform !== "win32" && (item.mode & 0o777) !== 0o600)) throw new Error("Invalid capture file boundary.");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fs.readFileSync(path.join(dir, ".exclusive_marker"), "utf8"))) throw new Error("Invalid capture marker.");
  const captures = JSON.parse(fs.readFileSync(path.join(dir, "captures.json"), "utf8"));
  if (!Array.isArray(captures) || captures.length !== REQUIRED_OPERATIONS.length) throw new Error("Exactly ten captures are required.");
  return captures;
}

/**
 * Pure envelope, response-family, and ref-sibling negative controls.
 * Proves that invalid structures, swapped families, and corrupted reference nodes fail closed.
 */
export function runPureNegativeControls(specDoc) {
  const testRequestId = "11111111-2222-3333-4444-555555555555";
  const validTimestamp = "2026-10-10T12:00:00Z";

  const negativeCases = [
    // -------------------------------------------------------------------------
    // 1. Pure Envelope Negative Checks
    // -------------------------------------------------------------------------
    {
      name: "ENV-01: Flipped success=false on 200 postPassengerLogin",
      operationId: "postPassengerLogin",
      status: 200,
      payload: {
        success: false,
        data: {
          user: {
            id: testRequestId,
            email: "ahmad@gazaairport.com",
            firstName: "Ahmad",
            lastName: "Al-Masri",
            emailVerified: true,
          },
        },
        meta: { requestId: testRequestId, timestamp: validTimestamp },
      },
    },
    {
      name: "ENV-02: Missing required meta object on 202 postPassengerRegister",
      operationId: "postPassengerRegister",
      status: 202,
      payload: {
        success: true,
        data: {
          status: "verification_dispatched",
          message: "Queued for dispatch.",
        },
      },
    },
    {
      name: "ENV-03: Missing required data object on 200 postPassengerEmailVerify",
      operationId: "postPassengerEmailVerify",
      status: 200,
      payload: {
        success: true,
        meta: { requestId: testRequestId, timestamp: validTimestamp },
      },
    },
    {
      name: "ENV-04: Non-UUID meta.requestId on 200 postPassengerLogout",
      operationId: "postPassengerLogout",
      status: 200,
      payload: {
        success: true,
        data: { message: "Successfully logged out." },
        meta: { requestId: "invalid-non-uuid-string", timestamp: validTimestamp },
      },
    },
    {
      name: "ENV-05: Non-ISO8601 meta.timestamp on 202 postPassengerPasswordForgot",
      operationId: "postPassengerPasswordForgot",
      status: 202,
      payload: {
        success: true,
        data: { message: "Queued." },
        meta: { requestId: testRequestId, timestamp: "2026/10/10 12:00" },
      },
    },
    {
      name: "ENV-06: Additional undeclared property on root envelope with additionalProperties:false",
      operationId: "postPassengerLogout",
      status: 200,
      payload: {
        success: true,
        data: { message: "Successfully logged out." },
        meta: { requestId: testRequestId, timestamp: validTimestamp },
        rogue_property: "forbidden",
      },
    },

    // -------------------------------------------------------------------------
    // 2. Pure Response Family Negative Checks
    // -------------------------------------------------------------------------
    {
      name: "FAM-01: Swapped response family (ErrorResponse payload passed to 200 postPassengerLogin)",
      operationId: "postPassengerLogin",
      status: 200,
      payload: {
        success: false,
        error: { code: "unauthorized", message: "Denied" },
        meta: { requestId: testRequestId, timestamp: validTimestamp },
      },
    },
    {
      name: "FAM-02: Cross-operation payload family swap (postPassengerRegister payload on putPassengerPassword)",
      operationId: "putPassengerPassword",
      status: 200,
      payload: {
        success: true,
        data: {
          status: "verification_dispatched",
          message: "Queued for dispatch.",
        },
        meta: { requestId: testRequestId, timestamp: validTimestamp },
      },
    },
    {
      name: "FAM-03: Cross-operation payload family swap (deletePassengerSession payload on getPassengerSessions)",
      operationId: "getPassengerSessions",
      status: 200,
      payload: {
        success: true,
        data: { revoked: true },
        meta: { requestId: testRequestId, timestamp: validTimestamp },
      },
    },

    // -------------------------------------------------------------------------
    // 3. Pure Ref-Sibling & DTO Constraint Negative Checks
    // -------------------------------------------------------------------------
    {
      name: "REF-01: Malformed email inside referenced PassengerAuthResponse user DTO",
      operationId: "postPassengerLogin",
      status: 200,
      payload: {
        success: true,
        data: {
          user: {
            id: testRequestId,
            email: "not-an-email-address",
            firstName: "Ahmad",
            lastName: "Al-Masri",
            emailVerified: true,
          },
        },
        meta: { requestId: testRequestId, timestamp: validTimestamp },
      },
    },
    {
      name: "REF-02: Non-UUID user.id inside referenced PassengerAuthResponse user DTO",
      operationId: "postPassengerLogin",
      status: 200,
      payload: {
        success: true,
        data: {
          user: {
            id: "not-a-valid-uuid",
            email: "ahmad@gazaairport.com",
            firstName: "Ahmad",
            lastName: "Al-Masri",
            emailVerified: true,
          },
        },
        meta: { requestId: testRequestId, timestamp: validTimestamp },
      },
    },
    {
      name: "REF-03: Corrupted array element type in referenced PassengerSessionListResponse sessions",
      operationId: "getPassengerSessions",
      status: 200,
      payload: {
        success: true,
        data: {
          sessions: [
            {
              id: testRequestId,
              ipAddress: "198.51.100.1",
              userAgent: "Mozilla/5.0",
              createdAt: validTimestamp,
              lastSeenAt: validTimestamp,
              current: "NOT_A_BOOLEAN", // Schema requires boolean
            },
          ],
        },
        meta: { requestId: testRequestId, timestamp: validTimestamp },
      },
    },
    {
      name: "REF-04: Invalid enum value inside referenced PassengerRegisterReceiptResponse status",
      operationId: "postPassengerRegister",
      status: 202,
      payload: {
        success: true,
        data: {
          status: "unexpected_status_value", // Must be "verification_dispatched"
          message: "Queued.",
        },
        meta: { requestId: testRequestId, timestamp: validTimestamp },
      },
    },
  ];

  for (const tc of negativeCases) {
    const resolved = resolveOperationResponseSchema(specDoc, tc.operationId, tc.status, "application/json");
    const result = validatePayloadAgainstSchema(resolved.schema, tc.payload, specDoc);
    if (result.valid) {
      throw new Error(`Negative control failure: '${tc.name}' unexpectedly passed schema validation!`);
    }
  }

  const schema = resolveOperationResponseSchema(specDoc, "postPassengerLogin", 200).schema;
  const actualFamily = { success: true, data: { user: { id: testRequestId, email: "synthetic@example.test", firstName: "Synthetic", lastName: "Capture", emailVerified: true } }, meta: { requestId: testRequestId, timestamp: validTimestamp } };
  const positive = validatePayloadAgainstSchema(schema, actualFamily, specDoc);
  if (!positive.valid) throw new Error("Reference sibling positive control is invalid.");
  if (validatePayloadAgainstSchema({ ...schema, not: true }, actualFamily, specDoc).valid) throw new Error("Reference sibling assertion was dropped.");
  return { passed: true, count: negativeCases.length + 1 };
}

/**
 * Main command line execution entry point.
 */
export function main() {
  const args = process.argv.slice(2);
  let explicitTarget = null;
  let pureControlsOnly = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--negative-controls-only" || arg === "--check-pure" || arg === "--pure") {
      pureControlsOnly = true;
    } else if (arg === "--captures-dir" || arg === "--captures" || arg === "-c" || arg === "--path") {
      explicitTarget = args[i + 1];
      i++;
    } else if (!arg.startsWith("--") && explicitTarget === null) {
      explicitTarget = arg;
    }
  }

  const specDoc = loadOpenApiSpec();

  // 1. Execute pure negative controls first
  console.log("=== Phase 13B Passenger Auth Response Conformance Gate ===");
  console.log("Executing pure envelope, response-family, and ref-sibling negative controls...");
  const negResult = runPureNegativeControls(specDoc);
  console.log(`[PASS] Verified ${negResult.count} pure negative controls (all invalid payloads rejected).`);

  if (pureControlsOnly) {
    console.log("Pure controls completed successfully.");
    process.exit(0);
  }

  // 2. Resolve capture target
  const target = explicitTarget || process.env.CAPTURES_PATH || process.env.CAPTURES_DIR || DEFAULT_CAPTURES_DIR;
  const targetResolved = path.resolve(target);

  if (!fs.existsSync(targetResolved)) {
    if (explicitTarget) {
      console.error(`FATAL: Specified captures target does not exist: ${targetResolved}`);
      process.exit(1);
    }
    console.log(`[INFO] Default captures directory not found at: ${targetResolved}`);
    console.error("FATAL: Genuine captures are required; use --pure for pure-only execution.");
    process.exit(1);
  }

  // 3. Load captures
  console.log(`Loading captures from: ${targetResolved}`);
  let rawCaptures;
  try {
    rawCaptures = loadCaptures(targetResolved);
  } catch (err) {
    console.error(`FATAL: Failed to load captures: ${err.message}`);
    process.exit(1);
  }

  if (rawCaptures.length === 0) {
    if (explicitTarget) {
      console.error(`FATAL: No capture records found in: ${targetResolved}`);
      process.exit(1);
    }
    console.log("[INFO] No capture records found in default directory.");
    console.error("FATAL: Genuine captures are required; use --pure for pure-only execution.");
    process.exit(1);
  }

  // 4. Validate each capture
  const capturesByOp = new Map();
  const validationErrors = [];

  for (const capture of rawCaptures) {
    const val = validateCaptureRecord(capture, specDoc);
    if (!val.valid) {
      validationErrors.push(...val.errors);
    } else {
      if (capturesByOp.has(val.operationId)) validationErrors.push("Duplicate operation capture.");
      capturesByOp.set(val.operationId, capture);
    }
  }

  if (validationErrors.length > 0) {
    console.error("FATAL: Validation errors detected in capture records:");
    for (const e of validationErrors) {
      console.error(`  - ${e}`);
    }
    process.exit(1);
  }

  // 5. Require all 10 success operations
  const missingOps = [];
  const statusMismatches = [];

  for (const reqOp of REQUIRED_OPERATIONS) {
    const cap = capturesByOp.get(reqOp.operationId);
    if (!cap) {
      missingOps.push(reqOp.operationId);
    } else if (cap.status !== reqOp.expectedStatus) {
      statusMismatches.push(`${reqOp.operationId}: expected status ${reqOp.expectedStatus}, got ${cap.status}`);
    }
  }

  if (missingOps.length > 0) {
    console.error(`FATAL: Missing captures for ${missingOps.length} required operation(s):`);
    for (const m of missingOps) {
      console.error(`  - ${m}`);
    }
    process.exit(1);
  }

  if (statusMismatches.length > 0) {
    console.error(`FATAL: Status code mismatches detected:`);
    for (const sm of statusMismatches) {
      console.error(`  - ${sm}`);
    }
    process.exit(1);
  }

  console.log(`[PASS] Successfully validated all 10 passenger authentication HTTP operations against OpenAPI 3.1.0 schemas:`);
  for (const reqOp of REQUIRED_OPERATIONS) {
    console.log(`  ✓ ${reqOp.operationId} (${reqOp.expectedStatus}) [${reqOp.method} ${reqOp.path}]`);
  }
  console.log("Result: 10/10 operations conform to authoritative contract.");
  process.exit(0);
}

// Execute main if run directly
const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectExecution) {
  main();
}
