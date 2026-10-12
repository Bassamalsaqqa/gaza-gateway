import { validatePayloadAgainstSchema, resolveJsonPointer } from "../../scripts/lib/backend-contract-validation.mjs";
export function verifyMailCapture(spec, capture) {
  const operation = Object.values(spec.paths).flatMap(p => Object.values(p)).find(op => op.operationId === capture.operationId);
  let response = operation?.responses?.[capture.status];
  const seen = new Set();
  while (response?.$ref) {
    if (seen.has(response.$ref)) throw new Error("Cyclic response reference");
    seen.add(response.$ref); const resolved = resolveJsonPointer(spec, response.$ref);
    if (!resolved.valid) throw new Error(resolved.reason);
    response = resolved.target;
  }
  const schema = response?.content?.["application/json"]?.schema;
  if (!schema || !/^application\/json(?:;|$)/i.test(capture.contentType ?? "")) throw new Error("Undocumented mail response: " + capture.operationId + ":" + capture.status);
  const result = validatePayloadAgainstSchema(schema, capture.payload, spec);
  if (!result.valid) throw new Error("Mail response mismatch: " + result.errors.join("; "));
  if (capture.status < 300 && validatePayloadAgainstSchema(schema, { ...capture.payload, success: false }, spec).valid) throw new Error("False success accepted");
  return true;
}
