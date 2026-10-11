import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePayloadAgainstSchema } from '../../scripts/lib/backend-contract-validation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const spec = JSON.parse(fs.readFileSync(path.join(root, 'docs/backend/openapi.v1.json'), 'utf8'));
const expected = new Set(['postStaffLogin', 'postStaffMfaChallenge', 'postStaffMfaVerify', 'postStaffLogout',
  'getStaffMe', 'getStaffSessions', 'deleteStaffSession', 'postStaffStepUp']);
const source = process.argv[2];
if (!source) throw new Error('An actual staff capture file is required.');
const captures = JSON.parse(fs.readFileSync(source, 'utf8'));
if (!Array.isArray(captures) || captures.length !== expected.size) throw new Error('Exactly eight captures required.');
let negativeControls = 0;
for (const capture of captures) {
  if (!capture || Object.keys(capture).sort().join(',') !== 'contentType,operationId,rawResponseBody,status'
      || !expected.delete(capture.operationId) || capture.status !== 200
      || !/^application\/json(?:;|$)/i.test(capture.contentType) || typeof capture.rawResponseBody !== 'string') {
    throw new Error('Invalid, duplicate or unexpected capture.');
  }
  const operation = Object.values(spec.paths).flatMap(item => Object.values(item))
    .find(item => item?.operationId === capture.operationId);
  const schema = operation?.responses?.['200']?.content?.['application/json']?.schema;
  if (!schema) throw new Error('Accepted operation response schema missing.');
  const payload = JSON.parse(capture.rawResponseBody);
  const result = validatePayloadAgainstSchema(schema, payload, spec);
  if (!result.valid || result.errors.length) throw new Error(`${capture.operationId}: ${result.errors.join('; ')}`);
  for (const invalid of [{ ...payload, success: false }, { success: true, data: payload.data },
    { ...payload, meta: { requestId: 'invalid', timestamp: 'not-a-date' } }]) {
    if (validatePayloadAgainstSchema(schema, invalid, spec).valid) throw new Error('Negative control accepted.');
    negativeControls++;
  }
}
if (expected.size) throw new Error('Missing operation captures.');
console.log(`PASS: eight actual staff responses; ${negativeControls} negative controls rejected.`);
