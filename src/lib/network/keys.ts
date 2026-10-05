export const networkKeys = {
  all: ["network"] as const,
  list: () => ["network", "list"] as const,
  detail: (code: string) => ["network", "detail", code] as const,
};
