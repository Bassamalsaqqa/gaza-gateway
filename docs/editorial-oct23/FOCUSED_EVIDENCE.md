# Focused implementation evidence

## Archive metadata

Integrator ran the single new real Laravel HTTP test against the existing isolated MySQL8.4 test database using PHP8.4.26. No production connection or database reset. New migration applied successfully after the already-applied 25 baseline + analytics migration.

`php vendor/bin/phpunit --filter test_archive_metadata_full_stack_replay_rights_paths_and_admin_detail tests/Feature/Archive/ArchiveContributionTest.php --colors=never`

Final result: **OK (1 test, 56 assertions)**. Initial run was 45 assertions; only this new test was repeated after extending meaningful MIME/private-byte/denial/rollback assertions.

Covers authorized private PNG intake; persisted chapter/date/location/credit/rights/source/link; encrypted acknowledgment and staff notification payloads; actual MIME composition and PNG attachment contract; same-ID retry; modified metadata conflict; exactly two outbox rows; mandatory authorized upload; unconfirmed-reference citation without upload; reference-upload rejection; malformed optional type rejection; authenticated Admin metadata/download; exact private bytes; passenger download denial; populated-metadata DOWN refusal.

The MIME test injects the existing document-renderer contract double, preserving approved thank-you artwork implementation. It does not claim an external SMTP send or inbox receipt. Historical renderer/artwork regression was not broadly rerun.

`node --test --experimental-strip-types tests/unit/archive-contribution.test.ts`: **10 passed**. Integrator TypeScript check passed after collecting archive changes; final combined TypeScript follows editorial collection.

## Visual review

Normal local Playwright browser, no certificate bypass/authentication weakening. Source preview uses compiled content, not a claim of live CMS publication or authenticated Admin acceptance. Measured mobile initial 390px browser viewport had 375px content width due to scrollbar; content and scroll widths matched. Final evidence records actual content widths separately.

Initial mobile upload control was 1,401px from viewport top when opening the contribution anchor. Compact mobile introduction/chapter/rights treatment reduced it to about761px; privacy/rights remain in the form. Exactly one inline form instance, anchor receives focus. Final screenshots and responsive measurements are recorded alongside this receipt.

## Combined source and browser results

- Final focused Node files: 18 tests passed (10 archive,8 editorial), followed by one added supplied-original paragraph-preservation test passing; **19 focused tests total**. The exact English original is compared paragraph-by-paragraph with whitespace normalized. No broad suites repeated.
- TypeScript passed on the integrated source. A final HostPapa-profile build passed with backend production flags, with no ZIP/package or deployment. Admin dictionaries remain absent from public startup graphs and present in the Admin shell. `combined-build-measurements.json` pins the combined reviewed base plus uncommitted feature snapshot; the final build includes the late-collected Admin metadata renderer. An initial successful build was repeated only because that missing file was found during final collection; no suites were repeated for it. Subsequent test/docs commits do not change the runtime payload.
- Combined home script/preload graph: 1,473,265 raw /407,906 local-gzip bytes, versus original baseline1,565,568 /429,560: 92,303 raw /21,654 gzip bytes smaller after analytics/editorial additions. This is not a field Web Vitals or network-transfer result.
- Normal browser matrix: `/airport` and `/about`, EN/AR, **actual content widths320,390,768,1440**. All client/scroll widths equal, exactly one contribution form and zero nested interactive inputs; anchor focus is `contribute`. See `responsive-measurements.json`. Browser viewport width was adjusted for the vertical scrollbar; no claimed physical-phone test.
- EN/AR Home, Future, Contact, Privacy and Terms opened at390px content width with no document overflow. Main excerpts have Ayman credit and About links; false no-backend statements are absent from compiled legal pages. Footer attribution is visible in About captures.
- Browser switched to the reference-rights path and expanded optional provenance: upload controls absent, citation/reference URL and optional date available, no overflow. Actual screenshot `reference-en-mobile.jpg`. No production upload or browser mock submission is represented as backend acceptance.
- Actual before/after screenshots: About full pages EN/AR desktop/mobile, inline contribution EN/AR desktop/mobile, reference path. Smooth scroll was allowed to settle before full-page captures; lazy historical photograph loaded. Screenshots use compiled source, not the unchanged live CMS revision. Extension-injected development hydration attributes were observed; zero-console-error or authenticated Analytics/browser acceptance is not claimed.

## Remaining release acceptance

Public live CMS remains revision1 and requires separate owner-approved merge/publication of the reviewed bilingual text. Arabic translation/legal wording needs owner editorial acceptance. Real opt-in/beacon and authenticated Admin/report browser acceptance from PR24 remains a pre-release gate, alongside installed-host MySQL compatibility and new exact-source25-to27 migration/operator/preservation checks. No old operator reuse, production writes, cron changes, Actions or historical evidence deletion occurred.
