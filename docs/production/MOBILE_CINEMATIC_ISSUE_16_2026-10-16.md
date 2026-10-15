# Issue #16: mobile cinematic source handback

Local feature branch: `fix/mobile-cinematic-viewport`, based on main
`47c64df8d65935cc77487bda753dbbca6a2470b3`. This record is source review evidence,
not authorization or certification of a production update. Production was untouched.

## Cause and change

The existing mobile video and all fallback posters used `object-contain`, leaving
most portrait screens empty. The master also contains 24-pixel baked black bands
at the top and bottom of the 1280 × 720 frame. Cover alone cannot reliably remove
those bands in wide landscape viewports.

Two silent, faststart H.264 derivatives and matching first-frame WebP posters now
come directly from the immutable master (`ec8b8b5f…`, 8 seconds, 24 fps). No invented
imagery, stretching, blurred fill, interpolation or audio is added. All hashes,
dimensions, source crop coordinates and byte counts are pinned in
`src/lib/media/cinematic-manifest.ts`; existing desktop media remain byte-identical.

| Framing | Master crop (x, y, width, height) | Output | MP4 bytes | Poster bytes |
| --- | --- | --- | ---: | ---: |
| Portrait phone | 562, 24, 378, 672 | 378 × 672 | 1,502,795 | 43,448 |
| Landscape / wider tablet | 0, 24, 1280, 672 | 960 × 504 | 2,925,325 | 79,120 |

The phone crop keeps the terminal canopy, pedestrian frontage and control tower
together across daylight (0.8s), sunset (3s) and night (7.2s), reviewed as actual
master extracts. A portrait viewport necessarily excludes the distant wings and
much of the apron. Existing foreground cards and header can overlap the film;
they were not redesigned in this task.

Portrait phones below 640px select the phone crop. Landscape phones and tablets
640–1023px select the clean wide crop. The initial screenshot pass showed that
using the phone crop on a 768px portrait tablet cut off too much of the tower, so
that selection was corrected and visually rechecked. Desktop ≥1024px keeps the
original 720p source. Picture sources and the renderer share the same queries.

Video, initial/static/error posters and Suspense loading posters use cover with
center positioning. The fixed inset backdrop follows the viewport without safe
area padding; homepage-only `viewport-fit=cover` and foreground safe-area insets
protect controls. Browser chrome height changes do not replace the decoder.
Meaningful source changes key a new inner renderer, clear readiness synchronously,
release the old source and seek the current scroll target before revealing it.
Existing deadlines, latest-target coalescing, presented-frame guard, visibility
cleanup and capability/preference fallbacks remain in place.

## Focused verification

AGY implemented the bounded component work and a correction pass. Codex reviewed
the actual diff, authored/hashed the media, corrected the tablet framing rule and
independently ran these checks:

```powershell
node --test --experimental-strip-types tests/unit/cinematic-manifest.test.ts tests/unit/cinematic-mobile-viewport.test.ts
node node_modules/typescript/bin/tsc --noEmit
git diff --check
```

Result: **8 tests pass**, TypeScript exits 0, whitespace check passes. FFmpeg
decoded both complete derivatives; each has 48 keyframes (GOP 4), 192 frames,
24 fps, 8 seconds, square pixels and no audio. Tests inspect real asset hashes,
sizes and MP4 top-level `moov` before `mdat` faststart ordering.

Connected Edge browser checks used the actual source cinematic components over
loopback, with current read-only production EN/AR homepage markup and CSS as
foreground context. No production API mutation or mock booking functionality was
introduced. This fixture isolates media behavior; it is not a full application
build or a booking regression test.

Observed loaded videos: `readyState=4`, opacity 1, cover fit, correct source and
viewport-sized element, with no unhandled media/page errors in normal cases:

| Viewport | Locale / evidence |
| --- | --- |
| 320 × 568 | EN phone crop |
| 390 × 844 | EN and AR phone crop; continuous late scroll |
| 414 × 896 | AR phone crop |
| 844 × 390 | EN and AR clean wide crop; AR 90% scroll seeks ≈7.2s |
| 932 × 430 | AR clean wide crop |
| 768 × 1024 | EN clean wide crop after composition correction |
| 1280 × 720 | EN original desktop 720p source |

Live portrait→landscape→portrait resizing released the previous source (`src=null`,
pause count 1, load count 2) and left one connected decoder. A 390×844→390×780
height-only resize retained that decoder and load count. Scroll progress is
recomputed against the resized document, so its normalized fraction may change
when responsive foreground layout changes; the new video follows that fraction.

The existing controlled native-seek fixture was run through the connected browser
on final source: **7 checks pass** with presented-frame callbacks and **4 checks
pass** without them. These cover restored 75% scroll, withholding native frame 0,
rejecting an old 6s frame after a newer 2s target, revealing the actual target,
source cleanup, canceled/stale callbacks and bounded timeout fallback. Visibility
teardown was exercised through the renderer's existing near/hidden lifecycle
fixture; this is not a physical mobile tab-return certification.

Save-Data, ≤2GB memory and reduced-motion capability inputs were injected only in
the local harness: each showed the cover poster with **zero MP4 requests**. A real
missing-media response produced native `error`, static cover fallback and decoder
cleanup. An unhydrated SSR-only AR landscape page selected its matching cover
poster without the application client module. Browser JavaScript was not globally
disabled for that check.

Local screenshots, diagnostic JSON and native-frame receipts are retained under
`scratch/evidence/` in this worktree. The disposable preview scripts are
`scratch/mobile-preview.mjs` and `scratch/readiness-preview.mjs`. Before screenshots
were taken read-only against production; after screenshots show local changes.
No browser screenshots have been fabricated or retouched.

## Asset reproduction

Using the owner's unchanged master and installed FFmpeg 7.1.1, encode with:

```text
ffmpeg -i Gaza-Airport-Video.mp4 -an -vf "crop=378:672:562:24,setsar=1" -c:v libx264 -preset slow -crf 25 -pix_fmt yuv420p -g 4 -keyint_min 4 -sc_threshold 0 -movflags +faststart mobile-portrait.mp4
ffmpeg -i Gaza-Airport-Video.mp4 -an -vf "crop=1280:672:0:24,scale=960:504,setsar=1" -c:v libx264 -preset slow -crf 25 -pix_fmt yuv420p -g 4 -keyint_min 4 -sc_threshold 0 -movflags +faststart mobile-landscape.mp4
ffmpeg -i mobile-portrait.mp4 -frames:v 1 -c:v libwebp -quality 82 mobile-portrait.webp
ffmpeg -i mobile-landscape.mp4 -frames:v 1 -c:v libwebp -quality 82 mobile-landscape.webp
```

Hash output bytes before assigning the manifest's content-addressed directories;
different encoder builds may produce different bytes. The originals stay local.

## Remaining release boundary

Physical iPhone Safari / Android Chrome decoding, real browser chrome, notches and
rotation remain owner device checks; desktop responsive viewports cannot certify
those. Safe-area CSS was inspected, not tested on physical cutout hardware.
No build, ZIP, push, merge, Actions, staging, backend, database, authentication or
production change occurred in this task.

Before a separately authorized release, review/integrate the pending incident
installer public-directory permission correction from the sibling incident branch;
this frontend branch deliberately does not absorb that backend/tooling work.
Otherwise new media directories risk repeating issue #14's 0700 extraction failure.
Use the established source-pinned guarded release process, verify new public
directories/files are 0755/0644, and check HTTP MP4 Range/206, poster and exact
hashes after owner-authorized installation. Do not rerun the original upgrade or
clear its attempt marker. Production certification issue #15 remains separate.
