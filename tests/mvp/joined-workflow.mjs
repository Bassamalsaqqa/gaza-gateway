import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { chromium } from "playwright-core";
import { encodeScheduleKey } from "../../src/lib/offerings/codec.ts";
import { publishedHome } from "../../src/content/published/home.ts";
import { verifyMailCapture } from "../../backend/scripts/mail-capture-contracts.mjs";

export async function runJoinedWorkflow({origin,api,output,fixture,key,exec,startSink,readProofToken,slice}) {
 if (slice === "persistence") return; // Owned fixture setup only; persistence verification runs in the caller.
 const browser=await chromium.launch({channel:"msedge",headless:true}); const contexts=[]; const checks=[]; let active;
 const check=name=>{checks.push(name);console.log("PASS "+name);};
 const captures={}; const contracts=["mvp-mail","mvp-site","mvp-editorial","mvp-reservations","mvp-gallery"].map(name=>JSON.parse(fs.readFileSync(new URL(`../../docs/backend/${name}.openapi.json`,import.meta.url))));
 const pendingCaptures=new Set();
 async function drain(){while(pendingCaptures.size) await Promise.all([...pendingCaptures]);}
 async function navigate(page,url){await page.waitForLoadState("networkidle");await drain();await page.goto(url);}
 async function context(options={}) {
  const c=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000},...options});contexts.push(c);
  const p=await c.newPage();p.setDefaultTimeout(20000);p.on("requestfailed",r=>checks.push("REQUEST FAILURE: "+new URL(r.url()).pathname+" "+r.failure()?.errorText));p.on("pageerror",e=>checks.push("BROWSER ERROR: "+e.message));
  p.on("response",r=>{
   const parsed=new URL(r.url());if(parsed.origin!==new URL(api).origin)return;
   const matches=[];
   for(const spec of contracts)for(const [template,methods]of Object.entries(spec.paths))for(const [method,op]of Object.entries(methods)){
    const regex=new RegExp("^/api/v1"+template.replace(/\{[^}]+\}/g,"[^/]+")+"$");
    if(r.request().method().toLowerCase()===method&&regex.test(parsed.pathname))matches.push({spec,template,op});
   }
   matches.sort((a,b)=>(a.template.match(/\{/g)??[]).length-(b.template.match(/\{/g)??[]).length);
   const matched=matches[0];if(!matched)return;
   const task=(async()=>{try{await r.finished();const capture={operationId:matched.op.operationId,status:r.status(),contentType:r.headers()["content-type"],payload:await r.json()};verifyMailCapture(matched.spec,capture);captures[capture.operationId+":"+r.status()]=capture;}catch(e){if(r.request().failure()?.errorText === "net::ERR_ABORTED") {checks.push("UNCERTIFIED CANCELLED RESPONSE: "+matched.op.operationId);} else {checks.push("CONTRACT FAILURE: "+e.message);}}})();
   pendingCaptures.add(task);task.finally(()=>pendingCaptures.delete(task));
  });return p;
 }
 async function apiCall(page,method,url,body,realm="staff",expected=[200]) {
  const r=await page.evaluate(async({api,method,url,body,realm})=>{const headers={Accept:"application/json"};if(method!=="GET"){const c=await fetch(api+(realm==="staff"?"/staff/csrf":"/auth/csrf"),{credentials:"include"});const csrf=await c.json();headers["X-CSRF-TOKEN"]=csrf.csrfToken;headers["Content-Type"]="application/json";}const r=await fetch(api+url,{method,headers,credentials:"include",...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};},{api,method,url,body,realm});
  assert.ok(expected.includes(r.status),`${method} ${url}: ${r.status} ${r.body.error?.code??""}`);return r;
 }
 function otp(){const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=crypto.createHmac("sha1",key).update(b).digest(),o=h[19]&15;return ((h.readUInt32BE(o)&0x7fffffff)%1000000).toString().padStart(6,"0");}
 try {
  const admin=active=await context();await navigate(admin,origin+"/admin/signin");await admin.waitForFunction(()=>Object.keys(document.querySelector("input[name=username]")??{}).some(k=>k.startsWith("__reactProps$")));await admin.locator('[name="username"]').fill(fixture.username);await admin.locator('[name="password"]').fill(fixture.password);await admin.locator("form").getByRole("button",{name:"Staff sign in",exact:true}).click();await admin.locator('[name="totpCode"]').fill(otp());await admin.getByRole("button",{name:"Verify",exact:true}).click();await admin.waitForURL(origin+"/admin");check("staff UI password and TOTP sign-in");
  if (slice === "identity") {
    await apiCall(admin,"PUT","/admin/settings/email",{expectedRevision:0,driver:"smtp",host:"mailpit",port:1025,tls:"none",senderName:"Gaza Gateway",senderEmail:"accounts@example.test",replyTo:"",username:"",password:""});
    startSink();await new Promise(r=>setTimeout(r,500));
    const account=active=await context(), email="signup-browser@example.test", password=fixture.password, replacement=password+"-new";
    const hydrated=()=>account.waitForFunction(()=>Object.keys(document.querySelector("form input")??{}).some(k=>k.startsWith("__reactProps$")));
    await navigate(account,origin+"/register");await hydrated();
    await account.locator('[name="firstName"]').fill("Synthetic");await account.locator('[name="lastName"]').fill("Registration");
    await account.locator('[name="email"]').fill(email);await account.locator('[name="password"]').fill(password);
    let response=account.waitForResponse(r=>r.request().method()==="POST"&&r.url().endsWith("/auth/register"));
    await account.locator('form button[type="submit"]').click();assert.equal((await response).status(),202);
    exec("identity-verification-mail",["php","artisan","mvp:identity-smtp:work","--limit=1"]);
    const verification=readProofToken(email,"verification");
    await navigate(account,origin+"/verify-email");await hydrated();await account.locator('[name="token"]').fill(verification);
    response=account.waitForResponse(r=>r.request().method()==="POST"&&r.url().endsWith("/auth/email/verify"));
    await account.locator('form button[type="submit"]').click();assert.equal((await response).status(),200);
    check("passenger UI registration and verification consume a proof received by synthetic SMTP");
    await navigate(account,origin+"/forgot-password");await hydrated();await account.locator('[name="email"]').fill(email);
    response=account.waitForResponse(r=>r.request().method()==="POST"&&r.url().endsWith("/auth/password/forgot"));
    await account.locator('form button[type="submit"]').click();assert.equal((await response).status(),202);
    exec("identity-recovery-mail",["php","artisan","mvp:identity-smtp:work","--limit=1"]);
    const reset=readProofToken(email,"reset");
    await navigate(account,origin+"/reset-password");await hydrated();await account.locator('[name="email"]').fill(email);await account.locator('[name="token"]').fill(reset);await account.locator('[name="password"]').fill(replacement);
    response=account.waitForResponse(r=>r.request().method()==="POST"&&r.url().endsWith("/auth/password/reset"));
    await account.locator('form button[type="submit"]').click();assert.equal((await response).status(),200);
    await navigate(account,origin+"/signin");await hydrated();await account.locator('[name="email"]').fill(email);await account.locator('[name="password"]').fill(replacement);await account.locator('form button[type="submit"]').click();await account.waitForURL(origin+"/account");await account.getByText(email,{exact:true}).first().waitFor();
    check("passenger UI recovery consumes SMTP proof and new password signs in");
    await drain();assert.ok(!checks.some(c=>c.startsWith("CONTRACT FAILURE") || c.startsWith("BROWSER ERROR")),checks.join("; "));
    return;
  }
  if (slice === "cms") {
    await navigate(admin,origin+"/admin/website?tab=homepage");
    await admin.locator("#copy-h1-en").fill("Synthetic CMS editor publication");
    let response = admin.waitForResponse(r=>r.request().method()==="PUT" && r.url().endsWith("/cms/editorial/home/draft"));
    await admin.getByRole("button",{name:/^save draft$/i}).click();assert.equal((await response).status(),200);
    response = admin.waitForResponse(r=>r.request().method()==="POST" && r.url().endsWith("/cms/editorial/home/publish"));
    await admin.getByRole("button",{name:"Publish",exact:true}).click();assert.equal((await response).status(),200);
    const visitor = active = await context();await navigate(visitor,origin);
    await visitor.getByRole("heading",{name:"Synthetic CMS editor publication",exact:true}).waitFor();
    check("actual Home editor save/publish reaches an independent browser");
    await navigate(admin,origin+"/admin/destinations/AMM?tab=content");
    const section = admin.locator('section[aria-labelledby="dst-ed-heading"]');
    await section.locator("#dst-ed-AMM-blurb-en").fill("Synthetic shared destination narrative");
    response = admin.waitForResponse(r=>r.request().method()==="PUT" && r.url().endsWith("/cms/editorial/destinations.editorial/draft"));
    await section.getByRole("button",{name:/^save draft$/i}).click();assert.equal((await response).status(),200);
    response = admin.waitForResponse(r=>r.request().method()==="POST" && r.url().endsWith("/cms/editorial/destinations.editorial/publish"));
    await section.getByRole("button",{name:"Publish",exact:true}).click();assert.equal((await response).status(),200);
    await navigate(visitor,origin+"/destinations/AMM");await visitor.getByText("Synthetic shared destination narrative",{exact:true}).waitFor();
    check("actual destination narrative editor save/publish reaches an independent browser");
    await navigate(admin,origin+"/admin/settings");await admin.getByLabel("Contact email",{exact:true}).fill("shared-contact@example.test");
    response = admin.waitForResponse(r=>r.request().method()==="PUT" && r.url().endsWith("/admin/settings/contact/draft"));
    await admin.getByRole("button",{name:"Save draft",exact:true}).click();assert.equal((await response).status(),200);
    response = admin.waitForResponse(r=>r.request().method()==="POST" && r.url().endsWith("/admin/settings/contact/publish"));
    await admin.getByRole("button",{name:"Publish saved draft",exact:true}).click();assert.equal((await response).status(),200);
    await navigate(visitor,origin+"/contact");await visitor.getByText("shared-contact@example.test",{exact:true}).first().waitFor();
    check("actual contact settings editor save/publish reaches an independent browser");
    await visitor.locator("#c-name").fill("Synthetic Enquirer");await visitor.locator("#c-email").fill("enquirer@example.test");await visitor.locator("#c-subject").selectOption("other");await visitor.locator("#c-message").fill("Synthetic persisted contact enquiry from another browser.");
    response=visitor.waitForResponse(r=>r.request().method()==="POST"&&r.url().endsWith("/contact"));
    await visitor.locator('form button[type="submit"]').click();assert.equal((await response).status(),202);
    await navigate(admin,origin+"/admin/inbox");await admin.getByText("Synthetic Enquirer",{exact:true}).first().waitFor();
    response=admin.waitForResponse(r=>r.request().method()==="PATCH"&&r.url().endsWith("/status"));await admin.getByRole("button",{name:"Resolve",exact:true}).click();assert.equal((await response).status(),200);
    await admin.reload();await admin.getByText("Synthetic Enquirer",{exact:true}).first().waitFor();await admin.getByRole("button",{name:"Reopen",exact:true}).waitFor();
    check("public contact submission reaches original Admin inbox and resolved status survives refresh");
    await drain();assert.ok(!checks.some(c=>c.startsWith("CONTRACT FAILURE") || c.startsWith("BROWSER ERROR")),checks.join("; "));
    return;
  }
  if (slice === "publication") {
    await navigate(admin,origin+"/admin/airport?tab=gallery");
    const title = admin.getByRole("textbox",{name:"Display title rec-present-ruins-2008",exact:true});
    await title.fill("Synthetic shared gallery publication");
    const saved = admin.waitForResponse(r=>r.request().method()==="PUT" && r.url().endsWith("/gallery/editorial/draft"));
    await admin.getByRole("button",{name:"Save Draft",exact:true}).click();assert.equal((await saved).status(),200);
    const published = admin.waitForResponse(r=>r.request().method()==="POST" && r.url().endsWith("/gallery/editorial/publish"));
    await admin.getByRole("button",{name:"Publish",exact:true}).click();assert.equal((await published).status(),200);
    const visitor = active = await context();await navigate(visitor,origin+"/gallery");
    await visitor.getByText("Synthetic shared gallery publication",{exact:true}).first().waitFor();
    await visitor.screenshot({path:path.join(output,"gallery-en-desktop.png"),fullPage:true});
    check("actual Admin gallery editor saves/publishes; independent visitor sees shared publication");
    const mobile = active = await context({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await navigate(mobile,origin+"/ar/gallery");
    assert.equal(await mobile.locator("html").getAttribute("dir"),"rtl");
    await mobile.locator('main').waitFor();
    await mobile.screenshot({path:path.join(output,"gallery-ar-mobile.png"),fullPage:true});
    const fresh = await apiCall(mobile,"GET","/gallery/published",undefined,"public");
    assert.equal(fresh.body.data.payload.items[0].title.en,"Synthetic shared gallery publication");
    check("Arabic mobile reads the same gallery revision with RTL");
    await drain();assert.ok(!checks.some(c=>c.startsWith("CONTRACT FAILURE") || c.startsWith("BROWSER ERROR")),checks.join("; "));
    return;
  }
  await apiCall(admin,"POST","/admin/fleet/aircraft",{aircraft:{id:"mvp-synthetic",model:"Synthetic fixture aircraft",registration:"TEST-MVP",active:true},initialLayout:{rows:3,letters:["A","B","C","D","E","F"],aisleAfter:3,zones:[{id:"economy",firstRow:1,lastRow:3}],extraLegroomRows:[],unavailable:[]}},"staff",[201]);
  await apiCall(admin,"POST","/admin/schedules",{id:"mvp-synthetic-flight",number:"PS901",direction:"out",destination:"AMM",days:[0,1,2,3,4,5,6],departTime:"08:30",arriveTime:"09:30",aircraft:"Synthetic fixture aircraft",aircraftId:"mvp-synthetic",from:"2026-12-20",until:"2026-12-20",active:true,exceptions:[]},"staff",[201]);
  await navigate(admin,origin+"/admin/schedules");
  await admin.getByRole("row").filter({hasText:"PS901"}).getByRole("button",{name:"Edit",exact:true}).click();
  await admin.locator("#sc-number").fill("PS902");
  const scheduleEdit=admin.waitForResponse(r=>r.request().method()==="PATCH"&&r.url().endsWith("/admin/schedules/"+encodeScheduleKey("mvp-synthetic-flight")));
  await admin.getByRole("button",{name:"Save changes",exact:true}).click();assert.equal((await scheduleEdit).status(),200);
  check("actual Admin schedule editor persists an offering edit before passenger booking");
  await apiCall(admin,"POST","/admin/meals",{id:"synthetic-meal",label:{en:"Synthetic test meal",ar:"\u0648\u062c\u0628\u0629 \u0627\u062e\u062a\u0628\u0627\u0631"},active:true},"staff",[201]);
  const doc=structuredClone(publishedHome);doc.copy.h1.en="Synthetic joined workflow publication";doc.copy.h1.ar="\u0646\u0634\u0631 \u0627\u062e\u062a\u0628\u0627\u0631 \u0645\u062a\u0643\u0627\u0645\u0644";
  const saved=await apiCall(admin,"PUT","/cms/editorial/home/draft",{expectedRevision:0,payload:doc});await apiCall(admin,"POST","/cms/editorial/home/publish",{expectedRevision:saved.body.data.revision});
  check("authenticated staff browser creates offering/meal and publishes content through real APIs");
  const passenger=active=await context();await navigate(passenger,origin);await passenger.getByRole("heading",{name:doc.copy.h1.en,exact:true}).waitFor();check("independent browser sees published content");
  await navigate(passenger,origin+"/signin");await passenger.waitForFunction(()=>Object.keys(document.querySelector("input[name=email]")??{}).some(k=>k.startsWith("__reactProps$")));await passenger.locator('[name="email"]').fill(fixture.emails[0]);await passenger.locator('[name="password"]').fill(fixture.password);await passenger.locator('form button[type="submit"]').click();await passenger.waitForURL(origin+"/account");await passenger.getByText(fixture.emails[0],{exact:true}).first().waitFor({timeout:60000});check("passenger UI sign-in");
  const offerings=await apiCall(passenger,"GET","/offerings?date=2026-12-20",undefined,"passenger");const items=offerings.body.data.items??offerings.body.data;assert.ok(Array.isArray(items)&&items.length===1,"One persisted offering required");assert.equal(items[0].number,"PS902");const id=items[0].id??items[0].serviceId;
  await navigate(passenger,origin+"/book?offering="+id);
  async function fillBooking(page){await page.getByLabel("First name",{exact:true}).waitFor({timeout:30000});await page.getByLabel("First name",{exact:true}).fill("Synthetic");await page.getByLabel("Last name",{exact:true}).fill("Passenger");await page.getByLabel("Date of birth",{exact:true}).fill("1990-01-01");await page.getByLabel("Nationality",{exact:true}).fill("Palestinian");await page.getByLabel("Travel document",{exact:true}).fill("SYNTHETIC-DOC");await page.getByLabel("Meal",{exact:true}).selectOption("synthetic-meal");await page.getByRole("button",{name:/1A.*available/i}).click();}
  await fillBooking(passenger);await passenger.screenshot({path:path.join(output,"booking-en-desktop.png"),fullPage:true});
  const requestPromise=passenger.waitForRequest(r=>r.method()==="POST"&&new URL(r.url()).pathname==="/api/v1/reservations");const bookedPromise=passenger.waitForResponse(r=>r.request().method()==="POST"&&new URL(r.url()).pathname==="/api/v1/reservations");await passenger.getByRole("button",{name:"Confirm free booking",exact:true}).click();const command=(await requestPromise).postDataJSON();const booked=await(await bookedPromise).json();assert.equal(booked.success,true);const ref=booked.data.reservation.reference;await passenger.getByRole("heading",{name:"Booking confirmed",exact:true}).waitFor();await passenger.screenshot({path:path.join(output,"ticket-en-desktop.png"),fullPage:true});check("real UI seat/meal selection and free booking ticket");
  let printed=false;await passenger.evaluate(()=>{window.print=()=>{window.__mvpPrintCalled=true;};});await passenger.getByRole("button",{name:"Print / save PDF",exact:true}).click();printed=await passenger.evaluate(()=>window.__mvpPrintCalled===true);assert.ok(printed);check("ticket print action invokes browser printing");
  const enPdf=await passenger.pdf({path:path.join(output,"ticket-en.pdf"),format:"A4",printBackground:true});assert.ok(enPdf.subarray(0,5).toString()==="%PDF-" && enPdf.length>2000);check("English ticket renders to a real browser PDF");
  const adminReservation=await apiCall(admin,"GET","/admin/reservations/"+ref);assert.equal(adminReservation.body.data.reservation.reference,ref);await navigate(admin,origin+"/admin/bookings/"+ref);await admin.getByText(ref,{exact:true}).first().waitFor();check("Admin sees same persisted reservation");
  await apiCall(admin,"PUT","/admin/settings/email",{expectedRevision:0,driver:"smtp",host:"mailpit",port:1025,tls:"none",senderName:"Gaza Gateway",senderEmail:"tickets@example.test",replyTo:"",username:"",password:""});
  exec("mail-failure",["php","artisan","mvp:mail:work","--limit=1"]);let mail=await apiCall(passenger,"GET","/reservations/"+ref+"/email",undefined,"passenger");assert.equal(mail.body.data.status,"failed");
  startSink();await new Promise(r=>setTimeout(r,500));exec("mail-due",["php","-r",String.raw`require "vendor/autoload.php"; $a=require "bootstrap/app.php"; $a->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap(); \Illuminate\Support\Facades\DB::table("mvp_mail_messages")->where("status","failed")->update(["next_attempt_at"=>\Illuminate\Support\Facades\DB::raw("clock_timestamp()")]);`]);exec("mail-retry",["php","artisan","mvp:mail:work","--limit=1"]);mail=await apiCall(passenger,"GET","/reservations/"+ref+"/email",undefined,"passenger");assert.equal(mail.body.data.status,"accepted");check("real SMTP connection failure then retry accepted by synthetic local sink");
  await navigate(passenger,origin+"/account/trips/"+ref);await passenger.getByRole("button",{name:"Cancel booking",exact:true}).click();await passenger.getByRole("alertdialog").getByRole("button",{name:"Cancel booking",exact:true}).click();await passenger.getByText("Cancelled",{exact:true}).first().waitFor();const seats=await apiCall(passenger,"GET","/offerings/"+id+"/seats",undefined,"passenger");assert.ok(!seats.body.data.occupiedSeats.includes("1A"));check("passenger cancellation releases authoritative seat");
  const replay=await apiCall(passenger,"POST","/reservations",command,"passenger");assert.equal(replay.body.data.reservation.status,"cancelled");check("idempotent replay remains cancelled");
  const mobile=active=await context({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await navigate(mobile,origin+"/ar");await mobile.getByRole("heading",{name:doc.copy.h1.ar,exact:true}).waitFor();assert.equal(await mobile.locator('html').getAttribute('dir'),"rtl");await mobile.screenshot({path:path.join(output,"publication-ar-mobile.png"),fullPage:true});check("Arabic mobile independently reads published content with RTL");
  const second=active=await context({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await navigate(second,origin+"/signin");await second.waitForFunction(()=>Object.keys(document.querySelector("input[name=email]")??{}).some(k=>k.startsWith("__reactProps$")));
  await second.locator('[name="email"]').fill(fixture.emails[1]);await second.locator('[name="password"]').fill(fixture.password);await second.locator('form button[type="submit"]').click();
  await second.waitForURL(origin+"/account");await second.getByText(fixture.emails[1],{exact:true}).first().waitFor();
  const raceCommands=fixture.emails.map(email=>({...structuredClone(command),submissionId:crypto.randomUUID(),contact:{...command.contact,email},passengers:command.passengers.map(p=>({...p,seatCode:"1B"}))}));
  const race=await Promise.all([apiCall(passenger,"POST","/reservations",raceCommands[0],"passenger",[201,409]),apiCall(second,"POST","/reservations",raceCommands[1],"passenger",[201,409])]);
  assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);
  const occupancy=await apiCall(second,"GET","/offerings/"+id+"/seats",undefined,"passenger");assert.equal(occupancy.body.data.occupiedSeats.filter(seat=>seat==="1B").length,1);
  check("two real browser principals race for one seat: exactly one 201 and one 409");
  await navigate(second,origin+"/ar/book?offering="+id);
  await second.getByLabel("\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0623\u0648\u0644",{exact:true}).fill("Synthetic");
  await second.getByLabel("\u0627\u0633\u0645 \u0627\u0644\u0639\u0627\u0626\u0644\u0629",{exact:true}).fill("Mobile");
  await second.getByLabel("\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0645\u064a\u0644\u0627\u062f",{exact:true}).fill("1990-01-01");
  await second.getByLabel("\u0627\u0644\u062c\u0646\u0633\u064a\u0629",{exact:true}).fill("Palestinian");
  await second.getByLabel("\u0648\u062b\u064a\u0642\u0629 \u0627\u0644\u0633\u0641\u0631",{exact:true}).fill("SYNTHETIC-MOBILE");
  await second.getByLabel("\u0627\u0644\u0648\u062c\u0628\u0629",{exact:true}).selectOption("synthetic-meal");
  await second.getByRole("button",{name:/1C/}).click();
  await second.getByRole("button",{name:"\u062a\u0623\u0643\u064a\u062f \u0627\u0644\u062d\u062c\u0632 \u0627\u0644\u0645\u062c\u0627\u0646\u064a",exact:true}).click();
  await second.getByRole("heading",{name:"\u062a\u0645 \u062a\u0623\u0643\u064a\u062f \u0627\u0644\u062d\u062c\u0632",exact:true}).waitFor();
  assert.equal(await second.locator("html").getAttribute("dir"),"rtl");
  await second.screenshot({path:path.join(output,"ticket-ar-mobile.png"),fullPage:true});check("Arabic mobile seat/meal booking and ticket against shared PostgreSQL authority");
  const arPdf=await second.pdf({path:path.join(output,"ticket-ar.pdf"),format:"A4",printBackground:true});assert.ok(arPdf.subarray(0,5).toString()==="%PDF-" && arPdf.length>2000);check("Arabic ticket renders to a real browser PDF");
  await drain();assert.ok(!checks.some(c=>c.startsWith("CONTRACT FAILURE")),checks.filter(c=>c.startsWith("CONTRACT FAILURE")).join("; "));
 } catch(e){try{exec("fixture-diagnostic",["php","tests/Fixtures/MvpMail/browser-diagnose.php"],JSON.stringify(fixture));}catch{}if(active){if(slice==="identity")await active.locator('input[name="token"],input[type="password"]').evaluateAll(inputs=>inputs.forEach(input=>{input.value="";})).catch(()=>{});fs.writeFileSync(path.join(output,"failed-page.txt"),await active.locator("body").innerText().catch(()=>"unavailable"));await active.screenshot({path:path.join(output,"failed-page.png"),fullPage:true}).catch(()=>{});}throw e;}
 finally {fs.writeFileSync(path.join(output,"browser-checks.json"),JSON.stringify({checks,captures},null,2));await browser.close();}
}
