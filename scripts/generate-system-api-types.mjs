import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const repositoryRoot = path.resolve(__dirname, "..");
export const DEFAULT_SPEC_PATH = path.join(repositoryRoot, "docs/backend/openapi.v1.json");
export const DEFAULT_OUTPUT_PATH = path.join(repositoryRoot, "src/lib/api/system-types.ts");

const SUPPORTED_SCHEMA_KEYS = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "const",
  "format",
  "example",
  "items",
  "$ref",
  "description",
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
    // Sibling assertions alongside $ref are rejected fail-closed
    for (const key of Object.keys(schema)) {
      if (key !== "$ref" && key !== "description") {
        throw new Error(`Unsupported sibling assertion '${key}' alongside $ref at ${pathTrace}. Generator fails closed.`);
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
      if (!componentName) {
        throw new Error(`Malformed $ref with empty component name at ${pathTrace}`);
      }

      if (activeStack.includes(componentName)) {
        throw new Error(
          `Circular schema reference detected: ${activeStack.join(" -> ")} -> ${componentName} at ${pathTrace}`
        );
      }

      const target = spec.components?.schemas?.[componentName];
      if (!target) {
        throw new Error(`Dangling schema reference '${ref}' at ${pathTrace}. Target component not found.`);
      }

      referencedComponentNames.add(componentName);

      traverse(target, `components.schemas.${componentName}`, [...activeStack, componentName]);
      return;
    }

    if (schemaNode.type === "object") {
      if (schemaNode.properties) {
        for (const [propName, propSchema] of Object.entries(schemaNode.properties)) {
          traverse(propSchema, `${pathTrace}.properties.${propName}`, activeStack);
        }
      }
      if (schemaNode.additionalProperties && typeof schemaNode.additionalProperties === "object") {
        traverse(schemaNode.additionalProperties, `${pathTrace}.additionalProperties`, activeStack);
      }
    } else if (schemaNode.type === "array") {
      if (schemaNode.items) {
        traverse(schemaNode.items, `${pathTrace}.items`, activeStack);
      }
    }
  }

  for (const { schema, path } of rootSchemas) {
    traverse(schema, path, []);
  }

  return referencedComponentNames;
}

/**
 * Resolves a schema reference or returns the schema directly.
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
 * Maps a schema type definition to its TypeScript type string based on AST.
 */
function resolveTypeScriptType(propSchema, spec, pathTrace) {
  if (propSchema.const !== undefined) {
    return JSON.stringify(propSchema.const);
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
      const valType = resolveTypeScriptType(propSchema.additionalProperties, spec, `${pathTrace}.additionalProperties`);
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
    const typeStr = propertyTypeOverrides[propName] ?? resolveTypeScriptType(propSchema, spec, `${interfaceName}.${propName}`);
    lines.push(`  ${propName}${opt}: ${typeStr};`);
  }

  lines.push(`}`);
  return lines.join("\n");
}

/**
 * Generates the narrow TypeScript type definitions for Phase 13A System API.
 * Traversing actual OpenAPI AST to derive properties and types dynamically.
 */
export function generateSystemApiTypes(spec) {
  if (!spec || typeof spec !== "object") {
    throw new Error("Invalid OpenAPI specification object");
  }

  // 1. Verify existence of the 3 operation paths and 200 responses
  const healthPath = spec.paths?.["/health"]?.get;
  const readyPath = spec.paths?.["/health/ready"]?.get;
  const versionPath = spec.paths?.["/version"]?.get;

  if (!healthPath) throw new Error("Missing /health GET operation in OpenAPI spec");
  if (!readyPath) throw new Error("Missing /health/ready GET operation in OpenAPI spec");
  if (!versionPath) throw new Error("Missing /version GET operation in OpenAPI spec");

  const healthSchemaRef = healthPath.responses?.["200"]?.content?.["application/json"]?.schema;
  const readySchemaRef = readyPath.responses?.["200"]?.content?.["application/json"]?.schema;
  const versionSchemaRef = versionPath.responses?.["200"]?.content?.["application/json"]?.schema;

  if (!healthSchemaRef) throw new Error("Missing 200 application/json schema for /health");
  if (!readySchemaRef) throw new Error("Missing 200 application/json schema for /health/ready");
  if (!versionSchemaRef) throw new Error("Missing 200 application/json schema for /version");

  const errorSchema = spec.components?.schemas?.["ErrorResponse"];
  const errorDetailSchema = spec.components?.schemas?.["ErrorDetail"];
  const successMetaSchema = spec.components?.schemas?.["SuccessMeta"];

  if (!errorSchema) throw new Error("Missing ErrorResponse schema in components.schemas");
  if (!errorDetailSchema) throw new Error("Missing ErrorDetail schema in components.schemas");
  if (!successMetaSchema) throw new Error("Missing SuccessMeta schema in components.schemas");

  // 2. Preflight all reachable schemas from root operations and components
  const rootSchemas = [
    { schema: healthSchemaRef, path: "paths['/health'].responses['200'].content['application/json'].schema" },
    { schema: readySchemaRef, path: "paths['/health/ready'].responses['200'].content['application/json'].schema" },
    { schema: versionSchemaRef, path: "paths['/version'].responses['200'].content['application/json'].schema" },
    { schema: errorSchema, path: "components.schemas['ErrorResponse']" },
  ];
  const referencedComponents = preflightReachableReferences(spec, rootSchemas);

  // 3. Resolve top-level schemas
  const healthRes = resolveSchema(spec, healthSchemaRef);
  const readyRes = resolveSchema(spec, readySchemaRef);
  const versionRes = resolveSchema(spec, versionSchemaRef);

  // 4. Validate exact property constraints for the 3 system operations and ErrorResponse
  if (healthRes.schema.properties?.success?.const !== true) {
    throw new Error("HealthStatusResponse.success must have const: true");
  }
  if (readyRes.schema.properties?.success?.const !== true) {
    throw new Error("ReadinessStatusResponse.success must have const: true");
  }
  if (versionRes.schema.properties?.success?.const !== true) {
    throw new Error("VersionResponse.success must have const: true");
  }
  if (errorSchema.properties?.success?.const !== false) {
    throw new Error("ErrorResponse.success must have const: false");
  }

  // 5. Generate interfaces driven by AST
  const successMetaCode = generateInterfaceFromSchema("SuccessMeta", successMetaSchema, spec);
  const healthDataCode = generateInterfaceFromSchema("HealthStatusData", healthRes.schema.properties.data, spec);
  const healthResponseCode = generateInterfaceFromSchema("HealthStatusResponse", healthRes.schema, spec, {
    data: "HealthStatusData",
  });

  const readyDataCode = generateInterfaceFromSchema("ReadinessStatusData", readyRes.schema.properties.data, spec);
  const readyResponseCode = generateInterfaceFromSchema("ReadinessStatusResponse", readyRes.schema, spec, {
    data: "ReadinessStatusData",
  });

  const versionDataCode = generateInterfaceFromSchema("VersionData", versionRes.schema.properties.data, spec);
  const versionResponseCode = generateInterfaceFromSchema("VersionResponse", versionRes.schema, spec, {
    data: "VersionData",
  });

  const errorDetailCode = generateInterfaceFromSchema("ErrorDetail", errorDetailSchema, spec);
  const errorMetaCode = generateInterfaceFromSchema("ErrorMeta", errorSchema.properties.meta, spec);
  const errorResponseCode = generateInterfaceFromSchema("ErrorResponse", errorSchema, spec, {
    error: "ErrorDetail",
    meta: "ErrorMeta",
  });

  // Emit any additional reachable component schemas that were referenced
  const standardNames = new Set([
    "SuccessMeta",
    "HealthStatusResponse",
    "ReadinessStatusResponse",
    "VersionResponse",
    "ErrorResponse",
    "ErrorDetail",
  ]);
  const extraDefinitions = [];
  for (const name of referencedComponents) {
    if (!standardNames.has(name)) {
      const extraSchema = spec.components?.schemas?.[name];
      if (extraSchema) {
        if (extraSchema.type === "object") {
          extraDefinitions.push(generateInterfaceFromSchema(name, extraSchema, spec));
        } else {
          extraDefinitions.push(`export type ${name} = ${resolveTypeScriptType(extraSchema, spec, name)};`);
        }
      }
    }
  }

  const sections = [
    "/**",
    " * Gaza Gateway / Palestinian Airlines",
    " * Phase 13A System API — Narrow Generated Types",
    " *",
    " * Auto-generated from docs/backend/openapi.v1.json by scripts/generate-system-api-types.mjs.",
    " * DO NOT HAND-EDIT THIS FILE DIRECTLY. Run `node scripts/generate-system-api-types.mjs` to regenerate.",
    " */",
    "",
    successMetaCode,
    "",
    ...(extraDefinitions.length > 0 ? [extraDefinitions.join("\n\n"), ""] : []),
    healthDataCode,
    "",
    healthResponseCode,
    "",
    readyDataCode,
    "",
    readyResponseCode,
    "",
    versionDataCode,
    "",
    versionResponseCode,
    "",
    errorDetailCode,
    "",
    errorMetaCode,
    "",
    errorResponseCode,
    "",
    "export type SystemResponse =",
    "  | HealthStatusResponse",
    "  | ReadinessStatusResponse",
    "  | VersionResponse;",
    "",
  ];

  return sections.join("\n");
}

/**
 * Checks whether the existing disk artifact matches the freshly generated types.
 * Returns true if matching, false if mismatch or file not found.
 */
export function checkSystemApiTypes(outputPath = DEFAULT_OUTPUT_PATH, specPath = DEFAULT_SPEC_PATH) {
  if (!fs.existsSync(specPath)) {
    throw new Error(`OpenAPI spec not found at: ${specPath}`);
  }
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const expectedContent = generateSystemApiTypes(spec);

  if (!fs.existsSync(outputPath)) {
    return { ok: false, reason: "Output file does not exist" };
  }

  const actualContent = fs.readFileSync(outputPath, "utf8").replace(/\r\n/g, "\n");
  if (actualContent !== expectedContent) {
    return { ok: false, reason: "Output file content does not match freshly generated types" };
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
  const outputPath = DEFAULT_OUTPUT_PATH;

  if (isCheck) {
    const result = checkSystemApiTypes(outputPath, specPath);
    if (!result.ok) {
      console.error(`✗ Stale artifact: ${path.relative(repositoryRoot, outputPath)} does not match OpenAPI specification.`);
      console.error(`  Reason: ${result.reason}`);
      console.error("  Run 'node scripts/generate-system-api-types.mjs' to regenerate.");
      return 1;
    }
    console.log(`✓ System API types are up to date: ${path.relative(repositoryRoot, outputPath)}`);
    return 0;
  }

  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const content = generateSystemApiTypes(spec);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, "utf8");
  console.log(`✓ Generated ${path.relative(repositoryRoot, outputPath)} successfully.`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = runCli();
}
