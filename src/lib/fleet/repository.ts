/**
 * Gaza Gateway — Fleet Repository Implementation
 *
 * Implements the canonical FleetRepository contract over FleetStorageCoordinator:
 * - Read operations returning detached snapshots
 * - Atomic aircraft + layout creation with safe default 28 x A-F Economy layout
 * - Immutable aircraft ID enforcement
 * - Unique case-insensitive registration checks
 * - Full aggregate Zod validation on every mutation
 * - Multi-tab subscription propagation
 */

import { defaultNewAircraftLayout } from "./seed.ts";
import { FleetStorageCoordinator } from "./storage.ts";
import {
  FleetError,
  type Aircraft,
  type AircraftCreateInput,
  type AircraftLayout,
  type AircraftUpdatePatch,
  type FleetRepository,
  type FleetSnapshot,
  type LayoutUpdateInput,
} from "./types.ts";

export function newAircraftId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export class LocalFleetRepository implements FleetRepository {
  private readonly coordinator: FleetStorageCoordinator;

  constructor(coordinator: FleetStorageCoordinator = new FleetStorageCoordinator()) {
    this.coordinator = coordinator;
  }

  async get(): Promise<FleetSnapshot> {
    const state = this.coordinator.read();
    return {
      revision: state.revision,
      aircraft: state.aircraft,
      layouts: state.layouts,
    };
  }

  async getAircraftById(id: string): Promise<Aircraft | null> {
    const state = this.coordinator.read();
    const plane = state.aircraft.find((a) => a.id === id);
    return plane ? structuredClone(plane) : null;
  }

  async getLayoutByAircraftId(aircraftId: string): Promise<AircraftLayout | null> {
    const state = this.coordinator.read();
    const layout = state.layouts[aircraftId];
    return layout ? structuredClone(layout) : null;
  }

  async createAircraft(
    input: AircraftCreateInput,
  ): Promise<{ aircraft: Aircraft; layout: AircraftLayout }> {
    const id = input.aircraft.id?.trim() || newAircraftId();
    const registration = input.aircraft.registration.trim().toUpperCase();
    const model = input.aircraft.model.trim();
    const active = input.aircraft.active ?? false; // default inactive per architect requirements

    return this.coordinator.mutate((candidate) => {
      // Check ID uniqueness
      if (candidate.aircraft.some((a) => a.id === id)) {
        throw new FleetError("duplicate_aircraft_id", {
          id: "An aircraft with this ID already exists",
        });
      }

      // Check Registration uniqueness (case-insensitive)
      if (
        candidate.aircraft.some(
          (a) => a.registration.toUpperCase() === registration,
        )
      ) {
        throw new FleetError("duplicate_registration", {
          registration: "Registration is already in use by another aircraft",
        });
      }

      const newPlane: Aircraft = {
        id,
        model,
        registration,
        active,
      };

      const initialLayout: AircraftLayout = input.initialLayout
        ? {
            ...input.initialLayout,
            aircraftId: id,
            letters: input.initialLayout.letters.map((l) => l.toUpperCase()),
            zones: input.initialLayout.zones.map((z) => ({ ...z })).sort((a, b) => a.firstRow - b.firstRow),
            unavailable: input.initialLayout.unavailable.map((u) => u.toUpperCase()),
          }
        : defaultNewAircraftLayout(id);

      candidate.aircraft.push(newPlane);
      candidate.layouts[id] = initialLayout;

      return {
        aircraft: structuredClone(newPlane),
        layout: structuredClone(initialLayout),
      };
    });
  }

  async updateAircraft(id: string, patch: AircraftUpdatePatch): Promise<Aircraft> {
    if ("id" in patch) {
      throw new FleetError("immutable_field", { id: "Aircraft ID is immutable" });
    }

    return this.coordinator.mutate((candidate) => {
      const plane = candidate.aircraft.find((a) => a.id === id);
      if (!plane) {
        throw new FleetError("aircraft_not_found");
      }

      if (patch.registration !== undefined) {
        const normalized = patch.registration.trim().toUpperCase();
        const conflict = candidate.aircraft.some(
          (a) => a.id !== id && a.registration.toUpperCase() === normalized,
        );
        if (conflict) {
          throw new FleetError("duplicate_registration", {
            registration: "Registration is already in use by another aircraft",
          });
        }
        plane.registration = normalized;
      }

      if (patch.model !== undefined) {
        plane.model = patch.model.trim();
      }

      if (patch.active !== undefined) {
        plane.active = patch.active;
      }

      return structuredClone(plane);
    });
  }

  async updateLayout(
    aircraftId: string,
    input: LayoutUpdateInput,
  ): Promise<AircraftLayout> {
    return this.coordinator.mutate((candidate) => {
      const plane = candidate.aircraft.find((a) => a.id === aircraftId);
      if (!plane) {
        throw new FleetError("aircraft_not_found");
      }

      const existingLayout = candidate.layouts[aircraftId];
      if (!existingLayout) {
        throw new FleetError("layout_not_found");
      }

      const updatedLayout: AircraftLayout = {
        aircraftId,
        rows: input.rows,
        letters: input.letters.map((l) => l.toUpperCase()),
        aisleAfter: input.aisleAfter,
        zones: input.zones.map((z) => ({ ...z })).sort((a, b) => a.firstRow - b.firstRow),
        extraLegroomRows: [...input.extraLegroomRows],
        unavailable: input.unavailable.map((u) => u.toUpperCase()),
      };

      candidate.layouts[aircraftId] = updatedLayout;
      return structuredClone(updatedLayout);
    });
  }

  subscribe(listener: () => void): () => void {
    return this.coordinator.subscribe(listener);
  }
}
