import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  CANONICAL_PERMISSIONS,
  REQUIRED_PHASE_TAGS,
  validateOpenApiSpecification,
  validatePayloadAgainstSchema,
  validateOperationPolicies,
  preflightSchema,
  isValidRFC3339DateTime,
  isValidISODate,
  isValidUri,
  validateBookingPassengerLinking,
  verifyAllOperationSuccessEnvelopes,
} from "../../scripts/lib/backend-contract-validation.mjs";
import { ARCHIVE_CATALOG } from "../../src/lib/archive/catalog.ts";
import { SOURCE_REGISTRY } from "../../src/lib/archive/sources.ts";
import { seedNetworkEnvelope } from "../../src/lib/network/seed.ts";
import { seedFleetEnvelope } from "../../src/lib/fleet/seed.ts";
import { seedSchedules } from "../../src/lib/schedules/seed.ts";
import { seedCommercialCatalog } from "../../src/lib/commercial/seed.ts";
import { getPublishedContent } from "../../src/content/repository.ts";
import { datedServiceId, parseDatedServiceId } from "../../src/lib/dated-services/identity.ts";
import {
  majorToMinorUsd,
  minorToMajorUsd,
  sourceCatalogToWire,
  wireCatalogToSource,
  projectPublicCommercialCatalog,
  validateCommercialCommandSemanticInvariants,
} from "../../scripts/lib/backend-commercial-contracts.mjs";
import {
  sourceAccountToWire,
  wireAccountPatchToSource,
  sourceTravelerToWire,
  wireTravelerToSource,
  wireTravelerPatchToSource,
  validatePassengerProfilePatchSemanticInvariants,
  validateTravelerSemanticInvariants,
  adaptAccountMutationReceiptToWire,
} from "../../scripts/lib/backend-passenger-contracts.mjs";
import { LocalCommercialCatalogRepository } from "../../src/lib/commercial/repository.ts";
import { CommercialStorageCoordinator } from "../../src/lib/commercial/storage.ts";
import { LocalPassengerRepository } from "../../src/lib/passenger/repository.ts";
import { PassengerStorageCoordinator } from "../../src/lib/passenger/storage.ts";
import {
  sourceContactSettingsToWire,
  wireContactSettingsToSource,
  validateContactSettingsWire,
  sourceAppearanceSettingsToWire,
  wireAppearanceSettingsToSource,
  validateAppearanceSettingsWire,
  adaptSettingsDraftReceiptToWire,
  canonicalPatternId,
  validateCmsDraftKeyBinding,
  adaptCmsMutationReceiptToWire,
  sourceContactMessageToWire,
  wireContactCreateToSource,
  validateContactCreateWire,
  adaptContactSubmissionReceiptToWire,
  adaptContactStatusReceiptToWire,
  adaptContactAssigneeReceiptToWire,
} from "../../scripts/lib/backend-editorial-contracts.mjs";
import {
  MUTATION_SPECIMENS,
  verifyOperationSpecimen,
  verifyTamperedResponseRejected,
} from "../../scripts/lib/backend-specimen-catalog.mjs";
import { LocalSettingsRepository } from "../../src/lib/settings/repository.ts";
import {
  PUBLISHED_CONTACT_SETTINGS,
  PUBLISHED_APPEARANCE_SETTINGS,
} from "../../src/lib/settings/defaults.ts";
import { LocalContentRepository, ContentError } from "../../src/content/repository.ts";
import { LocalContactRepository } from "../../src/lib/contact/repository.ts";
import { ContactStorageCoordinator } from "../../src/lib/contact/storage.ts";
import {
  APPROVED_MEDIA_CATALOG as SOURCE_MEDIA_CATALOG,
  TARGET_ALLOWED_TRUTH_CLASSES as SOURCE_TARGET_TRUTH,
  FAMILY_ALLOWED_TRUTH_CLASSES as SOURCE_FAMILY_TRUTH,
  sanitizeMediaTreatmentAuthoritative,
} from "../../src/lib/media-policy.ts";
import {
  APPROVED_MEDIA_CATALOG as WIRE_MEDIA_CATALOG,
  TARGET_ALLOWED_TRUTH_CLASSES as WIRE_TARGET_TRUTH,
  FAMILY_ALLOWED_TRUTH_CLASSES as WIRE_FAMILY_TRUTH,
  TARGET_MEDIA_ALLOWED as WIRE_TARGET_MEDIA_ALLOWED,
} from "../../scripts/lib/backend-editorial-contracts.mjs";

const docsBackendDir = path.resolve(import.meta.dirname, "../../docs/backend");
const openapiPath = path.join(docsBackendDir, "openapi.v1.json");
const policiesPath = path.join(docsBackendDir, "operation-policies.v1.json");

interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, Record<string, OperationObject>>;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
    responses?: Record<string, unknown>;
  };
  security?: Array<Record<string, string[]>>;
  tags?: Array<{ name: string; description?: string }>;
}

interface ResponseObject {
  description?: string;
  content?: Record<string, { schema?: unknown }>;
}

interface OperationObject {
  operationId?: string;
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: Array<{ name?: string; in?: string; required?: boolean; $ref?: string }>;
  requestBody?: unknown;
  responses?: Record<string, ResponseObject>;
  security?: Array<Record<string, string[]>>;
  "x-required-permission"?: string;
}

interface PolicyRegistry {
  version: string;
  totalOperations: number;
  operations: Array<{
    operationId: string;
    method: string;
    path: string;
    intent: "public" | "protocol" | "protected";
    allowedSecurity: Array<Record<string, string[]>>;
    requiredPermission: string | null;
    staffBranchCondition?: { requiredPermission: string };
  }>;
}

describe("Phase 12: Backend Architecture & Documentation Package", () => {
  it("verifies all authoritative documentation artifacts exist and are non-empty in docs/backend/", () => {
    const requiredDocs = [
      "README.md",
      "ADR-001-platform.md",
      "deployment-topology.md",
      "data-model.md",
      "openapi.v1.json",
      "operation-policies.v1.json",
      "api-contract.md",
      "auth-rbac.md",
      "migration-map.md",
      "threat-model.md",
      "phase13-sequencing.md",
    ];

    for (const doc of requiredDocs) {
      const fullPath = path.join(docsBackendDir, doc);
      assert.ok(fs.existsSync(fullPath), `Document must exist: docs/backend/${doc}`);
      const stats = fs.statSync(fullPath);
      assert.ok(stats.size > 500, `Document must be substantial (>500 bytes): docs/backend/${doc}`);
    }
  });

  it("verifies all 10 canonical admin permissions are documented in auth-rbac.md", () => {
    const authDoc = fs.readFileSync(path.join(docsBackendDir, "auth-rbac.md"), "utf-8");
    for (const perm of CANONICAL_PERMISSIONS) {
      assert.ok(authDoc.includes(perm), `auth-rbac.md must document permission: ${perm}`);
    }
  });

  it("verifies staff directory sentinel locking is documented in auth-rbac.md and data-model.md", () => {
    const authDoc = fs.readFileSync(path.join(docsBackendDir, "auth-rbac.md"), "utf-8");
    const dataModelDoc = fs.readFileSync(path.join(docsBackendDir, "data-model.md"), "utf-8");

    assert.ok(
      authDoc.includes("staff_directory_control"),
      "auth-rbac.md must document staff_directory_control sentinel locking",
    );
    assert.ok(
      dataModelDoc.includes("staff_directory_control"),
      "data-model.md must define staff_directory_control table",
    );
  });

  it("verifies all 17 genuine local storage authorities are classified in migration-map.md without fabricated keys", () => {
    const migrationDoc = fs.readFileSync(path.join(docsBackendDir, "migration-map.md"), "utf-8");
    const genuineKeys = [
      "gza.repo.v1",
      "gza.passenger.v1",
      "gza.contact.v1",
      "gza.commercial.v1",
      "gza.fleet.v1",
      "gza.network.v1",
      "gza.schedule.v1",
      "gza.staff.v1",
      "gza.activity.v1",
      "gza.content.draft.v1",
      "gza.settings.draft.v1",
      "gza.archive.draft.v1",
      "gza.booking.draft.v1",
      "gza.skin.preview.v1",
      "gza.admin.v1",
      "gza.store.v1",
      "gza.lang",
    ];

    for (const key of genuineKeys) {
      assert.ok(
        migrationDoc.includes(`\`${key}\``),
        `migration-map.md must document genuine storage key: ${key}`,
      );
    }

    // Verify fabricated keys are absent
    const fabricatedKeys = [
      "gza.repo.network.v1",
      "gza.repo.fleet.v1",
      "gza.repo.schedules.v1",
      "gza.repo.commercial.v1",
      "gza.repo.bookings.v1",
      "gza.repo.flights.v1",
      "gza.theme",
    ];
    for (const fabKey of fabricatedKeys) {
      assert.ok(
        !migrationDoc.includes(`\`${fabKey}\``),
        `migration-map.md must not include fabricated key: ${fabKey}`,
      );
    }
  });
});

describe("Phase 12: OpenAPI 3.1 & Authorization Policy Verification", () => {
  const spec: OpenApiDocument = JSON.parse(fs.readFileSync(openapiPath, "utf-8"));
  const policies: PolicyRegistry = JSON.parse(fs.readFileSync(policiesPath, "utf-8"));

  it("validates openapi.v1.json via shared validateOpenApiSpecification helper with policyRegistry", () => {
    const result = validateOpenApiSpecification(spec, { policyRegistry: policies });
    assert.ok(
      result.valid,
      `OpenAPI specification must be valid: ${JSON.stringify(result.errors, null, 2)}`,
    );
    assert.equal(result.operationCount, 138, "Must contain exactly 138 operations");
    assert.equal(result.pathCount, 131, "Must contain exactly 131 paths");
    assert.ok(result.refCount > 800, "Must resolve all internal references cleanly");
  });

  it("verifies all 14 Phase 13A–G domain tags are present in specification", () => {
    const result = validateOpenApiSpecification(spec);
    const foundTags = new Set(result.foundTags);
    for (const tag of REQUIRED_PHASE_TAGS) {
      assert.ok(foundTags.has(tag), `Required phase tag must be present: ${tag}`);
    }
  });

  it("verifies 1-to-1 matching between openapi.v1.json and operation-policies.v1.json", () => {
    const polRes = validateOperationPolicies(spec, policies);
    assert.ok(
      polRes.valid,
      `Policy registry must match specification: ${JSON.stringify(polRes.errors)}`,
    );
  });
});

describe("Phase 12: Reviewer Probes — Schema Dialect & Authorization Security Gates", () => {
  const spec: OpenApiDocument = JSON.parse(fs.readFileSync(openapiPath, "utf-8"));
  const policies: PolicyRegistry = JSON.parse(fs.readFileSync(policiesPath, "utf-8"));

  // Probe 1: Boolean schema false rejects 123
  it("reproduces probe 1: boolean schema false rejects 123", () => {
    const res = validatePayloadAgainstSchema(false, 123);
    assert.equal(res.valid, false, "boolean schema false must reject 123");
    assert.ok(
      res.errors.some((e: string) => e.includes("boolean schema false rejects all instances")),
    );
  });

  // Probe 2a: { not: true } rejects 123
  it("reproduces probe 2a: { not: true } rejects 123", () => {
    const res = validatePayloadAgainstSchema({ not: true }, 123);
    assert.equal(res.valid, false, "{ not: true } must reject 123");
  });

  // Probe 2b: { not: false } accepts 123
  it("reproduces probe 2b: { not: false } accepts 123", () => {
    const res = validatePayloadAgainstSchema({ not: false }, 123);
    assert.equal(res.valid, true, "{ not: false } must accept 123");
  });

  // Probe 3: Reference with minLength: 5 and sibling minLength: 1 rejects "a" (conjunctive evaluation)
  it("reproduces probe 3: reference minLength: 5 with sibling minLength: 1 rejects 'a'", () => {
    const rootDoc = {
      components: {
        schemas: {
          LongStr: { type: "string", minLength: 5 },
        },
      },
    };
    const schemaWithSibling = { $ref: "#/components/schemas/LongStr", minLength: 1 };
    const res = validatePayloadAgainstSchema(schemaWithSibling, "a", rootDoc);
    assert.equal(res.valid, false, "Must reject 'a' because target minLength: 5 is conjunctive");
  });

  // Probe 4: Two-hop reference ending in { const: "allowed" } rejects "wrong"
  it("reproduces probe 4: two-hop reference ending in { const: 'allowed' } rejects 'wrong'", () => {
    const rootDoc = {
      components: {
        schemas: {
          Hop1: { $ref: "#/components/schemas/Hop2" },
          Hop2: { const: "allowed" },
        },
      },
    };
    const res = validatePayloadAgainstSchema(
      { $ref: "#/components/schemas/Hop1" },
      "wrong",
      rootDoc,
    );
    assert.equal(res.valid, false, "Two-hop const assertion must reject 'wrong'");
  });

  // Probe 5: Unsupported assertion nested under not fails schema preflight
  it("reproduces probe 5: unsupported assertion keyword nested under not fails preflight", () => {
    const schemaWithBadKeyword = { not: { unsupportedKeywordXYZ: 123 } };
    const res = validatePayloadAgainstSchema(schemaWithBadKeyword, 123);
    assert.equal(res.valid, false, "Unsupported keyword under not must fail preflight");
    assert.ok(
      res.errors.some((e: string) =>
        e.includes("Unsupported schema assertion keyword 'unsupportedKeywordXYZ'"),
      ),
      "Must identify unsupported keyword",
    );
  });

  // Probe 6: RFC 3339 date-time rejects "January 1, 2026" and accepts exact RFC 3339
  it("reproduces probe 6: format date-time rejects 'January 1, 2026' and accepts RFC 3339", () => {
    const dateTimeSchema = { type: "string", format: "date-time" };
    const badRes = validatePayloadAgainstSchema(dateTimeSchema, "January 1, 2026");
    assert.equal(badRes.valid, false, "'January 1, 2026' is not RFC 3339");

    const goodRes = validatePayloadAgainstSchema(dateTimeSchema, "2026-01-01T12:00:00Z");
    assert.equal(goodRes.valid, true, "'2026-01-01T12:00:00Z' is valid RFC 3339");
  });

  // Probe 7: Add {} to GET /bookings/{ref} security alternatives fails authorization validation
  it("reproduces probe 7: adding empty anonymous alternative {} to GET /bookings/{ref} fails policy validation", () => {
    const clonedSpec = JSON.parse(JSON.stringify(spec));
    clonedSpec.paths["/bookings/{ref}"].get.security.push({});
    const polRes = validateOperationPolicies(clonedSpec, policies);
    assert.equal(polRes.valid, false, "Empty alternative {} must fail policy validation");
    assert.ok(
      polRes.errors.some((e: string) => e.includes("contains an empty security requirement {}")),
      "Must flag anonymous alternative",
    );
  });

  // Probe 8: Add WebhookSignatureAuth to GET /auth/passenger/profile fails authorization validation
  it("reproduces probe 8: adding wrong realm scheme to passenger profile fails policy validation", () => {
    const clonedSpec = JSON.parse(JSON.stringify(spec));
    clonedSpec.paths["/auth/passenger/profile"].get.security.push({ WebhookSignatureAuth: [] });
    const polRes = validateOperationPolicies(clonedSpec, policies);
    assert.equal(polRes.valid, false, "Wrong scheme must fail policy validation");
    assert.ok(
      polRes.errors.some((e: string) => e.includes("is not in allowedSecurity policies")),
      "Must flag unallowed scheme",
    );
  });

  // Probe 9: Change GET /staff/me to security: [] fails authorization validation
  it("reproduces probe 9: changing GET /staff/me to security: [] fails policy validation", () => {
    const clonedSpec = JSON.parse(JSON.stringify(spec));
    clonedSpec.paths["/staff/me"].get.security = [];
    const polRes = validateOperationPolicies(clonedSpec, policies);
    assert.equal(polRes.valid, false, "Protected staff self-endpoint cannot have empty security");
    assert.ok(
      polRes.errors.some((e: string) =>
        e.includes("Protected operation 'getStaffMe' cannot have empty security: []"),
      ),
      "Must flag empty security",
    );
  });

  // Probe 10: Change GET /cms/documents to security: [] and remove x-required-permission fails authorization validation
  it("reproduces probe 10: changing GET /cms/documents to public fails policy validation", () => {
    const clonedSpec = JSON.parse(JSON.stringify(spec));
    clonedSpec.paths["/cms/documents"].get.security = [];
    delete clonedSpec.paths["/cms/documents"].get["x-required-permission"];
    const polRes = validateOperationPolicies(clonedSpec, policies);
    assert.equal(polRes.valid, false, "Protected CMS list cannot have empty security");
    assert.ok(
      polRes.errors.some((e: string) =>
        e.includes("Protected operation 'getCmsDocuments' cannot have empty security: []"),
      ),
      "Must flag empty security",
    );
  });

  it("reproduces R4.2 probe: malformed type assertion fails preflight", () => {
    const res = validatePayloadAgainstSchema({ type: 123 }, "anything", null);
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) => e.includes("type must be a string or array of strings")),
    );
  });

  it("reproduces R4.2 probe: malformed numeric minimum fails preflight", () => {
    const res = validatePayloadAgainstSchema({ type: "number", minimum: "5" }, 1, null);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("minimum: must be a number")));
  });

  it("reproduces R4.2 probe: array-form schema fails validation", () => {
    const res = validatePayloadAgainstSchema([], 1, null);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("Schema must be an object or boolean")));
  });

  it("reproduces R4.2 probe: items false rejects non-empty array and accepts empty array", () => {
    const resNonEmpty = validatePayloadAgainstSchema({ type: "array", items: false }, [1], null);
    assert.equal(resNonEmpty.valid, false);
    assert.ok(resNonEmpty.errors.some((e: string) => e.includes("items: false forbids elements")));

    const resEmpty = validatePayloadAgainstSchema({ type: "array", items: false }, [], null);
    assert.equal(resEmpty.valid, true);
  });

  it("reproduces R4.2 probe: format uri validates URLs and rejects malformed strings", () => {
    const resInvalid = validatePayloadAgainstSchema(
      { type: "string", format: "uri" },
      "not a URI",
      null,
    );
    assert.equal(resInvalid.valid, false);
    assert.ok(resInvalid.errors.some((e: string) => e.includes("not a valid URI")));

    const resValid = validatePayloadAgainstSchema(
      { type: "string", format: "uri" },
      "https://gazaairport.com/api/v1",
      null,
    );
    assert.equal(resValid.valid, true);
  });

  it("reproduces R4.2 probe: boolean-safe reference to false rejects all instances", () => {
    const res = validatePayloadAgainstSchema({ $ref: "#/deny" }, 1, { deny: false });
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) => e.includes("boolean schema false rejects all instances")),
    );
  });

  it("reproduces R4.2 probe: false reference under not succeeds as positive control", () => {
    const res = validatePayloadAgainstSchema({ not: { $ref: "#/deny" } }, 1, { deny: false });
    assert.equal(res.valid, true);
  });

  it("reproduces R4.2 probe: non-empty cookie scopes on apiKey scheme fails spec validation", () => {
    const mutated = structuredClone(spec);
    mutated.paths["/auth/passenger/profile"].get.security = [
      { PassengerCookieAuth: ["admin.manage"] },
    ];
    const res = validateOpenApiSpecification(mutated, { policyRegistry: policies });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("must declare empty scopes array []")));
  });

  it("reproduces R4.2 probe: null security requirement fails gracefully without throwing", () => {
    const mutated = structuredClone(spec);
    mutated.paths["/bookings/{ref}"].get.security = [null as unknown as Record<string, string[]>];
    const res = validateOpenApiSpecification(mutated, { policyRegistry: policies });
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) => e.includes("security requirement must be a non-null object")),
    );
  });

  it("reproduces R4.2 probe: public object security {} fails spec validation", () => {
    const mutated = structuredClone(spec);
    mutated.paths["/health"].get.security = {} as unknown as Array<Record<string, string[]>>;
    const res = validateOpenApiSpecification(mutated, { policyRegistry: policies });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("security declaration must be an array")));
  });

  // R5.1 Probes
  it("reproduces R5.1 probe: removing staff/guest alternatives from GET /bookings/{ref}, leaving only PassengerCookieAuth, fails policy validation", () => {
    const mutated = structuredClone(spec);
    mutated.paths["/bookings/{ref}"].get.security = [{ PassengerCookieAuth: [] }];
    mutated.paths["/bookings/{ref}"].get["x-authorization-branches"] = [
      { scheme: "PassengerCookieAuth", condition: "authenticated_booking_owner" },
    ];
    const res = validateOperationPolicies(mutated, policies);
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) =>
        e.includes(
          "security alternatives count (1) does not match policy allowedSecurity count (3)",
        ),
      ),
    );
  });

  it("reproduces R5.1 probe: PassengerCookieAuth changed from cookie to apiKey in query named leaked-session fails spec validation", () => {
    const mutated = structuredClone(spec);
    mutated.components!.securitySchemes!.PassengerCookieAuth = {
      type: "apiKey",
      in: "query",
      name: "leaked-session",
    };
    const res = validateOpenApiSpecification(mutated);
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) =>
        e.includes("securityScheme 'PassengerCookieAuth' in must be 'cookie', got 'query'"),
      ),
    );
    assert.ok(
      res.errors.some((e: string) =>
        e.includes(
          "securityScheme 'PassengerCookieAuth' name must be 'gza_session', got 'leaked-session'",
        ),
      ),
    );
  });

  it("reproduces R5.1 probe: null policy entry returns structured { valid: false, errors } without throwing", () => {
    const mutatedPol = structuredClone(policies);
    (mutatedPol.operations as unknown[])[0] = null;
    const res = validateOperationPolicies(spec, mutatedPol);
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) =>
        e.includes("Policy entry at index 0 must be a non-null object"),
      ),
    );
  });

  it("reproduces R5.1 probe: missing method in policy entry returns structured { valid: false, errors } without throwing", () => {
    const mutatedPol = structuredClone(policies);
    delete (mutatedPol.operations[0] as Partial<{ method: string }>).method;
    const res = validateOperationPolicies(spec, mutatedPol);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("missing valid 'method'")));
  });

  it("reproduces R5.1 probe: missing allowedSecurity in policy entry returns structured { valid: false, errors } without throwing", () => {
    const mutatedPol = structuredClone(policies);
    delete (mutatedPol.operations[0] as Partial<{ allowedSecurity: unknown }>).allowedSecurity;
    const res = validateOperationPolicies(spec, mutatedPol);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("missing valid 'allowedSecurity' array")));
  });

  it("reproduces R5.1 probe: disagreeing x-authorization-branches on GET /bookings/{ref} fails policy validation", () => {
    const mutated = structuredClone(spec);
    mutated.paths["/bookings/{ref}"].get["x-authorization-branches"] = [
      { scheme: "PassengerCookieAuth", condition: "authenticated_passenger_self" },
      {
        scheme: "BookingGuestGrantAuth",
        condition: "valid_booking_grant",
        boundResource: "booking",
        action: "view",
      },
      {
        scheme: "StaffCookieAuth",
        condition: "authenticated_staff",
        requiredPermission: "commercial.view",
      },
    ];
    const res = validateOperationPolicies(mutated, policies);
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) => e.includes("does not match policy branchConditions[0]")),
    );
  });

  it("reproduces R5.1 probe: missing x-authorization-branches on protected operation fails policy validation", () => {
    const mutated = structuredClone(spec);
    delete mutated.paths["/bookings/{ref}"].get["x-authorization-branches"];
    const res = validateOperationPolicies(mutated, policies);
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) =>
        e.includes("must declare 'x-authorization-branches' array in OpenAPI"),
      ),
    );
  });

  it("reproduces R5.1 probe: authoritative policy expectations match policy-expectations.json fixture", () => {
    const fixturePath = path.join(
      import.meta.dirname,
      "../fixtures/backend-contracts/policy-expectations.json",
    );
    assert.ok(fs.existsSync(fixturePath), "policy-expectations.json fixture must exist");
    const expectations = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

    for (const exp of expectations.representativeOperations) {
      const op = spec.paths[exp.path]?.[exp.method.toLowerCase()];
      assert.ok(op, `Operation for ${exp.method} ${exp.path} must exist in OpenAPI spec`);
      assert.deepEqual(
        op.security || [],
        exp.expectedSecurity,
        `Security mismatch for ${exp.operationId}`,
      );
      if (exp.expectedPermission) {
        assert.equal(
          op["x-required-permission"],
          exp.expectedPermission,
          `Permission mismatch for ${exp.operationId}`,
        );
      }
      assert.deepEqual(
        op["x-authorization-branches"] || [],
        exp.expectedBranchConditions,
        `Branch conditions mismatch for ${exp.operationId}`,
      );
    }
  });

  // R5.2 Probes
  it("reproduces R5.2 probe: unsupported assertion injected into response header schema fails spec preflight", () => {
    const mutated = structuredClone(spec);
    mutated.paths["/health"].get.responses["200"].headers = {
      "X-Server-Time": {
        description: "Server time",
        schema: { type: "string", unsupportedKeywordInHeader: true },
      },
    };
    const res = validateOpenApiSpecification(mutated);
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) =>
        e.includes("Unsupported schema assertion keyword 'unsupportedKeywordInHeader'"),
      ),
    );
  });

  it("reproduces R5.2 probe: unsupported assertion injected into additional request media type application/problem+json fails spec preflight", () => {
    const mutated = structuredClone(spec);
    (mutated.paths["/bookings"].post.requestBody as Record<string, unknown>).content = {
      ...((mutated.paths["/bookings"].post.requestBody as Record<string, unknown>)
        .content as Record<string, unknown>),
      "application/problem+json": {
        schema: { type: "object", unsupportedMediaProp: true },
      },
    };
    const res = validateOpenApiSpecification(mutated);
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) =>
        e.includes("Unsupported schema assertion keyword 'unsupportedMediaProp'"),
      ),
    );
  });

  it("reproduces R5.2 probe: unsupported assertion injected into reusable component response fails spec preflight", () => {
    const mutated = structuredClone(spec);
    mutated.components!.responses!.ErrorResponse = {
      description: "Reusable error response",
      content: {
        "application/json": {
          schema: { type: "object", unsupportedComponentResponseKeyword: true },
        },
      },
    };
    const res = validateOpenApiSpecification(mutated);
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) =>
        e.includes("Unsupported schema assertion keyword 'unsupportedComponentResponseKeyword'"),
      ),
    );
  });

  it("reproduces R5.2 probe: unsupported assertion injected into path-level parameter fails spec preflight", () => {
    const mutated = structuredClone(spec);
    mutated.paths["/bookings/{ref}"].parameters = [
      {
        name: "ref",
        in: "path",
        required: true,
        schema: { type: "string", unsupportedPathParamKeyword: true },
      },
    ];
    const res = validateOpenApiSpecification(mutated);
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) =>
        e.includes("Unsupported schema assertion keyword 'unsupportedPathParamKeyword'"),
      ),
    );
  });

  it("reproduces R5.2 probe: Unicode code point length: '🍉' passes maxLength: 1 and fails minLength: 2", () => {
    const passRes = validatePayloadAgainstSchema({ type: "string", maxLength: 1 }, "🍉");
    assert.equal(passRes.valid, true, "'🍉' has 1 Unicode code point, passes maxLength: 1");

    const failRes = validatePayloadAgainstSchema({ type: "string", minLength: 2 }, "🍉");
    assert.equal(failRes.valid, false, "'🍉' has 1 Unicode code point, fails minLength: 2");
    assert.ok(failRes.errors.some((e: string) => e.includes("less than minLength 2")));

    const exactRes = validatePayloadAgainstSchema(
      { type: "string", minLength: 1, maxLength: 1 },
      "🍉",
    );
    assert.equal(exactRes.valid, true, "'🍉' passes minLength: 1, maxLength: 1");
  });

  it("reproduces R5.2 probe: RFC 3339 time format accepts '12:30:00Z' and rejects '12:30'", () => {
    const timeSchema = { type: "string", format: "time" };
    assert.equal(validatePayloadAgainstSchema(timeSchema, "12:30:00Z").valid, true);
    assert.equal(validatePayloadAgainstSchema(timeSchema, "23:59:59.999+02:00").valid, true);

    const failRes = validatePayloadAgainstSchema(timeSchema, "12:30");
    assert.equal(failRes.valid, false);
    assert.ok(
      failRes.errors.some((e: string) => e.includes("must be a valid RFC 3339 time string")),
    );
  });

  it("reproduces R5.2 probe: duplicate required property fails preflight", () => {
    const badSchema = { type: "object", required: ["name", "email", "name"] };
    const res = validatePayloadAgainstSchema(badSchema, { name: "A", email: "a@b.c" });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("duplicate required property 'name'")));
  });

  it("reproduces R5.2 probe: empty allOf: [] fails preflight", () => {
    const badSchema = { allOf: [] };
    const res = validatePayloadAgainstSchema(badSchema, 123);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("allOf: must be a non-empty array")));
  });

  it("reproduces R5.2 probe: empty enum: [] fails preflight", () => {
    const badSchema = { enum: [] };
    const res = validatePayloadAgainstSchema(badSchema, "anything");
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("enum: must be a non-empty array")));
  });

  it("reproduces R5.2 probe: non-string $ref fails preflight even in unselected branch", () => {
    const badSchema = {
      anyOf: [{ type: "string" }, { $ref: 123 as unknown as string }],
    };
    const res = validatePayloadAgainstSchema(badSchema, "valid-string");
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("$ref: must be a non-empty string")));
  });

  it("reproduces R4.2 probe: unknown assertion in untested component schema fails spec preflight", () => {
    const mutated = structuredClone(spec);
    (
      mutated.components!.schemas!.CreateArchiveSourceRequest as Record<string, unknown>
    ).unsupportedAssertion = true;
    const res = validateOpenApiSpecification(mutated, { policyRegistry: policies });
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) =>
        e.includes("Unsupported schema assertion keyword 'unsupportedAssertion'"),
      ),
    );
  });

  // --- Correction 06 Reviewer Probes (R6.1 & R6.2) ---

  it("reproduces R6.1 probe: all booking branches removed fails policy validation", () => {
    const mutatedSpec = structuredClone(spec);
    const mutatedPol = structuredClone(policies);
    const polOp = mutatedPol.operations.find((x) => x.operationId === "getBookingByRef")!;
    polOp.branchConditions = [];
    mutatedSpec.paths["/bookings/{ref}"].get["x-authorization-branches"] = [];
    const res = validateOpenApiSpecification(mutatedSpec, { policyRegistry: mutatedPol });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("cannot have empty branchConditions")));
  });

  it("reproduces R6.1 probe: booking owner weakened to passenger self fails policy validation", () => {
    const mutatedSpec = structuredClone(spec);
    const mutatedPol = structuredClone(policies);
    const polOp = mutatedPol.operations.find((x) => x.operationId === "getBookingByRef")!;
    const b = polOp.branchConditions.find((b) => b.scheme === "PassengerCookieAuth")!;
    b.condition = "authenticated_passenger_self";
    mutatedSpec.paths["/bookings/{ref}"].get["x-authorization-branches"] = structuredClone(
      polOp.branchConditions,
    );
    const res = validateOpenApiSpecification(mutatedSpec, { policyRegistry: mutatedPol });
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) =>
        e.includes("cannot use 'authenticated_passenger_self' on resource route declaring '{ref}'"),
      ),
    );
  });

  it("reproduces R6.1 probe: staff branch permission mismatch fails policy validation", () => {
    const mutatedSpec = structuredClone(spec);
    const mutatedPol = structuredClone(policies);
    const polOp = mutatedPol.operations.find((x) => x.operationId === "getBookingByRef")!;
    const b = polOp.branchConditions.find((b) => b.scheme === "StaffCookieAuth")!;
    b.requiredPermission = "admin.manage";
    mutatedSpec.paths["/bookings/{ref}"].get["x-authorization-branches"] = structuredClone(
      polOp.branchConditions,
    );
    const res = validateOpenApiSpecification(mutatedSpec, { policyRegistry: mutatedPol });
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) =>
        e.includes("does not match operation required permission 'commercial.view'"),
      ),
    );
  });

  it("reproduces R6.1 probe: staff domain weakened to self fails policy validation", () => {
    const mutatedSpec = structuredClone(spec);
    const mutatedPol = structuredClone(policies);
    const polOp = mutatedPol.operations.find((x) => x.operationId === "getBookingByRef")!;
    const b = polOp.branchConditions.find((b) => b.scheme === "StaffCookieAuth")!;
    b.condition = "authenticated_staff_self";
    b.requiredPermission = null;
    mutatedSpec.paths["/bookings/{ref}"].get["x-authorization-branches"] = structuredClone(
      polOp.branchConditions,
    );
    const res = validateOpenApiSpecification(mutatedSpec, { policyRegistry: mutatedPol });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("is not an allowed staff-self operation")));
  });

  it("reproduces R6.1 probe: arbitrary guest action fails policy validation", () => {
    const mutatedSpec = structuredClone(spec);
    const mutatedPol = structuredClone(policies);
    const polOp = mutatedPol.operations.find((x) => x.operationId === "getBookingByRef")!;
    const b = polOp.branchConditions.find((b) => b.scheme === "BookingGuestGrantAuth")!;
    (b as Record<string, unknown>).action = "delete_staff";
    mutatedSpec.paths["/bookings/{ref}"].get["x-authorization-branches"] = structuredClone(
      polOp.branchConditions,
    );
    const res = validateOpenApiSpecification(mutatedSpec, { policyRegistry: mutatedPol });
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) =>
        e.includes(
          "BookingGuestGrantAuth branch action must match operationId 'getBookingByRef', got 'delete_staff'",
        ),
      ),
    );
  });

  it("reproduces R6.1 probe: duplicate branch replaces staff fails policy validation", () => {
    const mutatedSpec = structuredClone(spec);
    const mutatedPol = structuredClone(policies);
    const polOp = mutatedPol.operations.find((x) => x.operationId === "getBookingByRef")!;
    polOp.branchConditions[2] = structuredClone(polOp.branchConditions[0]);
    mutatedSpec.paths["/bookings/{ref}"].get["x-authorization-branches"] = structuredClone(
      polOp.branchConditions,
    );
    const res = validateOpenApiSpecification(mutatedSpec, { policyRegistry: mutatedPol });
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) =>
        e.includes("has duplicate branch condition for scheme 'PassengerCookieAuth'"),
      ),
    );
    assert.ok(
      res.errors.some((e: string) =>
        e.includes("missing branch condition for required scheme 'StaffCookieAuth'"),
      ),
    );
  });

  it("reproduces R6.1 probe: unknown branch field fails policy validation", () => {
    const mutatedSpec = structuredClone(spec);
    const mutatedPol = structuredClone(policies);
    const polOp = mutatedPol.operations.find((x) => x.operationId === "getBookingByRef")!;
    (polOp.branchConditions[0] as Record<string, unknown>).ignoreOwnership = true;
    mutatedSpec.paths["/bookings/{ref}"].get["x-authorization-branches"] = structuredClone(
      polOp.branchConditions,
    );
    const res = validateOpenApiSpecification(mutatedSpec, { policyRegistry: mutatedPol });
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) =>
        e.includes(
          "PassengerCookieAuth booking owner branch contains unknown field 'ignoreOwnership'",
        ),
      ),
    );
  });

  it("reproduces R6.1 probe: guest branch with missing requiresUnexpired fails policy validation", () => {
    const mutatedSpec = structuredClone(spec);
    const mutatedPol = structuredClone(policies);
    const polOp = mutatedPol.operations.find((x) => x.operationId === "getBookingByRef")!;
    const b = polOp.branchConditions.find((b) => b.scheme === "BookingGuestGrantAuth")!;
    delete (b as Partial<{ requiresUnexpired: boolean }>).requiresUnexpired;
    mutatedSpec.paths["/bookings/{ref}"].get["x-authorization-branches"] = structuredClone(
      polOp.branchConditions,
    );
    const res = validateOpenApiSpecification(mutatedSpec, { policyRegistry: mutatedPol });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("requires 'requiresUnexpired: true'")));
  });

  it("reproduces R6.1 positive control: branch conditions reordering passes normalized comparison", () => {
    const mutatedSpec = structuredClone(spec);
    const mutatedPol = structuredClone(policies);
    const polOp = mutatedPol.operations.find((x) => x.operationId === "getBookingByRef")!;
    polOp.branchConditions.reverse();
    const res = validateOpenApiSpecification(mutatedSpec, { policyRegistry: mutatedPol });
    assert.equal(
      res.valid,
      true,
      `Normalized reordering must pass validation: ${JSON.stringify(res.errors)}`,
    );
  });

  it("reproduces R6.2 probe: null component schema fails spec validation", () => {
    const mutatedSpec = structuredClone(spec);
    mutatedSpec.components!.schemas!.CodexNull = null as unknown as Record<string, unknown>;
    const res = validateOpenApiSpecification(mutatedSpec, { policyRegistry: policies });
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) => e.includes("must be a schema object or boolean, got null")),
    );
  });

  it("reproduces R6.2 probe: callback schema escapes preflight fails spec validation (unsupported OAS feature)", () => {
    const mutatedSpec = structuredClone(spec);
    (mutatedSpec.paths["/health"].get as Record<string, unknown>).callbacks = {
      probe: {
        "https://example.invalid/callback": {
          post: {
            operationId: "probeCallback",
            security: [],
            requestBody: {
              content: { "application/json": { schema: { unsupportedAssertion: true } } },
            },
            responses: { "204": { description: "probe" } },
          },
        },
      },
    };
    const res = validateOpenApiSpecification(mutatedSpec, { policyRegistry: policies });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("unsupported OAS feature 'callbacks'")));
  });

  it("reproduces R6.2 probe: schema container reference wrong target fails spec validation", () => {
    const mutatedSpec = structuredClone(spec);
    (mutatedSpec.paths["/bookings"].post as Record<string, unknown>).requestBody = {
      $ref: "#/info",
    };
    const res = validateOpenApiSpecification(mutatedSpec, { policyRegistry: policies });
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) =>
        e.includes("requestBody $ref must target '#/components/requestBodies/', got '#/info'"),
      ),
    );
  });

  it("reproduces R6.2 probe: missing operation responses fails spec validation", () => {
    const mutatedSpec = structuredClone(spec);
    delete (mutatedSpec.paths["/health"].get as Record<string, unknown>).responses;
    const res = validateOpenApiSpecification(mutatedSpec, { policyRegistry: policies });
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) => e.includes("must declare a non-empty responses object")),
    );
  });

  it("reproduces R6.2 probe: malformed parameters object returns structured error without throwing", () => {
    const mutatedSpec = structuredClone(spec);
    (mutatedSpec.paths["/health"].get as Record<string, unknown>).parameters = { unexpected: true };
    const res = validateOpenApiSpecification(mutatedSpec, { policyRegistry: policies });
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) => e.includes("parameters must be an array, got object")),
    );
  });

  it("reproduces R6.2 probe: invalid registry version fails policy validation", () => {
    const mutatedPol = structuredClone(policies);
    (mutatedPol as unknown as Record<string, unknown>).version = "unsupported";
    const res = validateOpenApiSpecification(spec, { policyRegistry: mutatedPol });
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) =>
        e.includes("Policy registry version must be '1.0.0', got 'unsupported'"),
      ),
    );
  });

  it("reproduces R6.2 probe: malformed allowedSecurity on public operation fails validation without throwing", () => {
    const mutatedSpec = structuredClone(spec);
    const mutatedPol = structuredClone(policies);
    const healthPol = mutatedPol.operations.find(
      (x) => x.operationId === mutatedSpec.paths["/health"].get.operationId,
    )!;
    (healthPol as Record<string, unknown>).allowedSecurity = [null];
    (mutatedSpec.paths["/health"].get as Record<string, unknown>).security = [null];
    const res = validateOpenApiSpecification(mutatedSpec, { policyRegistry: mutatedPol });
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) =>
        e.includes("security requirement must be a non-null object, got null"),
      ),
    );
  });

  it("reproduces R6.2 probe: NaN bound fails preflight", () => {
    const res = preflightSchema({ minimum: NaN }, spec);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("must be a finite number, got NaN")));
  });

  it("reproduces R6.2 probe: Infinity bound fails preflight", () => {
    const res = preflightSchema({ maximum: Infinity }, spec);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("must be a finite number, got Infinity")));
  });

  it("reproduces R6.2 probe: array items schema fails preflight (Draft 2020-12 items must be schema or boolean)", () => {
    const res = preflightSchema({ type: "array", items: [{ type: "string" }] }, spec);
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) =>
        e.includes("array-form items is unsupported (items must be a schema object or boolean)"),
      ),
    );
  });

  it("reproduces R6.2 probe: valid reusable container reference passes positive control", () => {
    const mutatedSpec = structuredClone(spec);
    (mutatedSpec.components as Record<string, unknown>).requestBodies = {
      ReusableBody: {
        description: "A valid reusable request body",
        required: true,
        content: {
          "application/json": {
            schema: { type: "object", properties: { key: { type: "string" } } },
          },
        },
      },
    };
    (mutatedSpec.paths["/bookings"].post as Record<string, unknown>).requestBody = {
      $ref: "#/components/requestBodies/ReusableBody",
    };
    const res = validateOpenApiSpecification(mutatedSpec, { policyRegistry: policies });
    assert.equal(
      res.valid,
      true,
      `Valid requestBodies $ref must pass: ${JSON.stringify(res.errors)}`,
    );
  });

  it("reproduces CLI test: demonstrates CLI exits nonzero for a temporary corrupted spec in an isolated scratch fixture", () => {
    const scratchCorruptDir = path.resolve(
      import.meta.dirname,
      "../../scratch/test-cli-corrupt-docs",
    );
    try {
      if (fs.existsSync(scratchCorruptDir)) {
        fs.rmSync(scratchCorruptDir, { recursive: true, force: true });
      }
      fs.mkdirSync(scratchCorruptDir, { recursive: true });

      // Copy all docs/backend files to scratch directory
      for (const file of fs.readdirSync(docsBackendDir)) {
        const srcFile = path.join(docsBackendDir, file);
        if (fs.statSync(srcFile).isFile()) {
          fs.copyFileSync(srcFile, path.join(scratchCorruptDir, file));
        }
      }

      // Corrupt openapi.v1.json in the isolated scratch directory
      const corruptSpecPath = path.join(scratchCorruptDir, "openapi.v1.json");
      const corruptSpec = JSON.parse(fs.readFileSync(corruptSpecPath, "utf-8"));
      corruptSpec.components.schemas.CorruptSchema = null;
      fs.writeFileSync(corruptSpecPath, JSON.stringify(corruptSpec, null, 2), "utf-8");

      // Execute CLI pointing to the corrupted scratch directory
      const cliScript = path.resolve(
        import.meta.dirname,
        "../../scripts/validate-backend-contracts.mjs",
      );
      let threw = false;
      let exitCode: number | null = null;
      try {
        execFileSync(process.execPath, [cliScript, scratchCorruptDir], {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (err: unknown) {
        threw = true;
        const e = err as { status?: number };
        exitCode = e.status ?? null;
      }
      assert.equal(threw, true, "CLI must throw / exit nonzero on corrupted spec");
      assert.equal(exitCode, 1, "CLI must exit with code 1");
    } finally {
      if (fs.existsSync(scratchCorruptDir)) {
        fs.rmSync(scratchCorruptDir, { recursive: true, force: true });
      }
    }
  });
});

describe("Phase 12: Source-Backed Contract Validation Against Actual Source Fixtures", () => {
  const spec: OpenApiDocument = JSON.parse(fs.readFileSync(openapiPath, "utf-8"));

  it("validates all 67 genuine ARCHIVE_CATALOG intake records against ArchiveRecordDto schema", () => {
    const schema = spec.components?.schemas?.ArchiveRecordDto;
    assert.ok(schema, "ArchiveRecordDto schema must exist");

    for (const record of ARCHIVE_CATALOG) {
      const res = validatePayloadAgainstSchema(schema, record, spec);
      assert.ok(res.valid, `Record ${record.id} must validate: ${JSON.stringify(res.errors)}`);
    }
  });

  it("validates all 13 genuine SOURCE_REGISTRY records against ArchiveSourceDto schema", () => {
    const schema = spec.components?.schemas?.ArchiveSourceDto;
    assert.ok(schema, "ArchiveSourceDto schema must exist");

    for (const source of Object.values(SOURCE_REGISTRY)) {
      const res = validatePayloadAgainstSchema(schema, source, spec);
      assert.ok(res.valid, `Source ${source.id} must validate: ${JSON.stringify(res.errors)}`);
    }
  });

  it("validates all 7 network destination airports from seedNetworkEnvelope against AirportDto schema", async () => {
    const schema = spec.components?.schemas?.AirportDto;
    assert.ok(schema, "AirportDto schema must exist");

    const network = await seedNetworkEnvelope();
    for (const dest of network.destinations) {
      const res = validatePayloadAgainstSchema(schema, dest, spec);
      assert.ok(res.valid, `Destination ${dest.code} must validate: ${JSON.stringify(res.errors)}`);
    }
  });

  it("validates all 3 fleet airframes and layouts from seedFleetEnvelope against OpenAPI schemas", async () => {
    const fleet = await seedFleetEnvelope();
    const acSchema = spec.components?.schemas?.AircraftDto;
    const layoutSchema = spec.components?.schemas?.SeatLayoutDto;

    for (const ac of fleet.aircraft) {
      const res = validatePayloadAgainstSchema(acSchema, ac, spec);
      assert.ok(res.valid, `Aircraft ${ac.id} must validate: ${JSON.stringify(res.errors)}`);
    }

    for (const layout of Object.values(fleet.layouts)) {
      const res = validatePayloadAgainstSchema(layoutSchema, layout, spec);
      assert.ok(
        res.valid,
        `Layout ${layout.aircraftId} must validate: ${JSON.stringify(res.errors)}`,
      );
    }
  });

  it("validates all recurring schedules from seedSchedules against ScheduleDto schema", async () => {
    const schema = spec.components?.schemas?.ScheduleDto;
    assert.ok(schema, "ScheduleDto schema must exist");

    const schedules = await seedSchedules();
    for (const sch of schedules) {
      const res = validatePayloadAgainstSchema(schema, sch, spec);
      assert.ok(res.valid, `Schedule ${sch.id} must validate: ${JSON.stringify(res.errors)}`);
    }
  });

  it("validates compiled commercial catalog from seedCommercialCatalog against CommercialCatalogDto schema", () => {
    const schema = spec.components?.schemas?.CommercialCatalogDto;
    assert.ok(schema, "CommercialCatalogDto schema must exist");

    const catalog = seedCommercialCatalog();
    const res = validatePayloadAgainstSchema(schema, catalog, spec);
    assert.ok(res.valid, `Commercial catalog must validate: ${JSON.stringify(res.errors)}`);
  });

  it("validates all 8 compiled CMS documents against ContentDocument schema", async () => {
    const schema = spec.components?.schemas?.ContentDocument;
    assert.ok(schema, "ContentDocument schema must exist");

    const docKeys = [
      "home",
      "travel",
      "airport.past",
      "airport.present",
      "airport.future",
      "destinations.presentation",
      "destinations.editorial",
      "pages.information",
    ] as const;

    for (const key of docKeys) {
      const doc = await getPublishedContent(key);
      const res = validatePayloadAgainstSchema(schema, doc, spec);
      assert.ok(
        res.valid,
        `CMS document '${key}' must validate against ContentDocument: ${JSON.stringify(res.errors)}`,
      );
    }
  });

  it("validates operation-level responses for fleet, schedules, and fares against authentic source fixtures", async () => {
    const fleetEnv = await seedFleetEnvelope();
    const scheds = await seedSchedules();
    const commCatalog = seedCommercialCatalog();

    const sampleMeta = {
      requestId: "e9f0d1a2-3b4c-5d6e-7f8a-9b0c1d2e3f4a",
      timestamp: "2026-10-08T16:00:00Z",
    };

    // 1. POST /admin/fleet/aircraft response
    const postAircraftSchema =
      spec.paths["/admin/fleet/aircraft"].post.responses!["201"].content!["application/json"]
        .schema;
    const postAircraftPayload = { success: true, data: fleetEnv.aircraft[0], meta: sampleMeta };
    const r1 = validatePayloadAgainstSchema(postAircraftSchema, postAircraftPayload, spec);
    assert.ok(
      r1.valid,
      `POST /admin/fleet/aircraft response must validate: ${JSON.stringify(r1.errors)}`,
    );

    // 2. PATCH /admin/fleet/aircraft/{id} response
    const patchAircraftSchema =
      spec.paths["/admin/fleet/aircraft/{id}"].patch.responses!["200"].content!["application/json"]
        .schema;
    const patchAircraftPayload = { success: true, data: fleetEnv.aircraft[0], meta: sampleMeta };
    const r2 = validatePayloadAgainstSchema(patchAircraftSchema, patchAircraftPayload, spec);
    assert.ok(
      r2.valid,
      `PATCH /admin/fleet/aircraft/{id} response must validate: ${JSON.stringify(r2.errors)}`,
    );

    // 3. GET /fleet/aircraft response
    const getAircraftSchema =
      spec.paths["/fleet/aircraft"].get.responses!["200"].content!["application/json"].schema;
    const getAircraftPayload = { success: true, data: fleetEnv.aircraft, meta: sampleMeta };
    const r3 = validatePayloadAgainstSchema(getAircraftSchema, getAircraftPayload, spec);
    assert.ok(r3.valid, `GET /fleet/aircraft response must validate: ${JSON.stringify(r3.errors)}`);

    // 4. POST /admin/schedules response
    const postSchedSchema =
      spec.paths["/admin/schedules"].post.responses!["201"].content!["application/json"].schema;
    const postSchedPayload = { success: true, data: scheds[0], meta: sampleMeta };
    const r4 = validatePayloadAgainstSchema(postSchedSchema, postSchedPayload, spec);
    assert.ok(
      r4.valid,
      `POST /admin/schedules response must validate: ${JSON.stringify(r4.errors)}`,
    );

    // 5. PATCH /admin/schedules/{id} response
    const patchSchedSchema =
      spec.paths["/admin/schedules/{id}"].patch.responses!["200"].content!["application/json"]
        .schema;
    const patchSchedPayload = { success: true, data: scheds[0], meta: sampleMeta };
    const r5 = validatePayloadAgainstSchema(patchSchedSchema, patchSchedPayload, spec);
    assert.ok(
      r5.valid,
      `PATCH /admin/schedules/{id} response must validate: ${JSON.stringify(r5.errors)}`,
    );

    // 6. GET /schedules response
    const getSchedSchema =
      spec.paths["/schedules"].get.responses!["200"].content!["application/json"].schema;
    const getSchedPayload = { success: true, data: scheds, meta: sampleMeta };
    const r6 = validatePayloadAgainstSchema(getSchedSchema, getSchedPayload, spec);
    assert.ok(r6.valid, `GET /schedules response must validate: ${JSON.stringify(r6.errors)}`);

    // 7. GET /commercial/fares response
    const getFaresSchema =
      spec.paths["/commercial/fares"].get.responses!["200"].content!["application/json"].schema;
    const getFaresPayload = { success: true, data: commCatalog.fares, meta: sampleMeta };
    const r7 = validatePayloadAgainstSchema(getFaresSchema, getFaresPayload, spec);
    assert.ok(
      r7.valid,
      `GET /commercial/fares response must validate: ${JSON.stringify(r7.errors)}`,
    );

    // Negative check: Tampering operation response to require obsolete field fails validation
    const tamperedSchema = {
      type: "object",
      properties: {
        success: { type: "boolean" },
        data: {
          type: "object",
          properties: {
            flightNumber: { type: "string" },
          },
          required: ["flightNumber"],
        },
        meta: { $ref: "#/components/schemas/SuccessMeta" },
      },
      required: ["success", "data", "meta"],
    };
    const negRes = validatePayloadAgainstSchema(tamperedSchema, postSchedPayload, spec);
    assert.equal(negRes.valid, false, "Tampered schema requiring obsolete flightNumber must fail");
  });
});

describe("Phase 12: Mutation Contracts & Cross-Record Semantic Invariants", () => {
  const spec: OpenApiDocument = JSON.parse(fs.readFileSync(openapiPath, "utf-8"));

  it("validates CreateAircraftRequest and PatchAircraftRequest schemas against authentic source inputs", () => {
    const createSchema = spec.components?.schemas?.CreateAircraftRequest;
    const patchSchema = spec.components?.schemas?.PatchAircraftRequest;

    const createInput = {
      aircraft: {
        model: "Airbus A320neo",
        registration: "PS-GZA",
        active: true,
      },
      initialLayout: {
        rows: 30,
        letters: ["A", "B", "C", "D", "E", "F"],
        aisleAfter: 3,
        zones: [
          { id: "business", firstRow: 1, lastRow: 3 },
          { id: "economy", firstRow: 4, lastRow: 30 },
        ],
        extraLegroomRows: [4, 12, 13],
        unavailable: ["30B", "30E"],
      },
    };
    const cRes = validatePayloadAgainstSchema(createSchema, createInput, spec);
    assert.ok(cRes.valid, `CreateAircraftRequest must validate: ${JSON.stringify(cRes.errors)}`);

    const patchInput = {
      model: "Airbus A320neo Extended",
      active: false,
    };
    const pRes = validatePayloadAgainstSchema(patchSchema, patchInput, spec);
    assert.ok(pRes.valid, `PatchAircraftRequest must validate: ${JSON.stringify(pRes.errors)}`);
  });

  it("validates PutSeatLayoutRequest schema: rejects caller-supplied capacity and requires authentic geometry", () => {
    const layoutSchema = spec.components?.schemas?.PutSeatLayoutRequest;

    const validGeometry = {
      rows: 32,
      letters: ["A", "B", "C", "D", "E", "F"],
      aisleAfter: 3,
      zones: [
        { id: "business", firstRow: 1, lastRow: 4 },
        { id: "economy", firstRow: 5, lastRow: 32 },
      ],
      extraLegroomRows: [5, 14, 15],
      unavailable: ["32B"],
    };
    const vRes = validatePayloadAgainstSchema(layoutSchema, validGeometry, spec);
    assert.ok(vRes.valid, `Valid layout geometry must pass: ${JSON.stringify(vRes.errors)}`);

    // Injected caller capacity must fail additionalProperties: false
    const callerCapacityInjection = {
      ...validGeometry,
      capacity: 180, // Injected caller capacity!
    };
    const cRes = validatePayloadAgainstSchema(layoutSchema, callerCapacityInjection, spec);
    assert.equal(cRes.valid, false, "Injected capacity must fail additionalProperties: false");
    assert.ok(cRes.errors.some((e: string) => e.includes("unrecognized property 'capacity'")));
  });

  it("validates CreateScheduleRequest and PatchScheduleRequest schemas with structured exceptions", () => {
    const createSchema = spec.components?.schemas?.CreateScheduleRequest;
    const patchSchema = spec.components?.schemas?.PatchScheduleRequest;

    const scheduleInput = {
      id: "sch-gza-amm-01",
      number: "PS100",
      direction: "out",
      destination: "AMM",
      days: [0, 2, 4],
      departTime: "08:30",
      arriveTime: "09:45",
      aircraft: "Airbus A320neo",
      from: "2026-10-01",
      until: "2027-03-31",
      active: true,
      exceptions: [
        {
          id: "exc-001",
          date: "2026-12-25",
          detail: "Holiday timing adjustment",
          kind: "time",
          effect: {
            departTime: "10:00",
            arriveTime: "11:15",
          },
        },
        {
          id: "exc-002",
          date: "2027-01-01",
          detail: "Cancelled service",
          kind: "cancelled",
          effect: {
            cancelled: true,
          },
        },
      ],
    };

    const cRes = validatePayloadAgainstSchema(createSchema, scheduleInput, spec);
    assert.ok(cRes.valid, `CreateScheduleRequest must validate: ${JSON.stringify(cRes.errors)}`);

    const patchInput = {
      departTime: "09:00",
      arriveTime: "10:15",
      exceptions: [
        {
          id: "exc-003",
          date: "2026-11-15",
          detail: "Equipment swap",
          kind: "aircraft",
          effect: {
            aircraftId: "b737800",
            aircraft: "Boeing 737-800",
          },
        },
      ],
    };
    const pRes = validatePayloadAgainstSchema(patchSchema, patchInput, spec);
    assert.ok(pRes.valid, `PatchScheduleRequest must validate: ${JSON.stringify(pRes.errors)}`);
  });

  it("validates CheckInResponse schema allows lap infant without physical seatCode", () => {
    const checkInResponseSchema = spec.components?.schemas?.CheckInResponse;

    const infantCheckIn = {
      success: true,
      data: {
        legId: "leg-001",
        datedServiceId: "svc1-c2NoZWQtZ3phLWFtbS0wMQ-2026-10-15",
        passengerId: "pax-infant-1",
        seatCode: null, // Lap infant has no physical seat!
        checkInStatus: "checked_in",
        checkedInAt: "2026-10-15T06:30:00Z",
        boardingPassToken: "bp_token_infant_12345",
      },
      meta: {
        requestId: "e9f0d1a2-3b4c-5d6e-7f8a-9b0c1d2e3f4a",
        timestamp: "2026-10-15T06:30:00Z",
      },
    };

    const res = validatePayloadAgainstSchema(checkInResponseSchema, infantCheckIn, spec);
    assert.ok(
      res.valid,
      `CheckInResponse with null seatCode must pass: ${JSON.stringify(res.errors)}`,
    );
  });

  it("semantic contract rule: exported validateBookingPassengerLinking validates complete invariant rules", () => {
    // Valid party: 1 adult, 1 child, 1 linked infant
    const validParty = [
      { id: "p1", firstName: "Tareq", lastName: "Mansour", type: "adult" },
      { id: "p2", firstName: "Yousef", lastName: "Mansour", type: "child" },
      {
        id: "p3",
        firstName: "Lina",
        lastName: "Mansour",
        type: "infant",
        linkedAdultPassengerId: "p1",
      },
    ];
    assert.ok(validateBookingPassengerLinking(validParty).valid);

    // Invalid: Duplicate passenger IDs
    const duplicateIds = [
      { id: "p1", firstName: "Tareq", lastName: "Mansour", type: "adult" },
      { id: "p1", firstName: "Duplicate", lastName: "Mansour", type: "adult" },
    ];
    const rDup = validateBookingPassengerLinking(duplicateIds);
    assert.equal(rDup.valid, false);
    assert.ok(rDup.errors.some((e) => e.includes("duplicate passenger id")));

    // Invalid: No adult passenger
    const noAdult = [{ id: "p1", firstName: "Child", lastName: "Solo", type: "child" }];
    const rNoAdult = validateBookingPassengerLinking(noAdult);
    assert.equal(rNoAdult.valid, false);
    assert.ok(rNoAdult.errors.some((e) => e.includes("must contain at least one adult")));

    // Invalid: Infant links to child
    const childLink = [
      { id: "p1", firstName: "Tareq", lastName: "Mansour", type: "adult" },
      { id: "p2", firstName: "Child", lastName: "Mansour", type: "child" },
      {
        id: "p3",
        firstName: "Lina",
        lastName: "Mansour",
        type: "infant",
        linkedAdultPassengerId: "p2",
      },
    ];
    const rChildLink = validateBookingPassengerLinking(childLink);
    assert.equal(rChildLink.valid, false);
    assert.ok(rChildLink.errors.some((e) => e.includes("can only link to an adult passenger")));

    // Invalid: Orphan adult reference
    const orphanLink = [
      { id: "p1", firstName: "Tareq", lastName: "Mansour", type: "adult" },
      {
        id: "p2",
        firstName: "Lina",
        lastName: "Mansour",
        type: "infant",
        linkedAdultPassengerId: "nonexistent-adult",
      },
    ];
    const rOrphan = validateBookingPassengerLinking(orphanLink);
    assert.equal(rOrphan.valid, false);
    assert.ok(rOrphan.errors.some((e) => e.includes("references nonexistent adult")));

    // Invalid: Self-linking
    const selfLink = [
      { id: "p1", firstName: "Tareq", lastName: "Mansour", type: "adult" },
      {
        id: "p2",
        firstName: "Lina",
        lastName: "Mansour",
        type: "infant",
        linkedAdultPassengerId: "p2",
      },
    ];
    const rSelf = validateBookingPassengerLinking(selfLink);
    assert.equal(rSelf.valid, false);
    assert.ok(rSelf.errors.some((e) => e.includes("cannot link to themselves")));

    // Invalid: Two infants linked to one adult (exceeds 1-to-1 bound)
    const twoInfants = [
      { id: "p1", firstName: "Tareq", lastName: "Mansour", type: "adult" },
      {
        id: "p2",
        firstName: "Lina",
        lastName: "Mansour",
        type: "infant",
        linkedAdultPassengerId: "p1",
      },
      {
        id: "p3",
        firstName: "Sami",
        lastName: "Mansour",
        type: "infant",
        linkedAdultPassengerId: "p1",
      },
    ];
    const rTwoInfants = validateBookingPassengerLinking(twoInfants);
    assert.equal(rTwoInfants.valid, false);
    assert.ok(
      rTwoInfants.errors.some((e) => e.includes("cannot have more than one linked infant")),
    );

    // Invalid: Infant with seatCode
    const infantWithSeat = [
      { id: "p1", firstName: "Tareq", lastName: "Mansour", type: "adult" },
      {
        id: "p2",
        firstName: "Lina",
        lastName: "Mansour",
        type: "infant",
        linkedAdultPassengerId: "p1",
        seatCode: "12A",
      },
    ];
    const rInfantSeat = validateBookingPassengerLinking(infantWithSeat);
    assert.equal(rInfantSeat.valid, false);
    assert.ok(rInfantSeat.errors.some((e) => e.includes("cannot have an assigned seat")));

    // Invalid: Undocumented alias linkedAdultId is rejected
    const aliasParty = [
      { id: "p1", firstName: "Tareq", lastName: "Mansour", type: "adult" },
      { id: "p2", firstName: "Lina", lastName: "Mansour", type: "infant", linkedAdultId: "p1" },
    ];
    const rAlias = validateBookingPassengerLinking(aliasParty);
    assert.equal(rAlias.valid, false);
    assert.ok(rAlias.errors.some((e) => e.includes("undocumented alias 'linkedAdultId'")));
  });

  it("POST /bookings operation schema and validateBookingPassengerLinking validate the same genuine specimen", () => {
    const postBookingOp = spec.paths["/bookings"]?.post;
    assert.ok(postBookingOp, "POST /bookings operation must exist");
    const bookingSchema = postBookingOp.requestBody?.content?.["application/json"]?.schema;
    assert.ok(bookingSchema, "POST /bookings requestBody schema must exist");

    const sampleBooking = {
      quoteId: "e9f0d1a2-3b4c-5d6e-7f8a-9b0c1d2e3f4a",
      holdId: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      contactName: "Tareq Mansour",
      contactEmail: "tareq@example.ps",
      contactPhone: "+970599123456",
      passengers: [
        { id: "pax-1", firstName: "Tareq", lastName: "Mansour", type: "adult" },
        { id: "pax-2", firstName: "Yousef", lastName: "Mansour", type: "child" },
        {
          id: "pax-3",
          firstName: "Lina",
          lastName: "Mansour",
          type: "infant",
          linkedAdultPassengerId: "pax-1",
        },
      ],
    };

    const schemaRes = validatePayloadAgainstSchema(bookingSchema, sampleBooking, spec);
    assert.ok(
      schemaRes.valid,
      `CreateBookingRequest must validate against operation schema: ${JSON.stringify(schemaRes.errors)}`,
    );

    const linkRes = validateBookingPassengerLinking(sampleBooking.passengers);
    assert.ok(
      linkRes.valid,
      `passengers must validate against semantic helper: ${JSON.stringify(linkRes.errors)}`,
    );

    // Negative case 1: Infant without linked adult (fails both schema and semantic helper)
    const badInfantBooking = {
      ...sampleBooking,
      passengers: [{ id: "pax-1", firstName: "Baby", lastName: "Solo", type: "infant" }],
    };
    const negSchemaRes = validatePayloadAgainstSchema(bookingSchema, badInfantBooking, spec);
    assert.equal(
      negSchemaRes.valid,
      false,
      "Schema must reject infant without linkedAdultPassengerId",
    );
    const negHelperRes = validateBookingPassengerLinking(badInfantBooking.passengers);
    assert.equal(
      negHelperRes.valid,
      false,
      "Helper must reject infant without linkedAdultPassengerId",
    );

    // Negative case 2: Infant linking to nonexistent adult (passes schema, fails helper)
    const nonExistentAdultBooking = {
      ...sampleBooking,
      passengers: [
        { id: "pax-1", firstName: "Tareq", lastName: "Mansour", type: "adult" },
        {
          id: "pax-2",
          firstName: "Lina",
          lastName: "Mansour",
          type: "infant",
          linkedAdultPassengerId: "pax-missing",
        },
      ],
    };
    const negHelperNonExistentRes = validateBookingPassengerLinking(
      nonExistentAdultBooking.passengers,
    );
    assert.equal(
      negHelperNonExistentRes.valid,
      false,
      "Helper must reject infant linking to nonexistent adult",
    );
    assert.ok(
      negHelperNonExistentRes.errors.some((e) => e.includes("references nonexistent adult")),
    );
  });
});

describe("Phase 12: Dated-Service Identity Codec Boundary Verification", () => {
  it("preserves exact schedule ID with whitespace and Unicode within 160-char bound", () => {
    const scheduleId = "sch AMM out القدس 2026";
    const date = "2026-10-15";
    const id = datedServiceId(scheduleId, date);

    assert.ok(id.startsWith("svc1-"), "Must start with svc1- prefix");
    assert.ok(id.endsWith("-2026-10-15"), "Must end with ISO date");

    const parsed = parseDatedServiceId(id);
    assert.ok(parsed !== null, "Must parse cleanly");
    assert.equal(parsed.scheduleId, scheduleId, "Must preserve exact schedule ID facts");
    assert.equal(parsed.date, date, "Must preserve exact date facts");
  });

  it("round-trips exact maximum boundary 160-character schedule ID", () => {
    const maxBoundId = "a".repeat(160);
    const date = "2026-06-01";
    const serviceId = datedServiceId(maxBoundId, date);

    const parsed = parseDatedServiceId(serviceId);
    assert.ok(parsed !== null, "Max bound 160-char ID must parse cleanly");
    assert.equal(parsed.scheduleId.length, 160, "Schedule ID must be exactly 160 chars");
    assert.equal(parsed.scheduleId, maxBoundId, "Schedule ID facts must match");
  });

  it("rejects schedule ID exceeding 160 characters", () => {
    const overBoundId = "a".repeat(161);
    const date = "2026-06-01";

    assert.throws(
      () => datedServiceId(overBoundId, date),
      /Schedule ID must be a 1-160 character string/,
      "datedServiceId must throw for >160 chars",
    );
  });

  it("rejects invalid calendar date (e.g. February 30 / non-leap February 29)", () => {
    assert.equal(isValidISODate("2026-02-30"), false, "Feb 30 is never valid");
    assert.equal(isValidISODate("2026-02-29"), false, "2026 is not a leap year");
    assert.equal(isValidISODate("2028-02-29"), true, "2028 is a leap year");

    assert.throws(
      () => datedServiceId("sch-AMM-out", "2026-02-30"),
      /Invalid ISO calendar date/,
      "datedServiceId must reject invalid calendar date",
    );
  });

  it("validates RFC 3339 date-time helper calendar boundaries", () => {
    assert.equal(
      isValidRFC3339DateTime("2026-02-29T12:00:00Z"),
      false,
      "Non-leap year Feb 29 date-time invalid",
    );
    assert.equal(
      isValidRFC3339DateTime("2028-02-29T12:00:00Z"),
      true,
      "Leap year Feb 29 date-time valid",
    );
    assert.equal(
      isValidRFC3339DateTime("2026-12-31T23:59:59+03:00"),
      true,
      "Offset date-time valid",
    );
    assert.equal(isValidRFC3339DateTime("not-a-datetime"), false, "Arbitrary string invalid");
  });

  it("parseDatedServiceId returns null for non-canonical or malformed identifiers", () => {
    assert.equal(parseDatedServiceId("not-a-service-id"), null);
    assert.equal(parseDatedServiceId("svc1-invalid!chars-2026-10-15"), null);
    assert.equal(parseDatedServiceId("svc1-c2NoZWQtZ3phLWFtbS0wMQ-2026-02-30"), null);
  });

  it("proves astral Unicode surrogate UTF-16 units vs code points at and over 160-unit bound", () => {
    // In JavaScript, surrogate pair emoji like ✈️, 🛫, 🛩️ count as 2 UTF-16 code units (.length === 2)
    const astralChar = "🛫"; // U+1F6EB AIRPLANE DEPARTURE: 2 UTF-16 code units
    assert.equal(astralChar.length, 2, "Astral emoji takes 2 UTF-16 code units in JavaScript");

    // Construct schedule ID with exactly 80 astral chars = 160 UTF-16 units
    const exact160UnitId = astralChar.repeat(80);
    assert.equal(exact160UnitId.length, 160, "Schedule ID must be exactly 160 UTF-16 code units");

    const date = "2026-10-08";
    const serviceId = datedServiceId(exact160UnitId, date);
    assert.ok(serviceId.startsWith("svc1-"));

    const parsed = parseDatedServiceId(serviceId);
    assert.ok(parsed !== null, "Must parse cleanly");
    assert.equal(parsed.scheduleId, exact160UnitId, "Must preserve exact astral Unicode content");
    assert.equal(parsed.date, date, "Must preserve date");

    // Test over 160 units (81 astral characters = 162 UTF-16 units)
    const over160UnitId = astralChar.repeat(81);
    assert.equal(over160UnitId.length, 162);
    assert.throws(
      () => datedServiceId(over160UnitId, date),
      /Schedule ID must be a 1-160 character string/,
      "datedServiceId must enforce 160 UTF-16 unit bound on astral strings",
    );
  });
});

describe("Phase 12: Reviewer Probes — R7.1 Bounded Container Repairs", () => {
  const spec: OpenApiDocument = JSON.parse(fs.readFileSync(openapiPath, "utf-8"));
  const policies: PolicyRegistry = JSON.parse(fs.readFileSync(policiesPath, "utf-8"));

  it("reproduces R7.1 probe 1: valid referenced path parameter #/components/parameters/CodexRef on GET /bookings/{ref} passes spec validation", () => {
    const mutated = structuredClone(spec);
    mutated.components = mutated.components || {};
    mutated.components.parameters = mutated.components.parameters || {};
    mutated.components.parameters.CodexRef = {
      name: "ref",
      in: "path",
      required: true,
      schema: { type: "string" },
      description: "Referenced booking reference parameter",
    };
    (mutated.paths["/bookings/{ref}"] as Record<string, unknown>).parameters = [
      { $ref: "#/components/parameters/CodexRef" },
    ];
    const res = validateOpenApiSpecification(mutated);
    assert.equal(
      res.valid,
      true,
      `Referenced path parameter must pass: ${JSON.stringify(res.errors)}`,
    );
  });

  it("reproduces R7.1 probe 2: referenced header with null schema fails spec preflight", () => {
    const mutated = structuredClone(spec);
    mutated.components = mutated.components || {};
    const comps = mutated.components as Record<string, unknown>;
    const headers = ((comps.headers as Record<string, unknown>) || {}) as Record<string, unknown>;
    comps.headers = headers;
    headers.CodexHeader = {
      description: "Codex header with null schema",
      schema: null,
    };
    const res = validateOpenApiSpecification(mutated);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("Schema cannot be null")));
  });

  it("reproduces R7.1 probe 3: empty inline requestBody {} fails spec validation", () => {
    const mutated = structuredClone(spec);
    (mutated.paths["/bookings"].post as Record<string, unknown>).requestBody = {};
    const res = validateOpenApiSpecification(mutated);
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e: string) => e.includes("must declare a non-empty 'content' object")),
    );
  });

  it("reproduces R7.1 probe 4: invalid response status key like 'banana' fails spec validation", () => {
    const mutated = structuredClone(spec);
    mutated.paths["/health"].get.responses = {
      ...mutated.paths["/health"].get.responses,
      banana: { description: "Invalid banana response status" },
    };
    const res = validateOpenApiSpecification(mutated);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("is not a valid HTTP status code")));
  });

  it("reproduces R7.1 probe 5: security and branches reordered passes policy validation", () => {
    const mutatedSpec = structuredClone(spec);
    const mutatedPol = structuredClone(policies);
    const bookingPath = "/bookings/{ref}";
    const op = mutatedSpec.paths[bookingPath].get;
    op.security = [...(op.security || [])].reverse();
    if (op["x-authorization-branches"]) {
      op["x-authorization-branches"] = [...op["x-authorization-branches"]].reverse();
    }
    const res = validateOperationPolicies(mutatedSpec, mutatedPol);
    assert.equal(
      res.valid,
      true,
      `Reordered branches must pass normalized validation: ${JSON.stringify(res.errors)}`,
    );
  });
});

describe("Phase 12: Commercial Contracts, Money Adapters & Semantic Invariants", () => {
  const spec: OpenApiDocument = JSON.parse(fs.readFileSync(openapiPath, "utf-8"));
  const sourceExpectationsPath = path.join(
    import.meta.dirname,
    "../fixtures/backend-contracts/source-expectations.json",
  );

  it("money adapter: converts valid major USD amounts to integer minor cents without silent rounding", () => {
    assert.equal(majorToMinorUsd(35), 3500);
    assert.equal(majorToMinorUsd(0), 0);
    assert.equal(majorToMinorUsd(0.29), 29);
    assert.equal(majorToMinorUsd(1.5), 150);
  });

  it("money adapter: rejects negative amounts, fractional cents, >2 decimal places, and non-finite values", () => {
    assert.throws(() => majorToMinorUsd(-1), /cannot be negative/);
    assert.throws(() => majorToMinorUsd(-0.01), /cannot be negative/);
    assert.throws(() => majorToMinorUsd(0.291), /exceeds 2 decimal places/);
    assert.throws(() => majorToMinorUsd(35.999), /exceeds 2 decimal places/);
    assert.throws(() => majorToMinorUsd(NaN), /must be a finite number/);
    assert.throws(() => majorToMinorUsd(Infinity), /must be a finite number/);
    assert.throws(() => majorToMinorUsd(1e21), /Scientific notation unsupported/);
  });

  it("money adapter: converts integer minor cents to major USD amounts", () => {
    assert.equal(minorToMajorUsd(3500), 35);
    assert.equal(minorToMajorUsd(0), 0);
    assert.equal(minorToMajorUsd(29), 0.29);
  });

  it("money adapter: minorToMajorUsd rejects non-integers and negative numbers", () => {
    assert.throws(() => minorToMajorUsd(35.5), /must be an integer/);
    assert.throws(() => minorToMajorUsd(-100), /cannot be negative/);
    assert.throws(() => minorToMajorUsd(NaN), /must be a finite number/);
  });

  it("commercial catalog adapter: sourceCatalogToWire and wireCatalogToSource lossless roundtrip", () => {
    const source = seedCommercialCatalog();
    const wire = sourceCatalogToWire(source);

    assert.equal(wire.baggage.extraBagPriceMinor, 3500);
    assert.equal(wire.baggage.currency, "USD");
    assert.equal("extraBagPrice" in wire.baggage, false);

    const restored = wireCatalogToSource(wire);
    assert.deepEqual(restored, source);
  });

  it("commercial catalog wire validates against CommercialCatalogWireDto schema", () => {
    const wireSchema = spec.components?.schemas?.CommercialCatalogWireDto;
    assert.ok(wireSchema, "CommercialCatalogWireDto schema must exist");
    const source = seedCommercialCatalog();
    const wire = sourceCatalogToWire(source);
    const res = validatePayloadAgainstSchema(wireSchema, wire, spec);
    assert.equal(res.valid, true, `Wire catalog must validate: ${JSON.stringify(res.errors)}`);
  });

  it("independent source-expectations fixture validates all mutation families against OpenAPI operations", () => {
    assert.ok(fs.existsSync(sourceExpectationsPath), "source-expectations.json fixture must exist");
    const expectations = JSON.parse(fs.readFileSync(sourceExpectationsPath, "utf-8"));

    for (const fam of expectations.mutationFamilies) {
      const op = spec.paths[fam.path]?.[fam.method.toLowerCase()];
      assert.ok(op, `Operation for ${fam.method} ${fam.path} must exist in OpenAPI spec`);
      assert.equal(op.operationId, fam.operationId, `OperationId mismatch for ${fam.name}`);
      if (fam.requiredPermission) {
        assert.equal(
          op["x-required-permission"],
          fam.requiredPermission,
          `Permission mismatch for ${fam.name}`,
        );
      } else {
        assert.equal(
          op["x-required-permission"],
          undefined,
          `Expected no required permission for ${fam.name}`,
        );
      }

      if (fam.securityScheme) {
        assert.ok(
          op.security?.some((s: Record<string, string[]>) => fam.securityScheme in s),
          `Security scheme ${fam.securityScheme} must be present for ${fam.name}`,
        );
      }

      if (fam.branchCondition) {
        assert.ok(
          op["x-authorization-branches"]?.some(
            (b: { condition: string }) => b.condition === fam.branchCondition,
          ),
          `Branch condition ${fam.branchCondition} must be present for ${fam.name}`,
        );
      }

      if (fam.requestSchema) {
        const reqContent = op.requestBody as
          { content?: Record<string, { schema?: { $ref?: string } }> } | undefined;
        const reqSchemaRef = reqContent?.content?.["application/json"]?.schema?.$ref;
        assert.ok(reqSchemaRef, `RequestBody schema must be referenced for ${fam.name}`);
        assert.ok(
          reqSchemaRef.endsWith(`/${fam.requestSchema}`),
          `Expected request schema ${fam.requestSchema}, got ${reqSchemaRef}`,
        );
      }

      const respObj = op.responses?.[String(fam.expectedStatus)];
      const respSchemaRef = (
        respObj?.content?.["application/json"]?.schema as { $ref?: string } | undefined
      )?.$ref;
      assert.ok(respSchemaRef, `Response schema must be referenced for ${fam.name}`);
      const respName = respSchemaRef.split("/").pop();
      assert.equal(
        respName,
        fam.responseSchema,
        `Response must match exact declared response envelope: expected ${fam.responseSchema}, got ${respName}`,
      );
    }
  });

  it("real source mutation execution and receipt verification for all 10 commercial mutation families against OpenAPI operations", async () => {
    const catalog = seedCommercialCatalog();
    const cases: Array<[string, string, string, unknown, string, unknown[], string]> = [
      [
        "updateFare",
        "patch",
        "/admin/commercial/fares/{id}",
        { patch: { multiplier: 1.4 } },
        "updateFareWithReceipt",
        ["classic", { multiplier: 1.4 }],
        "catalog_snapshot",
      ],
      [
        "updateCabinPricing",
        "patch",
        "/admin/commercial/cabins/{id}",
        { patch: { multiplier: 2.8 } },
        "updateCabinPricingWithReceipt",
        ["business", { multiplier: 2.8 }],
        "catalog_snapshot",
      ],
      [
        "updateBaggage",
        "patch",
        "/admin/commercial/baggage",
        { patch: { extraBagPriceMinor: 4000 } },
        "updateBaggageWithReceipt",
        [{ extraBagPrice: 40 }],
        "catalog_snapshot",
      ],
      [
        "createMeal",
        "post",
        "/admin/commercial/meals",
        {
          option: { id: "test_meal", label: { en: "Test", ar: "اختبار" }, active: true, order: 4 },
        },
        "createMealWithReceipt",
        [{ id: "test_meal", label: { en: "Test", ar: "اختبار" }, active: true, order: 4 }],
        "option",
      ],
      [
        "updateMeal",
        "patch",
        "/admin/commercial/meals/{id}",
        { patch: { active: false } },
        "updateMealWithReceipt",
        ["vegetarian", { active: false }],
        "option",
      ],
      [
        "reorderMeals",
        "put",
        "/admin/commercial/meals/order",
        { ids: catalog.meals.map((x) => x.id).reverse() },
        "reorderMealsWithReceipt",
        [catalog.meals.map((x) => x.id).reverse()],
        "catalog_snapshot",
      ],
      [
        "setDefaultMeal",
        "put",
        "/admin/commercial/meals/default",
        { id: "vegetarian" },
        "setDefaultMealWithReceipt",
        ["vegetarian"],
        "catalog_snapshot",
      ],
      [
        "createAssistance",
        "post",
        "/admin/commercial/assistance",
        {
          option: { id: "test_help", label: { en: "Test", ar: "اختبار" }, active: true, order: 4 },
        },
        "createAssistanceWithReceipt",
        [{ id: "test_help", label: { en: "Test", ar: "اختبار" }, active: true, order: 4 }],
        "option",
      ],
      [
        "updateAssistance",
        "patch",
        "/admin/commercial/assistance/{id}",
        { patch: { active: false } },
        "updateAssistanceWithReceipt",
        ["wheelchair", { active: false }],
        "option",
      ],
      [
        "reorderAssistance",
        "put",
        "/admin/commercial/assistance/order",
        { ids: catalog.assistance.map((x) => x.id).reverse() },
        "reorderAssistanceWithReceipt",
        [catalog.assistance.map((x) => x.id).reverse()],
        "catalog_snapshot",
      ],
    ];

    for (const [name, method, url, body, fn, args, resultKind] of cases) {
      const repo = new LocalCommercialCatalogRepository(
        new CommercialStorageCoordinator({ inMemoryOnly: true }),
      );
      const op = spec.paths[url][method];
      const payload = { expectedRevision: 0, ...(body as Record<string, unknown>) };

      const reqSchema = op.requestBody?.content?.["application/json"]?.schema;
      assert.ok(reqSchema, `Request schema must exist for ${name}`);
      const reqRes = validatePayloadAgainstSchema(reqSchema, payload, spec);
      assert.equal(
        reqRes.valid,
        true,
        `Request payload for ${name} must validate: ${JSON.stringify(reqRes.errors)}`,
      );

      // @ts-expect-error dynamic repository method execution
      const receipt = await repo[fn](...args);
      assert.equal(receipt.changed, true, `Mutation ${name} must report changed: true`);

      const result = receipt.result.catalog
        ? { ...receipt.result, catalog: sourceCatalogToWire(receipt.result.catalog) }
        : receipt.result;

      if (resultKind === "catalog_snapshot") {
        assert.ok("catalog" in result, `${name} result must contain catalog snapshot`);
        assert.equal(typeof result.revision, "number", `${name} result must have numeric revision`);
      } else {
        assert.ok("id" in result, `${name} result must contain option id`);
        assert.ok("label" in result, `${name} result must contain option label`);
      }

      const status = method === "post" ? "201" : "200";
      const respSchema = op.responses[status]?.content?.["application/json"]?.schema;
      assert.ok(respSchema, `Response schema must exist for ${name}`);

      const response = {
        success: true,
        data: { changed: receipt.changed, result },
        meta: {
          requestId: "e9f0d1a2-3b4c-5d6e-7f8a-9b0c1d2e3f4a",
          timestamp: "2026-10-08T19:00:00Z",
        },
      };

      const respRes = validatePayloadAgainstSchema(respSchema, response, spec);
      assert.equal(
        respRes.valid,
        true,
        `Response for ${name} must validate against schema: ${JSON.stringify(respRes.errors)}`,
      );
    }
  });

  it("genuine source no-op receipts for commercial operations validate against OpenAPI response schemas", async () => {
    const repo = new LocalCommercialCatalogRepository(
      new CommercialStorageCoordinator({ inMemoryOnly: true }),
    );

    // 1. No-op fare update: set same multiplier
    const fareReceipt1 = await repo.updateFareWithReceipt("classic", { multiplier: 1.3 });
    assert.equal(fareReceipt1.changed, true);
    const fareReceipt2 = await repo.updateFareWithReceipt("classic", { multiplier: 1.3 });
    assert.equal(fareReceipt2.changed, false, "Second identical update must report changed: false");

    const fareNoOpResponse = {
      success: true,
      data: {
        changed: false,
        result: {
          ...fareReceipt2.result,
          catalog: sourceCatalogToWire(fareReceipt2.result.catalog),
        },
      },
      meta: {
        requestId: "e9f0d1a2-3b4c-5d6e-7f8a-9b0c1d2e3f4b",
        timestamp: "2026-10-08T19:01:00Z",
      },
    };
    const fareOp = spec.paths["/admin/commercial/fares/{id}"].patch;
    const fareRes = validatePayloadAgainstSchema(
      fareOp.responses["200"].content["application/json"].schema,
      fareNoOpResponse,
      spec,
    );
    assert.equal(
      fareRes.valid,
      true,
      `No-op fare response must validate: ${JSON.stringify(fareRes.errors)}`,
    );

    // 2. No-op option update: set same active status
    const mealReceipt1 = await repo.updateMealWithReceipt("vegetarian", { active: true });
    assert.equal(
      mealReceipt1.changed,
      false,
      "Updating with existing values must report changed: false",
    );

    const mealNoOpResponse = {
      success: true,
      data: {
        changed: false,
        result: mealReceipt1.result,
      },
      meta: {
        requestId: "e9f0d1a2-3b4c-5d6e-7f8a-9b0c1d2e3f4c",
        timestamp: "2026-10-08T19:02:00Z",
      },
    };
    const mealOp = spec.paths["/admin/commercial/meals/{id}"].patch;
    const mealRes = validatePayloadAgainstSchema(
      mealOp.responses["200"].content["application/json"].schema,
      mealNoOpResponse,
      spec,
    );
    assert.equal(
      mealRes.valid,
      true,
      `No-op meal response must validate: ${JSON.stringify(mealRes.errors)}`,
    );
  });

  it("tamper proof: swapping receipt response family fails validation", () => {
    // A catalog snapshot response envelope validated against CatalogOptionReceiptResponse schema must FAIL
    const catalogSnapshotResponse = {
      success: true,
      data: {
        changed: true,
        result: {
          revision: 1,
          catalog: sourceCatalogToWire(seedCommercialCatalog()),
        },
      },
      meta: {
        requestId: "e9f0d1a2-3b4c-5d6e-7f8a-9b0c1d2e3f4d",
        timestamp: "2026-10-08T19:03:00Z",
      },
    };
    const optionResponseSchema = spec.components?.schemas?.CatalogOptionReceiptResponse;
    const swapToOptionRes = validatePayloadAgainstSchema(
      optionResponseSchema,
      catalogSnapshotResponse,
      spec,
    );
    assert.equal(
      swapToOptionRes.valid,
      false,
      "Catalog snapshot response must fail CatalogOptionReceiptResponse schema",
    );

    // An option response envelope validated against CommercialCatalogReceiptResponse schema must FAIL
    const optionResponse = {
      success: true,
      data: {
        changed: true,
        result: {
          id: "vegetarian",
          label: { en: "Vegetarian", ar: "نباتي" },
          active: true,
          order: 1,
        },
      },
      meta: {
        requestId: "e9f0d1a2-3b4c-5d6e-7f8a-9b0c1d2e3f4e",
        timestamp: "2026-10-08T19:04:00Z",
      },
    };
    const catalogResponseSchema = spec.components?.schemas?.CommercialCatalogReceiptResponse;
    const swapToCatalogRes = validatePayloadAgainstSchema(
      catalogResponseSchema,
      optionResponse,
      spec,
    );
    assert.equal(
      swapToCatalogRes.valid,
      false,
      "Option response must fail CommercialCatalogReceiptResponse schema",
    );
  });

  it("contextual semantic invariants: validates updateFare rules", () => {
    const catalog = seedCommercialCatalog();

    const validCmd = { expectedRevision: 1, id: "classic", patch: { multiplier: 1.4 } };
    assert.equal(
      validateCommercialCommandSemanticInvariants(catalog, "updateFare", validCmd).valid,
      true,
    );

    assert.equal(
      validateCommercialCommandSemanticInvariants(catalog, "updateFare", {
        id: "classic",
        patch: { multiplier: 1.4 },
      }).valid,
      false,
    );
    assert.equal(
      validateCommercialCommandSemanticInvariants(catalog, "updateFare", {
        expectedRevision: 1,
        id: "classic",
        patch: { id: "tampered" },
      }).valid,
      false,
    );
    assert.equal(
      validateCommercialCommandSemanticInvariants(catalog, "updateFare", {
        expectedRevision: 1,
        id: "essential",
        patch: { multiplier: 1.5 },
      }).valid,
      false,
    );
    assert.equal(
      validateCommercialCommandSemanticInvariants(catalog, "updateFare", {
        expectedRevision: 1,
        id: "classic",
        patch: { multiplier: 9.0 },
      }).valid,
      false,
    );
    assert.equal(
      validateCommercialCommandSemanticInvariants(catalog, "updateFare", {
        expectedRevision: 1,
        id: "unknown_fare",
        patch: {},
      }).valid,
      false,
    );
  });

  it("contextual semantic invariants: validates updateCabinPricing rules", () => {
    const catalog = seedCommercialCatalog();

    assert.equal(
      validateCommercialCommandSemanticInvariants(catalog, "updateCabinPricing", {
        expectedRevision: 1,
        id: "business",
        patch: { multiplier: 2.8 },
      }).valid,
      true,
    );
    assert.equal(
      validateCommercialCommandSemanticInvariants(catalog, "updateCabinPricing", {
        expectedRevision: 1,
        id: "economy",
        patch: { multiplier: 1.2 },
      }).valid,
      false,
    );
    assert.equal(
      validateCommercialCommandSemanticInvariants(catalog, "updateCabinPricing", {
        expectedRevision: 1,
        id: "business",
        patch: { id: "first" },
      }).valid,
      false,
    );
  });

  it("contextual semantic invariants: validates updateBaggage rules", () => {
    const catalog = seedCommercialCatalog();

    assert.equal(
      validateCommercialCommandSemanticInvariants(catalog, "updateBaggage", {
        expectedRevision: 1,
        patch: { extraBagPriceMinor: 4000 },
      }).valid,
      true,
    );
    assert.equal(
      validateCommercialCommandSemanticInvariants(catalog, "updateBaggage", {
        expectedRevision: 1,
        patch: { extraBagPriceMinor: -100 },
      }).valid,
      false,
    );
    assert.equal(
      validateCommercialCommandSemanticInvariants(catalog, "updateBaggage", {
        expectedRevision: 1,
        patch: { extraBagPriceMinor: 35.5 },
      }).valid,
      false,
    );
  });

  it("contextual semantic invariants: validates meal and assistance option rules", () => {
    const catalog = seedCommercialCatalog();

    const validMeal = {
      expectedRevision: 1,
      option: {
        id: "gluten_free",
        label: { en: "Gluten Free", ar: "خالٍ من الغلوتين" },
        active: true,
        order: 4,
      },
    };
    assert.equal(
      validateCommercialCommandSemanticInvariants(catalog, "createMeal", validMeal).valid,
      true,
    );

    const badMeal = {
      expectedRevision: 1,
      option: {
        id: "gourmet",
        label: { en: "Gourmet", ar: "فاخر" },
        active: true,
        order: 4,
        price: 50,
      },
    };
    assert.equal(
      validateCommercialCommandSemanticInvariants(catalog, "createMeal", badMeal).valid,
      false,
    );

    assert.equal(
      validateCommercialCommandSemanticInvariants(catalog, "updateMeal", {
        expectedRevision: 1,
        id: "standard",
        patch: { id: "tampered" },
      }).valid,
      false,
    );
    assert.equal(
      validateCommercialCommandSemanticInvariants(catalog, "updateMeal", {
        expectedRevision: 1,
        id: "standard",
        patch: { currency: "USD" },
      }).valid,
      false,
    );

    const mealIds = catalog.meals.map((m) => m.id);
    assert.equal(
      validateCommercialCommandSemanticInvariants(catalog, "reorderMeals", {
        expectedRevision: 1,
        ids: [...mealIds].reverse(),
      }).valid,
      true,
    );
    assert.equal(
      validateCommercialCommandSemanticInvariants(catalog, "reorderMeals", {
        expectedRevision: 1,
        ids: [mealIds[0], mealIds[0], mealIds[1], mealIds[2]],
      }).valid,
      false,
    );
    assert.equal(
      validateCommercialCommandSemanticInvariants(catalog, "reorderMeals", {
        expectedRevision: 1,
        ids: [mealIds[0], mealIds[1]],
      }).valid,
      false,
    );
    assert.equal(
      validateCommercialCommandSemanticInvariants(catalog, "reorderMeals", {
        expectedRevision: 1,
        ids: [mealIds[0], mealIds[1], mealIds[2], "foreign_id"],
      }).valid,
      false,
    );

    assert.equal(
      validateCommercialCommandSemanticInvariants(catalog, "setDefaultMeal", {
        expectedRevision: 1,
        id: "vegetarian",
      }).valid,
      true,
    );
    assert.equal(
      validateCommercialCommandSemanticInvariants(catalog, "setDefaultMeal", {
        expectedRevision: 1,
        id: "nonexistent",
      }).valid,
      false,
    );

    const catalogWithInactiveMeal = structuredClone(catalog);
    catalogWithInactiveMeal.meals.find(
      (m: { id: string; active: boolean }) => m.id === "diabetic",
    )!.active = false;
    assert.equal(
      validateCommercialCommandSemanticInvariants(catalogWithInactiveMeal, "setDefaultMeal", {
        expectedRevision: 1,
        id: "diabetic",
      }).valid,
      false,
    );
  });

  it("contextual semantic invariants: rejects deactivating current default meal", () => {
    const catalog = seedCommercialCatalog();
    assert.equal(catalog.defaultMealId, "standard");

    // Deactivating current default meal directly must fail
    const retireDefaultCmd = {
      expectedRevision: 0,
      id: "standard",
      patch: { active: false },
    };
    const failRes = validateCommercialCommandSemanticInvariants(
      catalog,
      "updateMeal",
      retireDefaultCmd,
    );
    assert.equal(failRes.valid, false, "Must reject deactivating current default meal");
    assert.ok(failRes.errors.some((e) => e.includes("Cannot deactivate the current default meal")));

    // Changing default meal first to another active meal across revisions, then retiring standard, succeeds
    const setDefaultCmd = {
      expectedRevision: 0,
      id: "vegetarian",
    };
    const setRes = validateCommercialCommandSemanticInvariants(
      catalog,
      "setDefaultMeal",
      setDefaultCmd,
    );
    assert.equal(setRes.valid, true);

    const simulatedCatalog = structuredClone(catalog);
    simulatedCatalog.defaultMealId = "vegetarian";

    const retireFormerDefaultCmd = {
      expectedRevision: 1,
      id: "standard",
      patch: { active: false },
    };
    const retireRes = validateCommercialCommandSemanticInvariants(
      simulatedCatalog,
      "updateMeal",
      retireFormerDefaultCmd,
    );
    assert.equal(
      retireRes.valid,
      true,
      "Retiring former default after setting new active default must succeed",
    );
  });

  it("money adapter: minorToMajorUsd rejects unsafe integers (Number.MAX_SAFE_INTEGER + 1)", () => {
    assert.throws(
      () => minorToMajorUsd(Number.MAX_SAFE_INTEGER + 1),
      /Invalid USD minor amount: must be a safe integer/,
      "minorToMajorUsd must reject Number.MAX_SAFE_INTEGER + 1",
    );
  });

  it("commercial catalog adapter: wireCatalogToSource rejects unsupported baggage currency", () => {
    const validWire = sourceCatalogToWire(seedCommercialCatalog());
    const badCurrencyWire = {
      ...validWire,
      baggage: {
        ...validWire.baggage,
        currency: "EUR",
      },
    };
    assert.throws(
      () => wireCatalogToSource(badCurrencyWire),
      /Unsupported baggage currency: expected 'USD', got 'EUR'/,
      "wireCatalogToSource must reject non-USD currency",
    );
  });

  it("public active-only catalog projection excludes inactive items while admin retains full catalog", () => {
    const source = seedCommercialCatalog();
    // Mark one fare, one non-default meal, and one assistance option as inactive
    source.fares.find((f) => f.id === "flex")!.active = false;
    source.meals.find((m) => m.id === "diabetic")!.active = false;
    source.assistance.find((a) => a.id === "visual")!.active = false;

    // Public projection
    const publicWire = projectPublicCommercialCatalog(source);
    assert.equal(
      publicWire.fares.some((f) => f.id === "flex"),
      false,
      "Public projection must exclude inactive fare",
    );
    assert.equal(
      publicWire.meals.some((m) => m.id === "diabetic"),
      false,
      "Public projection must exclude inactive meal",
    );
    assert.equal(
      publicWire.assistance.some((a) => a.id === "visual"),
      false,
      "Public projection must exclude inactive assistance",
    );
    assert.ok(
      publicWire.fares.every((f) => f.active === true),
      "All public fares must have active: true",
    );
    assert.ok(
      publicWire.meals.every((m) => m.active === true),
      "All public meals must have active: true",
    );
    assert.ok(
      publicWire.assistance.every((a) => a.active === true),
      "All public assistance must have active: true",
    );
    assert.equal(publicWire.defaultMealId, source.defaultMealId);

    // Source catalog is not mutated
    assert.equal(source.fares.find((f) => f.id === "flex")!.active, false);
    assert.equal(source.meals.find((m) => m.id === "diabetic")!.active, false);

    // Public projection validates against PublicCommercialCatalogSnapshotResponse
    const publicSnapshotResponse = {
      success: true,
      data: {
        revision: 0,
        catalog: publicWire,
      },
      meta: {
        requestId: "e9f0d1a2-3b4c-5d6e-7f8a-9b0c1d2e3f4f",
        timestamp: "2026-10-08T19:05:00Z",
      },
    };
    const publicOp = spec.paths["/commercial/catalog"].get;
    const pubRes = validatePayloadAgainstSchema(
      publicOp.responses["200"].content["application/json"].schema,
      publicSnapshotResponse,
      spec,
    );
    assert.equal(
      pubRes.valid,
      true,
      `Public catalog must validate against public schema: ${JSON.stringify(pubRes.errors)}`,
    );

    // Admin full wire retains inactive items
    const adminWire = sourceCatalogToWire(source);
    assert.equal(
      adminWire.fares.some((f) => f.id === "flex"),
      true,
      "Admin catalog must retain inactive fare",
    );
    assert.equal(
      adminWire.meals.some((m) => m.id === "diabetic"),
      true,
      "Admin catalog must retain inactive meal",
    );
    assert.equal(
      adminWire.assistance.some((a) => a.id === "visual"),
      true,
      "Admin catalog must retain inactive assistance",
    );

    const adminSnapshotResponse = {
      success: true,
      data: {
        revision: 0,
        catalog: adminWire,
      },
      meta: {
        requestId: "e9f0d1a2-3b4c-5d6e-7f8a-9b0c1d2e3f50",
        timestamp: "2026-10-08T19:06:00Z",
      },
    };
    const adminOp = spec.paths["/admin/commercial/catalog"].get;
    const adminRes = validatePayloadAgainstSchema(
      adminOp.responses["200"].content["application/json"].schema,
      adminSnapshotResponse,
      spec,
    );
    assert.equal(
      adminRes.valid,
      true,
      `Admin catalog must validate against admin schema: ${JSON.stringify(adminRes.errors)}`,
    );

    // Invariant: public projection throws if default meal is inactive
    const corruptSource = structuredClone(source);
    corruptSource.meals.find((m) => m.id === corruptSource.defaultMealId)!.active = false;
    assert.throws(
      () => projectPublicCommercialCatalog(corruptSource),
      /default meal 'standard' is not among active meals/,
      "projectPublicCommercialCatalog must throw if default meal is not active",
    );
  });
});

describe("Phase 12: Passenger Profile & Saved Traveler Contracts & Semantic Invariants", () => {
  const spec: OpenApiDocument = JSON.parse(fs.readFileSync(openapiPath, "utf-8"));

  it("passenger profile and saved travelers wire adapters lossless translation", () => {
    const account = {
      email: "fatima@palestine.example",
      firstName: "Fatima",
      lastName: "Al-Masri",
      phone: "+970 59 123 4567",
      seatPreference: "window",
      mealPreference: "vegetarian",
      newsletter: true,
    };
    const wireAccount = sourceAccountToWire(account);
    assert.deepEqual(wireAccount, account);

    const wireProfileSchema = spec.components?.schemas?.PassengerProfileDto;
    assert.ok(wireProfileSchema);
    const accRes = validatePayloadAgainstSchema(wireProfileSchema, wireAccount, spec);
    assert.equal(
      accRes.valid,
      true,
      `Wire account must validate: ${JSON.stringify(accRes.errors)}`,
    );

    const traveler = {
      id: "trv-test-opaque-id-001",
      firstName: "Ahmed",
      lastName: "Al-Masri",
      dob: "1992-06-15",
      nationality: "Palestinian",
      document: "P12345678",
    };
    const wireTraveler = sourceTravelerToWire(traveler);
    assert.deepEqual(wireTraveler, traveler);

    const wireTravelerSchema = spec.components?.schemas?.TravelerDto;
    assert.ok(wireTravelerSchema);
    const trvRes = validatePayloadAgainstSchema(wireTravelerSchema, wireTraveler, spec);
    assert.equal(
      trvRes.valid,
      true,
      `Wire traveler must validate: ${JSON.stringify(trvRes.errors)}`,
    );
  });

  it("real source passenger mutations validate against OpenAPI request and response schemas", async () => {
    const commercialRepo = new LocalCommercialCatalogRepository(
      new CommercialStorageCoordinator({ inMemoryOnly: true }),
    );
    const passengerCoord = new PassengerStorageCoordinator({ inMemoryOnly: true });
    const passengerRepo = new LocalPassengerRepository(passengerCoord, commercialRepo);

    // Initial sign in / seed account
    const initialAccount = await passengerRepo.signIn(
      "fatima@palestine.example",
      "Fatima",
      "Al-Masri",
    );
    assert.equal(initialAccount.email, "fatima@palestine.example");

    // 1. GET /auth/passenger/profile -> getAccount
    const currentAccount = await passengerRepo.getAccount();
    assert.ok(currentAccount);
    const profileOp = spec.paths["/auth/passenger/profile"].get;
    const profileResponse = {
      success: true,
      data: sourceAccountToWire(currentAccount),
      meta: {
        requestId: "e9f0d1a2-3b4c-5d6e-7f8a-9b0c1d2e3f51",
        timestamp: "2026-10-08T19:10:00Z",
      },
    };
    const getProfRes = validatePayloadAgainstSchema(
      profileOp.responses["200"].content["application/json"].schema,
      profileResponse,
      spec,
    );
    assert.equal(
      getProfRes.valid,
      true,
      `GET profile response must validate: ${JSON.stringify(getProfRes.errors)}`,
    );

    // 2. PUT /auth/passenger/profile -> updateAccountWithReceipt
    const putProfileOp = spec.paths["/auth/passenger/profile"].put;
    const patchPayload = {
      seatPreference: "aisle",
      mealPreference: "vegetarian",
      newsletter: true,
    };
    const patchReqRes = validatePayloadAgainstSchema(
      putProfileOp.requestBody.content["application/json"].schema,
      patchPayload,
      spec,
    );
    assert.equal(
      patchReqRes.valid,
      true,
      `PUT profile request must validate: ${JSON.stringify(patchReqRes.errors)}`,
    );

    const updateReceipt = await passengerRepo.updateAccountWithReceipt(
      wireAccountPatchToSource(patchPayload),
    );
    assert.equal(updateReceipt.changed, true, "Profile update must report changed: true");
    assert.equal(updateReceipt.account?.seatPreference, "aisle");
    assert.equal(updateReceipt.account?.mealPreference, "vegetarian");

    const updateResponse = {
      success: true,
      data: adaptAccountMutationReceiptToWire(updateReceipt),
      meta: {
        requestId: "e9f0d1a2-3b4c-5d6e-7f8a-9b0c1d2e3f52",
        timestamp: "2026-10-08T19:11:00Z",
      },
    };
    const putProfRespRes = validatePayloadAgainstSchema(
      putProfileOp.responses["200"].content["application/json"].schema,
      updateResponse,
      spec,
    );
    assert.equal(
      putProfRespRes.valid,
      true,
      `PUT profile response must validate: ${JSON.stringify(putProfRespRes.errors)}`,
    );

    // 2b. No-op profile update
    const noopReceipt = await passengerRepo.updateAccountWithReceipt(
      wireAccountPatchToSource(patchPayload),
    );
    assert.equal(noopReceipt.changed, false, "Identical profile update must report changed: false");
    const noopResponse = {
      success: true,
      data: adaptAccountMutationReceiptToWire(noopReceipt),
      meta: {
        requestId: "e9f0d1a2-3b4c-5d6e-7f8a-9b0c1d2e3f53",
        timestamp: "2026-10-08T19:12:00Z",
      },
    };
    const noopProfRespRes = validatePayloadAgainstSchema(
      putProfileOp.responses["200"].content["application/json"].schema,
      noopResponse,
      spec,
    );
    assert.equal(
      noopProfRespRes.valid,
      true,
      `No-op profile response must validate: ${JSON.stringify(noopProfRespRes.errors)}`,
    );

    // 3. POST /auth/passenger/travelers -> addTraveler
    const postTravelerOp = spec.paths["/auth/passenger/travelers"].post;
    const travelerPayload = {
      firstName: "Tariq",
      lastName: "Al-Masri",
      dob: "2000-01-20",
      nationality: "Palestinian",
      document: "P87654321",
    };
    const postTrvReqRes = validatePayloadAgainstSchema(
      postTravelerOp.requestBody.content["application/json"].schema,
      travelerPayload,
      spec,
    );
    assert.equal(
      postTrvReqRes.valid,
      true,
      `POST traveler request must validate: ${JSON.stringify(postTrvReqRes.errors)}`,
    );

    const createdTraveler = await passengerRepo.addTraveler(wireTravelerToSource(travelerPayload));
    assert.ok(
      createdTraveler.id.startsWith("trv-"),
      `Traveler ID must start with trv- prefix: ${createdTraveler.id}`,
    );
    assert.equal(createdTraveler.nationality, "Palestinian");

    const createTravelerResponse = {
      success: true,
      data: sourceTravelerToWire(createdTraveler),
      meta: {
        requestId: "e9f0d1a2-3b4c-5d6e-7f8a-9b0c1d2e3f54",
        timestamp: "2026-10-08T19:13:00Z",
      },
    };
    const postTrvRespRes = validatePayloadAgainstSchema(
      postTravelerOp.responses["201"].content["application/json"].schema,
      createTravelerResponse,
      spec,
    );
    assert.equal(
      postTrvRespRes.valid,
      true,
      `POST traveler response must validate: ${JSON.stringify(postTrvRespRes.errors)}`,
    );

    // 3b. Single-name traveler and empty DOB/document
    const singleNamePayload = {
      firstName: "Kareem",
      lastName: "",
      dob: "",
      nationality: "Palestinian",
      document: "",
    };
    const singleNameTrv = await passengerRepo.addTraveler(wireTravelerToSource(singleNamePayload));
    assert.equal(singleNameTrv.firstName, "Kareem");
    assert.equal(singleNameTrv.lastName, "");
    assert.equal(singleNameTrv.dob, "");
    assert.equal(singleNameTrv.document, "");

    // 4. GET /auth/passenger/travelers -> listTravelers
    const getTravelersOp = spec.paths["/auth/passenger/travelers"].get;
    const travelersList = await passengerRepo.listTravelers();
    assert.equal(travelersList.length, 2);

    const listTravelersResponse = {
      success: true,
      data: travelersList.map(sourceTravelerToWire),
      meta: {
        requestId: "e9f0d1a2-3b4c-5d6e-7f8a-9b0c1d2e3f55",
        timestamp: "2026-10-08T19:14:00Z",
      },
    };
    const getTrvListRes = validatePayloadAgainstSchema(
      getTravelersOp.responses["200"].content["application/json"].schema,
      listTravelersResponse,
      spec,
    );
    assert.equal(
      getTrvListRes.valid,
      true,
      `GET travelers list response must validate: ${JSON.stringify(getTrvListRes.errors)}`,
    );

    // 5. PATCH /auth/passenger/travelers/{id} -> updateTraveler
    const patchTravelerOp = spec.paths["/auth/passenger/travelers/{id}"].patch;
    const updateTrvPayload = {
      dob: "2000-01-21",
      document: "P99999999",
    };
    const patchTrvReqRes = validatePayloadAgainstSchema(
      patchTravelerOp.requestBody.content["application/json"].schema,
      updateTrvPayload,
      spec,
    );
    assert.equal(
      patchTrvReqRes.valid,
      true,
      `PATCH traveler request must validate: ${JSON.stringify(patchTrvReqRes.errors)}`,
    );

    const updatedTraveler = await passengerRepo.updateTraveler(
      createdTraveler.id,
      wireTravelerPatchToSource(updateTrvPayload),
    );
    assert.ok(updatedTraveler);
    assert.equal(
      updatedTraveler.id,
      createdTraveler.id,
      "Traveler ID must be immutable and preserved",
    );
    assert.equal(updatedTraveler.dob, "2000-01-21");
    assert.equal(updatedTraveler.document, "P99999999");

    const updateTravelerResponse = {
      success: true,
      data: sourceTravelerToWire(updatedTraveler),
      meta: {
        requestId: "e9f0d1a2-3b4c-5d6e-7f8a-9b0c1d2e3f56",
        timestamp: "2026-10-08T19:15:00Z",
      },
    };
    const patchTrvRespRes = validatePayloadAgainstSchema(
      patchTravelerOp.responses["200"].content["application/json"].schema,
      updateTravelerResponse,
      spec,
    );
    assert.equal(
      patchTrvRespRes.valid,
      true,
      `PATCH traveler response must validate: ${JSON.stringify(patchTrvRespRes.errors)}`,
    );

    // 6. DELETE /auth/passenger/travelers/{id} -> removeTraveler
    const deleteTravelerOp = spec.paths["/auth/passenger/travelers/{id}"].delete;
    const deleted = await passengerRepo.removeTraveler(createdTraveler.id);
    assert.equal(deleted, true);

    const deleteResponse = {
      success: true,
      data: { deleted: true },
      meta: {
        requestId: "e9f0d1a2-3b4c-5d6e-7f8a-9b0c1d2e3f57",
        timestamp: "2026-10-08T19:16:00Z",
      },
    };
    const delTrvRespRes = validatePayloadAgainstSchema(
      deleteTravelerOp.responses["200"].content["application/json"].schema,
      deleteResponse,
      spec,
    );
    assert.equal(
      delTrvRespRes.valid,
      true,
      `DELETE traveler response must validate: ${JSON.stringify(delTrvRespRes.errors)}`,
    );

    // 6b. No-op DELETE for already deleted traveler
    const deletedAgain = await passengerRepo.removeTraveler(createdTraveler.id);
    assert.equal(deletedAgain, false, "Second removal must report deleted: false");

    const deleteNoopResponse = {
      success: true,
      data: { deleted: false },
      meta: {
        requestId: "e9f0d1a2-3b4c-5d6e-7f8a-9b0c1d2e3f58",
        timestamp: "2026-10-08T19:17:00Z",
      },
    };
    const delNoopRespRes = validatePayloadAgainstSchema(
      deleteTravelerOp.responses["200"].content["application/json"].schema,
      deleteNoopResponse,
      spec,
    );
    assert.equal(
      delNoopRespRes.valid,
      true,
      `DELETE no-op response must validate: ${JSON.stringify(delNoopRespRes.errors)}`,
    );
  });

  it("passenger profile security & semantic invariants", () => {
    const commercialCatalog = seedCommercialCatalog();
    const currentAccount = {
      email: "samira@palestine.example",
      firstName: "Samira",
      lastName: "Odeh",
      phone: "+970 59 000 0000",
      seatPreference: "none",
      mealPreference: "retired_special_meal", // historical retired meal surviving
      newsletter: false,
    };

    // 1. Email cannot be modified (immutable)
    assert.throws(
      () => wireAccountPatchToSource({ email: "tampered@example.com", firstName: "Samira" }),
      /email is read-only/,
      "wireAccountPatchToSource must reject email injection",
    );
    const badEmailRes = validatePassengerProfilePatchSemanticInvariants(
      currentAccount,
      { email: "tampered@example.com" },
      commercialCatalog,
    );
    assert.equal(badEmailRes.valid, false);
    assert.ok(badEmailRes.errors.some((e) => e.includes("Email is read-only and immutable")));

    // 2. Identity identifiers cannot be injected
    assert.throws(
      () => wireAccountPatchToSource({ id: "hacked", userId: "hacked" }),
      /security identifiers cannot be injected/,
      "wireAccountPatchToSource must reject id/userId injection",
    );

    // 3. Invalid seat preference rejected
    assert.throws(
      () => wireAccountPatchToSource({ seatPreference: "pilot_seat" }),
      /Invalid seatPreference/,
      "wireAccountPatchToSource must reject invalid seat preference",
    );

    // 4a. Changed meal preference requires authoritative commercial catalog context
    const noCatalogRes = validatePassengerProfilePatchSemanticInvariants(
      currentAccount,
      { mealPreference: "vegetarian" },
      null,
    );
    assert.equal(noCatalogRes.valid, false);
    assert.ok(
      noCatalogRes.errors.some((e) =>
        e.includes("Authoritative commercial catalog context is required"),
      ),
    );

    // 4b. Changed meal preference must be active catalog option
    const badChangedMealRes = validatePassengerProfilePatchSemanticInvariants(
      currentAccount,
      { mealPreference: "nonexistent_meal" },
      commercialCatalog,
    );
    assert.equal(badChangedMealRes.valid, false);
    assert.ok(
      badChangedMealRes.errors.some((e) => e.includes("not an active commercial catalog option")),
    );

    const goodChangedMealRes = validatePassengerProfilePatchSemanticInvariants(
      currentAccount,
      { mealPreference: "vegetarian" },
      commercialCatalog,
    );
    assert.equal(goodChangedMealRes.valid, true, "Active meal preference must pass");

    // 4c. Operation schema and context helper validate the SAME actual PUT request specimen
    const putProfileOp = spec.paths["/auth/passenger/profile"].put;
    const genuineMealSpecimen = { mealPreference: "vegetarian", seatPreference: "window" };
    const schemaMealRes = validatePayloadAgainstSchema(
      putProfileOp.requestBody.content["application/json"].schema,
      genuineMealSpecimen,
      spec,
    );
    assert.equal(
      schemaMealRes.valid,
      true,
      "PUT /auth/passenger/profile schema must validate genuine specimen",
    );
    const semanticSpecimenRes = validatePassengerProfilePatchSemanticInvariants(
      currentAccount,
      genuineMealSpecimen,
      commercialCatalog,
    );
    assert.equal(semanticSpecimenRes.valid, true, "Context helper must validate genuine specimen");

    // 5. Unchanged retired meal preference survives without catalog
    const unchangedRetiredMealRes = validatePassengerProfilePatchSemanticInvariants(
      currentAccount,
      { mealPreference: "retired_special_meal", seatPreference: "window" },
      null,
    );
    assert.equal(
      unchangedRetiredMealRes.valid,
      true,
      "Unchanged retired meal preference must survive without catalog",
    );
  });

  it("traveler semantic invariants", async () => {
    // 1. At least one non-empty name required on creation
    assert.throws(
      () => wireTravelerToSource({ firstName: "", lastName: "", nationality: "Palestinian" }),
      /at least one non-empty firstName or lastName/,
    );
    const noNameRes = validateTravelerSemanticInvariants({ firstName: "   ", lastName: "" });
    assert.equal(noNameRes.valid, false);
    assert.ok(
      noNameRes.errors.some((e) => e.includes("at least one non-empty firstName or lastName")),
    );

    // Single first name passes
    assert.equal(
      validateTravelerSemanticInvariants({ firstName: "Yousef", lastName: "" }).valid,
      true,
    );
    // Single last name passes
    assert.equal(
      validateTravelerSemanticInvariants({ firstName: "", lastName: "Al-Khalidi" }).valid,
      true,
    );

    // 2. Nationality display text passes without 2..3-letter limit
    assert.equal(
      validateTravelerSemanticInvariants({ firstName: "Salma", nationality: "Palestinian" }).valid,
      true,
    );

    // 3. Empty DOB passes, valid ISO date passes, invalid date fails
    assert.equal(validateTravelerSemanticInvariants({ firstName: "Salma", dob: "" }).valid, true);
    assert.equal(
      validateTravelerSemanticInvariants({ firstName: "Salma", dob: "1998-11-23" }).valid,
      true,
    );
    const badDobRes = validateTravelerSemanticInvariants({ firstName: "Salma", dob: "2026-02-30" });
    assert.equal(badDobRes.valid, false);
    assert.ok(badDobRes.errors.some((e) => e.includes("Invalid ISO calendar date for dob")));

    // 4. Conflicting aliases rejected
    const aliasRes = validateTravelerSemanticInvariants({
      firstName: "Salma",
      dateOfBirth: "1998-11-23",
      passportNumber: "P123456",
      passportExpiry: "2030-01-01",
    });
    assert.equal(aliasRes.valid, false);
    assert.ok(aliasRes.errors.some((e) => e.includes("Conflicting alias 'dateOfBirth'")));
    assert.ok(aliasRes.errors.some((e) => e.includes("Conflicting alias 'passport'")));
    assert.ok(aliasRes.errors.some((e) => e.includes("Fabricated field 'passportExpiry'")));

    // 5. Traveler patch cannot modify id
    assert.throws(
      () => wireTravelerPatchToSource({ id: "tampered-id", firstName: "NewName" }),
      /Traveler id is immutable/,
    );
    const badPatchRes = validateTravelerSemanticInvariants(
      { id: "tampered-id", firstName: "NewName" },
      true,
    );
    assert.equal(badPatchRes.valid, false);
    assert.ok(badPatchRes.errors.some((e) => e.includes("Traveler id is immutable")));

    // 6. Traveler PATCH requires owner-scoped current-record context for name changes
    const patchMissingContext = validateTravelerSemanticInvariants({ firstName: "Layla" }, true);
    assert.equal(patchMissingContext.valid, false);
    assert.ok(
      patchMissingContext.errors.some((e) => e.includes("Current traveler context is required")),
    );

    // 7. Merging with current traveler:
    const currentTrav = {
      id: "trv-01",
      firstName: "Salma",
      lastName: "Al-Khalidi",
      nationality: "Palestinian",
    };
    // Clearing one side while other remains non-empty passes
    const clearFirstRes = validateTravelerSemanticInvariants({ firstName: "" }, true, currentTrav);
    assert.equal(
      clearFirstRes.valid,
      true,
      "Clearing firstName passes if lastName remains non-empty",
    );

    // Clearing both names fails
    const clearBothRes = validateTravelerSemanticInvariants(
      { firstName: "", lastName: "" },
      true,
      currentTrav,
    );
    assert.equal(clearBothRes.valid, false);
    assert.ok(
      clearBothRes.errors.some((e) => e.includes("Traveler must have at least one non-empty name")),
    );

    // Whitespace names fail
    const wsNamesRes = validateTravelerSemanticInvariants(
      { firstName: "   ", lastName: "   " },
      true,
      currentTrav,
    );
    assert.equal(wsNamesRes.valid, false);
    assert.ok(
      wsNamesRes.errors.some((e) => e.includes("Traveler must have at least one non-empty name")),
    );

    // Unrelated patch preserves single-name traveler without requiring name context
    const singleNameTrav = {
      id: "trv-02",
      firstName: "Yousef",
      lastName: "",
      nationality: "Palestinian",
    };
    const unrelatedPatchRes = validateTravelerSemanticInvariants(
      { dob: "1995-05-15" },
      true,
      singleNameTrav,
    );
    assert.equal(unrelatedPatchRes.valid, true, "Unrelated patch preserves single-name traveler");

    // 8. Source sanitizer hazard proof:
    // When an invalid command gate rejects a nameless patch before calling source mutation,
    // the stored traveler record in LocalPassengerRepository survives intact with its original identity and name.
    const passengerCoord = new PassengerStorageCoordinator({ inMemoryOnly: true });
    const pRepo = new LocalPassengerRepository(passengerCoord);
    const storedTrav = await pRepo.addTraveler({
      firstName: "Tariq",
      lastName: "Nasser",
      nationality: "Palestinian",
    });
    assert.ok(storedTrav);
    assert.equal(storedTrav.firstName, "Tariq");

    // Attempt invalid nameless patch: command gate catches it
    const invalidCommand = { firstName: "", lastName: "" };
    const gateCheck = validateTravelerSemanticInvariants(invalidCommand, true, storedTrav);
    assert.equal(gateCheck.valid, false, "Command gate must reject nameless patch");

    // Because gate failed, source mutation is NOT invoked; verify stored record is intact
    const fetchedTrav = (await pRepo.listTravelers()).find((t) => t.id === storedTrav.id);
    assert.ok(fetchedTrav, "Stored traveler must survive intact");
    assert.equal(fetchedTrav.firstName, "Tariq");
    assert.equal(fetchedTrav.lastName, "Nasser");

    // 9. Paired schema vs semantic DOB calendar check
    // Schema regex matches well-formed date strings (like 2026-02-30), but semantic helper enforces calendar validity.
    const patchTravOp = spec.paths["/auth/passenger/travelers/{id}"].patch;
    const invalidDobPayload = { dob: "2026-02-30" };
    const patchSchemaDobRes = validatePayloadAgainstSchema(
      patchTravOp.requestBody.content["application/json"].schema,
      invalidDobPayload,
      spec,
    );
    assert.equal(
      patchSchemaDobRes.valid,
      true,
      "Schema format:date allows syntactically well-formed date strings",
    );
    const semanticDobRes = validateTravelerSemanticInvariants(invalidDobPayload, true, storedTrav);
    assert.equal(
      semanticDobRes.valid,
      false,
      "Semantic validator must reject impossible calendar date",
    );
    assert.ok(semanticDobRes.errors.some((e) => e.includes("Invalid ISO calendar date for dob")));
  });
});

describe("Phase 12: Operation Specimen Gates & Exact Family Tamper Rejection (R9.2)", () => {
  const spec: OpenApiDocument = JSON.parse(fs.readFileSync(openapiPath, "utf-8"));
  const expectationsPath = path.resolve(
    import.meta.dirname,
    "../../tests/fixtures/backend-contracts/source-expectations.json",
  );
  const expectations = JSON.parse(fs.readFileSync(expectationsPath, "utf-8"));

  it("verifies operation specimens across all 25 mutation families against actual OpenAPI schemas", () => {
    assert.equal(
      expectations.mutationFamilies.length,
      25,
      "Must define exactly 25 mutation families",
    );
    for (const fam of expectations.mutationFamilies) {
      const specimen = (MUTATION_SPECIMENS as Record<string, unknown>)[fam.name];
      assert.ok(specimen, `Specimen must exist for family '${fam.name}'`);
      const res = verifyOperationSpecimen(spec, fam, specimen);
      assert.ok(
        res.valid,
        `Specimen for family '${fam.name}' must validate against schemas: ${JSON.stringify(res.errors)}`,
      );
    }
  });

  it("verifies exact receipt family tamper rejection across all 25 mutation families", () => {
    for (const fam of expectations.mutationFamilies) {
      const foreignResponse =
        fam.domain === "commercial"
          ? (MUTATION_SPECIMENS as Record<string, { response: unknown }>).saveContactDraft.response
          : (MUTATION_SPECIMENS as Record<string, { response: unknown }>).updateFare.response;
      const res = verifyTamperedResponseRejected(spec, fam, foreignResponse);
      assert.ok(
        res.rejected,
        `Tampered receipt for family '${fam.name}' must be rejected by response schema: ${JSON.stringify(res.errors)}`,
      );
    }
  });

  it("reproduces CLI gate: exits nonzero when expectations fixture is corrupted", () => {
    const scratchDir = path.resolve(import.meta.dirname, "../../scratch/cli-test-fixture");
    fs.mkdirSync(scratchDir, { recursive: true });
    const corruptExpectations = {
      version: "1.2.0",
      description: "Corrupted test fixture",
      mutationFamilies: [{ family: "corrupted_family", operationId: "nonexistentOperationId" }],
    };
    const corruptPath = path.join(scratchDir, "corrupted-expectations.json");
    fs.writeFileSync(corruptPath, JSON.stringify(corruptExpectations, null, 2));

    try {
      const validatorScript = path.resolve(
        import.meta.dirname,
        "../../scripts/validate-backend-contracts.mjs",
      );
      assert.throws(
        () => {
          execFileSync(process.execPath, [validatorScript, docsBackendDir, corruptPath], {
            encoding: "utf-8",
            stdio: "pipe",
          });
        },
        (err: unknown) => {
          const execErr = err as { status?: number; stdout?: string; stderr?: string };
          assert.equal(execErr.status, 1, "CLI must exit with code 1 on corrupted expectations");
          const out = (execErr.stdout || "") + (execErr.stderr || "");
          assert.ok(
            !out.includes("All backend contracts and OpenAPI 3.1 specifications PASSED"),
            "CLI must not certify PASS on failure",
          );
          return true;
        },
      );
    } finally {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  it("verifies intact schema preserves sibling assertions (e.g. not: true) in verifyOperationSpecimen", () => {
    const contactDraftFam = expectations.mutationFamilies.find(
      (f: { name: string }) => f.name === "saveContactReplyDraft",
    );
    assert.ok(contactDraftFam, "saveContactReplyDraft family must exist");
    const specimen = (MUTATION_SPECIMENS as Record<string, unknown>).saveContactReplyDraft;

    // Test response schema sibling assertion { $ref: original, not: true }
    const mutatedSpecResponse = JSON.parse(JSON.stringify(spec));
    const origRespSchema =
      mutatedSpecResponse.paths["/admin/contact/inbox/{id}/reply-draft"].put.responses["200"]
        .content["application/json"].schema;
    mutatedSpecResponse.paths["/admin/contact/inbox/{id}/reply-draft"].put.responses["200"].content[
      "application/json"
    ].schema = {
      ...origRespSchema,
      not: true,
    };
    const resResponse = verifyOperationSpecimen(mutatedSpecResponse, contactDraftFam, specimen);
    assert.equal(
      resResponse.valid,
      false,
      "verifyOperationSpecimen must reject specimen when response schema has sibling not: true",
    );
    assert.ok(
      resResponse.errors.some((e: string) => e.includes("not: true") || e.includes("schema")),
    );

    // Test request schema sibling assertion { $ref: original, not: true }
    const mutatedSpecReq = JSON.parse(JSON.stringify(spec));
    const origReqSchema =
      mutatedSpecReq.paths["/admin/contact/inbox/{id}/reply-draft"].put.requestBody.content[
        "application/json"
      ].schema;
    mutatedSpecReq.paths["/admin/contact/inbox/{id}/reply-draft"].put.requestBody.content[
      "application/json"
    ].schema = {
      ...origReqSchema,
      not: true,
    };
    const resReq = verifyOperationSpecimen(mutatedSpecReq, contactDraftFam, specimen);
    assert.equal(
      resReq.valid,
      false,
      "verifyOperationSpecimen must reject specimen when request schema has sibling not: true",
    );
    assert.ok(resReq.errors.some((e: string) => e.includes("not: true") || e.includes("schema")));

    // Test verifyTamperedResponseRejected with sibling assertion
    const tamperedRes = verifyTamperedResponseRejected(
      mutatedSpecResponse,
      contactDraftFam,
      (specimen as { response: unknown }).response,
    );
    assert.equal(
      tamperedRes.rejected,
      true,
      "verifyTamperedResponseRejected must reject when schema asserts not: true",
    );
  });

  it("verifies operation response-schema substitution across receipt families fails verification", () => {
    // 1. Substitute saveCmsDraft response schema with SettingsDraftReceiptResponse
    const cmsFam = expectations.mutationFamilies.find(
      (f: { name: string }) => f.name === "saveCmsDraft",
    );
    assert.ok(cmsFam, "saveCmsDraft family must exist");
    const cmsSpecimen = (MUTATION_SPECIMENS as Record<string, unknown>).saveCmsDraft;
    const mutatedCmsSpec = JSON.parse(JSON.stringify(spec));
    mutatedCmsSpec.paths["/cms/documents/{slug}"].put.responses["200"].content[
      "application/json"
    ].schema = {
      $ref: "#/components/schemas/SettingsDraftReceiptResponse",
    };
    const resCms = verifyOperationSpecimen(mutatedCmsSpec, cmsFam, cmsSpecimen);
    assert.equal(
      resCms.valid,
      false,
      "Substituting CMS response schema with SettingsDraftReceiptResponse must fail verification",
    );

    // 2. Substitute createMeal response schema with ContactSubmissionReceiptResponse
    const mealFam = expectations.mutationFamilies.find(
      (f: { name: string }) => f.name === "createMeal",
    );
    assert.ok(mealFam, "createMeal family must exist");
    const mealSpecimen = (MUTATION_SPECIMENS as Record<string, unknown>).createMeal;
    const mutatedMealSpec = JSON.parse(JSON.stringify(spec));
    mutatedMealSpec.paths["/admin/commercial/meals"].post.responses["201"].content[
      "application/json"
    ].schema = {
      $ref: "#/components/schemas/ContactSubmissionReceiptResponse",
    };
    const resMeal = verifyOperationSpecimen(mutatedMealSpec, mealFam, mealSpecimen);
    assert.equal(
      resMeal.valid,
      false,
      "Substituting Meal response schema with ContactSubmissionReceiptResponse must fail verification",
    );

    // 3. Substitute createContactSubmission response schema with ContactMessageDetailResponse
    const contactFam = expectations.mutationFamilies.find(
      (f: { name: string }) => f.name === "createContactSubmission",
    );
    assert.ok(contactFam, "createContactSubmission family must exist");
    const contactSpecimen = (MUTATION_SPECIMENS as Record<string, unknown>).createContactSubmission;
    const mutatedContactSpec = JSON.parse(JSON.stringify(spec));
    mutatedContactSpec.paths["/contact"].post.responses["201"].content["application/json"].schema =
      {
        $ref: "#/components/schemas/ContactMessageDetailResponse",
      };
    const resContact = verifyOperationSpecimen(mutatedContactSpec, contactFam, contactSpecimen);
    assert.equal(
      resContact.valid,
      false,
      "Substituting Contact submission response schema with ContactMessageDetailResponse must fail verification",
    );
  });
});

describe("Phase 12: Site Settings & Appearance Draft Contracts (R9.3a)", () => {
  const spec: OpenApiDocument = JSON.parse(fs.readFileSync(openapiPath, "utf-8"));
  const policies: PolicyRegistry = JSON.parse(fs.readFileSync(policiesPath, "utf-8"));

  function createInMemoryStorage(): Storage {
    const store = new Map<string, string>();
    return {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size;
      },
    };
  }

  it("contact settings wire adapters and validation roundtrip", () => {
    const wire = sourceContactSettingsToWire(PUBLISHED_CONTACT_SETTINGS);
    const validation = validateContactSettingsWire(wire);
    assert.equal(
      validation.valid,
      true,
      `Published contact settings must validate: ${JSON.stringify(validation.errors)}`,
    );

    const source = wireContactSettingsToSource(wire);
    assert.equal(source.phone, PUBLISHED_CONTACT_SETTINGS.phone);
    assert.equal(source.email, PUBLISHED_CONTACT_SETTINGS.email);
    assert.equal(source.socialInstagram, PUBLISHED_CONTACT_SETTINGS.socialInstagram);

    // Negative validation probes
    const invalidPhoneRes = validateContactSettingsWire({ ...wire, phone: "abc" });
    assert.equal(invalidPhoneRes.valid, false);

    const invalidEmailRes = validateContactSettingsWire({ ...wire, email: "not-an-email" });
    assert.equal(invalidEmailRes.valid, false);

    const nonHttpsSocialRes = validateContactSettingsWire({
      ...wire,
      socialInstagram: "http://insecure.example.com",
    });
    assert.equal(nonHttpsSocialRes.valid, false);

    const forbiddenLinkedInRes = validateContactSettingsWire({
      ...wire,
      linkedIn: "https://linkedin.com/company/gza",
    });
    assert.equal(forbiddenLinkedInRes.valid, false);
    assert.ok(forbiddenLinkedInRes.errors.some((e) => e.toLowerCase().includes("linkedin")));
  });

  it("appearance settings wire adapters and validation roundtrip", () => {
    const wire = sourceAppearanceSettingsToWire(PUBLISHED_APPEARANCE_SETTINGS);
    const validation = validateAppearanceSettingsWire(wire);
    assert.equal(
      validation.valid,
      true,
      `Published appearance settings must validate: ${JSON.stringify(validation.errors)}`,
    );

    const source = wireAppearanceSettingsToSource(wire);
    assert.equal(source.publicCanvas.pattern, PUBLISHED_APPEARANCE_SETTINGS.publicCanvas.pattern);
    assert.equal(
      source.publicCanvas.intensity,
      PUBLISHED_APPEARANCE_SETTINGS.publicCanvas.intensity,
    );

    // Alias canonicalization: gza-geometric canonicalizes to pie-factory
    assert.equal(canonicalPatternId("gza-geometric"), "pie-factory");
    const aliasWire = {
      ...wire,
      publicCanvas: {
        pattern: "gza-geometric",
        intensity: "subtle" as const,
        scale: "standard" as const,
      },
    };
    const aliasSource = wireAppearanceSettingsToSource(aliasWire);
    assert.equal(aliasSource.publicCanvas.pattern, "pie-factory");

    // Negative validation probes
    const unknownPatternRes = validateAppearanceSettingsWire({
      ...wire,
      publicCanvas: { pattern: "unknown-pattern", intensity: "subtle", scale: "standard" },
    });
    assert.equal(unknownPatternRes.valid, false);

    const invalidIntensityRes = validateAppearanceSettingsWire({
      ...wire,
      publicCanvas: { pattern: "architect", intensity: "hyper-active", scale: "standard" },
    });
    assert.equal(invalidIntensityRes.valid, false);
  });

  it("authoritative media target precedence, source policy parity, and positive/negative controls", () => {
    // 1. Source policy parity: assert copied constants strictly deep equal source policy definitions
    assert.deepEqual(
      WIRE_MEDIA_CATALOG,
      SOURCE_MEDIA_CATALOG,
      "WIRE_MEDIA_CATALOG must match SOURCE_MEDIA_CATALOG",
    );
    assert.deepEqual(
      WIRE_FAMILY_TRUTH,
      SOURCE_FAMILY_TRUTH,
      "WIRE_FAMILY_TRUTH must match SOURCE_FAMILY_TRUTH",
    );
    // Verify target truth class definitions for active targets match source policy
    for (const [targetKey, truthClasses] of Object.entries(WIRE_TARGET_TRUTH)) {
      assert.deepEqual(
        truthClasses,
        SOURCE_TARGET_TRUTH[targetKey],
        `TARGET truth classes for ${targetKey} must match source`,
      );
    }

    // 2. Positive control: approved historical past-003 on airport.chapter-card (target truth overrides editorial family truth)
    const baseWire = sourceAppearanceSettingsToWire(PUBLISHED_APPEARANCE_SETTINGS);
    const validChapterOverride = {
      ...baseWire,
      surfaceGrammar: {
        ...baseWire.surfaceGrammar,
        targetOverrides: {
          "airport.chapter-card": {
            mediaTreatment: {
              mediaId: "past-003",
              truthClass: "historical-documentary" as const,
              treatment: "cover" as const,
            },
          },
        },
      },
    };
    const positiveBackendRes = validateAppearanceSettingsWire(validChapterOverride);
    assert.equal(
      positiveBackendRes.valid,
      true,
      `Positive control must pass validation: ${JSON.stringify(positiveBackendRes.errors)}`,
    );

    // Verify against actual OpenAPI schema
    const schema =
      spec.paths["/admin/settings/appearance/draft"].put.requestBody.content["application/json"]
        .schema;
    const positiveSchemaRes = validatePayloadAgainstSchema(
      schema,
      { expectedRevision: 0, appearance: validChapterOverride },
      spec,
    );
    assert.equal(
      positiveSchemaRes.valid,
      true,
      `Positive control must pass OpenAPI schema: ${JSON.stringify(positiveSchemaRes.errors)}`,
    );

    // Verify source sanitizer comparison
    const sanitizedTreatment = sanitizeMediaTreatmentAuthoritative(
      { mediaId: "past-003", truthClass: "historical-documentary", treatment: "cover" },
      { targetId: "airport.chapter-card", familyId: "editorial" },
    );
    assert.ok(sanitizedTreatment);
    assert.equal(sanitizedTreatment.mediaId, "past-003");
    assert.equal(sanitizedTreatment.truthClass, "historical-documentary");

    // 3. Negative control: AI-generated illustrative imagery on airport.chapter-card must be rejected
    const futureAiOnChapterOverride = {
      ...baseWire,
      surfaceGrammar: {
        ...baseWire.surfaceGrammar,
        targetOverrides: {
          "airport.chapter-card": {
            mediaTreatment: {
              mediaId: "home-hero",
              truthClass: "future-concept-ai" as const,
              treatment: "cover" as const,
            },
          },
        },
      },
    };
    const negativeAiRes = validateAppearanceSettingsWire(futureAiOnChapterOverride);
    assert.equal(
      negativeAiRes.valid,
      false,
      "Future AI imagery must be rejected on historical chapter card",
    );
    assert.ok(
      negativeAiRes.errors.some((e: string) =>
        e.includes("not allowed for target 'airport.chapter-card'"),
      ),
    );

    // 4. Negative control: Operational family target rejecting media treatment
    const operationalTargetMediaOverride = {
      ...baseWire,
      surfaceGrammar: {
        ...baseWire.surfaceGrammar,
        targetOverrides: {
          "booking.flight-option": {
            mediaTreatment: {
              mediaId: "brand-mark",
              truthClass: "brand-mark" as const,
              treatment: "cover" as const,
            },
          },
        },
      },
    };
    const opTargetRes = validateAppearanceSettingsWire(operationalTargetMediaOverride);
    assert.equal(opTargetRes.valid, false, "Operational target must reject media treatment");
    assert.ok(
      opTargetRes.errors.some((e: string) =>
        e.includes("mediaTreatment is not allowed for target 'booking.flight-option'"),
      ),
    );

    // 5. Negative control: Unknown media ID
    const unknownMediaOverride = {
      ...baseWire,
      surfaceGrammar: {
        ...baseWire.surfaceGrammar,
        targetOverrides: {
          "airport.chapter-card": {
            mediaTreatment: {
              mediaId: "unapproved-random-photo",
              treatment: "cover" as const,
            },
          },
        },
      },
    };
    const unknownMediaRes = validateAppearanceSettingsWire(unknownMediaOverride);
    assert.equal(unknownMediaRes.valid, false, "Unknown mediaId must be rejected");

    // 6. Negative control: Unknown target ID
    const unknownTargetOverride = {
      ...baseWire,
      surfaceGrammar: {
        ...baseWire.surfaceGrammar,
        targetOverrides: {
          "fictional.unknown-target": {
            frame: "plain" as const,
          },
        },
      },
    };
    const unknownTargetRes = validateAppearanceSettingsWire(unknownTargetOverride);
    assert.equal(unknownTargetRes.valid, false, "Unknown target ID must be rejected");
  });

  it("settings draft receipts adapter", () => {
    const receipt = adaptSettingsDraftReceiptToWire("contact", true, 3);
    assert.equal(receipt.domain, "contact");
    assert.equal(receipt.changed, true);
    assert.equal(receipt.revision, 3);
  });

  it("real LocalSettingsRepository in-memory mutations and sibling preservation", async () => {
    const storage = createInMemoryStorage();
    const repo = new LocalSettingsRepository(storage);

    // Initial state: published defaults
    assert.equal(repo.getPublishedContact().phone, PUBLISHED_CONTACT_SETTINGS.phone);
    assert.equal(await repo.getContactDraft(), null);
    assert.equal((await repo.getEffectiveContact()).phone, PUBLISHED_CONTACT_SETTINGS.phone);

    assert.equal(
      repo.getPublishedAppearance().publicCanvas.pattern,
      PUBLISHED_APPEARANCE_SETTINGS.publicCanvas.pattern,
    );
    assert.equal(await repo.getAppearanceDraft(), null);

    // 1. Save contact draft
    const modifiedContact = { ...PUBLISHED_CONTACT_SETTINGS, phone: "+970 59 123 4567" };
    await repo.saveContactDraft(modifiedContact);
    assert.equal((await repo.getContactDraft())?.phone, "+970 59 123 4567");
    assert.equal((await repo.getEffectiveContact()).phone, "+970 59 123 4567");
    assert.equal(
      repo.getPublishedContact().phone,
      PUBLISHED_CONTACT_SETTINGS.phone,
      "Published contact must remain untouched",
    );

    // 2. Sibling preservation: saving appearance draft preserves contact draft
    const modifiedAppearance = {
      ...PUBLISHED_APPEARANCE_SETTINGS,
      publicCanvas: {
        ...PUBLISHED_APPEARANCE_SETTINGS.publicCanvas,
        pattern: "architect" as const,
      },
    };
    await repo.saveAppearanceDraft(modifiedAppearance);
    assert.equal(
      (await repo.getContactDraft())?.phone,
      "+970 59 123 4567",
      "Contact draft must survive appearance save",
    );
    assert.equal((await repo.getAppearanceDraft())?.publicCanvas.pattern, "architect");

    // 3. Discard contact draft
    await repo.discardContactDraft();
    assert.equal(await repo.getContactDraft(), null);
    assert.equal((await repo.getEffectiveContact()).phone, PUBLISHED_CONTACT_SETTINGS.phone);
    assert.equal(
      (await repo.getAppearanceDraft())?.publicCanvas.pattern,
      "architect",
      "Appearance draft must survive contact discard",
    );

    // 4. Discard appearance draft
    await repo.discardAppearanceDraft();
    assert.equal(await repo.getAppearanceDraft(), null);
    assert.equal(
      (await repo.getEffectiveAppearance()).publicCanvas.pattern,
      PUBLISHED_APPEARANCE_SETTINGS.publicCanvas.pattern,
    );

    // 5. Idempotent discard no-ops
    await repo.discardContactDraft();
    await repo.discardAppearanceDraft();
    assert.equal(await repo.getContactDraft(), null);
    assert.equal(await repo.getAppearanceDraft(), null);
  });

  it("authorization policy gates site settings on admin.manage (denying engagement.edit alone)", () => {
    const contactSettingsPolicy = policies.operations.find(
      (o) => o.operationId === "putAdminContactSettingsDraft",
    );
    assert.ok(contactSettingsPolicy, "putAdminContactSettingsDraft policy must exist");
    assert.equal(contactSettingsPolicy.intent, "protected");
    assert.ok(contactSettingsPolicy.allowedSecurity.some((s) => "StaffCookieAuth" in s));
    assert.equal(contactSettingsPolicy.requiredPermission, "admin.manage");

    const appearanceSettingsPolicy = policies.operations.find(
      (o) => o.operationId === "putAdminAppearanceSettingsDraft",
    );
    assert.ok(appearanceSettingsPolicy, "putAdminAppearanceSettingsDraft policy must exist");
    assert.equal(appearanceSettingsPolicy.requiredPermission, "admin.manage");
  });
});

describe("Phase 12: CMS Revisions, Document Key Binding & Source Receipts (R9.3b)", () => {
  const spec: OpenApiDocument = JSON.parse(fs.readFileSync(openapiPath, "utf-8"));

  it("validateCmsDraftKeyBinding enforces slug-to-payload match and rejects mismatches", () => {
    // Valid match
    const validMatch = validateCmsDraftKeyBinding("home", {
      id: "home",
      kind: "home",
      schemaVersion: 1,
    });
    assert.equal(validMatch.valid, true);

    // Mismatched slug and payload
    const mismatch = validateCmsDraftKeyBinding("home", {
      id: "travel",
      kind: "travel",
      schemaVersion: 1,
    });
    assert.equal(mismatch.valid, false);
    assert.ok(mismatch.errors.some((e) => e.includes("does not match path slug 'home'")));

    // Unknown slug
    const unknownSlug = validateCmsDraftKeyBinding("unknown-slug", {
      id: "home",
      kind: "home",
      schemaVersion: 1,
    });
    assert.equal(unknownSlug.valid, false);
    assert.ok(unknownSlug.errors.some((e) => e.includes("Unknown CMS document slug")));
  });

  it("real LocalContentRepository in-memory mutations, drafts, no-op, discard, and stale conflict", async () => {
    const contentRepo = new LocalContentRepository({ inMemory: true });

    // Published baseline
    const publishedHome = await contentRepo.getPublished("home");
    assert.ok(publishedHome);
    assert.equal(await contentRepo.getDraft("home"), null);
    assert.equal((await contentRepo.getPreview("home")).copy.h1.en, publishedHome.copy.h1.en);

    // 1. Save draft with receipt
    const modifiedHome = structuredClone(publishedHome);
    modifiedHome.copy.h1.en = "A Living Gateway to Palestine";
    const saveReceipt = await contentRepo.saveDraftWithReceipt("home", modifiedHome, {
      expectedDraft: null,
    });
    assert.equal(saveReceipt.key, "home");
    assert.equal(saveReceipt.changed, true);
    assert.equal(saveReceipt.before, null);
    assert.equal(saveReceipt.after?.copy.h1.en, "A Living Gateway to Palestine");
    assert.equal(
      (await contentRepo.getPreview("home")).copy.h1.en,
      "A Living Gateway to Palestine",
    );

    // 2. Identical draft save produces honest changed: false no-op
    const noopReceipt = await contentRepo.saveDraftWithReceipt("home", modifiedHome, {
      expectedDraft: modifiedHome,
    });
    assert.equal(noopReceipt.changed, false);

    // 3. Stale expectedDraft conflict throws ContentError('draft_conflict')
    await assert.rejects(
      async () => {
        await contentRepo.saveDraftWithReceipt("home", modifiedHome, { expectedDraft: null });
      },
      (err) => {
        assert.ok(err instanceof ContentError);
        assert.equal(err.code, "draft_conflict");
        return true;
      },
    );

    // 4. Sibling draft preservation
    const publishedTravel = await contentRepo.getPublished("travel");
    const modifiedTravel = structuredClone(publishedTravel);
    modifiedTravel.intro.title.en = "Travel to Gaza";
    await contentRepo.saveDraftWithReceipt("travel", modifiedTravel, { expectedDraft: null });
    assert.equal((await contentRepo.getDraft("home"))?.copy.h1.en, "A Living Gateway to Palestine");
    assert.equal((await contentRepo.getDraft("travel"))?.intro.title.en, "Travel to Gaza");

    // 5. Discard draft with receipt
    const discardReceipt = await contentRepo.discardDraftWithReceipt("home", {
      expectedDraft: modifiedHome,
    });
    assert.equal(discardReceipt.changed, true);
    assert.equal(discardReceipt.after, null);
    assert.equal(await contentRepo.getDraft("home"), null);
    assert.equal((await contentRepo.getPreview("home")).copy.h1.en, publishedHome.copy.h1.en);
    assert.equal(
      (await contentRepo.getDraft("travel"))?.intro.title.en,
      "Travel to Gaza",
      "Travel draft must survive home discard",
    );

    // 6. Second discard is an honest no-op (changed: false)
    const discardNoopReceipt = await contentRepo.discardDraftWithReceipt("home", {
      expectedDraft: null,
    });
    assert.equal(discardNoopReceipt.changed, false);

    // 7. Adapt receipt to wire format
    const wireReceipt = adaptCmsMutationReceiptToWire(saveReceipt, 1);
    assert.equal(wireReceipt.slug, "home");
    assert.equal(wireReceipt.changed, true);
    assert.equal(wireReceipt.revision, 1);

    const cmsReceiptOp = spec.paths["/cms/documents/{slug}"].put;
    const cmsReceiptSchema = cmsReceiptOp.responses["200"].content["application/json"].schema;
    const wireResp = {
      success: true,
      data: wireReceipt,
      meta: {
        requestId: "11111111-1111-4111-8111-111111111111",
        timestamp: "2026-10-08T18:00:00Z",
      },
    };
    const schemaCheck = validatePayloadAgainstSchema(cmsReceiptSchema, wireResp, spec);
    assert.equal(
      schemaCheck.valid,
      true,
      `CMS receipt must validate against schema: ${JSON.stringify(schemaCheck.errors)}`,
    );
  });
});

describe("Phase 12: Authentic Contact Enquiries & Admin Inbox Workflow (R9.3c)", () => {
  const spec: OpenApiDocument = JSON.parse(fs.readFileSync(openapiPath, "utf-8"));

  it("contact message wire adapters, validation, and minimal public receipt", () => {
    const rawCreateInput = {
      submissionId: "sub-public-001",
      senderName: "Huda Al-Masri",
      email: "huda@example.com",
      topic: "booking",
      message: "Question about booking ref GZA-7K8P",
      language: "en",
      bookingRef: "GZA-7K8P",
    };
    const validation = validateContactCreateWire(rawCreateInput);
    assert.equal(
      validation.valid,
      true,
      `Contact create input must validate: ${JSON.stringify(validation.errors)}`,
    );

    const sourceInput = wireContactCreateToSource(rawCreateInput);
    assert.equal(sourceInput.submissionId, "sub-public-001");
    assert.equal(sourceInput.bookingRef, "GZA-7K8P");

    // Negative validation probes
    const missingName = validateContactCreateWire({ ...rawCreateInput, senderName: "" });
    assert.equal(missingName.valid, false);

    const invalidTopic = validateContactCreateWire({ ...rawCreateInput, topic: "arbitrary-topic" });
    assert.equal(invalidTopic.valid, false);

    const injectedStatus = validateContactCreateWire({ ...rawCreateInput, status: "resolved" });
    assert.equal(injectedStatus.valid, false);
    assert.ok(injectedStatus.errors.some((e) => e.includes("status")));

    const injectedAssignee = validateContactCreateWire({
      ...rawCreateInput,
      assignedStaffId: "staff-01",
    });
    assert.equal(injectedAssignee.valid, false);
    assert.ok(injectedAssignee.errors.some((e) => e.includes("assignedStaffId")));

    // Minimal public receipt omits internal notes, reply draft, and PII
    const fakeMessage = {
      id: "cmsg-001",
      submissionId: "sub-public-001",
      senderName: "Huda Al-Masri",
      email: "huda@example.com",
      topic: "booking" as const,
      message: "Secret private message",
      language: "en" as const,
      status: "new" as const,
      createdAt: "2026-10-08T18:00:00Z",
      updatedAt: "2026-10-08T18:00:00Z",
      source: "public-contact" as const,
      replyDraft: "Draft internal reply",
      internalNotes: [
        { id: "n1", body: "Staff note", createdAt: "2026-10-08T18:01:00Z", staffId: "staff-1" },
      ],
    };
    const publicReceipt = adaptContactSubmissionReceiptToWire(fakeMessage);
    assert.equal(publicReceipt.submissionId, "sub-public-001");
    assert.equal(publicReceipt.receivedAt, fakeMessage.createdAt);
    assert.equal(publicReceipt.id, fakeMessage.id);
    assert.equal(
      (publicReceipt as Record<string, unknown>).internalNotes,
      undefined,
      "Public receipt must not leak internal notes",
    );
    assert.equal(
      (publicReceipt as Record<string, unknown>).replyDraft,
      undefined,
      "Public receipt must not leak reply draft",
    );
    assert.equal(
      (publicReceipt as Record<string, unknown>).email,
      undefined,
      "Public receipt must not leak email",
    );
  });

  it("real LocalContactRepository in-memory mutations across all 5 families", async () => {
    const coordinator = new ContactStorageCoordinator({
      inMemoryOnly: true,
      initialData: { schemaVersion: 1, revision: 1, messages: [] },
    });
    const repo = new LocalContactRepository({ coordinator });

    // 1. Public Create
    const msg1 = await repo.create({
      submissionId: "sub-100",
      senderName: "Nadia Saleh",
      email: "nadia@example.com",
      topic: "booking",
      message: "Need assistance with wheelchair",
      language: "en",
      bookingRef: "GZA8822",
    });
    assert.ok(msg1.id.startsWith("cmsg-"));
    assert.equal(msg1.status, "new");
    assert.equal(msg1.internalNotes.length, 0);

    // 2. Submission replay idempotency
    const replayMsg = await repo.create({
      submissionId: "sub-100",
      senderName: "Nadia Saleh",
      email: "nadia@example.com",
      topic: "booking",
      message: "Need assistance with wheelchair",
      language: "en",
      bookingRef: "GZA8822",
    });
    assert.equal(replayMsg.id, msg1.id, "Replaying submissionId must return existing record");

    // 2b. Replaying submissionId with different content throws conflict
    await assert.rejects(async () => {
      await repo.create({
        submissionId: "sub-100",
        senderName: "Different Person",
        email: "diff@example.com",
        topic: "baggage",
        message: "Different message",
        language: "en",
      });
    }, /Conflicting submissionId/);

    // 3. setStatusWithReceipt (transition & no-op)
    const statusTransition = await repo.setStatusWithReceipt(msg1.id, "open");
    assert.equal(statusTransition.changed, true);
    assert.equal(statusTransition.beforeStatus, "new");
    assert.equal(statusTransition.message.status, "open");

    const statusNoop = await repo.setStatusWithReceipt(msg1.id, "open");
    assert.equal(statusNoop.changed, false);
    assert.equal(statusNoop.beforeStatus, "open");

    // 4. setAssigneeWithReceipt (assign, no-op, null unassign)
    const assignRec = await repo.setAssigneeWithReceipt(msg1.id, "staff-01");
    assert.equal(assignRec.changed, true);
    assert.equal(assignRec.beforeAssignee, null);
    assert.equal(assignRec.message.assignedStaffId, "staff-01");

    const assignNoop = await repo.setAssigneeWithReceipt(msg1.id, "staff-01");
    assert.equal(assignNoop.changed, false);

    const unassignRec = await repo.setAssigneeWithReceipt(msg1.id, null);
    assert.equal(unassignRec.changed, true);
    assert.equal(unassignRec.beforeAssignee, "staff-01");
    assert.equal(unassignRec.message.assignedStaffId, undefined);

    // 5. addInternalNote
    const withNote = await repo.addInternalNote(msg1.id, {
      body: "Spoke with passenger by phone",
      staffId: "staff-01",
      staffName: "Ahmad",
    });
    assert.equal(withNote.internalNotes.length, 1);
    assert.equal(withNote.internalNotes[0].body, "Spoke with passenger by phone");
    assert.equal(withNote.internalNotes[0].staffId, "staff-01");

    // 6. saveReplyDraft (save and clear)
    const withDraft = await repo.saveReplyDraft(
      msg1.id,
      "Dear Nadia, we have confirmed wheelchair assistance.",
    );
    assert.equal(withDraft.replyDraft, "Dear Nadia, we have confirmed wheelchair assistance.");

    const clearedDraft = await repo.saveReplyDraft(msg1.id, "");
    assert.equal(clearedDraft.replyDraft, undefined);

    // 7. Staff list and filter options
    await repo.create({
      submissionId: "sub-101",
      senderName: "Mahmoud",
      email: "m@example.com",
      topic: "baggage",
      message: "Lost bag claim",
      language: "ar",
    });

    const allMessages = await repo.list();
    assert.equal(allMessages.length, 2);

    const baggageMessages = await repo.list({ topic: "baggage" });
    assert.equal(baggageMessages.length, 1);
    assert.equal(baggageMessages[0].topic, "baggage");

    const arMessages = await repo.list({ language: "ar" });
    assert.equal(arMessages.length, 1);
    assert.equal(arMessages[0].language, "ar");
  });
});

describe("Phase 12: Response Graph Success Gates (Section F)", () => {
  const spec: OpenApiDocument = JSON.parse(fs.readFileSync(openapiPath, "utf-8"));

  it("verifies that all 138 operations have canonical success envelopes via verifyAllOperationSuccessEnvelopes", () => {
    const envRes = verifyAllOperationSuccessEnvelopes(spec);
    assert.equal(
      envRes.valid,
      true,
      `All operations must have valid canonical success envelopes: ${JSON.stringify(envRes.errors)}`,
    );
    assert.equal(envRes.count, 138, "Must verify exactly 138 operation success envelopes");
    assert.equal(envRes.totalOperations, 138, "Must match total of 138 operations");
    assert.equal(envRes.errors.length, 0);
  });

  it("verifies that ErrorResponse schema enforces success: { const: false }", () => {
    const errorSchema = spec.components?.schemas?.["ErrorResponse"] as Record<string, unknown>;
    assert.ok(errorSchema, "ErrorResponse schema must exist");
    const props = errorSchema.properties as Record<string, unknown>;
    assert.ok(props && props.success, "ErrorResponse must have success property");
    const successProp = props.success as Record<string, unknown>;
    assert.equal(successProp.const, false, "ErrorResponse success must have const: false");
  });

  it("fails verification when success property is deleted from operation response", () => {
    const mutated = JSON.parse(JSON.stringify(spec));
    delete mutated.components.schemas.BookingDetailResponse.properties.success;
    const envRes = verifyAllOperationSuccessEnvelopes(mutated);
    assert.equal(envRes.valid, false);
    assert.ok(envRes.errors.some((e: string) => e.includes("missing success property")));
  });

  it("fails verification when success is removed from required array", () => {
    const mutated = JSON.parse(JSON.stringify(spec));
    mutated.components.schemas.BookingDetailResponse.required =
      mutated.components.schemas.BookingDetailResponse.required.filter(
        (k: string) => k !== "success",
      );
    const envRes = verifyAllOperationSuccessEnvelopes(mutated);
    assert.equal(envRes.valid, false);
    assert.ok(envRes.errors.some((e: string) => e.includes("success must be in required array")));
  });

  it("fails verification when success property has const: false", () => {
    const mutated = JSON.parse(JSON.stringify(spec));
    mutated.components.schemas.BookingDetailResponse.properties.success.const = false;
    const envRes = verifyAllOperationSuccessEnvelopes(mutated);
    assert.equal(envRes.valid, false);
    assert.ok(
      envRes.errors.some((e: string) => e.includes("success property must have const: true")),
    );
  });

  it("fails verification when envelope is replaced with bare DTO", () => {
    const mutated = JSON.parse(JSON.stringify(spec));
    mutated.paths["/bookings"].post.responses["201"].content["application/json"].schema = {
      $ref: "#/components/schemas/AirportDto",
    };
    const envRes = verifyAllOperationSuccessEnvelopes(mutated);
    assert.equal(envRes.valid, false);
    assert.ok(envRes.errors.some((e: string) => e.includes("missing success property")));
  });

  it("fails verification when envelope is omitted inside supported composition", () => {
    const mutated = JSON.parse(JSON.stringify(spec));
    mutated.paths["/bookings"].post.responses["201"].content["application/json"].schema = {
      allOf: [{ $ref: "#/components/schemas/BookingDto" }],
    };
    const envRes = verifyAllOperationSuccessEnvelopes(mutated);
    assert.equal(envRes.valid, false);
    assert.ok(envRes.errors.some((e: string) => e.includes("missing success property")));
  });

  it("fails verification when unexpected raw public JSON is added without envelope", () => {
    const mutated = JSON.parse(JSON.stringify(spec));
    mutated.paths["/public/raw-data"] = {
      get: {
        operationId: "getRawPublicData",
        summary: "Raw public data",
        responses: {
          "200": {
            description: "Raw data",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { rawField: { type: "string" } },
                  required: ["rawField"],
                },
              },
            },
          },
        },
      },
    };
    const envRes = verifyAllOperationSuccessEnvelopes(mutated);
    assert.equal(envRes.valid, false);
    assert.ok(
      envRes.errors.some(
        (e: string) => e.includes("getRawPublicData") && e.includes("missing success property"),
      ),
    );
  });

  it("fails verification when CSRF bootstrap response has invalid fields", () => {
    const mutated = JSON.parse(JSON.stringify(spec));
    mutated.components.schemas.CsrfTokenResponse = {
      type: "object",
      properties: { csrfToken: { type: "integer" } },
      required: ["csrfToken"],
    };
    const envRes = verifyAllOperationSuccessEnvelopes(mutated);
    assert.equal(envRes.valid, false);
    assert.ok(
      envRes.errors.some((e: string) => e.includes("csrfToken property must be type string")),
    );
  });

  it("fails verification when 204 No Content specifies a content body", () => {
    const mutated = JSON.parse(JSON.stringify(spec));
    mutated.paths["/api/v1/test/no-content-bad"] = {
      delete: {
        operationId: "deleteTestBadNoContent",
        summary: "Bad 204 with body",
        responses: {
          "204": {
            description: "No Content with body",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
        },
      },
    };
    const envRes = verifyAllOperationSuccessEnvelopes(mutated);
    assert.equal(envRes.valid, false);
    assert.ok(
      envRes.errors.some((e: string) =>
        e.includes("204 No Content response cannot specify content body"),
      ),
    );
  });

  it("passes verification when 204 No Content has no content body", () => {
    const mutated = JSON.parse(JSON.stringify(spec));
    mutated.paths["/api/v1/test/no-content-good"] = {
      delete: {
        operationId: "deleteTestGoodNoContent",
        summary: "Good 204 without body",
        responses: {
          "204": {
            description: "No Content",
          },
        },
      },
    };
    const envRes = verifyAllOperationSuccessEnvelopes(mutated);
    assert.equal(envRes.valid, true);
  });

  it("pins CSRF bootstrap exception to exact GET /auth/csrf and GET /staff/csrf with 200 application/json", () => {
    // 1. Synthetic endpoint trying to inherit CSRF exception via operationId on a different path fails
    const mutated1 = JSON.parse(JSON.stringify(spec));
    mutated1.paths["/api/v1/other/csrf-bypass"] = {
      get: {
        operationId: "getAuthCsrfBootstrap",
        summary: "Bypass attempt",
        responses: {
          "200": {
            description: "Raw token",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { csrfToken: { type: "string" } },
                  required: ["csrfToken"],
                },
              },
            },
          },
        },
      },
    };
    const envRes1 = verifyAllOperationSuccessEnvelopes(mutated1);
    assert.equal(envRes1.valid, false, "CSRF exception must not be inherited on non-pinned path");
    assert.ok(envRes1.errors.some((e: string) => e.includes("missing success property")));

    // 2. Synthetic endpoint with POST on /auth/csrf fails
    const mutated2 = JSON.parse(JSON.stringify(spec));
    mutated2.paths["/auth/csrf"].post = {
      operationId: "postAuthCsrf",
      summary: "POST csrf",
      responses: {
        "200": {
          description: "Raw token",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { csrfToken: { type: "string" } },
                required: ["csrfToken"],
              },
            },
          },
        },
      },
    };
    const envRes2 = verifyAllOperationSuccessEnvelopes(mutated2);
    assert.equal(envRes2.valid, false, "CSRF exception must not apply to POST method");

    // 3. Response alias resolution: resolve $ref response cleanly
    const mutated3 = JSON.parse(JSON.stringify(spec));
    mutated3.components.responses = mutated3.components.responses || {};
    mutated3.components.responses.AliasedCsrfResponse = {
      $ref: "#/components/responses/AliasedCsrfResponseTarget",
    };
    mutated3.components.responses.AliasedCsrfResponseTarget = {
      description: "Resolved CSRF target",
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/CsrfTokenResponse",
          },
        },
      },
    };
    mutated3.paths["/auth/csrf"].get.responses["200"] = {
      $ref: "#/components/responses/AliasedCsrfResponse",
    };
    const envRes3 = verifyAllOperationSuccessEnvelopes(mutated3);
    assert.equal(
      envRes3.valid,
      true,
      `Chained response alias must resolve cleanly: ${JSON.stringify(envRes3.errors)}`,
    );
  });

  it("rejects false-success payload instance directly against schema", () => {
    const schema = spec.components?.schemas?.BookingDetailResponse;
    assert.ok(schema, "BookingDetailResponse schema must exist");
    const badInstance = {
      success: false,
      data: {},
      meta: { requestId: "req-1", timestamp: "2026-10-09T00:00:00Z" },
    };
    const res = validatePayloadAgainstSchema(schema, badInstance, spec);
    assert.equal(
      res.valid,
      false,
      "Instance with success: false must be rejected by canonical schema",
    );
  });
});
