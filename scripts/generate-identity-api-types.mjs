import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const repositoryRoot = path.resolve(__dirname, "..");
export const DEFAULT_SPEC_PATH = path.join(repositoryRoot, "docs/backend/openapi.v1.json");
export const DEFAULT_TYPES_OUTPUT_PATH = path.join(repositoryRoot, "src/lib/api/identity-types.ts");
export const DEFAULT_CONTRACT_OUTPUT_PATH = path.join(repositoryRoot, "src/lib/api/identity-contract.json");

const SUPPORTED_SCHEMA_KEYS = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "const",
  "format",
  "example",
  "items",
  "enum",
  "minLength",
  "maxLength",
  "$ref",
  "description",
]);

export const ACCEPTED_IDENTITY_OPERATIONS = Object.freeze([
  {
    operationId: "getAuthCsrfBootstrap",
    method: "GET",
    path: "/auth/csrf",
    expectedStatus: 200,
    realm: "passenger",
    requiresCsrf: false,
    isAuthChanging: false,
    requestSchemaName: null,
    responseSchemaName: "CsrfTokenResponse",
  },
  {
    operationId: "postPassengerRegister",
    method: "POST",
    path: "/auth/register",
    expectedStatus: 202,
    realm: "passenger",
    requiresCsrf: true,
    isAuthChanging: false,
    requestSchemaName: "RegisterRequest",
    responseSchemaName: "PassengerRegisterReceiptResponse",
  },
  {
    operationId: "postPassengerLogin",
    method: "POST",
    path: "/auth/login",
    expectedStatus: 200,
    realm: "passenger",
    requiresCsrf: true,
    isAuthChanging: true,
    requestSchemaName: "LoginRequest",
    responseSchemaName: "PassengerAuthResponse",
  },
  {
    operationId: "postPassengerLogout",
    method: "POST",
    path: "/auth/logout",
    expectedStatus: 200,
    realm: "passenger",
    requiresCsrf: true,
    isAuthChanging: true,
    requestSchemaName: null,
    responseSchemaName: "PassengerLogoutResponse",
  },
  {
    operationId: "postPassengerPasswordForgot",
    method: "POST",
    path: "/auth/password/forgot",
    expectedStatus: 202,
    realm: "passenger",
    requiresCsrf: true,
    isAuthChanging: false,
    requestSchemaName: "PasswordForgotRequest",
    responseSchemaName: "PasswordForgotResponse",
  },
  {
    operationId: "postPassengerPasswordReset",
    method: "POST",
    path: "/auth/password/reset",
    expectedStatus: 200,
    realm: "passenger",
    requiresCsrf: true,
    isAuthChanging: true,
    requestSchemaName: "PasswordResetRequest",
    responseSchemaName: "PasswordResetResponse",
  },
  {
    operationId: "postPassengerEmailVerify",
    method: "POST",
    path: "/auth/email/verify",
    expectedStatus: 200,
    realm: "passenger",
    requiresCsrf: true,
    isAuthChanging: false,
    requestSchemaName: "EmailVerifyRequest",
    responseSchemaName: "EmailVerifyResponse",
  },
  {
    operationId: "postPassengerEmailResend",
    method: "POST",
    path: "/auth/email/resend",
    expectedStatus: 202,
    realm: "passenger",
    requiresCsrf: true,
    isAuthChanging: false,
    requestSchemaName: "PassengerEmailResendRequest",
    responseSchemaName: "PassengerRegisterReceiptResponse",
  },
  {
    operationId: "getStaffCsrfBootstrap",
    method: "GET",
    path: "/staff/csrf",
    expectedStatus: 200,
    realm: "staff",
    requiresCsrf: false,
    isAuthChanging: false,
    requestSchemaName: null,
    responseSchemaName: "CsrfTokenResponse",
  },
  {
    operationId: "postStaffLogin",
    method: "POST",
    path: "/staff/login",
    expectedStatus: 200,
    realm: "staff",
    requiresCsrf: true,
    isAuthChanging: true,
    requestSchemaName: "StaffLoginRequest",
    responseSchemaName: "StaffPendingAuthResponse",
  },
  {
    operationId: "postStaffLogout",
    method: "POST",
    path: "/staff/logout",
    expectedStatus: 200,
    realm: "staff",
    requiresCsrf: true,
    isAuthChanging: true,
    requestSchemaName: null,
    responseSchemaName: "StaffLogoutResponse",
  },
  {
    operationId: "getStaffMe",
    method: "GET",
    path: "/staff/me",
    expectedStatus: 200,
    realm: "staff",
    requiresCsrf: false,
    isAuthChanging: false,
    requestSchemaName: null,
    responseSchemaName: "StaffMeResponse",
  },
]);

/**
 * Validates that a JSON schema object contains only known, supported constructs.
 * Fails closed on any unexpected construct (e.g. oneOf, anyOf, allOf, not).
 */
export function validateSupportedSchema(schema, pathTrace = "root") {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error(`Unsupported schema node at ${pathTrace}: expected non-null object`);
  }

  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_SCHEMA_KEYS.has(key)) {
      throw new Error(`Unsupported schema keyword '${key}' at ${pathTrace}. Generator fails closed.`);
    }
  }

  if (schema.$ref !== undefined) {
    for (const key of Object.keys(schema)) {
      if (key !== "$ref" && key !== "description") {
        throw new Error(
          `Unsupported sibling assertion '${key}' alongside $ref at ${pathTrace}. Generator fails closed.`
        );
      }
    }
    if (typeof schema.$ref !== "string" || !schema.$ref.startsWith("#/components/schemas/")) {
      throw new Error(`Unsupported $ref '${schema.$ref}' at ${pathTrace}. Expected '#/components/schemas/...'`);
    }
    return;
  }

  if (schema.type === "object") {
    if (schema.properties) {
      if (typeof schema.properties !== "object" || Array.isArray(schema.properties)) {
        throw new Error(`Malformed properties at ${pathTrace}`);
      }
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        validateSupportedSchema(propSchema, `${pathTrace}.properties.${propName}`);
      }
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      validateSupportedSchema(schema.additionalProperties, `${pathTrace}.additionalProperties`);
    }
  } else if (schema.type === "array") {
    if (!schema.items || typeof schema.items !== "object") {
      throw new Error(`Missing or malformed items in array schema at ${pathTrace}`);
    }
    validateSupportedSchema(schema.items, `${pathTrace}.items`);
  } else if (
    schema.type === "string" ||
    schema.type === "integer" ||
    schema.type === "number" ||
    schema.type === "boolean"
  ) {
    // Valid scalar schema
  } else {
    throw new Error(`Unsupported schema type '${schema.type}' at ${pathTrace}`);
  }
}

/**
 * Resolves a schema reference or inline schema.
 */
export function resolveSchema(spec, schemaOrRef) {
  if (!schemaOrRef) {
    throw new Error("Missing schema to resolve");
  }
  if (schemaOrRef.$ref) {
    const ref = schemaOrRef.$ref;
    const prefix = "#/components/schemas/";
    if (!ref.startsWith(prefix)) {
      throw new Error(`Unsupported $ref format: ${ref}`);
    }
    const name = ref.slice(prefix.length);
    const target = spec.components?.schemas?.[name];
    if (!target) {
      throw new Error(`Unresolved schema reference: ${ref}`);
    }
    return { name, schema: target };
  }
  return { name: null, schema: schemaOrRef };
}

/**
 * Traverses all reachable schema nodes from root operations and component schemas.
 * Detects circular references, dangling references, malformed targets, and unsupported constructs.
 */
export function preflightReachableReferences(spec, rootSchemas) {
  const referencedComponentNames = new Set();

  function traverse(schemaNode, pathTrace, activeStack = []) {
    if (!schemaNode || typeof schemaNode !== "object" || Array.isArray(schemaNode)) {
      throw new Error(`Malformed schema node at ${pathTrace}: expected non-null object`);
    }

    validateSupportedSchema(schemaNode, pathTrace);

    if (schemaNode.$ref !== undefined) {
      const ref = schemaNode.$ref;
      const prefix = "#/components/schemas/";
      if (!ref.startsWith(prefix)) {
        throw new Error(`Unsupported $ref format '${ref}' at ${pathTrace}`);
      }
      const componentName = ref.slice(prefix.length);
      const target = spec.components?.schemas?.[componentName];
      if (!target) {
        throw new Error(`Dangling schema reference '${ref}' at ${pathTrace}`);
      }

      if (activeStack.includes(componentName)) {
        throw new Error(
          `Circular schema reference detected: ${[...activeStack, componentName].join(" -> ")} at ${pathTrace}`
        );
      }

      referencedComponentNames.add(componentName);
      traverse(target, `components.schemas['${componentName}']`, [...activeStack, componentName]);
      return;
    }

    if (schemaNode.type === "object" && schemaNode.properties) {
      for (const [propName, propSchema] of Object.entries(schemaNode.properties)) {
        traverse(propSchema, `${pathTrace}.properties.${propName}`, activeStack);
      }
    }

    if (schemaNode.type === "object" && schemaNode.additionalProperties && typeof schemaNode.additionalProperties === "object") {
      traverse(schemaNode.additionalProperties, `${pathTrace}.additionalProperties`, activeStack);
    }

    if (schemaNode.type === "array" && schemaNode.items) {
      traverse(schemaNode.items, `${pathTrace}.items`, activeStack);
    }
  }

  for (const { schema, path: tracePath } of rootSchemas) {
    traverse(schema, tracePath, []);
  }

  return referencedComponentNames;
}

/**
 * Maps a schema type definition to its TypeScript type string based on AST.
 */
function resolveTypeScriptType(propSchema, spec, pathTrace) {
  if (propSchema.const !== undefined) {
    return JSON.stringify(propSchema.const);
  }

  if (propSchema.enum && Array.isArray(propSchema.enum)) {
    return propSchema.enum.map((v) => JSON.stringify(v)).join(" | ");
  }

  if (propSchema.$ref) {
    const { name } = resolveSchema(spec, propSchema);
    return name;
  }

  if (propSchema.type === "string") {
    return "string";
  }

  if (propSchema.type === "integer" || propSchema.type === "number") {
    return "number";
  }

  if (propSchema.type === "boolean") {
    return "boolean";
  }

  if (propSchema.type === "array") {
    const itemType = resolveTypeScriptType(propSchema.items, spec, `${pathTrace}.items`);
    return `${itemType}[]`;
  }

  if (propSchema.type === "object") {
    if (propSchema.additionalProperties && typeof propSchema.additionalProperties === "object") {
      const valType = resolveTypeScriptType(
        propSchema.additionalProperties,
        spec,
        `${pathTrace}.additionalProperties`
      );
      return `Record<string, ${valType}>`;
    }
    throw new Error(`Unsupported inline nested object at ${pathTrace}`);
  }

  throw new Error(`Unknown schema type at ${pathTrace}`);
}

/**
 * Generates an interface definition by inspecting actual schema properties and required fields.
 */
function generateInterfaceFromSchema(interfaceName, schema, spec, propertyTypeOverrides = {}) {
  validateSupportedSchema(schema, interfaceName);

  const required = new Set(schema.required || []);
  const lines = [`export interface ${interfaceName} {`];

  for (const [propName, propSchema] of Object.entries(schema.properties || {})) {
    const isRequired = required.has(propName);
    const opt = isRequired ? "" : "?";
    const typeStr =
      propertyTypeOverrides[propName] ??
      resolveTypeScriptType(propSchema, spec, `${interfaceName}.${propName}`);
    lines.push(`  ${propName}${opt}: ${typeStr};`);
  }

  lines.push(`}`);
  return lines.join("\n");
}

/**
 * Generates narrow TypeScript types for the 12 accepted Identity API operations.
 */
export function generateIdentityApiTypes(spec) {
  if (!spec || typeof spec !== "object") {
    throw new Error("Invalid OpenAPI specification object");
  }

  // 1. Verify existence of all 12 accepted operations in OpenAPI spec
  const rootSchemas = [];
  for (const op of ACCEPTED_IDENTITY_OPERATIONS) {
    const methodLower = op.method.toLowerCase();
    const pathItem = spec.paths?.[op.path];
    if (!pathItem) {
      throw new Error(`Missing path '${op.path}' in OpenAPI spec`);
    }
    const opItem = pathItem[methodLower];
    if (!opItem) {
      throw new Error(`Missing operation '${op.method} ${op.path}' in OpenAPI spec`);
    }
    if (opItem.operationId !== op.operationId) {
      throw new Error(
        `Operation ID mismatch for '${op.method} ${op.path}': expected '${op.operationId}', got '${opItem.operationId}'`
      );
    }

    if (op.requestSchemaName) {
      const reqSchema = opItem.requestBody?.content?.["application/json"]?.schema;
      if (!reqSchema) {
        throw new Error(`Missing requestBody schema for '${op.method} ${op.path}'`);
      }
      rootSchemas.push({
        schema: reqSchema,
        path: `paths['${op.path}'].${methodLower}.requestBody.content['application/json'].schema`,
      });
    }

    const resStatus = String(op.expectedStatus);
    const resSchema = opItem.responses?.[resStatus]?.content?.["application/json"]?.schema;
    if (!resSchema) {
      throw new Error(`Missing response ${resStatus} schema for '${op.method} ${op.path}'`);
    }
    rootSchemas.push({
      schema: resSchema,
      path: `paths['${op.path}'].${methodLower}.responses['${resStatus}'].content['application/json'].schema`,
    });
  }

  const errorSchema = spec.components?.schemas?.["ErrorResponse"];
  const errorDetailSchema = spec.components?.schemas?.["ErrorDetail"];
  const successMetaSchema = spec.components?.schemas?.["SuccessMeta"];
  const csrfTokenSchema = spec.components?.schemas?.["CsrfTokenResponse"];

  if (!errorSchema) throw new Error("Missing ErrorResponse schema in components.schemas");
  if (!errorDetailSchema) throw new Error("Missing ErrorDetail schema in components.schemas");
  if (!successMetaSchema) throw new Error("Missing SuccessMeta schema in components.schemas");
  if (!csrfTokenSchema) throw new Error("Missing CsrfTokenResponse schema in components.schemas");

  rootSchemas.push(
    { schema: errorSchema, path: "components.schemas['ErrorResponse']" },
    { schema: errorDetailSchema, path: "components.schemas['ErrorDetail']" },
    { schema: successMetaSchema, path: "components.schemas['SuccessMeta']" },
    { schema: csrfTokenSchema, path: "components.schemas['CsrfTokenResponse']" }
  );

  // 2. Preflight all reachable references
  preflightReachableReferences(spec, rootSchemas);

  // 3. Resolve & validate schema structures
  const successMetaCode = generateInterfaceFromSchema("SuccessMeta", successMetaSchema, spec);
  const csrfTokenCode = generateInterfaceFromSchema("CsrfTokenResponse", csrfTokenSchema, spec);

  // Request DTOs
  const registerReqSchema = spec.components?.schemas?.["RegisterRequest"];
  if (!registerReqSchema) throw new Error("Missing RegisterRequest schema");
  const registerReqCode = generateInterfaceFromSchema("RegisterRequest", registerReqSchema, spec);

  const loginReqSchema = spec.components?.schemas?.["LoginRequest"];
  if (!loginReqSchema) throw new Error("Missing LoginRequest schema");
  const loginReqCode = generateInterfaceFromSchema("LoginRequest", loginReqSchema, spec);

  const forgotReqSchema = spec.components?.schemas?.["PasswordForgotRequest"];
  if (!forgotReqSchema) throw new Error("Missing PasswordForgotRequest schema");
  const forgotReqCode = generateInterfaceFromSchema("PasswordForgotRequest", forgotReqSchema, spec);

  const resetReqSchema = spec.components?.schemas?.["PasswordResetRequest"];
  if (!resetReqSchema) throw new Error("Missing PasswordResetRequest schema");
  const resetReqCode = generateInterfaceFromSchema("PasswordResetRequest", resetReqSchema, spec);

  const emailVerifyReqSchema = spec.components?.schemas?.["EmailVerifyRequest"];
  if (!emailVerifyReqSchema) throw new Error("Missing EmailVerifyRequest schema");
  const emailVerifyReqCode = generateInterfaceFromSchema("EmailVerifyRequest", emailVerifyReqSchema, spec);

  const emailResendReqSchema = spec.components?.schemas?.["PassengerEmailResendRequest"];
  if (!emailResendReqSchema) throw new Error("Missing PassengerEmailResendRequest schema");
  const emailResendReqCode = generateInterfaceFromSchema("PassengerEmailResendRequest", emailResendReqSchema, spec);

  const staffLoginReqSchema = spec.components?.schemas?.["StaffLoginRequest"];
  if (!staffLoginReqSchema) throw new Error("Missing StaffLoginRequest schema");
  const staffLoginReqCode = generateInterfaceFromSchema("StaffLoginRequest", staffLoginReqSchema, spec);

  // Response DTOs
  const passengerReceiptSchema = spec.components?.schemas?.["PassengerRegisterReceiptResponse"];
  if (!passengerReceiptSchema) throw new Error("Missing PassengerRegisterReceiptResponse schema");
  const passengerReceiptDataCode = generateInterfaceFromSchema(
    "PassengerRegisterReceiptData",
    passengerReceiptSchema.properties.data,
    spec
  );
  const passengerReceiptResponseCode = generateInterfaceFromSchema(
    "PassengerRegisterReceiptResponse",
    passengerReceiptSchema,
    spec,
    { data: "PassengerRegisterReceiptData" }
  );

  const passengerAuthSchema = spec.components?.schemas?.["PassengerAuthResponse"];
  if (!passengerAuthSchema) throw new Error("Missing PassengerAuthResponse schema");
  const passengerProfileSchema = passengerAuthSchema.properties.data.properties.user;
  const passengerProfileCode = generateInterfaceFromSchema("PassengerProfile", passengerProfileSchema, spec);
  const passengerAuthDataCode = generateInterfaceFromSchema(
    "PassengerAuthData",
    passengerAuthSchema.properties.data,
    spec,
    { user: "PassengerProfile" }
  );
  const passengerAuthResponseCode = generateInterfaceFromSchema(
    "PassengerAuthResponse",
    passengerAuthSchema,
    spec,
    { data: "PassengerAuthData" }
  );

  // Inline passenger responses
  const passengerLogoutResponse = spec.paths["/auth/logout"].post.responses["200"].content["application/json"].schema;
  const passengerLogoutResponseCode = generateInterfaceFromSchema(
    "PassengerLogoutResponse",
    passengerLogoutResponse,
    spec,
    { data: "{ message: string }" }
  );

  const passwordForgotResponse = spec.paths["/auth/password/forgot"].post.responses["202"].content["application/json"].schema;
  const passwordForgotResponseCode = generateInterfaceFromSchema(
    "PasswordForgotResponse",
    passwordForgotResponse,
    spec,
    { data: "{ message: string }" }
  );

  const passwordResetResponse = spec.paths["/auth/password/reset"].post.responses["200"].content["application/json"].schema;
  const passwordResetResponseCode = generateInterfaceFromSchema(
    "PasswordResetResponse",
    passwordResetResponse,
    spec,
    { data: "{ message: string }" }
  );

  const emailVerifyResponse = spec.paths["/auth/email/verify"].post.responses["200"].content["application/json"].schema;
  const emailVerifyResponseCode = generateInterfaceFromSchema(
    "EmailVerifyResponse",
    emailVerifyResponse,
    spec,
    { data: "{ verified: boolean }" }
  );

  // Staff responses
  const staffPendingAuthSchema = spec.components?.schemas?.["StaffPendingAuthResponse"];
  if (!staffPendingAuthSchema) throw new Error("Missing StaffPendingAuthResponse schema");
  const staffPendingAuthDataCode = generateInterfaceFromSchema(
    "StaffPendingAuthData",
    staffPendingAuthSchema.properties.data,
    spec
  );
  const staffPendingAuthResponseCode = generateInterfaceFromSchema(
    "StaffPendingAuthResponse",
    staffPendingAuthSchema,
    spec,
    { data: "StaffPendingAuthData" }
  );

  const staffLogoutResponse = spec.paths["/staff/logout"].post.responses["200"].content["application/json"].schema;
  const staffLogoutResponseCode = generateInterfaceFromSchema(
    "StaffLogoutResponse",
    staffLogoutResponse,
    spec,
    { data: "{ message: string }" }
  );

  const staffMeSchema = spec.components?.schemas?.["StaffMeResponse"];
  if (!staffMeSchema) throw new Error("Missing StaffMeResponse schema");
  const staffProfileCode = generateInterfaceFromSchema("StaffProfile", staffMeSchema.properties.data, spec);
  const staffMeResponseCode = generateInterfaceFromSchema(
    "StaffMeResponse",
    staffMeSchema,
    spec,
    { data: "StaffProfile" }
  );

  // Error schema
  const errorDetailCode = generateInterfaceFromSchema("ErrorDetail", errorDetailSchema, spec);
  const errorMetaCode = generateInterfaceFromSchema("ErrorMeta", errorSchema.properties.meta, spec);
  const errorResponseCode = generateInterfaceFromSchema("ErrorResponse", errorSchema, spec, {
    error: "ErrorDetail",
    meta: "ErrorMeta",
  });

  const sections = [
    "/**",
    " * Gaza Gateway / Palestinian Airlines",
    " * Phase 13B Identity API — Narrow Generated Types",
    " *",
    " * Auto-generated from docs/backend/openapi.v1.json by scripts/generate-identity-api-types.mjs.",
    " * DO NOT HAND-EDIT THIS FILE DIRECTLY. Run `node scripts/generate-identity-api-types.mjs` to regenerate.",
    " */",
    "",
    successMetaCode,
    "",
    csrfTokenCode,
    "",
    "// --- Request DTOs ---",
    registerReqCode,
    "",
    loginReqCode,
    "",
    forgotReqCode,
    "",
    resetReqCode,
    "",
    emailVerifyReqCode,
    "",
    emailResendReqCode,
    "",
    staffLoginReqCode,
    "",
    "// --- Response Data & Envelopes ---",
    passengerReceiptDataCode,
    "",
    passengerReceiptResponseCode,
    "",
    passengerProfileCode,
    "",
    passengerAuthDataCode,
    "",
    passengerAuthResponseCode,
    "",
    passengerLogoutResponseCode,
    "",
    passwordForgotResponseCode,
    "",
    passwordResetResponseCode,
    "",
    emailVerifyResponseCode,
    "",
    "export type PassengerEmailResendResponse = PassengerRegisterReceiptResponse;",
    "",
    staffPendingAuthDataCode,
    "",
    staffPendingAuthResponseCode,
    "",
    staffLogoutResponseCode,
    "",
    staffProfileCode,
    "",
    staffMeResponseCode,
    "",
    "// --- Error Structures ---",
    errorDetailCode,
    "",
    errorMetaCode,
    "",
    errorResponseCode,
    "",
    "export type IdentityResponse =",
    "  | CsrfTokenResponse",
    "  | PassengerRegisterReceiptResponse",
    "  | PassengerAuthResponse",
    "  | PassengerLogoutResponse",
    "  | PasswordForgotResponse",
    "  | PasswordResetResponse",
    "  | EmailVerifyResponse",
    "  | StaffPendingAuthResponse",
    "  | StaffLogoutResponse",
    "  | StaffMeResponse;",
    "",
  ];

  return sections.join("\n");
}

/**
 * Generates the narrow contract JSON artifact for the 12 identity operations.
 */
export function generateIdentityApiContract(spec) {
  if (!spec || typeof spec !== "object") {
    throw new Error("Invalid OpenAPI specification object");
  }

  // Pre-validate that all operations and schemas are reachable
  generateIdentityApiTypes(spec);

  const reachableSchemas = {
    RegisterRequest: spec.components?.schemas?.["RegisterRequest"],
    LoginRequest: spec.components?.schemas?.["LoginRequest"],
    PasswordForgotRequest: spec.components?.schemas?.["PasswordForgotRequest"],
    PasswordResetRequest: spec.components?.schemas?.["PasswordResetRequest"],
    EmailVerifyRequest: spec.components?.schemas?.["EmailVerifyRequest"],
    PassengerEmailResendRequest: spec.components?.schemas?.["PassengerEmailResendRequest"],
    StaffLoginRequest: spec.components?.schemas?.["StaffLoginRequest"],
    PassengerRegisterReceiptResponse: spec.components?.schemas?.["PassengerRegisterReceiptResponse"],
    PassengerAuthResponse: spec.components?.schemas?.["PassengerAuthResponse"],
    StaffPendingAuthResponse: spec.components?.schemas?.["StaffPendingAuthResponse"],
    StaffMeResponse: spec.components?.schemas?.["StaffMeResponse"],
    ErrorResponse: spec.components?.schemas?.["ErrorResponse"],
    ErrorDetail: spec.components?.schemas?.["ErrorDetail"],
    SuccessMeta: spec.components?.schemas?.["SuccessMeta"],
    CsrfTokenResponse: spec.components?.schemas?.["CsrfTokenResponse"],
    PassengerLogoutResponse: spec.paths?.["/auth/logout"]?.post?.responses?.["200"]?.content?.["application/json"]?.schema,
    PasswordForgotResponse: spec.paths?.["/auth/password/forgot"]?.post?.responses?.["202"]?.content?.["application/json"]?.schema,
    PasswordResetResponse: spec.paths?.["/auth/password/reset"]?.post?.responses?.["200"]?.content?.["application/json"]?.schema,
    EmailVerifyResponse: spec.paths?.["/auth/email/verify"]?.post?.responses?.["200"]?.content?.["application/json"]?.schema,
    StaffLogoutResponse: spec.paths?.["/staff/logout"]?.post?.responses?.["200"]?.content?.["application/json"]?.schema,
  };

  function canonicalStringify(obj) {
    if (obj === null || typeof obj !== "object") {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return "[" + obj.map(canonicalStringify).join(",") + "]";
    }
    const keys = Object.keys(obj).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalStringify(obj[k])).join(",") + "}";
  }

  const schemaDigest = crypto.createHash("sha256").update(canonicalStringify(reachableSchemas)).digest("hex");

  return (
    JSON.stringify(
      {
        $schema: "identity-api-contract-v1",
        version: "1.0.0",
        description: "Narrow contract extraction for 12 accepted Phase 13B identity transport operations",
        digest: schemaDigest,
        operations: ACCEPTED_IDENTITY_OPERATIONS,
        schemas: reachableSchemas,
      },
      null,
      2
    ) + "\n"
  );
}

/**
 * Checks whether existing disk artifacts match freshly generated types and contract.
 */
export function checkIdentityApiTypes(
  typesPath = DEFAULT_TYPES_OUTPUT_PATH,
  contractPath = DEFAULT_CONTRACT_OUTPUT_PATH,
  specPath = DEFAULT_SPEC_PATH
) {
  if (!fs.existsSync(specPath)) {
    throw new Error(`OpenAPI spec not found at: ${specPath}`);
  }
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const expectedTypesContent = generateIdentityApiTypes(spec);
  const expectedContractContent = generateIdentityApiContract(spec);

  if (!fs.existsSync(typesPath)) {
    return { ok: false, reason: `Types file does not exist: ${typesPath}` };
  }
  if (!fs.existsSync(contractPath)) {
    return { ok: false, reason: `Contract file does not exist: ${contractPath}` };
  }

  const actualTypesContent = fs.readFileSync(typesPath, "utf8").replace(/\r\n/g, "\n");
  if (actualTypesContent !== expectedTypesContent) {
    return { ok: false, reason: "Types file content does not match freshly generated types" };
  }

  const actualContractContent = fs.readFileSync(contractPath, "utf8").replace(/\r\n/g, "\n");
  if (actualContractContent !== expectedContractContent) {
    return { ok: false, reason: "Contract file content does not match freshly generated contract" };
  }

  return { ok: true, reason: null };
}

/**
 * CLI Entrypoint
 */
export function runCli(argv = process.argv.slice(2)) {
  for (const arg of argv) {
    if (arg !== "--check") {
      console.error(`Unknown argument '${arg}'. Supported argument: '--check'.`);
      return 1;
    }
  }

  const isCheck = argv.includes("--check");
  const specPath = DEFAULT_SPEC_PATH;
  const typesPath = DEFAULT_TYPES_OUTPUT_PATH;
  const contractPath = DEFAULT_CONTRACT_OUTPUT_PATH;

  if (isCheck) {
    const result = checkIdentityApiTypes(typesPath, contractPath, specPath);
    if (!result.ok) {
      console.error(`✗ Stale artifact: ${result.reason}`);
      console.error("  Run 'node scripts/generate-identity-api-types.mjs' to regenerate.");
      return 1;
    }
    console.log(`✓ Identity API types and contract are up to date.`);
    return 0;
  }

  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const typesContent = generateIdentityApiTypes(spec);
  const contractContent = generateIdentityApiContract(spec);

  fs.mkdirSync(path.dirname(typesPath), { recursive: true });
  fs.writeFileSync(typesPath, typesContent, "utf8");
  fs.writeFileSync(contractPath, contractContent, "utf8");

  console.log(`✓ Generated ${path.relative(repositoryRoot, typesPath)} and ${path.relative(repositoryRoot, contractPath)} successfully.`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = runCli();
}
