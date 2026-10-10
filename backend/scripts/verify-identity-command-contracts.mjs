#!/usr/bin/env node
/**
 * Gaza Gateway - Cross-Language Parity Harness
 *
 * Verifies 100% agreement between PHP IdentityCommandValidator (via probe adapter)
 * and the authoritative Node backend-contract-validation helper across all specimens.
 *
 * Requirements:
 * - Foreground bounded harness with hard timeout.
 * - Resolves schemas from actual openapi.v1.json paths/operations.
 * - Compares PHP and Node outcomes across all specimens.
 * - Verifies tamper detection (--check) and isolated subprocess corruption probes.
 * - Proves subprocess exit nonzero for missing, stale, changed bound, ref sibling,
 *   format, required, enum, additionalProperties, and array items artifacts.
 * - Never modifies tracked files or accepted deliverables to simulate failures.
 * - Verifies safe error reporting (no values, passwords, emails, or unknown keys in violations).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  validatePayloadAgainstSchema,
  resolveJsonPointer,
} from '../../scripts/lib/backend-contract-validation.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const OPENAPI_PATH = path.join(REPO_ROOT, 'docs/backend/openapi.v1.json');
const SPECIMENS_PATH = path.join(REPO_ROOT, 'backend/tests/Fixtures/IdentityCommands/specimens.json');
const CONTRACT_ARTIFACT_PATH = path.join(REPO_ROOT, 'backend/app/Identity/Contracts/identity-command-contracts.v1.json');
const GENERATOR_PATH = path.join(REPO_ROOT, 'backend/scripts/generate-identity-command-contracts.mjs');

console.log('=== Cross-Language Identity Command Contract Parity Harness ===\n');

// 1. Load OpenAPI
const spec = JSON.parse(fs.readFileSync(OPENAPI_PATH, 'utf8'));

// 2. Load Static Specimens
const staticSpecimens = JSON.parse(fs.readFileSync(SPECIMENS_PATH, 'utf8'));

// 3. Build Dynamic Matrix for ALL 22 Command Request Schemas
const BASE_DATA = {
  postPassengerRegister: {
    email: 'ahmad.masri@example.com',
    password: 'SecurePassword12345678',
    firstName: 'Ahmad',
    lastName: 'Masri',
    title: 'Mr',
    phone: '+970599123456',
  },
  postPassengerLogin: {
    email: 'ahmad.masri@example.com',
    password: 'SecurePassword123',
  },
  postPassengerPasswordForgot: {
    email: 'ahmad.masri@example.com',
  },
  postPassengerPasswordReset: {
    token: 'reset-token-abcdef123456',
    email: 'ahmad.masri@example.com',
    password: 'NewSecurePassword12345',
  },
  postPassengerEmailVerify: {
    token: 'verify-token-abcdef123456',
  },
  putPassengerProfile: {
    firstName: 'Ahmad',
    lastName: 'Masri',
    phone: '+970599123456',
    seatPreference: 'window',
    mealPreference: 'standard',
    newsletter: true,
  },
  postSavedTraveler: {
    firstName: 'Fatima',
    lastName: 'Masri',
    dob: '1995-05-15',
    nationality: 'PS',
    document: 'P98765432',
  },
  patchSavedTraveler: {
    firstName: 'Fatima Updated',
  },
  postStaffLogin: {
    username: 'staff_super',
    password: 'StaffPassword12345',
  },
  postStaffMfaChallenge: {
    staffSessionChallengeId: '00000000-0000-0000-0000-000000000001',
  },
  postStaffMfaVerify: {
    totpCode: '123456',
  },
  postStaffUserInvite: {
    username: 'staff_handler_01',
    email: 'handler01@gaza-gateway.test',
    fullNameEn: 'Tariq Najar',
    fullNameAr: 'طارق نجار',
    role: 'admin',
  },
  patchStaffUser: {
    fullNameEn: 'Tariq Najar Updated',
    role: 'editor',
    isActive: true,
  },
  postPassengerEmailResend: {
    email: 'ahmad.masri@example.com',
  },
  putPassengerPassword: {
    currentPassword: 'CurrentPassword123',
    newPassword: 'NewSecurePassword12345',
  },
  postStaffMfaEnrollmentConfirm: {
    totpCode: '123456',
  },
  postStaffStepUp: {
    totpCode: '123456',
  },
  postStaffMfaSetupConfirm: {
    totpCode: '123456',
  },
  postStaffPasswordForgot: {
    email: 'staff@gaza-gateway.test',
  },
  postStaffPasswordReset: {
    token: 'a'.repeat(32),
    newPassword: 'StaffNewPassword12345',
  },
  putStaffPassword: {
    currentPassword: 'CurrentStaffPassword12',
    newPassword: 'NewStaffPassword12345',
  },
  postStaffInvitationAccept: {
    token: 'a'.repeat(32),
    password: 'AcceptedPassword12345',
  },
};

const OPERATION_PARAMS = {
  patchSavedTraveler: { id: 'trv_01' },
  patchStaffUser: { id: '00000000-0000-0000-0000-000000000001' },
};

const dynamicSpecimens = [];
for (const [p, item] of Object.entries(spec.paths)) {
  if (!p.startsWith('/auth/') && !p.startsWith('/staff/')) continue;
  for (const [m, op] of Object.entries(item)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(m) || !op.requestBody) continue;

    const opId = op.operationId;
    const base = BASE_DATA[opId];
    if (!base) {
      throw new Error(`Missing base data for ${opId}`);
    }
    const params = OPERATION_PARAMS[opId] || {};

    const bodyRef = op.requestBody?.content?.['application/json']?.schema;
    const resolved = bodyRef?.$ref ? resolveJsonPointer(spec, bodyRef.$ref).target : bodyRef;
    const props = resolved?.properties || {};
    const required = resolved?.required || [];

    // 1. Positive baseline
    dynamicSpecimens.push({
      id: `${opId}__baseline_valid`,
      family: 'All22Operations',
      operationId: opId,
      method: m.toUpperCase(),
      path: p,
      payload: base,
      parameters: params,
      expectedValid: true,
    });

    // 2. Top-level body absent (via empty rawJson) -> must fail (body required)
    dynamicSpecimens.push({
      id: `${opId}__top_level_absent_empty_json`,
      family: 'All22Operations',
      operationId: opId,
      method: m.toUpperCase(),
      path: p,
      rawJson: '',
      parameters: params,
      expectedValid: false,
    });

    // 3. Top-level body explicit JSON null -> must fail (type mismatch: null vs object)
    dynamicSpecimens.push({
      id: `${opId}__top_level_explicit_null`,
      family: 'All22Operations',
      operationId: opId,
      method: m.toUpperCase(),
      path: p,
      rawJson: 'null',
      parameters: params,
      expectedValid: false,
    });

    // 4. Every declared property null -> must fail (non-nullable properties)
    for (const propName of Object.keys(props)) {
      dynamicSpecimens.push({
        id: `${opId}__prop_null_${propName}`,
        family: 'All22Operations',
        operationId: opId,
        method: m.toUpperCase(),
        path: p,
        payload: { ...base, [propName]: null },
        parameters: params,
        expectedValid: false,
      });

      dynamicSpecimens.push({
        id: `${opId}__prop_null_json_${propName}`,
        family: 'All22Operations',
        operationId: opId,
        method: m.toUpperCase(),
        path: p,
        rawJson: JSON.stringify({ ...base, [propName]: null }),
        parameters: params,
        expectedValid: false,
      });
    }

    // 5. Every declared property type mismatch -> must fail
    for (const [propName, propSchema] of Object.entries(props)) {
      const badVal = propSchema.type === 'string'
        ? 12345
        : propSchema.type === 'boolean'
          ? 'not_a_boolean'
          : propSchema.type === 'integer' || propSchema.type === 'number'
            ? 'not_a_number'
            : propSchema.type === 'object'
              ? 'not_an_object'
              : 'invalid_type';

      dynamicSpecimens.push({
        id: `${opId}__prop_type_mismatch_${propName}`,
        family: 'All22Operations',
        operationId: opId,
        method: m.toUpperCase(),
        path: p,
        payload: { ...base, [propName]: badVal },
        parameters: params,
        expectedValid: false,
      });
    }

    // 6. Every required property deleted -> must fail
    for (const reqName of required) {
      const omitted = { ...base };
      delete omitted[reqName];

      dynamicSpecimens.push({
        id: `${opId}__req_deleted_${reqName}`,
        family: 'All22Operations',
        operationId: opId,
        method: m.toUpperCase(),
        path: p,
        payload: omitted,
        parameters: params,
        expectedValid: false,
      });
    }

    // 7. Optional properties omitted -> must pass
    if (required.length > 0 && required.length < Object.keys(props).length) {
      const minimal = {};
      for (const reqName of required) {
        minimal[reqName] = base[reqName];
      }

      dynamicSpecimens.push({
        id: `${opId}__optional_omitted`,
        family: 'All22Operations',
        operationId: opId,
        method: m.toUpperCase(),
        path: p,
        payload: minimal,
        parameters: params,
        expectedValid: true,
      });
    }
  }
}

// Combine all specimens
const specimens = [...staticSpecimens, ...dynamicSpecimens];
const specimenIds = new Set(specimens.map((s) => s.id));
if (specimenIds.size !== specimens.length) {
  throw new Error('Duplicate specimen identifiers');
}
const operationCount = new Set(specimens.map((s) => s.operationId)).size;
console.log(`[1/5] Loaded ${specimens.length} total specimens (${staticSpecimens.length} static + ${dynamicSpecimens.length} dynamic) across ${operationCount} operations.`);

// 4. Run Node Evaluation on all specimens
const nodeResults = {};
for (const s of specimens) {
  const pathItem = spec.paths[s.path];
  if (!pathItem) {
    throw new Error(`Path ${s.path} not in OpenAPI`);
  }
  const op = pathItem[s.method.toLowerCase()];
  if (!op) {
    throw new Error(`Method ${s.method} not in path ${s.path}`);
  }

  let nodeValid = true;
  const nodeErrors = [];

  // Check bodyless vs body
  if (s.rawJson !== undefined && s.rawJson !== null) {
    if (!op.requestBody) {
      if (s.rawJson.trim() !== '') {
        nodeValid = false;
        nodeErrors.push('Unexpected body for bodyless operation');
      }
    } else {
      if (s.rawJson.trim() === '') {
        nodeValid = false;
        nodeErrors.push('Body is required');
      } else {
        try {
          const parsed = JSON.parse(s.rawJson);
          const bodySchemaRef = op.requestBody?.content?.['application/json']?.schema;
          const resolved = { valid: bodySchemaRef !== undefined, target: bodySchemaRef };

          const res = validatePayloadAgainstSchema(resolved.target, parsed, spec);
          if (!res.valid) {
            nodeValid = false;
            nodeErrors.push(...res.errors);
          }
        } catch (e) {
          nodeValid = false;
          nodeErrors.push(`Invalid JSON: ${e.message}`);
        }
      }
    }
  } else if (!op.requestBody) {
    if (s.payload !== null) {
      nodeValid = false;
      nodeErrors.push('Unexpected body for bodyless operation');
    }
  } else {
    if (s.payload === null) {
      nodeValid = false;
      nodeErrors.push('Body is required');
    } else {
      const bodySchemaRef = op.requestBody?.content?.['application/json']?.schema;
      if (!bodySchemaRef) {
        throw new Error(`No application/json schema for ${s.operationId}`);
      }
      const resolved = { valid: true, target: bodySchemaRef };

      if (!resolved.valid || !resolved.target) {
        throw new Error(`Failed resolving body schema for ${s.operationId}`);
      }

      const res = validatePayloadAgainstSchema(resolved.target, s.payload, spec);
      if (!res.valid) {
        nodeValid = false;
        nodeErrors.push(...res.errors);
      }
    }
  }

  // Check parameters (path & query)
  for (const p of op.parameters || []) {
    const resolvedP = p.$ref ? resolveJsonPointer(spec, p.$ref).target : p;
    if (resolvedP.in === 'path' || resolvedP.in === 'query') {
      const pName = resolvedP.name;
      const pRequired = Boolean(resolvedP.required);
      if (pRequired && (s.parameters == null || !(pName in s.parameters))) {
        nodeValid = false;
        nodeErrors.push(`Missing required parameter ${pName}`);
      } else if (s.parameters && pName in s.parameters) {
        const val = s.parameters[pName];
        if (resolvedP.schema) {
          const pRes = validatePayloadAgainstSchema(resolvedP.schema, val, spec);
          if (!pRes.valid) {
            nodeValid = false;
            nodeErrors.push(...pRes.errors);
          }
        }
      }
    }
  }

  nodeResults[s.id] = { valid: nodeValid, errors: nodeErrors };
}
console.log(`[2/5] Completed Node evaluation for all ${specimens.length} specimens.`);

// 5. Run Docker PHP Probe via STDIN
console.log('[3/5] Executing PHP probe in Docker container (network: none, piped via STDIN)...');
const dockerArgs = [
  'run',
  '--rm',
  '--network', 'none',
  '-i',
  '-v', `${path.join(REPO_ROOT, 'backend').replace(/\\/g, '/')}:/var/www/html:ro`,
  '-v', `${path.resolve(process.env.IDENTITY_CONTRACT_VENDOR_PATH || path.join(REPO_ROOT, 'backend/vendor')).replace(/\\/g, '/')}:/var/www/html/vendor:ro`,
  '-w', '/var/www/html',
  'gaza-gateway-backend:phase13a',
  'php',
  'scripts/probe-identity-command-validation.php',
];

const dockerRun = spawnSync('docker', dockerArgs, {
  input: JSON.stringify(specimens),
  encoding: 'utf8',
  timeout: 45000,
});

if (dockerRun.error) {
  console.error(`[FAIL] Docker execution failed: ${dockerRun.error.message}`);
  process.exit(1);
}
if (dockerRun.status !== 0) {
  console.error(`[FAIL] PHP probe exited with code ${dockerRun.status}:\n${dockerRun.stderr}`);
  process.exit(1);
}

const phpResultsArray = JSON.parse(dockerRun.stdout);
if (!Array.isArray(phpResultsArray) || phpResultsArray.length !== specimens.length) {
  throw new Error('PHP result count does not match the specimen inventory');
}
const phpResults = Object.create(null);
for (const r of phpResultsArray) {
  if (!r || !specimenIds.has(r.id) || Object.hasOwn(phpResults, r.id)
    || typeof r.valid !== 'boolean' || !Array.isArray(r.violations)
    || !Array.isArray(r.violationCodes)) {
    throw new Error('Malformed, duplicate or unexpected PHP probe result');
  }
  phpResults[r.id] = r;
}
console.log(`[3/5] PHP probe returned ${phpResultsArray.length} results.`);

// 5. Compare Parity
console.log('[4/5] Checking specimen parity and safe error reporting...');
let mismatches = 0;
let safeReportingPassed = true;

for (const s of specimens) {
  const node = nodeResults[s.id];
  const php = phpResults[s.id];

  if (!node || !php) {
    console.error(`[FAIL] Missing result for specimen ${s.id}`);
    mismatches++;
    continue;
  }

  // Parity check: both must agree on valid vs invalid
  if (node.valid !== php.valid || php.valid !== s.expectedValid) {
    console.error(`[FAIL] Parity mismatch on specimen '${s.id}' (${s.operationId}):`);
    console.error(`       Expected: ${s.expectedValid}, Node: ${node.valid}, PHP: ${php.valid}`);
    if (!php.valid) console.error(`       PHP violations: ${JSON.stringify(php.violations)}`);
    if (!node.valid) console.error(`       Node errors: ${JSON.stringify(node.errors)}`);
    mismatches++;
  }

  // Check expected code if specified
  if (s.expectedCode && !php.violationCodes.includes(s.expectedCode)) {
    console.error(`[FAIL] PHP result for '${s.id}' missing expected violation code '${s.expectedCode}': got [${php.violationCodes.join(', ')}]`);
    mismatches++;
  }

  // Verify safe error reporting: NO raw input values, passwords, emails, tokens, or unknown property names
  if (!php.valid) {
    for (const v of php.violations) {
      const fullText = JSON.stringify(v);
      if (s.payload && typeof s.payload === 'object') {
        for (const [k, val] of Object.entries(s.payload)) {
          if (typeof val === 'string' && val.length > 5 && fullText.includes(val)) {
            console.error(`[FAIL] LEAK in violation for '${s.id}': input value '${val}' echoed in violation: ${fullText}`);
            safeReportingPassed = false;
          }
        }
      }
      if (v.code === 'ADDITIONAL_PROPERTIES_DISALLOWED' && v.path.includes('isAdmin')) {
        console.error(`[FAIL] LEAK in violation for '${s.id}': unknown property name in path: ${fullText}`);
        safeReportingPassed = false;
      }
    }
  }
}

if (mismatches > 0 || !safeReportingPassed) {
  console.error(`\n[FAIL] Cross-language parity failed with ${mismatches} mismatches.`);
  process.exit(1);
}

console.log(`[PASS] 100% agreement on all ${specimens.length} specimens between Node and PHP!`);
console.log('[PASS] Safe error reporting verified (zero sensitive input leaks).');

// 6. Test generator --check and isolated subprocess corruption probes
console.log('\n[5/5] Testing generator --check and isolated corruption probes (CVC3)...');

// 6a. Intact check
const genCheck = spawnSync('node', [GENERATOR_PATH, '--check'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  timeout: 10000,
});
if (genCheck.status !== 0) {
  console.error(`[FAIL] generator --check failed on intact deliverable:\n${genCheck.stderr || genCheck.stdout}`);
  process.exit(1);
}
console.log(`[PASS] generator --check succeeded on intact deliverable: ${genCheck.stdout.trim()}`);

// 6b. Isolated corruption test suite
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contracts-cvc3-'));
try {
  const intactArtifact = fs.readFileSync(CONTRACT_ARTIFACT_PATH, 'utf8');

  // Helper to run generator check with isolated paths
  function runIsolatedCheck(testName, specFile, outFile) {
    const args = [GENERATOR_PATH, '--check', '--spec', specFile, '--out', outFile];
    const res = spawnSync('node', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 10000,
    });
    if (res.error || res.signal || res.status !== 1) {
      throw new Error(`Expected controlled validation exit 1 for ${testName}; process failures and timeouts are not rejection evidence`);
    }
    console.log(`  [PASS] Isolated corruption detected: ${testName} (exit code ${res.status})`);
  }

  // Probe 1: Missing output artifact
  const nonExistentOut = path.join(tempDir, 'missing-output.json');
  runIsolatedCheck('Missing output artifact', OPENAPI_PATH, nonExistentOut);

  // Probe 2: Stale/tampered output artifact
  const tamperedOut = path.join(tempDir, 'tampered-output.json');
  const tamperedJson = JSON.parse(intactArtifact);
  tamperedJson.phase = '13C_TAMPERED';
  fs.writeFileSync(tamperedOut, JSON.stringify(tamperedJson, null, 2), 'utf8');
  runIsolatedCheck('Stale/tampered output artifact', OPENAPI_PATH, tamperedOut);

  // Probe 3: Corrupted spec with changed bound (minLength changed on password)
  const specChangedBound = JSON.parse(JSON.stringify(spec));
  const regSchema = specChangedBound.components.schemas.RegisterRequest;
  if (regSchema?.properties?.password) {
    regSchema.properties.password.minLength = 10; // changed bound
  }
  const specBoundPath = path.join(tempDir, 'spec-changed-bound.json');
  fs.writeFileSync(specBoundPath, JSON.stringify(specChangedBound), 'utf8');
  runIsolatedCheck('Changed bound in spec', specBoundPath, CONTRACT_ARTIFACT_PATH);

  // Probe 4: Corrupted spec with changed ref sibling (unsupported sibling added)
  const specChangedRef = JSON.parse(JSON.stringify(spec));
  const loginBody = specChangedRef.paths['/auth/login']?.post?.requestBody;
  if (loginBody?.content?.['application/json']?.schema) {
    loginBody.content['application/json'].schema.unsupportedSibling = true;
  }
  const specRefPath = path.join(tempDir, 'spec-changed-ref-sibling.json');
  fs.writeFileSync(specRefPath, JSON.stringify(specChangedRef), 'utf8');
  runIsolatedCheck('Changed ref sibling with unsupported keyword', specRefPath, CONTRACT_ARTIFACT_PATH);

  // Probe 5: Corrupted spec with changed format (unsupported format)
  const specChangedFormat = JSON.parse(JSON.stringify(spec));
  if (specChangedFormat.components?.schemas?.LoginRequest?.properties?.email) {
    specChangedFormat.components.schemas.LoginRequest.properties.email.format = 'unsupported-custom-format';
  }
  const specFormatPath = path.join(tempDir, 'spec-changed-format.json');
  fs.writeFileSync(specFormatPath, JSON.stringify(specChangedFormat), 'utf8');
  runIsolatedCheck('Changed format to unsupported', specFormatPath, CONTRACT_ARTIFACT_PATH);

  // Probe 6: Corrupted spec with changed required (duplicate required item)
  const specChangedReq = JSON.parse(JSON.stringify(spec));
  if (specChangedReq.components?.schemas?.LoginRequest?.required) {
    specChangedReq.components.schemas.LoginRequest.required = ['email', 'email'];
  }
  const specReqPath = path.join(tempDir, 'spec-changed-required.json');
  fs.writeFileSync(specReqPath, JSON.stringify(specChangedReq), 'utf8');
  runIsolatedCheck('Changed required array to duplicate keys', specReqPath, CONTRACT_ARTIFACT_PATH);

  // Probe 7: Corrupted spec with changed enum (duplicate enum item)
  const specChangedEnum = JSON.parse(JSON.stringify(spec));
  const titleProp = specChangedEnum.components?.schemas?.RegisterRequest?.properties?.title;
  if (titleProp?.enum) {
    titleProp.enum = ['Mr', 'Mr'];
  }
  const specEnumPath = path.join(tempDir, 'spec-changed-enum.json');
  fs.writeFileSync(specEnumPath, JSON.stringify(specChangedEnum), 'utf8');
  runIsolatedCheck('Changed enum array to duplicate items', specEnumPath, CONTRACT_ARTIFACT_PATH);

  // Probe 8: Corrupted spec with changed additionalProperties (invalid type)
  const specChangedAddProps = JSON.parse(JSON.stringify(spec));
  if (specChangedAddProps.components?.schemas?.LoginRequest) {
    specChangedAddProps.components.schemas.LoginRequest.additionalProperties = 'disallowed_string';
  }
  const specAddPropsPath = path.join(tempDir, 'spec-changed-additional-props.json');
  fs.writeFileSync(specAddPropsPath, JSON.stringify(specChangedAddProps), 'utf8');
  runIsolatedCheck('Changed additionalProperties to invalid shape', specAddPropsPath, CONTRACT_ARTIFACT_PATH);

  // Probe 9: Corrupted spec with array-form items tuple
  const specChangedItems = JSON.parse(JSON.stringify(spec));
  if (specChangedItems.components?.schemas?.RegisterRequest) {
    specChangedItems.components.schemas.RegisterRequest.properties.phone = {
      type: 'array',
      items: [{ type: 'string' }],
    };
  }
  const specItemsPath = path.join(tempDir, 'spec-changed-items.json');
  fs.writeFileSync(specItemsPath, JSON.stringify(specChangedItems), 'utf8');
  runIsolatedCheck('Array-form items tuple in spec', specItemsPath, CONTRACT_ARTIFACT_PATH);

  // Probe 10: Corrupted spec with type: null
  const specTypeNull = JSON.parse(JSON.stringify(spec));
  if (specTypeNull.components?.schemas?.LoginRequest?.properties?.email) {
    specTypeNull.components.schemas.LoginRequest.properties.email.type = null;
  }
  const specTypeNullPath = path.join(tempDir, 'spec-type-null.json');
  fs.writeFileSync(specTypeNullPath, JSON.stringify(specTypeNull), 'utf8');
  runIsolatedCheck('type: null keyword value in spec', specTypeNullPath, CONTRACT_ARTIFACT_PATH);

  // Probe 11: Corrupted spec with not: { minProperties: 1 }
  const specNotMinProps = JSON.parse(JSON.stringify(spec));
  if (specNotMinProps.components?.schemas?.LoginRequest) {
    specNotMinProps.components.schemas.LoginRequest.not = { minProperties: 1 };
  }
  const specNotMinPropsPath = path.join(tempDir, 'spec-not-minprops.json');
  fs.writeFileSync(specNotMinPropsPath, JSON.stringify(specNotMinProps), 'utf8');
  runIsolatedCheck('not: { minProperties: 1 } unsupported recursion', specNotMinPropsPath, CONTRACT_ARTIFACT_PATH);

  // Probe 12: Corrupted spec with multipleOf: -1
  const specNegMult = JSON.parse(JSON.stringify(spec));
  if (specNegMult.components?.schemas?.LoginRequest?.properties?.email) {
    specNegMult.components.schemas.LoginRequest.properties.email.multipleOf = -1;
  }
  const specNegMultPath = path.join(tempDir, 'spec-neg-multipleof.json');
  fs.writeFileSync(specNegMultPath, JSON.stringify(specNegMult), 'utf8');
  runIsolatedCheck('multipleOf: -1 negative multipleOf in spec', specNegMultPath, CONTRACT_ARTIFACT_PATH);

  console.log('[PASS] All 12 isolated corruption probes failed closed with non-zero exit codes!');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('\n======================================================');
console.log('RESULT: ALL PARITY HARNESS CHECKS PASSED.');
process.exit(0);
