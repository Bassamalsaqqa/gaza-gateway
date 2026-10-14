import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {publishedHome} from '../../src/content/published/home.ts';

test('actual PHP 8.4 validator accepts current/saved Home copy and rejects malformed or unknown fields',()=>{
 const current=structuredClone(publishedHome);
 const legacy={...current,copy:{...current.copy,heritageSpotlightTitle:{en:'Old saved heading',ar:'عنوان محفوظ'},heritageSpotlightDesc:{en:'Old saved copy',ar:'نص محفوظ'}}};
 const one=structuredClone(legacy);delete one.copy.heritageSpotlightDesc;
 const missing=structuredClone(legacy);delete missing.copy.past;
 const unknown={...legacy,copy:{...legacy.copy,unknownField:{en:'X',ar:'س'}}};
 const malformed={...legacy,copy:{...legacy.copy,heritageSpotlightTitle:null}};
 const unsafe={...legacy,copy:{...legacy.copy,heritageSpotlightDesc:{en:'<script>bad</script>',ar:'وصف'}}};
 const root=fileURLToPath(new URL('../../',import.meta.url));
 const result=spawnSync('docker',['run','--rm','-i','--pull=never','--network=none','-v',root+':/source:ro','gaza-gateway-mysql-test:php84','php','/source/tests/tooling/fixtures/home-cms-validation.php'],{input:JSON.stringify([current,legacy,one,missing,unknown,malformed,unsafe]),encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stderr||result.stdout);
 assert.deepEqual(JSON.parse(result.stdout),[true,true,true,false,false,false,false]);
});
