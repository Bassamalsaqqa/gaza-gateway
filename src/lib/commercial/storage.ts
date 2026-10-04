import { commercialStorageSchema } from "./schema.ts";
import { seedCommercialCatalog } from "./seed.ts";
import {
  CommercialCatalogError,
  type CommercialCatalog,
  type CommercialCatalogStorageV1,
} from "./types.ts";
import { StorageCommitError } from "../repositories/storage.ts";
import { isStudioPreviewActive } from "../studio-preview.ts";
export const COMMERCIAL_STORAGE_KEY = "gza.commercial.v1";
export interface CommercialCoordinatorOptions {
  inMemoryOnly?: boolean | undefined;
  storage?: Storage | null | undefined;
  initialCatalog?: CommercialCatalog | undefined;
  locks?: Pick<LockManager, "request"> | undefined;
}
export class CommercialStorageCoordinator {
  private readonly storage: Storage | null;
  private readonly memory: boolean;
  private readonly locks: Pick<LockManager, "request"> | undefined;
  private state: CommercialCatalogStorageV1;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  private cleanup: (() => void) | undefined;
  constructor(options: CommercialCoordinatorOptions = {}) {
    this.memory =
      options.inMemoryOnly === true ||
      isStudioPreviewActive() ||
      (typeof window === "undefined" && options.storage === undefined);
    try {
      this.storage = this.memory
        ? null
        : options.storage !== undefined
          ? options.storage
          : window.localStorage;
    } catch {
      this.storage = null;
    }
    this.locks = options.locks ?? (typeof navigator !== "undefined" ? navigator.locks : undefined);
    this.state = commercialStorageSchema.parse({
      schemaVersion: 1,
      revision: 0,
      catalog: options.initialCatalog ?? seedCommercialCatalog(),
    });
    if (!this.memory && typeof window !== "undefined") {
      const listener = (e: StorageEvent) => {
        if (
          (e.key === COMMERCIAL_STORAGE_KEY || e.key === null) &&
          (!e.storageArea || e.storageArea === this.storage)
        )
          this.notify();
      };
      window.addEventListener("storage", listener);
      this.cleanup = () => window.removeEventListener("storage", listener);
    }
  }
  read(): CommercialCatalogStorageV1 {
    if (this.memory) return structuredClone(this.state);
    if (!this.storage) throw new CommercialCatalogError("catalog_unavailable");
    try {
      const raw = this.storage.getItem(COMMERCIAL_STORAGE_KEY);
      if (raw === null) return { schemaVersion: 1, revision: 0, catalog: seedCommercialCatalog() };
      const result = commercialStorageSchema.safeParse(JSON.parse(raw));
      if (!result.success) throw new CommercialCatalogError("catalog_unavailable");
      return structuredClone(result.data);
    } catch {
      throw new CommercialCatalogError("catalog_unavailable");
    }
  }
  async mutate<T>(edit: (candidate: CommercialCatalogStorageV1) => T): Promise<T> {
    const commit = () => {
      const current = this.read();
      const candidate = structuredClone(current);
      const result = edit(candidate);
      const validated = commercialStorageSchema.safeParse(candidate);
      if (!validated.success)
        throw new CommercialCatalogError(
          "invalid_catalog",
          Object.fromEntries(
            validated.error.issues.map((i) => [
              i.path.filter((p) => p !== "catalog").join("."),
              "commercial.error.invalid_catalog",
            ]),
          ),
        );
      if (JSON.stringify(candidate.catalog) === JSON.stringify(current.catalog))
        return structuredClone(result);
      candidate.catalog = validated.data.catalog;
      candidate.revision = current.revision + 1;
      if (!Number.isSafeInteger(candidate.revision))
        throw new CommercialCatalogError("invalid_catalog");
      if (!this.memory) {
        try {
          this.storage!.setItem(COMMERCIAL_STORAGE_KEY, JSON.stringify(candidate));
        } catch (cause) {
          throw new StorageCommitError("Could not save commercial catalog.", cause);
        }
      }
      this.state = structuredClone(candidate);
      this.notify();
      return structuredClone(result);
    };
    const run = async () => {
      if (this.memory) return commit();
      if (!this.locks) {
        if (typeof window === "undefined") return commit();
        throw new StorageCommitError("Commercial write coordination is unavailable.");
      }
      let entered = false;
      try {
        return await this.locks.request(
          COMMERCIAL_STORAGE_KEY,
          { signal: AbortSignal.timeout(5000) },
          () => {
            entered = true;
            return commit();
          },
        );
      } catch (cause) {
        if (entered) throw cause;
        throw new StorageCommitError("Commercial transaction could not be completed.", cause);
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* A committed write remains successful. */
      }
    }
  }
  destroy() {
    this.cleanup?.();
    this.listeners.clear();
  }
}
