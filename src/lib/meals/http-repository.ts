import { z } from "zod";
import type { MvpApiClient } from "../api/mvp-client.ts";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}(?![\s\S])/);
export const mealSchema = z.object({ id, label: z.object({ en: z.string().min(1).max(500), ar: z.string().min(1).max(500) }).strict(),
  active: z.boolean(), order: z.number().int().min(0).max(10000) }).strict();
export type MealOption = z.infer<typeof mealSchema>;
export const mealSnapshotSchema = z.object({ revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  meals: z.array(mealSchema), defaultMealId: id.nullable() }).strict().superRefine((catalog, ctx) => {
    if (new Set(catalog.meals.map(item => item.id)).size !== catalog.meals.length
      || (catalog.defaultMealId !== null && !catalog.meals.some(item => item.id === catalog.defaultMealId && item.active))) {
      ctx.addIssue({ code: "custom", message: "Invalid meal catalog/default identity." });
    }
  });
const optionReceipt = z.object({ result: mealSchema, changed: z.boolean() }).strict();
const catalogReceipt = z.object({ result: mealSnapshotSchema, changed: z.boolean() }).strict();
export type MealSnapshot = z.infer<typeof mealSnapshotSchema>;
export type MealCreate = Omit<MealOption, "order"> & { order?: number };
export type MealPatch = Partial<Omit<MealOption, "id">>;

/** Meals-only authority. No invented fare/baggage catalog to fit a legacy interface. */
export class HttpMealRepository {
  private readonly client: () => MvpApiClient;
  constructor(client: () => MvpApiClient) { this.client = client; }
  async getPublic(signal?: AbortSignal) {
    const snapshot = await this.client().request({ method: "GET", path: "/meals", realm: "public", schema: mealSnapshotSchema, signal });
    if (snapshot.meals.some(item => !item.active)) throw new Error("Invalid public meal projection.");
    return snapshot;
  }
  getAdmin(signal?: AbortSignal) { return this.client().request({ method: "GET", path: "/admin/meals", realm: "staff", schema: mealSnapshotSchema, signal }); }
  async create(body: MealCreate) {
    id.parse(body.id);
    const receipt = await this.client().request({ method: "POST", path: "/admin/meals", realm: "staff", schema: optionReceipt, body, statuses: [201] });
    if (receipt.result.id !== body.id) throw new Error("Meal response identity mismatch."); return receipt;
  }
  async patch(mealId: string, body: MealPatch) {
    id.parse(mealId);
    const receipt = await this.client().request({ method: "PATCH", path: `/admin/meals/${mealId}`, realm: "staff", schema: optionReceipt, body });
    if (receipt.result.id !== mealId) throw new Error("Meal response identity mismatch."); return receipt;
  }
  reorder(ids: string[]) {
    ids.forEach(item => id.parse(item));
    return this.client().request({ method: "PUT", path: "/admin/meals/order", realm: "staff", schema: catalogReceipt, body: { ids } });
  }
  setDefault(mealId: string) {
    id.parse(mealId);
    return this.client().request({ method: "PUT", path: "/admin/meals/default", realm: "staff", schema: catalogReceipt, body: { id: mealId } });
  }
}
