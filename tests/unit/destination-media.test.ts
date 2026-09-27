import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  APPROVED_DESTINATION_CODES,
  APPROVED_DESTINATION_PHOTO_IDS,
  DESTINATION_PHOTO_METADATA,
  buildDestinationSrcSet,
  isDestinationCode,
  isDestinationPhotoId,
  largestDestinationSrc,
  smallestDestinationSrc,
  type DestinationPhoto,
  type DestinationPhotoId,
} from "../../src/lib/destination-media-base.ts";
import { publishedDestinationsPresentation } from "../../src/content/published/destinations-presentation.ts";
import { isContentKey, isValidContent, contentHealth } from "../../src/content/schema.ts";
import { LocalContentRepository, CONTENT_DRAFT_KEY } from "../../src/content/repository.ts";
import type { DestinationsPresentationContent } from "../../src/content/types.ts";

describe("Destination Media Registry & Presentation Document", () => {
  describe("Destination Photo Base Registry & Metadata", () => {
    it("contains all 7 approved destination photo entries", () => {
      const expectedIds: DestinationPhotoId[] = [
        "city-amman",
        "city-cairo",
        "city-doha",
        "city-dubai",
        "city-istanbul",
        "city-jeddah",
        "city-riyadh",
      ];
      assert.deepEqual(Object.keys(DESTINATION_PHOTO_METADATA).sort(), expectedIds.sort());
      assert.deepEqual([...APPROVED_DESTINATION_PHOTO_IDS].sort(), expectedIds.sort());
    });

    it("maps every approved destination code to approved photo metadata with 5 variants", () => {
      for (const code of APPROVED_DESTINATION_CODES) {
        const photoMeta = Object.values(DESTINATION_PHOTO_METADATA).find((p) => p.cityCode === code);
        assert.ok(photoMeta, `Missing metadata for code ${code}`);
        assert.equal(photoMeta?.cityCode, code);
        assert.equal(photoMeta?.variants.length, 5);
        assert.deepEqual(
          photoMeta?.variants.map((v) => v.width),
          [480, 800, 1200, 1600, 1920],
        );
        assert.equal(photoMeta?.width, 1920);
        assert.ok((photoMeta?.height ?? 0) > 1000);
      }
    });

    it("provides valid responsive srcSet and boundary sources", () => {
      const istanbulMeta = DESTINATION_PHOTO_METADATA["city-istanbul"];
      const istanbulPhoto: DestinationPhoto = {
        ...istanbulMeta,
        variants: istanbulMeta.variants.map((v) => ({
          ...v,
          src: `/assets/istanbul-${v.width}.webp`,
        })),
      };

      const srcSet = buildDestinationSrcSet(istanbulPhoto);
      assert.ok(srcSet.includes("480w"));
      assert.ok(srcSet.includes("800w"));
      assert.ok(srcSet.includes("1200w"));
      assert.ok(srcSet.includes("1600w"));
      assert.ok(srcSet.includes("1920w"));

      assert.equal(smallestDestinationSrc(istanbulPhoto), istanbulPhoto.variants[0]?.src);
      assert.equal(largestDestinationSrc(istanbulPhoto), istanbulPhoto.variants[4]?.src);
    });

    it("type guards correctly validate codes and photo IDs", () => {
      assert.equal(isDestinationCode("AMM"), true);
      assert.equal(isDestinationCode("IST"), true);
      assert.equal(isDestinationCode("NYC"), false);
      assert.equal(isDestinationCode(123), false);

      assert.equal(isDestinationPhotoId("city-amman"), true);
      assert.equal(isDestinationPhotoId("city-istanbul"), true);
      assert.equal(isDestinationPhotoId("unknown-photo"), false);
      assert.equal(isDestinationPhotoId(null), false);
    });

    it("verifies static asset wiring integrity in destination-media.ts", () => {
      const mediaSource = readFileSync(
        new URL("../../src/lib/destination-media.ts", import.meta.url),
        "utf8",
      );

      for (const id of APPROVED_DESTINATION_PHOTO_IDS) {
        assert.ok(
          mediaSource.includes(`"${id}": attachSources`),
          `Expected destination-media.ts to attach sources for ${id}`,
        );
      }
      for (const code of APPROVED_DESTINATION_CODES) {
        assert.ok(
          mediaSource.includes(`${code}: DESTINATION_PHOTOS`),
          `Expected destination-media.ts to map code ${code}`,
        );
      }
    });
  });

  describe("Destinations Presentation Schema & Document Validation", () => {
    it("recognizes destinations.presentation as a valid content key", () => {
      assert.equal(isContentKey("destinations.presentation"), true);
      assert.equal(isContentKey("home"), true);
      assert.equal(isContentKey("travel"), true);
      assert.equal(isContentKey("random.document"), false);
    });

    it("validates the canonical published destinations presentation document", () => {
      assert.equal(
        isValidContent("destinations.presentation", publishedDestinationsPresentation),
        true,
      );
      const health = contentHealth(publishedDestinationsPresentation);
      assert.equal(health.hasEnglish, true);
      assert.equal(health.hasArabic, true);
      assert.equal(health.missingSource, false);
    });

    it("rejects presentations with missing, extra or duplicate codes", () => {
      const duplicate: DestinationsPresentationContent = {
        ...publishedDestinationsPresentation,
        assignments: [
          ...publishedDestinationsPresentation.assignments.slice(0, 6),
          { code: "AMM", photoId: "city-amman", focalPoint: { x: 50, y: 50 } },
        ],
      };
      assert.equal(isValidContent("destinations.presentation", duplicate), false);

      const tooFew: DestinationsPresentationContent = {
        ...publishedDestinationsPresentation,
        assignments: publishedDestinationsPresentation.assignments.slice(0, 5),
      };
      assert.equal(isValidContent("destinations.presentation", tooFew), false);
    });

    it("rejects unknown photo IDs and invalid focal coordinates", () => {
      const invalidPhoto = {
        ...publishedDestinationsPresentation,
        assignments: publishedDestinationsPresentation.assignments.map((a) =>
          a.code === "IST"
            ? { ...a, photoId: "fake-photo" as unknown as typeof a.photoId }
            : a,
        ),
      };
      assert.equal(isValidContent("destinations.presentation", invalidPhoto), false);

      const invalidFocal = {
        ...publishedDestinationsPresentation,
        assignments: publishedDestinationsPresentation.assignments.map((a) =>
          a.code === "IST" ? { ...a, focalPoint: { x: 150, y: 50 } } : a,
        ),
      };
      assert.equal(isValidContent("destinations.presentation", invalidFocal), false);
    });
  });

  describe("ContentRepository Draft Persistence for Destinations Presentation", () => {
    function mockStorage(): Storage {
      const data = new Map<string, string>();
      return {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => {
          data.set(k, v);
        },
        removeItem: (k: string) => {
          data.delete(k);
        },
        clear: () => {
          data.clear();
        },
        get length() {
          return data.size;
        },
        key: (i: number) => Array.from(data.keys())[i] ?? null,
      };
    }

    it("loads published destinations presentation when no draft exists", async () => {
      const store = mockStorage();
      const repo = new LocalContentRepository(store);
      const doc = await repo.getPreview("destinations.presentation");
      assert.deepEqual(doc, publishedDestinationsPresentation);
      assert.equal(await repo.getDraft("destinations.presentation"), null);
    });

    it("saves a valid destinations presentation draft, persists across instances, and discards cleanly", async () => {
      const store = mockStorage();
      const repo1 = new LocalContentRepository(store);

      const modified: DestinationsPresentationContent = {
        ...publishedDestinationsPresentation,
        assignments: publishedDestinationsPresentation.assignments.map((a) =>
          a.code === "IST"
            ? { ...a, photoId: "city-dubai", focalPoint: { x: 25, y: 75 } }
            : a,
        ),
      };

      await repo1.saveDraft("destinations.presentation", modified);

      // Verify second repository instance reads the same draft from storage
      const repo2 = new LocalContentRepository(store);
      const draft = await repo2.getDraft("destinations.presentation");
      assert.deepEqual(draft, modified);
      assert.deepEqual(await repo2.getPreview("destinations.presentation"), modified);

      // Discard draft reverts to published
      await repo2.discardDraft("destinations.presentation");
      assert.equal(await repo2.getDraft("destinations.presentation"), null);
      assert.deepEqual(
        await repo2.getPreview("destinations.presentation"),
        publishedDestinationsPresentation,
      );
    });

    it("throws and does not persist when draft is invalid", async () => {
      const store = mockStorage();
      const repo = new LocalContentRepository(store);
      const invalid = {
        ...publishedDestinationsPresentation,
        assignments: [],
      } as unknown as DestinationsPresentationContent;

      await assert.rejects(
        async () => {
          await repo.saveDraft("destinations.presentation", invalid);
        },
        { message: "Invalid content draft" },
      );
      assert.equal(store.getItem(CONTENT_DRAFT_KEY), null);
    });

    it("throws StorageCommitError when storage is unavailable", async () => {
      const repo = new LocalContentRepository(null);
      await assert.rejects(
        async () => {
          await repo.saveDraft("destinations.presentation", publishedDestinationsPresentation);
        },
        { message: "Content draft storage is unavailable" },
      );
    });
  });
});
