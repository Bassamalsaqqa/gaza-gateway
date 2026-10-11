import { validatePayloadAgainstSchema } from "../../scripts/lib/backend-contract-validation.mjs";

export const editorialOperations = {
  getCmsPublishedBySlug: ["get", "/cms/published/{slug}", 200],
  getCmsEditorialBySlug: ["get", "/cms/editorial/{slug}", 200],
  putCmsEditorialDraft: ["put", "/cms/editorial/{slug}/draft", 200],
  postCmsEditorialDiscard: ["post", "/cms/editorial/{slug}/discard", 200],
  postCmsEditorialPublish: ["post", "/cms/editorial/{slug}/publish", 200],
  postCmsEditorialUnpublish: ["post", "/cms/editorial/{slug}/unpublish", 200],
  postCmsEditorialRestore: ["post", "/cms/editorial/{slug}/restore", 200],
};

export function verifyEditorialCapture(spec, capture) {
  const [method, route] = editorialOperations[capture.operationId] ?? [];
  const operation = spec.paths[route]?.[method];
  let response = operation?.responses?.[String(capture.status)];
  if (!response || operation.operationId !== capture.operationId) {
    throw new Error(`Undocumented editorial response status: ${capture.operationId}:${capture.status}`);
  }
  if (response.$ref) {
    response = response.$ref.slice(2).split("/").reduce((node, key) => node?.[key], spec);
  }
  const schema = response?.content?.["application/json"]?.schema;
  if (!schema || !/^application\/json(?:;|$)/i.test(capture.contentType ?? "")) {
    throw new Error(`Invalid editorial content-type: ${capture.contentType} for ${capture.operationId}:${capture.status}`);
  }
  const validation = validatePayloadAgainstSchema(schema, capture.payload, spec);
  if (!validation.valid) {
    throw new Error(`Invalid actual editorial response contract for ${capture.operationId}:${capture.status}: ${validation.errors.join(", ")}`);
  }
  return true;
}
