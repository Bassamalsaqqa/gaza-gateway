// Stable historical check IDs select existing journeys; assertions remain in their original modules.
export const smokeGroups = Object.freeze({
  public: ["9", "42", "43", "Phase 5A", "53", "54"],
  admin: ["10", "60", "61", "135", "136", "137", "138", "139", "140"],
  cms: ["14", "15", "16", "17", "20", "Phase 7"],
  archive: ["46", "47", "48", "52", "Archive draft administration"],
  seo: ["Phase 11 SEO metadata"],
  critical: ["9", "42", "43", "53", "54", "60", "61", "135", "136", "14", "46", "47", "Archive draft administration", "Phase 11 SEO metadata"],
});

export function smokeCheckId(name) {
  return /^(?:Check )?(\d+[a-z]?)[.:]/.exec(name)?.[1]
    ?? (/^Phase (5A|7)\b/.exec(name)?.[0] ?? name);
}

export function createSmokeSelection({ group = "all", filter = "" } = {}) {
  if (group !== "all" && !Object.hasOwn(smokeGroups, group)) throw new Error(`Unknown smoke group: ${group}`);
  const ids = group === "all" ? null : new Set(smokeGroups[group]);
  const observed = new Set();
  let count = 0;
  return {
    accepts(name) {
      const id = smokeCheckId(name);
      if (ids && !ids.has(id)) return false;
      if (filter && !name.toLowerCase().includes(filter.toLowerCase())) return false;
      observed.add(id);
      count++;
      return true;
    },
    verify() {
      if (!count) throw new Error("Smoke selection matched zero checks; refusing a false green result");
      // An explicit filter intentionally narrows a group. Without it, all contracted journeys must exist.
      const missing = ids && !filter ? [...ids].filter(id => !observed.has(id)) : [];
      if (missing.length) throw new Error(`Smoke group ${group} is missing registered checks: ${missing.join(", ")}`);
    },
  };
}
