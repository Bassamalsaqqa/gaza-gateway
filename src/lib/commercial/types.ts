import type { Fare, CabinId, Bilingual } from "../data.ts";
export type FareId = Fare["id"];
export type { CabinId };
export interface FareProduct extends Fare {
  active: boolean;
  allowedCabins: CabinId[];
  order: number;
}
export interface CabinPricing {
  id: CabinId;
  multiplier: number;
}
export interface BaggagePolicy {
  cabinKg: number;
  cabinDims: string;
  checkedKg: number;
  extraBagPrice: number;
  note: Bilingual;
}
export interface CatalogOption {
  id: string;
  label: Bilingual;
  active: boolean;
  order: number;
}
export interface CommercialCatalog {
  fares: FareProduct[];
  cabins: CabinPricing[];
  baggage: BaggagePolicy;
  meals: CatalogOption[];
  defaultMealId: string;
  assistance: CatalogOption[];
}
export interface CommercialCatalogSnapshot {
  revision: number;
  catalog: CommercialCatalog;
}
export interface CommercialCatalogStorageV1 extends CommercialCatalogSnapshot {
  schemaVersion: 1;
}
export type FarePatch = Partial<Omit<FareProduct, "id">>;
export type CabinPricingPatch = Partial<Omit<CabinPricing, "id">>;
export type BaggagePatch = Partial<BaggagePolicy>;
export type OptionPatch = Partial<Omit<CatalogOption, "id">>;
export type NewOptionInput = CatalogOption;
export interface CommercialMutationReceipt<T = unknown> {
  result: T;
  changed: boolean;
}
export interface CommercialCatalogRepository {
  get(): Promise<CommercialCatalogSnapshot>;
  updateFare(id: FareId, patch: FarePatch): Promise<CommercialCatalogSnapshot>;
  updateFareWithReceipt(id: FareId, patch: FarePatch): Promise<CommercialMutationReceipt<CommercialCatalogSnapshot>>;
  updateCabinPricing(id: CabinId, patch: CabinPricingPatch): Promise<CommercialCatalogSnapshot>;
  updateCabinPricingWithReceipt(id: CabinId, patch: CabinPricingPatch): Promise<CommercialMutationReceipt<CommercialCatalogSnapshot>>;
  updateBaggage(patch: BaggagePatch): Promise<CommercialCatalogSnapshot>;
  updateBaggageWithReceipt(patch: BaggagePatch): Promise<CommercialMutationReceipt<CommercialCatalogSnapshot>>;
  createMeal(input: NewOptionInput): Promise<CatalogOption>;
  createMealWithReceipt(input: NewOptionInput): Promise<CommercialMutationReceipt<CatalogOption>>;
  updateMeal(id: string, patch: OptionPatch): Promise<CatalogOption>;
  updateMealWithReceipt(id: string, patch: OptionPatch): Promise<CommercialMutationReceipt<CatalogOption>>;
  reorderMeals(ids: string[]): Promise<CommercialCatalogSnapshot>;
  reorderMealsWithReceipt(ids: string[]): Promise<CommercialMutationReceipt<CommercialCatalogSnapshot>>;
  setDefaultMeal(id: string): Promise<CommercialCatalogSnapshot>;
  setDefaultMealWithReceipt(id: string): Promise<CommercialMutationReceipt<CommercialCatalogSnapshot>>;
  createAssistance(input: NewOptionInput): Promise<CatalogOption>;
  createAssistanceWithReceipt(input: NewOptionInput): Promise<CommercialMutationReceipt<CatalogOption>>;
  updateAssistance(id: string, patch: OptionPatch): Promise<CatalogOption>;
  updateAssistanceWithReceipt(id: string, patch: OptionPatch): Promise<CommercialMutationReceipt<CatalogOption>>;
  reorderAssistance(ids: string[]): Promise<CommercialCatalogSnapshot>;
  reorderAssistanceWithReceipt(ids: string[]): Promise<CommercialMutationReceipt<CommercialCatalogSnapshot>>;
  subscribe(listener: () => void): () => void;
}
export interface BookingPricingSnapshotV1 {
  version: 1;
  catalogRevision: number;
  basis: "catalog" | "legacy";
  fareId: FareId;
  fareMultiplier: number;
  cabinId: CabinId;
  cabinMultiplier: number;
  checkedBags: number;
  checkedBagKg: number;
  cabinBagKg: number;
  cabinBagDims: string;
  extraBagPrice: number;
  taxRate: number;
  seatPricing: {
    policy: "legacy-row-v1";
    standardSeatPrice: number;
    extraLegroomPrice: number;
    extraLegroomRows: number[];
  };
}
export type CommercialFailureReason =
  | "invalid_catalog"
  | "catalog_unavailable"
  | "fare_unavailable"
  | "service_unavailable"
  | "identity_conflict";
export class CommercialCatalogError extends Error {
  public readonly reason: CommercialFailureReason;
  public readonly fields: Record<string, string>;
  constructor(reason: CommercialFailureReason, fields: Record<string, string> = {}) {
    super(reason);
    this.name = "CommercialCatalogError";
    this.reason = reason;
    this.fields = fields;
  }
}
export function catalogErrorKey(error: unknown): string {
  if (error instanceof CommercialCatalogError) return `commercial.error.${error.reason}`;
  return error instanceof Error && error.name === "StorageCommitError"
    ? "commercial.error.storage"
    : "commercial.error.retry";
}
