import { NetworkStorageCoordinator } from "./storage.ts";
import { networkPatchSchema, parseNetworkDestination } from "./schema.ts";
import { NetworkError, type NetworkDestinationPatch, type NetworkRepository } from "./types.ts";

export class LocalNetworkRepository implements NetworkRepository {
  private readonly coordinator: NetworkStorageCoordinator;
  constructor(coordinator = new NetworkStorageCoordinator()) { this.coordinator = coordinator; }
  async list() { return this.coordinator.read().destinations; }
  async getByCode(code: string) { return this.coordinator.read().destinations.find(d => d.code === code) ?? null; }
  async update(code: string, patch: NetworkDestinationPatch) {
    if ("code" in patch) throw new NetworkError("immutable_code");
    const result = networkPatchSchema.safeParse(patch);
    if (!result.success) throw new NetworkError("invalid_network", result.error.issues);
    return this.coordinator.mutate(candidate => {
      const index = candidate.destinations.findIndex(d => d.code === code);
      if (index < 0) throw new NetworkError("not_found");
      const next = parseNetworkDestination({ ...candidate.destinations[index], ...result.data });
      candidate.destinations[index] = next;
      return next;
    });
  }
  subscribe(listener: () => void) { return this.coordinator.subscribe(listener); }
}
