import { NetworkStorageCoordinator } from "./storage.ts";
import { networkPatchSchema, parseNetworkDestination } from "./schema.ts";
import {
  NetworkError,
  type NetworkDestination,
  type NetworkDestinationPatch,
  type NetworkMutationReceipt,
  type NetworkRepository,
} from "./types.ts";

export class LocalNetworkRepository implements NetworkRepository {
  private readonly coordinator: NetworkStorageCoordinator;
  constructor(coordinator = new NetworkStorageCoordinator()) { this.coordinator = coordinator; }
  async list() { return this.coordinator.read().destinations; }
  async getByCode(code: string) { return this.coordinator.read().destinations.find(d => d.code === code) ?? null; }
  async updateWithReceipt(code: string, patch: NetworkDestinationPatch): Promise<NetworkMutationReceipt> {
    if ("code" in patch) throw new NetworkError("immutable_code");
    const result = networkPatchSchema.safeParse(patch);
    if (!result.success) throw new NetworkError("invalid_network", result.error.issues);
    let changed = false;
    const destination = await this.coordinator.mutate(candidate => {
      const index = candidate.destinations.findIndex(d => d.code === code);
      if (index < 0) throw new NetworkError("not_found");
      const current = candidate.destinations[index]!;
      const next = parseNetworkDestination({ ...current, ...result.data });
      if (JSON.stringify(current) === JSON.stringify(next)) {
        changed = false;
        return current;
      }
      candidate.destinations[index] = next;
      changed = true;
      return next;
    });
    return { destination, changed };
  }
  async update(code: string, patch: NetworkDestinationPatch): Promise<NetworkDestination> {
    const receipt = await this.updateWithReceipt(code, patch);
    return receipt.destination;
  }
  subscribe(listener: () => void) { return this.coordinator.subscribe(listener); }
}
