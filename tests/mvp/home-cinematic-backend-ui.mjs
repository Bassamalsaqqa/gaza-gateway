import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright-core';
import {publishedHome} from '../../src/content/published/home.ts';
import {publishedDestinationsPresentation} from '../../src/content/published/destinations-presentation.ts';

// Browser-only synthetic transport. Never connects to a backend or production.
const base='http://127.0.0.1:5194', out=process.env.OUTPUT_DIR || 'scratch/home-glass-backend-evidence';
fs.mkdirSync(out,{recursive:true});
const receipt={passed:false,scope:'Backend-mode components with isolated synthetic public API responses; no backend persistence/business-flow certification.',checks:[],errors:[]};
const browser=await chromium.launch({channel:'msedge',headless:true});
const airports=[
 {code:'AMM',airportName:{en:'Test Amman airport',ar:'مطار عمّان للاختبار'},city:{en:'Amman',ar:'عمّان'},country:{en:'Jordan',ar:'الأردن'},timezone:'Asia/Amman',blockMinutes:45,active:true},
 {code:'CAI',airportName:{en:'Test Cairo airport',ar:'مطار القاهرة للاختبار'},city:{en:'Cairo',ar:'القاهرة'},country:{en:'Egypt',ar:'مصر'},timezone:'Africa/Cairo',blockMinutes:65,active:true},
];
try {
 for(const locale of ['', '/ar']) for(const width of [320,390,768,1366]) {
  const context=await browser.newContext({viewport:{width,height:width<768?844:900},ignoreHTTPSErrors:true});
  const page=await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(30000);
  page.on('pageerror',e=>receipt.errors.push(e.message));
  let networkFailure=false, offeringRequests=0;
  const requests=[];
  await context.route(u=>u.pathname.startsWith('/api/'),async route=>{
   const req=route.request(), url=new URL(req.url()); requests.push({path:url.pathname,method:req.method()});
   const headers={'Access-Control-Allow-Origin':base,'Access-Control-Allow-Credentials':'true','Access-Control-Expose-Headers':'X-Request-Id','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Accept, Content-Type, X-Request-Id, X-CSRF-TOKEN'};
   if(req.method()==='OPTIONS') return route.fulfill({status:204,headers});
   const id=req.headers()['x-request-id']; headers['X-Request-Id']=id;
   const meta={requestId:id,timestamp:new Date().toISOString()};
   const cmsKey=url.pathname.replace('/api/v1/cms/published/','');
   if(req.method()==='GET' && ['home','destinations.presentation'].includes(cmsKey)) {
    const payload=cmsKey==='home'?{...publishedHome,copy:{...publishedHome.copy,heritageSpotlightTitle:{en:'Retired saved heading',ar:'عنوان محفوظ محذوف'},heritageSpotlightDesc:{en:'Retired saved copy',ar:'نص محفوظ محذوف'}}}:publishedDestinationsPresentation;
    return route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify({success:true,data:{id:cmsKey,kind:cmsKey,slug:cmsKey,revisionNumber:1,status:'published',updatedAt:meta.timestamp,payload},meta})});
   }
   if(req.method()==='GET' && url.pathname==='/api/v1/network/airports' && !networkFailure) return route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify({success:true,data:airports,meta})});
   if(req.method()==='GET' && url.pathname==='/api/v1/offerings') {offeringRequests++;return route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify({success:true,data:[],meta})});}
   return route.fulfill({status:404,contentType:'application/json',headers,body:JSON.stringify({success:false,error:{code:'not_found',message:'Isolated test endpoint.'},meta})});
  });
  try {
   await page.goto(base+locale+'/',{waitUntil:'networkidle'});
   const booking=page.locator('#home-booking'), submit=booking.locator('button[type="submit"]');
   await submit.waitFor(); await page.waitForFunction(()=>document.querySelector('#home-booking button[type="submit"]')?.disabled===false);
   assert.equal(await booking.locator('a[href$="/manage"]').count(),0,'Duplicate booking Manage action returned');
   const manage=page.locator('.home-hero-section a[href$="/manage"]');
   assert.equal(await manage.count(),1,'Backend-mode hero Manage button missing');
   assert.ok((await manage.boundingBox()).height>=44,'Backend-mode Manage button too small');
   assert.ok(await booking.locator('form').evaluate(el=>getComputedStyle(el).backdropFilter.includes('blur(')),'Backend console frost missing');
   const canvas=booking.locator('form img');
   assert.ok(await canvas.evaluate(el=>getComputedStyle(el).filter.includes('blur(') && Number(getComputedStyle(el).opacity)>=0.3),'Backend console canvas not restored');
   assert.equal(await page.locator('[data-utility-card="check-in"]').count(),0,'Production-mode mock check-in returned');
   assert.equal(await page.locator('main [role="tablist"]').count(),0,'Production-mode mock Today board returned');
   assert.equal(await booking.locator('input[type="date"]').count(),1,'Real backend date field missing');
   assert.equal(await page.getByText(locale?'عنوان محفوظ محذوف':'Retired saved heading',{exact:true}).count(),0,'Saved legacy CMS heading rendered again');
   assert.ok(await page.locator('a[data-surface-target="home.destination-card"]').count()>=2,'Synthetic server destinations not rendered');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Backend booking console overflow');
   const offeringsResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/offerings');
   await submit.click(); await offeringsResponse;
   assert.ok(offeringRequests>0,'Search did not reach real query adapter');
   await booking.getByText(locale?'لا توجد رحلة منشورة لهذه الوجهة في التاريخ المختار. جرّب تاريخاً آخر.':'No flight is published for this route on your chosen date. Try another date.',{exact:true}).waitFor();
   const form=booking.locator('form'); await form.scrollIntoViewIfNeeded();
   await page.screenshot({path:`${out}/${locale?'ar':'en'}-${width}-booking.png`});
   assert.ok(requests.every(r=>r.method==='GET'||r.method==='OPTIONS'),'Unexpected backend write');
   receipt.checks.push(`${locale||'en'} ${width}: real console, server destinations, search/empty state, no mock board/check-in, no overflow/writes`);
   if(width===390) {
    networkFailure=true; await page.reload({waitUntil:'networkidle'});
    await page.waitForFunction(()=>document.querySelector('#home-booking button[type="submit"]')?.disabled===true);
    await booking.getByRole('alert').waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Backend error state overflow');
    const retryRequest=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/v1/network/airports' && r.method()==='GET');
    await booking.getByRole('button',{name:locale?'إعادة المحاولة':'Try again',exact:true}).click(); await retryRequest;
    receipt.checks.push(`${locale||'en'} 390: visible failure, disabled submit, actual retry`);
   }
  } catch(e) {receipt.failurePage=await page.locator('body').innerText().catch(()=> 'Unavailable');await page.screenshot({path:out+'/failure.png'}).catch(()=>{});throw e;}
  finally {await context.close();}
 }
 assert.equal(receipt.errors.length,0,receipt.errors.join('\n')); receipt.passed=true;
 console.log(`PASS: ${receipt.checks.length} backend-mode checks`);
} catch(e) {receipt.errors.push(e.message);process.exitCode=1;console.error(e.message);}
finally {await browser.close();fs.writeFileSync(out+'/receipt.json',JSON.stringify(receipt,null,2)+'\n');}
