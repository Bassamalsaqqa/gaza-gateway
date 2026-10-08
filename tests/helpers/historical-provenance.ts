import { execFileSync } from "node:child_process";

/** Old deployment assertions belong to their immutable milestone, not today's living header.
 * Current production/source truth is independently guarded by network-status.test.ts. */
export function phase6HistoricalDocument(path: string): string {
  if (!/^(?:README\.md|PRODUCT\.md|roadmap\.md|docs\/[A-Z0-9_]+\.md)$/.test(path)) throw new Error("Invalid historical documentation path");
  return execFileSync("git", ["show", `f5506a2ae467b2eb5b8182d7d5b009f258115eb4:${path}`], { encoding: "utf8" });
}
