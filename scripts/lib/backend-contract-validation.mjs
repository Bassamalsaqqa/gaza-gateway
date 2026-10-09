/**
 * Gaza Gateway — Reusable Backend Contract & OpenAPI Validation Helper
 *
 * Pure validation library shared between scripts/validate-backend-contracts.mjs
 * and tests/unit/backend-contracts.test.ts. No runtime or external dependencies.
 *
 * Implements:
 * 1. Deep OpenAPI 3.1.0 specification traversal, unique operation IDs, reference resolution
 * 2. Strict machine authorization policies backed by docs/backend/operation-policies.v1.json
 * 3. Exact security alternatives comparison and branch conditions enforcement (x-authorization-branches)
 * 4. Pinned security scheme definitions in components.securitySchemes
 * 5. Full-specification schema preflight traversing all schema locations across all media types and containers
 * 6. Keyword value-shape checking (required unique, enum non-empty unique, combinators non-empty, string $ref)
 * 7. Unicode code-point string length counting (minLength / maxLength)
 * 8. RFC 3339 date-time and time formats, boolean-safe refs, and items:false
 * 9. Semantic booking passenger linking invariant validator using linkedAdultPassengerId
 */

export const CANONICAL_PERMISSIONS = Object.freeze([
  "dashboard.view",
  "ops.view",
  "ops.edit",
  "content.view",
  "content.edit",
  "commercial.view",
  "commercial.edit",
  "engagement.view",
  "engagement.edit",
  "admin.manage",
]);

export const CANONICAL_CABINS = Object.freeze(["economy", "premium", "business"]);
export const CANONICAL_FARE_IDS = Object.freeze(["essential", "classic", "flex"]);

export const REQUIRED_PHASE_TAGS = Object.freeze([
  "13A: Health & System",
  "13B: Passenger Auth & Profile",
  "13B: Staff Auth & Administration",
  "13C: Aviation Reference",
  "13C: Commercial Products",
  "13C: Flight Operations",
  "13D: Booking Core & Quotes",
  "13D: Booking Passenger Management",
  "13D: Check-in & Boarding",
  "13E: CMS & Publications",
  "13E: Historical Archive & Media",
  "13E: Contact Inbox & Support",
  "13F: Payments & Reconciliation",
  "13G: Data Migration",
]);

export const EXPECTED_SECURITY_SCHEMES = Object.freeze({
  PassengerCookieAuth: { type: "apiKey", in: "cookie", name: "gza_session" },
  StaffCookieAuth: { type: "apiKey", in: "cookie", name: "gza_staff_session" },
  StaffPreAuthCookieAuth: { type: "apiKey", in: "cookie", name: "gza_staff_pending" },
  BookingGuestGrantAuth: { type: "apiKey", in: "header", name: "X-Booking-Token" },
  BookingReceiptGrantAuth: { type: "apiKey", in: "header", name: "X-Booking-Receipt" },
  WebhookSignatureAuth: { type: "apiKey", in: "header", name: "X-Signature" },
});

export const STAFF_SELF_AUTH_OPS = Object.freeze([
  "getStaffCsrfBootstrap",
  "postStaffLogin",
  "postStaffLogout",
  "getStaffMe",
  "getStaffSession",
  "postStaffStepUp",
  "postStaffMfaSetup",
  "postStaffMfaSetupConfirm",
  "postStaffMfaRecoveryCodesRegenerate",
  "putStaffPassword",
  "getStaffSessions",
  "deleteStaffSession",
]);

export const STAFF_SELF_PROTECTED_OPS = Object.freeze([
  "postStaffLogout",
  "getStaffMe",
  "getStaffSession",
  "postStaffStepUp",
  "postStaffMfaSetup",
  "postStaffMfaSetupConfirm",
  "postStaffMfaRecoveryCodesRegenerate",
  "putStaffPassword",
  "getStaffSessions",
  "deleteStaffSession",
]);

export const BOOKING_MANAGEMENT_OPS = Object.freeze([
  "getBookingByRef",
  "patchBookingContact",
  "putBookingSeats",
  "putBookingExtras",
  "postCancelBooking",
  "postCompleteCheckIn",
  "postUndoCheckIn",
  "getBoardingPasses",
]);

export const PASSENGER_AUTH_OPS = Object.freeze([
  "postPassengerLogout",
  "getPassengerProfile",
  "patchPassengerProfile",
  "putPassengerProfile",
  "getPassengerTravelers",
  "postPassengerTraveler",
  "putPassengerTraveler",
  "deletePassengerTraveler",
  "getSavedTravelers",
  "postSavedTraveler",
  "patchSavedTraveler",
  "deleteSavedTraveler",
  "getPassengerSessions",
  "deletePassengerSession",
  "putPassengerPassword",
  "postCreateClaimChallenge",
  "postVerifyClaimChallenge",
  "postClaimBookingToAccount",
  "getAccountBookingsList",
  "postMigrationPassengerPreview",
  "postMigrationPassengerCommit",
  "getMigrationPassengerStatus",
]);

export const DECLARED_SCHEMA_KEYWORDS = Object.freeze(
  new Set([
    "$ref",
    "$id",
    "$schema",
    "$comment",
    "type",
    "properties",
    "required",
    "additionalProperties",
    "items",
    "minItems",
    "maxItems",
    "uniqueItems",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "minLength",
    "maxLength",
    "pattern",
    "format",
    "enum",
    "const",
    "oneOf",
    "anyOf",
    "allOf",
    "not",
    "title",
    "description",
    "default",
    "examples",
    "example",
    "deprecated",
    "readOnly",
    "writeOnly",
  ]),
);

/**
 * Validates that dateStr is an exact Gregorian ISO calendar date (YYYY-MM-DD).
 */
export function isValidISODate(dateStr) {
  if (typeof dateStr !== "string") return false;
  if (!/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(dateStr)) return false;
  const parts = dateStr.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  const dt = new Date(`${dateStr}T00:00:00Z`);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Validates that str is an exact RFC 3339 date-time representation.
 */
export function isValidRFC3339DateTime(str) {
  if (typeof str !== "string") return false;
  const regex =
    /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[Tt]([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?([Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
  const match = str.match(regex);
  if (!match) return false;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const dt = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

/**
 * Validates that str is an exact RFC 3339 full-time representation (HH:mm:ss[.subsec](Z|[+-]HH:mm)).
 * Rejects local time strings like "12:30".
 */
export function isValidRFC3339Time(str) {
  if (typeof str !== "string") return false;
  const regex =
    /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?([Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
  return regex.test(str);
}

/**
 * Validates that str is a valid absolute URI.
 */
export function isValidUri(val) {
  if (typeof val !== "string") return false;
  try {
    const u = new URL(val);
    return Boolean(u.protocol);
  } catch {
    return false;
  }
}

/**
 * Resolves an internal JSON pointer ($ref) against root object.
 */
export function resolveJsonPointer(root, refString) {
  if (typeof refString !== "string" || !refString.startsWith("#/")) {
    return { valid: false, reason: `Invalid internal reference format: ${refString}` };
  }
  const parts = refString.replace(/^#\//, "").split("/");
  let current = root;
  for (const part of parts) {
    const unescaped = part.replace(/~1/g, "/").replace(/~0/g, "~");
    if (current && typeof current === "object" && unescaped in current) {
      current = current[unescaped];
    } else {
      return { valid: false, reason: `Unresolved path segment '${unescaped}' in ${refString}` };
    }
  }
  return { valid: true, target: current };
}

/**
 * Deeply traverses an object collecting all $ref strings and checking for dangling pointers.
 */
export function validateAllReferences(root) {
  const errors = [];
  let count = 0;

  function traverse(node, currentPath = "") {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((item, idx) => traverse(item, `${currentPath}[${idx}]`));
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string") {
        count++;
        const resolved = resolveJsonPointer(root, value);
        if (!resolved.valid || resolved.target === undefined) {
          errors.push(
            `Dangling reference '${value}' at ${currentPath}: ${resolved.reason || "unresolved"}`,
          );
        }
      } else {
        traverse(value, currentPath ? `${currentPath}.${key}` : key);
      }
    }
  }

  traverse(root);
  return { valid: errors.length === 0, count, errors };
}

/**
 * Validates a container $ref targeting reusable OpenAPI components (parameters, requestBodies, responses, headers).
 * Ensures correct target prefix, resolves pointer with cycle detection, and validates container shape.
 */
export function validateContainerReference(spec, refString, expectedPrefix, containerKind) {
  const errors = [];
  if (typeof refString !== "string" || !refString.startsWith(expectedPrefix)) {
    errors.push(`${containerKind} $ref must target '${expectedPrefix}', got '${refString}'`);
    return { valid: false, errors };
  }
  const visited = new Set();
  let currentRef = refString;
  let target = undefined;

  while (currentRef) {
    if (visited.has(currentRef)) {
      errors.push(`Cyclic ${containerKind} reference detected: '${currentRef}'`);
      return { valid: false, errors };
    }
    visited.add(currentRef);

    const resolved = resolveJsonPointer(spec, currentRef);
    if (!resolved.valid || resolved.target === undefined) {
      errors.push(
        `Dangling ${containerKind} reference '${currentRef}': ${resolved.reason || "unresolved"}`,
      );
      return { valid: false, errors };
    }
    target = resolved.target;
    if (target && typeof target === "object" && typeof target.$ref === "string") {
      if (!target.$ref.startsWith(expectedPrefix)) {
        errors.push(
          `${containerKind} alias $ref must target '${expectedPrefix}', got '${target.$ref}'`,
        );
        return { valid: false, errors };
      }
      currentRef = target.$ref;
    } else {
      currentRef = null;
    }
  }

  if (!target || typeof target !== "object" || Array.isArray(target)) {
    errors.push(`${containerKind} reference target '${refString}' must be a non-null object`);
    return { valid: false, errors };
  }

  // Validate container shape
  if (containerKind === "requestBody") {
    if (!target.content || typeof target.content !== "object" || Array.isArray(target.content)) {
      errors.push(`Referenced requestBody '${refString}' must declare a 'content' object`);
    }
  } else if (containerKind === "parameter") {
    if (typeof target.name !== "string" || !target.name) {
      errors.push(`Referenced parameter '${refString}' must declare a string 'name'`);
    }
    if (typeof target.in !== "string" || !target.in) {
      errors.push(`Referenced parameter '${refString}' must declare an 'in' location`);
    }
    if (target.in === "path" && target.required !== true) {
      errors.push(`Referenced path parameter '${refString}' must declare required: true`);
    }
  } else if (containerKind === "response") {
    if (typeof target.description !== "string") {
      errors.push(`Referenced response '${refString}' must declare a string 'description'`);
    }
  } else if (containerKind === "header") {
    if (target.schema === undefined && target.content === undefined) {
      errors.push(`Referenced header '${refString}' must declare 'schema' or 'content'`);
    }
  }

  return { valid: errors.length === 0, errors, target };
}

/**
 * Parses path template parameters (e.g. /bookings/{ref}/seats -> ["ref"]).
 */
export function extractPathParameters(pathTemplate) {
  const matches = pathTemplate.match(/\{([a-zA-Z0-9_-]+)\}/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1, -1));
}

/**
 * Deep equality helper for primitives, arrays, and objects.
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

/**
 * Collects all schema locations across an OpenAPI 3.1 document.
 */
export function collectAllSchemaLocations(spec) {
  const locations = [];
  function add(schema, loc) {
    if (schema !== undefined) {
      locations.push({ schema, loc });
    }
  }
  function visitContent(contentObj, parentLoc) {
    if (contentObj && typeof contentObj === "object") {
      for (const [mediaType, mediaObj] of Object.entries(contentObj)) {
        if (mediaObj?.schema !== undefined) {
          add(mediaObj.schema, `${parentLoc}.content[${mediaType}].schema`);
        }
      }
    }
  }
  function visitHeaders(headersObj, parentLoc) {
    if (headersObj && typeof headersObj === "object") {
      for (const [headerName, headerObj] of Object.entries(headersObj)) {
        if (headerObj?.schema !== undefined) {
          add(headerObj.schema, `${parentLoc}.headers[${headerName}].schema`);
        }
        if (headerObj?.content) {
          visitContent(headerObj.content, `${parentLoc}.headers[${headerName}]`);
        }
      }
    }
  }
  function visitParameter(param, loc) {
    if (!param || typeof param !== "object") return;
    if (param.schema !== undefined) {
      add(param.schema, `${loc}.schema`);
    }
    if (param.content) {
      visitContent(param.content, loc);
    }
  }

  if (spec.components?.schemas) {
    for (const [name, s] of Object.entries(spec.components.schemas)) {
      add(s, `components.schemas.${name}`);
    }
  }
  if (spec.components?.parameters) {
    for (const [name, p] of Object.entries(spec.components.parameters)) {
      visitParameter(p, `components.parameters.${name}`);
    }
  }
  if (spec.components?.headers) {
    visitHeaders(spec.components.headers, "components");
  }
  if (spec.components?.requestBodies) {
    for (const [name, rb] of Object.entries(spec.components.requestBodies)) {
      if (rb?.content) {
        visitContent(rb.content, `components.requestBodies.${name}`);
      }
    }
  }
  if (spec.components?.responses) {
    for (const [name, resp] of Object.entries(spec.components.responses)) {
      if (resp?.content) {
        visitContent(resp.content, `components.responses.${name}`);
      }
      if (resp?.headers) {
        visitHeaders(resp.headers, `components.responses.${name}`);
      }
    }
  }

  if (spec.paths && typeof spec.paths === "object") {
    for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
      if (!pathItem || typeof pathItem !== "object") continue;
      if (Array.isArray(pathItem.parameters)) {
        pathItem.parameters.forEach((p, idx) => {
          visitParameter(p, `paths[${pathKey}].parameters[${idx}]`);
        });
      }
      for (const method of ["get", "post", "put", "patch", "delete", "options", "head"]) {
        const op = pathItem[method];
        if (!op || typeof op !== "object") continue;
        const opLoc = `${method.toUpperCase()} ${pathKey}`;
        if (Array.isArray(op.parameters)) {
          op.parameters.forEach((p, idx) => {
            visitParameter(p, `${opLoc}.parameters[${idx}]`);
          });
        }
        if (op.requestBody?.content) {
          visitContent(op.requestBody.content, `${opLoc}.requestBody`);
        }
        if (op.responses && typeof op.responses === "object") {
          for (const [status, resp] of Object.entries(op.responses)) {
            if (resp?.content) {
              visitContent(resp.content, `${opLoc}.responses[${status}]`);
            }
            if (resp?.headers) {
              visitHeaders(resp.headers, `${opLoc}.responses[${status}]`);
            }
          }
        }
      }
    }
  }

  return locations;
}

/**
 * Validates a branch collection (either policy registry branchConditions or OpenAPI x-authorization-branches)
 * against closed shapes, context constraints, and bijection rules.
 */
export function validateBranchCollection(branches, opContext, docLabel) {
  const errors = [];
  const { opId, pathKey, hasRefParam, intent, allowedSchemes, requiredPermission, isStaffSelfOp } =
    opContext;

  if (intent === "public" || intent === "protocol") {
    if (Array.isArray(branches) && branches.length > 0) {
      errors.push(
        `${docLabel} for '${opId}' is declared ${intent} but specifies non-empty branches`,
      );
    }
    return errors;
  }

  if (!Array.isArray(branches)) {
    if (docLabel.includes("OpenAPI")) {
      errors.push(
        `Protected operation '${opId}' must declare 'x-authorization-branches' array in OpenAPI`,
      );
    } else {
      errors.push(
        `Protected operation '${opId}' must declare 'branchConditions' array in policy registry`,
      );
    }
    return errors;
  }

  if (branches.length === 0) {
    errors.push(`${docLabel} for protected operation '${opId}' cannot have empty branches: []`);
    return errors;
  }

  const seenBranchSchemes = new Set();
  for (let idx = 0; idx < branches.length; idx++) {
    const b = branches[idx];
    if (!b || typeof b !== "object" || Array.isArray(b)) {
      errors.push(`${docLabel} for '${opId}' branch [${idx}] must be a non-null object`);
      continue;
    }
    if (typeof b.scheme !== "string" || !(b.scheme in EXPECTED_SECURITY_SCHEMES)) {
      errors.push(
        `${docLabel} for '${opId}' branch [${idx}] has unknown or invalid scheme '${b?.scheme}'`,
      );
      continue;
    }
    if (seenBranchSchemes.has(b.scheme)) {
      errors.push(
        `${docLabel} for '${opId}' has duplicate branch condition for scheme '${b.scheme}'`,
      );
    }
    seenBranchSchemes.add(b.scheme);

    if (!allowedSchemes.has(b.scheme)) {
      errors.push(
        `${docLabel} for '${opId}' has branch condition for scheme '${b.scheme}' not present in allowedSecurity`,
      );
    }

    // Closed shape and context validation per scheme
    if (b.scheme === "PassengerCookieAuth") {
      if (b.condition === "authenticated_passenger_self") {
        for (const k of Object.keys(b)) {
          if (k !== "scheme" && k !== "condition") {
            errors.push(
              `${docLabel} for '${opId}' PassengerCookieAuth self branch contains unknown field '${k}'`,
            );
          }
        }
        if (hasRefParam) {
          errors.push(
            `${docLabel} for '${opId}' (${pathKey}) cannot use 'authenticated_passenger_self' on resource route declaring '{ref}'; must use 'authenticated_booking_owner'`,
          );
        }
      } else if (b.condition === "authenticated_booking_owner") {
        for (const k of Object.keys(b)) {
          if (!["scheme", "condition", "boundResource", "referenceParameter"].includes(k)) {
            errors.push(
              `${docLabel} for '${opId}' PassengerCookieAuth booking owner branch contains unknown field '${k}'`,
            );
          }
        }
        if (!hasRefParam) {
          errors.push(
            `${docLabel} for '${opId}' (${pathKey}) cannot use 'authenticated_booking_owner' on route without '{ref}'`,
          );
        }
        if (b.boundResource !== "booking") {
          errors.push(
            `${docLabel} for '${opId}' PassengerCookieAuth booking owner branch boundResource must be 'booking', got '${b.boundResource}'`,
          );
        }
        if (b.referenceParameter !== "ref") {
          errors.push(
            `${docLabel} for '${opId}' PassengerCookieAuth booking owner branch referenceParameter must be 'ref', got '${b.referenceParameter}'`,
          );
        }
      } else {
        errors.push(
          `${docLabel} for '${opId}' PassengerCookieAuth branch has invalid condition '${b.condition}'`,
        );
      }
    } else if (b.scheme === "BookingGuestGrantAuth") {
      if (b.condition !== "valid_booking_grant") {
        errors.push(
          `${docLabel} for '${opId}' BookingGuestGrantAuth branch condition must be 'valid_booking_grant', got '${b.condition}'`,
        );
      }
      for (const k of Object.keys(b)) {
        if (
          ![
            "scheme",
            "condition",
            "boundResource",
            "referenceParameter",
            "action",
            "requiresUnexpired",
            "requiresRevocationValid",
          ].includes(k)
        ) {
          errors.push(
            `${docLabel} for '${opId}' BookingGuestGrantAuth branch contains unknown field '${k}'`,
          );
        }
      }
      if (!hasRefParam) {
        errors.push(
          `${docLabel} for '${opId}' (${pathKey}) cannot use BookingGuestGrantAuth on route without '{ref}'`,
        );
      }
      if (b.boundResource !== "booking") {
        errors.push(
          `${docLabel} for '${opId}' BookingGuestGrantAuth branch boundResource must be 'booking', got '${b.boundResource}'`,
        );
      }
      if (b.referenceParameter !== "ref") {
        errors.push(
          `${docLabel} for '${opId}' BookingGuestGrantAuth branch referenceParameter must be 'ref', got '${b.referenceParameter}'`,
        );
      }
      if (b.action !== opId) {
        errors.push(
          `${docLabel} for '${opId}' BookingGuestGrantAuth branch action must match operationId '${opId}', got '${b.action}'`,
        );
      }
      if (b.requiresUnexpired !== true) {
        errors.push(
          `${docLabel} for '${opId}' BookingGuestGrantAuth branch requires 'requiresUnexpired: true'`,
        );
      }
      if (b.requiresRevocationValid !== true) {
        errors.push(
          `${docLabel} for '${opId}' BookingGuestGrantAuth branch requires 'requiresRevocationValid: true'`,
        );
      }
    } else if (b.scheme === "StaffCookieAuth") {
      for (const k of Object.keys(b)) {
        if (!["scheme", "condition", "requiredPermission", "requiresActive"].includes(k)) {
          errors.push(
            `${docLabel} for '${opId}' StaffCookieAuth branch contains unknown field '${k}'`,
          );
        }
      }
      if (b.requiresActive !== true) {
        errors.push(
          `${docLabel} for '${opId}' StaffCookieAuth branch requires 'requiresActive: true'`,
        );
      }
      if (b.condition === "authenticated_staff") {
        if (!b.requiredPermission || !CANONICAL_PERMISSIONS.includes(b.requiredPermission)) {
          errors.push(
            `${docLabel} for '${opId}' StaffCookieAuth authenticated_staff branch requires a canonical permission, got '${b.requiredPermission}'`,
          );
        }
        if (requiredPermission && b.requiredPermission !== requiredPermission) {
          errors.push(
            `${docLabel} for '${opId}' StaffCookieAuth branch requiredPermission '${b.requiredPermission}' does not match operation required permission '${requiredPermission}'`,
          );
        }
      } else if (b.condition === "authenticated_staff_self") {
        if (!isStaffSelfOp) {
          errors.push(
            `${docLabel} for '${opId}' is not an allowed staff-self operation; cannot use 'authenticated_staff_self' condition`,
          );
        }
        if (b.requiredPermission !== null) {
          errors.push(
            `${docLabel} for '${opId}' StaffCookieAuth authenticated_staff_self branch must have requiredPermission: null, got '${b.requiredPermission}'`,
          );
        }
      } else {
        errors.push(
          `${docLabel} for '${opId}' StaffCookieAuth branch has invalid condition '${b.condition}'`,
        );
      }
    } else if (b.scheme === "WebhookSignatureAuth") {
      if (b.condition !== "valid_webhook_signature") {
        errors.push(
          `${docLabel} for '${opId}' WebhookSignatureAuth branch condition must be 'valid_webhook_signature', got '${b.condition}'`,
        );
      }
      for (const k of Object.keys(b)) {
        if (k !== "scheme" && k !== "condition") {
          errors.push(
            `${docLabel} for '${opId}' WebhookSignatureAuth branch contains unknown field '${k}'`,
          );
        }
      }
      if (opId !== "postPaymentWebhook") {
        errors.push(
          `${docLabel} for '${opId}' WebhookSignatureAuth branch is only allowed on postPaymentWebhook`,
        );
      }
    } else if (b.scheme === "StaffPreAuthCookieAuth") {
      const allowedPendingOps = [
        "postStaffMfaChallenge",
        "postStaffMfaVerify",
        "postStaffMfaEnrollmentSetup",
        "postStaffMfaEnrollmentConfirm",
      ];
      if (!allowedPendingOps.includes(opId)) {
        errors.push(
          `${docLabel} for '${opId}' StaffPreAuthCookieAuth is not allowed; restricted only to pending staff MFA/enrollment operations`,
        );
      }
      if (b.condition !== "pending_staff_mfa") {
        errors.push(
          `${docLabel} for '${opId}' StaffPreAuthCookieAuth branch condition must be 'pending_staff_mfa', got '${b.condition}'`,
        );
      }
      for (const k of Object.keys(b)) {
        if (
          ![
            "scheme",
            "condition",
            "purpose",
            "allowedEndpoint",
            "requiresBoundSession",
            "requiresUnexpired",
            "requiresRevocationValid",
          ].includes(k)
        ) {
          errors.push(
            `${docLabel} for '${opId}' StaffPreAuthCookieAuth branch contains unknown field '${k}'`,
          );
        }
      }
      if (b.purpose !== "login_mfa" && b.purpose !== "enroll_mfa") {
        errors.push(
          `${docLabel} for '${opId}' StaffPreAuthCookieAuth branch purpose must be 'login_mfa' or 'enroll_mfa', got '${b.purpose}'`,
        );
      }
      if (b.allowedEndpoint !== opId) {
        errors.push(
          `${docLabel} for '${opId}' StaffPreAuthCookieAuth branch allowedEndpoint '${b.allowedEndpoint}' must match operationId '${opId}'`,
        );
      }
      if (b.requiresBoundSession !== true) {
        errors.push(
          `${docLabel} for '${opId}' StaffPreAuthCookieAuth branch requires 'requiresBoundSession: true'`,
        );
      }
      if (b.requiresUnexpired !== true) {
        errors.push(
          `${docLabel} for '${opId}' StaffPreAuthCookieAuth branch requires 'requiresUnexpired: true'`,
        );
      }
      if (b.requiresRevocationValid !== true) {
        errors.push(
          `${docLabel} for '${opId}' StaffPreAuthCookieAuth branch requires 'requiresRevocationValid: true'`,
        );
      }
    } else if (b.scheme === "BookingReceiptGrantAuth") {
      if (opId !== "getBookingReceipt") {
        errors.push(
          `${docLabel} for '${opId}' BookingReceiptGrantAuth is only allowed on getBookingReceipt`,
        );
      }
      if (b.condition !== "valid_booking_receipt_grant") {
        errors.push(
          `${docLabel} for '${opId}' BookingReceiptGrantAuth branch condition must be 'valid_booking_receipt_grant', got '${b.condition}'`,
        );
      }
      for (const k of Object.keys(b)) {
        if (
          ![
            "scheme",
            "condition",
            "boundResource",
            "referenceParameter",
            "action",
            "requiresUnexpired",
            "requiresRevocationValid",
          ].includes(k)
        ) {
          errors.push(
            `${docLabel} for '${opId}' BookingReceiptGrantAuth branch contains unknown field '${k}'`,
          );
        }
      }
      if (!hasRefParam) {
        errors.push(
          `${docLabel} for '${opId}' (${pathKey}) cannot use BookingReceiptGrantAuth on route without '{ref}'`,
        );
      }
      if (b.boundResource !== "booking") {
        errors.push(
          `${docLabel} for '${opId}' BookingReceiptGrantAuth branch boundResource must be 'booking', got '${b.boundResource}'`,
        );
      }
      if (b.referenceParameter !== "ref") {
        errors.push(
          `${docLabel} for '${opId}' BookingReceiptGrantAuth branch referenceParameter must be 'ref', got '${b.referenceParameter}'`,
        );
      }
      if (b.action !== opId) {
        errors.push(
          `${docLabel} for '${opId}' BookingReceiptGrantAuth branch action must match operationId '${opId}', got '${b.action}'`,
        );
      }
      if (b.requiresUnexpired !== true) {
        errors.push(
          `${docLabel} for '${opId}' BookingReceiptGrantAuth branch requires 'requiresUnexpired: true'`,
        );
      }
      if (b.requiresRevocationValid !== true) {
        errors.push(
          `${docLabel} for '${opId}' BookingReceiptGrantAuth branch requires 'requiresRevocationValid: true'`,
        );
      }
    }
  }

  // Scheme coverage check
  for (const reqSch of allowedSchemes) {
    if (!seenBranchSchemes.has(reqSch)) {
      errors.push(
        `${docLabel} for '${opId}' missing branch condition for required scheme '${reqSch}'`,
      );
    }
  }

  return errors;
}

/**
 * Validates operation-level authorization policies against an operation policies registry.
 * Compares exact security alternatives and x-authorization-branches metadata.
 */
export function validateOperationPolicies(spec, policyRegistry) {
  const errors = [];
  if (!policyRegistry || typeof policyRegistry !== "object") {
    return { valid: false, errors: ["Policy registry must be a non-null object"] };
  }
  if (policyRegistry.version !== "1.0.0") {
    return {
      valid: false,
      errors: [`Policy registry version must be '1.0.0', got '${policyRegistry.version}'`],
    };
  }
  if (!Array.isArray(policyRegistry.operations)) {
    return { valid: false, errors: ["Policy registry must contain an 'operations' array"] };
  }
  if (
    policyRegistry.totalOperations !== undefined &&
    policyRegistry.totalOperations !== policyRegistry.operations.length
  ) {
    errors.push(
      `Policy registry totalOperations (${policyRegistry.totalOperations}) does not match operations array length (${policyRegistry.operations.length})`,
    );
  }

  const policyMap = new Map();
  for (let i = 0; i < policyRegistry.operations.length; i++) {
    const pol = policyRegistry.operations[i];
    if (!pol || typeof pol !== "object" || Array.isArray(pol)) {
      errors.push(`Policy entry at index ${i} must be a non-null object`);
      continue;
    }
    if (!pol.operationId || typeof pol.operationId !== "string") {
      errors.push(`Policy entry at index ${i} missing valid 'operationId'`);
      continue;
    }
    if (policyMap.has(pol.operationId)) {
      errors.push(`Duplicate policy entry for operationId '${pol.operationId}'`);
    }
    policyMap.set(pol.operationId, pol);

    if (!pol.method || typeof pol.method !== "string") {
      errors.push(`Policy entry for '${pol.operationId}' missing valid 'method'`);
    }
    if (!pol.path || typeof pol.path !== "string") {
      errors.push(`Policy entry for '${pol.operationId}' missing valid 'path'`);
    }
    if (!pol.intent || !["public", "protocol", "protected"].includes(pol.intent)) {
      errors.push(`Policy entry for '${pol.operationId}' invalid 'intent': ${pol.intent}`);
    }
    if (!Array.isArray(pol.allowedSecurity)) {
      errors.push(`Policy entry for '${pol.operationId}' missing valid 'allowedSecurity' array`);
    } else {
      const seenAlts = [];
      for (let j = 0; j < pol.allowedSecurity.length; j++) {
        const alt = pol.allowedSecurity[j];
        if (!alt || typeof alt !== "object" || Array.isArray(alt)) {
          errors.push(
            `Policy entry for '${pol.operationId}' allowedSecurity[${j}] must be a non-null object`,
          );
          continue;
        }
        const altKeys = Object.keys(alt);
        if (altKeys.length === 0) {
          errors.push(
            `Policy entry for '${pol.operationId}' allowedSecurity[${j}] cannot be empty {}`,
          );
        }
        for (const schemeName of altKeys) {
          if (!(schemeName in EXPECTED_SECURITY_SCHEMES)) {
            errors.push(
              `Policy entry for '${pol.operationId}' allowedSecurity references unknown scheme '${schemeName}'`,
            );
          }
          if (!Array.isArray(alt[schemeName]) || alt[schemeName].length > 0) {
            errors.push(
              `Policy entry for '${pol.operationId}' scheme '${schemeName}' must have empty scopes array []`,
            );
          }
        }
        if (seenAlts.some((prev) => deepEqual(prev, alt))) {
          errors.push(
            `Policy entry for '${pol.operationId}' duplicate security alternative in allowedSecurity`,
          );
        }
        seenAlts.push(alt);
      }
    }
    if (
      pol.requiredPermission !== null &&
      !CANONICAL_PERMISSIONS.includes(pol.requiredPermission)
    ) {
      errors.push(
        `Policy entry for '${pol.operationId}' invalid 'requiredPermission': ${pol.requiredPermission}`,
      );
    }
    if (pol.intent === "public" || pol.intent === "protocol") {
      if (Array.isArray(pol.allowedSecurity) && pol.allowedSecurity.length > 0) {
        errors.push(
          `Policy entry for '${pol.operationId}' is declared ${pol.intent} but specifies non-empty allowedSecurity`,
        );
      }
      if (Array.isArray(pol.branchConditions) && pol.branchConditions.length > 0) {
        errors.push(
          `Policy entry for '${pol.operationId}' is declared ${pol.intent} but specifies non-empty branchConditions`,
        );
      }
      if (pol.requiredPermission !== null) {
        errors.push(
          `Policy entry for '${pol.operationId}' is declared ${pol.intent} but specifies requiredPermission '${pol.requiredPermission}'`,
        );
      }
    } else if (pol.intent === "protected") {
      if (Array.isArray(pol.allowedSecurity) && pol.allowedSecurity.length === 0) {
        errors.push(
          `Protected policy entry for '${pol.operationId}' cannot have empty allowedSecurity: []`,
        );
      }
      if (Array.isArray(pol.branchConditions) && pol.branchConditions.length === 0) {
        errors.push(
          `Protected policy entry for '${pol.operationId}' cannot have empty branchConditions: []`,
        );
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const specOperationIds = new Set();
  const paths = spec.paths || {};

  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    for (const method of ["get", "post", "put", "patch", "delete", "options", "head"]) {
      const op = pathItem[method];
      if (!op || typeof op !== "object") continue;

      const opId = op.operationId;
      if (!opId) continue;
      specOperationIds.add(opId);

      const policy = policyMap.get(opId);
      if (!policy) {
        errors.push(
          `Missing policy registry entry for operation '${opId}' (${method.toUpperCase()} ${pathKey})`,
        );
        continue;
      }

      // Check method and path consistency
      if (
        typeof policy.method === "string" &&
        policy.method.toUpperCase() !== method.toUpperCase()
      ) {
        errors.push(
          `Policy mismatch for operation '${opId}': declared ${policy.method} ${policy.path}, but spec has ${method.toUpperCase()} ${pathKey}`,
        );
      }
      if (typeof policy.path === "string" && policy.path !== pathKey) {
        errors.push(
          `Policy mismatch for operation '${opId}': declared path ${policy.path}, but spec has ${pathKey}`,
        );
      }

      const opSecurity =
        op.security !== undefined ? op.security : spec.security !== undefined ? spec.security : [];

      if (!Array.isArray(opSecurity)) {
        errors.push(`Operation '${opId}' security must be an array`);
        continue;
      }

      // Check each security requirement in opSecurity for empty requirement {} and unallowed schemes
      for (const secReq of opSecurity) {
        if (!secReq || typeof secReq !== "object" || Array.isArray(secReq)) {
          errors.push(`Operation '${opId}' security requirement must be a non-null object`);
          continue;
        }
        if (Object.keys(secReq).length === 0) {
          errors.push(
            `Operation '${opId}' contains an empty security requirement {} (anonymous access disallowed)`,
          );
        }
        for (const schemeName of Object.keys(secReq)) {
          const isAllowed = policy.allowedSecurity.some(
            (allowed) => allowed && typeof allowed === "object" && schemeName in allowed,
          );
          if (!isAllowed) {
            errors.push(
              `Operation '${opId}' security scheme '${schemeName}' is not in allowedSecurity policies`,
            );
          }
        }
      }

      // Exact security alternatives comparison (order independent)
      if (opSecurity.length !== policy.allowedSecurity.length) {
        errors.push(
          `Operation '${opId}' security alternatives count (${opSecurity.length}) does not match policy allowedSecurity count (${policy.allowedSecurity.length})`,
        );
      }
      for (let a = 0; a < policy.allowedSecurity.length; a++) {
        const reqAlt = policy.allowedSecurity[a];
        const hasMatch = opSecurity.some((actualAlt) => deepEqual(actualAlt, reqAlt));
        if (!hasMatch) {
          errors.push(
            `Operation '${opId}' missing required security alternative ${JSON.stringify(reqAlt)}`,
          );
        }
      }
      for (let a = 0; a < opSecurity.length; a++) {
        const actualAlt = opSecurity[a];
        const hasMatch = policy.allowedSecurity.some((reqAlt) => deepEqual(actualAlt, reqAlt));
        if (!hasMatch) {
          errors.push(
            `Operation '${opId}' has extra unauthorized security alternative ${JSON.stringify(actualAlt)}`,
          );
        }
      }

      if (policy.intent === "public" || policy.intent === "protocol") {
        if (opSecurity.length > 0) {
          errors.push(
            `Operation '${opId}' is declared ${policy.intent} in policy but specifies non-empty security in OpenAPI`,
          );
        }
        if (op["x-required-permission"]) {
          errors.push(
            `Operation '${opId}' is declared ${policy.intent} in policy but specifies 'x-required-permission'`,
          );
        }
        if (op["x-authorization-branches"] && op["x-authorization-branches"].length > 0) {
          errors.push(
            `Operation '${opId}' is declared ${policy.intent} in policy but specifies 'x-authorization-branches'`,
          );
        }
      } else if (policy.intent === "protected") {
        if (opSecurity.length === 0) {
          errors.push(`Protected operation '${opId}' cannot have empty security: []`);
        }
        const hasRefParam = pathKey.includes("{ref}");
        const allowedSchemes = new Set();
        for (const alt of policy.allowedSecurity) {
          if (alt && typeof alt === "object") {
            for (const k of Object.keys(alt)) allowedSchemes.add(k);
          }
        }
        const opContext = {
          opId,
          method: method.toUpperCase(),
          pathKey,
          hasRefParam,
          intent: policy.intent,
          allowedSchemes,
          requiredPermission: policy.requiredPermission,
          isStaffSelfOp: STAFF_SELF_PROTECTED_OPS.includes(opId),
        };

        // Validate policy branchConditions independently
        const polBranchErrors = validateBranchCollection(
          policy.branchConditions,
          opContext,
          "Policy registry branchConditions",
        );
        errors.push(...polBranchErrors);

        // Validate spec x-authorization-branches independently
        const specBranchErrors = validateBranchCollection(
          op["x-authorization-branches"],
          opContext,
          "OpenAPI x-authorization-branches",
        );
        errors.push(...specBranchErrors);

        // Compare normalized branches between policy and spec
        const policyBranches = Array.isArray(policy.branchConditions)
          ? policy.branchConditions
          : [];
        const specBranches = Array.isArray(op["x-authorization-branches"])
          ? op["x-authorization-branches"]
          : [];

        if (policyBranches.length !== specBranches.length) {
          errors.push(
            `Operation '${opId}' x-authorization-branches count (${specBranches.length}) does not match policy branchConditions count (${policyBranches.length})`,
          );
        } else {
          const pBranchByScheme = new Map();
          for (const b of policyBranches) {
            if (b && typeof b === "object" && typeof b.scheme === "string") {
              pBranchByScheme.set(b.scheme, b);
            }
          }
          const sBranchByScheme = new Map();
          for (const b of specBranches) {
            if (b && typeof b === "object" && typeof b.scheme === "string") {
              sBranchByScheme.set(b.scheme, b);
            }
          }
          for (let b = 0; b < policyBranches.length; b++) {
            const pB = policyBranches[b];
            const sch = pB?.scheme;
            const sB = sBranchByScheme.get(sch);
            if (!sB) {
              errors.push(
                `Operation '${opId}' x-authorization-branches missing branch for scheme '${sch}' declared in policy`,
              );
            } else if (!deepEqual(pB, sB)) {
              errors.push(
                `Operation '${opId}' x-authorization-branches[${b}] for '${sch}' (${JSON.stringify(sB)}) does not match policy branchConditions[${b}] (${JSON.stringify(pB)})`,
              );
            }
          }
          for (const sch of sBranchByScheme.keys()) {
            if (!pBranchByScheme.has(sch)) {
              errors.push(
                `Operation '${opId}' x-authorization-branches has extra branch for scheme '${sch}' not in policy`,
              );
            }
          }
        }

        // Check requiredPermission consistency if StaffCookieAuth is present
        const hasStaffAuth = opSecurity.some(
          (alt) => alt && typeof alt === "object" && "StaffCookieAuth" in alt,
        );
        if (hasStaffAuth) {
          if (policy.requiredPermission) {
            if (op["x-required-permission"] !== policy.requiredPermission) {
              errors.push(
                `Operation '${opId}' requires permission '${policy.requiredPermission}', but spec declared '${op["x-required-permission"]}'`,
              );
            }
          } else if (op["x-required-permission"]) {
            errors.push(
              `Operation '${opId}' is a self-auth or unpermissioned staff endpoint but declared x-required-permission '${op["x-required-permission"]}'`,
            );
          }
        }
      }

      // Check step-up consistency between policy and spec
      if (policy.requiresRecentStepUp !== undefined) {
        if (op["x-requires-recent-step-up"] !== policy.requiresRecentStepUp) {
          errors.push(
            `Operation '${opId}' requiresRecentStepUp in policy (${policy.requiresRecentStepUp}) does not match x-requires-recent-step-up in spec (${op["x-requires-recent-step-up"]})`,
          );
        }
      }

      // Check protocol/csrf mapping on unsafe operations
      if (["post", "put", "patch", "delete"].includes(method.toLowerCase())) {
        const hasProtocol = Object.keys(op).some((k) => /protocol|csrf/i.test(k));
        if (!hasProtocol) {
          errors.push(
            `Unsafe operation '${opId}' (${method.toUpperCase()} ${pathKey}) missing protocol/csrf mapping`,
          );
        }
      }

      // Check pending operation endpoint purpose pinning
      const PENDING_PURPOSES = {
        postStaffMfaChallenge: "login_mfa",
        postStaffMfaVerify: "login_mfa",
        postStaffMfaEnrollmentSetup: "enroll_mfa",
        postStaffMfaEnrollmentConfirm: "enroll_mfa",
      };
      if (opId in PENDING_PURPOSES) {
        const expectedPurpose = PENDING_PURPOSES[opId];
        const sBranch = (op["x-authorization-branches"] || []).find(
          (b) => b.scheme === "StaffPreAuthCookieAuth",
        );
        if (sBranch && sBranch.purpose !== expectedPurpose) {
          errors.push(
            `Pending operation '${opId}' spec authorization branch purpose must be '${expectedPurpose}', got '${sBranch.purpose}'`,
          );
        }
        const pBranch = (policy.branchConditions || []).find(
          (b) => b.scheme === "StaffPreAuthCookieAuth",
        );
        if (pBranch && pBranch.purpose !== expectedPurpose) {
          errors.push(
            `Pending operation '${opId}' policy branch condition purpose must be '${expectedPurpose}', got '${pBranch.purpose}'`,
          );
        }
      }
    }
  }

  // Check required sensitive step-up operations
  const REQUIRED_STEP_UP_OPS = [
    "postStaffMfaSetup",
    "postStaffMfaSetupConfirm",
    "postStaffMfaRecoveryCodesRegenerate",
    "postStaffUserInvite",
    "patchStaffUser",
    "deleteStaffUser",
    "postStaffUserInviteReissue",
    "postStaffUserInviteRevoke",
    "putStaffPassword",
  ];
  for (const reqOp of REQUIRED_STEP_UP_OPS) {
    const pOp = policyMap.get(reqOp);
    if (!pOp || pOp.requiresRecentStepUp !== true) {
      errors.push(`Sensitive operation '${reqOp}' must have requiresRecentStepUp: true in policy`);
    }
    const specHasStepUp = Object.values(paths).some((pathItem) =>
      Object.values(pathItem || {}).some(
        (op) =>
          op &&
          typeof op === "object" &&
          op.operationId === reqOp &&
          op["x-requires-recent-step-up"] === true,
      ),
    );
    if (!specHasStepUp) {
      errors.push(
        `Sensitive operation '${reqOp}' must have x-requires-recent-step-up: true in spec`,
      );
    }
  }

  // Check for orphan policy entries
  for (const polOpId of policyMap.keys()) {
    if (!specOperationIds.has(polOpId)) {
      errors.push(
        `Policy registry contains extra operationId '${polOpId}' not found in OpenAPI specification`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates an OpenAPI 3.1.0 document structure, security schemes, path parameters,
 * operation IDs, machine authorization policies, and internal references.
 */
export function validateOpenApiSpecification(spec, options = {}) {
  const errors = [];
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    return { valid: false, errors: ["Specification must be a non-null object"] };
  }

  if (spec.openapi !== "3.1.0") {
    errors.push(`Unsupported or missing openapi version: '${spec.openapi}' (expected 3.1.0)`);
  }

  if (
    !spec.info ||
    typeof spec.info !== "object" ||
    Array.isArray(spec.info) ||
    !spec.info.title ||
    !spec.info.version
  ) {
    errors.push("Missing or invalid 'info' object (title and version are required)");
  }

  // Reject unsupported root features
  if (spec.webhooks !== undefined) {
    errors.push(
      "Specification specifies unsupported OAS feature 'webhooks' (fail-closed validator policy)",
    );
  }
  if (spec.components?.callbacks !== undefined) {
    errors.push(
      "components specifies unsupported OAS feature 'callbacks' (fail-closed validator policy)",
    );
  }

  // Validate declared securitySchemes against pinned definitions
  const securitySchemes = spec.components?.securitySchemes || {};
  for (const [schemeName, expectedDef] of Object.entries(EXPECTED_SECURITY_SCHEMES)) {
    const actualDef = securitySchemes[schemeName];
    if (!actualDef || typeof actualDef !== "object" || Array.isArray(actualDef)) {
      errors.push(
        `Missing or invalid securityScheme '${schemeName}' in components.securitySchemes`,
      );
    } else {
      if (actualDef.type !== expectedDef.type) {
        errors.push(
          `securityScheme '${schemeName}' type must be '${expectedDef.type}', got '${actualDef.type}'`,
        );
      }
      if (actualDef.in !== expectedDef.in) {
        errors.push(
          `securityScheme '${schemeName}' in must be '${expectedDef.in}', got '${actualDef.in}'`,
        );
      }
      if (actualDef.name !== expectedDef.name) {
        errors.push(
          `securityScheme '${schemeName}' name must be '${expectedDef.name}', got '${actualDef.name}'`,
        );
      }
    }
  }
  for (const actualSchemeName of Object.keys(securitySchemes)) {
    if (!(actualSchemeName in EXPECTED_SECURITY_SCHEMES)) {
      errors.push(`Unexpected securityScheme '${actualSchemeName}' in components.securitySchemes`);
    }
  }

  // Validate components container elements and $ref
  if (spec.components && typeof spec.components === "object") {
    if (spec.components.schemas && typeof spec.components.schemas === "object") {
      for (const [name, sch] of Object.entries(spec.components.schemas)) {
        if (
          sch === null ||
          (typeof sch !== "object" && typeof sch !== "boolean") ||
          Array.isArray(sch)
        ) {
          errors.push(
            `components.schemas.${name} must be a schema object or boolean, got ${sch === null ? "null" : Array.isArray(sch) ? "array" : typeof sch}`,
          );
        }
      }
    }
    if (spec.components.parameters && typeof spec.components.parameters === "object") {
      for (const [name, p] of Object.entries(spec.components.parameters)) {
        if (!p || typeof p !== "object" || Array.isArray(p)) {
          errors.push(`components.parameters.${name} must be a non-null object`);
        } else if (typeof p.$ref === "string") {
          const cRef = validateContainerReference(
            spec,
            p.$ref,
            "#/components/parameters/",
            "parameter",
          );
          if (!cRef.valid)
            errors.push(...cRef.errors.map((e) => `components.parameters.${name}: ${e}`));
        }
      }
    }
    if (spec.components.responses && typeof spec.components.responses === "object") {
      for (const [name, r] of Object.entries(spec.components.responses)) {
        if (!r || typeof r !== "object" || Array.isArray(r)) {
          errors.push(`components.responses.${name} must be a non-null object`);
        } else if (typeof r.$ref === "string") {
          const cRef = validateContainerReference(
            spec,
            r.$ref,
            "#/components/responses/",
            "response",
          );
          if (!cRef.valid)
            errors.push(...cRef.errors.map((e) => `components.responses.${name}: ${e}`));
        }
      }
    }
    if (spec.components.requestBodies && typeof spec.components.requestBodies === "object") {
      for (const [name, rb] of Object.entries(spec.components.requestBodies)) {
        if (!rb || typeof rb !== "object" || Array.isArray(rb)) {
          errors.push(`components.requestBodies.${name} must be a non-null object`);
        } else if (typeof rb.$ref === "string") {
          const cRef = validateContainerReference(
            spec,
            rb.$ref,
            "#/components/requestBodies/",
            "requestBody",
          );
          if (!cRef.valid)
            errors.push(...cRef.errors.map((e) => `components.requestBodies.${name}: ${e}`));
        }
      }
    }
    if (spec.components.headers && typeof spec.components.headers === "object") {
      for (const [name, h] of Object.entries(spec.components.headers)) {
        if (!h || typeof h !== "object" || Array.isArray(h)) {
          errors.push(`components.headers.${name} must be a non-null object`);
        } else if (typeof h.$ref === "string") {
          const cRef = validateContainerReference(spec, h.$ref, "#/components/headers/", "header");
          if (!cRef.valid)
            errors.push(...cRef.errors.map((e) => `components.headers.${name}: ${e}`));
        }
      }
    }
  }

  const declaredSchemeNames = new Set(Object.keys(securitySchemes));

  // Validate root security if declared
  if (spec.security !== undefined) {
    if (!Array.isArray(spec.security)) {
      errors.push(`Specification root security must be an array, got ${typeof spec.security}`);
    } else {
      for (const secReq of spec.security) {
        if (!secReq || typeof secReq !== "object" || Array.isArray(secReq)) {
          errors.push(`Specification root security requirement must be a non-null object`);
          continue;
        }
        for (const [schemeName, scopes] of Object.entries(secReq)) {
          if (!declaredSchemeNames.has(schemeName)) {
            errors.push(
              `Specification root security references undeclared securityScheme '${schemeName}'`,
            );
          }
          if (!Array.isArray(scopes) || scopes.length > 0) {
            errors.push(
              `Specification root security requirement '${schemeName}' must declare empty scopes []`,
            );
          }
        }
      }
    }
  }

  const seenOperationIds = new Set();
  const foundTags = new Set();
  let operationCount = 0;

  const paths = spec.paths || {};
  const pathKeys = Object.keys(paths);

  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object" || Array.isArray(pathItem)) {
      errors.push(`Invalid path item at '${pathKey}' (must be object)`);
      continue;
    }

    // Reject unsupported pathItem features
    if (pathItem.$ref !== undefined) {
      errors.push(
        `Path item '${pathKey}' specifies unsupported OAS feature '$ref' (fail-closed validator policy)`,
      );
    }
    if (pathItem.callbacks !== undefined) {
      errors.push(
        `Path item '${pathKey}' specifies unsupported OAS feature 'callbacks' (fail-closed validator policy)`,
      );
    }
    if (pathItem.parameters !== undefined && !Array.isArray(pathItem.parameters)) {
      errors.push(
        `Path item '${pathKey}' parameters must be an array, got ${pathItem.parameters === null ? "null" : typeof pathItem.parameters}`,
      );
    }

    const pathParamsInTemplate = extractPathParameters(pathKey);

    for (const method of ["get", "post", "put", "patch", "delete", "options", "head"]) {
      const op = pathItem[method];
      if (!op) continue;
      if (typeof op !== "object" || Array.isArray(op)) {
        errors.push(`Operation ${method.toUpperCase()} ${pathKey} must be an object`);
        continue;
      }
      operationCount++;

      // Unique operationId
      if (!op.operationId || typeof op.operationId !== "string") {
        errors.push(`Operation ${method.toUpperCase()} ${pathKey} is missing a string operationId`);
      } else {
        if (seenOperationIds.has(op.operationId)) {
          errors.push(
            `Duplicate operationId '${op.operationId}' at ${method.toUpperCase()} ${pathKey}`,
          );
        }
        seenOperationIds.add(op.operationId);
      }

      // Reject unsupported operation features
      if (op.callbacks !== undefined) {
        errors.push(
          `Operation ${op.operationId || pathKey} specifies unsupported OAS feature 'callbacks' (fail-closed validator policy)`,
        );
      }

      // Collect tags
      if (Array.isArray(op.tags)) {
        op.tags.forEach((t) => foundTags.add(t));
      }

      // Check responses object
      if (
        !op.responses ||
        typeof op.responses !== "object" ||
        Array.isArray(op.responses) ||
        Object.keys(op.responses).length === 0
      ) {
        errors.push(
          `Operation ${op.operationId || pathKey} must declare a non-empty responses object`,
        );
      } else {
        for (const [status, resp] of Object.entries(op.responses)) {
          const isValidStatusKey =
            status === "default" || /^[1-5][0-9]{2}$/.test(status) || /^[1-5]XX$/.test(status);
          if (!isValidStatusKey) {
            errors.push(
              `Operation ${op.operationId || pathKey} response key '${status}' is not a valid HTTP status code (must be 100-599, 1XX-5XX, or 'default')`,
            );
          }
          if (!resp || typeof resp !== "object" || Array.isArray(resp)) {
            errors.push(
              `Operation ${op.operationId || pathKey} response '${status}' must be a non-null object`,
            );
            continue;
          }
          if (typeof resp.$ref === "string") {
            const cRef = validateContainerReference(
              spec,
              resp.$ref,
              "#/components/responses/",
              "response",
            );
            if (!cRef.valid) {
              errors.push(
                ...cRef.errors.map(
                  (e) => `Operation ${op.operationId || pathKey} response '${status}': ${e}`,
                ),
              );
            }
          } else {
            if (typeof resp.description !== "string") {
              errors.push(
                `Operation ${op.operationId || pathKey} response '${status}' missing string 'description'`,
              );
            }
            if (resp.headers && typeof resp.headers === "object") {
              for (const [hName, hObj] of Object.entries(resp.headers)) {
                if (!hObj || typeof hObj !== "object" || Array.isArray(hObj)) {
                  errors.push(
                    `Operation ${op.operationId || pathKey} response '${status}' header '${hName}' must be a non-null object`,
                  );
                  continue;
                }
                if (typeof hObj.$ref === "string") {
                  const hRef = validateContainerReference(
                    spec,
                    hObj.$ref,
                    "#/components/headers/",
                    "header",
                  );
                  if (!hRef.valid) {
                    errors.push(
                      ...hRef.errors.map(
                        (e) =>
                          `Operation ${op.operationId || pathKey} response '${status}' header '${hName}': ${e}`,
                      ),
                    );
                  }
                }
              }
            }
          }
        }
      }

      // Check requestBody container ref or inline content if present
      if (op.requestBody !== undefined) {
        if (
          !op.requestBody ||
          typeof op.requestBody !== "object" ||
          Array.isArray(op.requestBody)
        ) {
          errors.push(
            `Operation ${op.operationId || pathKey} requestBody must be a non-null object`,
          );
        } else if (typeof op.requestBody.$ref === "string") {
          const cRef = validateContainerReference(
            spec,
            op.requestBody.$ref,
            "#/components/requestBodies/",
            "requestBody",
          );
          if (!cRef.valid) {
            errors.push(...cRef.errors.map((e) => `Operation ${op.operationId || pathKey}: ${e}`));
          }
        } else {
          // Inline requestBody validation
          if (
            !op.requestBody.content ||
            typeof op.requestBody.content !== "object" ||
            Array.isArray(op.requestBody.content) ||
            Object.keys(op.requestBody.content).length === 0
          ) {
            errors.push(
              `Operation ${op.operationId || pathKey} inline requestBody must declare a non-empty 'content' object`,
            );
          } else {
            for (const [mediaType, mediaObj] of Object.entries(op.requestBody.content)) {
              if (!mediaObj || typeof mediaObj !== "object" || Array.isArray(mediaObj)) {
                errors.push(
                  `Operation ${op.operationId || pathKey} requestBody media type '${mediaType}' must be a non-null object`,
                );
              }
            }
          }
        }
      }

      // Path parameters
      if (op.parameters !== undefined && !Array.isArray(op.parameters)) {
        errors.push(
          `Operation ${op.operationId || pathKey} parameters must be an array, got ${op.parameters === null ? "null" : typeof op.parameters}`,
        );
      }

      const declaredPathParams = new Set();
      const allParams = [
        ...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
        ...(Array.isArray(op.parameters) ? op.parameters : []),
      ];

      for (let pIdx = 0; pIdx < allParams.length; pIdx++) {
        const p = allParams[pIdx];
        if (!p || typeof p !== "object" || Array.isArray(p)) {
          errors.push(
            `Parameter at index ${pIdx} in ${op.operationId || pathKey} must be a non-null object, got ${p === null ? "null" : typeof p}`,
          );
          continue;
        }
        let effectiveParam = p;
        if (typeof p.$ref === "string") {
          const cRef = validateContainerReference(
            spec,
            p.$ref,
            "#/components/parameters/",
            "parameter",
          );
          if (!cRef.valid) {
            errors.push(
              ...cRef.errors.map(
                (e) => `Operation ${op.operationId || pathKey} parameter[${pIdx}]: ${e}`,
              ),
            );
            continue;
          }
          effectiveParam = cRef.target;
        }
        if (effectiveParam && typeof effectiveParam === "object") {
          const paramIn = p.in !== undefined ? p.in : effectiveParam.in;
          const paramName = p.name !== undefined ? p.name : effectiveParam.name;
          const paramRequired = p.required !== undefined ? p.required : effectiveParam.required;
          if (paramIn === "path" && paramName) {
            declaredPathParams.add(paramName);
            if (paramRequired !== true) {
              errors.push(
                `Path parameter '${paramName}' in ${op.operationId || pathKey} must have required: true`,
              );
            }
          }
        }
      }
      for (const requiredName of pathParamsInTemplate) {
        if (!declaredPathParams.has(requiredName)) {
          errors.push(
            `Path template parameter '{${requiredName}}' at ${method.toUpperCase()} ${pathKey} is not declared in parameters`,
          );
        }
      }

      // Security requirement format
      const opSecurity =
        op.security !== undefined
          ? op.security
          : spec.security !== undefined
            ? spec.security
            : null;
      if (opSecurity !== null) {
        if (!Array.isArray(opSecurity)) {
          errors.push(
            `Operation ${op.operationId || pathKey} security declaration must be an array`,
          );
        } else {
          for (const secReq of opSecurity) {
            if (!secReq || typeof secReq !== "object" || Array.isArray(secReq)) {
              errors.push(
                `Operation ${op.operationId || pathKey} security requirement must be a non-null object, got ${secReq === null ? "null" : typeof secReq}`,
              );
              continue;
            }
            for (const [schemeName, scopes] of Object.entries(secReq)) {
              if (!declaredSchemeNames.has(schemeName)) {
                errors.push(
                  `Operation ${op.operationId || pathKey} references undeclared securityScheme '${schemeName}'`,
                );
              }
              const schemeDef = securitySchemes[schemeName];
              if (schemeDef && (schemeDef.type === "apiKey" || schemeDef.type === "http")) {
                if (!Array.isArray(scopes) || scopes.length > 0) {
                  errors.push(
                    `Operation ${op.operationId || pathKey} securityScheme '${schemeName}' is apiKey/http and must declare empty scopes array [], got ${JSON.stringify(scopes)}`,
                  );
                }
              }
            }
          }
        }
      }
    }
  }

  // Preflight all schemas across all schema locations in spec
  const allLocations = collectAllSchemaLocations(spec);
  for (const { schema: s, loc } of allLocations) {
    const pref = preflightSchema(s, spec, new Set(), 0);
    if (!pref.valid) {
      errors.push(...pref.errors.map((e) => `${loc} -> ${e}`));
    }
  }

  // Validate internal references
  const refResult = validateAllReferences(spec);
  if (!refResult.valid) {
    errors.push(...refResult.errors);
  }

  // If policyRegistry is provided in options, validate operation policies
  if (options.policyRegistry) {
    const policyRes = validateOperationPolicies(spec, options.policyRegistry);
    if (!policyRes.valid) {
      errors.push(...policyRes.errors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    operationCount,
    pathCount: pathKeys.length,
    foundTags: Array.from(foundTags),
    refCount: refResult.count,
  };
}

/**
 * Single-type checker helper.
 */
function matchesPrimitiveType(expectedType, val) {
  if (expectedType === "null") return val === null;
  if (expectedType === "object")
    return typeof val === "object" && val !== null && !Array.isArray(val);
  if (expectedType === "array") return Array.isArray(val);
  if (expectedType === "string") return typeof val === "string";
  if (expectedType === "integer") return typeof val === "number" && Number.isInteger(val);
  if (expectedType === "number") return typeof val === "number" && Number.isFinite(val);
  if (expectedType === "boolean") return typeof val === "boolean";
  return false;
}

/**
 * Schema preflight verification.
 * Preflights every reachable assertion schema, including negative, alternative,
 * and unselected branches. Fails closed on unsupported assertion keywords,
 * malformed keyword values, or cycles.
 */
export function preflightSchema(schema, rootDoc = null, seenRefs = new Set(), depth = 0) {
  const errors = [];

  if (depth > 50) {
    return { valid: false, errors: ["Maximum schema preflight depth exceeded (potential cycle)"] };
  }

  function checkSchema(target, path = "schema") {
    if (target === null) {
      errors.push(`${path}: Schema cannot be null (must be an object or boolean)`);
      return;
    }
    if (typeof target === "boolean") {
      return; // boolean true/false is valid JSON Schema
    }
    if (Array.isArray(target)) {
      errors.push(`${path}: Schema must be an object or boolean, got array`);
      return;
    }
    if (typeof target !== "object") {
      errors.push(`${path}: Schema must be an object or boolean, got ${typeof target}`);
      return;
    }

    // Fail closed on unsupported assertion keywords
    for (const key of Object.keys(target)) {
      if (!DECLARED_SCHEMA_KEYWORDS.has(key)) {
        errors.push(
          `${path}: Unsupported schema assertion keyword '${key}' (fail-closed validator policy)`,
        );
      }
    }

    // Keyword value-shape validation
    if (target.type !== undefined) {
      const validTypes = new Set([
        "string",
        "number",
        "integer",
        "boolean",
        "array",
        "object",
        "null",
      ]);
      if (typeof target.type === "string") {
        if (!validTypes.has(target.type)) {
          errors.push(`${path}.type: unknown type '${target.type}'`);
        }
      } else if (Array.isArray(target.type)) {
        if (target.type.length === 0) {
          errors.push(`${path}.type: type array cannot be empty`);
        }
        const seenTypes = new Set();
        for (const t of target.type) {
          if (typeof t !== "string" || !validTypes.has(t)) {
            errors.push(`${path}.type: unknown type in array '${t}'`);
          }
          if (seenTypes.has(t)) {
            errors.push(`${path}.type: duplicate type in array '${t}'`);
          }
          seenTypes.add(t);
        }
      } else {
        errors.push(
          `${path}.type: type must be a string or array of strings, got ${typeof target.type}`,
        );
      }
    }

    for (const numKw of ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"]) {
      if (target[numKw] !== undefined) {
        if (typeof target[numKw] !== "number") {
          errors.push(`${path}.${numKw}: must be a number, got ${typeof target[numKw]}`);
        } else if (!Number.isFinite(target[numKw])) {
          errors.push(`${path}.${numKw}: must be a finite number, got ${target[numKw]}`);
        }
      }
    }

    if (target.multipleOf !== undefined) {
      if (
        typeof target.multipleOf !== "number" ||
        !Number.isFinite(target.multipleOf) ||
        target.multipleOf <= 0
      ) {
        errors.push(
          `${path}.multipleOf: must be a positive finite number, got ${target.multipleOf}`,
        );
      }
    }

    for (const intKw of ["minLength", "maxLength", "minItems", "maxItems"]) {
      if (target[intKw] !== undefined && (!Number.isInteger(target[intKw]) || target[intKw] < 0)) {
        errors.push(`${path}.${intKw}: must be a non-negative integer`);
      }
    }

    if (target.uniqueItems !== undefined && typeof target.uniqueItems !== "boolean") {
      errors.push(`${path}.uniqueItems: must be a boolean`);
    }

    if (target.required !== undefined) {
      if (
        !Array.isArray(target.required) ||
        target.required.some((r) => typeof r !== "string" || r.length === 0)
      ) {
        errors.push(`${path}.required: must be an array of non-empty strings`);
      } else {
        const seenReq = new Set();
        for (const r of target.required) {
          if (seenReq.has(r)) {
            errors.push(`${path}.required: duplicate required property '${r}'`);
          }
          seenReq.add(r);
        }
      }
    }

    if (target.enum !== undefined) {
      if (!Array.isArray(target.enum) || target.enum.length === 0) {
        errors.push(`${path}.enum: must be a non-empty array`);
      } else {
        for (let i = 0; i < target.enum.length; i++) {
          for (let j = i + 1; j < target.enum.length; j++) {
            if (deepEqual(target.enum[i], target.enum[j])) {
              errors.push(`${path}.enum: duplicate enum value at index ${j}`);
              break;
            }
          }
        }
      }
    }

    if (target.pattern !== undefined) {
      if (typeof target.pattern !== "string") {
        errors.push(`${path}.pattern: must be a string`);
      } else {
        try {
          new RegExp(target.pattern);
        } catch (e) {
          errors.push(`${path}.pattern: invalid regex '${target.pattern}': ${e.message}`);
        }
      }
    }

    if (target.format !== undefined) {
      if (typeof target.format !== "string") {
        errors.push(`${path}.format: must be a string`);
      } else {
        const supportedFormats = new Set([
          "email",
          "uuid",
          "date",
          "time",
          "date-time",
          "uri",
          "int32",
          "int64",
          "float",
          "double",
          "byte",
          "binary",
          "password",
        ]);
        if (!supportedFormats.has(target.format)) {
          errors.push(`${path}.format: unknown format '${target.format}'`);
        }
      }
    }

    // Check $ref (must be string)
    if (target.$ref !== undefined) {
      if (typeof target.$ref !== "string" || target.$ref.length === 0) {
        errors.push(`${path}.$ref: must be a non-empty string`);
        return;
      }
      const ref = target.$ref;
      if (seenRefs.has(ref)) {
        errors.push(`${path}: Cyclic schema reference detected: ${ref} (recursion unsupported)`);
        return;
      }
      if (rootDoc) {
        const resolved = resolveJsonPointer(rootDoc, ref);
        if (!resolved.valid || resolved.target === undefined) {
          errors.push(
            `${path}: Dangling schema reference '${ref}': ${resolved.reason || "unresolved"}`,
          );
          return;
        }
        const nextSeen = new Set(seenRefs);
        nextSeen.add(ref);
        const subPref = preflightSchema(resolved.target, rootDoc, nextSeen, depth + 1);
        if (!subPref.valid) {
          errors.push(...subPref.errors.map((e) => `${path} -> ${e}`));
        }
      }
    }

    // Recurse into properties
    if (target.properties !== undefined) {
      if (
        typeof target.properties !== "object" ||
        target.properties === null ||
        Array.isArray(target.properties)
      ) {
        errors.push(`${path}.properties: must be an object`);
      } else {
        for (const [propName, propSchema] of Object.entries(target.properties)) {
          checkSchema(propSchema, `${path}.properties.${propName}`);
        }
      }
    }

    // Recurse into additionalProperties
    if (target.additionalProperties !== undefined) {
      if (
        typeof target.additionalProperties !== "boolean" &&
        (typeof target.additionalProperties !== "object" ||
          target.additionalProperties === null ||
          Array.isArray(target.additionalProperties))
      ) {
        errors.push(`${path}.additionalProperties: must be a boolean or schema object`);
      } else if (typeof target.additionalProperties === "object") {
        checkSchema(target.additionalProperties, `${path}.additionalProperties`);
      }
    }

    // Recurse into items
    if (target.items !== undefined) {
      if (typeof target.items === "boolean") {
        // boolean items is valid
      } else if (Array.isArray(target.items)) {
        errors.push(
          `${path}.items: array-form items is unsupported (items must be a schema object or boolean)`,
        );
      } else if (typeof target.items === "object" && target.items !== null) {
        checkSchema(target.items, `${path}.items`);
      } else {
        errors.push(`${path}.items: must be a schema object or boolean`);
      }
    }

    // Recurse into combinators (allOf, anyOf, oneOf)
    for (const comb of ["allOf", "anyOf", "oneOf"]) {
      if (target[comb] !== undefined) {
        if (!Array.isArray(target[comb]) || target[comb].length === 0) {
          errors.push(`${path}.${comb}: must be a non-empty array of schemas`);
        } else {
          target[comb].forEach((sub, idx) => checkSchema(sub, `${path}.${comb}[${idx}]`));
        }
      }
    }

    // Recurse into not
    if (target.not !== undefined) {
      checkSchema(target.not, `${path}.not`);
    }
  }

  checkSchema(schema);
  return { valid: errors.length === 0, errors };
}

/**
 * Fail-closed JSON Schema payload validator.
 * Validates payload against OpenAPI 3.1.0 JSON Schema subset.
 */
export function validatePayloadAgainstSchema(schema, payload, rootDoc = null, depth = 0) {
  if (schema === null) {
    return { valid: false, errors: ["Schema cannot be null (must be an object or boolean)"] };
  }
  if (Array.isArray(schema)) {
    return { valid: false, errors: ["Schema must be an object or boolean, got array"] };
  }

  if (depth === 0) {
    const preflight = preflightSchema(schema, rootDoc);
    if (!preflight.valid) {
      return { valid: false, errors: preflight.errors };
    }
  }

  const errors = [];

  if (depth > 50) {
    return { valid: false, errors: ["Maximum schema evaluation depth exceeded"] };
  }

  function check(targetSchema, data, currentPath = "payload") {
    if (typeof targetSchema === "boolean") {
      if (targetSchema === false) {
        errors.push(`${currentPath}: boolean schema false rejects all instances`);
      }
      return;
    }

    if (Array.isArray(targetSchema)) {
      errors.push(`${currentPath}: invalid schema (got array)`);
      return;
    }

    if (!targetSchema || typeof targetSchema !== "object") {
      errors.push(`${currentPath}: invalid schema`);
      return;
    }

    // $ref resolution and conjunctive sibling evaluation
    if (targetSchema.$ref) {
      if (!rootDoc) {
        errors.push(`${currentPath}: Cannot resolve $ref '${targetSchema.$ref}' without rootDoc`);
        return;
      }
      const resolved = resolveJsonPointer(rootDoc, targetSchema.$ref);
      if (!resolved.valid || resolved.target === undefined) {
        errors.push(`${currentPath}: Unresolved schema reference ${targetSchema.$ref}`);
        return;
      }

      const targetRes = validatePayloadAgainstSchema(resolved.target, data, rootDoc, depth + 1);
      if (!targetRes.valid) {
        errors.push(...targetRes.errors.map((e) => e.replace(/^payload/, currentPath)));
      }

      const siblingKeys = Object.keys(targetSchema).filter((k) => k !== "$ref");
      if (siblingKeys.length > 0) {
        const siblingSchema = {};
        for (const k of siblingKeys) siblingSchema[k] = targetSchema[k];
        const sibRes = validatePayloadAgainstSchema(siblingSchema, data, rootDoc, depth + 1);
        if (!sibRes.valid) {
          errors.push(...sibRes.errors.map((e) => e.replace(/^payload/, currentPath)));
        }
      }
      return;
    }

    // Type checking
    if (targetSchema.type !== undefined) {
      if (Array.isArray(targetSchema.type)) {
        const matchesAny = targetSchema.type.some((t) => matchesPrimitiveType(t, data));
        if (!matchesAny) {
          const actual = Array.isArray(data) ? "array" : data === null ? "null" : typeof data;
          errors.push(
            `${currentPath}: expected one of types [${targetSchema.type.join(", ")}], got ${actual}`,
          );
          return;
        }
      } else if (typeof targetSchema.type === "string") {
        if (!matchesPrimitiveType(targetSchema.type, data)) {
          const actual = Array.isArray(data) ? "array" : data === null ? "null" : typeof data;
          errors.push(`${currentPath}: expected ${targetSchema.type}, got ${actual}`);
          return;
        }
      } else {
        errors.push(`${currentPath}: invalid schema type definition`);
        return;
      }
    }

    // const check
    if (targetSchema.const !== undefined) {
      if (!deepEqual(data, targetSchema.const)) {
        errors.push(
          `${currentPath}: value ${JSON.stringify(data)} does not match const ${JSON.stringify(targetSchema.const)}`,
        );
      }
    }

    // enum check
    if (Array.isArray(targetSchema.enum)) {
      const found = targetSchema.enum.some((val) => deepEqual(val, data));
      if (!found) {
        errors.push(
          `${currentPath}: value ${JSON.stringify(data)} not in enum [${targetSchema.enum.map((v) => JSON.stringify(v)).join(", ")}]`,
        );
      }
    }

    // Number bounds
    if (typeof data === "number") {
      if (typeof targetSchema.minimum !== "number" && targetSchema.minimum !== undefined) {
        errors.push(`${currentPath}: invalid schema minimum definition`);
        return;
      }
      if (typeof targetSchema.minimum === "number" && data < targetSchema.minimum) {
        errors.push(`${currentPath}: value ${data} is less than minimum ${targetSchema.minimum}`);
      }
      if (typeof targetSchema.maximum === "number" && data > targetSchema.maximum) {
        errors.push(
          `${currentPath}: value ${data} is greater than maximum ${targetSchema.maximum}`,
        );
      }
      if (
        typeof targetSchema.exclusiveMinimum === "number" &&
        data <= targetSchema.exclusiveMinimum
      ) {
        errors.push(
          `${currentPath}: value ${data} is not strictly greater than exclusiveMinimum ${targetSchema.exclusiveMinimum}`,
        );
      }
      if (
        typeof targetSchema.exclusiveMaximum === "number" &&
        data >= targetSchema.exclusiveMaximum
      ) {
        errors.push(
          `${currentPath}: value ${data} is not strictly less than exclusiveMaximum ${targetSchema.exclusiveMaximum}`,
        );
      }
      if (typeof targetSchema.multipleOf === "number" && targetSchema.multipleOf > 0) {
        const remainder = (data / targetSchema.multipleOf) % 1;
        if (Math.abs(remainder) > 1e-9 && Math.abs(remainder - 1) > 1e-9) {
          errors.push(
            `${currentPath}: value ${data} is not a multiple of ${targetSchema.multipleOf}`,
          );
        }
      }
    }

    // String bounds: Unicode code points, pattern, format
    if (typeof data === "string") {
      const codePoints = Array.from(data).length;
      if (typeof targetSchema.minLength === "number" && codePoints < targetSchema.minLength) {
        errors.push(
          `${currentPath}: string length in code points (${codePoints}) is less than minLength ${targetSchema.minLength}`,
        );
      }
      if (typeof targetSchema.maxLength === "number" && codePoints > targetSchema.maxLength) {
        errors.push(
          `${currentPath}: string length in code points (${codePoints}) is greater than maxLength ${targetSchema.maxLength}`,
        );
      }
      if (typeof targetSchema.pattern === "string") {
        const regex = new RegExp(targetSchema.pattern);
        if (!regex.test(data)) {
          errors.push(
            `${currentPath}: value '${data}' does not match pattern ${targetSchema.pattern}`,
          );
        }
      }
      if (typeof targetSchema.format === "string") {
        const fmt = targetSchema.format;
        if (fmt === "email") {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(data)) {
            errors.push(`${currentPath}: value '${data}' is not a valid email address`);
          }
        } else if (fmt === "uuid") {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(data)) {
            errors.push(`${currentPath}: value '${data}' is not a valid uuid`);
          }
        } else if (fmt === "date") {
          if (!isValidISODate(data)) {
            errors.push(
              `${currentPath}: value '${data}' is not a valid Gregorian ISO calendar date (YYYY-MM-DD)`,
            );
          }
        } else if (fmt === "time") {
          if (!isValidRFC3339Time(data)) {
            errors.push(
              `${currentPath}: value '${data}' must be a valid RFC 3339 time string (e.g. 12:30:00Z)`,
            );
          }
        } else if (fmt === "date-time") {
          if (!isValidRFC3339DateTime(data)) {
            errors.push(`${currentPath}: value '${data}' is not a valid RFC 3339 date-time`);
          }
        } else if (fmt === "uri") {
          if (!isValidUri(data)) {
            errors.push(`${currentPath}: value '${data}' is not a valid URI`);
          }
        }
      }
    }

    // allOf
    if (Array.isArray(targetSchema.allOf)) {
      for (let i = 0; i < targetSchema.allOf.length; i++) {
        const branchRes = validatePayloadAgainstSchema(
          targetSchema.allOf[i],
          data,
          rootDoc,
          depth + 1,
        );
        if (!branchRes.valid) {
          errors.push(
            ...branchRes.errors.map((e) => e.replace(/^payload/, `${currentPath}.allOf[${i}]`)),
          );
        }
      }
    }

    // anyOf
    if (Array.isArray(targetSchema.anyOf)) {
      let anyPassed = false;
      for (const branch of targetSchema.anyOf) {
        const branchRes = validatePayloadAgainstSchema(branch, data, rootDoc, depth + 1);
        if (branchRes.valid) {
          anyPassed = true;
          break;
        }
      }
      if (!anyPassed) {
        errors.push(`${currentPath}: payload did not match any branch in anyOf`);
      }
    }

    // oneOf
    if (Array.isArray(targetSchema.oneOf)) {
      let matchCount = 0;
      for (const branch of targetSchema.oneOf) {
        const branchRes = validatePayloadAgainstSchema(branch, data, rootDoc, depth + 1);
        if (branchRes.valid) {
          matchCount++;
        }
      }
      if (matchCount === 0) {
        errors.push(`${currentPath}: payload did not match any branch in oneOf`);
      } else if (matchCount > 1) {
        errors.push(`${currentPath}: payload matched multiple (${matchCount}) branches in oneOf`);
      }
    }

    // not
    if (targetSchema.not !== undefined) {
      const notRes = validatePayloadAgainstSchema(targetSchema.not, data, rootDoc, depth + 1);
      if (notRes.valid) {
        errors.push(`${currentPath}: payload must not match 'not' schema`);
      }
    }

    // Object properties & additionalProperties
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      const declaredProps = targetSchema.properties ? Object.keys(targetSchema.properties) : [];

      // Required fields
      if (Array.isArray(targetSchema.required)) {
        for (const req of targetSchema.required) {
          if (!(req in data) || data[req] === undefined) {
            errors.push(`${currentPath}: missing required property '${req}'`);
          }
        }
      }

      // Additional properties handling
      if (targetSchema.additionalProperties === false) {
        for (const key of Object.keys(data)) {
          if (!declaredProps.includes(key)) {
            errors.push(
              `${currentPath}: unrecognized property '${key}' not allowed by schema (additionalProperties=false)`,
            );
          }
        }
      } else if (
        typeof targetSchema.additionalProperties === "object" &&
        targetSchema.additionalProperties !== null
      ) {
        for (const [key, val] of Object.entries(data)) {
          if (!declaredProps.includes(key)) {
            const extraRes = validatePayloadAgainstSchema(
              targetSchema.additionalProperties,
              val,
              rootDoc,
              depth + 1,
            );
            if (!extraRes.valid) {
              errors.push(
                ...extraRes.errors.map((e) => e.replace(/^payload/, `${currentPath}.${key}`)),
              );
            }
          }
        }
      }

      // Check defined property sub-schemas
      if (targetSchema.properties) {
        for (const [propName, propSchema] of Object.entries(targetSchema.properties)) {
          if (propName in data && data[propName] !== undefined) {
            const propRes = validatePayloadAgainstSchema(
              propSchema,
              data[propName],
              rootDoc,
              depth + 1,
            );
            if (!propRes.valid) {
              errors.push(
                ...propRes.errors.map((e) => e.replace(/^payload/, `${currentPath}.${propName}`)),
              );
            }
          }
        }
      }
    }

    // Array items
    if (Array.isArray(data)) {
      if (typeof targetSchema.minItems === "number" && data.length < targetSchema.minItems) {
        errors.push(
          `${currentPath}: array length ${data.length} is less than minItems ${targetSchema.minItems}`,
        );
      }
      if (typeof targetSchema.maxItems === "number" && data.length > targetSchema.maxItems) {
        errors.push(
          `${currentPath}: array length ${data.length} is greater than maxItems ${targetSchema.maxItems}`,
        );
      }
      if (targetSchema.uniqueItems === true) {
        for (let i = 0; i < data.length; i++) {
          for (let j = i + 1; j < data.length; j++) {
            if (deepEqual(data[i], data[j])) {
              errors.push(`${currentPath}: duplicate item at index ${j} violates uniqueItems`);
              break;
            }
          }
        }
      }

      if (targetSchema.items === false) {
        if (data.length > 0) {
          errors.push(
            `${currentPath}: items: false forbids elements in array (got ${data.length})`,
          );
        }
      } else if (targetSchema.items === true) {
        // all items permitted
      } else if (targetSchema.items) {
        data.forEach((item, index) => {
          const itemRes = validatePayloadAgainstSchema(
            targetSchema.items,
            item,
            rootDoc,
            depth + 1,
          );
          if (!itemRes.valid) {
            errors.push(
              ...itemRes.errors.map((e) => e.replace(/^payload/, `${currentPath}[${index}]`)),
            );
          }
        });
      }
    }
  }

  check(schema, payload);
  return { valid: errors.length === 0, errors };
}

/**
 * Validates request-local passenger linking rules and constraints.
 * Pure contract-semantic validation function for booking passengers.
 */
export function validateBookingPassengerLinking(passengers) {
  const errors = [];
  if (!Array.isArray(passengers) || passengers.length === 0) {
    return { valid: false, errors: ["passengers must be a non-empty array"] };
  }

  const ids = new Set();
  let adultCount = 0;
  const adults = new Map();
  const infantToAdult = new Map();
  const allPax = new Map();

  for (let i = 0; i < passengers.length; i++) {
    const pax = passengers[i];
    if (!pax || typeof pax !== "object") {
      errors.push(`passenger at index ${i} must be an object`);
      continue;
    }

    // Reject undocumented alias linkedAdultId
    if ("linkedAdultId" in pax) {
      errors.push(
        `passenger '${pax.id || i}' uses forbidden undocumented alias 'linkedAdultId'; must use 'linkedAdultPassengerId'`,
      );
    }

    if (!pax.id || typeof pax.id !== "string" || pax.id.trim().length === 0) {
      errors.push(`each passenger must have a valid non-empty string id`);
      continue;
    }
    if (ids.has(pax.id)) {
      errors.push(`duplicate passenger id: ${pax.id}`);
    }
    ids.add(pax.id);
    allPax.set(pax.id, pax);

    if (pax.type === "adult") {
      adultCount++;
      adults.set(pax.id, pax);
      if (pax.linkedAdultPassengerId) {
        errors.push(`adult passenger '${pax.id}' cannot have linkedAdultPassengerId`);
      }
    } else if (pax.type === "infant") {
      if (!pax.linkedAdultPassengerId) {
        errors.push(
          `infant passenger '${pax.id}' must be linked to an adult passenger via linkedAdultPassengerId`,
        );
      } else {
        if (pax.linkedAdultPassengerId === pax.id) {
          errors.push(`infant passenger '${pax.id}' cannot link to themselves`);
        }
        if (infantToAdult.has(pax.linkedAdultPassengerId)) {
          errors.push(
            `adult passenger '${pax.linkedAdultPassengerId}' cannot have more than one linked infant`,
          );
        }
        infantToAdult.set(pax.linkedAdultPassengerId, pax.id);
      }
      if (
        (pax.seatCode !== undefined && pax.seatCode !== null && pax.seatCode !== "") ||
        (pax.seat !== undefined && pax.seat !== null && pax.seat !== "")
      ) {
        errors.push(`infant passenger '${pax.id}' cannot have an assigned seat`);
      }
    } else if (pax.type === "child") {
      if (pax.linkedAdultPassengerId) {
        errors.push(`child passenger '${pax.id}' cannot have linkedAdultPassengerId`);
      }
    } else {
      errors.push(`unknown passenger type: ${pax.type}`);
    }
  }

  if (adultCount === 0) {
    errors.push("booking must contain at least one adult passenger");
  }

  for (const [adultId, infantId] of infantToAdult.entries()) {
    if (!adults.has(adultId)) {
      if (allPax.has(adultId)) {
        errors.push(
          `infant passenger '${infantId}' can only link to an adult passenger (referenced '${adultId}' is ${allPax.get(adultId).type})`,
        );
      } else {
        errors.push(`infant passenger '${infantId}' references nonexistent adult '${adultId}'`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Verifies that all 2xx operation response schemas enforce canonical success envelopes.
 *
 * Rules:
 * 1. Enumerates all operations across all paths in spec.paths.
 * 2. Every operation must have at least one 2xx response.
 * 3. Status 204 No Content is an allowlisted exception (no content body).
 * 4. Resolves reusable response containers (responses[status].$ref).
 * 5. Explicit allowlisted protocol exceptions (e.g. getAuthCsrfBootstrap / getStaffCsrfBootstrap).
 * 6. All other 2xx application/json response schemas must enforce:
 *    - success property with const: true
 *    - required array containing 'success', 'data', 'meta'
 *    - data and meta properties present
 * 7. ErrorResponse schema enforces success with const: false.
 *
 * @param {object} spec OpenAPI 3.1 root document
 * @returns {{ valid: boolean, count: number, totalOperations: number, errors: string[] }}
 */
export function verifyAllOperationSuccessEnvelopes(spec) {
  const errors = [];
  let totalOperations = 0;
  let canonical2xxCount = 0;

  for (const [pathKey, pathItem] of Object.entries(spec?.paths || {})) {
    if (!pathItem || typeof pathItem !== "object") continue;
    for (const [method, op] of Object.entries(pathItem)) {
      if (!["get", "post", "put", "patch", "delete"].includes(method.toLowerCase())) continue;
      if (!op || typeof op !== "object") continue;
      totalOperations++;
      const opId = op.operationId || `${method.toUpperCase()} ${pathKey}`;

      if (!op.responses || typeof op.responses !== "object") {
        errors.push(`${opId}: missing responses object`);
        continue;
      }

      const twoXxResponses = Object.entries(op.responses).filter(([status]) =>
        status.startsWith("2"),
      );
      if (twoXxResponses.length === 0) {
        errors.push(`${opId}: missing 2xx success response`);
        continue;
      }

      for (const [status, rawResp] of twoXxResponses) {
        let resp = rawResp;
        let rDepth = 0;
        while (resp?.$ref && rDepth < 5) {
          rDepth++;
          const res = resolveJsonPointer(spec, resp.$ref);
          if (!res.valid) {
            errors.push(`${opId} (${status}): dangling response $ref '${resp.$ref}'`);
            resp = null;
            break;
          }
          resp = res.target;
        }
        if (!resp) continue;

        if (status === "204") {
          if (resp?.content && Object.keys(resp.content).length > 0) {
            errors.push(`${opId} (${status}): 204 No Content response cannot specify content body`);
          }
          continue;
        }

        const jsonContent = resp?.content?.["application/json"];
        if (!jsonContent) {
          if (resp?.content && Object.keys(resp.content).some((mt) => mt !== "application/json")) {
            continue;
          }
          errors.push(`${opId} (${status}): missing application/json content`);
          continue;
        }

        let schema = jsonContent.schema;
        if (!schema) {
          errors.push(`${opId} (${status}): missing application/json schema`);
          continue;
        }

        let sDepth = 0;
        while (schema?.$ref && sDepth < 5) {
          sDepth++;
          const res = resolveJsonPointer(spec, schema.$ref);
          if (!res.valid) {
            errors.push(`${opId} (${status}): dangling schema $ref '${schema.$ref}'`);
            schema = null;
            break;
          }
          schema = res.target;
        }
        if (!schema) continue;

        // Support conjunctive schema composition (allOf)
        let resolvedProps = schema.properties;
        let resolvedReq = Array.isArray(schema.required) ? [...schema.required] : [];
        if (Array.isArray(schema.allOf)) {
          resolvedProps = { ...(resolvedProps || {}) };
          for (const sub of schema.allOf) {
            let subSchema = sub;
            let subDepth = 0;
            while (subSchema?.$ref && subDepth < 5) {
              subDepth++;
              const res = resolveJsonPointer(spec, subSchema.$ref);
              if (res.valid) subSchema = res.target;
              else break;
            }
            if (subSchema?.properties) {
              Object.assign(resolvedProps, subSchema.properties);
            }
            if (Array.isArray(subSchema?.required)) {
              resolvedReq.push(...subSchema.required);
            }
          }
        }

        // Exact pinned CSRF protocol exceptions (method GET, exact path /auth/csrf or /staff/csrf, status 200, application/json)
        const isCsrfBootstrapPath =
          pathKey === "/auth/csrf" ||
          pathKey === "/staff/csrf" ||
          pathKey === "/api/v1/auth/csrf" ||
          pathKey === "/api/v1/staff/csrf";
        const isCsrfBootstrap =
          method.toLowerCase() === "get" && isCsrfBootstrapPath && status === "200";

        if (isCsrfBootstrap) {
          if (resolvedProps?.csrfToken) {
            if (resolvedProps.csrfToken.type !== "string") {
              errors.push(`${opId}: csrfToken property must be type string`);
            }
            if (!resolvedReq.includes("csrfToken")) {
              errors.push(`${opId}: csrfToken must be in required array`);
            }
          } else {
            errors.push(`${opId}: missing csrfToken property in CSRF bootstrap response`);
          }
          canonical2xxCount++;
          continue;
        }

        if (!resolvedProps || typeof resolvedProps !== "object") {
          errors.push(
            `${opId} (${status}): response schema has no properties (bare DTO or missing envelope)`,
          );
          continue;
        }

        if (!resolvedProps.success) {
          errors.push(`${opId} (${status}): missing success property`);
        } else if (resolvedProps.success.const !== true) {
          errors.push(`${opId} (${status}): success property must have const: true`);
        }

        if (!resolvedReq.includes("success")) {
          errors.push(`${opId} (${status}): success must be in required array`);
        }

        if (!resolvedProps.data) {
          errors.push(`${opId} (${status}): missing data property`);
        }
        if (!resolvedReq.includes("data")) {
          errors.push(`${opId} (${status}): data must be in required array`);
        }

        if (!resolvedProps.meta) {
          errors.push(`${opId} (${status}): missing meta property`);
        }
        if (!resolvedReq.includes("meta")) {
          errors.push(`${opId} (${status}): meta must be in required array`);
        }

        canonical2xxCount++;
      }
    }
  }

  // ErrorResponse check
  const errorSchema = spec.components?.schemas?.["ErrorResponse"];
  if (!errorSchema) {
    errors.push("components.schemas.ErrorResponse: missing schema");
  } else {
    if (errorSchema.properties?.success?.const !== false) {
      errors.push("ErrorResponse.properties.success: must have const: false");
    }
  }

  return {
    valid: errors.length === 0,
    count: canonical2xxCount,
    totalOperations,
    errors,
  };
}
