import { validatePayloadAgainstSchema } from "../../scripts/lib/backend-contract-validation.mjs";

export const mealOperations = {
  getMeals: ["get", "/meals", 200],
  getAdminMeals: ["get", "/admin/meals", 200],
  postAdminMeal: ["post", "/admin/meals", 201],
  patchAdminMeal: ["patch", "/admin/meals/{id}", 200],
  putAdminMealsOrder: ["put", "/admin/meals/order", 200],
  putAdminMealsDefault: ["put", "/admin/meals/default", 200],
};

export function verifyMealCapture(spec, capture) {
  const [method, route] = mealOperations[capture.operationId] ?? [];
  const operation = spec.paths[route]?.[method];
  let response = operation?.responses?.[String(capture.status)];
  if (!response || operation.operationId !== capture.operationId) {
    throw new Error(`Undocumented meals response status: ${capture.operationId}:${capture.status}`);
  }
  if (response.$ref) {
    response = response.$ref.slice(2).split("/").reduce((node, key) => node?.[key], spec);
  }
  const schema = response?.content?.["application/json"]?.schema;
  if (!schema || !/^application\/json(?:;|$)/i.test(capture.contentType ?? "")) {
    throw new Error(`Invalid content-type for ${capture.operationId}:${capture.status}`);
  }
  const validation = validatePayloadAgainstSchema(schema, capture.payload, spec);
  if (!validation.valid) {
    throw new Error(`Invalid actual meals response contract for ${capture.operationId}:${capture.status}: ${validation.errors.join("; ")}`);
  }
  return true;
}
