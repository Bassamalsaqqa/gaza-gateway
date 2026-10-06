import assert from "node:assert/strict";
import { networkContext } from "./phase6b2c1-network.mjs";
import { interactive } from "./phase6b2b-correction-01.mjs";
import { seedSchedules } from "../../src/lib/schedules/seed.ts";

export const foundationSchedule = () => ({...seedSchedules()[0],id:"foundation-browser",days:[2],aircraftId:"a320neo",aircraft:"Airbus A320neo",exceptions:[]});
export async function foundationContext(browser,lang="en",staff="adm-1",schedule=foundationSchedule()) {
  const fixture=await networkContext(browser,lang,staff);
  await fixture.context.addInitScript(s=>{if(!localStorage.getItem("gza.schedule.v1")) localStorage.setItem("gza.schedule.v1",JSON.stringify({schemaVersion:1,revision:0,schedules:[s]}));},schedule);
  return fixture;
}
const bytes=page=>page.evaluate(()=>localStorage.getItem("gza.schedule.v1"));
const stored=async page=>JSON.parse(await bytes(page)).schedules[0];
async function open(page,baseUrl,prefix,dict) {
  await page.goto(baseUrl+prefix+"/admin/schedules");
  await page.getByRole("button",{name:dict["adm.common.edit"],exact:true}).filter({visible:true}).first().click();
  await interactive(page,"#sc-number");
}
const save=(page,dict)=>page.getByRole("dialog").getByRole("button",{name:dict["adm.edit.save"],exact:true}).click();
const closed=page=>page.getByRole("dialog").waitFor({state:"hidden"});
async function add(page,dict,kind,effect) {
  await page.getByRole("button",{name:dict["adm.sch.addException"],exact:true}).click();
  const last=page.locator('fieldset').filter({has:page.locator('select[id^="exc-kind-"]')}).last();
  const kinds=page.locator('select[id^="exc-kind-"]');await kinds.last().selectOption(kind);
  await page.locator('input[id^="exc-date-"]').last().fill(kind==="extra"?"2026-10-07":"2026-10-06");
  await page.locator('input[id^="exc-detail-"]').last().fill("Explicit operator note");
  if(effect) await page.locator('button[id^="exc-effect-toggle-"]').last().click();
  return last;
}

export async function runDatedServiceFoundationChecks({checkStep,browser,baseUrl}) {
  for(const [i,lang] of ["en","ar"].entries()) {
    await checkStep(`Check ${113+i}: C2A ${lang} all structured effects save/reload, annotation and retirement; unrelated booked service remains intact`,async()=>{
      const {context,prefix,dict,b}=await foundationContext(browser,lang);const page=await context.newPage();
      try {
        // Runtime detail remains keyed by the accepted legacy identity before/after Schedule edits.
        await page.goto(baseUrl+prefix+`/flight/${b.outbound.id}`);
        await page.getByText(b.outbound.number,{exact:true}).first().waitFor();
        const detail=await page.locator("main").innerText();
        for(const kind of ["annotation","cancelled","time","aircraft","extra"]) {
          await open(page,baseUrl,prefix,dict);
          assert.equal(await page.getByRole("dialog").getByRole("button",{name:/^Delete$|^حذف$/}).count(),0);
          await add(page,dict,kind==="annotation"?"cancelled":kind,kind!=="annotation");
          if(kind==="time") {
            await page.locator('input[id^="exc-effect-departTime-"]').last().fill("23:50");
            await page.locator('input[id^="exc-effect-arriveTime-"]').last().fill("01:20");
          }
          if(kind==="aircraft") await page.locator('select[id^="exc-effect-aircraftId-"]').last().selectOption("a321neo");
          if(kind==="extra") {
            assert.equal(await page.locator('input[id^="exc-effect-departTime-"]').last().inputValue(),"");
            assert.equal(await page.locator('select[id^="exc-effect-aircraftId-"]').last().inputValue(),"");
            assert.equal(await page.locator('select[id^="exc-effect-aircraftId-"]').last().getAttribute("dir"),"ltr");
          }
          await save(page,dict);await closed(page);await page.reload();
          const s=await stored(page),exc=s.exceptions[0];
          assert.equal(s.id,"foundation-browser");assert.equal(exc.kind,kind==="annotation"?"cancelled":kind);
          const expected={annotation:undefined,cancelled:{cancelled:true},time:{departTime:"23:50",arriveTime:"01:20"},aircraft:{aircraftId:"a321neo",aircraft:"Airbus A321neo"},extra:{}}[kind];
          assert.deepEqual(exc.effect,expected);
          // Remove this exception through the same canonical editor, not through fixture writes.
          await page.getByRole("button",{name:dict["adm.common.edit"],exact:true}).filter({visible:true}).first().click();await interactive(page,"#sc-number");
          await page.getByRole("button",{name:dict["adm.sch.excRemove"],exact:true}).click();await save(page,dict);await closed(page);
        }
        await open(page,baseUrl,prefix,dict);await page.locator("#sc-active").click();await save(page,dict);await closed(page);await page.reload();assert.equal((await stored(page)).active,false);
        await page.goto(baseUrl+prefix+`/flight/${b.outbound.id}`);await page.getByText(b.outbound.number,{exact:true}).first().waitFor();assert.equal(await page.locator("main").innerText(),detail);
      }finally{await context.close();}
    });
    await checkStep(`Check ${115+i}: C2A ${lang} exact effect-field validation focus, quota rollback, retained draft and retry`,async()=>{
      const {context,prefix,dict}=await foundationContext(browser,lang);const page=await context.newPage();
      try{
        await open(page,baseUrl,prefix,dict);await add(page,dict,"time",true);const before=await bytes(page);
        const depart=page.locator('input[id^="exc-effect-departTime-"]').last();await depart.fill("BadTime");await save(page,dict);
        await depart.and(page.locator('[aria-invalid="true"]')).waitFor();assert.equal(await page.locator(':focus').getAttribute('id'),await depart.getAttribute('id'));
        const described=await depart.getAttribute('aria-describedby');assert.equal(await page.locator('#'+described).innerText(),dict['adm.sch.error.exceptions.departTime']);assert.equal(await bytes(page),before);
        await depart.fill("12:20");await page.locator('input[id^="exc-effect-arriveTime-"]').last().fill("13:20");
        await page.evaluate(()=>{const original=Storage.prototype.setItem;window.__foundationFail=true;Storage.prototype.setItem=function(k,v){if(window.__foundationFail&&k==='gza.schedule.v1')throw new DOMException('quota','QuotaExceededError');return original.call(this,k,v);};});
        await save(page,dict);await page.getByRole('dialog').getByRole('alert').filter({hasText:dict['adm.sch.saveError']}).waitFor();
        assert.equal(await bytes(page),before);assert.equal(await depart.inputValue(),'12:20');assert.equal(await page.getByRole('dialog').locator('[aria-invalid="true"]').count(),0);
        assert.equal(await page.getByText(dict['adm.sch.saved'].replace('{number}','PS100'),{exact:true}).count(),0);
        await page.evaluate(()=>window.__foundationFail=false);await save(page,dict);await closed(page);await page.reload();assert.equal((await stored(page)).exceptions[0].effect.departTime,'12:20');
      }finally{await context.close();}
    });
    await checkStep(`Check ${117+i}: C2A ${lang} inactive exception display and corrupt Fleet disable assignment while safe Schedule edits commit`,async()=>{
      const s=foundationSchedule();s.exceptions=[{id:'stored-equipment',date:'2026-10-06',kind:'aircraft',detail:'historical equipment',effect:{aircraftId:'b737800',aircraft:'Boeing 737-800'}}];
      const {context,prefix,dict}=await foundationContext(browser,lang,'adm-1',s);const page=await context.newPage(),writer=await context.newPage();
      try {
        await open(page,baseUrl,prefix,dict);const select=page.locator('#exc-effect-aircraftId-stored-equipment');assert.equal(await select.inputValue(),'b737800');assert.match(await select.locator('option:checked').innerText(),/Boeing 737-800/);
        assert.ok((await select.locator('option:checked').innerText()).includes(dict['adm.common.inactive']));
        await writer.goto(baseUrl+prefix+'/admin/schedules');await writer.evaluate(()=>localStorage.setItem('gza.fleet.v1','{foundation-corrupt'));
        await page.waitForFunction(()=>document.querySelector('#sc-ac')?.disabled===true);
        assert.equal(await select.isDisabled(),true);
        await page.fill('#exc-detail-stored-equipment','safe note with corrupt Fleet');await page.fill('#sc-dep','09:30');await save(page,dict);await closed(page);await page.reload();
        assert.equal((await stored(page)).exceptions[0].effect.aircraftId,'b737800');assert.equal((await stored(page)).departTime,'09:30');
        await page.getByRole('button',{name:dict['adm.common.edit'],exact:true}).filter({visible:true}).first().click();await interactive(page,'#sc-number');
        await add(page,dict,'aircraft',false);assert.equal(await page.locator('button[id^="exc-effect-toggle-"]').last().isDisabled(),true);
        assert.equal(await page.evaluate(()=>localStorage.getItem('gza.fleet.v1')),'{foundation-corrupt');
      }finally{await context.close();}
    });
    await checkStep(`Check ${119+i}: C2A ${lang} viewer cannot create/edit/delete or mutate structured Schedule effects`,async()=>{
      const {context,prefix,dict}=await foundationContext(browser,lang,'adm-3');const page=await context.newPage();
      try{await page.goto(baseUrl+prefix+'/admin/schedules');await page.locator('main').getByText('PS100',{exact:true}).filter({visible:true}).first().waitFor();const before=await bytes(page);
        assert.equal(await page.getByRole('button',{name:dict['adm.sch.new'],exact:true}).isDisabled(),true);
        const edits=page.getByRole('button',{name:dict['adm.common.edit'],exact:true}).filter({visible:true});assert.ok(await edits.count()>0);
        for(const button of await edits.all()) assert.equal(await button.isDisabled(),true);
        assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await bytes(page),before);
      }finally{await context.close();}
    });
  }
}
