/**
 * Canonical route normalization and sensitive dynamic path collapse.
 *
 * Invariants:
 * 1. Strictly NO admin, diagnostic, account, or private paths.
 * 2. Strictly NO PNR (booking reference), email, ticket, or authorization tokens in paths.
 * 3. Strips query parameters and hash fragments entirely.
 * 4. Preserves bilingual locale prefix (/ar) as a distinct dimension (/flights vs /ar/flights).
 * 5. Collapses sensitive/variable dynamic paths (/flight/*, /destinations/*, /archive/*).
 * 6. Drops any unrecognized or unwhitelisted routes (fail closed).
 */

const FORBIDDEN_PREFIXES = [
  "/admin",
  "/admin_",
  "/account",
  "/manage",
  "/booking-confirmation",
  "/signin",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/access-denied",
  "/api",
  "/storage",
  "/_debugbar",
  "/telescope",
  "/oauth",
];

const KNOWN_STATIC_BASE_PATHS = new Set([
  "/",
  "/about",
  "/airport",
  "/airport/past",
  "/airport/present",
  "/airport/future",
  "/flights",
  "/destinations",
  "/book",
  "/check-in",
  "/gallery",
  "/archive",
  "/story",
  "/future",
  "/visit",
  "/boarding-pass",
  "/meals",
  "/contact",
  "/terms",
  "/privacy",
  "/travel",
]);

export function canonicalizePublicPath(rawPath: string): string | null {
  if (!rawPath || typeof rawPath !== "string") {
    return null;
  }

  // 1. Strip hash and query parameters
  const withoutHash = rawPath.split("#")[0] ?? "";
  const withoutQuery = withoutHash.split("?")[0] ?? "";
  let clean = withoutQuery.trim();

  if (clean === "") {
    return null;
  }

  // 2. Ensure leading slash and remove trailing slash (except root)
  if (!clean.startsWith("/")) {
    clean = "/" + clean;
  }
  if (clean.length > 1 && clean.endsWith("/")) {
    clean = clean.slice(0, -1);
  }

  // 3. Detect and extract bilingual /ar prefix to preserve locale dimension
  let isArabic = false;
  let basePath = clean;

  if (clean === "/ar") {
    isArabic = true;
    basePath = "/";
  } else if (clean.startsWith("/ar/")) {
    isArabic = true;
    basePath = clean.slice(3);
    if (!basePath.startsWith("/")) {
      basePath = "/" + basePath;
    }
  }

  // 4. Check for forbidden private/administrative/diagnostic paths (checking both clean and basePath)
  const lowerBase = basePath.toLowerCase();
  const lowerClean = clean.toLowerCase();

  for (const prefix of FORBIDDEN_PREFIXES) {
    if (
      lowerBase === prefix ||
      lowerBase.startsWith(prefix + "/") ||
      lowerBase.startsWith(prefix + "_") ||
      lowerClean === prefix ||
      lowerClean.startsWith(prefix + "/") ||
      lowerClean.startsWith(prefix + "_")
    ) {
      return null;
    }
  }

  // 5. Match exact known static public routes
  if (KNOWN_STATIC_BASE_PATHS.has(basePath)) {
    return isArabic && basePath !== "/" ? `/ar${basePath}` : isArabic ? "/ar" : basePath;
  }

  // 6. Collapse known public dynamic paths
  if (basePath.startsWith("/flight/")) {
    return isArabic ? "/ar/flight/:flightId" : "/flight/:flightId";
  }

  if (basePath.startsWith("/destinations/")) {
    return isArabic ? "/ar/destinations/:code" : "/destinations/:code";
  }

  if (basePath.startsWith("/archive/")) {
    return isArabic ? "/ar/archive/:id" : "/archive/:id";
  }

  // 7. Any other route is unverified / non-public / diagnostic: fail closed
  return null;
}
