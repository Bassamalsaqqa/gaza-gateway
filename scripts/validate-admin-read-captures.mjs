import fs from 'node:fs';
import { validatePayloadAgainstSchema } from './lib/backend-contract-validation.mjs';

const spec = JSON.parse(fs.readFileSync(new URL('../docs/backend/mvp-admin-read.openapi.json', import.meta.url), 'utf8'));
const captures = Object.values(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
let positive = 0; let negative = 0;
for (const capture of captures) {
  const schema = spec.paths[capture.path]?.get.responses[String(capture.status)]?.content['application/json'].schema;
  if (!schema || !capture.contentType?.startsWith('application/json')) throw new Error('Undocumented response status or content type');
  const result = validatePayloadAgainstSchema(schema, capture.payload, spec);
  if (!result.valid) throw new Error(`${capture.path} ${capture.status}: ${result.errors.join('; ')}`);
  positive++;
  if (capture.status === 200) {
    const corrupted = structuredClone(capture.payload); corrupted.success = false;
    if (validatePayloadAgainstSchema(schema, corrupted, spec).valid) throw new Error('False success accepted'); negative++;
    const extra = structuredClone(capture.payload); extra.data.password_hash = 'must-not-escape';
    if (validatePayloadAgainstSchema(schema, extra, spec).valid) throw new Error('Private extra data accepted'); negative++;
  }
}
for (const path of Object.keys(spec.paths)) if (!captures.some(c => c.path === path && c.status === 200)) throw new Error('Missing actual success capture');
console.log(`PASS: ${positive} actual Admin responses; ${negative} negative contract controls.`);
