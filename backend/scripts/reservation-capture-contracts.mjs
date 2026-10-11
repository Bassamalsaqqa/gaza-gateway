import { validatePayloadAgainstSchema } from "../../scripts/lib/backend-contract-validation.mjs";

export const reservationOperations = {
  getOfferingSeats: ["get", "/offerings/{id}/seats", 200],
  postReservation: ["post", "/reservations", 201],
  getReservations: ["get", "/reservations", 200],
  getReservationByRef: ["get", "/reservations/{ref}", 200],
  postReservationCancel: ["post", "/reservations/{ref}/cancel", 200],
  getReservationTicket: ["get", "/reservations/{ref}/ticket", 200],
  getAdminReservations: ["get", "/admin/reservations", 200],
  getAdminReservationByRef: ["get", "/admin/reservations/{ref}", 200],
  postAdminReservationCancel: ["post", "/admin/reservations/{ref}/cancel", 200],
};

export function verifyReservationCapture(spec, capture) {
  const [method, route] = reservationOperations[capture.operationId] ?? [];
  const operation = spec.paths?.[route]?.[method];
  let response = operation?.responses?.[String(capture.status)];
  if (!response || operation.operationId !== capture.operationId) {
    throw new Error(`Undocumented reservations response status: ${capture.operationId}:${capture.status}`);
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
    throw new Error(`Invalid actual reservations response contract for ${capture.operationId}:${capture.status}: ${validation.errors.join("; ")}`);
  }
  return true;
}
