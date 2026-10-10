import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { validatePayloadAgainstSchema } from './lib/backend-contract-validation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const spec = JSON.parse(fs.readFileSync(path.join(root, 'docs/backend/openapi.v1.json'), 'utf8'));
const cases = [
  ['passenger_csrf_200', '/auth/csrf', 200],
  ['staff_csrf_200', '/staff/csrf', 200],
  ['passenger_csrf_400_duplicate_cookie', '/auth/csrf', 400],
  ['staff_csrf_403_disallowed_origin', '/staff/csrf', 403],
  ['passenger_csrf_429_rate_limited', '/auth/csrf', 429],
  ['passenger_csrf_503_service_unavailable', '/auth/csrf', 503],
];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function verify(capture, route, expectedStatus) {
  assert.equal(capture.status, expectedStatus, 'HTTP status mismatch');
  assert.equal(typeof capture.rawBody, 'string');
  const payload = JSON.parse(capture.rawBody);
  assert.deepEqual(payload, capture.parsedBody, 'raw and parsed bodies differ');
  const headers = capture.headers;
  assert.match(headers['content-type'] ?? '', /^application\/json(?:;|$)/i);
  assert.match(headers['cache-control'] ?? '', /(?:^|[, ])no-store(?:[, ]|$)/);
  assert.match(headers['x-request-id'] ?? '', uuid);
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['x-frame-options'], 'DENY');
  const operation = spec.paths[route]?.get;
  assert.ok(operation, 'Missing actual bootstrap operation');
  // Success resolves the actual operation, retaining reference sibling assertions.
  // Additive resource errors use the accepted canonical ErrorResponse.
  const schema = expectedStatus === 200
    ? operation.responses['200'].content['application/json'].schema
    : { $ref: '#/components/schemas/ErrorResponse' };
  const result = validatePayloadAgainstSchema(schema, payload, spec);
  assert.equal(result.valid, true, 'Payload violates accepted contract');
  const cookies = headers['set-cookie'] ?? '';
  if (expectedStatus === 200) {
    const name = route === '/auth/csrf' ? 'gza_session' : 'gza_staff_session';
    assert.ok(cookies.startsWith(`${name}=`), 'Wrong realm cookie');
    for (const flag of [/;\s*secure(?:;|$)/i, /;\s*httponly(?:;|$)/i,
      /;\s*samesite=lax(?:;|$)/i, /;\s*path=\/api\/v1(?:;|$)/i]) {
      assert.match(cookies, flag);
    }
  } else {
    assert.equal(payload.meta.requestId, headers['x-request-id']);
    if (expectedStatus === 400) {
      assert.match(cookies, /;\s*max-age=0(?:;|$)/i, 'Only clearing cookie permitted');
    } else {
      assert.equal(cookies, '', 'Rejected admission issued a cookie');
    }
    if (expectedStatus === 429) {
      assert.match(headers['retry-after'] ?? '', /^[1-9][0-9]*$/);
      assert.ok(Number(headers['retry-after']) <= 3600);
      assert.equal(payload.error.code, 'rate_limited');
    }
    if (expectedStatus === 503) assert.equal(payload.error.code, 'service_unavailable');
  }
}

let positives = 0;
let negatives = 0;
try {
  const captures = cases.map(([name, route, status]) => {
    const capture = JSON.parse(fs.readFileSync(path.join(root, 'backend/storage/app/private/bootstrap-test-captures', `${name}.json`), 'utf8'));
    verify(capture, route, status);
    positives++;
    return capture;
  });
  const probes = [
    [0, c => { c.rawBody = '{}'; }],
    [0, c => { c.parsedBody.csrfToken = 1; c.rawBody = JSON.stringify(c.parsedBody); }],
    [0, c => { c.status = 503; }],
    [0, c => { c.headers['content-type'] = 'text/html'; }],
    [0, c => { delete c.headers['cache-control']; }],
    [0, c => { delete c.headers['x-request-id']; }],
    [0, c => { delete c.headers['set-cookie']; }],
    [0, c => { c.headers['set-cookie'] = 'gza_staff_session=x'; }],
    [0, c => { c.headers['set-cookie'] = c.headers['set-cookie'].replace(/;\s*secure/i, ''); }],
    [2, c => { c.parsedBody.success = true; c.rawBody = JSON.stringify(c.parsedBody); }],
    [2, c => { delete c.parsedBody.meta; c.rawBody = JSON.stringify(c.parsedBody); }],
    [2, c => { c.parsedBody.meta.requestId = 'invalid'; c.rawBody = JSON.stringify(c.parsedBody); }],
    [4, c => { delete c.headers['retry-after']; }],
    [4, c => { c.headers['set-cookie'] = 'gza_session=x'; }],
    [5, c => { c.headers['set-cookie'] = 'gza_session=x'; }],
  ];
  for (const [index, mutate] of probes) {
    const corrupted = structuredClone(captures[index]);
    mutate(corrupted);
    assert.throws(() => verify(corrupted, cases[index][1], cases[index][2]), 'Negative control falsely passed');
    negatives++;
  }
  console.log(`Bootstrap capture gate PASS: ${positives} raw HTTP captures; ${negatives} rejected negative controls.`);
} catch {
  // Never print capture bodies, session cookies or CSRF tokens on failure.
  console.error('Bootstrap capture gate FAIL: missing evidence or invalid HTTP contract.');
  process.exitCode = 1;
}
