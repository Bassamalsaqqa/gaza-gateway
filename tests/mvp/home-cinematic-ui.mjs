import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE_URL = process.env.BASE_URL || 'http://192.168.1.118:5173';
const OUT = process.env.OUTPUT_DIR || 'scratch/home-glass-evidence';
fs.mkdirSync(OUT, { recursive: true });

const host = new URL(BASE_URL).hostname;
const isSafeHost = (h) => {
  if (h === 'localhost' || h === '127.0.0.1') return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if ([a, b, c, d].some((o) => o < 0 || o > 255)) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
};
if (!isSafeHost(host)) throw new Error(`Non-local BASE_URL rejected for safety: ${BASE_URL}`);

const receipt = { passed: false, scope: 'desktop Chromium local DEV visual/motion only; no backend certification', checks: [], errors: [], screenshots: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const contexts = [];
let apiCounter = 0;

const newCtx = async (opts = {}) => {
  const c = await browser.newContext({ ignoreHTTPSErrors: true, ...opts });
  contexts.push(c);
  await c.route((url) => url.pathname.startsWith('/api/'), async (r) => { apiCounter++; await r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"local-isolation"}' }); });
  return c;
};
const newTrackedPage = async (ctx) => {
  const p = await ctx.newPage(); p.setDefaultTimeout(10000); p.setDefaultNavigationTimeout(30000);
  p.on('pageerror', (err) => { receipt.errors.push(`PageError: ${err.message}`); process.exitCode = 1; });
  return p;
};

try {
  // 1. Responsive Viewports EN+AR: close each context immediately; backdrop clientWidth/height/top; footer stacking AND
  const viewports = [[320,568],[360,640],[375,667],[390,844],[414,896],[768,1024],[1024,600],[1280,720],[1366,768],[1440,900],[1920,1080],[844,390]];
  for (const locale of ['', '/ar']) {
    const lang = locale ? 'ar' : 'en';
    for (const [w,h] of viewports) {
      const ctx = await newCtx({ viewport: { width: w, height: h } });
      const page = await newTrackedPage(ctx);
      try {
        await page.goto(`${BASE_URL}${locale}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle');

        assert.equal(await page.locator('h1:visible').count(), 1, `[${lang}-${w}] Expected 1 visible H1`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `[${lang}-${w}] Overflow detected`);
        assert.ok(await page.locator('header').count() > 0, `[${lang}-${w}] Missing actual <header> element`);
        assert.ok(await page.locator('#home-booking').count() > 0, `[${lang}-${w}] Missing #home-booking`);
        const heroFit = await page.evaluate(() => {
          const hero = document.querySelector('h1')?.closest('section');
          const header = document.querySelector('header').getBoundingClientRect();
          const controls = hero ? [...hero.querySelectorAll('h1,p,a,button')].filter(el => el.getBoundingClientRect().height > 0) : [];
          const book = hero?.querySelector('a[href="#home-booking"]');
          const explore = hero?.querySelector('a[href$="/airport"]');
          return { complete: !!book && !!explore && controls.length > 0 && controls.every(el => { const r=el.getBoundingClientRect(); return r.top >= header.bottom - 1 && r.bottom <= innerHeight + 1; }),
            bottom: Math.max(0,...controls.map(el=>el.getBoundingClientRect().bottom)), height: innerHeight };
        });
        assert.ok(heroFit.complete, `[${lang}-${w}x${h}] Hero content/CTAs outside initial viewport: ${JSON.stringify(heroFit)}`);
        const hero=page.locator('section.home-hero-section');
        const manage=hero.locator('a[href$="/manage"]');
        assert.equal(await manage.count(),1,'Hero Manage booking action missing');
        const manageBox=await manage.boundingBox();
        assert.ok(manageBox.height>=44,'Hero Manage action is not a full-size button');
        assert.equal(await page.locator('#home-booking a[href$="/manage"]').count(),0,'Duplicate Manage button remains in booking section');
        const glass=await hero.locator('.home-frosted-glass').evaluate(el=>{
          const s=getComputedStyle(el); return {background:s.backgroundImage,border:s.borderTopWidth,blur:s.backdropFilter||s.webkitBackdropFilter};
        });
        assert.equal(glass.background,'none','Hero glass tint still uses a directional background');
        assert.equal(glass.border,'0px','Hero glass border returned');
        assert.ok(/blur\(/.test(glass.blur),'Hero glass is not frosted');
        const formGlass=await page.locator('#home-booking form').evaluate(el=>getComputedStyle(el).backdropFilter||getComputedStyle(el).webkitBackdropFilter);
        assert.ok(/blur\(/.test(formGlass),'Booking console glass missing');
        const pattern=await page.locator('#home-booking form img[data-decorative-asset="home-flight-search-ticket"]').evaluate(el=>({filter:getComputedStyle(el).filter,opacity:Number(getComputedStyle(el).opacity)}));
        assert.ok(/blur\(/.test(pattern.filter) && pattern.opacity>=0.3,'Restored booking canvas pattern is not visible/frosted');
        assert.ok(await page.locator('.home-flight-board-glass').count()>0,'Flight board frosted surface missing');
        assert.equal(await page.locator('[data-slot="home-cinematic-fixed-label"]').count(),0,'Removed cinematic HUD returned');
        assert.equal(await page.getByText('Visualized future concept generated with AI, not real-current conditions or live airport operations.',{exact:true}).count(),0,'Removed hero explanation returned');
        const chapterAlignment = await page.evaluate(() => {
          const links=[...document.querySelectorAll('main a')].filter(a => /\/airport\/(past|present|future)$/.test(a.getAttribute('href')??'') && a.querySelector('h3'));
          if(links.length!==3) return false;
          const boxes=links.map(a=>a.getBoundingClientRect());
          return innerWidth < 1024 || boxes.every(r=>Math.abs(r.top-boxes[0].top)<2 && Math.abs(r.height-boxes[0].height)<2);
        });
        assert.ok(chapterAlignment,`[${lang}-${w}] Three chapter cards missing or misaligned`);

        const backdrop = await page.evaluate(() => {
          const el = document.querySelector('[data-slot="home-cinematic-backdrop"]') || document.querySelector('video')?.closest('.fixed');
          if (!el) return null;
          const s = window.getComputedStyle(el); const r = el.getBoundingClientRect();
          const f = document.querySelector('footer'); const fs = f ? window.getComputedStyle(f) : null;
          return {
            pos: s.position, pe: s.pointerEvents, top: r.top, height: r.height, cHeight: window.innerHeight,
            widthDiff: Math.abs(r.width - document.documentElement.clientWidth),
            bZ: parseInt(s.zIndex || '0', 10), fZ: f ? parseInt(fs.zIndex || '0', 10) : -1, fPos: f ? fs.position : ''
          };
        });
        assert.ok(backdrop && backdrop.pos === 'fixed' && backdrop.pe === 'none', `[${lang}-${w}] Invalid backdrop styles`);
        assert.ok(backdrop.widthDiff <= 2, `[${lang}-${w}] Backdrop width must match clientWidth (diff: ${backdrop.widthDiff})`);
        assert.ok(Math.abs(backdrop.top) <= 1 && Math.abs(backdrop.height - backdrop.cHeight) <= 2, `[${lang}-${w}] Backdrop top/height invalid`);
        assert.ok(['relative', 'fixed', 'absolute'].includes(backdrop.fPos) && backdrop.fZ > backdrop.bZ, `[${lang}-${w}] Footer obscured: fPos relative/fixed/abs AND numeric fZ > bZ`);
        receipt.checks.push(`${lang}-${w}x${h} complete-hero aligned-chapters removed-HUD no-overflow fixed-backdrop footer-stacked`);

        if ([1440, 390].includes(w)) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(50);
          const heroShot = path.join(OUT, `${lang}-${w}-hero.png`);
          await page.screenshot({ path: heroShot, fullPage: false });
          receipt.screenshots.push(heroShot);

          for (const [sec, sel] of [['booking', '#home-booking'], ['heritage', 'section:has(a[href$="/airport/past"])'], ['footer', 'footer']]) {
            const loc = page.locator(sel).first();
            assert.ok(await loc.count() > 0, `[${lang}-${w}] Required section missing for screenshot: ${sel}`);
            await loc.scrollIntoViewIfNeeded(); await page.waitForTimeout(50);
            const shot = path.join(OUT, `${lang}-${w}-${sec}.png`);
            await page.screenshot({ path: shot, fullPage: false }); receipt.screenshots.push(shot);
          }
        }
      } finally {
        await ctx.close().catch(() => {});
      }
    }
  }

  // 2. Timeline scrubbing & asset selection (720p desktop, 540p mobile, Range deduplication, no frame WebP)
  const mp4s = []; const webps = [];
  const deskCtx = await newCtx({ viewport: { width: 1440, height: 900 } });
  deskCtx.on('request', (r) => { if (r.url().includes('.mp4')) mp4s.push(r.url()); if (r.url().includes('.webp')) webps.push(r.url()); });
  const dPage = await newTrackedPage(deskCtx);
  await dPage.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await dPage.waitForLoadState('networkidle');

  const vLoc = dPage.locator('[data-slot="home-cinematic-backdrop"] video, video').first();
  await vLoc.waitFor({ state: 'attached' });
  await dPage.waitForFunction(() => { const v = document.querySelector('video'); return v && v.readyState >= 1 && v.duration > 0; });
  const src = await vLoc.evaluate((v) => v.currentSrc || v.src);
  assert.ok(src.includes('720p') || src.includes('desktop'), `Expected 720p on 1440px, got ${src}`);
  assert.equal(new Set(mp4s.map((u) => u.split('?')[0])).size, 1, 'Multiple MP4 assets requested on desktop');
  assert.equal(webps.filter((u) => /frame_\d+\.webp/.test(u)).length, 0, 'Frame WebP sequence requested on Home');

  let heroTime = 0;
  for (const frac of [0, 0.2, 0.5, 0.85, 1, 0.25]) {
    const { actualProgress } = await dPage.evaluate(async (f) => {
      const doc = document.scrollingElement || document.documentElement; const max = doc.scrollHeight - window.innerHeight;
      window.scrollTo({ top: Math.round(f * max), behavior: 'instant' });
      return { actualProgress: max > 0 ? (window.scrollY || doc.scrollTop) / max : 0 };
    }, frac);
    await dPage.waitForFunction((prog) => {
      const v = document.querySelector('video');
      if (!v || v.readyState < 2 || v.seeking) return false;
      return Math.abs(v.currentTime - Math.min(v.duration - 0.05, prog * v.duration)) < 0.15;
    }, actualProgress, { timeout: 10000 });
    const { cur, vSrc, top, bot, viewportHeight } = await dPage.evaluate(() => {
      const v = document.querySelector('video'); const r = v.getBoundingClientRect();
      return { cur: v.currentTime, vSrc: v.currentSrc || v.src, top: r.top, bot: r.bottom, viewportHeight: innerHeight };
    });
    if (frac === 0) heroTime = cur;
    if (frac >= 0.5) assert.ok(cur > heroTime, `Progress ${frac} did not advance past hero`);
    assert.equal(vSrc, src, 'Video source changed during scroll');
    if (frac === 1) assert.ok(top <= 10 && bot >= viewportHeight - 10, 'Video not fixed in viewport at footer');
    receipt.checks.push(`Scroll ${frac} progress ${actualProgress.toFixed(2)} currentTime ${cur.toFixed(2)}`);
  }

  // 3. Dynamic Height Append without window resize -> ResizeObserver recalculates target
  await dPage.evaluate(() => window.scrollTo({ top: (document.scrollingElement.scrollHeight - innerHeight) * 0.45, behavior: 'instant' }));
  const before = await dPage.evaluate(() => {
    const doc = document.scrollingElement || document.documentElement; const v = document.querySelector('video');
    const max = doc.scrollHeight - window.innerHeight;
    return { scrollY: window.scrollY, progress: max > 0 ? window.scrollY / max : 0, dur: v.duration };
  });
  await dPage.waitForFunction((exp) => {
    const v = document.querySelector('video'); return v && v.readyState >= 2 && !v.seeking && Math.abs(v.currentTime - exp) < 0.15;
  }, Math.min(before.dur - 0.05, before.progress * before.dur));

  try {
    await dPage.evaluate(() => {
      const el = document.createElement('div'); el.id = 'agy-tall-test'; el.style.height = '3500px'; el.style.pointerEvents = 'none';
      (document.querySelector('main') || document.body).appendChild(el);
    });
    const after = await dPage.evaluate(() => {
      const doc = document.scrollingElement || document.documentElement; const v = document.querySelector('video');
      const max = doc.scrollHeight - window.innerHeight; const prog = max > 0 ? window.scrollY / max : 0;
      return { exp: Math.min(v.duration - 0.05, prog * v.duration), scrollY: window.scrollY };
    });
    assert.equal(after.scrollY, before.scrollY, 'scrollY changed during DOM append');
    await dPage.waitForFunction((exp) => {
      const v = document.querySelector('video'); return v && v.readyState >= 2 && !v.seeking && Math.abs(v.currentTime - exp) < 0.15;
    }, after.exp, { timeout: 10000 });
    receipt.checks.push('ResizeObserver updated currentTime upon DOM height expansion');
  } finally {
    await dPage.evaluate(() => document.getElementById('agy-tall-test')?.remove());
  }

  // Fresh mobile 390px context: asset selection 540p, single asset, no canvas/frame webp
  const mMp4s = []; const mWebps = [];
  const mCtx = await newCtx({ viewport: { width: 390, height: 844 } });
  mCtx.on('request', (r) => { if (r.url().includes('.mp4')) mMp4s.push(r.url()); if (r.url().includes('.webp')) mWebps.push(r.url()); });
  const mPage = await newTrackedPage(mCtx);
  await mPage.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await mPage.waitForLoadState('networkidle');
  await mPage.waitForFunction(() => document.querySelector('video')?.readyState >= 1);
  const mSrc = await mPage.evaluate(() => document.querySelector('video')?.currentSrc || document.querySelector('video')?.src);
  assert.ok(mSrc.includes('540p') || mSrc.includes('standard'), `Expected 540p on 390px, got ${mSrc}`);
  assert.equal(new Set(mMp4s.map((u) => u.split('?')[0])).size, 1, 'Multiple MP4 assets requested on 390px');
  assert.equal(mWebps.filter((u) => /frame_\d+\.webp/.test(u)).length, 0, 'Frame WebP requested on 390px Home');
  await mCtx.close().catch(() => {});
  receipt.checks.push('Mobile 390px selected 540p MP4 asset with 1 unique URL');

  // 4. SPA Home -> Future by actual link & direct clean context isolation
  const futureLink = dPage.locator('a[href$="/airport/future"]').first();
  assert.ok(await futureLink.count() > 0, 'Missing exact a[href$="/airport/future"] link on Home');
  await futureLink.click();
  await dPage.waitForURL((u) => u.pathname.endsWith('/airport/future'));
  await dPage.waitForLoadState('networkidle');
  await dPage.waitForTimeout(200);
  const mp4CountOnFuture = mp4s.length;
  await dPage.waitForTimeout(300);
  assert.equal(mp4s.length, mp4CountOnFuture, 'New MP4 requests arrived while settled on Future');

  assert.equal(await dPage.locator('video').count(), 0, 'Video element exists on Future');
  assert.equal(await dPage.locator('[data-slot="home-cinematic-backdrop"]').count(), 0, 'Backdrop element exists on Future');
  assert.equal(await dPage.locator('.home-cinematic-frame').count(), 0, 'home-cinematic-frame leaked onto Future');
  assert.ok(await dPage.locator('main h2').count() >= 3, 'Future h2 chapter titles missing in main');
  assert.equal(await dPage.locator('main [data-slot="airport-chapter-rail"] a[aria-current="page"][href$="/airport/future"]').count(), 1, 'Future active chapter rail missing in main');
  assert.equal(await dPage.locator('h1:visible').count(), 1, 'Future H1 missing');

  // SPA back to Home: resume accurate target
  const brandLink = dPage.locator('header a[href="/"], header a[aria-label*="Home"]').first();
  await brandLink.click();
  await dPage.waitForURL((u) => u.pathname === '/' || u.pathname === '');
  await dPage.waitForFunction(() => { const v = document.querySelector('video'); return v && v.readyState >= 2 && !v.seeking; }, { timeout: 10000 });
  receipt.checks.push('SPA roundtrip Home->Future->Home clean isolation');

  // Direct clean Future context EN+AR: zero MP4 requests across entire session
  for (const fUrl of ['/airport/future', '/ar/airport/future']) {
    const fMp4s = []; const cCtx = await newCtx();
    cCtx.on('request', (r) => { if (r.url().includes('.mp4')) fMp4s.push(r.url()); });
    const fPage = await newTrackedPage(cCtx);
    await fPage.goto(`${BASE_URL}${fUrl}`, { waitUntil: 'domcontentloaded' });
    await fPage.waitForLoadState('networkidle');
    assert.equal(fMp4s.length, 0, `Direct ${fUrl} made MP4 requests`);
    assert.equal(await fPage.locator('video').count(), 0, `Video found on direct ${fUrl}`);
    assert.equal(await fPage.locator('.home-cinematic-frame').count(), 0, `home-cinematic-frame found on direct ${fUrl}`);
    assert.ok(await fPage.locator('main h2').count() >= 3, `Future chapters missing on direct ${fUrl}`);
    await cCtx.close().catch(() => {});
    receipt.checks.push(`Direct ${fUrl} clean zero-video zero-MP4 chapters-present`);
  }

  // 5. Policy fallbacks: reduced-motion, Save-Data, deviceMemory <= 2, error abort, matchMedia flip, simulated visibility, noJS
  const redCtx = await newCtx({ reducedMotion: 'reduce' });
  const redMp4s = [];
  redCtx.on('request', (r) => { if (r.url().includes('.mp4')) redMp4s.push(r.url()); });
  const rPage = await newTrackedPage(redCtx);
  await rPage.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await rPage.waitForLoadState('networkidle');
  assert.equal(redMp4s.length, 0, 'prefers-reduced-motion made MP4 requests');
  assert.equal(await rPage.locator('video').count(), 0, 'Video rendered under reduced-motion');
  assert.ok(await rPage.locator('img[src*="poster"], [data-slot="home-cinematic-backdrop"] img').first().isVisible(), 'Poster not visible under reduced motion');
  await redCtx.close().catch(() => {});
  receipt.checks.push('prefers-reduced-motion poster fallback');
  const saveCtx = await newCtx();
  await saveCtx.addInitScript(() => { Object.defineProperty(navigator, 'connection', { value: { saveData: true } }); });
  const sMp4s = [];
  saveCtx.on('request', (r) => { if (r.url().includes('.mp4')) sMp4s.push(r.url()); });
  const sPage = await newTrackedPage(saveCtx);
  await sPage.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await sPage.waitForLoadState('networkidle');
  assert.equal(sMp4s.length, 0, 'SaveData made MP4 requests');
  assert.equal(await sPage.locator('video').count(), 0, 'Video rendered under SaveData');
  await saveCtx.close().catch(() => {});
  const memCtx = await newCtx();
  await memCtx.addInitScript(() => { Object.defineProperty(navigator, 'deviceMemory', { value: 2 }); });
  const mMp4s2 = [];
  memCtx.on('request', (r) => { if (r.url().includes('.mp4')) mMp4s2.push(r.url()); });
  const mPage2 = await newTrackedPage(memCtx);
  await mPage2.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await mPage2.waitForLoadState('networkidle');
  assert.equal(mMp4s2.length, 0, 'deviceMemory<=2 made MP4 requests');
  assert.equal(await mPage2.locator('video').count(), 0, 'Video rendered under deviceMemory<=2');
  await memCtx.close().catch(() => {});
  // Error abort: wait until video element is removed or hidden and poster displayed
  let errMp4Attempts = 0;
  const errCtx = await newCtx();
  await errCtx.route('**/*.mp4', (r) => { errMp4Attempts++; r.abort('failed'); });
  const errPage = await newTrackedPage(errCtx);
  await errPage.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await errPage.waitForLoadState('networkidle');
  await errPage.waitForFunction(() => {
    const v = document.querySelector('video'); const p = document.querySelector('img[src*="poster"], [data-slot="home-cinematic-backdrop"] img');
    return !v && p && window.getComputedStyle(p).opacity === '1';
  });
  assert.ok(errMp4Attempts > 0, 'No MP4 requests attempted before error abort');
  await errCtx.close().catch(() => {});
  receipt.checks.push('Decoder error gracefully removes video and displays poster');

  // Live matchMedia preference flip
  const flipCtx = await newCtx({ reducedMotion: 'no-preference' });
  const flipPage = await newTrackedPage(flipCtx);
  await flipPage.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await flipPage.waitForFunction(() => document.querySelector('video')?.readyState >= 1);
  await flipPage.emulateMedia({ reducedMotion: 'reduce' });
  await flipPage.waitForFunction(() => !document.querySelector('video') || window.getComputedStyle(document.querySelector('video')).display === 'none');
  await flipPage.emulateMedia({ reducedMotion: 'no-preference' });
  await flipPage.waitForFunction(() => document.querySelector('video')?.readyState >= 2 && !document.querySelector('video').seeking);
  await flipCtx.close().catch(() => {});
  receipt.checks.push('Live matchMedia preference flip toggles video/poster correctly');

  // Fresh context simulated hidden initial Home: no video, no MP4 until visible
  const hidMp4s = []; const hidCtx = await newCtx();
  await hidCtx.addInitScript(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); });
  hidCtx.on('request', (r) => { if (r.url().includes('.mp4')) hidMp4s.push(r.url()); });
  const hidPage = await newTrackedPage(hidCtx);
  await hidPage.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await hidPage.waitForLoadState('networkidle');
  await hidPage.waitForTimeout(200);
  assert.equal(await hidPage.locator('video').count(), 0, 'Video rendered while initially hidden');
  assert.equal(hidMp4s.length, 0, 'MP4 requested while initially hidden');
  await hidPage.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await hidPage.waitForFunction(() => { const v = document.querySelector('video'); return v && v.readyState >= 1; }, { timeout: 10000 });
  await hidCtx.close().catch(() => {});
  receipt.checks.push('Simulated visibilitychange initial-hidden pause and visible recovery verified');

  // noJS SSR EN+AR: actual native a[href$="/book"] AND section #home-booking AND actual poster img AND footer AND 1 H1
  const noJsCtx = await newCtx({ javaScriptEnabled: false });
  for (const loc of ['', '/ar']) {
    const nPage = await noJsCtx.newPage();
    await nPage.goto(`${BASE_URL}${loc}/`, { waitUntil: 'domcontentloaded' });
    assert.equal(await nPage.locator('h1').count(), 1, `noJS ${loc} missing H1`);
    assert.equal(await nPage.locator('video').count(), 0, `noJS ${loc} has video element`);
    assert.ok(await nPage.locator('img[src*="poster"], [data-slot="home-cinematic-backdrop"] img').count() > 0, `noJS ${loc} missing poster img`);
    assert.ok(await nPage.locator('#home-booking').count() > 0, `noJS ${loc} missing #home-booking section`);
    assert.ok(await nPage.locator('a[href$="/book"]').count() > 0, `noJS ${loc} missing native a[href$="/book"] link`);
    assert.ok(await nPage.locator('footer').count() > 0, `noJS ${loc} missing footer`);
    receipt.checks.push(`noJS ${loc || 'en'} poster, booking link/section, and footer verified`);
  }
  await noJsCtx.close().catch(() => {});

  // 6. Keyboard jump to #home-booking, unconditional hit-test, LTR sample, scroll API count stability
  const kCtx = await newCtx({ viewport: { width: 1440, height: 900 } });
  const kPage = await newTrackedPage(kCtx);
  await kPage.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await kPage.waitForLoadState('networkidle');

  const jumpLink = kPage.locator('a[href="#home-booking"]');
  assert.ok(await jumpLink.count() > 0, 'Required hero jump link a[href="#home-booking"] is absent');
  await jumpLink.first().focus();
  await kPage.keyboard.press('Enter');
  await kPage.waitForFunction(() => {
    const b = document.getElementById('home-booking');
    return b && (document.activeElement === b || b.contains(document.activeElement));
  }, { timeout: 5000 });
  assert.ok(await kPage.evaluate(() => {
    const b = document.getElementById('home-booking'); return document.activeElement === b || b.contains(document.activeElement);
  }), 'Keyboard Enter on jump link must focus #home-booking');
  receipt.checks.push('Hero keyboard Enter jump navigates and focuses #home-booking');

  // Hit-test real input and submit buttons inside booking with scrollIntoViewIfNeeded
  const inputLoc = kPage.locator('#home-booking input, #home-booking button[role="combobox"]').first();
  const btnLoc = kPage.locator('#home-booking button[type="submit"]').first();
  assert.ok(await inputLoc.count() > 0 && await btnLoc.count() > 0, 'Required booking input and submit controls missing');
  await inputLoc.scrollIntoViewIfNeeded();
  await btnLoc.scrollIntoViewIfNeeded();
  const hit = await kPage.evaluate(() => {
    const input = document.querySelector('#home-booking input') || document.querySelector('#home-booking button[role="combobox"]');
    const btn = document.querySelector('#home-booking button[type="submit"]');
    const ir = input.getBoundingClientRect(); const br = btn.getBoundingClientRect();
    const it = document.elementFromPoint(ir.x + ir.width / 2, ir.y + ir.height / 2);
    const bt = document.elementFromPoint(br.x + br.width / 2, br.y + br.height / 2);
    const bd = document.querySelector('[data-slot="home-cinematic-backdrop"]');
    const obscured = bd && (bd === it || bd.contains(it) || bd === bt || bd.contains(bt));
    return { ok: !obscured && (input.contains(it) || it?.contains(input)) && (btn.contains(bt) || bt?.contains(btn)) };
  });
  assert.ok(hit.ok, 'Booking controls obscured by backdrop during hit-test');
  receipt.checks.push('Booking input and submit controls receive hit-test without backdrop obstruction');

  // Arabic technical ID LTR check & scroll API call stability after settle
  const arCtx = await newCtx({ viewport: { width: 1440, height: 900 } });
  const arPage = await newTrackedPage(arCtx);
  await arPage.goto(`${BASE_URL}/ar/`, { waitUntil: 'domcontentloaded' });
  await arPage.waitForLoadState('networkidle');
  await arPage.waitForTimeout(200);

  const ltrOk = await arPage.evaluate(() => {
    const codes = Array.from(document.querySelectorAll('.code-id, [dir="ltr"]'));
    return codes.length > 0 && codes.every((el) => window.getComputedStyle(el).direction === 'ltr');
  });
  assert.ok(ltrOk, 'Arabic technical identifiers missing or not computed direction: ltr');
  receipt.checks.push('Arabic technical identifiers verified LTR');

  // Scroll API call counter stability
  const apiBeforeScroll = apiCounter;
  for (let i = 0; i < 6; i++) {
    await arPage.evaluate((step) => {
      const doc = document.scrollingElement || document.documentElement;
      window.scrollTo(0, step % 2 === 0 ? doc.scrollHeight : 0);
    }, i);
    await arPage.waitForTimeout(50);
  }
  await arPage.waitForTimeout(200);
  assert.equal(apiCounter, apiBeforeScroll, `API counter increased during rapid scroll: ${apiCounter} vs ${apiBeforeScroll}`);
  receipt.checks.push('Zero API requests generated by scroll activity');
  await arPage.evaluate(()=>scrollTo(0,(document.scrollingElement.scrollHeight-innerHeight)*0.7));
  const backTop=arPage.locator('button:has(circle[pathLength="1"])');
  await arPage.waitForFunction(()=>{
    const button=document.querySelector('circle[pathLength="1"]')?.closest('button');
    return button && getComputedStyle(button).opacity==='1';
  });
  const backStyle=await backTop.evaluate(button=>({background:getComputedStyle(button).backgroundColor,
    arrow:Number(button.querySelector('svg.lucide-arrow-up')?.getAttribute('stroke-width')),
    ring:Number(button.querySelector('circle[pathLength="1"]').getAttribute('stroke-width')),
    progress:Number(button.querySelector('circle[pathLength="1"]').getAttribute('stroke-dashoffset'))}));
  assert.equal(backStyle.background,'rgba(0, 0, 0, 0)','Back-to-top disc background returned');
  assert.ok(backStyle.arrow>=4 && backStyle.ring>=4,'Back-to-top strokes are too thin');
  assert.ok(backStyle.progress>0.2 && backStyle.progress<0.4,'Back-to-top progress incorrect');
  await arPage.emulateMedia({reducedMotion:'reduce'}); await backTop.click();
  await arPage.waitForFunction(()=>scrollY<2);
  receipt.checks.push('Transparent thick-stroke back-to-top shows actual progress and returns to top');
  await arCtx.close().catch(() => {});

  receipt.passed = receipt.errors.length === 0;
  console.log(`PASS: ${receipt.checks.length} checks succeeded.`);
} catch (err) {
  receipt.errors.push(err.message); process.exitCode = 1; console.error(`FAIL: ${err.message}`);
} finally {
  if (receipt.errors.length > 0 || !receipt.passed) process.exitCode = 1;
  fs.writeFileSync(path.join(OUT, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  for (const c of contexts) await c.close().catch(() => {});
  await browser.close().catch(() => {});
}
