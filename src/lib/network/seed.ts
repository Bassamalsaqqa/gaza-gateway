import { compiledNetworkReference } from "../destination-reference.ts";
import { networkStorageSchema } from "./schema.ts";
import type { NetworkEnvelopeV1 } from "./types.ts";

export function seedNetworkEnvelope(): NetworkEnvelopeV1 {
  return networkStorageSchema.parse({ schemaVersion: 1, revision: 0, destinations: structuredClone(compiledNetworkReference) });
}
