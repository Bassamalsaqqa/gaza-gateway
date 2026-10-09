#!/usr/bin/env node

/**
 * Gaza Gateway — Backend Contracts & OpenAPI Structural Validator
 *
 * Validates:
 * 1. Existence and non-empty status of all authoritative documentation files in docs/backend/
 * 2. Structural syntax, version, and component references in openapi.v1.json via lib/backend-contract-validation.mjs
 * 3. Machine authorization policies against canonical docs/backend/operation-policies.v1.json
 * 4. Phase 13A–G domain coverage across all 14 required phase tags
 * 5. Resolution of all internal $ref pointers without dangling targets
 * 6. Representative operation request/response payload examples against actual OpenAPI schemas
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  REQUIRED_PHASE_TAGS,
  validateOpenApiSpecification,
  validatePayloadAgainstSchema,
  validateOperationPolicies,
  validateBookingPassengerLinking,
  verifyAllOperationSuccessEnvelopes,
} from "./lib/backend-contract-validation.mjs";
import {
  majorToMinorUsd,
  minorToMajorUsd,
  sourceCatalogToWire,
  projectPublicCommercialCatalog,
  validateCommercialCommandSemanticInvariants,
} from "./lib/backend-commercial-contracts.mjs";
import {
  sourceAccountToWire,
  sourceTravelerToWire,
  validatePassengerProfilePatchSemanticInvariants,
  validateTravelerSemanticInvariants,
} from "./lib/backend-passenger-contracts.mjs";
import {
  sourceContactSettingsToWire,
  wireContactSettingsToSource,
  sourceAppearanceSettingsToWire,
  wireAppearanceSettingsToSource,
  validateCmsDraftKeyBinding,
  sourceContactMessageToWire,
  wireContactCreateToSource,
  adaptContactSubmissionReceiptToWire,
} from "./lib/backend-editorial-contracts.mjs";
import {
  MUTATION_SPECIMENS,
  verifyOperationSpecimen,
  verifyTamperedResponseRejected,
} from "./lib/backend-specimen-catalog.mjs";
import { validateIdentityLifecycleManifest } from "./lib/backend-identity-contracts.mjs";

import {
  validateIntegrityManifest,
  validateIntegrityApi,
} from "./lib/backend-integrity-contracts.mjs";
import {
  validatePublicationManifest,
  validatePublicationApi,
} from "./lib/backend-publication-contracts.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const backendDocsDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(rootDir, "docs", "backend");
const expectationsFixturePath = process.argv[3]
  ? path.resolve(process.argv[3])
  : fs.existsSync(path.join(backendDocsDir, "source-expectations.json"))
    ? path.join(backendDocsDir, "source-expectations.json")
    : path.join(rootDir, "tests", "fixtures", "backend-contracts", "source-expectations.json");

const REQUIRED_DOCS = [
  "README.md",
  "ADR-001-platform.md",
  "deployment-topology.md",
  "data-model.md",
  "openapi.v1.json",
  "operation-policies.v1.json",
  "identity-lifecycle.v1.json",
  "inventory-payment.v1.json",
  "publication-lifecycle.v1.json",
  "api-contract.md",
  "auth-rbac.md",
  "migration-map.md",
  "threat-model.md",
  "phase13-sequencing.md",
];

console.log("=== Validating Gaza Gateway Backend Contracts ===");

let hasErrors = false;

// 1. Verify existence of all required documentation files
console.log("\n[1/6] Checking documentation files in docs/backend/...");
for (const doc of REQUIRED_DOCS) {
  const filePath = path.join(backendDocsDir, doc);
  if (!fs.existsSync(filePath)) {
    console.error(`  FAIL: Missing required document: docs/backend/${doc}`);
    hasErrors = true;
  } else {
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      console.error(`  FAIL: Document is empty: docs/backend/${doc}`);
      hasErrors = true;
    } else {
      console.log(`  PASS: docs/backend/${doc} (${stats.size} bytes)`);
    }
  }
}

// 2. Parse openapi.v1.json and operation-policies.v1.json
console.log("\n[2/6] Parsing openapi.v1.json and operation-policies.v1.json...");
const openapiPath = path.join(backendDocsDir, "openapi.v1.json");
const policiesPath = path.join(backendDocsDir, "operation-policies.v1.json");
let openapi;
let policies;
try {
  openapi = JSON.parse(fs.readFileSync(openapiPath, "utf-8"));
  console.log("  PASS: openapi.v1.json is valid JSON.");
} catch (err) {
  console.error("  FAIL: Failed to parse openapi.v1.json:", err.message);
  process.exit(1);
}

try {
  policies = JSON.parse(fs.readFileSync(policiesPath, "utf-8"));
  console.log(
    `  PASS: operation-policies.v1.json is valid JSON (${policies.operations?.length || 0} operations).`,
  );
} catch (err) {
  console.error("  FAIL: Failed to parse operation-policies.v1.json:", err.message);
  process.exit(1);
}

// 3. Comprehensive OpenAPI specification validation using shared helper
console.log(
  "\n[3/6] Running structural, referential, and authorization validation via backend-contract-validation.mjs...",
);
const validationResult = validateOpenApiSpecification(openapi, { policyRegistry: policies });

if (!validationResult.valid) {
  console.error(`  FAIL: Found ${validationResult.errors.length} validation errors:`);
  for (const err of validationResult.errors) {
    console.error(`    - ${err}`);
  }
  hasErrors = true;
} else {
  console.log("  PASS: OpenAPI 3.1.0 structure valid.");
  console.log(
    `  PASS: ${validationResult.operationCount} distinct operations validated across ${validationResult.pathCount} paths.`,
  );
  console.log(`  PASS: All ${validationResult.refCount} internal $ref pointers resolved cleanly.`);
}

// 4. Verify Phase 13A–G tag coverage
console.log("\n[4/6] Verifying Phase 13A–G domain tag coverage...");
const foundTags = new Set(validationResult.foundTags || []);
for (const reqTag of REQUIRED_PHASE_TAGS) {
  if (!foundTags.has(reqTag)) {
    console.error(`  FAIL: Missing required phase tag in API operations: '${reqTag}'`);
    hasErrors = true;
  } else {
    console.log(`  PASS: Phase tag covered: '${reqTag}'`);
  }
}

// 5. Explicit Policy Registry validation
console.log("\n[5/6] Validating operation authorization policy registry...");
const polResult = validateOperationPolicies(openapi, policies);
if (!polResult.valid) {
  console.error(`  FAIL: Policy validation errors (${polResult.errors.length}):`);
  for (const err of polResult.errors) {
    console.error(`    - ${err}`);
  }
  hasErrors = true;
} else {
  console.log(
    `  PASS: All ${policies.operations.length} operations match explicit authorization policies.`,
  );
}

// 6. Validate representative operation payloads against OpenAPI schemas
console.log(
  "\n[6/6] Validating representative operation payloads against actual OpenAPI schemas...",
);

// 6a. CreateBookingRequest schema resolved from POST /bookings operation
const postBookingOp = openapi.paths?.["/bookings"]?.post;
const bookingSchema = postBookingOp?.requestBody?.content?.["application/json"]?.schema;
if (!bookingSchema) {
  console.error("  FAIL: POST /bookings requestBody schema missing from paths");
  hasErrors = true;
} else {
  const sampleBooking = {
    quoteId: "e9f0d1a2-3b4c-5d6e-7f8a-9b0c1d2e3f4a",
    holdId: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    contactName: "Tareq Mansour",
    contactEmail: "tareq@example.ps",
    contactPhone: "+970599123456",
    passengers: [
      { id: "pax-1", firstName: "Tareq", lastName: "Mansour", type: "adult" },
      {
        id: "pax-2",
        firstName: "Lina",
        lastName: "Mansour",
        type: "infant",
        linkedAdultPassengerId: "pax-1",
      },
    ],
  };
  const bRes = validatePayloadAgainstSchema(bookingSchema, sampleBooking, openapi);
  if (!bRes.valid) {
    console.error("  FAIL: Sample CreateBookingRequest failed validation:", bRes.errors);
    hasErrors = true;
  } else {
    console.log("  PASS: Sample CreateBookingRequest payload valid against operation schema.");
  }

  const linkRes = validateBookingPassengerLinking(sampleBooking.passengers);
  if (!linkRes.valid) {
    console.error(
      "  FAIL: Sample booking passengers failed semantic passenger linking validation:",
      linkRes.errors,
    );
    hasErrors = true;
  } else {
    console.log("  PASS: Sample booking passengers passed semantic passenger linking validation.");
  }

  // Negative probe 1: Infant without linked adult (fails both schema and semantic helper)
  const badInfantBooking = {
    ...sampleBooking,
    passengers: [{ id: "pax-1", firstName: "Baby", lastName: "Solo", type: "infant" }],
  };
  const negSchemaRes = validatePayloadAgainstSchema(bookingSchema, badInfantBooking, openapi);
  const negHelperRes = validateBookingPassengerLinking(badInfantBooking.passengers);
  if (negSchemaRes.valid) {
    console.error(
      "  FAIL: CreateBookingRequest schema erroneously accepted infant without linked adult!",
    );
    hasErrors = true;
  } else {
    console.log(
      "  PASS: CreateBookingRequest schema correctly rejected infant without linked adult.",
    );
  }
  if (negHelperRes.valid) {
    console.error(
      "  FAIL: validateBookingPassengerLinking erroneously accepted infant without linked adult!",
    );
    hasErrors = true;
  } else {
    console.log(
      "  PASS: validateBookingPassengerLinking correctly rejected infant without linked adult.",
    );
  }

  // Negative probe 2: Infant referencing nonexistent adult (passes schema if ID present, but fails helper)
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
  if (negHelperNonExistentRes.valid) {
    console.error(
      "  FAIL: validateBookingPassengerLinking erroneously accepted infant linking to nonexistent adult!",
    );
    hasErrors = true;
  } else {
    console.log(
      "  PASS: validateBookingPassengerLinking correctly rejected infant linking to nonexistent adult.",
    );
  }
}

// 6b. CheckInLegPassengerRequest schema
const checkInSchema = openapi.components?.schemas?.CheckInLegPassengerRequest;
if (!checkInSchema) {
  console.error("  FAIL: CheckInLegPassengerRequest schema missing from components");
  hasErrors = true;
} else {
  const sampleCheckIn = {
    datedServiceId: "svc1-c2NoZWQtZ3phLWFtbS0wMQ-2026-10-15",
    passengerId: "pax-1",
    travelDocument: {
      documentNumber: "P12345678",
      nationality: "PSE",
      expiryDate: "2030-05-20",
    },
    seatCode: "12A",
  };
  const cRes = validatePayloadAgainstSchema(checkInSchema, sampleCheckIn, openapi);
  if (!cRes.valid) {
    console.error("  FAIL: Sample CheckInLegPassengerRequest failed validation:", cRes.errors);
    hasErrors = true;
  } else {
    console.log("  PASS: Sample CheckInLegPassengerRequest payload valid against schema.");
  }
}

// 6c. CreateAircraftRequest schema
const createAircraftSchema = openapi.components?.schemas?.CreateAircraftRequest;
if (!createAircraftSchema) {
  console.error("  FAIL: CreateAircraftRequest schema missing from components");
  hasErrors = true;
} else {
  const sampleAircraft = {
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
  const acRes = validatePayloadAgainstSchema(createAircraftSchema, sampleAircraft, openapi);
  if (!acRes.valid) {
    console.error("  FAIL: Sample CreateAircraftRequest failed validation:", acRes.errors);
    hasErrors = true;
  } else {
    console.log("  PASS: Sample CreateAircraftRequest payload valid against schema.");
  }
}

// 6d. ArchiveRecordDto schema (Synthetic unverified specimen without historical claim)
const archiveRecordSchema = openapi.components?.schemas?.ArchiveRecordDto;
if (!archiveRecordSchema) {
  console.error("  FAIL: ArchiveRecordDto schema missing from components");
  hasErrors = true;
} else {
  const sampleArchive = {
    id: "synthetic-specimen-001",
    slug: "synthetic-specimen-001",
    medium: "photograph",
    phase: "contemporary-status",
    subjects: ["airport-architecture"],
    title: { en: "Synthetic Architecture Study", ar: "دراسة معمارية افتراضية" },
    caption: {
      en: "Synthetic testing specimen without historical claim",
      ar: "عينة اختبار افتراضية بدون ادعاء تاريخي",
    },
    alt: { en: "Synthetic testing image", ar: "صورة اختبار افتراضية" },
    datePrecision: "unknown",
    evidenceStatus: "unverified",
    sourceRefs: [],
    rights: { status: "unknown" },
    publicationState: "hold-provenance",
  };
  const aRes = validatePayloadAgainstSchema(archiveRecordSchema, sampleArchive, openapi);
  if (!aRes.valid) {
    console.error("  FAIL: Sample ArchiveRecordDto failed validation:", aRes.errors);
    hasErrors = true;
  } else {
    console.log(
      "  PASS: Sample ArchiveRecordDto (synthetic unverified fixture) valid against schema.",
    );
  }
}

// 6e. Commercial mutation operations and money boundary verification
console.log("\n[6e] Validating commercial mutation operations and money boundary verification...");
const patchFareOp = openapi.paths?.["/admin/commercial/fares/{id}"]?.patch;
const patchFareSchema = patchFareOp?.requestBody?.content?.["application/json"]?.schema;
if (!patchFareSchema) {
  console.error("  FAIL: PATCH /admin/commercial/fares/{id} requestBody schema missing");
  hasErrors = true;
} else {
  const samplePatchFare = {
    expectedRevision: 1,
    patch: {
      multiplier: 1.45,
      highlight: true,
    },
  };
  const pfRes = validatePayloadAgainstSchema(patchFareSchema, samplePatchFare, openapi);
  if (!pfRes.valid) {
    console.error("  FAIL: Sample PatchFareRequest failed validation:", pfRes.errors);
    hasErrors = true;
  } else {
    console.log("  PASS: Sample PatchFareRequest payload valid against operation schema.");
  }

  // Negative probe 1: Caller modifying identity ID in patch fails schema (additionalProperties: false)
  const badIdPatch = {
    expectedRevision: 1,
    patch: { id: "tampered-id" },
  };
  const negIdRes = validatePayloadAgainstSchema(patchFareSchema, badIdPatch, openapi);
  if (negIdRes.valid) {
    console.error("  FAIL: PatchFareRequest schema erroneously accepted identity ID modification!");
    hasErrors = true;
  } else {
    console.log("  PASS: PatchFareRequest schema correctly rejected identity ID modification.");
  }
}

// 6e-2: Meal option creation and forbidden fields check
const postMealOp = openapi.paths?.["/admin/commercial/meals"]?.post;
const postMealSchema = postMealOp?.requestBody?.content?.["application/json"]?.schema;
if (!postMealSchema) {
  console.error("  FAIL: POST /admin/commercial/meals requestBody schema missing");
  hasErrors = true;
} else {
  const sampleCreateMeal = {
    expectedRevision: 2,
    option: {
      id: "halal_certified",
      label: { en: "Halal Certified", ar: "حلال معتمد" },
      active: true,
      order: 4,
    },
  };
  const pmRes = validatePayloadAgainstSchema(postMealSchema, sampleCreateMeal, openapi);
  if (!pmRes.valid) {
    console.error("  FAIL: Sample CreateCatalogOptionRequest failed validation:", pmRes.errors);
    hasErrors = true;
  } else {
    console.log(
      "  PASS: Sample CreateCatalogOptionRequest payload valid against operation schema.",
    );
  }

  // Negative probe 2: Fabricated fields (price/currency) rejected by schema
  const badMeal = {
    expectedRevision: 2,
    option: {
      id: "halal_certified",
      label: { en: "Halal Certified", ar: "حلال معتمد" },
      active: true,
      order: 4,
      price: 25,
    },
  };
  const negMealRes = validatePayloadAgainstSchema(postMealSchema, badMeal, openapi);
  if (negMealRes.valid) {
    console.error(
      "  FAIL: CreateCatalogOptionRequest schema erroneously accepted fabricated price field!",
    );
    hasErrors = true;
  } else {
    console.log(
      "  PASS: CreateCatalogOptionRequest schema correctly rejected fabricated price field.",
    );
  }
}

// 6e-3: Money adapter precision check
try {
  const converted35 = majorToMinorUsd(35);
  const converted029 = majorToMinorUsd(0.29);
  if (converted35 !== 3500 || converted029 !== 29) {
    console.error("  FAIL: majorToMinorUsd conversion arithmetic incorrect");
    hasErrors = true;
  } else {
    console.log(
      "  PASS: Money adapter correctly converted USD major units to minor cents without silent rounding.",
    );
  }
} catch (err) {
  console.error("  FAIL: majorToMinorUsd threw on valid input:", err.message);
  hasErrors = true;
}

try {
  majorToMinorUsd(0.291);
  console.error("  FAIL: majorToMinorUsd failed to reject 3-decimal precision!");
  hasErrors = true;
} catch {
  console.log("  PASS: Money adapter correctly rejected unrepresentable 3-decimal amount.");
}

// 6e-4: Source expectations directory verification and maintained specimen validation for all mutation families
console.log(
  "\n[6e-4] Validating source-expectations fixture and operation specimens against schemas...",
);
let familyErrors = 0;
if (!fs.existsSync(expectationsFixturePath)) {
  console.error("  FAIL: source-expectations.json fixture missing at " + expectationsFixturePath);
  hasErrors = true;
} else {
  const expectations = JSON.parse(fs.readFileSync(expectationsFixturePath, "utf-8"));
  for (const fam of expectations.mutationFamilies) {
    const op = openapi.paths?.[fam.path]?.[fam.method.toLowerCase()];
    if (!op) {
      console.error(`  FAIL: Missing operation for ${fam.name}: ${fam.method} ${fam.path}`);
      hasErrors = true;
      familyErrors++;
      continue;
    }
    if (fam.requestSchema) {
      const reqRef = op.requestBody?.content?.[fam.mediaType]?.schema?.$ref;
      if (!reqRef || !reqRef.endsWith(`/${fam.requestSchema}`)) {
        console.error(
          `  FAIL: ${fam.name} request schema mismatch: expected ${fam.requestSchema}, got ${reqRef}`,
        );
        hasErrors = true;
        familyErrors++;
      }
    }
    const respRef =
      op.responses?.[String(fam.expectedStatus)]?.content?.[fam.mediaType]?.schema?.$ref;
    if (!respRef || !respRef.endsWith(`/${fam.responseSchema}`)) {
      console.error(
        `  FAIL: ${fam.name} response schema mismatch: expected ${fam.responseSchema}, got ${respRef}`,
      );
      hasErrors = true;
      familyErrors++;
    }

    // Specimen verification
    const specimen = MUTATION_SPECIMENS[fam.name];
    if (!specimen) {
      console.error(
        `  FAIL: Missing maintained specimen in catalog for mutation family '${fam.name}'`,
      );
      hasErrors = true;
      familyErrors++;
    } else {
      const specRes = verifyOperationSpecimen(openapi, fam, specimen);
      if (!specRes.valid) {
        console.error(`  FAIL: Specimen validation failed for ${fam.name}:`, specRes.errors);
        hasErrors = true;
        familyErrors++;
      }

      // Exact receipt family gate: tampering mapped operation with other valid family response must fail
      const foreignResponse =
        fam.domain === "commercial"
          ? MUTATION_SPECIMENS.saveContactDraft.response
          : fam.domain === "passenger"
            ? MUTATION_SPECIMENS.createMeal.response
            : fam.domain === "settings"
              ? MUTATION_SPECIMENS.updateFare.response
              : fam.domain === "cms"
                ? MUTATION_SPECIMENS.saveAppearanceDraft.response
                : MUTATION_SPECIMENS.saveCmsDraft.response;

      const tamperRes = verifyTamperedResponseRejected(openapi, fam, foreignResponse);
      if (!tamperRes.rejected) {
        console.error(
          `  FAIL: Tampered foreign response erroneously accepted by response schema for ${fam.name}!`,
        );
        hasErrors = true;
        familyErrors++;
      }
    }
  }

  if (familyErrors > 0) {
    console.error(
      `  FAIL: ${familyErrors} mutation family errors encountered; aborting PASS certification.`,
    );
  } else {
    console.log(
      `  PASS: All ${expectations.mutationFamilies.length} mutation families and specimens verified against operation schemas.`,
    );
  }
}

// 6e-5: Default meal retirement negative semantic probe
const mockSeedMeals = [
  { id: "standard", label: { en: "Standard", ar: "قياسي" }, active: true, order: 0 },
  { id: "vegetarian", label: { en: "Vegetarian", ar: "نباتي" }, active: true, order: 1 },
];
const mockCatalog = {
  fares: [],
  cabins: [],
  baggage: {
    cabinKg: 7,
    cabinDims: "55x40x20",
    checkedKg: 23,
    extraBagPrice: 35,
    note: { en: "", ar: "" },
  },
  meals: mockSeedMeals,
  defaultMealId: "standard",
  assistance: [],
};
const retireDefaultCheck = validateCommercialCommandSemanticInvariants(mockCatalog, "updateMeal", {
  expectedRevision: 0,
  id: "standard",
  patch: { active: false },
});
if (retireDefaultCheck.valid) {
  console.error(
    "  FAIL: validateCommercialCommandSemanticInvariants erroneously accepted retiring default meal!",
  );
  hasErrors = true;
} else {
  console.log("  PASS: Semantic helper correctly rejected deactivating current default meal.");
}

// 6e-6: Unsafe minor amount money boundary probe
try {
  minorToMajorUsd(Number.MAX_SAFE_INTEGER + 1);
  console.error("  FAIL: minorToMajorUsd accepted unsafe integer (Number.MAX_SAFE_INTEGER + 1)!");
  hasErrors = true;
} catch {
  console.log(
    "  PASS: minorToMajorUsd correctly rejected unsafe integer (Number.MAX_SAFE_INTEGER + 1).",
  );
}

// 6f: Passenger & Saved Traveler contract verification
console.log("\n[6f] Validating passenger profile and saved traveler operation contracts...");
const putProfOp = openapi.paths?.["/auth/passenger/profile"]?.put;
const putProfSchema = putProfOp?.requestBody?.content?.["application/json"]?.schema;
if (!putProfSchema) {
  console.error("  FAIL: PUT /auth/passenger/profile requestBody schema missing");
  hasErrors = true;
} else {
  const validProfilePatch = {
    seatPreference: "aisle",
    mealPreference: "vegetarian",
    newsletter: true,
  };
  const profRes = validatePayloadAgainstSchema(putProfSchema, validProfilePatch, openapi);
  if (!profRes.valid) {
    console.error(
      "  FAIL: Sample UpdatePassengerProfileRequest failed validation:",
      profRes.errors,
    );
    hasErrors = true;
  } else {
    console.log("  PASS: Sample UpdatePassengerProfileRequest payload valid against schema.");
  }

  // Negative probe: email injected into profile update fails schema (additionalProperties: false)
  const badEmailPatch = {
    email: "injected@evil.example",
    seatPreference: "window",
  };
  const negEmailRes = validatePayloadAgainstSchema(putProfSchema, badEmailPatch, openapi);
  if (negEmailRes.valid) {
    console.error("  FAIL: UpdatePassengerProfileRequest erroneously accepted injected email!");
    hasErrors = true;
  } else {
    console.log("  PASS: UpdatePassengerProfileRequest correctly rejected injected email.");
  }
}

// 6f-2: Saved Traveler Create & Patch schemas
const postTrvOp = openapi.paths?.["/auth/passenger/travelers"]?.post;
const postTrvSchema = postTrvOp?.requestBody?.content?.["application/json"]?.schema;
if (!postTrvSchema) {
  console.error("  FAIL: POST /auth/passenger/travelers requestBody schema missing");
  hasErrors = true;
} else {
  const sampleTraveler = {
    firstName: "Ahmed",
    lastName: "Al-Masri",
    dob: "1995-04-12",
    nationality: "Palestinian",
    document: "P1234567",
  };
  const trvRes = validatePayloadAgainstSchema(postTrvSchema, sampleTraveler, openapi);
  if (!trvRes.valid) {
    console.error("  FAIL: Sample CreateTravelerRequest failed validation:", trvRes.errors);
    hasErrors = true;
  } else {
    console.log(
      "  PASS: Sample CreateTravelerRequest (with 'Palestinian' nationality) valid against schema.",
    );
  }

  // Negative probe: conflicting alias dateOfBirth rejected by schema
  const badAliasTraveler = {
    firstName: "Ahmed",
    lastName: "Al-Masri",
    dateOfBirth: "1995-04-12",
  };
  const negAliasRes = validatePayloadAgainstSchema(postTrvSchema, badAliasTraveler, openapi);
  if (negAliasRes.valid) {
    console.error(
      "  FAIL: CreateTravelerRequest erroneously accepted conflicting alias dateOfBirth!",
    );
    hasErrors = true;
  } else {
    console.log("  PASS: CreateTravelerRequest correctly rejected conflicting alias dateOfBirth.");
  }
}

// 6g: Editorial Contracts (Site Settings, CMS Drafts, Contact Enquiries)
console.log("\n[6g] Validating editorial contracts (site settings, CMS drafts, contact inbox)...");

// 6g-1: Site Settings Draft Contracts
const putContactSettingsOp = openapi.paths?.["/admin/settings/contact/draft"]?.put;
const putContactSettingsSchema =
  putContactSettingsOp?.requestBody?.content?.["application/json"]?.schema;
if (!putContactSettingsSchema) {
  console.error("  FAIL: PUT /admin/settings/contact/draft requestBody schema missing");
  hasErrors = true;
} else {
  const sampleSettingsReq = {
    expectedRevision: 0,
    contact: {
      phone: "+970 8 282 0000",
      email: "info@gza-airport.ps",
      addressEn: "Gaza International Airport, Gaza",
      addressAr: "مطار غزة الدولي، غزة",
      socialInstagram: "",
      socialX: "https://x.com/gza_airport",
      socialFacebook: "https://facebook.com/gza_airport",
      socialYouTube: "",
    },
  };
  const setRes = validatePayloadAgainstSchema(putContactSettingsSchema, sampleSettingsReq, openapi);
  if (!setRes.valid) {
    console.error(
      "  FAIL: Sample PutContactSettingsDraftRequest failed validation:",
      setRes.errors,
    );
    hasErrors = true;
  } else {
    console.log("  PASS: Sample PutContactSettingsDraftRequest valid against operation schema.");
  }

  // Negative probe: forbidden alias LinkedIn rejected by schema
  const badLinkedInReq = {
    expectedRevision: 0,
    contact: {
      ...sampleSettingsReq.contact,
      linkedIn: "https://linkedin.com/company/gaza-airport",
    },
  };
  const negLinkedInRes = validatePayloadAgainstSchema(
    putContactSettingsSchema,
    badLinkedInReq,
    openapi,
  );
  if (negLinkedInRes.valid) {
    console.error(
      "  FAIL: PutContactSettingsDraftRequest erroneously accepted forbidden alias LinkedIn!",
    );
    hasErrors = true;
  } else {
    console.log(
      "  PASS: PutContactSettingsDraftRequest correctly rejected forbidden alias LinkedIn.",
    );
  }
}

// 6g-2: CMS Draft Revision and Document Key Binding
const putCmsOp = openapi.paths?.["/cms/documents/{slug}"]?.put;
const putCmsSchema = putCmsOp?.requestBody?.content?.["application/json"]?.schema;
if (!putCmsSchema) {
  console.error("  FAIL: PUT /cms/documents/{slug} requestBody schema missing");
  hasErrors = true;
} else {
  const sampleCmsReq = MUTATION_SPECIMENS.saveCmsDraft.request;
  const cmsRes = validatePayloadAgainstSchema(putCmsSchema, sampleCmsReq, openapi);
  if (!cmsRes.valid) {
    console.error("  FAIL: Sample PutCmsDocumentDraftRequest failed validation:", cmsRes.errors);
    hasErrors = true;
  } else {
    console.log("  PASS: Sample PutCmsDocumentDraftRequest valid against operation schema.");
  }

  // Negative probe: missing expectedRevision rejected by schema
  const badCmsReq = { payload: sampleCmsReq.payload };
  const negCmsRes = validatePayloadAgainstSchema(putCmsSchema, badCmsReq, openapi);
  if (negCmsRes.valid) {
    console.error(
      "  FAIL: PutCmsDocumentDraftRequest erroneously accepted missing expectedRevision!",
    );
    hasErrors = true;
  } else {
    console.log("  PASS: PutCmsDocumentDraftRequest correctly rejected missing expectedRevision.");
  }

  // Contextual key binding probe: travel payload sent to home slug fails helper
  const bindingCheck = validateCmsDraftKeyBinding("home", {
    id: "travel",
    kind: "travel",
    schemaVersion: 1,
  });
  if (bindingCheck.valid) {
    console.error("  FAIL: validateCmsDraftKeyBinding accepted mismatched slug and payload kind!");
    hasErrors = true;
  } else {
    console.log(
      "  PASS: validateCmsDraftKeyBinding correctly rejected mismatched travel payload on home slug.",
    );
  }
}

// 6g-3: Contact Enquiries & Public Submission Receipts
const postContactOp = openapi.paths?.["/contact"]?.post;
const postContactSchema = postContactOp?.requestBody?.content?.["application/json"]?.schema;
if (!postContactSchema) {
  console.error("  FAIL: POST /contact requestBody schema missing");
  hasErrors = true;
} else {
  const sampleContactReq = MUTATION_SPECIMENS.createContactSubmission.request;
  const contactRes = validatePayloadAgainstSchema(postContactSchema, sampleContactReq, openapi);
  if (!contactRes.valid) {
    console.error(
      "  FAIL: Sample CreateContactMessageRequest failed validation:",
      contactRes.errors,
    );
    hasErrors = true;
  } else {
    console.log("  PASS: Sample CreateContactMessageRequest valid against operation schema.");
  }

  // Negative probe: caller injecting status rejected by schema
  const badStatusReq = { ...sampleContactReq, status: "open" };
  const negStatusRes = validatePayloadAgainstSchema(postContactSchema, badStatusReq, openapi);
  if (negStatusRes.valid) {
    console.error("  FAIL: CreateContactMessageRequest erroneously accepted injected status!");
    hasErrors = true;
  } else {
    console.log("  PASS: CreateContactMessageRequest correctly rejected injected status.");
  }
}

// 6h: Total bounded canonical success envelopes across all operations
console.log("\n[6h] Verifying total bounded canonical success envelopes across all operations...");
const envelopeRes = verifyAllOperationSuccessEnvelopes(openapi);
if (!envelopeRes.valid) {
  console.error(`  FAIL: Success envelope verification errors (${envelopeRes.errors.length}):`);
  for (const err of envelopeRes.errors) {
    console.error(`    - ${err}`);
  }
  hasErrors = true;
} else {
  console.log(
    `  PASS: Total bounded canonical success envelopes verified across all ${envelopeRes.count} operations.`,
  );
}

// 6i: Identity and Security Lifecycle Architecture Manifest & Expectations Validation
console.log(
  "\n[6i] Validating identity and security lifecycle manifest against independent expectations...",
);
const manifestPath = path.resolve(backendDocsDir, "identity-lifecycle.v1.json");
const identityExpectationsPath =
  process.env.IDENTITY_EXPECTATIONS_FIXTURE ||
  path.resolve(rootDir, "tests/fixtures/backend-contracts/identity-expectations.json");

if (!fs.existsSync(manifestPath)) {
  console.error("  FAIL: docs/backend/identity-lifecycle.v1.json does not exist");
  hasErrors = true;
} else if (!fs.existsSync(identityExpectationsPath)) {
  console.error(
    "  FAIL: tests/fixtures/backend-contracts/identity-expectations.json does not exist",
  );
  hasErrors = true;
} else {
  const manifestData = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const expectationsData = JSON.parse(fs.readFileSync(identityExpectationsPath, "utf-8"));
  const idRes = validateIdentityLifecycleManifest(
    manifestData,
    expectationsData,
    openapi,
    policies,
  );
  if (!idRes.valid) {
    console.error(`  FAIL: Identity lifecycle validation failed (${idRes.errors.length} errors):`);
    for (const err of idRes.errors) {
      console.error(`    - ${err}`);
    }
    hasErrors = true;
  } else {
    console.log(
      "  PASS: Identity lifecycle manifest matches independent expectations, spec security schemes, and policies.",
    );
  }
}

// 6j: Inventory/payment and publication foundations, including actual operation bindings.
for (const [name, validate, api] of [
  ["inventory-payment.v1.json", validateIntegrityManifest, validateIntegrityApi],
  ["publication-lifecycle.v1.json", validatePublicationManifest, validatePublicationApi],
]) {
  const value = JSON.parse(fs.readFileSync(path.resolve(backendDocsDir, name), "utf8"));
  const failures = [...validate(value).errors, ...api(openapi).errors];
  if (failures.length) {
    hasErrors = true;
    console.error("FAIL " + name, failures);
  } else console.log("PASS " + name + ": closed foundation manifest and actual operation bindings");
}

// Final notice & summary
console.log(
  "\nNotice: Bounded custom OpenAPI 3.1 contract traversal and schema validator executed; no external full OpenAPI compliance suite run.",
);
console.log("=================================================");
if (hasErrors) {
  console.error("RESULT: Contract validation FAILED with errors.");
  process.exit(1);
} else {
  console.log("RESULT: All backend contracts and OpenAPI 3.1 specifications PASSED verification.");
  process.exit(0);
}
