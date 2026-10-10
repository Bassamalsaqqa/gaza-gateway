#!/usr/bin/env node
/**
 * Gaza Gateway - Identity HTTP Command Contracts Generator
 *
 * Generates an immutable, deterministic JSON schema artifact for all accepted
 * identity operations (/auth/* and /staff/*) from docs/backend/openapi.v1.json.
 *
 * Invariants:
 * - Deterministic output with canonical schema digest (SHA-256)
 * - LF line endings
 * - Preserves refs with siblings and reachable constraints
 * - Fails closed on unsupported assertion keywords, malformed shapes, or invalid containers
 * - Supports --check mode (exits non-zero if missing, stale, or tampered)
 * - Supports --spec <path> and --out <path> for isolated corruption testing
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const DEFAULT_OPENAPI_PATH = path.join(REPO_ROOT, 'docs/backend/openapi.v1.json');
const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, 'backend/app/Identity/Contracts');
const DEFAULT_OUTPUT_FILE = path.join(DEFAULT_OUTPUT_DIR, 'identity-command-contracts.v1.json');

const SUPPORTED_ASSERTION_KEYWORDS = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'enum',
  'const',
  'oneOf',
  'anyOf',
  'allOf',
  'not',
  '$ref',
]);

const INFORMATIONAL_KEYWORDS = new Set([
  '$schema',
  '$id',
  '$comment',
  'title',
  'description',
  'default',
  'example',
  'examples',
  'deprecated',
  'readOnly',
  'writeOnly',
]);

const SUPPORTED_FORMATS = new Set([
  'email',
  'uuid',
  'date',
  'date-time',
  'time',
  'uri',
]);

const SUPPORTED_TYPES = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'array',
  'object',
  'null',
]);

const ACCEPTED_BOOKING_OPERATION_TUPLES = new Set([
  'POST /bookings/{ref}/challenge postCreateGuestChallenge',
  'POST /bookings/{ref}/verify-challenge postVerifyGuestChallenge',
  'POST /account/bookings/claim/challenge postCreateClaimChallenge',
  'POST /account/bookings/claim/verify postVerifyClaimChallenge',
  'POST /account/bookings/claim postClaimBookingToAccount',
]);

/**
 * Deep equality helper matching JSON Schema rules.
 */
function deepEquals(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    return Number.isFinite(a) && Number.isFinite(b) && a === b;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (a === null || b === null) {
    return a === b;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEquals(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  if (typeof a === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!Object.prototype.hasOwnProperty.call(b, key) || !deepEquals(a[key], b[key])) {
        return false;
      }
    }
    return true;
  }
  return a === b;
}

/**
 * Preflight schema validation. Fails closed on unknown keywords or malformed shapes.
 */
export function preflightSchema(schema, rootSpec, visitedRefs = new Set(), depth = 0) {
  if (depth > 50) {
    throw new Error('Maximum schema depth exceeded (possible cycle)');
  }

  // Boolean schema nodes: true accepts all, false rejects all. Valid in JSON Schema 2020-12.
  if (typeof schema === 'boolean') {
    return;
  }

  if (schema === null || typeof schema !== 'object') {
    throw new Error(`Invalid schema node at depth ${depth}: must be object or boolean`);
  }
  if (Array.isArray(schema)) {
    throw new Error(`Invalid schema node at depth ${depth}: expected object map, got array`);
  }

  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_ASSERTION_KEYWORDS.has(key) && !INFORMATIONAL_KEYWORDS.has(key)) {
      throw new Error(`Unsupported schema keyword '${key}' (fail-closed policy)`);
    }
  }

  // 1. type
  if (Object.prototype.hasOwnProperty.call(schema, 'type')) {
    const type = schema.type;
    if (typeof type === 'string') {
      if (!SUPPORTED_TYPES.has(type)) {
        throw new Error(`Unsupported schema type '${type}'`);
      }
    } else if (Array.isArray(type)) {
      if (type.length === 0) {
        throw new Error('Schema type array cannot be empty');
      }
      const seenTypes = new Set();
      for (const t of type) {
        if (typeof t !== 'string' || !SUPPORTED_TYPES.has(t)) {
          throw new Error(`Unsupported schema type '${t}' in union`);
        }
        if (seenTypes.has(t)) {
          throw new Error(`Duplicate type '${t}' in schema type union`);
        }
        seenTypes.add(t);
      }
    } else {
      throw new Error(`Invalid schema type definition: expected string or array, got ${typeof type}`);
    }
  }

  // 2. format
  if (Object.prototype.hasOwnProperty.call(schema, 'format')) {
    const format = schema.format;
    if (typeof format !== 'string' || !SUPPORTED_FORMATS.has(format)) {
      throw new Error(`Unsupported format '${format}'`);
    }
  }

  // 3. Numeric bounds: minimum, maximum, exclusiveMinimum, exclusiveMaximum
  for (const kw of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum']) {
    if (Object.prototype.hasOwnProperty.call(schema, kw)) {
      const val = schema[kw];
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        throw new Error(`Keyword '${kw}' must be a finite number, got ${typeof val}`);
      }
    }
  }

  // 4. multipleOf
  if (Object.prototype.hasOwnProperty.call(schema, 'multipleOf')) {
    const val = schema.multipleOf;
    if (typeof val !== 'number' || !Number.isFinite(val) || val <= 0) {
      throw new Error("Keyword 'multipleOf' must be a finite positive number (> 0)");
    }
  }

  // 5. Non-negative integer bounds: minLength, maxLength, minItems, maxItems
  for (const kw of ['minLength', 'maxLength', 'minItems', 'maxItems']) {
    if (Object.prototype.hasOwnProperty.call(schema, kw)) {
      const val = schema[kw];
      if (!Number.isInteger(val) || val < 0) {
        throw new Error(`Keyword '${kw}' must be a non-negative integer, got ${val}`);
      }
    }
  }

  // 6. uniqueItems
  if (Object.prototype.hasOwnProperty.call(schema, 'uniqueItems')) {
    if (typeof schema.uniqueItems !== 'boolean') {
      throw new Error("Keyword 'uniqueItems' must be a boolean");
    }
  }

  // 7. pattern
  if (Object.prototype.hasOwnProperty.call(schema, 'pattern')) {
    const pattern = schema.pattern;
    if (typeof pattern !== 'string') {
      throw new Error(`Keyword 'pattern' must be a string, got ${typeof pattern}`);
    }
    try {
      new RegExp(pattern, 'u');
    } catch (e) {
      throw new Error(`Invalid regex pattern '${pattern}': ${e.message}`);
    }
  }

  // 8. enum
  if (Object.prototype.hasOwnProperty.call(schema, 'enum')) {
    const enumVals = schema.enum;
    if (!Array.isArray(enumVals) || enumVals.length === 0) {
      throw new Error("Keyword 'enum' must be a non-empty array");
    }
    for (let i = 0; i < enumVals.length; i++) {
      for (let j = i + 1; j < enumVals.length; j++) {
        if (deepEquals(enumVals[i], enumVals[j])) {
          throw new Error("Keyword 'enum' contains duplicate values");
        }
      }
    }
  }

  // 9. required
  if (Object.prototype.hasOwnProperty.call(schema, 'required')) {
    const req = schema.required;
    if (!Array.isArray(req)) {
      throw new Error("Keyword 'required' must be an array of strings");
    }
    const seenReq = new Set();
    for (const r of req) {
      if (typeof r !== 'string' || r === '') {
        throw new Error('Required field names must be non-empty strings');
      }
      if (seenReq.has(r)) {
        throw new Error(`Duplicate field name '${r}' in required list`);
      }
      seenReq.add(r);
    }
  }

  // 10. properties
  if (Object.prototype.hasOwnProperty.call(schema, 'properties')) {
    const props = schema.properties;
    if (typeof props !== 'object' || props === null || Array.isArray(props)) {
      throw new Error("Keyword 'properties' must be an associative map");
    }
    for (const [propName, propSchema] of Object.entries(props)) {
      preflightSchema(propSchema, rootSpec, visitedRefs, depth + 1);
    }
  }

  // 11. additionalProperties
  if (Object.prototype.hasOwnProperty.call(schema, 'additionalProperties')) {
    const addProps = schema.additionalProperties;
    if (typeof addProps === 'object' && addProps !== null) {
      preflightSchema(addProps, rootSpec, visitedRefs, depth + 1);
    } else if (typeof addProps !== 'boolean') {
      throw new Error("Keyword 'additionalProperties' must be boolean or schema object");
    }
  }

  // 12. items: must reject array-form items tuple
  if (Object.prototype.hasOwnProperty.call(schema, 'items')) {
    const items = schema.items;
    if (Array.isArray(items)) {
      throw new Error('Array-form items tuple is unsupported (fail-closed policy)');
    }
    if (typeof items !== 'object' && typeof items !== 'boolean') {
      throw new Error("Keyword 'items' must be a schema map or boolean");
    }
    preflightSchema(items, rootSpec, visitedRefs, depth + 1);
  }

  // 13. not: must recurse
  if (Object.prototype.hasOwnProperty.call(schema, 'not')) {
    const notVal = schema.not;
    if (typeof notVal !== 'object' && typeof notVal !== 'boolean') {
      throw new Error("Keyword 'not' must be a schema map or boolean");
    }
    preflightSchema(notVal, rootSpec, visitedRefs, depth + 1);
  }

  // 14. Combinators: allOf, anyOf, oneOf
  for (const comb of ['allOf', 'anyOf', 'oneOf']) {
    if (Object.prototype.hasOwnProperty.call(schema, comb)) {
      const branches = schema[comb];
      if (!Array.isArray(branches) || branches.length === 0) {
        throw new Error(`${comb} must be non-empty array of schemas`);
      }
      for (const branch of branches) {
        preflightSchema(branch, rootSpec, visitedRefs, depth + 1);
      }
    }
  }

  // 15. $ref with conjunctive siblings
  if (Object.prototype.hasOwnProperty.call(schema, '$ref')) {
    const ref = schema.$ref;
    if (typeof ref !== 'string' || !ref.startsWith('#/')) {
      throw new Error(`Invalid $ref format: '${ref}'`);
    }
    if (visitedRefs.has(ref)) {
      throw new Error(`Cyclic schema reference detected: '${ref}'`);
    }
    const target = resolveJsonPointer(rootSpec, ref);
    if (!target) {
      throw new Error(`Dangling reference: '${ref}'`);
    }
    const nextVisited = new Set(visitedRefs);
    nextVisited.add(ref);
    preflightSchema(target, rootSpec, nextVisited, depth + 1);

    // Conjunctive sibling preflight
    const siblingKeys = Object.keys(schema).filter((k) => k !== '$ref');
    if (siblingKeys.length > 0) {
      const siblingSchema = {};
      for (const k of siblingKeys) {
        siblingSchema[k] = schema[k];
      }
      preflightSchema(siblingSchema, rootSpec, visitedRefs, depth + 1);
    }
  }
}

/**
 * Resolves a local JSON pointer against the root specification.
 */
export function resolveJsonPointer(root, pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('#/')) return null;
  const parts = pointer.slice(2).split('/');
  let curr = root;
  for (const part of parts) {
    const unescaped = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (curr && typeof curr === 'object' && unescaped in curr) {
      curr = curr[unescaped];
    } else {
      return null;
    }
  }
  return curr;
}

/**
 * Recursively sort keys of objects to produce deterministic canonical structure.
 */
function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys(value[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Scans a schema node transitively for all $ref strings.
 */
function collectAllRefs(node, refSet) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectAllRefs(item, refSet);
    return;
  }
  if (typeof node.$ref === 'string') {
    refSet.add(node.$ref);
  }
  for (const val of Object.values(node)) {
    collectAllRefs(val, refSet);
  }
}

/**
 * Generates the contract structure from the OpenAPI spec.
 */
export function generateContracts(spec) {
  const operations = {};
  const referencedSchemas = new Set();
  const seenRouteKeys = new Set();
  const matchedBookingTuples = new Set();
  const matchedIdentityOperations = new Set();

  for (const [routePath, pathItem] of Object.entries(spec.paths || {})) {
    const isPrefixAllowed = routePath.startsWith('/auth/') || routePath.startsWith('/staff/');
    const isExplicitPath = [
      '/bookings/{ref}/challenge',
      '/bookings/{ref}/verify-challenge',
      '/account/bookings/claim/challenge',
      '/account/bookings/claim/verify',
      '/account/bookings/claim',
    ].includes(routePath);

    if (!isPrefixAllowed && !isExplicitPath) {
      continue;
    }

    // Extract path template parameters e.g. /staff/sessions/{id} -> ['id']
    const pathParamsInTemplate = [...routePath.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);

    for (const [httpMethod, rawOp] of Object.entries(pathItem)) {
      const methodUpper = httpMethod.toUpperCase();
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(methodUpper)) {
        continue;
      }

      // Resolve operation if it's a ref (or has container refs)
      const op = rawOp.$ref ? resolveJsonPointer(spec, rawOp.$ref) : rawOp;
      if (!op) {
        throw new Error(`Unresolved operation reference at ${methodUpper} ${routePath}`);
      }

      const operationId = op.operationId;
      if (!operationId || typeof operationId !== 'string') {
        throw new Error(`Missing or invalid operationId at ${methodUpper} ${routePath}`);
      }

      if (!isPrefixAllowed) {
        const tuple = `${methodUpper} ${routePath} ${operationId}`;
        if (!ACCEPTED_BOOKING_OPERATION_TUPLES.has(tuple)) {
          continue;
        }
        matchedBookingTuples.add(tuple);
      } else {
        matchedIdentityOperations.add(operationId);
      }

      if (operations[operationId]) {
        throw new Error(`Duplicate operationId '${operationId}' at ${methodUpper} ${routePath}`);
      }

      const routeKey = `${methodUpper} ${routePath}`;
      if (seenRouteKeys.has(routeKey)) {
        throw new Error(`Duplicate route definition '${routeKey}'`);
      }
      seenRouteKeys.add(routeKey);

      // Resolve requestBody container
      let hasBody = false;
      let bodyRequired = false;
      let requestBodySchema = null;

      if (op.requestBody) {
        let reqBody = op.requestBody;
        if (reqBody.$ref) {
          reqBody = resolveJsonPointer(spec, reqBody.$ref);
          if (!reqBody) {
            throw new Error(`Unresolved requestBody reference '${op.requestBody.$ref}' in ${operationId}`);
          }
        }

        hasBody = true;
        bodyRequired = Boolean(reqBody.required);

        const jsonContent = reqBody.content?.['application/json'];
        if (!jsonContent || !jsonContent.schema) {
          throw new Error(`Missing application/json schema for ${operationId} at ${routeKey}`);
        }

        requestBodySchema = jsonContent.schema;
        preflightSchema(requestBodySchema, spec);
        collectAllRefs(requestBodySchema, referencedSchemas);
      }

      // Collect path and query parameters
      const parameters = [];
      const pathParamNamesFound = new Set();

      for (const p of op.parameters || []) {
        let resolved = p;
        if (p.$ref) {
          resolved = resolveJsonPointer(spec, p.$ref);
          if (!resolved) {
            throw new Error(`Unresolved parameter reference '${p.$ref}' in ${operationId}`);
          }
        }

        if (resolved.in === 'path' || resolved.in === 'query') {
          if (!resolved.name || typeof resolved.name !== 'string') {
            throw new Error(`Parameter missing name in ${operationId}`);
          }

          const isPath = resolved.in === 'path';
          const required = isPath ? true : Boolean(resolved.required);

          if (isPath) {
            pathParamNamesFound.add(resolved.name);
          }

          if (!resolved.schema || (typeof resolved.schema !== 'object' && typeof resolved.schema !== 'boolean')) {
            throw new Error(`Parameter '${resolved.name}' in ${operationId} lacks valid schema container`);
          }
          const paramSchema = resolved.schema;
          preflightSchema(paramSchema, spec);
          collectAllRefs(paramSchema, referencedSchemas);

          parameters.push({
            name: resolved.name,
            in: resolved.in,
            required,
            schema: paramSchema,
          });
        }
      }

      // Validate path template parameter declarations consistency
      for (const tParam of pathParamsInTemplate) {
        if (!pathParamNamesFound.has(tParam)) {
          throw new Error(
            `Path template param '{${tParam}}' in '${routePath}' has no matching path parameter declaration in ${operationId}`
          );
        }
      }
      for (const pName of pathParamNamesFound) {
        if (!pathParamsInTemplate.includes(pName)) {
          throw new Error(
            `Path parameter '${pName}' in ${operationId} is not declared in path template '${routePath}'`
          );
        }
      }

      operations[operationId] = {
        operationId,
        method: methodUpper,
        path: routePath,
        hasBody,
        bodyRequired,
        requestBodySchema,
        parameters,
      };
    }
  }

  for (const expectedTuple of ACCEPTED_BOOKING_OPERATION_TUPLES) {
    if (!matchedBookingTuples.has(expectedTuple)) {
      throw new Error(`Expected booking operation tuple missing: '${expectedTuple}'`);
    }
  }
  if (matchedBookingTuples.size !== 5) {
    throw new Error(`Expected exactly 5 booking operation tuples, found ${matchedBookingTuples.size}`);
  }
  if (matchedIdentityOperations.size !== 41) {
    throw new Error(`Expected exactly 41 identity operations, found ${matchedIdentityOperations.size}`);
  }
  if (Object.keys(operations).length !== 46) {
    throw new Error(`Expected exactly 46 total operations, found ${Object.keys(operations).length}`);
  }

  // Transitively collect all referenced components
  const schemas = {};
  const queue = Array.from(referencedSchemas);
  const seenRefs = new Set();

  while (queue.length > 0) {
    const ref = queue.shift();
    if (seenRefs.has(ref)) continue;
    seenRefs.add(ref);

    const targetSchema = resolveJsonPointer(spec, ref);
    if (!targetSchema) {
      throw new Error(`Unresolved schema reference: ${ref}`);
    }

    preflightSchema(targetSchema, spec);
    schemas[ref] = targetSchema;

    const nestedRefs = new Set();
    collectAllRefs(targetSchema, nestedRefs);
    for (const nestedRef of nestedRefs) {
      if (!seenRefs.has(nestedRef)) {
        queue.push(nestedRef);
      }
    }
  }

  const sortedOperations = sortKeys(operations);
  const sortedSchemas = sortKeys(schemas);

  // Compute canonical digest from sorted operations and schemas
  const canonicalString = JSON.stringify({
    operations: sortedOperations,
    schemas: sortedSchemas,
  });
  const digest = `sha256:${crypto.createHash('sha256').update(canonicalString).digest('hex')}`;

  const artifact = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    contractVersion: '1.0.0',
    phase: '13B',
    canonicalDigest: digest,
    operationCount: Object.keys(sortedOperations).length,
    operations: sortedOperations,
    schemas: sortedSchemas,
  };

  return {
    artifact,
    jsonString: JSON.stringify(sortKeys(artifact), null, 2) + '\n',
    digest,
    operationCount: Object.keys(sortedOperations).length,
  };
}

// CLI Execution
if (process.argv[1] === __filename) {
  const isCheckMode = process.argv.includes('--check');

  // Support --spec <path> and --out <path>
  let specPath = DEFAULT_OPENAPI_PATH;
  let outPath = DEFAULT_OUTPUT_FILE;

  const specIdx = process.argv.indexOf('--spec');
  if (specIdx !== -1 && process.argv[specIdx + 1]) {
    specPath = path.resolve(process.argv[specIdx + 1]);
  }

  const outIdx = process.argv.indexOf('--out');
  if (outIdx !== -1 && process.argv[outIdx + 1]) {
    outPath = path.resolve(process.argv[outIdx + 1]);
  }

  if (!fs.existsSync(specPath)) {
    console.error(`[FAIL] OpenAPI specification not found at: ${specPath}`);
    process.exit(1);
  }

  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  } catch (err) {
    console.error(`[FAIL] Failed to parse OpenAPI specification: ${err.message}`);
    process.exit(1);
  }

  let result;
  try {
    result = generateContracts(spec);
  } catch (err) {
    console.error(`[FAIL] Contract generation error: ${err.message}`);
    process.exit(1);
  }

  const { jsonString, digest, operationCount } = result;

  if (isCheckMode) {
    if (!fs.existsSync(outPath)) {
      console.error(`[FAIL] Contract artifact missing at: ${outPath}`);
      process.exit(1);
    }
    const existingContent = fs.readFileSync(outPath, 'utf8');
    if (existingContent !== jsonString) {
      console.error(`[FAIL] Contract artifact is stale or tampered (digest mismatch)`);
      process.exit(1);
    }
    console.log(`[PASS] Identity command contracts in sync (${operationCount} operations, digest: ${digest})`);
    process.exit(0);
  } else {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, jsonString, 'utf8');
    console.log(`[OK] Generated identity command contracts artifact:`);
    console.log(`     Target: ${outPath}`);
    console.log(`     Operations: ${operationCount}`);
    console.log(`     Canonical digest: ${digest}`);
    process.exit(0);
  }
}
