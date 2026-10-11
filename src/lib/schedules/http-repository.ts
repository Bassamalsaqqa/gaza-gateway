import type { MvpApiClient } from "../api/mvp-client.ts";
import type { ScheduleRepository, ScheduleCreateInput, ScheduleUpdateInput } from "./types.ts";
import { encodeScheduleKey } from "../offerings/codec.ts";
import { schedulesWireSchema, scheduleReceiptSchema, scheduleWireSchema } from "../offerings/schema.ts";

/** Reads server authority without supplementing missing or retired schedules with fixtures. */
export class HttpScheduleRepository implements ScheduleRepository {
  private readonly client: () => MvpApiClient;
  private readonly listeners = new Set<() => void>();
  constructor(client: () => MvpApiClient) { this.client = client; }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private notify() { for (const listener of this.listeners) { try { listener(); } catch { /* Server commit survives subscriber failure. */ } } }
  list() { return this.client().request({ method: "GET", path: "/admin/schedules", realm: "staff", schema: schedulesWireSchema }); }
  async listForDiscovery() {
    const items = await this.client().request({ method: "GET", path: "/schedules", realm: "public", schema: schedulesWireSchema });
    if (items.some(item => !item.active)) throw new Error("Invalid public schedule projection.");
    return items;
  }
  async getById(id: string) { encodeScheduleKey(id); return (await this.list()).find(item => item.id === id) ?? null; }
  async createWithReceipt(input: ScheduleCreateInput) {
    const body = scheduleWireSchema.parse(input);
    const receipt = await this.client().request({ method: "POST", path: "/admin/schedules", realm: "staff", body, schema: scheduleReceiptSchema, statuses: [201] });
    if (receipt.schedule.id !== body.id) throw new Error("Invalid schedule receipt identity.");
    if (receipt.changed) this.notify(); return receipt;
  }
  async create(input: ScheduleCreateInput) { return (await this.createWithReceipt(input)).schedule; }
  async updateWithReceipt(id: string, patch: ScheduleUpdateInput) {
    const key = encodeScheduleKey(id);
    if (["id", "direction", "destination"].some(field => field in patch)) throw new Error("Schedule route identity is immutable.");
    const receipt = await this.client().request({ method: "PATCH", path: `/admin/schedules/${key}`, realm: "staff", body: patch, schema: scheduleReceiptSchema });
    if (receipt.schedule.id !== id) throw new Error("Invalid schedule receipt identity.");
    if (receipt.changed) this.notify(); return receipt;
  }
  async update(id: string, patch: ScheduleUpdateInput) { return (await this.updateWithReceipt(id, patch)).schedule; }
}
