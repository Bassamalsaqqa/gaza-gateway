import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CINEMATIC_MANIFEST, CINEMATIC_PUBLIC_VERSION, CINEMATIC_STILLS_AGGREGATE_HASH } from "../../src/lib/media/cinematic-manifest.ts";

function fileSha256(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

describe("Future Airport Cinematic Manifest & Provenance Registry", () => {
  const workspaceRoot = process.cwd();

  test("preserves strict future-concept-ai classification with owner-approved neutral display copy", () => {
    assert.equal(CINEMATIC_MANIFEST.truthClass, "future-concept-ai");
    assert.ok(CINEMATIC_MANIFEST.disclosure.en.includes("Architectural vision"));
    assert.ok(CINEMATIC_MANIFEST.disclosure.ar.includes("رؤية معمارية"));
  });

  test("documents verified immutable original video master fingerprint", () => {
    const orig = CINEMATIC_MANIFEST.sourceFingerprint;
    assert.equal(orig.originalFilename, "Gaza-Airport-Video.mp4");
    assert.equal(orig.sha256, "ec8b8b5f34dbb3b223b5115ac2e09426f89868463be0c7c2e94847b84a9d5f00");
    assert.equal(orig.fileSizeBytes, 3912780);
    assert.equal(orig.width, 1280);
    assert.equal(orig.height, 720);
    assert.equal(orig.durationSeconds, 8.0);
    assert.equal(orig.fps, 24);
    assert.ok(orig.audio.includes("aac"));
  });

  test("verifies selected MP4 derivatives have pinned public assets", () => {
    const { standard540p, desktop720p } = CINEMATIC_MANIFEST.derivatives;

    assert.ok(standard540p.src.startsWith("/media/future/cinematic/mp4-"));
    assert.equal(standard540p.hasAudio, false);
    assert.equal(standard540p.faststart, true);
    assert.equal(standard540p.gopFrames, 4);
    assert.equal(standard540p.keyframeCount, 48);

    assert.ok(desktop720p.src.startsWith("/media/future/cinematic/mp4-"));
    assert.equal(desktop720p.hasAudio, false);
    assert.equal(desktop720p.faststart, true);
    assert.equal(desktop720p.gopFrames, 6);
    assert.equal(desktop720p.keyframeCount, 32);
    for (const video of [standard540p, desktop720p]) {
      const asset = path.join(workspaceRoot, "public", video.src.slice(1));
      assert.equal(fileSha256(asset), video.sha256);
      assert.equal(fs.statSync(asset).size, video.fileSizeBytes);
    }
  });

  test("verifies poster and milestones exist with valid alt text and hashes in versioned directory", () => {
    const assetDirectory = path.join(workspaceRoot, "public/media/future/cinematic", CINEMATIC_PUBLIC_VERSION);
    assert.deepEqual(fs.readdirSync(assetDirectory).sort(), [
      "future-cinematic-poster.webp",
      "milestone-daylight.webp",
      "milestone-night.webp",
      "milestone-sunset.webp",
      "milestone-twilight.webp",
    ]);
    const aggregate = crypto.createHash("sha256").update([
      CINEMATIC_MANIFEST.poster.sha256, ...Object.values(CINEMATIC_MANIFEST.milestones).map(m => m.sha256),
    ].join("")).digest("hex");
    assert.equal(aggregate, CINEMATIC_STILLS_AGGREGATE_HASH);
    const poster = CINEMATIC_MANIFEST.poster;
    const relPoster = poster.src.replace(/^\//, "");
    const absPoster = path.join(workspaceRoot, "public", relPoster);
    assert.ok(fs.existsSync(absPoster), `Expected ${absPoster} to exist`);
    assert.equal(fs.statSync(absPoster).size, poster.fileSizeBytes);
    assert.equal(fileSha256(absPoster).toLowerCase(), poster.sha256.toLowerCase());
    assert.ok(poster.altEn.length > 20);
    assert.ok(poster.altAr.length > 20);

    const milestoneKeys: Array<keyof typeof CINEMATIC_MANIFEST.milestones> = ["daylight", "sunset", "twilight", "night"];
    for (const key of milestoneKeys) {
      const ms = CINEMATIC_MANIFEST.milestones[key];
      const relMs = ms.src.replace(/^\//, "");
      const absMs = path.join(workspaceRoot, "public", relMs);
      assert.ok(fs.existsSync(absMs), `Expected ${absMs} to exist`);
      assert.equal(fs.statSync(absMs).size, ms.fileSizeBytes);
      assert.equal(fileSha256(absMs).toLowerCase(), ms.sha256.toLowerCase());
      assert.ok(ms.captionEn.length > 10);
      assert.ok(ms.captionAr.length > 10);
    }
  });

  test("pins mobile framing, compressed media and aligned first-frame posters", () => {
    for (const mobile of [CINEMATIC_MANIFEST.mobilePortrait, CINEMATIC_MANIFEST.mobileLandscape]) {
      for (const asset of [mobile.video, mobile.poster]) {
        const file = path.join(workspaceRoot, "public", asset.src.slice(1));
        assert.equal(fileSha256(file), asset.sha256);
        assert.equal(fs.statSync(file).size, asset.fileSizeBytes);
        assert.ok(asset.src.includes(asset.sha256.slice(0, 8)));
      }
      assert.equal(mobile.poster.width, mobile.video.width);
      assert.equal(mobile.poster.height, mobile.video.height);
      assert.equal(mobile.video.durationSeconds, 8);
      assert.equal(mobile.video.fps, 24);
      assert.equal(mobile.video.gopFrames, 4);
      assert.equal(mobile.video.keyframeCount, 48);
      assert.equal(mobile.video.hasAudio, false);
      assert.equal(mobile.sourceCrop.y, 24);
      assert.equal(mobile.sourceCrop.height, 672);
      const bytes = fs.readFileSync(path.join(workspaceRoot, "public", mobile.video.src.slice(1)));
      // Inspect top-level ISO BMFF atoms, rather than searching compressed bytes.
      const atoms: string[] = [];
      for (let offset = 0; offset + 8 <= bytes.length;) {
        const size = bytes.readUInt32BE(offset);
        assert.ok(size >= 8 && offset + size <= bytes.length);
        atoms.push(bytes.toString("ascii", offset + 4, offset + 8));
        offset += size;
      }
      assert.ok(atoms.indexOf("moov") >= 0 && atoms.indexOf("moov") < atoms.indexOf("mdat"));
    }
    assert.deepEqual(CINEMATIC_MANIFEST.mobilePortrait.sourceCrop, { x: 562, y: 24, width: 378, height: 672 });
    assert.ok(CINEMATIC_MANIFEST.mobilePortrait.video.fileSizeBytes < 1_600_000);
    assert.ok(CINEMATIC_MANIFEST.mobileLandscape.video.fileSizeBytes < 3_000_000);
  });

  test("ensures 4 chronological story phases with complete 0.0 to 1.0 coverage and honest copy", () => {
    const phases = CINEMATIC_MANIFEST.phases;
    assert.equal(phases.length, 4);

    assert.equal(phases[0]!.progressStart, 0.0);
    assert.equal(phases[phases.length - 1]!.progressEnd, 1.0);

    for (let i = 0; i < phases.length; i++) {
      const p = phases[i]!;
      assert.ok(p.progressEnd > p.progressStart);
      if (i > 0) {
        assert.equal(p.progressStart, phases[i - 1]!.progressEnd);
      }
      // Ensure no 4K, morph-from-sketch, microgrid, or live flight operations claims
      const copyAll = `${p.titleEn} ${p.titleAr} ${p.descriptionEn} ${p.descriptionAr}`.toLowerCase();
      assert.ok(!copyAll.includes("4k"));
      assert.ok(!copyAll.includes("morph"));
      assert.ok(!copyAll.includes("sketch"));
      assert.ok(!copyAll.includes("microgrid"));
      assert.ok(!copyAll.includes("flight operations"));
    }
  });
});
