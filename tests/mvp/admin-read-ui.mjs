import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { seedFleetAircraft, seedFleetLayouts } from '../../src/lib/fleet/seed.ts';

// Browser-only transport fixtures. Real PHP/MySQL read authorization and response
// contracts are independently exercised by test_live_admin_*; no production access.
const previewOnly=process.argv.includes('--preview-only');
const output = previewOnly ? 'scratch/admin-preview-price-evidence' : 'scratch/admin-ui-evidence'; fs.mkdirSync(output, {recursive:true});
const permissions = ['dashboard.view','admin.manage','commercial.view','commercial.edit','ops.view','ops.edit','content.view','content.edit','engagement.view','engagement.edit'];
const id='11111111-1111-4111-8111-111111111111';
const profile={id,username:'synthetic-owner',email:'owner@example.invalid',fullNameEn:'Synthetic owner',fullNameAr:'مالك تجريبي',role:'admin',permissions,mfaEnabled:false};
const browser=await chromium.launch({channel:'msedge',headless:true}); const checks=[]; let currentPage;
try {
  for(const locale of previewOnly ? [''] : ['', '/ar']) {
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    await context.route('https://127.0.0.1:18449/api/v1/**', async route=>{
      if (route.request().method()==='OPTIONS') {
        await route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'http://127.0.0.1:5179','Access-Control-Allow-Credentials':'true','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Accept, Content-Type, X-Request-Id, X-CSRF-TOKEN'}}); return;
      }
      const pathname=new URL(route.request().url()).pathname.replace('/api/v1','');
      console.log('FIXTURE_REQUEST '+route.request().method()+' '+pathname);
      const fixtures={
        '/staff/me':profile,'/staff/sessions':[], '/staff/users':[{...profile,isActive:true,createdAt:'2026-10-14T00:00:00Z'}],
        '/admin/dashboard':{confirmedBookings:7,confirmedPassengers:9,cancelledBookings:2,passengerAccounts:4,activeDestinations:20,activeAircraft:3,activeSchedules:14},
        '/admin/customers':{items:[{id,name:'Synthetic Passenger',email:'passenger@example.invalid',phone:'',status:'active',bookingCount:2,createdAt:'2026-10-14T00:00:00Z'}],page:1,pageSize:25,total:1},
        '/admin/activity':{items:[{id:'identity:'+id,domain:'identity',action:'postStaffLogin',outcome:'success',actorId:id,targetId:id,occurredAt:'2026-10-14T00:00:00Z'}],page:1,pageSize:25,total:1},
        '/fleet/snapshot':{revision:0,aircraft:seedFleetAircraft(),layouts:seedFleetLayouts()},
      };
      // Directory DTO is closed: profile-only permission fields must not escape.
      const directory=fixtures['/staff/users'][0]; delete directory.permissions;
      const data=fixtures[pathname]; const meta={requestId:route.request().headers()['x-request-id']??crypto.randomUUID(),timestamp:new Date().toISOString()};
      await route.fulfill({status:data===undefined?404:200,contentType:'application/json',headers:{'X-Request-Id':meta.requestId,'Access-Control-Expose-Headers':'X-Request-Id','Access-Control-Allow-Origin':'http://127.0.0.1:5179','Access-Control-Allow-Credentials':'true'},body:JSON.stringify(data===undefined?{success:false,error:{code:'not_found',message:'Not found.'},meta}:{success:true,data,meta})});
    });
    const page=await context.newPage();
    currentPage=page;
    page.setDefaultNavigationTimeout(120000);
    page.on('pageerror', error=>console.log('PAGE_ERROR '+error.message));
    const navigate=url=>page.goto(url,{waitUntil:'domcontentloaded'});
    if(!previewOnly) {
    await navigate('http://127.0.0.1:5179'+locale+'/admin');
    await page.getByTestId('live-admin-dashboard').waitFor();
    await page.getByText(locale?'الوجهات المتاحة':'Available destinations',{exact:true}).waitFor();
    assert.equal(await page.locator('[data-testid="live-admin-dashboard"]').getByText('20',{exact:true}).count(),1);
    checks.push(locale+' live dashboard renders server totals');
    await navigate('http://127.0.0.1:5179'+locale+'/admin/customers'); await page.getByText('Synthetic Passenger',{exact:true}).waitFor(); checks.push(locale+' live customer directory');
    await navigate('http://127.0.0.1:5179'+locale+'/admin/activity'); await page.getByText('postStaffLogin',{exact:true}).waitFor(); checks.push(locale+' real activity projection UI');
    await navigate('http://127.0.0.1:5179'+locale+'/admin/staff'); await page.getByText(locale?'دعوة موظف':'Invite staff',{exact:true}).waitFor(); checks.push(locale+' live staff workspace and roles');
    }
    await navigate('http://127.0.0.1:5179'+locale+'/admin/products?tab=seatmaps');
    const plane=page.getByTestId('seatmap-preview').getByRole('grid'); await plane.waitFor();
    assert(!/\$|USD/.test(await page.getByTestId('seatmap-preview').innerText()),'free preview advertises a mock charge');
    for(const width of previewOnly ? [390] : [1440,1280,390]) {
      await page.setViewportSize({width,height:1000});
      for(let state=0;state<(width>=1024?2:1);state++) {
        if(state===1) await page.locator('button').filter({has:page.locator('svg.lucide-panel-left-close')}).click();
        await page.waitForTimeout(250);
        const bounds=await plane.boundingBox(); const container=await page.getByTestId('seatmap-preview').boundingBox();
        assert(bounds && container && bounds.x>=container.x-1 && bounds.x+bounds.width<=container.x+container.width+1, `plane clipped: ${locale} ${width} ${state}`);
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page horizontal overflow');
        checks.push(`${locale} plane fully fits ${width} sidebar state ${state}`);
        await page.screenshot({path:`${output}/${locale?'ar':'en'}-${width}-${state}.png`,fullPage:true});
        if(state===1) await page.locator('button').filter({has:page.locator('svg.lucide-panel-left-open')}).click();
      }
    }
    await context.close();
  }
  fs.writeFileSync(`${output}/receipt.json`,JSON.stringify({passed:true,checks,scope:'frontend synthetic transport only; real database gate separate'},null,2)+'\n');
  console.log(`PASS ${checks.length} focused ${previewOnly?'free preview':'EN/AR Admin and aircraft'} browser checks.`);
} catch (error) {
  if(currentPage) {fs.writeFileSync(`${output}/failure-body.txt`,await currentPage.locator('body').innerText()); await currentPage.screenshot({path:`${output}/failure.png`,fullPage:true});}
  throw error;
} finally {await browser.close();}
