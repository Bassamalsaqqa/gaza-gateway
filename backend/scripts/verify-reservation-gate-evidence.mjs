import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reservationOperations, verifyReservationCapture } from "./reservation-capture-contracts.mjs";
import { validatePayloadAgainstSchema, validateOpenApiSpecification } from "../../scripts/lib/backend-contract-validation.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const captureFile = path.resolve(process.argv[2] ?? "");
const filter = process.env.RESERVATION_GATE_TEST_FILTER;
  const spec = JSON.parse(fs.readFileSync(path.join(root, "docs/backend/mvp-reservations.openapi.json")));
  const validation = validateOpenApiSpecification(spec);
  if (!validation.valid) throw new Error("OpenAPI preflight: " + validation.errors.join("; "));
  console.log("PASS OpenAPI 3.1.0 specification validation");

  const expected = {
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

  const captures = JSON.parse(fs.readFileSync(captureFile));

  for (const [id, [method, route, status]] of (filter ? [] : Object.entries(expected))) {
    const operation = spec.paths[route]?.[method], capture = captures[id + ":" + status];
    if (operation?.operationId !== id || !capture || capture.status !== status || !capture.contentType.startsWith("application/json")) {
      throw new Error("Operation capture: " + id);
    }
    const schema = operation.responses[String(status)].content["application/json"].schema;
    if (!validatePayloadAgainstSchema(schema, capture.payload, spec).valid) {
      throw new Error("Response contract: " + id);
    }
    if (validatePayloadAgainstSchema(schema, { ...capture.payload, success: false }, spec).valid
      || validatePayloadAgainstSchema(schema, { ...capture.payload, injected: true }, spec).valid) {
      throw new Error("Negative response: " + id);
    }

    // Policy verification
    if (id === "getOfferingSeats") {
      if (operation.security.length !== 0 || operation["x-authority-policy"] !== "public") {
        throw new Error("Policy drift: public getOfferingSeats");
      }
    } else if (id === "getAdminReservations" || id === "getAdminReservationByRef") {
      if (operation["x-required-permission"] !== "commercial.view"
        || JSON.stringify(operation.security) !== '[{"StaffCookieAuth":[]}]'
        || operation["x-authority-policy"] !== "staff") {
        throw new Error("Policy drift: " + id);
      }
    } else if (id === "postAdminReservationCancel") {
      if (operation["x-required-permission"] !== "commercial.edit"
        || JSON.stringify(operation.security) !== '[{"StaffCookieAuth":[]}]'
        || operation["x-authority-policy"] !== "staff"
        || operation["x-protocol"]?.branches?.[0]?.csrf !== "staff"
        || operation["x-protocol"]?.branches?.[0]?.origin !== "configured_frontend") {
        throw new Error("Policy drift: postAdminReservationCancel");
      }
    } else {
      // Passenger operations
      if (JSON.stringify(operation.security) !== '[{"PassengerCookieAuth":[]}]'
        || operation["x-authority-policy"] !== "passenger") {
        throw new Error("Policy drift: passenger operation " + id);
      }
      if (id === "postReservation" || id === "postReservationCancel") {
        if (operation["x-protocol"]?.branches?.[0]?.csrf !== "passenger"
          || operation["x-protocol"]?.branches?.[0]?.origin !== "configured_frontend") {
          throw new Error("Policy drift: passenger write operation " + id);
        }
      }
    }
    console.log("PASS actual response + negative controls + policy " + id);
  }

  let negatives = 0;
  for (const capture of Object.values(captures)) {
    verifyReservationCapture(spec, capture);
    if (capture.status >= 400) {
      negatives++;
      const corrupt = structuredClone(spec), [method, route] = reservationOperations[capture.operationId];
      delete corrupt.paths[route][method].responses[String(capture.status)];
      let rejected = false;
      try { verifyReservationCapture(corrupt, capture); } catch { rejected = true; }
      if (!rejected) throw new Error("Undocumented status control escaped: " + capture.operationId + ":" + capture.status);

      rejected = false;
      try { verifyReservationCapture(spec, { ...capture, contentType: "text/plain" }); } catch { rejected = true; }
      if (!rejected) throw new Error("Negative content-type control escaped: " + capture.operationId + ":" + capture.status);

      rejected = false;
      try { verifyReservationCapture(spec, { ...capture, payload: { ...capture.payload, success: true } }); } catch { rejected = true; }
      if (!rejected) throw new Error("Negative schema control escaped: " + capture.operationId + ":" + capture.status);
    }
  }

  const required = {
    getOfferingSeats: [400, 404, 429, 503],
    postReservation: [400, 401, 403, 404, 409, 415, 422, 429, 503],
    getReservations: [400, 401, 403, 429, 503],
    getReservationByRef: [400, 401, 403, 404, 429, 503],
    postReservationCancel: [400, 401, 403, 404, 429, 503],
    getReservationTicket: [400, 401, 403, 404, 429, 503],
    getAdminReservations: [400, 401, 403, 429, 503],
    getAdminReservationByRef: [400, 401, 403, 404, 429, 503],
    postAdminReservationCancel: [400, 401, 403, 404, 429, 503],
  };

  for (const [id, statuses] of (filter ? [] : Object.entries(required))) {
    for (const status of statuses) {
      if (!captures[id + ":" + status]) throw new Error("Missing actual negative response: " + id + " " + status);
    }
  }
  console.log("PASS " + negatives + " actual error contracts + undocumented-status/content-type/schema controls");
