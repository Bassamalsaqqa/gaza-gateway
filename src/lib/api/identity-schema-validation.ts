/**
 * Gaza Gateway / Palestinian Airlines
 * Phase 13B Identity API — Pure Browser-Safe Runtime Schema Validation Gate
 *
 * Implements exact operation-bound schema gate tied directly to generated
 * identity-contract.json artifact. Pure TypeScript / browser-safe (zero Node imports).
 * Reuses accepted bounded Node validator semantic expectations from
 * scripts/lib/backend-contract-validation.mjs.
 */

import identityContract from "./identity-contract.json" with { type: "json" };
import { IdentityApiError } from "./identity-client-errors.ts";

export const contractRootDoc = Object.freeze({
  components: {
    schemas: identityContract.schemas as Record<string, unknown>,
  },
  schemas: identityContract.schemas as Record<string, unknown>,
});

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
  ])
);

export const SUPPORTED_SCHEMA_FORMATS = Object.freeze(
  new Set([
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
  ])
);

/**
 * Resolves an internal JSON pointer ($ref) against root object.
 */
export function resolveJsonPointer(
  root: unknown,
  refString: string
): { valid: boolean; target?: unknown; reason?: string } {
  if (typeof refString !== "string" || !refString.startsWith("#/")) {
    return { valid: false, reason: `Invalid internal reference format: ${refString}` };
  }
  const parts = refString.replace(/^#\//, "").split("/");
  let current: unknown = root;
  for (const part of parts) {
    const unescaped = part.replace(/~1/g, "/").replace(/~0/g, "~");
    if (current && typeof current === "object" && unescaped in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[unescaped];
    } else {
      return { valid: false, reason: `Unresolved path segment '${unescaped}' in ${refString}` };
    }
  }
  return { valid: true, target: current };
}

/**
 * Deep structural equality helper.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object") return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (Array.isArray(b)) return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }
  return true;
}

export function isValidISODate(dateStr: unknown): boolean {
  if (typeof dateStr !== "string") return false;
  if (!/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(dateStr)) return false;
  const parts = dateStr.split("-").map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;
  const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= (daysInMonth[m - 1] ?? 0);
}

export function isValidRFC3339DateTime(str: unknown): boolean {
  if (typeof str !== "string") return false;
  const regex =
    /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[Tt]([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?([Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
  const match = str.match(regex);
  if (!match) return false;
  const y = parseInt(match[1]!, 10);
  const m = parseInt(match[2]!, 10);
  const d = parseInt(match[3]!, 10);
  const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= (daysInMonth[m - 1] ?? 0);
}

export function isValidRFC3339Time(str: unknown): boolean {
  if (typeof str !== "string") return false;
  const regex =
    /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?([Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
  return regex.test(str);
}

export function isValidUri(val: unknown): boolean {
  if (typeof val !== "string") return false;
  try {
    const u = new URL(val);
    return Boolean(u.protocol);
  } catch {
    return false;
  }
}

export function matchesPrimitiveType(expectedType: string, val: unknown): boolean {
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
 * Diagnostic collector interface for bounded error tracking.
 */
export interface DiagnosticCollector {
  errors: string[];
  totalErrorBytes?: number | undefined;
}

/**
 * Centralized bounded diagnostic appender.
 * Bounds individual error length (<= 120 chars) and aggregate error bytes (<= 4096 bytes),
 * capping max errors (default 50).
 * Never suppresses every error: guarantees at least one error is recorded when invalid.
 */
export function appendDiagnostic(
  collector: DiagnosticCollector,
  rawMessage: string,
  maxErrors = 50,
  maxTotalBytes = 4096,
  maxSingleLength = 120
): boolean {
  if (collector.errors.length >= maxErrors) {
    return false;
  }
  const currentBytes = collector.totalErrorBytes ?? 0;
  if (currentBytes >= maxTotalBytes) {
    return false;
  }

  let msg = rawMessage;
  if (msg.length > maxSingleLength) {
    msg = msg.slice(0, maxSingleLength - 3) + "...";
  }

  const byteLength = typeof TextEncoder !== "undefined"
    ? new TextEncoder().encode(msg).length
    : msg.length;

  if (currentBytes + byteLength > maxTotalBytes) {
    if (collector.errors.length === 0) {
      const remainingBytes = Math.max(0, maxTotalBytes - currentBytes);
      const truncated = msg.slice(0, Math.max(1, remainingBytes - 3)) + "...";
      const finalByteLength = typeof TextEncoder !== "undefined"
        ? new TextEncoder().encode(truncated).length
        : truncated.length;
      collector.errors.push(truncated);
      collector.totalErrorBytes = currentBytes + finalByteLength;
      return true;
    }
    return false;
  }

  collector.errors.push(msg);
  collector.totalErrorBytes = currentBytes + byteLength;
  return true;
}

/**
 * Produces a canonical JSON string representation with sorted object keys.
 * Charges each visited node in the value AST to chargeCost to enforce fatal evaluation limits.
 * Avoids repeated recanonicalization using an optional WeakMap cache for objects.
 */
export function canonicalJsonString(
  val: unknown,
  chargeCost: (cost?: number) => boolean,
  cache?: WeakMap<object, string>
): string {
  if (val === null) {
    chargeCost(1);
    return "null";
  }
  const t = typeof val;
  if (t === "boolean") {
    chargeCost(1);
    return val ? "true" : "false";
  }
  if (t === "number") {
    chargeCost(1);
    return Number.isFinite(val) ? String(val) : "null";
  }
  if (t === "string") {
    chargeCost(1);
    return JSON.stringify(val);
  }
  if (t !== "object") {
    chargeCost(1);
    return "undefined";
  }

  const obj = val as object;
  if (cache && cache.has(obj)) {
    return cache.get(obj)!;
  }

  if (!chargeCost(1)) return "";

  let res: string;
  if (Array.isArray(val)) {
    const parts: string[] = [];
    for (let i = 0; i < val.length; i++) {
      const s = canonicalJsonString(val[i], chargeCost, cache);
      parts.push(s);
    }
    res = "[" + parts.join(",") + "]";
  } else {
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const s = canonicalJsonString((obj as Record<string, unknown>)[k], chargeCost, cache);
      parts.push(JSON.stringify(k) + ":" + s);
    }
    res = "{" + parts.join(",") + "}";
  }

  if (cache) {
    cache.set(obj, res);
  }
  return res;
}

/**
 * Preflights schema keywords and keyword shapes against accepted bounded dialect.
 * Recursively validates all reachable schema assertions (including $ref targets,
 * combinator branches, and not branches) before branch selection.
 */
export function preflightSchema(
  schema: unknown,
  rootDoc: unknown = contractRootDoc,
  visitedRefs: Set<string> = new Set(),
  depth = 0
): { valid: boolean; errors: string[] } {
  const collector: DiagnosticCollector = { errors: [], totalErrorBytes: 0 };
  let schemaNodeCount = 0;

  function addSchemaDiag(msg: string): boolean {
    return appendDiagnostic(collector, msg);
  }

  function checkSchema(target: unknown, path = "schema", currentDepth = depth, currentVisited = visitedRefs): void {
    if (collector.errors.length >= 50) return;

    if (++schemaNodeCount > 5000) {
      addSchemaDiag(`${path}: Aggregate schema node budget exceeded (max 5000 nodes)`);
      return;
    }

    if (currentDepth > 50) {
      addSchemaDiag(`${path}: Maximum schema preflight depth exceeded (potential cycle)`);
      return;
    }

    if (target === null) {
      addSchemaDiag(`${path}: Schema cannot be null (must be an object or boolean)`);
      return;
    }
    if (typeof target === "boolean") return;
    if (Array.isArray(target)) {
      addSchemaDiag(`${path}: Schema must be an object or boolean, got array`);
      return;
    }
    if (typeof target !== "object") {
      addSchemaDiag(`${path}: Schema must be an object or boolean, got ${typeof target}`);
      return;
    }

    const obj = target as Record<string, unknown>;

    // Fail-closed on any unrecognized schema keyword
    for (const key of Object.keys(obj)) {
      if (!DECLARED_SCHEMA_KEYWORDS.has(key)) {
        const safeKey = key.length > 32 ? key.slice(0, 29) + "..." : key;
        addSchemaDiag(
          `${path}: Unsupported schema assertion keyword '${safeKey}' (fail-closed validator policy)`
        );
        if (collector.errors.length >= 50) return;
      }
    }

    // Keyword value-shape validation: type
    if (obj["type"] !== undefined) {
      const validTypes = new Set([
        "string",
        "number",
        "integer",
        "boolean",
        "array",
        "object",
        "null",
      ]);
      if (typeof obj["type"] === "string") {
        if (!validTypes.has(obj["type"])) {
          addSchemaDiag(`${path}.type: unknown type '${obj["type"]}'`);
        }
      } else if (Array.isArray(obj["type"])) {
        if (obj["type"].length === 0) {
          addSchemaDiag(`${path}.type: type array cannot be empty`);
        }
        const seenTypes = new Set<string>();
        for (const t of obj["type"]) {
          if (typeof t !== "string" || !validTypes.has(t)) {
            addSchemaDiag(`${path}.type: unknown type in array '${String(t)}'`);
          }
          if (seenTypes.has(String(t))) {
            addSchemaDiag(`${path}.type: duplicate type in array '${String(t)}'`);
          }
          seenTypes.add(String(t));
        }
      } else {
        addSchemaDiag(`${path}.type: type must be a string or array of strings, got ${typeof obj["type"]}`);
      }
    }

    // Number bounds
    for (const numKw of ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"]) {
      if (obj[numKw] !== undefined) {
        if (typeof obj[numKw] !== "number") {
          addSchemaDiag(`${path}.${numKw}: must be a number, got ${typeof obj[numKw]}`);
        } else if (!Number.isFinite(obj[numKw])) {
          addSchemaDiag(`${path}.${numKw}: must be a finite number, got ${obj[numKw]}`);
        }
      }
    }

    if (obj["multipleOf"] !== undefined) {
      if (
        typeof obj["multipleOf"] !== "number" ||
        !Number.isFinite(obj["multipleOf"]) ||
        (obj["multipleOf"] as number) <= 0
      ) {
        addSchemaDiag(
          `${path}.multipleOf: must be a positive finite number, got ${obj["multipleOf"]}`
        );
      }
    }

    for (const intKw of ["minLength", "maxLength", "minItems", "maxItems"]) {
      if (obj[intKw] !== undefined && (!Number.isInteger(obj[intKw]) || (obj[intKw] as number) < 0)) {
        addSchemaDiag(`${path}.${intKw}: must be a non-negative integer`);
      }
    }

    if (obj["uniqueItems"] !== undefined && typeof obj["uniqueItems"] !== "boolean") {
      addSchemaDiag(`${path}.uniqueItems: must be a boolean`);
    }

    // required: must be an array of unique non-empty strings
    if (obj["required"] !== undefined) {
      if (
        !Array.isArray(obj["required"]) ||
        obj["required"].some((r) => typeof r !== "string" || r.length === 0)
      ) {
        addSchemaDiag(`${path}.required: must be an array of non-empty strings`);
      } else {
        const seenReq = new Set<string>();
        for (const r of obj["required"] as string[]) {
          if (seenReq.has(r)) {
            const safeReq = r.length > 32 ? r.slice(0, 29) + "..." : r;
            addSchemaDiag(`${path}.required: duplicate required property '${safeReq}'`);
          }
          seenReq.add(r);
        }
      }
    }

    // enum: must be a non-empty array with unique items
    if (obj["enum"] !== undefined) {
      if (!Array.isArray(obj["enum"]) || obj["enum"].length === 0) {
        addSchemaDiag(`${path}.enum: must be a non-empty array`);
      } else {
        const seenEnum = new Set<string>();
        for (let i = 0; i < obj["enum"].length; i++) {
          const itemStr = canonicalJsonString(obj["enum"][i], () => true);
          if (seenEnum.has(itemStr)) {
            addSchemaDiag(`${path}.enum: duplicate enum value at index ${i}`);
            break;
          }
          seenEnum.add(itemStr);
        }
      }
    }

    // pattern: must compile as valid RegExp
    if (obj["pattern"] !== undefined) {
      if (typeof obj["pattern"] !== "string") {
        addSchemaDiag(`${path}.pattern: must be a string`);
      } else {
        try {
          new RegExp(obj["pattern"]);
        } catch {
          addSchemaDiag(`${path}.pattern: invalid regex pattern`);
        }
      }
    }

    // format: must be in closed set of supported formats
    if (obj["format"] !== undefined) {
      if (typeof obj["format"] !== "string") {
        addSchemaDiag(`${path}.format: must be a string`);
      } else if (!SUPPORTED_SCHEMA_FORMATS.has(obj["format"])) {
        addSchemaDiag(`${path}.format: unknown format '${obj["format"]}'`);
      }
    }

    // $ref: must be non-empty string, traverse target with active-cycle detection
    if (obj["$ref"] !== undefined) {
      if (typeof obj["$ref"] !== "string" || obj["$ref"].length === 0) {
        addSchemaDiag(`${path}.$ref: must be a non-empty string`);
      } else {
        const refStr = obj["$ref"];
        if (currentVisited.has(refStr)) {
          const safeRef = refStr.length > 32 ? refStr.slice(0, 29) + "..." : refStr;
          addSchemaDiag(`${path}: Cyclic schema reference detected: ${safeRef} (recursion unsupported)`);
        } else if (rootDoc) {
          const resolved = resolveJsonPointer(rootDoc, refStr);
          if (!resolved.valid || resolved.target === undefined) {
            const safeRef = refStr.length > 32 ? refStr.slice(0, 29) + "..." : refStr;
            addSchemaDiag(`${path}.$ref: dangling reference '${safeRef}'`);
          } else {
            const nextVisited = new Set(currentVisited);
            nextVisited.add(refStr);
            checkSchema(resolved.target, `${path} -> ${refStr}`, currentDepth + 1, nextVisited);
          }
        }
      }
    }

    // Recurse into properties
    if (obj["properties"] !== undefined) {
      if (!obj["properties"] || typeof obj["properties"] !== "object" || Array.isArray(obj["properties"])) {
        addSchemaDiag(`${path}.properties: must be an object`);
      } else {
        for (const [pName, pSchema] of Object.entries(obj["properties"] as Record<string, unknown>)) {
          checkSchema(pSchema, `${path}.properties.${pName}`, currentDepth + 1, currentVisited);
          if (collector.errors.length >= 50) return;
        }
      }
    }

    // Recurse into additionalProperties
    if (obj["additionalProperties"] !== undefined) {
      if (
        typeof obj["additionalProperties"] !== "boolean" &&
        (typeof obj["additionalProperties"] !== "object" ||
          obj["additionalProperties"] === null ||
          Array.isArray(obj["additionalProperties"]))
      ) {
        addSchemaDiag(`${path}.additionalProperties: must be a boolean or schema object`);
      } else if (typeof obj["additionalProperties"] === "object" || typeof obj["additionalProperties"] === "boolean") {
        checkSchema(obj["additionalProperties"], `${path}.additionalProperties`, currentDepth + 1, currentVisited);
      }
    }

    // Recurse into items
    if (obj["items"] !== undefined) {
      if (typeof obj["items"] === "boolean") {
        // boolean items is valid
      } else if (Array.isArray(obj["items"])) {
        addSchemaDiag(`${path}.items: array-form items is unsupported`);
      } else if (typeof obj["items"] === "object" && obj["items"] !== null) {
        checkSchema(obj["items"], `${path}.items`, currentDepth + 1, currentVisited);
      } else {
        addSchemaDiag(`${path}.items: must be a schema object or boolean`);
      }
    }

    // Recurse into combinators (allOf, anyOf, oneOf)
    for (const comb of ["allOf", "anyOf", "oneOf"] as const) {
      if (obj[comb] !== undefined) {
        if (!Array.isArray(obj[comb]) || obj[comb].length === 0) {
          addSchemaDiag(`${path}.${comb}: must be a non-empty array of schemas`);
        } else {
          for (let i = 0; i < (obj[comb] as unknown[]).length; i++) {
            checkSchema((obj[comb] as unknown[])[i], `${path}.${comb}[${i}]`, currentDepth + 1, currentVisited);
            if (collector.errors.length >= 50) return;
          }
        }
      }
    }

    // Recurse into not
    if (obj["not"] !== undefined) {
      checkSchema(obj["not"], `${path}.not`, currentDepth + 1, currentVisited);
    }
  }

  checkSchema(schema);
  return { valid: collector.errors.length === 0, errors: collector.errors };
}

/**
 * Bounded JSON-value structural preflight independent of schema assertion selection.
 * Rejects cyclic, non-finite, unsupported JS values (functions, symbols, BigInts, undefined, non-plain objects)
 * without silent coercion, while enforcing depth and node limits.
 */
export function preflightJsonValue(
  value: unknown,
  maxDepth = 50,
  maxNodes = 10000
): { valid: boolean; errors: string[] } {
  const collector: DiagnosticCollector = { errors: [], totalErrorBytes: 0 };
  let nodeCount = 0;
  const activeStack = new Set<object>();

  function addJsonDiag(msg: string): boolean {
    return appendDiagnostic(collector, msg);
  }

  function traverse(val: unknown, path = "instance", currentDepth = 0): void {
    if (collector.errors.length >= 50) return;

    if (++nodeCount > maxNodes) {
      addJsonDiag(`${path}: Instance node budget exceeded during structural preflight (max ${maxNodes} nodes)`);
      return;
    }

    if (currentDepth > maxDepth) {
      addJsonDiag(`${path}: Instance maximum nesting depth exceeded (max ${maxDepth})`);
      return;
    }

    if (val === null) return;
    if (val === undefined) {
      addJsonDiag(`${path}: undefined is not a valid JSON value`);
      return;
    }

    const t = typeof val;
    if (t === "boolean" || t === "string") return;

    if (t === "number") {
      if (!Number.isFinite(val)) {
        addJsonDiag(`${path}: non-finite number is not a valid JSON value`);
      }
      return;
    }

    if (t === "function" || t === "symbol" || t === "bigint") {
      addJsonDiag(`${path}: unsupported JavaScript value type '${t}' is not valid JSON`);
      return;
    }

    if (t === "object") {
      const obj = val as object;
      if (activeStack.has(obj)) {
        addJsonDiag(`${path}: circular instance reference detected`);
        return;
      }

      if (Array.isArray(val)) {
        activeStack.add(obj);
        for (let i = 0; i < val.length; i++) {
          traverse(val[i], `${path}[${i}]`, currentDepth + 1);
          if (collector.errors.length >= 50) break;
        }
        activeStack.delete(obj);
        return;
      }

      const proto = Object.getPrototypeOf(obj);
      if (proto !== null && proto !== Object.prototype) {
        addJsonDiag(`${path}: non-plain object is not valid JSON`);
        return;
      }

      activeStack.add(obj);
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        traverse(v, `${path}.${k}`, currentDepth + 1);
        if (collector.errors.length >= 50) break;
      }
      activeStack.delete(obj);
      return;
    }

    addJsonDiag(`${path}: unknown value type '${t}'`);
  }

  traverse(value);
  return { valid: collector.errors.length === 0, errors: collector.errors };
}

export interface EvaluationContext {
  evaluationCount: number;
  maxEvaluations: number;
  budgetExhausted: boolean;
  errors: string[];
  maxErrors: number;
  totalErrorBytes?: number | undefined;
  maxErrorBytes?: number | undefined;
  canonicalCache?: WeakMap<object, string> | undefined;
}

/**
 * Validates payload against JSON schema with full $ref, composition, and constraint support.
 * Enforces instance node budgets, instance cycle detection, bounded diagnostic recording,
 * and linear canonical structural equality.
 */
export function validatePayloadAgainstSchema(
  schema: unknown,
  payload: unknown,
  rootDoc: unknown = contractRootDoc,
  depth = 0,
  context?: EvaluationContext
): { valid: boolean; errors: string[]; context?: EvaluationContext } {
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
    const jsonPreflight = preflightJsonValue(payload);
    if (!jsonPreflight.valid) {
      return { valid: false, errors: jsonPreflight.errors };
    }
  }

  if (depth > 50) {
    return { valid: false, errors: ["Maximum schema evaluation depth exceeded"] };
  }

  const ctx: EvaluationContext = context || {
    evaluationCount: 0,
    maxEvaluations: 10000,
    budgetExhausted: false,
    errors: [],
    maxErrors: 50,
    totalErrorBytes: 0,
    maxErrorBytes: 4096,
    canonicalCache: new WeakMap(),
  };

  function addDiagnostic(msg: string): boolean {
    return appendDiagnostic(ctx, msg, ctx.maxErrors, ctx.maxErrorBytes ?? 4096);
  }

  function chargeStep(cost = 1): boolean {
    ctx.evaluationCount += cost;
    if (ctx.evaluationCount > ctx.maxEvaluations) {
      if (!ctx.budgetExhausted) {
        ctx.budgetExhausted = true;
        addDiagnostic(`Aggregate evaluation budget exceeded (max ${ctx.maxEvaluations} operations)`);
      }
      return false;
    }
    return true;
  }

  function check(targetSchema: unknown, data: unknown, currentPath = "payload", currentDepth = depth): void {
    if (ctx.budgetExhausted || ctx.errors.length >= ctx.maxErrors) return;

    if (!chargeStep(1)) return;

    if (currentDepth > 50) {
      addDiagnostic(`${currentPath}: Maximum evaluation depth exceeded`);
      return;
    }

    if (typeof targetSchema === "boolean") {
      if (targetSchema === false) {
        addDiagnostic(`${currentPath}: boolean schema false rejects all instances`);
      }
      return;
    }

    if (Array.isArray(targetSchema) || !targetSchema || typeof targetSchema !== "object") {
      addDiagnostic(`${currentPath}: invalid schema`);
      return;
    }

    const s = targetSchema as Record<string, unknown>;

    // $ref resolution and conjunctive sibling evaluation
    if (s["$ref"]) {
      if (!rootDoc) {
        const rawRef = String(s["$ref"]);
        const safeRef = rawRef.length > 32 ? rawRef.slice(0, 29) + "..." : rawRef;
        addDiagnostic(`${currentPath}: Cannot resolve $ref '${safeRef}' without rootDoc`);
        return;
      }
      const resolved = resolveJsonPointer(rootDoc, String(s["$ref"]));
      if (!resolved.valid || resolved.target === undefined) {
        const rawRef = String(s["$ref"]);
        const safeRef = rawRef.length > 32 ? rawRef.slice(0, 29) + "..." : rawRef;
        addDiagnostic(`${currentPath}: Unresolved schema reference ${safeRef}`);
        return;
      }

      check(resolved.target, data, currentPath, currentDepth + 1);
      if (ctx.budgetExhausted) return;

      const siblingKeys = Object.keys(s).filter((k) => k !== "$ref");
      if (siblingKeys.length > 0) {
        const siblingSchema: Record<string, unknown> = {};
        for (const k of siblingKeys) siblingSchema[k] = s[k];
        check(siblingSchema, data, currentPath, currentDepth + 1);
      }
      return;
    }

    // Type checking
    if (s["type"] !== undefined) {
      if (Array.isArray(s["type"])) {
        const matchesAny = s["type"].some((t) => typeof t === "string" && matchesPrimitiveType(t, data));
        if (!matchesAny) {
          const actual = Array.isArray(data) ? "array" : data === null ? "null" : typeof data;
          addDiagnostic(
            `${currentPath}: expected one of types [${s["type"].join(", ")}], got ${actual}`
          );
          return;
        }
      } else if (typeof s["type"] === "string") {
        if (!matchesPrimitiveType(s["type"], data)) {
          const actual = Array.isArray(data) ? "array" : data === null ? "null" : typeof data;
          addDiagnostic(`${currentPath}: expected ${s["type"]}, got ${actual}`);
          return;
        }
      } else {
        addDiagnostic(`${currentPath}: invalid schema type definition`);
        return;
      }
    }

    // const check using canonical equality
    if (s["const"] !== undefined) {
      const dataCanon = canonicalJsonString(data, chargeStep, ctx.canonicalCache);
      const constCanon = canonicalJsonString(s["const"], chargeStep, ctx.canonicalCache);
      if (dataCanon !== constCanon) {
        const rawConst = JSON.stringify(s["const"]);
        const safeConst = rawConst.length > 32 ? rawConst.slice(0, 29) + "..." : rawConst;
        addDiagnostic(`${currentPath}: value does not match const ${safeConst}`);
      }
    }

    // enum check using canonical equality
    if (Array.isArray(s["enum"])) {
      const dataCanon = canonicalJsonString(data, chargeStep, ctx.canonicalCache);
      let matched = false;
      for (const enumVal of s["enum"]) {
        if (ctx.budgetExhausted) return;
        const enumCanon = canonicalJsonString(enumVal, chargeStep, ctx.canonicalCache);
        if (dataCanon === enumCanon) {
          matched = true;
          break;
        }
      }
      if (!matched && !ctx.budgetExhausted) {
        addDiagnostic(`${currentPath}: value not in enum`);
      }
    }

    // Number bounds
    if (typeof data === "number") {
      if (typeof s["minimum"] === "number" && data < s["minimum"]) {
        addDiagnostic(`${currentPath}: value ${data} is less than minimum ${s["minimum"]}`);
      }
      if (typeof s["maximum"] === "number" && data > s["maximum"]) {
        addDiagnostic(`${currentPath}: value ${data} is greater than maximum ${s["maximum"]}`);
      }
      if (typeof s["exclusiveMinimum"] === "number" && data <= s["exclusiveMinimum"]) {
        addDiagnostic(`${currentPath}: value ${data} is not strictly greater than exclusiveMinimum ${s["exclusiveMinimum"]}`);
      }
      if (typeof s["exclusiveMaximum"] === "number" && data >= s["exclusiveMaximum"]) {
        addDiagnostic(`${currentPath}: value ${data} is not strictly less than exclusiveMaximum ${s["exclusiveMaximum"]}`);
      }
      if (typeof s["multipleOf"] === "number" && s["multipleOf"] > 0) {
        const remainder = (data / s["multipleOf"]) % 1;
        if (Math.abs(remainder) > 1e-9 && Math.abs(remainder - 1) > 1e-9) {
          addDiagnostic(`${currentPath}: value ${data} is not a multiple of ${s["multipleOf"]}`);
        }
      }
    }

    // String bounds: Unicode code points, pattern, format
    if (typeof data === "string") {
      const codePoints = Array.from(data).length;
      if (typeof s["minLength"] === "number" && codePoints < s["minLength"]) {
        addDiagnostic(
          `${currentPath}: string length in code points (${codePoints}) is less than minLength ${s["minLength"]}`
        );
      }
      if (typeof s["maxLength"] === "number" && codePoints > s["maxLength"]) {
        addDiagnostic(
          `${currentPath}: string length in code points (${codePoints}) is greater than maxLength ${s["maxLength"]}`
        );
      }
      if (typeof s["pattern"] === "string") {
        const regex = new RegExp(s["pattern"]);
        if (!regex.test(data)) {
          const rawPat = s["pattern"];
          const safePat = rawPat.length > 32 ? rawPat.slice(0, 29) + "..." : rawPat;
          addDiagnostic(`${currentPath}: string does not match pattern '${safePat}'`);
        }
      }
      if (typeof s["format"] === "string") {
        const fmt = s["format"];
        if (fmt === "email") {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(data)) {
            addDiagnostic(`${currentPath}: invalid email format`);
          }
        } else if (fmt === "uuid") {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(data)) {
            addDiagnostic(`${currentPath}: invalid uuid format`);
          }
        } else if (fmt === "date") {
          if (!isValidISODate(data)) {
            addDiagnostic(`${currentPath}: invalid ISO calendar date format (YYYY-MM-DD)`);
          }
        } else if (fmt === "time") {
          if (!isValidRFC3339Time(data)) {
            addDiagnostic(`${currentPath}: invalid RFC 3339 time format`);
          }
        } else if (fmt === "date-time") {
          if (!isValidRFC3339DateTime(data)) {
            addDiagnostic(`${currentPath}: invalid RFC 3339 date-time format`);
          }
        } else if (fmt === "uri") {
          if (!isValidUri(data)) {
            addDiagnostic(`${currentPath}: invalid URI format`);
          }
        }
      }
    }

    // allOf
    if (Array.isArray(s["allOf"])) {
      for (let i = 0; i < s["allOf"].length; i++) {
        check(s["allOf"][i], data, `${currentPath}.allOf[${i}]`, currentDepth + 1);
        if (ctx.budgetExhausted) return;
      }
    }

    // anyOf: isolated branch error collection, fatal budget cannot be hidden
    if (Array.isArray(s["anyOf"])) {
      let anyPassed = false;
      for (let i = 0; i < s["anyOf"].length; i++) {
        const branchCollector: DiagnosticCollector = { errors: [], totalErrorBytes: 0 };
        const prevErrors = ctx.errors;
        const prevBytes = ctx.totalErrorBytes;
        ctx.errors = branchCollector.errors;
        ctx.totalErrorBytes = branchCollector.totalErrorBytes;
        try {
          check(s["anyOf"][i], data, `${currentPath}.anyOf[${i}]`, currentDepth + 1);
        } finally {
          ctx.errors = prevErrors;
          ctx.totalErrorBytes = prevBytes;
        }

        if (ctx.budgetExhausted) {
          const budgetErr = branchCollector.errors.find((e) => e.includes("budget exceeded"));
          if (budgetErr) {
            addDiagnostic(budgetErr);
          } else {
            addDiagnostic(`${currentPath}: Aggregate evaluation budget exceeded (max ${ctx.maxEvaluations} operations)`);
          }
          return;
        }

        if (branchCollector.errors.length === 0) {
          anyPassed = true;
          break;
        }
      }

      if (!ctx.budgetExhausted && !anyPassed) {
        addDiagnostic(`${currentPath}: payload did not match any branch in anyOf`);
      }
    }

    // oneOf: isolated branch error collection
    if (Array.isArray(s["oneOf"])) {
      let matchCount = 0;
      for (let i = 0; i < s["oneOf"].length; i++) {
        const branchCollector: DiagnosticCollector = { errors: [], totalErrorBytes: 0 };
        const prevErrors = ctx.errors;
        const prevBytes = ctx.totalErrorBytes;
        ctx.errors = branchCollector.errors;
        ctx.totalErrorBytes = branchCollector.totalErrorBytes;
        try {
          check(s["oneOf"][i], data, `${currentPath}.oneOf[${i}]`, currentDepth + 1);
        } finally {
          ctx.errors = prevErrors;
          ctx.totalErrorBytes = prevBytes;
        }

        if (ctx.budgetExhausted) {
          const budgetErr = branchCollector.errors.find((e) => e.includes("budget exceeded"));
          if (budgetErr) {
            addDiagnostic(budgetErr);
          } else {
            addDiagnostic(`${currentPath}: Aggregate evaluation budget exceeded (max ${ctx.maxEvaluations} operations)`);
          }
          return;
        }

        if (branchCollector.errors.length === 0) {
          matchCount++;
        }
      }

      if (!ctx.budgetExhausted) {
        if (matchCount === 0) {
          addDiagnostic(`${currentPath}: payload did not match any branch in oneOf`);
        } else if (matchCount > 1) {
          addDiagnostic(`${currentPath}: payload matched multiple (${matchCount}) branches in oneOf`);
        }
      }
    }

    // not: isolated branch error collection, fatal budget cannot be inverted
    if (s["not"] !== undefined) {
      const branchCollector: DiagnosticCollector = { errors: [], totalErrorBytes: 0 };
      const prevErrors = ctx.errors;
      const prevBytes = ctx.totalErrorBytes;
      ctx.errors = branchCollector.errors;
      ctx.totalErrorBytes = branchCollector.totalErrorBytes;
      try {
        check(s["not"], data, `${currentPath}.not`, currentDepth + 1);
      } finally {
        ctx.errors = prevErrors;
        ctx.totalErrorBytes = prevBytes;
      }

      if (ctx.budgetExhausted) {
        const budgetErr = branchCollector.errors.find((e) => e.includes("budget exceeded"));
        if (budgetErr) {
          addDiagnostic(budgetErr);
        } else {
          addDiagnostic(`${currentPath}: Aggregate evaluation budget exceeded (max ${ctx.maxEvaluations} operations)`);
        }
        return;
      }

      if (branchCollector.errors.length === 0) {
        addDiagnostic(`${currentPath}: payload must not match 'not' schema`);
      }
    }

    // Object properties & additionalProperties
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      const dataObj = data as Record<string, unknown>;
      const declaredProps = s["properties"] ? Object.keys(s["properties"] as Record<string, unknown>) : [];

      // Required fields
      if (Array.isArray(s["required"])) {
        for (const req of s["required"]) {
          if (typeof req === "string" && (!(req in dataObj) || dataObj[req] === undefined)) {
            const safeProp = req.length > 32 ? req.slice(0, 29) + "..." : req;
            addDiagnostic(`${currentPath}: missing required property '${safeProp}'`);
            if (ctx.errors.length >= ctx.maxErrors) break;
          }
        }
      }

      // Additional properties handling
      if (s["additionalProperties"] === false) {
        for (const key of Object.keys(dataObj)) {
          if (!declaredProps.includes(key)) {
            const safeKey = key.length > 32 ? key.slice(0, 29) + "..." : key;
            addDiagnostic(
              `${currentPath}: unrecognized property '${safeKey}' not allowed by schema (additionalProperties=false)`
            );
            if (ctx.errors.length >= ctx.maxErrors) break;
          }
        }
      } else if (typeof s["additionalProperties"] === "object" && s["additionalProperties"] !== null) {
        for (const [key, val] of Object.entries(dataObj)) {
          if (!declaredProps.includes(key)) {
            check(s["additionalProperties"], val, `${currentPath}.${key}`, currentDepth + 1);
            if (ctx.budgetExhausted) return;
          }
        }
      }

      // Check defined properties
      if (s["properties"]) {
        const props = s["properties"] as Record<string, unknown>;
        for (const [propName, propSchema] of Object.entries(props)) {
          if (propName in dataObj && dataObj[propName] !== undefined) {
            check(propSchema, dataObj[propName], `${currentPath}.${propName}`, currentDepth + 1);
            if (ctx.budgetExhausted) return;
          }
        }
      }
    }

    // Array items & uniqueItems
    if (Array.isArray(data)) {
      if (typeof s["minItems"] === "number" && data.length < s["minItems"]) {
        addDiagnostic(`${currentPath}: array length ${data.length} is less than minItems ${s["minItems"]}`);
      }
      if (typeof s["maxItems"] === "number" && data.length > s["maxItems"]) {
        addDiagnostic(`${currentPath}: array length ${data.length} is greater than maxItems ${s["maxItems"]}`);
      }
      if (s["uniqueItems"] === true) {
        const seen = new Set<string>();
        for (let i = 0; i < data.length; i++) {
          const itemStr = canonicalJsonString(data[i], chargeStep, ctx.canonicalCache);
          if (ctx.budgetExhausted) return;
          if (seen.has(itemStr)) {
            addDiagnostic(`${currentPath}: duplicate item at index ${i} violates uniqueItems`);
            break;
          }
          seen.add(itemStr);
        }
      }

      if (s["items"] === false) {
        if (data.length > 0) {
          addDiagnostic(`${currentPath}: items: false forbids elements in array (got ${data.length})`);
        }
      } else if (s["items"] && typeof s["items"] === "object") {
        for (let index = 0; index < data.length; index++) {
          check(s["items"], data[index], `${currentPath}[${index}]`, currentDepth + 1);
          if (ctx.budgetExhausted) return;
        }
      }
    }
  }

  check(schema, payload);
  return { valid: ctx.errors.length === 0, errors: ctx.errors, context: ctx };
}

/**
 * Retrieves operation definition from identity contract.
 */
export function getOperationContract(operationId: string) {
  const op = (identityContract.operations as Array<Record<string, unknown>>).find(
    (o) => o["operationId"] === operationId
  );
  if (!op) {
    throw new IdentityApiError({
      kind: "protocol",
      message: `Unknown operation ID '${operationId}'.`,
    });
  }
  return op;
}

/**
 * Validates request payload against operation's request schema in identity contract.
 * Emits fixed bounded safe diagnostic messages without leaking payload keys or values.
 */
export function validateOperationRequest(operationId: string, payload: unknown): void {
  const op = getOperationContract(operationId);
  const reqSchemaName = op["requestSchemaName"] as string | null;
  if (!reqSchemaName) {
    if (payload !== undefined && payload !== null) {
      throw new IdentityApiError({
        kind: "protocol",
        message: `Invalid request payload for operation '${operationId}': operation does not accept a request body.`,
      });
    }
    return;
  }
  const schema = (identityContract.schemas as Record<string, unknown>)[reqSchemaName];
  if (!schema) {
    throw new IdentityApiError({
      kind: "protocol",
      message: `Invalid request payload for operation '${operationId}': schema contract validation failed.`,
    });
  }
  const res = validatePayloadAgainstSchema(schema, payload, contractRootDoc);
  if (!res.valid) {
    throw new IdentityApiError({
      kind: "protocol",
      message: `Invalid request payload for operation '${operationId}': schema contract validation failed.`,
    });
  }
}

/**
 * Validates response envelope against operation's response schema in identity contract.
 * Emits fixed bounded safe diagnostic messages without leaking response keys or values.
 */
export function validateOperationResponse(operationId: string, status: number, payload: unknown): void {
  const op = getOperationContract(operationId);
  const successStatuses = op["successStatuses"] as string[];
  if (!successStatuses.includes(String(status))) {
    throw new IdentityApiError({
      kind: "protocol",
      status,
      message: `Unexpected HTTP status code: expected one of [${successStatuses.join(", ")}], got ${status}.`,
    });
  }
  const resSchemaName = op["responseSchemaName"] as string;
  const schema = (identityContract.schemas as Record<string, unknown>)[resSchemaName];
  if (!schema) {
    throw new IdentityApiError({
      kind: "protocol",
      status,
      message: `Invalid response payload for operation '${operationId}': schema contract validation failed.`,
    });
  }
  const res = validatePayloadAgainstSchema(schema, payload, contractRootDoc);
  if (!res.valid) {
    throw new IdentityApiError({
      kind: "protocol",
      status,
      message: `Invalid response payload for operation '${operationId}': schema contract validation failed.`,
    });
  }
}

/**
 * Validates payload against any named schema in identity contract.
 * Emits fixed bounded safe diagnostic messages without leaking payload keys or values.
 */
export function validateContractSchema(schemaName: string, payload: unknown): void {
  const schema = (identityContract.schemas as Record<string, unknown>)[schemaName];
  if (!schema) {
    throw new IdentityApiError({
      kind: "protocol",
      message: `Invalid payload for schema '${schemaName}': schema contract validation failed.`,
    });
  }
  const res = validatePayloadAgainstSchema(schema, payload, contractRootDoc);
  if (!res.valid) {
    throw new IdentityApiError({
      kind: "protocol",
      message: `Invalid payload for schema '${schemaName}': schema contract validation failed.`,
    });
  }
}
