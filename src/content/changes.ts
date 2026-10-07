export type ContentStructureChanges = { added: number; removed: number; reordered: number; visibility: number };

/** Count committed structured-item changes without retaining editorial prose in the audit. */
export function contentStructureChanges(before: unknown, after: unknown): ContentStructureChanges {
  const changes = { added: 0, removed: 0, reordered: 0, visibility: 0 };
  const visit = (a: unknown, b: unknown) => {
    if (Array.isArray(a) || Array.isArray(b)) {
      const old = Array.isArray(a) ? a : [], next = Array.isArray(b) ? b : [];
      const identified = (value: unknown): value is Record<string, unknown> =>
        !!value && typeof value === "object" && !Array.isArray(value) &&
        (("id" in value && typeof value.id === "string") || ("code" in value && typeof value.code === "string"));
      const key = (value: Record<string, unknown>) => (value["id"] ?? value["code"]) as string;
      if (old.every(identified) && next.every(identified)) {
        const oldItems = new Map(old.map((item) => [key(item), item]));
        const newItems = new Map(next.map((item) => [key(item), item]));
        changes.added += next.filter((item) => !oldItems.has(key(item))).length;
        changes.removed += old.filter((item) => !newItems.has(key(item))).length;
        const retainedBefore = old.filter((item) => newItems.has(key(item))).map(key);
        const retainedAfter = next.filter((item) => oldItems.has(key(item))).map(key);
        if (retainedBefore.some((id, index) => id !== retainedAfter[index])) changes.reordered += 1;
        for (const id of new Set([...oldItems.keys(), ...newItems.keys()])) visit(oldItems.get(id), newItems.get(id));
      } else {
        for (let index = 0; index < Math.max(old.length, next.length); index++) visit(old[index], next[index]);
      }
      return;
    }
    if ((a && typeof a === "object") || (b && typeof b === "object")) {
      const old = a && typeof a === "object" ? a as Record<string, unknown> : {};
      const next = b && typeof b === "object" ? b as Record<string, unknown> : {};
      if (typeof old["visible"] === "boolean" && typeof next["visible"] === "boolean" && old["visible"] !== next["visible"]) changes.visibility += 1;
      for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) visit(old[key], next[key]);
    }
  };
  visit(before, after);
  return changes;
}
