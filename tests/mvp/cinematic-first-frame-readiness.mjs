import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer as createPortProbe} from 'node:net';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import {chromium} from 'playwright-core';

const root=fileURLToPath(new URL('../../',import.meta.url));
const evidence=path.join(root,process.env.READINESS_EVIDENCE_DIR || 'scratch/cinematic-readiness-evidence');
// The test fixture is served only by an owned loopback Vite dev server. No route,
// build output, backend request or synthetic decoded frame is introduced.
const fixture=`<!doctype html><html style="scroll-behavior:auto"><head><link rel="stylesheet" href="/src/styles.css"></head>
<body style="margin:0;height:5000px"><div id="media" style="position:fixed;top:20px;left:20px;width:600px;height:340px"></div>
<script type="module">
import React from 'react'; import {createRoot} from 'react-dom/client';
import {VideoScrubRenderer} from '/src/components/airport/cinematic/video-scrub-renderer.tsx';
import {computeHomeCinematicProgress} from '/src/components/airport/cinematic/cinematic-scroll.ts';
import {CINEMATIC_MANIFEST} from '/src/lib/media/cinematic-manifest.ts';
const e={requests:[],frames:[],loaded:[],mediaErrors:[],videos:[],callbacks:[],cancelled:[],ready:[],errors:[]};
const descriptor=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'currentTime');
const nativeLoad=HTMLMediaElement.prototype.load,nativePause=HTMLMediaElement.prototype.pause;
const identify=v=>{let i=e.videos.findIndex(r=>r.video===v);if(i<0){i=e.videos.length;e.videos.push({video:v,loads:0,pauses:0});}return i;};
Object.defineProperty(HTMLMediaElement.prototype,'currentTime',{configurable:true,get:descriptor.get,set(value){e.requests.push({video:this,id:identify(this),target:value,released:false});}});
HTMLMediaElement.prototype.load=function(){const id=identify(this);e.videos[id].loads++;if(!e.videos[id].listening){e.videos[id].listening=true;this.addEventListener('loadeddata',()=>e.loaded.push({id,time:this.currentTime}));this.addEventListener('error',()=>e.mediaErrors.push({id,code:this.error?.code,message:this.error?.message}));}return nativeLoad.call(this);};
HTMLMediaElement.prototype.pause=function(){e.videos[identify(this)].pauses++;return nativePause.call(this);};
if(new URL(location.href).searchParams.has('noFrameCallback')){
 delete HTMLVideoElement.prototype.requestVideoFrameCallback;delete HTMLVideoElement.prototype.cancelVideoFrameCallback;
} else {
 const request=HTMLVideoElement.prototype.requestVideoFrameCallback,cancel=HTMLVideoElement.prototype.cancelVideoFrameCallback;
 HTMLVideoElement.prototype.requestVideoFrameCallback=function(callback){const id=identify(this);const token=request.call(this,(now,metadata)=>{e.frames.push({id,time:metadata.mediaTime});callback(now,metadata);});e.callbacks.push({video:this,id,token,callback});return token;};
 HTMLVideoElement.prototype.cancelVideoFrameCallback=function(token){e.cancelled.push({id:identify(this),token});return cancel.call(this,token);};
}
const container=document.getElementById('media'),reactRoot=createRoot(container);
let near=true,mounted=true,progress=0;
function render(){reactRoot.render(mounted?React.createElement(VideoScrubRenderer,{progress,isNearViewport:near,posterSrc:CINEMATIC_MANIFEST.poster.src,
 onReady:()=>{const v=container.querySelector('video');e.ready.push({time:v?.currentTime,frame:e.frames.at(-1)?.time});},
 onError:message=>{e.errors.push(message);mounted=false;render();}}):React.createElement('img',{src:CINEMATIC_MANIFEST.poster.src,'data-static-fallback':'true'}));}
function scroll(fraction){window.scrollTo(0,(document.scrollingElement.scrollHeight-innerHeight)*fraction);progress=computeHomeCinematicProgress(scrollY,document.scrollingElement.scrollHeight,innerHeight);render();}
window.fixture={scroll,hide(){near=false;render();},resume(){near=true;mounted=true;render();},unmount(){mounted=false;render();},
 release(index){const r=e.requests[index];r.released=true;descriptor.set.call(r.video,r.target);},
 late(id){const r=e.callbacks.filter(r=>r.id===id).at(-1);r?.callback(performance.now(),{mediaTime:6});},
 snapshot(){return {progress,requests:e.requests.map(r=>({id:r.id,target:r.target,released:r.released})),frames:e.frames,loaded:e.loaded,mediaErrors:e.mediaErrors,ready:e.ready,errors:e.errors,
 videos:e.videos.map((r,id)=>({id,src:r.video.getAttribute('src'),loads:r.loads,pauses:r.pauses})),cancelled:e.cancelled,
 poster:container.querySelector('img')?getComputedStyle(container.querySelector('img')).opacity:null,
 video:container.querySelector('video')?getComputedStyle(container.querySelector('video')).opacity:null,
 fallback:!!container.querySelector('[data-static-fallback]')};}};
scroll(.75);
</script></body></html>`;

test('first presented frame follows latest restored scroll; fallback and decoder cleanup stay bounded', {timeout:60000}, async()=>{
 const receipt={passed:false,scope:'Local Chromium native MP4 decode with controlled seek assignment; no physical Safari or production certification.',checks:[],errors:[],mediaResponses:[],transportFailures:[]};
 fs.mkdirSync(evidence,{recursive:true});
 let server,browser,inspectPage;
 try {
  const probe=createPortProbe();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const fixturePlugin={name:'owned-first-frame-test',configureServer(dev){dev.middlewares.use(async(req,res,next)=>{
   if(!req.url?.startsWith('/__first_frame__'))return next();
   try{res.setHeader('Content-Type','text/html');res.end(await dev.transformIndexHtml(req.url,fixture));}catch(error){next(error);}
  });}};
  server=await createServer({configFile:false,root,plugins:[react(),tailwind(),fixturePlugin],resolve:{alias:{'@':path.join(root,'src')}},
   server:{host:'127.0.0.1',port,strictPort:true,fs:{strict:true,allow:[root,path.resolve(root,'../../node_modules')]}},logLevel:'error'});
  await server.listen();const address=server.httpServer.address();const base='http://127.0.0.1:'+address.port;
  browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  const page=await context.newPage();page.setDefaultTimeout(7000);
  page.on('response',r=>{if(new URL(r.url()).pathname.endsWith('.mp4'))receipt.mediaResponses.push({path:new URL(r.url()).pathname,status:r.status(),type:r.headers()['content-type']});});
  page.on('requestfailed',r=>receipt.transportFailures.push({path:new URL(r.url()).pathname,error:r.failure()?.errorText}));
  inspectPage=()=>page.evaluate(()=>({fixturePresent:!!window.fixture,state:window.fixture?.snapshot()}));
  page.on('console',message=>{if(message.type()==='error')receipt.errors.push(message.text());});
  page.on('pageerror',error=>receipt.errors.push(error.message));
  const snapshot=()=>page.evaluate(()=>window.fixture.snapshot());
  await page.goto(base+'/__first_frame__',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.fixture?.snapshot().requests.length>0 && window.fixture.snapshot().loaded.length>0);
  let state=await snapshot();
  assert.ok(state.requests[0].target>5.9&&state.requests[0].target<6.1);
  assert.equal(state.loaded[0].time,0,'Native initial decode must actually be frame 0');
  assert.equal(state.ready.length,0,'Poster revealed frame 0 before the held initial seek');
  assert.equal(state.poster,'1');assert.equal(state.video,'0');
  receipt.checks.push('Native loadeddata at frame 0 retains poster on a 75% restored scroll');

  await page.evaluate(()=>window.fixture.scroll(.25));
  await page.waitForFunction(()=>window.fixture.snapshot().requests.some(r=>r.target>1.9&&r.target<2.1));
  await page.evaluate(()=>window.fixture.release(0));
  await page.waitForFunction(()=>window.fixture.snapshot().frames.some(f=>f.time>5.9&&f.time<6.1));
  state=await snapshot();assert.equal(state.ready.length,0,'Older presented frame revealed after the target changed');assert.equal(state.poster,'1');
  const latest=state.requests.findLastIndex(r=>r.target>1.9&&r.target<2.1);
  await page.evaluate(index=>window.fixture.release(index),latest);
  await page.waitForFunction(()=>window.fixture.snapshot().ready.length===1&&window.fixture.snapshot().poster==='0');
  state=await snapshot();assert.ok(Math.abs(state.ready[0].frame-2)<.075);assert.equal(state.video,'1');
  receipt.checks.push('Presented old 6s frame stays hidden; latest 2s frame reveals exactly once');

  await page.evaluate(()=>window.fixture.hide());
  await page.waitForFunction(()=>window.fixture.snapshot().videos[0].src===null);
  state=await snapshot();assert.ok(state.videos[0].pauses>0&&state.videos[0].loads>=2);assert.equal(state.poster,'1');
  receipt.checks.push('Visibility teardown removes src and pauses/reloads the old decoder');
  await page.evaluate(()=>{window.fixture.scroll(.75);window.fixture.resume();});
  await page.waitForFunction(()=>window.fixture.snapshot().loaded.some(r=>r.id===1));
  await page.evaluate(()=>window.fixture.hide());
  await page.waitForFunction(()=>window.fixture.snapshot().videos[1].src===null);
  state=await snapshot();assert.ok(state.cancelled.some(r=>r.id===1));
  await page.evaluate(()=>window.fixture.late(1));
  state=await snapshot();assert.equal(state.ready.length,1);assert.equal(state.poster,'1');
  receipt.checks.push('Pending frame callback is canceled; stale lifecycle callback cannot reveal the poster');

  await page.evaluate(()=>window.fixture.resume());
  await page.waitForFunction(()=>window.fixture.snapshot().fallback);
  state=await snapshot();assert.equal(state.errors.length,1);assert.equal(state.ready.length,1);
  assert.equal(state.videos.at(-1).src,null);assert.ok(state.videos.at(-1).pauses>0);
  receipt.checks.push('Held seek reaches the existing deadline, static error fallback, and decoder cleanup');
  receipt.native=state;
  await context.close();

  const legacy=await browser.newContext({viewport:{width:1280,height:720}});
  await legacy.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  const legacyPage=await legacy.newPage();legacyPage.setDefaultTimeout(7000);
  inspectPage=()=>legacyPage.evaluate(()=>({fixturePresent:!!window.fixture,state:window.fixture?.snapshot()}));
  legacyPage.on('console',message=>{if(message.type()==='error')receipt.errors.push(message.text());});
  legacyPage.on('pageerror',error=>receipt.errors.push(error.message));
  await legacyPage.goto(base+'/__first_frame__?noFrameCallback',{waitUntil:'domcontentloaded'});
  await legacyPage.waitForFunction(()=>window.fixture?.snapshot().requests.length>0&&window.fixture.snapshot().loaded.length>0);
  state=await legacyPage.evaluate(()=>window.fixture.snapshot());assert.equal(state.ready.length,0);assert.equal(state.poster,'1');
  await legacyPage.evaluate(()=>window.fixture.release(0));
  await legacyPage.waitForFunction(()=>window.fixture.snapshot().ready.length===1&&window.fixture.snapshot().poster==='0');
  state=await legacyPage.evaluate(()=>window.fixture.snapshot());assert.ok(Math.abs(state.ready[0].time-6)<.03);
  await legacyPage.evaluate(()=>window.fixture.unmount());
  await legacyPage.waitForFunction(()=>window.fixture.snapshot().videos[0].src===null);
  receipt.checks.push('Without frame callbacks, loadeddata stays hidden until the real target seek completes; unmount releases src');
  receipt.legacy=await legacyPage.evaluate(()=>window.fixture.snapshot());await legacy.close();
  assert.deepEqual(receipt.errors,[]);receipt.passed=true;
 }catch(error){receipt.errors.push(error.message);receipt.failureState=await inspectPage?.().catch(()=>null);throw error;}
 finally{await browser?.close();await server?.close();fs.writeFileSync(path.join(evidence,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');}
});
