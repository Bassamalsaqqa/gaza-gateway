import { catalogOptionSchema } from "./schema.ts";
import { CommercialStorageCoordinator } from "./storage.ts";
import {
  CommercialCatalogError,
  type CommercialCatalogRepository,
  type CommercialCatalogStorageV1,
  type CommercialCatalogSnapshot,
  type CommercialMutationReceipt,
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
  async updateFareWithReceipt(id: FareId, patch: FarePatch) {
    immutablePatch(patch);
    let changed = false;
    const res = view(
      await this.coordinator.mutate((c) => {
        const f = c.catalog.fares.find((f) => f.id === id);
        if (!f) throw new CommercialCatalogError("invalid_catalog");
        const before = JSON.stringify(f);
        Object.assign(f, patch);
        changed = before !== JSON.stringify(f);
        return c;
      }),
    );
    return { result: res, changed };
  }
  async updateFare(id: FareId, patch: FarePatch) {
    return (await this.updateFareWithReceipt(id, patch)).result;
  }
  async updateCabinPricingWithReceipt(id: CabinId, patch: CabinPricingPatch) {
    immutablePatch(patch);
    let changed = false;
    const res = view(
      await this.coordinator.mutate((c) => {
        const cabin = c.catalog.cabins.find((f) => f.id === id);
        if (!cabin) throw new CommercialCatalogError("invalid_catalog");
        const before = JSON.stringify(cabin);
        Object.assign(cabin, patch);
        changed = before !== JSON.stringify(cabin);
        return c;
      }),
    );
    return { result: res, changed };
  }
  async updateCabinPricing(id: CabinId, patch: CabinPricingPatch) {
    return (await this.updateCabinPricingWithReceipt(id, patch)).result;
  }
  async updateBaggageWithReceipt(patch: BaggagePatch) {
    let changed = false;
    const res = view(
      await this.coordinator.mutate((c) => {
        const before = JSON.stringify(c.catalog.baggage);
        Object.assign(c.catalog.baggage, patch);
        changed = before !== JSON.stringify(c.catalog.baggage);
        return c;
      }),
    );
    return { result: res, changed };
  }
  async updateBaggage(patch: BaggagePatch) {
    return (await this.updateBaggageWithReceipt(patch)).result;
  }
  private async createOptionWithReceipt(
    key: "meals" | "assistance",
    input: NewOptionInput,
  ): Promise<{ result: CatalogOption; changed: boolean }> {
    const parsed = catalogOptionSchema.safeParse(input);
    if (!parsed.success) throw new CommercialCatalogError("invalid_catalog");
    input = parsed.data;
    let changed = false;
    const res = await this.coordinator.mutate((c) => {
      const existing = c.catalog[key].find((o) => o.id === input.id);
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(input)) return existing;
        throw new CommercialCatalogError("identity_conflict");
      }
      c.catalog[key].push(structuredClone(input));
      changed = true;
      return c.catalog[key][c.catalog[key].length - 1]!;
    });
    return { result: res, changed };
  }
  private async createOption(
    key: "meals" | "assistance",
    input: NewOptionInput,
  ): Promise<CatalogOption> {
    return (await this.createOptionWithReceipt(key, input)).result;
  }
  private async updateOptionWithReceipt(
    key: "meals" | "assistance",
    id: string,
    patch: OptionPatch,
  ): Promise<{ result: CatalogOption; changed: boolean }> {
    immutablePatch(patch);
    let changed = false;
    const res = await this.coordinator.mutate((c) => {
      const option = c.catalog[key].find((o) => o.id === id);
      if (!option) throw new CommercialCatalogError("invalid_catalog");
      const parsed = catalogOptionSchema.safeParse({ ...option, ...patch });
      if (!parsed.success) throw new CommercialCatalogError("invalid_catalog");
      const before = JSON.stringify(option);
      Object.assign(option, parsed.data);
      changed = before !== JSON.stringify(option);
      return option;
    });
    return { result: res, changed };
  }
  private async updateOption(
    key: "meals" | "assistance",
    id: string,
    patch: OptionPatch,
  ): Promise<CatalogOption> {
    return (await this.updateOptionWithReceipt(key, id, patch)).result;
  }
  private async reorderWithReceipt(
    key: "meals" | "assistance",
    ids: string[],
  ): Promise<CommercialMutationReceipt<CommercialCatalogSnapshot>> {
    let changed = false;
    const res = view(
      await this.coordinator.mutate((c) => {
        if (
          ids.length !== c.catalog[key].length ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => !c.catalog[key].some((o) => o.id === id))
        )
          throw new CommercialCatalogError("invalid_catalog");
        changed = ids.some((id, order) =>
          c.catalog[key].find((option) => option.id === id)!.order !== order,
        );
        ids.forEach((id, order) => {
          c.catalog[key].find((o) => o.id === id)!.order = order;
        });
        return c;
      }),
    );
    return { result: res, changed };
  }
  private async reorder(key: "meals" | "assistance", ids: string[]) {
    return (await this.reorderWithReceipt(key, ids)).result;
  }
  createMeal(input: NewOptionInput) {
    return this.createOption("meals", input);
  }
  createMealWithReceipt(input: NewOptionInput) {
    return this.createOptionWithReceipt("meals", input);
  }
  updateMeal(id: string, patch: OptionPatch) {
    return this.updateOption("meals", id, patch);
  }
  updateMealWithReceipt(id: string, patch: OptionPatch) {
    return this.updateOptionWithReceipt("meals", id, patch);
  }
  reorderMeals(ids: string[]) {
    return this.reorder("meals", ids);
  }
  reorderMealsWithReceipt(ids: string[]) {
    return this.reorderWithReceipt("meals", ids);
  }
  async setDefaultMealWithReceipt(
    id: string,
  ): Promise<CommercialMutationReceipt<CommercialCatalogSnapshot>> {
    let changed = false;
    const res = view(
      await this.coordinator.mutate((c) => {
        if (!c.catalog.meals.some((m) => m.id === id)) {
          throw new CommercialCatalogError("invalid_catalog");
        }
        changed = c.catalog.defaultMealId !== id;
        c.catalog.defaultMealId = id;
        return c;
      }),
    );
    return { result: res, changed };
  }
  async setDefaultMeal(id: string) {
    return (await this.setDefaultMealWithReceipt(id)).result;
  }
  createAssistance(input: NewOptionInput) {
    return this.createOption("assistance", input);
  }
  createAssistanceWithReceipt(input: NewOptionInput) {
    return this.createOptionWithReceipt("assistance", input);
  }
  updateAssistance(id: string, patch: OptionPatch) {
    return this.updateOption("assistance", id, patch);
  }
  updateAssistanceWithReceipt(id: string, patch: OptionPatch) {
    return this.updateOptionWithReceipt("assistance", id, patch);
  }
  reorderAssistance(ids: string[]) {
    return this.reorder("assistance", ids);
  }
  reorderAssistanceWithReceipt(ids: string[]) {
    return this.reorderWithReceipt("assistance", ids);
  }
}
