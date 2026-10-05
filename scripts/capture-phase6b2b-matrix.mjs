import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { fleetContext } from "../tests/smoke/phase6b2b-fleet.mjs";
import { counterSeats, interactive } from "../tests/smoke/phase6b2b-correction-01.mjs";
import { admin2En, admin2Ar } from "../src/lib/i18n-admin2.ts";

const output=path.resolve("scratch/phase6b2b-correction-screenshots");fs.mkdirSync(output,{recursive:true});
const surfaces=["products-aircraft","products-seatmaps","schedule-editor","flight-quickedit","flights-list","flight-detail","booking-seats","manage-seats","passenger-checkin","admin-checkin","booking-detail-seats","counter-seats"];
const server=await preview({preview:{port:4180,strictPort:false}});
const baseUrl="http://localhost:"+server.httpServer.address().port;
const browser=await chromium.launch({channel:process.platform==="win32"?"msedge":undefined,headless:true});
const rows=[];
try {
  for(const lang of ["en","ar"]) for(const width of [390,768,1440]) for(const surface of surfaces){
    const {context,prefix,b,dict,pub}=await fleetContext(browser,lang);
    context.setDefaultTimeout(12000);
    const admin2=lang==="ar"?admin2Ar:admin2En;
    const page=await context.newPage();await page.setViewportSize({width,height:width===390?844:width===768?1024:900});
    try{
      switch(surface){
      case "products-aircraft":await page.goto(baseUrl+prefix+"/admin/products?tab=aircraft");await page.locator('[data-testid="fleet-aircraft"]').waitFor();break;
      case "products-seatmaps":await page.goto(baseUrl+prefix+"/admin/products?tab=seatmaps");await interactive(page,"#sm-ac");await page.selectOption("#sm-ac","a321neo");await page.waitForFunction(()=>document.querySelector("#sm-rows")?.value==="33");await page.getByRole("grid").waitFor();break;
      case "schedule-editor":await page.goto(baseUrl+prefix+"/admin/schedules");await page.getByRole("button",{name:dict["adm.sch.new"],exact:true}).click();await page.locator("#sc-ac").waitFor();break;
      case "flights-list":await page.goto(baseUrl+prefix+"/admin/flights?date="+b.outbound.date);await page.getByRole("button",{name:dict["adm.flight.quickEdit"],exact:true}).filter({visible:true}).first().waitFor();break;
      case "flight-detail":await page.goto(baseUrl+prefix+`/admin/flights/${b.outbound.id}`);await page.getByRole("button",{name:dict["adm.flight.quickEdit"],exact:true}).waitFor();break;
      case "flight-quickedit":await page.goto(baseUrl+prefix+`/admin/flights/${b.outbound.id}`);await page.getByRole("button",{name:dict["adm.flight.quickEdit"],exact:true}).click();await interactive(page,"#fq-aircraft");break;
      case "booking-seats":await page.goto(baseUrl+prefix+"/book?step=seats");await page.getByRole("grid").waitFor();break;
      case "manage-seats":await page.goto(baseUrl+prefix+`/manage/${b.ref}/seats`);await page.getByRole("grid").waitFor();break;
      case "passenger-checkin":await page.goto(baseUrl+prefix+`/manage/${b.ref}/check-in`);await page.getByRole("button").filter({hasText:b.outbound.number}).first().click();await page.getByRole("button",{name:pub["ci.next"],exact:true}).click();await page.getByRole("button",{name:pub["ci.next"],exact:true}).click();await page.getByRole("grid").waitFor();break;
      case "admin-checkin":await page.goto(baseUrl+prefix+`/admin/check-in?date=${b.outbound.date}&ref=${b.ref}&flightId=${b.outbound.id}`);await page.getByRole("button",{name:admin2["a2.ci.viewExtras"],exact:true}).filter({visible:true}).first().click();await page.getByRole("dialog").waitFor();await page.getByRole("dialog").locator("details summary").first().click();await page.getByRole("grid").waitFor();break;
      case "booking-detail-seats":await page.goto(baseUrl+prefix+`/admin/bookings/${b.ref}`);await page.getByRole("button",{name:admin2["a2.bd.changeSeat"],exact:true}).click();await page.getByRole("dialog").waitFor();await page.getByRole("dialog").locator("details summary").first().click();await page.getByRole("grid").first().waitFor();break;
      case "counter-seats":await counterSeats(page,baseUrl,prefix,b);break;
      }
      // Wait for the accepted sheet entrance animation before measuring/capturing.
      await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].every(d => {
        const r=d.getBoundingClientRect();return r.left >= -1 && r.right <= innerWidth + 1;
      }));
      assert.equal(await page.locator("html").getAttribute("dir"),lang==="ar"?"rtl":"ltr");
      const geometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,grids:[...document.querySelectorAll('[role="grid"]')].map(g=>({rows:g.getAttribute("aria-rowcount"),cols:g.getAttribute("aria-colcount"),dir:g.getAttribute("dir")}))}));
      assert.ok(geometry.scrollWidth<=width+1,`${surface} page overflow ${geometry.scrollWidth}/${width}`);
      assert.ok(geometry.grids.every(g=>g.dir==="ltr"),"physical grid must remain LTR");
      const file=`${surface}-${lang}-${width}.png`;
      await page.screenshot({path:path.join(output,file),fullPage:true});
      rows.push({surface,lang,width,file,...geometry});
      console.log(`Captured ${rows.length}/72 ${file}`);
    } finally{await context.close();}
  }
}finally{await browser.close();await server.close();fs.writeFileSync(path.join(output,"matrix.json"),JSON.stringify(rows,null,2));}
assert.equal(rows.length,72);
