/**
 * Gaza Gateway — Appearance Studio Parent<->Iframe Communication Protocol
 *
 * Strict, typed postMessage bridge between Appearance Studio inspector and preview iframe.
 * Validates origin, event source, and payload structure.
 * Transports semantic configuration only — never arbitrary CSS, HTML, or executable content.
 */

import {
  type SiteSkinConfig,
  sanitizeSiteSkinConfig,
} from "./skin.ts";
import {
  isTargetId,
  type TargetId,
} from "../design/surfaces/runtime-targets.ts";

export const STUDIO_PROTOCOL_VERSION = "1.0.0";

// ─────────────────────────────────────────────────────────────────────────────
// Message Types
// ─────────────────────────────────────────────────────────────────────────────

export type ParentToFrameMessage =
  | {
      type: "GZA_STUDIO_PARENT_INIT";
      version: string;
      config: SiteSkinConfig;
      inspectMode: boolean;
      baselineMode: boolean;
      selectedTargetId?: TargetId | null | undefined;
    }
  | {
      type: "GZA_STUDIO_CONFIG_SYNC";
      version: string;
      config: SiteSkinConfig;
    }
  | {
      type: "GZA_STUDIO_INSPECT_MODE";
      version: string;
      inspectMode: boolean;
      baselineMode: boolean;
    }
  | {
      type: "GZA_STUDIO_SELECT_TARGET_CMD";
      version: string;
      targetId: TargetId | null;
      scrollIntoView?: boolean | undefined;
    }
  | {
      type: "GZA_STUDIO_NAVIGATE_SCENARIO";
      version: string;
      path: string;
    };

export type FrameToParentMessage =
  | {
      type: "GZA_STUDIO_FRAME_READY";
      version: string;
      path: string;
      locale: "en" | "ar";
      availableTargets: TargetId[];
    }
  | {
      type: "GZA_STUDIO_TARGET_HOVERED";
      version: string;
      targetId: TargetId | null;
    }
  | {
      type: "GZA_STUDIO_TARGET_SELECTED";
      version: string;
      targetId: TargetId;
    }
  | {
      type: "GZA_STUDIO_ROUTE_CHANGED";
      version: string;
      path: string;
      locale: "en" | "ar";
    };

export type StudioMessage = ParentToFrameMessage | FrameToParentMessage;

// ─────────────────────────────────────────────────────────────────────────────
// Origin and Security Validators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates that an incoming postMessage originated from the exact same origin.
 */
export function isValidStudioOrigin(event: MessageEvent): boolean {
  if (typeof window === "undefined") return false;
  if (!event || typeof event.origin !== "string") return false;
  // Strict same-origin check
  return event.origin === window.location.origin;
}

/**
 * Strict validator for navigation route paths in Studio messages.
 * Accepts valid internal route paths with optional query parameters and hashes.
 * Strictly rejects:
 * - Missing or non-string paths
 * - Relative paths or missing leading slash
 * - Protocol-relative (//) or external URLs (http:, https:, javascript:)
 * - Backslashes, whitespace, and null bytes
 * - Directory traversal segments (. and ..) whether raw or percent-encoded (including nested encodings)
 */
export function isValidStudioRoutePath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  const trimmed = path.trim();
  // Must start with exactly one leading slash
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return false;
  // Reject backslashes, whitespace, and null characters
  if (/[\\\s\0]/.test(trimmed)) return false;

  // Extract pathname (before query '?' or hash '#')
  const pathnameMatch = trimmed.match(/^([^?#]*)/);
  const pathname: string = (pathnameMatch && pathnameMatch[1] !== undefined) ? pathnameMatch[1] : trimmed;

  // Reject consecutive slashes in pathname
  if (pathname.includes("//")) return false;

  // Fully decode any percent-encoding to catch single/double encoded dot segments (%2e, %252e)
  let decoded: string = pathname;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      // Malformed percent-encoding
      return false;
    }
  }

  // Reject backslashes, whitespace, or nulls that appeared after decoding
  if (/[\\\s\0]/.test(decoded)) return false;

  // Split decoded pathname into segments
  const segments = decoded.split("/");
  // segments[0] is "" because pathname starts with "/"
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    // Reject '.' and '..' dot segments
    if (seg === "." || seg === "..") return false;
    // Reject empty segment in middle (consecutive slashes)
    if (seg === "" && i < segments.length - 1) return false;
  }

  // Inspect query string and hash: reject null bytes
  const rest = trimmed.slice(pathname.length);
  if (/[\0]/.test(rest)) return false;

  return true;
}

/**
 * Sanitizes and validates a message received from a child frame or parent.
 */
export function parseParentMessage(data: unknown): ParentToFrameMessage | null {
  if (!data || typeof data !== "object") return null;
  const msg = data as Record<string, unknown>;
  const type = msg["type"];

  if (typeof type !== "string" || !type.startsWith("GZA_STUDIO_")) {
    return null;
  }

  // Reject unknown or missing protocol version
  if (msg["version"] !== STUDIO_PROTOCOL_VERSION) {
    return null;
  }

  switch (type) {
    case "GZA_STUDIO_PARENT_INIT": {
      if (typeof msg["inspectMode"] !== "boolean") return null;
      if (typeof msg["baselineMode"] !== "boolean") return null;
      const rawTarget = msg["selectedTargetId"];
      if (rawTarget !== null && rawTarget !== undefined && !isTargetId(rawTarget)) {
        return null;
      }
      return {
        type: "GZA_STUDIO_PARENT_INIT",
        version: STUDIO_PROTOCOL_VERSION,
        config: sanitizeSiteSkinConfig(msg["config"]),
        inspectMode: msg["inspectMode"],
        baselineMode: msg["baselineMode"],
        selectedTargetId: rawTarget ?? null,
      };
    }
    case "GZA_STUDIO_CONFIG_SYNC": {
      if (!msg["config"] || typeof msg["config"] !== "object") return null;
      return {
        type: "GZA_STUDIO_CONFIG_SYNC",
        version: STUDIO_PROTOCOL_VERSION,
        config: sanitizeSiteSkinConfig(msg["config"]),
      };
    }
    case "GZA_STUDIO_INSPECT_MODE": {
      if (typeof msg["inspectMode"] !== "boolean") return null;
      if (typeof msg["baselineMode"] !== "boolean") return null;
      return {
        type: "GZA_STUDIO_INSPECT_MODE",
        version: STUDIO_PROTOCOL_VERSION,
        inspectMode: msg["inspectMode"],
        baselineMode: msg["baselineMode"],
      };
    }
    case "GZA_STUDIO_SELECT_TARGET_CMD": {
      const rawTarget = msg["targetId"];
      if (rawTarget !== null && !isTargetId(rawTarget)) return null;
      if (msg["scrollIntoView"] !== undefined && typeof msg["scrollIntoView"] !== "boolean") {
        return null;
      }
      return {
        type: "GZA_STUDIO_SELECT_TARGET_CMD",
        version: STUDIO_PROTOCOL_VERSION,
        targetId: rawTarget,
        scrollIntoView: msg["scrollIntoView"],
      };
    }
    case "GZA_STUDIO_NAVIGATE_SCENARIO": {
      const rawPath = msg["path"];
      if (!isValidStudioRoutePath(rawPath)) return null;
      return {
        type: "GZA_STUDIO_NAVIGATE_SCENARIO",
        version: STUDIO_PROTOCOL_VERSION,
        path: rawPath.trim(),
      };
    }
    default:
      return null;
  }
}

export function parseFrameMessage(data: unknown): FrameToParentMessage | null {
  if (!data || typeof data !== "object") return null;
  const msg = data as Record<string, unknown>;
  const type = msg["type"];

  if (typeof type !== "string" || !type.startsWith("GZA_STUDIO_")) {
    return null;
  }

  // Reject unknown or missing protocol version
  if (msg["version"] !== STUDIO_PROTOCOL_VERSION) {
    return null;
  }

  switch (type) {
    case "GZA_STUDIO_FRAME_READY": {
      if (!Array.isArray(msg["availableTargets"])) return null;
      const rawTargets = msg["availableTargets"];
      if (!rawTargets.every(isTargetId)) return null;
      if (msg["locale"] !== "ar" && msg["locale"] !== "en") return null;
      if (!isValidStudioRoutePath(msg["path"])) return null;
      return {
        type: "GZA_STUDIO_FRAME_READY",
        version: STUDIO_PROTOCOL_VERSION,
        path: msg["path"].trim(),
        locale: msg["locale"],
        availableTargets: rawTargets,
      };
    }
    case "GZA_STUDIO_TARGET_HOVERED": {
      const rawTarget = msg["targetId"];
      if (rawTarget !== null && !isTargetId(rawTarget)) return null;
      return {
        type: "GZA_STUDIO_TARGET_HOVERED",
        version: STUDIO_PROTOCOL_VERSION,
        targetId: rawTarget,
      };
    }
    case "GZA_STUDIO_TARGET_SELECTED": {
      if (!isTargetId(msg["targetId"])) return null;
      return {
        type: "GZA_STUDIO_TARGET_SELECTED",
        version: STUDIO_PROTOCOL_VERSION,
        targetId: msg["targetId"],
      };
    }
    case "GZA_STUDIO_ROUTE_CHANGED": {
      if (msg["locale"] !== "ar" && msg["locale"] !== "en") return null;
      if (!isValidStudioRoutePath(msg["path"])) return null;
      return {
        type: "GZA_STUDIO_ROUTE_CHANGED",
        version: STUDIO_PROTOCOL_VERSION,
        path: msg["path"].trim(),
        locale: msg["locale"],
      };
    }
    default:
      return null;
  }
}
