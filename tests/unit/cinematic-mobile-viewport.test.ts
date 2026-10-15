import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveCinematicSourceMode,
  resolveCinematicVideoSrc,
} from "../../src/components/airport/cinematic/cinematic-types.ts";
import { CINEMATIC_MANIFEST } from "../../src/lib/media/cinematic-manifest.ts";

// Actual viewport/media-query matching and cover/rotation behavior are checked in
// the native browser fixture; these tests cover the pure source-selection policy.
describe("Mobile cinematic source selection", () => {
  test("resolveCinematicSourceMode routes breakpoints and orientations accurately", () => {
    // Desktop >= 1024px regardless of orientation
    assert.equal(resolveCinematicSourceMode(true, false), "desktop");
    assert.equal(resolveCinematicSourceMode(true, true), "desktop");

    // Narrow portrait phone query matches
    assert.equal(resolveCinematicSourceMode(false, true), "mobile-portrait");

    // Landscape phone or wider tablet query matches
    assert.equal(resolveCinematicSourceMode(false, false), "mobile-landscape");
  });

  test("resolveCinematicVideoSrc selects authored crops and derivatives from manifest", () => {
    assert.equal(
      resolveCinematicVideoSrc(CINEMATIC_MANIFEST, "mobile-portrait"),
      CINEMATIC_MANIFEST.mobilePortrait.video.src,
    );
    assert.equal(
      resolveCinematicVideoSrc(CINEMATIC_MANIFEST, "mobile-landscape"),
      CINEMATIC_MANIFEST.mobileLandscape.video.src,
    );
    assert.equal(
      resolveCinematicVideoSrc(CINEMATIC_MANIFEST, "desktop"),
      CINEMATIC_MANIFEST.derivatives.desktop720p.src,
    );

  });
});
