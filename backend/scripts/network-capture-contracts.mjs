import { validatePayloadAgainstSchema } from "../../scripts/lib/backend-contract-validation.mjs";

export const networkOperations = {
  postMvpAirportReceipt: ["post", "/admin/network/airports/receipt", 201],
  patchMvpAirportReceipt: ["patch", "/admin/network/airports/{code}/receipt", 200],
  getAirports: ["get", "/network/airports", 200],
  getNetworkRoutes: ["get", "/network/routes", 200],
  getAdminAirports: ["get", "/admin/network/airports", 200],
  postAdminAirport: ["post", "/admin/network/airports", 201],
  patchAdminAirport: ["patch", "/admin/network/airports/{code}", 200],
};

export function verifyNetworkCapture(spec, capture) {
  const [method, route] = networkOperations[capture.operationId] ?? [];
  const operation = spec.paths[route]?.[method];
  let response = operation?.responses?.[String(capture.status)];
  if (!response || operation.operationId !== capture.operationId) {
    throw new Error("Undocumented network response status: " + capture.operationId + " " + capture.status);
  }
  if (response.$ref) {
    response = response.$ref.slice(2).split("/").reduce((node, key) => node?.[key], spec);
  }
  const schema = response?.content?.["application/json"]?.schema;
  if (!schema || !/^application\/json(?:;|$)/i.test(capture.contentType ?? "")
    || !validatePayloadAgainstSchema(schema, capture.payload, spec).valid) {
    throw new Error("Invalid actual network response contract: " + capture.operationId + " " + capture.status);
  }
  return true;
}
