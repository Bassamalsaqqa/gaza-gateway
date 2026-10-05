import { z } from "zod";
import { NETWORK_CODES, NetworkError } from "./types.ts";

const label = z.string().trim().min(1).max(160);
const bilingual = z.object({ en: label, ar: label }).strict();
export function isIanaTimezone(value: string): boolean {
  if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(value)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}
export const networkDestinationSchema = z.object({
  code: z.enum(NETWORK_CODES),
  airportName: bilingual, city: bilingual, country: bilingual,
  timezone: z.string().trim().min(1).max(80).refine(isIanaTimezone),
  blockMinutes: z.number().int().min(20).max(600),
  active: z.boolean(),
}).strict();
export const networkPatchSchema = networkDestinationSchema.omit({ code: true }).partial().strict();
export const networkStorageSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  destinations: z.array(networkDestinationSchema).length(NETWORK_CODES.length)
    .refine(items => new Set(items.map(d => d.code)).size === NETWORK_CODES.length)
    .transform(items => [...items].sort((a, b) => NETWORK_CODES.indexOf(a.code) - NETWORK_CODES.indexOf(b.code))),
}).strict();
export function parseNetworkDestination(value: unknown) {
  const result = networkDestinationSchema.safeParse(value);
  if (!result.success) throw new NetworkError("invalid_network", result.error.issues);
  return result.data;
}
