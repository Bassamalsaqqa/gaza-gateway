import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  pageHead,
  canonicalUrl,
  stripArabicPrefix,
  arPath,
  serializeJsonLd,
  SITE_ORIGIN,
  toAbsoluteUrl,
} from "../../src/lib/head.ts";
import { compiledContentHead } from "../../src/content/head.ts";
import {
  getAirportSchema,
  getAirlineSchema,
  getWebSiteSchema,
  getBreadcrumbSchema,
  getArticleSchema,
  getCreativeWorkSchema,
} from "../../src/lib/structured-data.ts";
import { buildSitemapXml, staticIndexableRoutes } from "../../scripts/generate-sitemap.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("SEO, Metadata & Structured Data (Phase 11)", () => {
  describe("Metadata Utilities (src/lib/head.ts)", () => {
    it("generates complete EN metadata with canonical and reciprocal hreflang links", () => {
      const result = pageHead({
        locale: "en",
        path: "/destinations",
        en: {
          title: "Destinations — Palestinian Airlines from Gaza (GZA)",
          description: "Explore destinations served from Gaza International Airport.",
        },
        ar: {
          title: "الوجهات — الخطوط الجوية الفلسطينية من غزة (GZA)",
          description: "استكشف وجهات الرحلات من مطار غزة الدولي.",
        },
      });

      // Title & description
      const titleMeta = result.meta.find((m) => "title" in m);
      assert.equal(titleMeta?.title, "Destinations — Palestinian Airlines from Gaza (GZA)");

      const descMeta = result.meta.find((m) => "name" in m && m.name === "description");
      assert.equal(descMeta?.content, "Explore destinations served from Gaza International Airport.");

      // Open Graph
      const ogTitle = result.meta.find((m) => "property" in m && m.property === "og:title");
      assert.equal(ogTitle?.content, "Destinations — Palestinian Airlines from Gaza (GZA)");

      const ogUrl = result.meta.find((m) => "property" in m && m.property === "og:url");
      assert.equal(ogUrl?.content, "https://www.gazaairport.com/destinations");

      // Links: canonical and hreflang
      const canonical = result.links.find((l) => l.rel === "canonical");
      assert.equal(canonical?.href, "https://www.gazaairport.com/destinations");

      const hreflangEn = result.links.find((l) => l.rel === "alternate" && l.hreflang === "en");
      assert.equal(hreflangEn?.href, "https://www.gazaairport.com/destinations");

      const hreflangAr = result.links.find((l) => l.rel === "alternate" && l.hreflang === "ar");
      assert.equal(hreflangAr?.href, "https://www.gazaairport.com/ar/destinations");

      const hreflangDefault = result.links.find((l) => l.rel === "alternate" && l.hreflang === "x-default");
      assert.equal(hreflangDefault?.href, "https://www.gazaairport.com/destinations");
    });

    it("generates complete AR metadata with /ar prefix and RTL locale tags", () => {
      const result = pageHead({
        locale: "ar",
        path: "/destinations",
        en: {
          title: "Destinations — Palestinian Airlines from Gaza (GZA)",
          description: "Explore destinations served from Gaza International Airport.",
        },
        ar: {
          title: "الوجهات — الخطوط الجوية الفلسطينية من غزة (GZA)",
          description: "استكشف وجهات الرحلات من مطار غزة الدولي.",
        },
      });

      const titleMeta = result.meta.find((m) => "title" in m);
      assert.equal(titleMeta?.title, "الوجهات — الخطوط الجوية الفلسطينية من غزة (GZA)");

      const ogLocale = result.meta.find((m) => "property" in m && m.property === "og:locale");
      assert.equal(ogLocale?.content, "ar_PS");

      const canonical = result.links.find((l) => l.rel === "canonical");
      assert.equal(canonical?.href, "https://www.gazaairport.com/ar/destinations");
    });

    it("emits noindex, nofollow robots tag on private surfaces", () => {
      const result = pageHead({
        locale: "en",
        path: "/manage",
        noindex: true,
        en: {
          title: "Manage Booking — Gaza International Airport (GZA)",
          description: "Retrieve your booking.",
        },
      });

      const robotsMeta = result.meta.find((m) => "name" in m && m.name === "robots");
      assert.equal(robotsMeta?.content, "noindex, nofollow");
    });

    it("embeds schema.org JSON-LD scripts when schema is provided", () => {
      const airport = getAirportSchema("en");
      const result = pageHead({
        locale: "en",
        path: "/airport",
        en: {
          title: "Airport — Gaza International Airport (GZA)",
          description: "History and vision.",
        },
        schema: airport,
      });

      assert.ok(result.scripts && result.scripts.length > 0);
      assert.equal(result.scripts[0].type, "application/ld+json");
      assert.ok(result.scripts[0].children.includes("LVGZ"));
    });

    it("stripArabicPrefix only strips exact /ar or /ar/ prefix, never English paths like /airport", () => {
      assert.equal(stripArabicPrefix("/ar"), "/");
      assert.equal(stripArabicPrefix("ar"), "/");
      assert.equal(stripArabicPrefix("/ar/"), "/");
      assert.equal(stripArabicPrefix("ar/"), "/");
      assert.equal(stripArabicPrefix("/ar/airport"), "/airport");
      assert.equal(stripArabicPrefix("/ar/airport/past"), "/airport/past");
      assert.equal(stripArabicPrefix("/ar/destinations/AMM"), "/destinations/AMM");

      // English words starting with "ar" must NOT be stripped or truncated
      assert.equal(stripArabicPrefix("/airport"), "/airport");
      assert.equal(stripArabicPrefix("/airport/past"), "/airport/past");
      assert.equal(stripArabicPrefix("/airport/present"), "/airport/present");
      assert.equal(stripArabicPrefix("/airport/future"), "/airport/future");
      assert.equal(stripArabicPrefix("/architecture"), "/architecture");
      assert.equal(stripArabicPrefix("/arabic"), "/arabic");

      // Base cases
      assert.equal(stripArabicPrefix("/"), "/");
      assert.equal(stripArabicPrefix(""), "/");
      assert.equal(stripArabicPrefix("/destinations"), "/destinations");
    });

    it("canonicalUrl produces correct EN and AR URLs for all Airport routes without /port truncation", () => {
      const chapters = ["/airport", "/airport/past", "/airport/present", "/airport/future"];

      for (const p of chapters) {
        // EN canonical
        const enCanonical = canonicalUrl(p, "en");
        assert.equal(enCanonical, `https://www.gazaairport.com${p}`);
        assert.ok(!enCanonical.includes("/port"), `EN canonical for ${p} must not contain /port: ${enCanonical}`);

        // AR canonical
        const arCanonical = canonicalUrl(p, "ar");
        assert.equal(arCanonical, `https://www.gazaairport.com/ar${p}`);
        assert.ok(!arCanonical.includes("/ar/port"), `AR canonical for ${p} must not contain /ar/port: ${arCanonical}`);

        // Symmetry when starting from /ar prefixed path
        assert.equal(canonicalUrl(`/ar${p}`, "en"), `https://www.gazaairport.com${p}`);
        assert.equal(canonicalUrl(`/ar${p}`, "ar"), `https://www.gazaairport.com/ar${p}`);
      }
    });

    it("pageHead accurately generates canonical, og:url, and reciprocal alternates for Airport chapters", () => {
      const airportRoutes = [
        { path: "/airport", titleEn: "The Airport", titleAr: "المطار" },
        { path: "/airport/past", titleEn: "The Past", titleAr: "الماضي" },
        { path: "/airport/present", titleEn: "The Present", titleAr: "الحاضر" },
        { path: "/airport/future", titleEn: "The Future", titleAr: "المستقبل" },
      ];

      for (const item of airportRoutes) {
        // English head
        const enHead = pageHead({
          locale: "en",
          path: item.path,
          en: { title: item.titleEn, description: `EN description for ${item.path}` },
          ar: { title: item.titleAr, description: `AR description for ${item.path}` },
        });

        const enCanonical = enHead.links.find((l) => l.rel === "canonical");
        assert.equal(enCanonical?.href, `https://www.gazaairport.com${item.path}`);

        const enOgUrl = enHead.meta.find((m) => m.property === "og:url");
        assert.equal(enOgUrl?.content, `https://www.gazaairport.com${item.path}`);

        const enAltEn = enHead.links.find((l) => l.rel === "alternate" && l.hreflang === "en");
        assert.equal(enAltEn?.href, `https://www.gazaairport.com${item.path}`);

        const enAltAr = enHead.links.find((l) => l.rel === "alternate" && l.hreflang === "ar");
        assert.equal(enAltAr?.href, `https://www.gazaairport.com/ar${item.path}`);

        const enAltDefault = enHead.links.find((l) => l.rel === "alternate" && l.hreflang === "x-default");
        assert.equal(enAltDefault?.href, `https://www.gazaairport.com${item.path}`);

        // Arabic head
        const arHead = pageHead({
          locale: "ar",
          path: item.path,
          en: { title: item.titleEn, description: `EN description for ${item.path}` },
          ar: { title: item.titleAr, description: `AR description for ${item.path}` },
        });

        const arCanonical = arHead.links.find((l) => l.rel === "canonical");
        assert.equal(arCanonical?.href, `https://www.gazaairport.com/ar${item.path}`);

        const arOgUrl = arHead.meta.find((m) => m.property === "og:url");
        assert.equal(arOgUrl?.content, `https://www.gazaairport.com/ar${item.path}`);

        const arAltEn = arHead.links.find((l) => l.rel === "alternate" && l.hreflang === "en");
        assert.equal(arAltEn?.href, `https://www.gazaairport.com${item.path}`);

        const arAltAr = arHead.links.find((l) => l.rel === "alternate" && l.hreflang === "ar");
        assert.equal(arAltAr?.href, `https://www.gazaairport.com/ar${item.path}`);

        // Zero /port contamination
        const allEnHrefs = enHead.links.map((l) => l.href).join(" ");
        assert.ok(!allEnHrefs.includes("/port"), `Links must not contain /port: ${allEnHrefs}`);

        const allArHrefs = arHead.links.map((l) => l.href).join(" ");
        assert.ok(!allArHrefs.includes("/port"), `Links must not contain /port: ${allArHrefs}`);
      }
    });

    it("serializeJsonLd safely escapes < characters to prevent </script> tag injection", () => {
      const maliciousSchema = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Test </script><script>alert('xss')</script>",
        description: "Testing <script> breakout protection & unicode escaping",
      };

      const serialized = serializeJsonLd(maliciousSchema);

      // Raw serialized JSON must not contain unescaped </script>
      assert.ok(!serialized.includes("</script>"), "Serialized JSON-LD must not contain literal </script>");
      assert.ok(!serialized.includes("<script>"), "Serialized JSON-LD must not contain literal <script>");
      assert.ok(serialized.includes("\\u003c/script>"), "Serialized JSON-LD must escape < as \\u003c");

      // JSON parser correctly decodes \\u003c back to <
      const parsed = JSON.parse(serialized);
      assert.equal(parsed.headline, "Test </script><script>alert('xss')</script>");
      assert.equal(parsed.description, "Testing <script> breakout protection & unicode escaping");

      // Verify pageHead outputs safe script tag children
      const result = pageHead({
        locale: "en",
        path: "/test",
        title: "Test",
        description: "Test description",
        schema: maliciousSchema,
      });

      assert.ok(result.scripts && result.scripts.length > 0);
      assert.ok(!result.scripts[0].children.includes("</script>"));
      assert.ok(result.scripts[0].children.includes("\\u003c/script>"));
    });

    it("compiledContentHead correctly normalizes paths and escapes JSON-LD scripts", () => {
      const seo = {
        title: { en: "Future Airport", ar: "مطار المستقبل" },
        description: { en: "Vision for the future", ar: "رؤية للمستقبل" },
      };

      // EN compiledContentHead
      const enHead = compiledContentHead(seo, undefined, false, "/airport/future", {
        schema: { test: "</script><script>alert(1)</script>" },
      });
      const enCanonical = enHead.links?.find((l) => l.rel === "canonical");
      assert.equal(enCanonical?.href, "https://www.gazaairport.com/airport/future");
      assert.ok(!enCanonical?.href.includes("/port"));

      const enAltAr = enHead.links?.find((l) => l.hrefLang === "ar");
      assert.equal(enAltAr?.href, "https://www.gazaairport.com/ar/airport/future");

      // AR compiledContentHead
      const arHead = compiledContentHead(seo, "ar", false, "/airport/future");
      const arCanonical = arHead.links?.find((l) => l.rel === "canonical");
      assert.equal(arCanonical?.href, "https://www.gazaairport.com/ar/airport/future");

      // JSON-LD script escaping
      assert.ok(enHead.scripts && enHead.scripts.length > 0);
      assert.ok(!enHead.scripts[0].children.includes("</script>"));
      assert.ok(enHead.scripts[0].children.includes("\\u003c/script>"));
    });
  });

  describe("Truthful Structured Data (src/lib/structured-data.ts)", () => {
    it("provides accurate Airport schema without fake commercial inventory", () => {
      const en = getAirportSchema("en");
      assert.equal(en["@type"], "Airport");
      assert.equal(en.iataCode, "GZA");
      assert.equal(en.icaoCode, "LVGZ");
      assert.equal(en.address.addressLocality, "Rafah");
      assert.equal("geo" in en, false, "Do not add unverified coordinate precision");
      assert.ok(en.description.includes("Currently inactive"));
      // Must not contain commercial flight offers
      assert.equal("offers" in en, false);

      const ar = getAirportSchema("ar");
      assert.equal(ar["@type"], "Airport");
      assert.ok(ar.name.includes("مطار غزة الدولي"));
      assert.ok(ar.description.includes("مغلق حالياً"));
    });

    it("provides accurate Airline schema for Palestinian Airlines", () => {
      const en = getAirlineSchema("en");
      assert.equal(en["@type"], "Airline");
      assert.equal(en.iataCode, "PS");
      assert.equal(en.name, "Palestinian Airlines");
      assert.equal("offers" in en, false);
    });

    it("provides WebSite schema with bilingual support", () => {
      const web = getWebSiteSchema("en");
      assert.equal(web["@type"], "WebSite");
      assert.deepEqual(web.inLanguage, ["en", "ar"]);
    });

    it("generates BreadcrumbList with absolute URLs", () => {
      const breadcrumbs = getBreadcrumbSchema([
        { name: "Home", path: "/" },
        { name: "Airport", path: "/airport" },
        { name: "Past", path: "/airport/past" },
      ]);
      assert.equal(breadcrumbs["@type"], "BreadcrumbList");
      assert.equal(breadcrumbs.itemListElement.length, 3);
      assert.equal(breadcrumbs.itemListElement[0].item, "https://www.gazaairport.com/");
      assert.equal(breadcrumbs.itemListElement[2].item, "https://www.gazaairport.com/airport/past");
    });

    it("classifies future concepts as CreativeWork concepts, not historical facts", () => {
      const concept = getCreativeWorkSchema({
        title: "Future Terminal Concept",
        description: "Architectural study for future civil aviation gateway.",
        url: "/airport/future",
        lang: "en",
      });
      assert.equal(concept["@type"], "CreativeWork");
      assert.equal(concept.genre, "Illustrative Architectural Concept");
      assert.equal("creator" in concept, false, "Do not invent an organization to attribute illustrative work");
    });
  });

  describe("Sitemap & Robots Build Pipeline", () => {
    it("defines exactly 20 public indexable route families (40 URLs)", () => {
      assert.equal(staticIndexableRoutes.length, 20);
      const xml = buildSitemapXml();

      // Exactly 40 loc entries
      const locMatches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
      assert.equal(locMatches.length, 40);

      // 20 EN, 20 AR
      const enUrls = locMatches.filter((u) => !new URL(u).pathname.startsWith("/ar"));
      const arUrls = locMatches.filter((u) => new URL(u).pathname.startsWith("/ar"));
      assert.equal(enUrls.length, 20);
      assert.equal(arUrls.length, 20);
    });

    it("ensures public/sitemap.xml exists and matches the 40 URLs with alternate links", () => {
      const sitemapPath = path.join(root, "public", "sitemap.xml");
      assert.ok(existsSync(sitemapPath), "public/sitemap.xml must exist");
      const content = readFileSync(sitemapPath, "utf8");

      const locs = [...content.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
      assert.equal(locs.length, 40);

      // Verify no private paths
      const forbidden = ["/admin", "/account", "/book", "/manage", "/check-in", "/boarding-pass", "/flight/", "/signin", "/register"];
      for (const loc of locs) {
        for (const p of forbidden) {
          assert.ok(!loc.includes(p), `Sitemap must not contain private path ${p}: ${loc}`);
        }
      }

      // Check hreflang links exist
      assert.ok(content.includes('hreflang="en"'));
      assert.ok(content.includes('hreflang="ar"'));
      assert.ok(content.includes('hreflang="x-default"'));
    });

    it("ensures public/robots.txt disallows all private surfaces and references sitemap.xml", () => {
      const robotsPath = path.join(root, "public", "robots.txt");
      assert.ok(existsSync(robotsPath), "public/robots.txt must exist");
      const content = readFileSync(robotsPath, "utf8");

      assert.ok(content.includes("Sitemap: https://www.gazaairport.com/sitemap.xml"));
      assert.ok(content.includes("Disallow: /admin"));
      assert.ok(content.includes("Disallow: /ar/admin"));
      assert.ok(content.includes("Disallow: /account"));
      assert.ok(content.includes("Disallow: /book"));
      assert.ok(content.includes("Disallow: /manage"));
      assert.ok(content.includes("Disallow: /check-in"));
      assert.ok(content.includes("Disallow: /signin"));
    });

    it("guarantees 100% parity between sitemap URLs and canonicalUrl helper for all 20 route families", () => {
      for (const entry of staticIndexableRoutes) {
        const enPath = entry.path === "" ? "/" : entry.path;
        const arPathExpected = `/ar${entry.path}`;

        const enCanonical = canonicalUrl(entry.path, "en");
        const arCanonical = canonicalUrl(entry.path, "ar");

        assert.equal(enCanonical, `https://www.gazaairport.com${enPath}`);
        assert.equal(arCanonical, `https://www.gazaairport.com${arPathExpected}`);
      }
    });
  });

  describe("Private Surfaces Head & Parameter Audit", () => {
    it("ensures zero PII or dynamic route parameters leak into head titles", () => {
      const routesDir = path.join(root, "src", "routes");
      const routeFiles = [
        "{-$locale}.book.tsx",
        "{-$locale}.booking-confirmation.$ref.tsx",
        "{-$locale}.manage.index.tsx",
        "{-$locale}.manage.$ref.tsx",
        "{-$locale}.manage.$ref_.check-in.tsx",
        "{-$locale}.manage.$ref_.contact.tsx",
        "{-$locale}.manage.$ref_.extras.tsx",
        "{-$locale}.manage.$ref_.seats.tsx",
        "{-$locale}.boarding-pass.$ref.$leg.$pax.tsx",
        "{-$locale}.account.trips.$ref.tsx",
        "{-$locale}.admin.bookings.$ref.tsx",
      ];

      for (const file of routeFiles) {
        const content = readFileSync(path.join(routesDir, file), "utf8");
        const headStart = content.indexOf("head:");
        const compStart = content.indexOf("component:");
        if (headStart !== -1 && compStart !== -1) {
          const headBlock = content.slice(headStart, compStart);
          assert.ok(
            !headBlock.match(/title:\s*[`"'].*params\.(ref|pax|id|flightId)/),
            `Route ${file} leaks parameter into title: ${headBlock}`,
          );
        }
      }
    });

    it("static svc1 head never substitutes compiled Schedule planning for local authority", () => {
      const route = readFileSync(path.join(root, "src/routes/{-$locale}.flight.$flightId.tsx"), "utf8");
      const head = route.slice(route.indexOf("head:"), route.indexOf("component:"));
      assert.doesNotMatch(head, /seedSchedules|parsedSvc|scheduleRepository|localStorage/);
      assert.match(head, /Flight details/);
      assert.match(head, /legacyFlightById/);
    });

    it("verifies noindex is set on all transactional, account and admin routes", () => {
      const routesDir = path.join(root, "src", "routes");
      const privateRoutes = [
        "{-$locale}.book.tsx",
        "{-$locale}.booking-confirmation.$ref.tsx",
        "{-$locale}.manage.index.tsx",
        "{-$locale}.manage.$ref.tsx",
        "{-$locale}.manage.$ref_.check-in.tsx",
        "{-$locale}.manage.$ref_.contact.tsx",
        "{-$locale}.manage.$ref_.extras.tsx",
        "{-$locale}.manage.$ref_.seats.tsx",
        "{-$locale}.check-in.tsx",
        "{-$locale}.boarding-pass.$ref.$leg.$pax.tsx",
        "{-$locale}.account.index.tsx",
        "{-$locale}.account.boarding-passes.tsx",
        "{-$locale}.account.preferences.tsx",
        "{-$locale}.account.profile.tsx",
        "{-$locale}.account.security.tsx",
        "{-$locale}.account.travelers.tsx",
        "{-$locale}.account.trips.index.tsx",
        "{-$locale}.account.trips.$ref.tsx",
        "{-$locale}.signin.tsx",
        "{-$locale}.register.tsx",
        "{-$locale}.forgot-password.tsx",
        "{-$locale}.reset-password.tsx",
        "{-$locale}.verify-email.tsx",
        "{-$locale}.$.tsx",
        "{-$locale}.access-denied.tsx",
      ];

      for (const file of privateRoutes) {
        const content = readFileSync(path.join(routesDir, file), "utf8");
        const headStart = content.indexOf("head:");
        const compStart = content.indexOf("component:");
        assert.ok(headStart !== -1, `${file} must define a head function`);
        const headBlock = content.slice(headStart, compStart !== -1 ? compStart : headStart + 500);
        assert.ok(
          headBlock.includes("noindex"),
          `${file} must specify noindex in its head function`,
        );
      }
    });
  });
});
