import path from "node:path";
import { lstat, realpath } from "node:fs/promises";

/**
 * Validates relative paths strictly.
 * Rejects non-canonical dot/empty/drive-colon/backslash aliases rather than normalizing.
 */
export function normalizeRelativePath(relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new Error("Path must be a non-empty string");
  }

  // Reject null bytes and control characters
  if (/[\x00-\x1f\x7f]/.test(relativePath)) {
    throw new Error(`Path contains illegal control characters: ${JSON.stringify(relativePath)}`);
  }

  // Reject backslashes (must be canonical forward slash only)
  if (relativePath.includes("\\")) {
    throw new Error(`Path contains non-canonical backslashes: ${relativePath}`);
  }

  // Reject drive letters
  if (/^[a-zA-Z]:/.test(relativePath)) {
    throw new Error(`Path contains drive-relative prefix: ${relativePath}`);
  }

  // Reject leading slash
  if (relativePath.startsWith("/")) {
    throw new Error(`Path must be relative (cannot start with slash): ${relativePath}`);
  }

  // Reject trailing slash
  if (relativePath.endsWith("/")) {
    throw new Error(`Path must not end with a trailing slash: ${relativePath}`);
  }

  // Reject consecutive slashes (empty segments)
  if (relativePath.includes("//")) {
    throw new Error(`Path contains empty segment: ${relativePath}`);
  }

  // Split and validate segments
  const segments = relativePath.split("/");
  for (const seg of segments) {
    if (seg === ".") {
      throw new Error(`Path contains dot-segment ('.'): ${relativePath}`);
    }
    if (seg === "..") {
      throw new Error(`Path traversal attempt detected ('..'): ${relativePath}`);
    }
    if (seg === "") {
      throw new Error(`Path contains empty segment: ${relativePath}`);
    }
  }

  return relativePath;
}

/**
 * Ensures an absolute path stays strictly within an allowed root boundary.
 */
export function assertPathWithinRoot(targetPath, rootDir) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(rootDir);

  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Path boundary violation: ${resolvedTarget} is outside ${resolvedRoot}`);
  }

  return resolvedTarget;
}

/**
 * Verifies that a path and all its ancestor segments are free from symlinks.
 */
export async function assertNoSymlinksInPath(targetPath) {
  const resolved = path.resolve(targetPath);
  const parsed = path.parse(resolved);
  let current = parsed.root;
  const relativeParts = resolved.slice(parsed.root.length).split(path.sep).filter(Boolean);

  for (const part of relativeParts) {
    current = path.join(current, part);
    const stats = await lstat(current).catch(() => null);
    if (!stats) break; // Path component does not exist yet
    if (stats.isSymbolicLink()) {
      throw new Error(`Symlink detected in path: ${current}`);
    }
  }
}
