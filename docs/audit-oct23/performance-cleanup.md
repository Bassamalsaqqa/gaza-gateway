# October 23 public startup and cleanup review

Base: `6f52044b88e56b005bf11ee96b274580fd6d8a11`. No dependency changes or production changes.

## Implemented change

Admin dictionaries now load through the existing Admin route chunks, including standalone sign-in and recovery routes. Public translations remain synchronous. Three shared operational labels retain public fallbacks. The generated route tree was not edited.

## Independent measurement

`performance-measurements.json` records production-profile prerender builds before and after the change, using the same source base and dependencies. Values are unique script/modulepreload JavaScript references in HTML. Gzip is a local estimate, not measured network transfer or field Web Vitals.

| Surface | Before raw bytes | After raw bytes | Reduction | Before gzip | After gzip |
|---|---:|---:|---:|---:|---:|
| Home EN/AR | 1,565,568 | 1,438,046 | 127,522 | 429,560 | 395,430 |
| Flights | 1,431,609 | 1,304,087 | 127,522 | 405,553 | 371,430 |
| Admin EN/AR shell | 1,449,687 | 1,450,960 | -1,273 | 410,855 | 411,848 |

Admin dictionary markers are absent from initial public chunks and remain present in Admin. Both builds completed prerendering. Independently run TypeScript checking and 28 focused translation/catalog tests passed. Browser screenshots are a separate integration check; this measurement does not establish rendering parity by itself.

## Media and cleanup decisions

Approved ticket artwork and composition remain unchanged. The existing 1774 x 887 raster canvas is an asset coordinate system, not a new claim about physical print dimensions. Template conversion is deferred until pixel and print parity can be demonstrated in both browser and PHP renderers.

Frontend/backend template and font copies serve different deployed runtimes; keep both. Local Docker harness files remain useful despite production using shared hosting. No tracked assets, evidence, source or Git history were deleted.

`cleanup-manifest.csv` is an inventory, not a deletion receipt. Evidence removal requires an intact archive with hashes and an index plus explicit approval of exact paths. Historical capture scripts are UNKNOWN until their consumers are checked. Local reproducible dependency/build cleanup receipts are maintained with the audit integration branch.
