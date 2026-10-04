export const commercialCatalogKeys = {
  all: ["commercial-catalog"] as const,
  current: () => ["commercial-catalog", "current"] as const,
};
