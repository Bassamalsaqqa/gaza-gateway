import { catalogOptionSchema } from "./schema.ts";
import { CommercialStorageCoordinator } from "./storage.ts";
import {
  CommercialCatalogError,
  type CommercialCatalogRepository,
  type CommercialCatalogStorageV1,
  type FareId,
  type CabinId,
  type FarePatch,
  type CabinPricingPatch,
  type BaggagePatch,
  type OptionPatch,
  type NewOptionInput,
  type CatalogOption,
} from "./types.ts";
export function newCommercialOptionId(kind: "meal" | "assistance"): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${kind}-${crypto.randomUUID()}`;
  const values = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(values);
  else for (let i = 0; i < values.length; i++) values[i] = Math.floor(Math.random() * 256);
  return `${kind}-${Array.from(values, (n) => n.toString(16).padStart(2, "0")).join("")}`;
}
function immutablePatch(patch: object) {
  if ("id" in patch) throw new CommercialCatalogError("invalid_catalog");
}
function view(state: CommercialCatalogStorageV1) {
  return { revision: state.revision, catalog: state.catalog };
}
export class LocalCommercialCatalogRepository implements CommercialCatalogRepository {
  private readonly coordinator: CommercialStorageCoordinator;
  constructor(coordinator: CommercialStorageCoordinator = new CommercialStorageCoordinator()) {
    this.coordinator = coordinator;
  }
  async get() {
    return view(this.coordinator.read());
  }
  subscribe(listener: () => void) {
    return this.coordinator.subscribe(listener);
  }
  async updateFare(id: FareId, patch: FarePatch) {
    immutablePatch(patch);
    return view(
      await this.coordinator.mutate((c) => {
        const f = c.catalog.fares.find((f) => f.id === id);
        if (!f) throw new CommercialCatalogError("invalid_catalog");
        Object.assign(f, patch);
        return c;
      }),
    );
  }
  async updateCabinPricing(id: CabinId, patch: CabinPricingPatch) {
    immutablePatch(patch);
    return view(
      await this.coordinator.mutate((c) => {
        const cabin = c.catalog.cabins.find((f) => f.id === id);
        if (!cabin) throw new CommercialCatalogError("invalid_catalog");
        Object.assign(cabin, patch);
        return c;
      }),
    );
  }
  async updateBaggage(patch: BaggagePatch) {
    return view(
      await this.coordinator.mutate((c) => {
        Object.assign(c.catalog.baggage, patch);
        return c;
      }),
    );
  }
  private async createOption(
    key: "meals" | "assistance",
    input: NewOptionInput,
  ): Promise<CatalogOption> {
    const parsed = catalogOptionSchema.safeParse(input);
    if (!parsed.success) throw new CommercialCatalogError("invalid_catalog");
    input = parsed.data;
    return this.coordinator.mutate((c) => {
      const existing = c.catalog[key].find((o) => o.id === input.id);
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(input)) return existing;
        throw new CommercialCatalogError("identity_conflict");
      }
      c.catalog[key].push(structuredClone(input));
      return c.catalog[key][c.catalog[key].length - 1]!;
    });
  }
  private async updateOption(
    key: "meals" | "assistance",
    id: string,
    patch: OptionPatch,
  ): Promise<CatalogOption> {
    immutablePatch(patch);
    return this.coordinator.mutate((c) => {
      const option = c.catalog[key].find((o) => o.id === id);
      if (!option) throw new CommercialCatalogError("invalid_catalog");
      const parsed = catalogOptionSchema.safeParse({ ...option, ...patch });
      if (!parsed.success) throw new CommercialCatalogError("invalid_catalog");
      Object.assign(option, parsed.data);
      return option;
    });
  }
  private async reorder(key: "meals" | "assistance", ids: string[]) {
    return view(
      await this.coordinator.mutate((c) => {
        if (
          ids.length !== c.catalog[key].length ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => !c.catalog[key].some((o) => o.id === id))
        )
          throw new CommercialCatalogError("invalid_catalog");
        ids.forEach((id, order) => {
          c.catalog[key].find((o) => o.id === id)!.order = order;
        });
        return c;
      }),
    );
  }
  createMeal(input: NewOptionInput) {
    return this.createOption("meals", input);
  }
  updateMeal(id: string, patch: OptionPatch) {
    return this.updateOption("meals", id, patch);
  }
  reorderMeals(ids: string[]) {
    return this.reorder("meals", ids);
  }
  async setDefaultMeal(id: string) {
    return view(
      await this.coordinator.mutate((c) => {
        c.catalog.defaultMealId = id;
        return c;
      }),
    );
  }
  createAssistance(input: NewOptionInput) {
    return this.createOption("assistance", input);
  }
  updateAssistance(id: string, patch: OptionPatch) {
    return this.updateOption("assistance", id, patch);
  }
  reorderAssistance(ids: string[]) {
    return this.reorder("assistance", ids);
  }
}
