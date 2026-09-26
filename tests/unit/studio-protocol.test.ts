import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isValidStudioRoutePath,
  parseFrameMessage,
  parseParentMessage,
  STUDIO_PROTOCOL_VERSION,
} from "../../src/lib/studio-protocol.ts";
import { DEFAULT_SITE_SKIN } from "../../src/lib/skin.ts";

describe("Appearance Studio Protocol & Security", () => {
  describe("Protocol Versioning", () => {
    it("defines standard protocol version constant", () => {
      assert.equal(typeof STUDIO_PROTOCOL_VERSION, "string");
      assert.equal(STUDIO_PROTOCOL_VERSION, "1.0.0");
    });
  });

  describe("Route Path Validation (isValidStudioRoutePath)", () => {
    it("accepts valid internal route paths", () => {
      assert.equal(isValidStudioRoutePath("/"), true);
      assert.equal(isValidStudioRoutePath("/ar"), true);
      assert.equal(isValidStudioRoutePath("/book"), true);
      assert.equal(isValidStudioRoutePath("/ar/book"), true);
      assert.equal(isValidStudioRoutePath("/travel"), true);
      assert.equal(isValidStudioRoutePath("/airport/future"), true);
      assert.equal(isValidStudioRoutePath("/admin/settings?tab=appearance"), true);
      assert.equal(isValidStudioRoutePath("/book#step2"), true);
    });

    it("rejects protocol-relative and external URLs", () => {
      assert.equal(isValidStudioRoutePath("//evil.com"), false);
      assert.equal(isValidStudioRoutePath("https://evil.com/"), false);
      assert.equal(isValidStudioRoutePath("http://localhost:3000/"), false);
      assert.equal(isValidStudioRoutePath("javascript:alert(1)"), false);
      assert.equal(isValidStudioRoutePath("data:text/html,<h1>hi</h1>"), false);
    });

    it("rejects directory traversal and dot segments", () => {
      assert.equal(isValidStudioRoutePath("/../secret"), false);
      assert.equal(isValidStudioRoutePath("/path/./test"), false);
      assert.equal(isValidStudioRoutePath("/%2e%2e/test"), false); // URL encoded ..
      assert.equal(isValidStudioRoutePath("/%252e%252e/test"), false); // Double encoded ..
    });

    it("rejects backslashes, whitespace, and null characters", () => {
      assert.equal(isValidStudioRoutePath("/path\\traversal"), false);
      assert.equal(isValidStudioRoutePath("/path with spaces"), false);
      assert.equal(isValidStudioRoutePath("/path\0null"), false);
      assert.equal(isValidStudioRoutePath(""), false);
      assert.equal(isValidStudioRoutePath(null), false);
      assert.equal(isValidStudioRoutePath(123), false);
    });
  });

  describe("Parent to Frame Message Parsing (parseParentMessage)", () => {
    it("parses valid GZA_STUDIO_PARENT_INIT message", () => {
      const msg = {
        type: "GZA_STUDIO_PARENT_INIT",
        version: STUDIO_PROTOCOL_VERSION,
        config: DEFAULT_SITE_SKIN,
        inspectMode: true,
        baselineMode: false,
        selectedTargetId: "booking.flight-option",
      };

      const parsed = parseParentMessage(msg);
      assert.notEqual(parsed, null);
      assert.equal(parsed?.type, "GZA_STUDIO_PARENT_INIT");
      if (parsed?.type === "GZA_STUDIO_PARENT_INIT") {
        assert.equal(parsed.inspectMode, true);
        assert.equal(parsed.selectedTargetId, "booking.flight-option");
      }
    });

    it("rejects message with mismatched protocol version", () => {
      const msg = {
        type: "GZA_STUDIO_PARENT_INIT",
        version: "99.0.0", // Mismatched
        config: DEFAULT_SITE_SKIN,
        inspectMode: false,
        baselineMode: false,
      };

      assert.equal(parseParentMessage(msg), null);
    });

    it("parses and validates GZA_STUDIO_SELECT_TARGET_CMD", () => {
      const validCmd = {
        type: "GZA_STUDIO_SELECT_TARGET_CMD",
        version: STUDIO_PROTOCOL_VERSION,
        targetId: "travel.guide",
        scrollIntoView: true,
      };
      const parsed = parseParentMessage(validCmd);
      assert.notEqual(parsed, null);
      if (parsed?.type === "GZA_STUDIO_SELECT_TARGET_CMD") {
        assert.equal(parsed.targetId, "travel.guide");
        assert.equal(parsed.scrollIntoView, true);
      }

      // Invalid target ID rejected
      const invalidCmd = {
        type: "GZA_STUDIO_SELECT_TARGET_CMD",
        version: STUDIO_PROTOCOL_VERSION,
        targetId: "malicious.target.id",
      };
      assert.equal(parseParentMessage(invalidCmd), null);
    });

    it("parses and validates GZA_STUDIO_NAVIGATE_SCENARIO", () => {
      const validNav = {
        type: "GZA_STUDIO_NAVIGATE_SCENARIO",
        version: STUDIO_PROTOCOL_VERSION,
        path: "/travel",
      };
      const parsed = parseParentMessage(validNav);
      assert.notEqual(parsed, null);
      if (parsed?.type === "GZA_STUDIO_NAVIGATE_SCENARIO") {
        assert.equal(parsed.path, "/travel");
      }

      // Invalid path rejected
      const invalidNav = {
        type: "GZA_STUDIO_NAVIGATE_SCENARIO",
        version: STUDIO_PROTOCOL_VERSION,
        path: "https://external.com",
      };
      assert.equal(parseParentMessage(invalidNav), null);
    });
  });

  describe("Frame to Parent Message Parsing (parseFrameMessage)", () => {
    it("parses valid GZA_STUDIO_FRAME_READY message", () => {
      const readyMsg = {
        type: "GZA_STUDIO_FRAME_READY",
        version: STUDIO_PROTOCOL_VERSION,
        path: "/ar/book",
        locale: "ar",
        availableTargets: ["booking.flight-option", "booking.fare-option"],
      };

      const parsed = parseFrameMessage(readyMsg);
      assert.notEqual(parsed, null);
      if (parsed?.type === "GZA_STUDIO_FRAME_READY") {
        assert.equal(parsed.locale, "ar");
        assert.equal(parsed.path, "/ar/book");
        assert.deepEqual(parsed.availableTargets, ["booking.flight-option", "booking.fare-option"]);
      }
    });

    it("rejects GZA_STUDIO_FRAME_READY with invalid target IDs", () => {
      const badTargetsMsg = {
        type: "GZA_STUDIO_FRAME_READY",
        version: STUDIO_PROTOCOL_VERSION,
        path: "/book",
        locale: "en",
        availableTargets: ["valid.target", "malicious.target"],
      };

      assert.equal(parseFrameMessage(badTargetsMsg), null);
    });

    it("parses GZA_STUDIO_TARGET_SELECTED", () => {
      const selectMsg = {
        type: "GZA_STUDIO_TARGET_SELECTED",
        version: STUDIO_PROTOCOL_VERSION,
        targetId: "booking.flight-option",
      };

      const parsed = parseFrameMessage(selectMsg);
      assert.notEqual(parsed, null);
      if (parsed?.type === "GZA_STUDIO_TARGET_SELECTED") {
        assert.equal(parsed.targetId, "booking.flight-option");
      }
    });
  });
});
