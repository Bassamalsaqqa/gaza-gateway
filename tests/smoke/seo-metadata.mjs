import assert from "node:assert/strict";
import { staticIndexableRoutes } from "../../scripts/generate-sitemap.mjs";
import { datedServiceId } from "../../src/lib/dated-services/identity.ts";

// Runs through the shared clock, storage, network and page-error harness.
export async function runSeoMetadataChecks({ browser, baseUrl }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const titles = new Set();
  const assets = new Set();
  page.on("request", request => {
    if (request.url().includes("/assets/")) assets.add(new URL(request.url()).pathname);
  });
  let inspected = 0;
  try {
    for (const locale of ["en", "ar"]) {
      for (const entry of staticIndexableRoutes) {
        const route = locale === "ar" ? `/ar${entry.path}` : entry.path || "/";
        await page.goto(baseUrl + route, { waitUntil: "networkidle" });
        const facts = await page.evaluate(() => ({
          title: document.title,
          lang: document.documentElement.lang,
          dir: document.documentElement.dir,
          canonicals: [...document.querySelectorAll('link[rel="canonical"]')].map(node => node.href),
          alternates: [...document.querySelectorAll('link[rel="alternate"]')].map(node => [node.hreflang, node.href]),
          description: document.querySelector('meta[name="description"]')?.content,
          ogUrl: document.querySelector('meta[property="og:url"]')?.content,
          robots: document.querySelector('meta[name="robots"]')?.content || "",
          schemas: [...document.querySelectorAll('script[type="application/ld+json"]')].map(node => JSON.parse(node.textContent)),
        }));
        const canonical = `https://www.gazaairport.com${route}`;
        assert.deepEqual(facts.canonicals, [canonical], route);
        assert.equal(facts.ogUrl, canonical, route);
        assert.ok(facts.description?.trim(), route);
        assert.ok(facts.title?.trim() && !titles.has(facts.title), `Unique title: ${route}`);
        titles.add(facts.title);
        assert.equal(facts.lang, locale, route);
        assert.equal(facts.dir, locale === "ar" ? "rtl" : "ltr", route);
        assert.ok(!facts.robots.includes("noindex"), route);
        for (const [language, url] of [["en", entry.path || "/"], ["ar", `/ar${entry.path}`], ["x-default", entry.path || "/"]]) {
          assert.ok(facts.alternates.some(([lang, href]) => lang === language && href === `https://www.gazaairport.com${url}`), `${route}: ${language}`);
        }
        assert.ok(!JSON.stringify(facts.schemas).includes('"offers"'), "No prototype commercial offers");
        if (route === "/") {
          assert.ok(![...assets].some(asset => /\.admin[._]|appearance-lab|StudioFrameListener|ArchiveRecordEditorSheet/.test(asset)), "Public startup does not fetch admin/Studio editors");
          console.log(`Homepage asset requests: ${assets.size}; editor isolation passed`);
        }
        inspected++;
      }
    }
    const service = datedServiceId("sch-AMM-out", "2026-10-08");
    for (const locale of ["", "/ar"]) {
      for (const route of ["/book", "/manage", "/signin", "/admin/signin", "/booking-confirmation/SEO-PNR-PRIVATE", `/flight/${service}`]) {
        await page.goto(baseUrl + locale + route, { waitUntil: "networkidle" });
        const facts = await page.evaluate(() => ({ title: document.title, head: document.head.textContent, robots: document.querySelector('meta[name="robots"]')?.content }));
        assert.ok(facts.robots?.includes("noindex"), `${locale}${route}: noindex`);
        assert.ok(!facts.head.includes("SEO-PNR-PRIVATE"), "PNR never leaks into head");
        if (route.startsWith("/flight/")) assert.ok(!facts.title.includes("PS"), "svc1 static metadata remains generic");
        inspected++;
      }
    }
    console.log(`SEO metadata: ${inspected} public/private EN/AR routes passed`);
  } finally {
    await context.close();
  }
}
