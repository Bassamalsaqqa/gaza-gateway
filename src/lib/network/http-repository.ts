import { z } from "zod";
import { type MvpApiClient } from "../api/mvp-client.ts";
import { NETWORK_CODES, NetworkError, type NetworkDestination, type NetworkDestinationPatch, type NetworkRepository } from "./types.ts";
import { isIanaTimezone } from "./schema.ts";

const label = z.string().min(1).max(160);
const bilingual = z.object({ en: label, ar: label }).strict();
export const airportWireSchema = z.object({
  code: z.enum(["GZA", ...NETWORK_CODES]), airportName: bilingual, city: bilingual, country: bilingual,
  timezone: z.string().min(1).max(80).refine(isIanaTimezone),
  blockMinutes: z.number().int().min(20).max(1440), active: z.boolean(),
}).strict();
export type AirportReference = z.infer<typeof airportWireSchema>;
const airportsSchema = z.array(airportWireSchema).refine(items => new Set(items.map(item => item.code)).size === items.length);
const receiptSchema = z.object({ airport: airportWireSchema, changed: z.boolean(), revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).strict();

/** Shared server reference; empty/partial authority stays empty/partial. */
export class HttpNetworkRepository implements NetworkRepository {
  private readonly client: () => MvpApiClient;
  private readonly listeners = new Set<() => void>();
  constructor(client: () => MvpApiClient) { this.client = client; }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private notify() { for (const listener of this.listeners) { try { listener(); } catch { /* A subscriber cannot undo a durable server write. */ } } }
  async list(): Promise<NetworkDestination[]> {
    const items = await this.client().request({ method: "GET", path: "/network/airports", realm: "public", schema: airportsSchema });
    if (items.some(item => !item.active)) throw new NetworkError("invalid_network");
    return items.filter((item): item is NetworkDestination => item.code !== "GZA");
  }
  listAdmin(signal?: AbortSignal) {
    return this.client().request({ method: "GET", path: "/admin/network/airports", realm: "staff", schema: airportsSchema, signal });
  }
  async getByCode(code: string): Promise<NetworkDestination | null> { return (await this.list()).find(item => item.code === code) ?? null; }
  async create(input: AirportReference) {
    const body = airportWireSchema.parse(input);
    const receipt = await this.client().request({ method: "POST", path: "/admin/network/airports/receipt", realm: "staff", schema: receiptSchema, body, statuses: [201] });
    if (receipt.airport.code !== body.code) throw new NetworkError("invalid_network");
    if (receipt.changed) this.notify(); return receipt;
  }
  async patchAirport(code: string, patch: NetworkDestinationPatch) {
    if (!["GZA", ...NETWORK_CODES].includes(code as AirportReference["code"]) || "code" in patch) throw new NetworkError("immutable_code");
    const receipt = await this.client().request({ method: "PATCH", path: `/admin/network/airports/${code}/receipt`, realm: "staff", schema: receiptSchema, body: patch });
    if (receipt.airport.code !== code) throw new NetworkError("invalid_network");
    if (receipt.changed) this.notify(); return receipt;
  }
  async updateWithReceipt(code: string, patch: NetworkDestinationPatch) {
    if (!NETWORK_CODES.includes(code as NetworkDestination["code"])) throw new NetworkError("immutable_code");
    const receipt = await this.patchAirport(code, patch);
    return { destination: receipt.airport as NetworkDestination, changed: receipt.changed };
  }
  async update(code: string, patch: NetworkDestinationPatch) { return (await this.updateWithReceipt(code, patch)).destination; }
}
