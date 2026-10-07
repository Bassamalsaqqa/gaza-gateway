import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { publishedTravel } from "../../src/content/published/travel.ts";
import { publishedAirportPresent } from "../../src/content/published/airport-present.ts";
import { publishedAirportFuture } from "../../src/content/published/airport-future.ts";
import { publishedDestinationsEditorial } from "../../src/content/published/destinations-editorial.ts";
import { publishedInformationPages } from "../../src/content/published/information-pages.ts";
import { en, ar } from "../../src/lib/i18n-public.ts";

export async function runPhase7ContentPreviewChecks({ browser, baseUrl, checkStep }) {
  for (const lang of ["en", "ar"]) {
    await checkStep(`Phase 7 ${lang}: published/local-preview separation, cross-tab refresh, corruption and Studio isolation`, async () => {
      const prefix = lang === "ar" ? "/ar" : "";
      const context = await browser.newContext({ viewport: { width: lang === "ar" ? 390 : 1440, height: 900 } });
      context.setDefaultTimeout(10000);
      const pageErrors = [];
      context.on("page", (page) => page.on("pageerror", (error) => pageErrors.push(error.message)));
      const page = await context.newPage();
      const marker = lang === "ar" ? "محتوى المسودة المحلية" : "Local editorial draft";
      const drafts = {
        travel: structuredClone(publishedTravel),
        "airport.present": structuredClone(publishedAirportPresent),
        "airport.future": structuredClone(publishedAirportFuture),
        "destinations.editorial": structuredClone(publishedDestinationsEditorial),
        "pages.information": structuredClone(publishedInformationPages),
      };
      drafts.travel.intro.title[lang] = `${marker} Travel`;
      drafts["airport.present"].intro.title[lang] = `${marker} Present`;
      drafts["airport.future"].copy.title[lang] = `${marker} Future`;
      drafts["destinations.editorial"].destinations[0].blurb[lang] = `${marker} Amman`;
      drafts["pages.information"].pages.find((entry) => entry.id === "privacy").title[lang] = `${marker} Privacy`;
      const bytes = JSON.stringify({ schemaVersion: 1, drafts });
      try {
        await page.goto(`${baseUrl}${prefix}/travel`, { waitUntil: "domcontentloaded" });
        await page.getByRole("heading", { level: 1 }).waitFor();
        // Navigate to the app origin before accessing Storage. No fixture reseeding on other tabs.
        await page.evaluate((raw) => localStorage.setItem("gza.content.draft.v1", raw), bytes);
        const cases = [
          { path: "/travel", original: publishedTravel.intro.title[lang], edited: `${marker} Travel`, heading: true },
          { path: "/airport/present", original: publishedAirportPresent.intro.title[lang], edited: `${marker} Present`, heading: true },
          { path: "/airport/future", original: publishedAirportFuture.copy.title[lang], edited: `${marker} Future`, heading: true },
          { path: "/destinations/AMM", original: publishedDestinationsEditorial.destinations[0].blurb[lang], edited: `${marker} Amman`, heading: false },
          { path: "/privacy", original: publishedInformationPages.pages.find((entry) => entry.id === "privacy").title[lang], edited: `${marker} Privacy`, heading: true },
        ];
        for (const item of cases) {
          await page.goto(`${baseUrl}${prefix}${item.path}`, { waitUntil: "domcontentloaded" });
          const original = item.heading ? page.getByRole("heading", { name: item.original, exact: true }) : page.getByText(item.original, { exact: true });
          await original.waitFor();
          assert.equal(await page.getByText(item.edited, { exact: true }).count(), 0, "Ordinary URL must stay compiled");
          await page.goto(`${baseUrl}${prefix}${item.path}?contentPreview=1`, { waitUntil: "domcontentloaded" });
          const locator = item.heading ? page.getByRole("heading", { name: item.edited, exact: true }) : page.getByText(item.edited, { exact: true });
          await locator.waitFor();
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `Overflow: ${item.path}/${lang}`);
          assert.equal(await page.evaluate(() => localStorage.getItem("gza.content.draft.v1")), bytes, "Preview must not rewrite storage");
          if (item.path === "/airport/future") await page.getByText((lang === "ar" ? ar : en)["airport.futurePlainDisclosure"], { exact: true }).waitFor();
        }

        await page.goto(`${baseUrl}${prefix}/travel?contentPreview=1`, { waitUntil: "domcontentloaded" });
        await page.getByRole("heading", { name: `${marker} Travel`, exact: true }).waitFor();
        const writer = await context.newPage();
        await writer.goto(`${baseUrl}${prefix}/travel`, { waitUntil: "domcontentloaded" });
        const updated = structuredClone(drafts);
        updated.travel.intro.title[lang] = `${marker} Updated`;
        await writer.evaluate((raw) => localStorage.setItem("gza.content.draft.v1", raw), JSON.stringify({ schemaVersion: 1, drafts: updated }));
        await page.getByRole("heading", { name: `${marker} Updated`, exact: true }).waitFor();

        await writer.evaluate(() => localStorage.setItem("gza.content.draft.v1", "{broken"));
        await page.getByRole("heading", { name: publishedTravel.intro.title[lang], exact: true }).waitFor();
        await page.getByRole("alert").filter({ hasText: lang === "ar" ? "تعذر تحميل المسودة المحلية" : "The local draft could not be loaded" }).waitFor();
        assert.equal(await page.evaluate(() => localStorage.getItem("gza.content.draft.v1")), "{broken");
        await page.goto(`${baseUrl}${prefix}/travel`, { waitUntil: "domcontentloaded" });
        await page.getByRole("heading", { name: publishedTravel.intro.title[lang], exact: true }).waitFor();

        await writer.evaluate((raw) => localStorage.setItem("gza.content.draft.v1", raw), bytes);
        await page.goto(`${baseUrl}${prefix}/travel?contentPreview=1&studioPreview=1`, { waitUntil: "domcontentloaded" });
        await page.getByRole("heading", { name: publishedTravel.intro.title[lang], exact: true }).waitFor();
        await page.waitForFunction(() => !document.body.textContent.includes("Loading the local draft…") && !document.body.textContent.includes("جارٍ تحميل المسودة المحلية…"));
        assert.equal(await page.getByRole("heading", { name: `${marker} Travel`, exact: true }).count(), 0, "Studio must not read the persistent draft");
        assert.equal(await page.evaluate(() => localStorage.getItem("gza.content.draft.v1")), bytes);
        assert.deepEqual(pageErrors, []);
      } finally { await context.close(); }
    });
  }
}

// This focused suite can run independently without invoking the whole application smoke.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = process.env.CMS_TEST_URL ? null : await createServer({ server: { port: 4176, strictPort: true }, logLevel: "error" });
  let browser;
  try {
    if (server) await server.listen();
    browser = await chromium.launch({ channel: "msedge", headless: true });
    await runPhase7ContentPreviewChecks({
      browser,
      baseUrl: process.env.CMS_TEST_URL ?? "http://localhost:4176",
      checkStep: async (name, run) => { await run(); console.log(`PASS: ${name}`); },
    });
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await server?.close();
  }
}
