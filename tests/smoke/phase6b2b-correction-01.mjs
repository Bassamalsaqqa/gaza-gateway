import assert from "node:assert/strict";
import { fleetContext } from "./phase6b2b-fleet.mjs";
import { isSeatAvailable } from "../../src/lib/data.ts";

export async function interactive(page, selector) {
  await page.waitForFunction(selector => {
    const node=document.querySelector(selector);
    return node && Object.keys(node).some(k=>k.startsWith("__reactProps") && typeof node[k]?.onChange === "function");
  }, selector);
}
export async function openQuickEdit(page,baseUrl,prefix,b) {
  await page.goto(baseUrl+prefix+"/admin/flights?date="+b.outbound.date);
  await page.getByRole("button",{name:/^Quick edit$|^تعديل سريع$/}).filter({visible:true}).first().click();
  await page.locator("#fq-gate").waitFor();
  await interactive(page,"#fq-gate");
}
export async function counterSeats(page,baseUrl,prefix,b) {
  await page.goto(baseUrl+prefix+"/admin/bookings/new");
  await interactive(page,"#nb-date");
  await page.fill("#nb-date",b.outbound.date);
  await page.selectOption("#nb-dest",b.outbound.destinationCode);
  await page.locator('input[name="nb-flight-choice"]:not(:disabled)').first().check();
  await page.getByRole("button",{name:/Next: Fare Selection|التالي: اختيار الأجرة/}).click();
  await page.locator('input[name="nb-fare-choice"]').first().check();
  await page.getByRole("button",{name:/Next: Passenger Details|التالي: بيانات المسافرين/}).click();
  for(const [id,value] of Object.entries({"pax-0-fn":"Fleet","pax-0-ln":"Audit","pax-0-dob":"1980-01-01","pax-0-doc":"AUDIT123","nb-contact-email":"fleet@example.ps","nb-contact-phone":"+970599000000"}))await page.fill("#"+id,value);
  await page.getByRole("button",{name:/Next: Seats & Extras|التالي: المقاعد والإضافات/}).click();
  await page.locator("details summary").first().click();
  await page.getByRole("grid").waitFor();
}
export async function runPhase6B2BCorrectionChecks({checkStep,browser,baseUrl}){
  for(const [i,lang] of ["en","ar"].entries()) {
    await checkStep(`Check ${99+i}: Phase 6B2B ${lang} Fleet field focus, localized failure rollback/retry and dirty remote conflict`,async()=>{
      const {context,prefix,dict,pub}=await fleetContext(browser,lang);
      const a=await context.newPage(),b=await context.newPage();
      const errors=[];a.on("pageerror",e=>errors.push(e.message));
      try{
        await a.goto(baseUrl+prefix+"/admin/products?tab=aircraft");
        await a.getByRole("button",{name:dict["adm.prod.ac.new"],exact:true}).click();
        const dialog=a.getByRole("dialog");
        await dialog.getByRole("button",{name:dict["adm.edit.save"],exact:true}).click();
        assert.equal(await a.locator(":focus").getAttribute("id"),"ac-name");
        assert.equal(await a.locator("#ac-name").getAttribute("aria-invalid"),"true");
        await a.fill("#ac-name","Fleet Correction Aircraft");await a.fill("#ac-reg","PS-COD");
        const before=await a.evaluate(()=>localStorage.getItem("gza.fleet.v1"));
        await a.evaluate(()=>{const orig=Storage.prototype.setItem;window.__fleetFail=true;Storage.prototype.setItem=function(k,v){if(window.__fleetFail && k==="gza.fleet.v1")throw new DOMException("quota","QuotaExceededError");return orig.call(this,k,v);};});
        await dialog.getByRole("button",{name:dict["adm.edit.save"],exact:true}).click();
        await dialog.getByRole("alert").waitFor();
        assert.equal(await a.evaluate(()=>localStorage.getItem("gza.fleet.v1")),before);
        assert.equal(await dialog.locator('[aria-invalid="true"]').count(),0);
        assert.equal(await a.locator("#ac-name").inputValue(),"Fleet Correction Aircraft");
        await a.evaluate(()=>window.__fleetFail=false);
        await dialog.getByRole("button",{name:dict["adm.edit.save"],exact:true}).click();await dialog.waitFor({state:"hidden"});
        await a.goto(baseUrl+prefix+"/admin/products?tab=seatmaps");await b.goto(baseUrl+prefix+"/admin/products?tab=seatmaps");
        await interactive(a,"#sm-rows");await interactive(b,"#sm-rows");
        await a.fill("#sm-legroom","99, 99");await a.getByRole("button",{name:dict["adm.edit.save"],exact:true}).click();
        assert.equal(await a.locator(":focus").getAttribute("id"),"sm-legroom");
        assert.equal(await a.locator("#sm-legroom").getAttribute("aria-invalid"),"true");
        const described=await a.locator("#sm-legroom").getAttribute("aria-describedby");assert.ok(await a.locator("#"+described).isVisible());
        await a.fill("#sm-legroom","26");await a.getByRole("button",{name:dict["adm.edit.save"],exact:true}).click();
        await b.waitForFunction(()=>document.querySelector("#sm-legroom")?.value==="26");
        await b.fill("#sm-legroom","25");await a.fill("#sm-legroom","24");await a.getByRole("button",{name:dict["adm.edit.save"],exact:true}).click();
        await b.getByRole("alert").filter({hasText:pub["fleet.remoteConflict"]}).waitFor();
        assert.equal(await b.locator("#sm-legroom").inputValue(),"25");
        assert.equal(await b.getByRole("button",{name:dict["adm.edit.save"],exact:true}).isDisabled(),true);
        await b.getByRole("button",{name:pub["fleet.reloadLayout"],exact:true}).click();
        await b.waitForFunction(()=>document.querySelector("#sm-legroom")?.value==="24");
        assert.deepEqual(errors,[]);
      }finally{await context.close();}
    });
    await checkStep(`Check ${101+i}: Phase 6B2B ${lang} corrupt Fleet isolates existing PNR/board/check-in and operational gate saves; new authority fails closed`,async()=>{
      const {context,prefix,b,dict,pub}=await fleetContext(browser,lang);
      const page=await context.newPage();const errors=[];page.on("pageerror",e=>errors.push(page.url()+": "+e.message));
      try{
        await page.goto(baseUrl+prefix+"/admin/products");
        await page.evaluate(()=>localStorage.setItem("gza.fleet.v1","{fleet-corrupt"));
        await page.reload();await page.getByRole("alert").waitFor();
        // The fixture advances time into check-in. Enter the prerendered board by client
        // navigation so its build-date SSR text is not hydrated under a future clock.
        await page.goto(baseUrl+prefix+`/manage/${b.ref}`);
        await page.locator(`a[href="${prefix}/flights"]`).first().click();
        await page.waitForURL("**/flights");await page.locator("main tbody tr").first().waitFor();
        await page.goto(baseUrl+prefix+`/manage/${b.ref}`);await page.getByText(b.ref,{exact:false}).first().waitFor();
        await page.goto(baseUrl+prefix+`/manage/${b.ref}/seats`);await page.getByRole("grid").waitFor();
        await page.goto(baseUrl+prefix+`/manage/${b.ref}/check-in`);
        await page.getByRole("button").filter({hasText:b.outbound.number}).first().click();
        await page.getByRole("button",{name:pub["ci.next"],exact:true}).click();
        await page.getByRole("button",{name:pub["ci.next"],exact:true}).click();
        await page.getByRole("grid").waitFor();
        await openQuickEdit(page,baseUrl,prefix,b);
        assert.equal(await page.locator("#fq-aircraft").isDisabled(),true);
        await page.fill("#fq-gate","B12");await page.getByRole("dialog").getByRole("button",{name:dict["adm.edit.save"],exact:true}).click();await page.getByRole("dialog").waitFor({state:"hidden"});
        await page.goto(baseUrl+prefix+"/book?step=seats");await page.getByRole("alert").filter({hasText:pub["fleet.error.unavailable"]}).waitFor();
        assert.equal(await page.getByRole("grid").count(),0);
        assert.equal(await page.evaluate(()=>localStorage.getItem("gza.fleet.v1")),"{fleet-corrupt");
        assert.deepEqual(errors,[]);
      }finally{await context.close();}
    });
  }
  await checkStep("Check 103: Phase 6B2B actual aircraft reassignment propagates across mounted Flight and draft tabs",async()=>{
    const {context,prefix,b,dict}=await fleetContext(browser);
    try{
      const admin=await context.newPage(),board=await context.newPage(),draft=await context.newPage();
      await board.goto(baseUrl+`/flight/${b.outbound.id}`);
      await draft.goto(baseUrl+"/book?step=seats");await draft.getByRole("grid").waitFor();
      // Detail Quick Edit targets the exact selected draft flight, not a different list row.
      await admin.goto(baseUrl+`/admin/flights/${b.outbound.id}`);
      await admin.getByRole("button",{name:dict["adm.flight.quickEdit"],exact:true}).click();
      const next=b.outbound.aircraftId==="a321neo"?"a320neo":"a321neo";
      await admin.selectOption("#fq-aircraft",next);
      await admin.getByRole("dialog").getByRole("button",{name:dict["adm.edit.save"],exact:true}).click();await admin.getByRole("dialog").waitFor({state:"hidden"});
      await board.getByText(next==="a320neo"?"Airbus A320neo":"Airbus A321neo",{exact:false}).first().waitFor();
      await draft.waitForFunction(id=>JSON.parse(localStorage.getItem("gza.booking.draft.v1")).draft.outbound?.aircraftId===id,next);
      await draft.waitForFunction(rows=>document.querySelector('[role="grid"]')?.getAttribute("aria-rowcount")===String(rows),next==="a321neo"?23:18);
    }finally{await context.close();}
  });
  await checkStep("Check 104: Phase 6B2B simultaneous mounted PNR seat saves have one winner, no lost booking",async()=>{
    const {context,b,pub}=await fleetContext(browser);
    try{
      const a=await context.newPage(),c=await context.newPage();await a.goto(baseUrl+`/manage/${b.ref}/seats`);
      const other={...b,ref:"GZA-C602",seats:{},submissionId:"browser-race-B"};
      await a.evaluate(other=>{const s=JSON.parse(localStorage.getItem("gza.repo.v1"));s.bookings[0].seats={};s.bookings.push(other);localStorage.setItem("gza.repo.v1",JSON.stringify(s));},other);
      await a.reload();await c.goto(baseUrl+`/manage/${other.ref}/seats`);await a.getByRole("grid").waitFor();await c.getByRole("grid").waitFor();
      const seat=Array.from({length:10},(_,i)=>`${13+i}A`).find(s=>isSeatAvailable(b.outbound.id,Number(s.slice(0,-1)),"A"));
      for(const page of [a,c])await page.getByRole("grid").getByRole("button").filter({hasText:"A"}).filter({visible:true}).evaluateAll((nodes,seat)=>{const node=nodes.find(n=>n.getAttribute("aria-label")?.includes(seat));if(!node)throw new Error("Seat not rendered");node.click();},seat);
      await Promise.all([a.getByRole("button",{name:pub["common.save"],exact:true}).click(),c.getByRole("button",{name:pub["common.save"],exact:true}).click()]);
      await a.waitForFunction(seat=>{const s=JSON.parse(localStorage.getItem("gza.repo.v1"));return s.bookings.filter(b=>b.seats["out-0"]===seat).length===1;},seat);
      const stored=await a.evaluate(()=>JSON.parse(localStorage.getItem("gza.repo.v1")));
      assert.equal(stored.bookings.length,2);assert.equal(stored.bookings.filter(b=>b.seats["out-0"]===seat).length,1);
      const loser=stored.bookings.find(b=>b.seats["out-0"]!==seat);const loserPage=loser.ref===b.ref?a:c;
      await loserPage.getByRole("alert").waitFor();
    }finally{await context.close();}
  });
}
