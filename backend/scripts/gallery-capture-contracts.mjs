import { validatePayloadAgainstSchema } from "../../scripts/lib/backend-contract-validation.mjs";

export const galleryOperations = {
  getGalleryPublished: ["get", "/gallery/published", 200],
  getGalleryEditorial: ["get", "/gallery/editorial", 200],
  putGalleryDraft: ["put", "/gallery/editorial/draft", 200],
  postGalleryDiscard: ["post", "/gallery/editorial/discard", 200],
  postGalleryPublish: ["post", "/gallery/editorial/publish", 200],
  postGalleryUnpublish: ["post", "/gallery/editorial/unpublish", 200],
  postGalleryRestore: ["post", "/gallery/editorial/restore", 200],
};

export function verifyGalleryCapture(spec, capture) {
  const [method, route] = galleryOperations[capture.operationId] ?? [];
  const operation = spec.paths[route]?.[method];
  let response = operation?.responses?.[String(capture.status)];
  if (!response || operation.operationId !== capture.operationId) {
    throw new Error(`Undocumented gallery response status: ${capture.operationId}:${capture.status}`);
  }
  if (response.$ref) {
    response = response.$ref.slice(2).split("/").reduce((node, key) => node?.[key], spec);
  }
  const schema = response?.content?.["application/json"]?.schema;
  if (!schema || !/^application\/json(?:;|$)/i.test(capture.contentType ?? "")) {
    throw new Error(`Invalid gallery content-type: ${capture.contentType} for ${capture.operationId}:${capture.status}`);
  }
  const validation = validatePayloadAgainstSchema(schema, capture.payload, spec);
  if (!validation.valid) {
    throw new Error(`Invalid actual gallery response contract for ${capture.operationId}:${capture.status}: ${validation.errors.join(", ")}`);
  }
  return true;
}
