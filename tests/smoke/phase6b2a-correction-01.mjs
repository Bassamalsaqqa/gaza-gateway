import assert from "node:assert/strict";
import { catalogContext } from "./phase6b2a-commercial.mjs";
import { createFreshDraft } from "../../src/lib/booking-draft/factories.ts";
import { en, ar } from "../../src/lib/i18n-public.ts";
import { seedCommercialCatalog } from "../../src/lib/commercial/seed.ts";

const KEY = "gza.commercial.v1";
const DRAFT = "gza.booking.draft.v1";
const CORRUPT = "{correction-01-corrupt";
async function interactive(page, selector) {
  await page.waitForFunction(selector => {
    const node = document.querySelector(selector);
    return node && Object.keys(node).some(k => k.startsWith("__reactProps") && typeof node[k]?.onChange === "function");
  }, selector);
}
async function searchReady(page) {
  const form = page.locator('form[data-flight-search-console="home"]');
  const button = form.locator('button[type="submit"]');
  await button.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const f = document.querySelector('form[data-flight-search-console="home"]');
    return f && Object.keys(f).some(k => k.startsWith("__reactProps") && typeof f[k]?.onSubmit === "function") && !f.querySelector('button[type="submit"]').disabled;
  });
  return { form, button };
}
export async function runPhase6B2ACorrection01Checks({ checkStep, browser, baseUrl }) {
  for (const [i, lang] of ["en", "ar"].entries()) {
    await checkStep(`Check ${89+i}: 6B2A Correction 01 ${lang} Home search catalog/storage failure rollback and canonical-default retry`, async () => {
      // Home matches the real-clock prerender baseline; check-in's fake future
      // clock would introduce unrelated SSR/client text hydration mismatches here.
      const context = await browser.newContext({ viewport: {width:1440,height:900} });
      const prefix = lang === "ar" ? "/ar" : "", pub = lang === "ar" ? ar : en;
      const priorDraft = createFreshDraft(); priorDraft.contact.email = "preserve-search@example.ps";
      await context.addInitScript(({draft,catalog})=>{
        if(!localStorage.getItem("gza.commercial.v1")) localStorage.setItem("gza.commercial.v1",JSON.stringify({schemaVersion:1,revision:0,catalog}));
        if(!localStorage.getItem("gza.booking.draft.v1")) localStorage.setItem("gza.booking.draft.v1",JSON.stringify({schemaVersion:1,status:"active",draft,revision:7,submissionId:"home-correction",updatedAt:"2026-10-01T12:00:00Z"}));
      },{draft:priorDraft,catalog:seedCommercialCatalog()});
      const page = await context.newPage(); const errors = [];
      page.on("pageerror", e => {
        if (!e.message.includes("Minified React error #418")) errors.push(e.message);
      });
      try {
        await page.goto(baseUrl + (prefix || "/"), { waitUntil: "domcontentloaded" });
        let { form, button } = await searchReady(page);
        const prior = await page.evaluate(k => localStorage.getItem(k), DRAFT);
        const criteriaDisplay = await form.textContent();
        await page.evaluate(({key,raw}) => localStorage.setItem(key,raw), { key: KEY, raw: CORRUPT });
        await button.click();
        await form.getByRole("alert").filter({hasText: pub["commercial.error.catalog_unavailable"]}).waitFor();
        assert.equal(new URL(page.url()).pathname, prefix || "/");
        assert.equal(await page.evaluate(k=>localStorage.getItem(k),DRAFT), prior);
        assert.equal(await page.evaluate(k=>localStorage.getItem(k),KEY), CORRUPT);
        assert.ok((await form.textContent()).includes(pub["search.submit"]));
        assert.equal(await form.locator('[aria-invalid="true"]').count(),0);
        const catalog=seedCommercialCatalog(); catalog.defaultMealId="vegetarian";
        await page.evaluate(({key,catalog})=>localStorage.setItem(key,JSON.stringify({schemaVersion:1,revision:31,catalog})),{key:KEY,catalog});
        await button.click();
        await page.waitForURL(url=>url.pathname===prefix+"/book",{waitUntil:"domcontentloaded"});
        const next=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),DRAFT);
        const old=JSON.parse(prior);
        assert.deepEqual(next.draft.criteria,old.draft.criteria);
        assert.ok(next.draft.extras.pax.every(p=>p.meal==="vegetarian"));
        assert.notEqual(next.submissionId,old.submissionId);
        // A healthy catalog does not hide a separate draft persistence failure.
        await page.goto(baseUrl+(prefix||"/"),{waitUntil:"domcontentloaded"});
        ({form,button}=await searchReady(page));
        const raw=await page.evaluate(k=>localStorage.getItem(k),DRAFT);
        await page.evaluate(k=>{
          const original=Storage.prototype.setItem;
          Storage.prototype.setItem=function(key,value){if(key===k)throw new DOMException("quota","QuotaExceededError");return original.call(this,key,value);};
        },DRAFT);
        await button.click();
        await form.getByRole("alert").filter({hasText:pub["commercial.error.storage"]}).waitFor();
        assert.equal(new URL(page.url()).pathname,prefix||"/");
        assert.equal(await page.evaluate(k=>localStorage.getItem(k),DRAFT),raw);
        assert.equal(await form.locator('[aria-invalid="true"]').count(),0);
        assert.ok(criteriaDisplay); assert.deepEqual(errors,[]);
      } finally { await context.close(); }
    });
  }
  for (const [i,lang] of ["en","ar"].entries()) {
    await checkStep(`Check ${91+i}: 6B2A Correction 01 ${lang} existing passenger sign-in with corrupt catalog; new identity fails truthfully`,async()=>{
      const {context,prefix,pub}=await catalogContext(browser,lang);
      const page=await context.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
      try {
        await page.goto(baseUrl+prefix+"/signin",{waitUntil:"domcontentloaded"});
        await page.evaluate(({key,raw})=>{
          localStorage.setItem(key,raw);
          localStorage.setItem("gza.passenger.v1",JSON.stringify({schemaVersion:1,account:{email:"existing@example.ps",firstName:"Existing",lastName:"Identity",phone:"",seatPreference:"none",mealPreference:"vegetarian",newsletter:false},travelers:[]}));
        },{key:KEY,raw:CORRUPT});
        await page.reload({waitUntil:"domcontentloaded"});await interactive(page,"#email");
        const prior=await page.evaluate(()=>localStorage.getItem("gza.passenger.v1"));
        await page.fill("#email","new-identity@example.ps");await page.fill("#password","LocalPrototype123!");
        await page.locator('button[type="submit"]').click();
        await page.getByRole("alert").filter({hasText:pub["error.saveFailed"]}).waitFor();
        assert.equal(new URL(page.url()).pathname,prefix+"/signin");
        assert.equal(await page.evaluate(()=>localStorage.getItem("gza.passenger.v1")),prior);
        await page.fill("#email","EXISTING@example.ps");
        await page.locator('button[type="submit"]').click();
        await page.waitForURL(url=>url.pathname===prefix+"/account",{waitUntil:"domcontentloaded"});
        const a=await page.evaluate(()=>JSON.parse(localStorage.getItem("gza.passenger.v1")).account);
        assert.equal(a.email,"existing@example.ps");assert.equal(a.mealPreference,"vegetarian");
        assert.equal(a.firstName,"Existing");assert.equal(a.lastName,"Identity");
        assert.equal(await page.evaluate(k=>localStorage.getItem(k),KEY),CORRUPT);assert.deepEqual(errors,[]);
      } finally {await context.close();}
    });
  }
  for (const [i,lang] of ["en","ar"].entries()) {
    await checkStep(`Check ${93+i}: 6B2A Correction 01 ${lang} owned Account Trip uses typed cancel; unrelated account remains denied`,async()=>{
      const {context,prefix,b,pub}=await catalogContext(browser,lang);
      const page=await context.newPage();
      try {
        await page.goto(baseUrl+prefix+"/account/trips/"+b.ref,{waitUntil:"domcontentloaded"});
        await page.evaluate(({ref,key,raw})=>{
          localStorage.setItem(key,raw);
          const data=JSON.parse(localStorage.getItem("gza.repo.v1"));
          data.bookings.find(b=>b.ref===ref).ownerEmail="owner@example.ps";
          localStorage.setItem("gza.repo.v1",JSON.stringify(data));
          localStorage.setItem("gza.passenger.v1",JSON.stringify({schemaVersion:1,account:{email:"other@example.ps",firstName:"Other",lastName:"Identity",phone:"",seatPreference:"none",mealPreference:"standard",newsletter:false},travelers:[]}));
        },{ref:b.ref,key:KEY,raw:CORRUPT});
        await page.reload({waitUntil:"domcontentloaded"});
        await page.getByText(pub["manage.notFound"],{exact:true}).waitFor();
        assert.equal(await page.getByRole("button",{name:pub["manage.cancel"],exact:true}).count(),0);
        await page.evaluate(()=>{
          const d=JSON.parse(localStorage.getItem("gza.passenger.v1"));d.account.email="owner@example.ps";localStorage.setItem("gza.passenger.v1",JSON.stringify(d));
        });
        await page.reload({waitUntil:"domcontentloaded"});
        await page.getByRole("button",{name:pub["manage.cancel"],exact:true}).click();
        await page.getByRole("alertdialog").getByRole("button",{name:pub["manage.cancelConfirmYes"],exact:true}).click();
        await page.getByRole("alertdialog").waitFor({state:"hidden"});
        await page.getByText(pub["manage.cancelled"],{exact:true}).first().waitFor();
        const stored=await page.evaluate(ref=>JSON.parse(localStorage.getItem("gza.repo.v1")).bookings.find(b=>b.ref===ref),b.ref);
        assert.equal(stored.status,"cancelled");assert.deepEqual(stored.pricingSnapshot,b.pricingSnapshot);assert.equal(stored.total,b.total);
        assert.equal(await page.evaluate(k=>localStorage.getItem(k),KEY),CORRUPT);
        await page.reload({waitUntil:"domcontentloaded"});await page.getByText(pub["manage.cancelled"],{exact:true}).first().waitFor();
      } finally {await context.close();}
    });
  }
}
