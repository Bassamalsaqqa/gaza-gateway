import type { ContentKey } from "./types.ts";
export const contentKeys = {
  all: ["content"] as const,
  inventory: ["content", "inventory"] as const,
  document: (key: ContentKey) => ["content", "document", key] as const,
};
