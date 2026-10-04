import { seedSchedules } from "./seed.ts";
import { scheduleSchema } from "./schema.ts";
import type { Schedule } from "./types.ts";
import { isStudioPreviewActive } from "../studio-preview.ts";
export const SCHEDULE_STORAGE_KEY = "gza.schedule.v1";
export const SCHEDULE_SCHEMA_VERSION = 1;
export interface ScheduleStorageEnvelope {
  schemaVersion: 1;
  revision: number;
  schedules: Schedule[];
}
export class ScheduleStorageWriteError extends Error {
  public override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ScheduleStorageWriteError";
    this.cause = cause;
  }
}
export function parseScheduleStorage(raw: string): ScheduleStorageEnvelope | null {
  try {
    const value = JSON.parse(raw);
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      value.schemaVersion !== 1 ||
      !Array.isArray(value.schedules)
    )
      return null;
    const revision = value.revision === undefined ? 0 : value.revision;
    if (!Number.isSafeInteger(revision) || revision < 0) return null;
    const schedules: Schedule[] = [];
    for (const entry of value.schedules) {
      const result = scheduleSchema.safeParse(entry);
      if (!result.success || schedules.some((item) => item.id === result.data.id)) return null;
      schedules.push(result.data);
    }
    return { schemaVersion: 1, revision, schedules };
  } catch {
    return null;
  }
}
const empty = (): ScheduleStorageEnvelope => ({ schemaVersion: 1, revision: 0, schedules: [] });
const baseline = (): ScheduleStorageEnvelope => ({
  schemaVersion: 1,
  revision: 0,
  schedules: seedSchedules(),
});
function getStorage(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage;
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
/** Malformed/unreadable data is not overwritten or presented as compiled seeds. */
export function readScheduleStorage(storage: Storage | null): {
  envelope: ScheduleStorageEnvelope;
  corrupt: boolean;
} {
  if (!storage) return { envelope: empty(), corrupt: true };
  try {
    const raw = storage.getItem(SCHEDULE_STORAGE_KEY);
    if (raw === null) return { envelope: baseline(), corrupt: false };
    const parsed = parseScheduleStorage(raw);
    return { envelope: parsed ?? empty(), corrupt: !parsed };
  } catch {
    return { envelope: empty(), corrupt: true };
  }
}
export interface ScheduleCoordinatorOptions {
  inMemoryOnly?: boolean | undefined;
  initialSchedules?: Schedule[] | undefined;
  storage?: Storage | null | undefined;
}
export class ScheduleStorageCoordinator {
  private readonly storage: Storage | null;
  private readonly inMemoryOnly: boolean;
  private state: ScheduleStorageEnvelope;
  private readonly listeners = new Set<() => void>();
  private mutationQueue: Promise<unknown> = Promise.resolve();
  private cleanup: (() => void) | null = null;
  constructor(options?: ScheduleCoordinatorOptions) {
    this.inMemoryOnly = Boolean(options?.inMemoryOnly || isStudioPreviewActive());
    this.storage = this.inMemoryOnly ? null : getStorage(options?.storage);
    this.state = this.inMemoryOnly
      ? {
          schemaVersion: 1,
          revision: 0,
          schedules: structuredClone(options?.initialSchedules ?? seedSchedules()),
        }
      : readScheduleStorage(this.storage).envelope;
    if (this.inMemoryOnly && !parseScheduleStorage(JSON.stringify(this.state)))
      throw new Error("Invalid initial schedule configuration.");
    if (!this.inMemoryOnly && typeof window !== "undefined") {
      const listener = (event: StorageEvent) => {
        if (
          (event.key === SCHEDULE_STORAGE_KEY || event.key === null) &&
          (!event.storageArea || event.storageArea === this.storage)
        ) {
          this.state = readScheduleStorage(this.storage).envelope;
          this.notify();
        }
      };
      window.addEventListener("storage", listener);
      this.cleanup = () => window.removeEventListener("storage", listener);
    }
  }
  read(): ScheduleStorageEnvelope {
    if (!this.inMemoryOnly) this.state = readScheduleStorage(this.storage).envelope;
    return structuredClone(this.state);
  }
  async mutate<T>(mutator: (candidate: ScheduleStorageEnvelope) => T): Promise<T> {
    const commit = (): T => {
      let current = this.state;
      if (!this.inMemoryOnly) {
        const read = readScheduleStorage(this.storage);
        if (read.corrupt)
          throw new ScheduleStorageWriteError(
            "Schedule storage is unavailable or invalid; repair it before writing.",
          );
        current = read.envelope;
      }
      const candidate = structuredClone(current);
      const result = mutator(candidate);
      if (JSON.stringify(candidate) === JSON.stringify(current)) {
        this.state = structuredClone(current);
        return structuredClone(result);
      }
      candidate.revision = current.revision + 1;
      const validated = parseScheduleStorage(JSON.stringify(candidate));
      if (!validated) throw new Error("Invalid schedule transaction.");
      if (!this.inMemoryOnly) {
        if (!this.storage) throw new ScheduleStorageWriteError("Schedule storage is unavailable.");
        try {
          this.storage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(validated));
        } catch (cause) {
          throw new ScheduleStorageWriteError("Could not save schedules.", cause);
        }
      }
      this.state = validated;
      this.notify();
      return structuredClone(result);
    };
    const run = async (): Promise<T> => {
      if (this.inMemoryOnly || typeof window === "undefined") return commit();
      if (!navigator.locks)
        throw new ScheduleStorageWriteError("Browser write coordination is unavailable.");
      let entered = false;
      try {
        return await navigator.locks.request(
          SCHEDULE_STORAGE_KEY,
          { signal: AbortSignal.timeout(5000) },
          () => {
            entered = true;
            return commit();
          },
        );
      } catch (cause) {
        if (entered) throw cause;
        throw new ScheduleStorageWriteError("Schedule transaction could not be completed.", cause);
      }
    };
    const execution = this.mutationQueue.then(run, run);
    this.mutationQueue = execution.catch(() => {});
    return execution;
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* Subscribers cannot turn committed writes into failures. */
      }
    }
  }
  dispose(): void {
    this.cleanup?.();
    this.cleanup = null;
    this.listeners.clear();
  }
}
