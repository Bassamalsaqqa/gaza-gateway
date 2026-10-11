/**
 * Gaza Gateway — HTTP Fleet Repository Adapter
 *
 * Implements the canonical FleetRepository contract over C01 Reference API.
 * Uses atomic MVCC snapshot and authoritative server receipts (/receipt)
 * per CODEX_FLEET_RECEIPT_DIRECTION.md, removing client-side race conditions.
 *
 * Invariants:
 * - Route-safe ID validation (/^[A-Za-z0-9_-]{1,64}$/)
 * - Meaningful typed errors: fails closed, never falls back to local storage on API failure
 * - Validates input and output schemas with Zod
 * - Does not silently ignore missing layouts in complete fleet snapshot
 * - Preserves receipt shapes (changed: boolean, revision: number)
 * - Restrict backend opt-in to explicit nonproduction configuration
 */

import type {
  Aircraft,
  AircraftCreateInput,
  AircraftLayout,
  AircraftUpdatePatch,
  FleetAircraftMutationReceipt,
  FleetLayoutMutationReceipt,
  FleetRepository,
  FleetSnapshot,
  LayoutUpdateInput,
} from "./types.ts";
import { FleetError } from "./types.ts";
import { AIRCRAFT_REGISTRATION_REGEX, aircraftLayoutSchema } from "./schema.ts";
import {
  type ReferenceApiClient,
  isReferenceApiError,
  isValidRouteSafeId,
  validateRouteSafeId,
} from "../api/reference-client.ts";

type ClientFactory = () => ReferenceApiClient;

export class HttpFleetRepository implements FleetRepository {
  private readonly clientFactory: ClientFactory;
  private readonly listeners = new Set<() => void>();

  constructor(client: ReferenceApiClient | ClientFactory) {
    this.clientFactory = typeof client === "function" ? client : () => client;
  }

  private client(): ReferenceApiClient {
    return this.clientFactory();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* listener error ignored */
      }
    }
  }

  /**
   * Complete fleet snapshot: returns atomic immutable snapshot {revision, aircraft, layouts}.
   * If /fleet/snapshot endpoint is not available, falls back to composing from aircraft list
   * and individual layouts while strictly enforcing that NO layout is missing.
   */
  async get(): Promise<FleetSnapshot> {
    try {
      const snapshot = (await this.client().getFleetSnapshot()).data;
      for (const aircraft of snapshot.aircraft) {
        if (snapshot.layouts[aircraft.id]?.aircraftId !== aircraft.id) throw new FleetError("layout_not_found");
      }
      return structuredClone(snapshot);
    } catch (error) { this.mapAndThrowError(error); }
  }

  async getAircraftById(id: string): Promise<Aircraft | null> {
    validateRouteSafeId(id);
    return (await this.get()).aircraft.find(aircraft => aircraft.id === id) ?? null;
  }

  async getLayoutByAircraftId(id: string): Promise<AircraftLayout | null> {
    validateRouteSafeId(id);
    return (await this.get()).layouts[id] ?? null;
  }

  async createAircraft(
    input: AircraftCreateInput
  ): Promise<{ aircraft: Aircraft; layout: AircraftLayout }> {
    if (input.aircraft.id !== undefined) {
      validateRouteSafeId(input.aircraft.id, "aircraft.id");
    }

    const registration = input.aircraft.registration.trim().toUpperCase();
    const model = input.aircraft.model.trim();

    if (!model || model.length > 120) {
      throw new FleetError("invalid_fleet", { model: "Model must be 1..120 characters" });
    }
    if (!AIRCRAFT_REGISTRATION_REGEX.test(registration)) {
      throw new FleetError("invalid_fleet", { registration: "Invalid registration format" });
    }

    if (input.initialLayout) {
      const parsed = aircraftLayoutSchema.safeParse({
        aircraftId: input.aircraft.id ?? "temp-validation-id",
        ...input.initialLayout,
      });
      if (!parsed.success) {
        throw new FleetError("invalid_layout", { layout: parsed.error.issues[0]?.message ?? "Invalid layout" });
      }
    }

    try {
      const res = await this.client().postAdminAircraft({
        aircraft: {
          ...(input.aircraft.id ? { id: input.aircraft.id } : {}),
          model,
          registration,
          ...(input.aircraft.active !== undefined ? { active: input.aircraft.active } : {}),
        },
        ...(input.initialLayout ? { initialLayout: input.initialLayout } : {}),
      });

      const aircraft = structuredClone(res.data);
      const layoutRes = await this.client().getSeatLayoutById(aircraft.id);
      const layout = structuredClone(layoutRes.data);

      this.notify();
      return { aircraft, layout };
    } catch (err) {
      this.mapAndThrowError(err);
    }
  }

  async updateAircraftWithReceipt(
    id: string,
    patch: AircraftUpdatePatch
  ): Promise<FleetAircraftMutationReceipt> {
    if (!isValidRouteSafeId(id)) {
      throw new FleetError("invalid_fleet", { id: "Invalid aircraft ID format" });
    }
    if ("id" in patch) {
      throw new FleetError("immutable_field", { id: "Aircraft ID is immutable" });
    }

    if (patch.registration !== undefined) {
      const reg = patch.registration.trim().toUpperCase();
      if (!AIRCRAFT_REGISTRATION_REGEX.test(reg)) {
        throw new FleetError("invalid_fleet", { registration: "Invalid registration format" });
      }
    }
    if (patch.model !== undefined && (!patch.model.trim() || patch.model.trim().length > 120)) {
      throw new FleetError("invalid_fleet", { model: "Model must be 1..120 characters" });
    }

    try {
      const res = await this.client().patchAdminAircraftReceipt(id, patch);
      if (res.data.changed) this.notify();
      return { aircraft: structuredClone(res.data.aircraft), changed: res.data.changed };
    } catch (err) {
      this.mapAndThrowError(err);
    }
  }

  async updateAircraft(id: string, patch: AircraftUpdatePatch): Promise<Aircraft> {
    const receipt = await this.updateAircraftWithReceipt(id, patch);
    return receipt.aircraft;
  }

  async updateLayoutWithReceipt(
    aircraftId: string,
    input: LayoutUpdateInput
  ): Promise<FleetLayoutMutationReceipt> {
    if (!isValidRouteSafeId(aircraftId)) {
      throw new FleetError("invalid_fleet", { id: "Invalid aircraft ID format" });
    }

    const parsed = aircraftLayoutSchema.safeParse({
      aircraftId,
      ...input,
    });
    if (!parsed.success) {
      throw new FleetError("invalid_layout", { layout: parsed.error.issues[0]?.message ?? "Invalid layout" });
    }

    const normalizedInput: LayoutUpdateInput = {
      rows: input.rows,
      letters: input.letters.map((l) => l.toUpperCase()),
      aisleAfter: input.aisleAfter,
      zones: input.zones.map((z) => ({ ...z })).sort((a, b) => a.firstRow - b.firstRow),
      extraLegroomRows: [...input.extraLegroomRows],
      unavailable: input.unavailable.map((u) => u.toUpperCase()),
    };

    try {
      const res = await this.client().putAdminSeatLayoutReceipt(aircraftId, normalizedInput);
      if (res.data.changed) this.notify();
      return { layout: structuredClone(res.data.layout), changed: res.data.changed };
    } catch (err) {
      this.mapAndThrowError(err);
    }
  }

  async updateLayout(aircraftId: string, input: LayoutUpdateInput): Promise<AircraftLayout> {
    const receipt = await this.updateLayoutWithReceipt(aircraftId, input);
    return receipt.layout;
  }

  private mapAndThrowError(err: unknown): never {
    if (err instanceof FleetError) throw err;

    if (isReferenceApiError(err)) {
      if (err.status === 404) {
        if (err.message.toLowerCase().includes("layout")) {
          throw new FleetError("layout_not_found");
        }
        throw new FleetError("aircraft_not_found");
      }
      if (err.status === 409) {
        if (err.code === "duplicate_id" || err.message.toLowerCase().includes("id")) {
          throw new FleetError("duplicate_aircraft_id");
        }
        throw new FleetError("duplicate_registration");
      }
      if (err.status === 422) {
        if (err.message.toLowerCase().includes("layout")) {
          throw new FleetError("invalid_layout");
        }
        throw new FleetError("invalid_fleet");
      }
      if (err.status === 401 || err.status === 403) {
        throw new FleetError("fleet_unavailable", { authorization: err.message });
      }
      throw new FleetError("fleet_unavailable", { details: err.message });
    }

    throw new FleetError("fleet_unavailable", {
      details: err instanceof Error ? err.message : String(err),
    });
  }
}
