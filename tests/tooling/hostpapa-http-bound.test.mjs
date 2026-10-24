import test from 'node:test';
import assert from 'node:assert/strict';
import {generateHtaccess} from '../../tools/hostpapa-release/src/HtaccessTemplate.mjs';

test('generated root config retains the exact owner-approved bound before API routing', () => {
  const text = generateHtaccess();
  assert.deepEqual(text.match(/^LimitRequestBody .+$/gm), ['LimitRequestBody 41943040']);
  assert.ok(text.indexOf('LimitRequestBody 41943040') < text.indexOf('<IfModule'));
  assert.ok(text.indexOf('^/api(?:/.*)?$') < text.indexOf('RewriteRule ^ _shell.html'));
  assert.ok(text.includes('RewriteRule ^ index.php [L,QSA]'));
  assert.ok(text.includes('Options -Indexes'));
});

test('request bound retains inherited auth and is unchanged for the supported nonproduction origin', () => {
  const auth = 'AuthType Basic\nAuthName "Private preview"\nRequire valid-user';
  const text = generateHtaccess(auth, 'https://staging.gazaairport.com');
  assert.ok(text.includes(auth));
  assert.deepEqual(text.match(/^LimitRequestBody .+$/gm), ['LimitRequestBody 41943040']);
  assert.ok(text.includes('noindex, nofollow, noarchive'));
});
