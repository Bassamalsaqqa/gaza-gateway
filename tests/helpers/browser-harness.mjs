import { chromium } from "playwright-core";
import { DEFAULT_TEST_NOW } from "./test-clock.mjs";

export function externalResponse(url, origin) {
  const parsed = new URL(url);
  if (["data:", "blob:", "about:"].includes(parsed.protocol) || parsed.origin === origin) return null;
  if (parsed.hostname === "fonts.googleapis.com") return { status: 200, contentType: "text/css", body: "/* Offline test: use accepted fallback fonts. */" };
  if (parsed.hostname === "fonts.gstatic.com") return { status: 204, body: "" };
  if (["www.youtube.com", "www.youtube-nocookie.com"].includes(parsed.hostname)) return { status: 200, contentType: "text/html", body: "<!doctype html><title>External video test boundary</title>" };
  throw new Error(`Unexpected external request: ${parsed.origin}${parsed.pathname}`);
}

export async function launchSmokeBrowser(baseUrl) {
  const channel = process.env.SMOKE_BROWSER;
  if (channel && !["chromium", "msedge", "chrome"].includes(channel)) throw new Error(`Unknown SMOKE_BROWSER: ${channel}`);
  // CI explicitly selects the Playwright-managed browser. Local use prefers installed browsers.
  const candidates = channel ? [channel] : ["msedge", "chrome", "chromium"];
  let browser;
  const failures = [];
  for (const candidate of candidates) {
    try {
      browser = await chromium.launch({ headless: true, ...(candidate === "chromium" ? {} : { channel: candidate }) });
      console.log(`Smoke browser: ${candidate}`);
      break;
    } catch (error) { failures.push(`${candidate}: ${error.message}`); }
  }
  if (!browser) throw new Error(`No smoke browser available. Run npm exec playwright-core install chromium.\n${failures.join("\n")}`);
  const errors = [];
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async options => {
    const context = await newContext({ timezoneId: "UTC", serviceWorkers: "block", ...options });
    const now = process.env.TEST_NOW ?? DEFAULT_TEST_NOW;
    await context.addInitScript(value => {
      const NativeDate = Date, epoch = NativeDate.parse(value);
      window.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [epoch])); }
        static now() { return epoch; }
      };
    }, now);
    // Existing fixtures assume Storage exists. Run their function scripts only on the app origin,
    // including newly opened same-origin tabs, never on Playwright's initial about:blank document.
    const addInitScript = context.addInitScript.bind(context);
    context.addInitScript = async (script, argument) => {
      if (typeof script !== "function") return addInitScript(script, argument);
      return addInitScript({ content: `if (location.origin === ${JSON.stringify(new URL(baseUrl).origin)}) { (${script.toString()})(${JSON.stringify(argument) ?? "undefined"}); }` });
    };
    await context.route("**/*", async route => {
      try {
        const response = externalResponse(route.request().url(), new URL(baseUrl).origin);
        if (response) await route.fulfill(response);
        else await route.continue();
      } catch (error) { errors.push(error.message); await route.abort(); }
    });
    context.on("page", page => page.on("pageerror", error => errors.push(`${page.url()}: ${error.message}`)));
    return context;
  };
  return { browser, errors };
}
