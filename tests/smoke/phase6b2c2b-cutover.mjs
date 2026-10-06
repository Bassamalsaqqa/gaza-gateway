import assert from "node:assert/strict";
import { addDaysISO, todayISO } from "../../src/lib/data.ts";
import { seedSchedules } from "../../src/lib/schedules/seed.ts";
import { datedServiceId } from "../../src/lib/dated-services/identity.ts";
import { seedNetworkEnvelope } from "../../src/lib/network/seed.ts";
import { seedFleetEnvelope } from "../../src/lib/fleet/seed.ts";
import { seedCommercialCatalog } from "../../src/lib/commercial/seed.ts";
import { currentDeparturesOn } from "../helpers/current-service-fixture.ts";
import { legacyDeparturesOn } from "../../src/lib/dated-services/legacy.ts";
import { adminEn, adminAr } from "../../src/lib/i18n-admin.ts";
import { en, ar } from "../../src/lib/i18n-public.ts";
import { servicesEn, servicesAr } from "../../src/lib/i18n-services.ts";
import { networkEn, networkAr } from "../../src/lib/i18n-network.ts";
import { commercialFixture, availableSeat } from "./phase6a-commercial.mjs";
import { interactive } from "./phase6b2b-correction-01.mjs";

const proofClock = todayISO() + "T09:00:00Z";
export const cutoverDate = addDaysISO(todayISO(), 1);
export const cutoverFlight = currentDeparturesOn(cutoverDate, proofClock).find(f => f.destinationCode === "AMM");
export async function cutoverContext(browser, lang = "en", existing = false) {
  const context = await browser.newContext({ viewport: { width:1440, height:900 } });
  const template = commercialFixture();
  const booking = f => ({ ...template, outbound:f, inbound:null, criteria:{...template.criteria,tripType:"oneway",destination:"AMM",departDate:cutoverDate,returnDate:""}, seats:{"out-0":availableSeat(f)}, checkedIn:{out:[0]}, ref:f.id.startsWith("svc1-")?"GZA-C2SVC":"GZA-C2OLD" });
  const old = booking(legacyDeparturesOn(cutoverDate, proofClock)[0]);
  const current = booking(cutoverFlight);
  // Explicit historical fixtures need no product command and retain exact stored Flight identities.
  await context.addInitScript(({schedules,network,fleet,catalog,bookings,proofClock}) => {
    const NativeDate = Date, clock = new NativeDate(proofClock).getTime();
    window.Date = class extends NativeDate { constructor(...args){super(...(args.length ? args : [clock]));} static now(){return clock;} };
    for (const [key,value] of Object.entries({
      "gza.admin.v1": {staffId:"adm-1",overrides:{}},
      "gza.repo.v1": {schemaVersion:1,bookings,flightOverrides:{}},
      "gza.schedule.v1": {schemaVersion:1,revision:0,schedules},
      "gza.network.v1":network,"gza.fleet.v1":fleet,
      "gza.commercial.v1":{schemaVersion:1,revision:0,catalog},
    })) if(localStorage.getItem(key)===null) localStorage.setItem(key,JSON.stringify(value));
  }, { schedules:seedSchedules().filter(s=>s.destination==="AMM"), network:seedNetworkEnvelope(), fleet:seedFleetEnvelope(), catalog:seedCommercialCatalog(), bookings:existing?[old,current]:[], proofClock });
  return {context,prefix:lang==="ar"?"/ar":"",dict:{...(lang==="ar"?ar:en),...(lang==="ar"?adminAr:adminEn),...(lang==="ar"?servicesAr:servicesEn),...(lang==="ar"?networkAr:networkEn)},old,current};
}
/** Executes commands against the actually mounted shared provider, never a disconnected repository. */
export async function mountedCommand(page, command) {
  await page.waitForFunction(() => {
    const node=document.querySelector("main"); let fiber=node?.[Object.keys(node).find(k=>k.startsWith("__reactFiber$"))];
    for(;fiber;fiber=fiber.return) if(fiber.memoizedProps?.value?.flight?.getCurrentFlightById)return true;
    return false;
  });
  return page.evaluate(async command => {
    const node=document.querySelector("main"); let fiber=node?.[Object.keys(node).find(k=>k.startsWith("__reactFiber$"))],r;
    for(;fiber;fiber=fiber.return) if(fiber.memoizedProps?.value?.flight?.getCurrentFlightById){r=fiber.memoizedProps.value;break;}
    if(!r)throw new Error("Shared repository provider missing");
    if(command.kind==="search")return r.flight.searchFlights(command.origin??"GZA",command.destination??"AMM",command.date);
    if(command.kind==="detail")return r.flight.getFlightById(command.id);
    if(command.kind==="bookingFlight")return r.flight.getBookingFlight(command.ref,command.leg);
    if(command.kind==="current")return r.flight.getCurrentFlightById(command.id);
    if(command.kind==="draft")return r.bookingDraft.updateDraft(prev=>({...prev,fareId:"essential",seats:command.clearSeats?{}:prev.seats,passengers:[{type:"adult",firstName:"Service",lastName:"Passenger",dob:"1980-01-01",nationality:"PS",document:"P123456"}],contact:{email:"service@example.com",phone:"+970599000000"},extras:{pax:[{extraBags:0,meal:"standard",assistance:[]}]}}));
    if(command.kind==="draftState")return r.bookingDraft.getDraft();
    if(command.kind==="results")return r.bookingDraft.updateDraft(prev=>({...prev,criteria:{...prev.criteria,origin:"GZA",destination:"AMM",departDate:command.date,tripType:"oneway",returnDate:""},outbound:null,inbound:null,entry:"results"}));
    throw new Error("Unknown proof command");
  },command);
}
async function edit(page,url,prefix,dict) {
  await page.goto(url+prefix+"/admin/schedules?destination=AMM");
  const row=page.locator("main tbody tr").filter({hasText:"PS100"}).first();
  await row.getByRole("button",{name:dict["adm.common.edit"],exact:true}).click(); await interactive(page,"#sc-dep");
}
async function save(page,dict) { await page.getByRole("dialog").getByRole("button",{name:dict["adm.edit.save"],exact:true}).click(); await page.getByRole("dialog").waitFor({state:"hidden"}); }
const bytes = page => page.evaluate(()=>localStorage.getItem("gza.schedule.v1"));

export async function runDatedServiceCutoverChecks({checkStep,browser,baseUrl}) {
  for(const [i,lang] of ["en","ar"].entries()) {
    await checkStep(`Check ${121+i}: C2B ${lang} mounted Schedule/search/booking/override convergence and PNR durability after retirement`,async()=>{
      const {context,prefix,dict}=await cutoverContext(browser,lang);
      const admin=await context.newPage(),passenger=await context.newPage();
      try {
        await passenger.goto(baseUrl+prefix+`/flight/${cutoverFlight.id}`);
        await passenger.getByRole("button",{name:dict["fd.bookThis"],exact:true}).click();
        await passenger.waitForURL("**/book"); await passenger.locator(`#flight-option-${cutoverFlight.id}`).waitFor();
        await edit(admin,baseUrl,prefix,dict); await admin.fill("#sc-dep","09:45"); await admin.fill("#sc-arr","10:40"); await save(admin,dict);
        await passenger.waitForFunction(id=>JSON.parse(localStorage.getItem("gza.booking.draft.v1")).draft.outbound?.id===id&&JSON.parse(localStorage.getItem("gza.booking.draft.v1")).draft.outbound?.departTime==="09:45",cutoverFlight.id);
        assert.equal((await mountedCommand(passenger,{kind:"search",date:cutoverDate}))[0].id,cutoverFlight.id);
        await admin.goto(baseUrl+prefix+"/admin/destinations/AMM"); await interactive(admin,"#de-blockMinutes"); await admin.fill("#de-blockMinutes","65");
        await admin.getByRole("button",{name:dict["adm.edit.save"],exact:true}).click();
        await passenger.waitForFunction(()=>JSON.parse(localStorage.getItem("gza.booking.draft.v1")).draft.outbound?.durationMinutes===65);
        assert.equal((await mountedCommand(passenger,{kind:"search",date:cutoverDate}))[0].id,cutoverFlight.id);
        await mountedCommand(passenger,{kind:"draft"}); await passenger.goto(baseUrl+prefix+"/book?step=review");
        await passenger.getByRole("button",{name:new RegExp(dict["book.confirm"])}).click();
        await passenger.waitForURL("**/booking-confirmation/*");
        const ref=new URL(passenger.url()).pathname.split("/").at(-1);
        const stored=await passenger.evaluate(ref=>JSON.parse(localStorage.getItem("gza.repo.v1")).bookings.find(b=>b.ref===ref),ref);
        assert.equal(stored.outbound.id,cutoverFlight.id); assert.equal(stored.outbound.departTime,"09:45"); assert.ok(stored.seatLayouts); assert.ok(stored.pricingSnapshot);
        await admin.goto(baseUrl+prefix+"/admin/bookings"); await admin.getByText(ref,{exact:true}).first().waitFor();
        await admin.goto(baseUrl+prefix+`/admin/check-in?date=${cutoverDate}&flightId=${cutoverFlight.id}`); await admin.getByText(ref,{exact:true}).first().waitFor();
        await passenger.goto(baseUrl+prefix+`/flight/${cutoverFlight.id}`);
        await admin.goto(baseUrl+prefix+`/admin/flights/${cutoverFlight.id}`);
        await admin.getByRole("button",{name:dict["adm.flight.quickEdit"],exact:true}).click(); await interactive(admin,"#fq-gate");
        await admin.fill("#fq-gate","B12"); await admin.selectOption("#fq-status","Delayed"); await save(admin,dict);
        await passenger.getByText("B12",{exact:true}).first().waitFor();
        await passenger.goto(baseUrl+prefix+`/manage/${ref}`); await passenger.getByText("B12",{exact:true}).first().waitFor();
        await edit(admin,baseUrl,prefix,dict); await admin.locator("#sc-active").click(); await save(admin,dict);
        await passenger.goto(baseUrl+prefix+`/flight/${cutoverFlight.id}`);
        await passenger.getByText(dict["services.compatibility"],{exact:true}).waitFor();
        assert.equal(await passenger.getByRole("button",{name:dict["fd.bookThis"],exact:true}).count(),0);
        assert.deepEqual(await mountedCommand(passenger,{kind:"search",date:cutoverDate}),[]);
        await passenger.goto(baseUrl+prefix+`/manage/${ref}/seats`); await passenger.getByRole("grid").waitFor();
        assert.equal((await mountedCommand(passenger,{kind:"detail",id:cutoverFlight.id})).status,"Delayed");
        await admin.goto(baseUrl+prefix+"/admin/destinations/AMM"); await interactive(admin,"#de-blockMinutes");
        await admin.locator("#de-active").click(); await admin.getByRole("button",{name:dict["adm.edit.save"],exact:true}).click();
        await passenger.goto(baseUrl+prefix+"/destinations/AMM"); await passenger.locator("main h1").waitFor();
        await passenger.getByRole("alert").filter({hasText:dict["services.routeInactive"]}).first().waitFor();
        assert.equal(await passenger.locator('form[data-flight-search-console] button[type="submit"]').isDisabled(),true);
      } finally {await context.close();}
    });
    await checkStep(`Check ${123+i}: C2B ${lang} structured cancellation retains identity on board and existing PNR; empty authority never resurrects legacy sales`,async()=>{
      const {context,prefix,dict,old,current}=await cutoverContext(browser,lang,true);
      const admin=await context.newPage(),board=await context.newPage();
      try {
        await board.goto(baseUrl+prefix+"/flights"); await board.getByRole("button",{name:dict["flights.tomorrow"],exact:true}).click(); await board.locator("main tbody tr").first().waitFor();
        await edit(admin,baseUrl,prefix,dict); await admin.getByRole("button",{name:dict["adm.sch.addException"],exact:true}).click();
        await admin.locator('select[id^="exc-kind-"]').last().selectOption("cancelled"); await admin.locator('input[id^="exc-date-"]').last().fill(cutoverDate);
        await admin.locator('button[id^="exc-effect-toggle-"]').last().click(); await save(admin,dict);
        const cancelled=await mountedCommand(board,{kind:"detail",id:cutoverFlight.id}); assert.equal(cancelled.id,cutoverFlight.id); assert.equal(cancelled.status,"Cancelled");
        await board.locator("main").getByText(dict["status.Cancelled"]??(lang==="ar"?"ملغاة":"Cancelled"),{exact:true}).filter({visible:true}).first().waitFor();
        await board.goto(baseUrl+prefix+`/manage/${current.ref}`); await board.locator("main").getByText(dict["status.Cancelled"]??(lang==="ar"?"ملغاة":"Cancelled"),{exact:true}).first().waitFor();
        await mountedCommand(board,{kind:"results",date:cutoverDate});
        await board.goto(baseUrl+prefix+"/book?step=results");
        const cancelledOption = board.locator(`#flight-option-${cutoverFlight.id}`);
        await cancelledOption.waitFor();
        assert.equal(await cancelledOption.isDisabled(), true);
        await admin.evaluate(()=>localStorage.setItem("gza.schedule.v1",JSON.stringify({schemaVersion:1,revision:99,schedules:[]})));
        assert.deepEqual(await mountedCommand(board,{kind:"search",date:cutoverDate}),[]);
        await board.goto(baseUrl+prefix); await board.getByText(dict["services.empty"],{exact:true}).waitFor();
        for(const b of [old,current]) { await board.goto(baseUrl+prefix+`/manage/${b.ref}/seats`); await board.getByRole("grid").waitFor(); assert.equal((await mountedCommand(board,{kind:"detail",id:b.outbound.id})).id,b.outbound.id); }
        assert.equal(JSON.parse(await bytes(admin)).schedules.length,0);
        await admin.evaluate(seed=>localStorage.setItem("gza.schedule.v1",JSON.stringify({schemaVersion:1,revision:100,schedules:seed})),seedSchedules().filter(s=>s.destination==="AMM"));
      } finally {await context.close();}
    });
    await checkStep(`Check ${125+i}: C2B ${lang} corrupt current authority isolates existing PNR, boarding pass, Fleet, Commercial and Content`,async()=>{
      const {context,prefix,dict,old,current}=await cutoverContext(browser,lang,true);
      const writer=await context.newPage(),page=await context.newPage(); const errors=[];page.on("pageerror",error=>errors.push(error.message));
      try {
        await writer.goto(baseUrl+prefix+"/admin/schedules");
        for(const key of ["gza.schedule.v1","gza.network.v1"]) {
          const previous=await writer.evaluate(key=>localStorage.getItem(key),key);
          await writer.evaluate(key=>localStorage.setItem(key,"{corrupt"),key);
          await page.goto(baseUrl+prefix); await page.getByRole("alert").filter({hasText:dict["services.error.unavailable"]}).first().waitFor();
          await page.goto(baseUrl+prefix+"/admin/bookings/new"); await page.getByRole("alert").filter({hasText:key==="gza.network.v1"?dict["network.unavailable"]:dict["services.error.unavailable"]}).first().waitFor();
          for(const b of [old,current]) { await page.goto(baseUrl+prefix+`/manage/${b.ref}/seats`); await page.getByRole("grid").waitFor(); await page.goto(baseUrl+prefix+`/boarding-pass/${b.ref}/out/0`); await page.getByText(b.ref,{exact:true}).first().waitFor(); }
          await page.goto(baseUrl+prefix+"/admin/products?tab=aircraft"); await page.locator('[data-testid="fleet-aircraft"]').waitFor();
          await page.getByRole("tab",{name:dict["adm.prod.tab.fares"],exact:true}).click(); await page.getByRole("button",{name:dict["adm.common.edit"],exact:true}).first().waitFor();
          await page.goto(baseUrl+prefix+"/admin/website"); await page.locator("main h1").waitFor();
          await page.getByRole("button",{name:dict["adm.search.title"],exact:true}).click();
          await page.getByRole("dialog").getByRole("combobox").fill(current.ref);
          await page.getByRole("dialog").getByText(current.ref,{exact:false}).first().waitFor();
          assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),"{corrupt");
          await writer.evaluate(({key,previous})=>localStorage.setItem(key,previous),{key,previous});
        }
        assert.deepEqual(errors,[]);
      }finally{await context.close();}
    });
  }
  await checkStep("Check 127: C2B maximum Unicode service identity remains routable and fits EN/AR mobile, tablet and desktop detail", async () => {
    const scheduleId = "\u0645".repeat(160);
    const id = datedServiceId(scheduleId, cutoverDate);
    for (const lang of ["en", "ar"]) {
      const { context, prefix, dict } = await cutoverContext(browser, lang);
      const page = await context.newPage();
      try {
        await page.goto(baseUrl + prefix + "/admin/schedules");
        await page.evaluate(scheduleId => {
          const value = JSON.parse(localStorage.getItem("gza.schedule.v1"));
          value.schedules.find(s => s.direction === "out").id = scheduleId;
          value.revision++;
          localStorage.setItem("gza.schedule.v1", JSON.stringify(value));
        }, scheduleId);
        for (const width of [390, 768, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          for (const path of ["/flight/", "/admin/flights/"]) {
            await page.goto(baseUrl + prefix + path + id);
            if (path === "/flight/") {
              await page.getByRole("button", { name: dict["fd.bookThis"], exact: true }).waitFor();
              assert.equal(await page.title(), lang === "ar" ? "تفاصيل الرحلة — الخطوط الجوية الفلسطينية" : "Flight details — Palestinian Airlines");
            }
            else await page.getByText(id, { exact: true }).waitFor();
            assert.equal((await mountedCommand(page, { kind: "current", id })).id, id);
            const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
            assert.ok(geometry.scroll <= width + 1, `${lang} ${width} ${path} service identity overflow`);
            if (path === "/admin/flights/") assert.equal(await page.getByText(id, { exact: true }).evaluate(node => getComputedStyle(node).direction), "ltr");
          }
        }
      } finally { await context.close(); }
    }
  });
  await checkStep("Check 128: C2B EN/AR non-capacity Studio legacy seat and booking simulation stays isolated from corrupt persistent authorities", async () => {
    const persistent = {"gza.repo.v1":JSON.stringify({schemaVersion:1,bookings:[],flightOverrides:{}}),"gza.schedule.v1":"{untouched","gza.network.v1":"{untouched","gza.fleet.v1":"{untouched","gza.commercial.v1":"{untouched","gza.booking.draft.v1":"{untouched"};
    for (const lang of ["en","ar"]) {
      const context = await browser.newContext();
      await context.addInitScript(persistent => {for(const [key,value] of Object.entries(persistent)) if(localStorage.getItem(key)===null)localStorage.setItem(key,value);}, persistent);
      const page = await context.newPage(), prefix = lang === "ar" ? "/ar" : "", dict = lang === "ar" ? ar : en;
      try {
        await page.goto(baseUrl+prefix+"/book?studioPreview=1&step=seats");
        await page.getByRole("grid").waitFor();
        assert.ok((await mountedCommand(page,{kind:"draftState"})).outbound.id.startsWith("PS"));
        await page.goto(baseUrl+prefix+"/book?studioPreview=1&step=review");
        await page.getByRole("button",{name:new RegExp(dict["book.confirm"])}).waitFor();
        await mountedCommand(page,{kind:"draft",clearSeats:true});
        await page.getByRole("button",{name:new RegExp(dict["book.confirm"])}).click();
        await page.waitForURL("**/booking-confirmation/*?*");
        const ref = new URL(page.url()).pathname.split("/").at(-1);
        await page.getByText(ref,{exact:true}).first().waitFor();
        assert.deepEqual(await page.evaluate(keys => Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),Object.keys(persistent)),persistent);
      } finally { await context.close(); }
    }
  });
}
