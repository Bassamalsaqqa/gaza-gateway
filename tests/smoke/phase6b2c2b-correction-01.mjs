import { admin2En, admin2Ar } from "../../src/lib/i18n-admin2.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import { cutoverContext, cutoverDate, cutoverFlight, mountedCommand } from "./phase6b2c2b-cutover.mjs";
import { availableSeat } from "./phase6a-commercial.mjs";

export async function runCutoverCorrection01Checks({checkStep,browser,baseUrl}) {
  for(const [index,lang] of ["en","ar"].entries()) {
    await checkStep(`Check ${129+index}: C2B Correction 01 ${lang} shared service ID preserves each PNR snapshot on Manage, confirmation, boarding pass and Admin detail`,async()=>{
      const {context,prefix,dict,current}=await cutoverContext(browser,lang,true);
      const writer=await context.newPage(),page=await context.newPage();
      try {
        await writer.goto(baseUrl+prefix+"/admin/schedules");
        const a={...current,ref:"GZA-OWNA",outbound:{...cutoverFlight,number:"PS100",departTime:"08:10",arriveTime:"09:10",aircraftId:"a320neo",aircraft:"Airbus A320neo"}};
        const b={...current,ref:"GZA-OWNB",outbound:{...cutoverFlight,number:"PS998",departTime:"12:10",arriveTime:"13:10",aircraftId:"a321neo",aircraft:"Airbus A321neo"}};
        await writer.evaluate(({a,b})=>{
          localStorage.setItem("gza.repo.v1",JSON.stringify({schemaVersion:1,bookings:[b,a],flightOverrides:{[a.outbound.id]:{status:"Scheduled",gate:"B12"}}}));
          localStorage.setItem("gza.schedule.v1",JSON.stringify({schemaVersion:1,revision:9,schedules:[]}));
        },{a,b});
        const before=await writer.evaluate(()=>localStorage.getItem("gza.repo.v1"));
        for(const booking of [a,b]) for(const route of ["/manage/","/booking-confirmation/","/boarding-pass/","/admin/bookings/"]) {
          await page.goto(baseUrl+prefix+route+booking.ref+(route==="/boarding-pass/"?"/out/0":""));
          await page.locator("main").getByText(booking.ref,{exact:false}).first().waitFor();
          if(route!=="/admin/bookings/") {
            await page.locator("main").getByText("B12",{exact:true}).first().waitFor();
            const fact = route === "/boarding-pass/" ? "departTime" : "arriveTime";
            await page.locator("main").getByText(booking.outbound[fact],{exact:true}).first().waitFor();
            assert.equal(await page.locator("main").getByText((booking===a?b:a).outbound[fact],{exact:true}).count(),0);
            const scoped = await mountedCommand(page,{kind:"bookingFlight",ref:booking.ref,leg:"out"});
            assert.deepEqual(scoped,{...booking.outbound,gate:"B12",status:"Scheduled"});
          } else await page.locator("main").getByText(new RegExp(booking.outbound.number)).first().waitFor();
        }
        assert.equal(await writer.evaluate(()=>localStorage.getItem("gza.repo.v1")),before);
        // Cancelled history survives, but the last confirmed PNR no longer keeps a board row.
        await writer.evaluate(()=>{const state=JSON.parse(localStorage.getItem("gza.repo.v1"));for(const b of state.bookings)b.status="cancelled";localStorage.setItem("gza.repo.v1",JSON.stringify(state));});
        await page.goto(baseUrl+prefix+"/flights");await page.getByRole("button",{name:dict["flights.tomorrow"],exact:true}).click();
        await page.getByText(dict["flights.none"],{exact:true}).first().waitFor();
        await page.waitForFunction(id=>!document.querySelector(`a[href$="/flight/${id}"]`),cutoverFlight.id);
        await page.goto(baseUrl+prefix+"/manage/"+a.ref);await page.locator("main").getByText("09:10",{exact:true}).first().waitFor();
        assert.equal(await page.locator("main").getByText("13:10",{exact:true}).count(),0);
      }finally{await context.close();}
    });
    await checkStep(`Check ${131+index}: C2B Correction 01 ${lang} fresh Check-in Desk survives corrupt Schedule and Network with warning and canonical successful check-in`,async()=>{
      for(const key of ["gza.schedule.v1","gza.network.v1"]) {
        const {context,prefix,dict,current}=await cutoverContext(browser,lang,true);
        const writer=await context.newPage(),desk=await context.newPage();
        try {
          await writer.goto(baseUrl+prefix+"/admin/schedules");
          const flight={...cutoverFlight,departTime:"08:10",arriveTime:"09:10"};
          const booking={...current,checkedIn:{out:[],in:[]},outbound:flight,seats:{"out-0":availableSeat(flight)}};
          await writer.evaluate(({key,booking})=>{
            localStorage.setItem("gza.repo.v1",JSON.stringify({schemaVersion:1,bookings:[booking],flightOverrides:{[booking.outbound.id]:{status:"Scheduled",gate:"B12"}}}));
            localStorage.setItem(key,"{corrupt");
          },{key,booking});
          await desk.goto(baseUrl+prefix+`/admin/check-in?date=${cutoverDate}&ref=${booking.ref}&flightId=${flight.id}`);
          await desk.getByRole("alert").filter({hasText:dict["services.planningWarning"]}).waitFor();
          const row=desk.locator("tbody tr").filter({hasText:booking.ref});await row.waitFor();
          const action=row.getByRole("button",{name:(lang === "ar" ? admin2Ar : admin2En)["a2.ci.checkIn"],exact:true});assert.equal(await action.isEnabled(),true);
          const directory="scratch/phase6b2c2b-correction01";fs.mkdirSync(directory,{recursive:true});
          for(const width of [390,768,1440]) {
            await desk.setViewportSize({width,height:900});
            assert.ok(await desk.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
            await desk.screenshot({path:`${directory}/desk-${lang}-${key.includes("schedule")?"schedule":"network"}-${width}.png`,fullPage:true});
          }
          await action.click();
          await row.getByRole("button",{name:(lang === "ar" ? admin2Ar : admin2En)["a2.ci.undo"],exact:true}).waitFor();
          const stored=await desk.evaluate(ref=>JSON.parse(localStorage.getItem("gza.repo.v1")).bookings.find(b=>b.ref===ref),booking.ref);
          assert.deepEqual(stored.checkedIn.out,[0]);assert.ok(stored.seatLayouts);
          await desk.goto(baseUrl+prefix+`/boarding-pass/${booking.ref}/out/0`);
          await desk.locator("main").getByText("B12",{exact:true}).first().waitFor();
          assert.equal(await desk.evaluate(key=>localStorage.getItem(key),key),"{corrupt");
          await desk.goto(baseUrl+prefix+"/book?step=search");
          await desk.getByRole("alert").filter({hasText:key.includes("network")?dict["network.unavailable"]:dict["services.error.unavailable"]}).first().waitFor();
        }finally{await context.close();}
      }
    });
  }
}
