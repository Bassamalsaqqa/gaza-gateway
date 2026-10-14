/** Staff proofs never enter a page query string, persistent storage or automatic request. */
export function parseStaffAccessFragment(fragment: string): { token: string | null; error: "missing" | "invalid" | null } {
  if (fragment === "" || fragment === "#") return { token: null, error: "missing" };
  const match = /^#token=([A-Za-z0-9_-]{42}[AEIMQUYcgkosw048])(?![\s\S])/.exec(fragment);
  return match ? { token: match[1]!, error: null } : { token: null, error: "invalid" };
}
