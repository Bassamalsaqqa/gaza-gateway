import { validatePayloadAgainstSchema } from "../../scripts/lib/backend-contract-validation.mjs";

export const scheduleOperations = {
  getSchedules: ["get", "/schedules", 200],
  getAdminSchedules: ["get", "/admin/schedules", 200],
  postAdminSchedule: ["post", "/admin/schedules", 201],
  patchAdminSchedule: ["patch", "/admin/schedules/{key}", 200],
  getOfferings: ["get", "/offerings", 200],
  getOfferingById: ["get", "/offerings/{id}", 200],
};

export function verifyScheduleCapture(spec, capture) {
  const [method, route] = scheduleOperations[capture.operationId] ?? [];
  const operation = spec.paths[route]?.[method];
  let response = operation?.responses?.[String(capture.status)];
  if (!response || operation.operationId !== capture.operationId) {
    throw new Error(`Undocumented schedules response status: ${capture.operationId}:${capture.status}`);
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
    throw new Error(`Invalid actual schedules response contract for ${capture.operationId}:${capture.status}: ${validation.errors.join("; ")}`);
  }
  return true;
}
