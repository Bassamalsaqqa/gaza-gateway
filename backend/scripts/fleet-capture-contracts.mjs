import { validatePayloadAgainstSchema } from "../../scripts/lib/backend-contract-validation.mjs";
export const fleetOperations = {
  getFleetAircraft: ["get", "/fleet/aircraft", 200],
  getSeatLayoutById: ["get", "/fleet/seat-layouts/{id}", 200],
  postAdminAircraft: ["post", "/admin/fleet/aircraft", 201],
  patchAdminAircraft: ["patch", "/admin/fleet/aircraft/{id}", 200],
  putAdminSeatLayout: ["put", "/admin/fleet/seat-layouts/{id}", 200],
};
export function verifyFleetCapture(spec, capture) {
  const [method, route] = fleetOperations[capture.operationId] ?? [];
  const operation = spec.paths[route]?.[method];
  let response = operation?.responses?.[String(capture.status)];
  if (!response || operation.operationId !== capture.operationId) throw new Error("Undocumented fleet response status");
  if (response.$ref) response = response.$ref.slice(2).split("/").reduce((node, key) => node?.[key], spec);
  const schema = response?.content?.["application/json"]?.schema;
  if (!schema || !/^application\/json(?:;|$)/i.test(capture.contentType ?? "")
    || !validatePayloadAgainstSchema(schema, capture.payload, spec).valid) throw new Error("Invalid actual fleet response contract");
  return true;
}
