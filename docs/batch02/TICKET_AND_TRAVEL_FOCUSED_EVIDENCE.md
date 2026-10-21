# Batch 02 focused evidence (local, uncommitted)

Baseline: `55dfa645e59e66c2da03744673fbb212a5077d51`.

## Ticket

Approved template retained byte for byte: SHA-256 `755265480b37f332b0a102a4120a8c504049330fb46573bffbc227dd0e13dec4`.
Actual browser canvas: 1774 x 887 pixels; displayed 1068 x 534 CSS pixels (2:1).
Two concurrent ticket instances reached ready; shared immutable image preload prevents one instance overwriting another image-load listener. Explicit bundled Latin and Arabic font loading precedes paint/export.
Owner supplied the actual Arabic PNG export; `evidence/ticket-export-ar.png` is 1774 x 887 RGBA, SHA-256 `72c31a7cf71264b110886e52dea5f093f868167c3e8c6f21054ff218755cde9c`. Stub text is inset from the perforation following inspection of the first export. Source artwork is unchanged.

A4 portrait and landscape were exported from installed headless Chrome using disposable local profiles and the actual canvas component with synthetic booking-shaped inputs. No TLS bypass or production access. Portrait fits two passes on one page; landscape preserves one pass per page. PDFium page and image measurements are in `evidence/ticket-pdf-measurements.json`: A4 page sizes within Chrome rounding, original image pixels 1774 x 887; measured printed rectangle approximately 190.24 x 94.99 mm (2.0028:1). Screen-only shadow disabled in print. Rendered pages inspected: no clipping, stretching or broken perforation.

Modal open/close observed, with focus returning to its trigger after dismissal. PNG download produced the actual owner-supplied file. Browser download-event waiter timed out despite the successful download; the file itself is the evidence.

Responsive viewport capability did not apply its requested 390 x 844 override: actual DOM remained 1528 x 682. Do not label desktop screenshots mobile evidence. Switched to the owner-authorized Playwright MCP browser: actual viewport 390 x 844, document scrollWidth 375 (no horizontal page overflow). Both EN/AR measured 343.2 x 171.6 CSS-pixel ticket previews, with two ready 1774 x 887 canvases. Viewer measured 760 x 380 canvas inside 341-pixel horizontally scrollable region. ArrowRight advanced scrollLeft from 0 to 13.6; Escape closed the dialog and focus returned to the full-size trigger. Actual EN/AR mobile and viewer screenshots were inspected and saved under evidence/. Mobile uses the separate full-name/trip summary below the pass.

## Travel

Real native clicks (not locator auto-scroll) preserved exact scroll position:

- EN at y=969.5999756: baggage -> documents -> Back retained y.
- AR at y=1195.1999512: prepare -> documents -> Back retained y.

Query URLs and selected panels changed correctly. Earlier locator-click displacement was the automation's own scrolling to a sticky target; it must not be confused with a product defect.

## Focused local checks

Ticket presentation plus travel guide: 65 tests passed. Scoped ticket component ESLint clean. These are source checks, not full-stack acceptance. Backend document parity, archive, destination migration and guided-booking integration remain under review; no build/release certification is claimed here.

## Backend document check (2026-10-21)

Independent PHP 8.4 container run against the integrated source: `DocumentRendererTest.php` and `TicketEmailPresentationTest.php` passed **29 tests / 199 assertions**. The harness physically copied application code and the isolated document worker's vendor directory to `/app` so the integration checkout's historical vendor junction could not redirect autoloading. An earlier junction-mounted attempt failed at autoload and is not counted as application evidence. This check precedes the final bounded attachment/capture corrections; those require their own focused checks.
