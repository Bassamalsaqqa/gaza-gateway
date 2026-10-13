import test from 'node:test';
import assert from 'node:assert/strict';
import {identityUiClientConfig} from '../../src/lib/api/identity-ui-config.ts';
import {resolveIdentityApiClientConfig} from '../../src/lib/api/identity-client-config.ts';
import {generatePublicEntrypoint} from '../../tools/hostpapa-release/src/PublicEntrypointTemplate.mjs';
import {generateHostPapaCli} from '../../tools/hostpapa-release/src/HostPapaCliTemplate.mjs';
import {generateHtaccess} from '../../tools/hostpapa-release/src/HtaccessTemplate.mjs';
const env={VITE_IDENTITY_UI_MODE:'backend',VITE_IDENTITY_PRODUCTION_OPT_IN:'true',VITE_IDENTITY_NONPRODUCTION_OPT_IN:'false',VITE_HOSTPAPA_PROFILE:'staging',VITE_IDENTITY_API_BASE_URL:'https://staging.gazaairport.com/api/v1',MODE:'production',PROD:true,DEV:false,NODE_ENV:'production'};
test('optimized staging build reaches only the exact isolated staging API',()=>{
 const config=resolveIdentityApiClientConfig(identityUiClientConfig(env));assert.equal(config.baseUrl,'https://staging.gazaairport.com/api/v1');assert.equal(config.enabled,true);
 for(const url of ['https://www.gazaairport.com/api/v1','https://gazaairport.com/api/v1','https://api.gazaairport.com/api/v1','https://staging.gazaairport.com:444/api/v1','http://staging.gazaairport.com/api/v1','https://evil.example/api/v1','https://staging.gazaairport.com/other'])assert.throws(()=>identityUiClientConfig({...env,VITE_IDENTITY_API_BASE_URL:url}));
});
test('production and unknown profiles cannot reach staging; explicit opt-in remains mandatory',()=>{
 assert.throws(()=>identityUiClientConfig({...env,VITE_HOSTPAPA_PROFILE:'production'}));assert.throws(()=>identityUiClientConfig({...env,VITE_HOSTPAPA_PROFILE:'anything'}));assert.throws(()=>identityUiClientConfig({...env,VITE_IDENTITY_PRODUCTION_OPT_IN:'false'}));
 assert.equal(resolveIdentityApiClientConfig(identityUiClientConfig({...env,VITE_HOSTPAPA_PROFILE:'production',VITE_IDENTITY_API_BASE_URL:'https://www.gazaairport.com/api/v1'})).baseUrl,'https://www.gazaairport.com/api/v1');
});
test('staging bridges select a separate private root and cannot inject paths',()=>{
 assert.ok(generatePublicEntrypoint('gaza-gateway-staging').includes("DIRECTORY_SEPARATOR . 'gaza-gateway-staging'"));
 assert.ok(generateHostPapaCli('gaza-gateway-staging').includes("DIRECTORY_SEPARATOR . 'gaza-gateway-staging'"));
 assert.throws(()=>generatePublicEntrypoint('../public_html'));assert.throws(()=>generateHostPapaCli('other'));
});
test('staging redirects stay on staging and suppress indexing without pretending to authenticate',()=>{
 const text=generateHtaccess('', 'https://staging.gazaairport.com');assert.ok(text.includes('https://staging.gazaairport.com%{REQUEST_URI}'));assert.ok(text.includes('X-Robots-Tag "noindex, nofollow, noarchive"'));assert.ok(!text.includes('AuthType Basic'));assert.throws(()=>generateHtaccess('','https://evil.example'));
});
