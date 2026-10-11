/** Fleet API adapter over the shared MVP transport. No fallback authority. */
import { z } from "zod";
import type { Aircraft, AircraftLayout, AircraftCreateInput, AircraftUpdatePatch, FleetSnapshot, LayoutUpdateInput } from "../fleet/types.ts";
import { aircraftLayoutSchema, AIRCRAFT_REGISTRATION_REGEX } from "../fleet/schema.ts";
import { resolveIdentityApiClientConfig } from "./identity-client-config.ts";
import { identityUiClientConfig, isIdentityUiRequested, type IdentityUiEnvironment } from "./identity-ui-config.ts";
import { getIdentityUiClient } from "./identity-ui-runtime.ts";
import { createMvpApiClient, MvpApiError, type MvpRequest } from "./mvp-client.ts";

export type ReferenceApiErrorKind =
  | "configuration"
  | "network"
  | "timeout"
  | "abort"
  | "protocol"
  | "http_error";

export interface ReferenceApiErrorOptions {
  kind: ReferenceApiErrorKind;
  message: string;
  status?: number | undefined;
  code?: string | undefined;
  requestId?: string | undefined;
  retryAfter?: number | undefined;
}

const MAX_ERROR_MESSAGE_LENGTH = 300;

export class ReferenceApiError extends Error {
  readonly kind: ReferenceApiErrorKind;
  readonly status?: number | undefined;
  readonly code?: string | undefined;
  readonly requestId?: string | undefined;
  readonly retryAfter?: number | undefined;

  constructor(options: ReferenceApiErrorOptions) {
    const sanitizedMessage = (options.message || "Unknown Reference API error")
      .trim()
      .slice(0, MAX_ERROR_MESSAGE_LENGTH);
    super(sanitizedMessage);
    this.name = "ReferenceApiError";
    this.kind = options.kind;
    if (options.status !== undefined && Number.isInteger(options.status)) {
      this.status = options.status;
    }
    if (options.code !== undefined && typeof options.code === "string") {
      this.code = options.code;
    }
    if (options.requestId !== undefined && typeof options.requestId === "string") {
      this.requestId = options.requestId;
    }
    if (options.retryAfter !== undefined && typeof options.retryAfter === "number") {
      this.retryAfter = options.retryAfter;
    }

    Object.setPrototypeOf(this, ReferenceApiError.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      kind: this.kind,
      message: this.message,
      ...(this.status !== undefined ? { status: this.status } : {}),
      ...(this.code !== undefined ? { code: this.code } : {}),
      ...(this.requestId !== undefined ? { requestId: this.requestId } : {}),
      ...(this.retryAfter !== undefined ? { retryAfter: this.retryAfter } : {}),
    };
  }
}

export function isReferenceApiError(value: unknown): value is ReferenceApiError {
  return value instanceof ReferenceApiError;
}

/** Route-safe aircraft ID: exact ASCII letters, digits, hyphen, underscore, 1..64 chars */
export const ROUTE_SAFE_ID_REGEX = /^[A-Za-z0-9_-]{1,64}(?![\s\S])/;

export function isValidRouteSafeId(id: unknown): id is string {
  return typeof id === "string" && ROUTE_SAFE_ID_REGEX.test(id);
}

export function validateRouteSafeId(id: unknown, fieldName: string = "id"): string {
  if (!isValidRouteSafeId(id)) {
    throw new ReferenceApiError({
      kind: "protocol",
      message: `Invalid route-safe identifier for ${fieldName}: must be 1..64 ASCII letters, digits, hyphen or underscore.`,
    });
  }
  return id;
}

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}(?![\s\S])/);
const revisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const wireAircraftSchema = z.object({
  id: idSchema, model: z.string().min(1).max(120),
  registration: z.string().regex(AIRCRAFT_REGISTRATION_REGEX), active: z.boolean(),
}).strict();
const wireLayoutSchema = z.object({
  aircraftId: idSchema, rows: z.number().int().min(1).max(60),
  letters: z.array(z.string().regex(/^[A-Z]$/)).min(1).max(10),
  aisleAfter: z.number().int().min(1),
  zones: z.array(z.object({ id: z.enum(["business", "premium", "economy"]),
    firstRow: z.number().int().min(1), lastRow: z.number().int().min(1) }).strict()).min(1),
  extraLegroomRows: z.array(z.number().int().min(1)), unavailable: z.array(z.string().regex(/^[1-9][0-9]?[A-Z]$/)),
}).strict().pipe(aircraftLayoutSchema);
export const fleetSnapshotSchema = z.object({
  revision: revisionSchema, aircraft: z.array(wireAircraftSchema), layouts: z.record(wireLayoutSchema),
}).strict().superRefine((snapshot, ctx) => {
  const ids = snapshot.aircraft.map(item => item.id);
  if (new Set(ids).size !== ids.length || Object.keys(snapshot.layouts).length !== ids.length
    || ids.some(id => snapshot.layouts[id]?.aircraftId !== id)) {
    ctx.addIssue({ code: "custom", message: "Fleet aircraft and layouts must match bijectively." });
  }
});
export const aircraftReceiptSchema = z.object({ aircraft: wireAircraftSchema, changed: z.boolean(), revision: revisionSchema }).strict();
export const layoutReceiptSchema = z.object({ layout: wireLayoutSchema, changed: z.boolean(), revision: revisionSchema }).strict();

export interface ReferenceApiRequestOptions {
  requestId?: string | undefined;
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
}

export interface ReferenceMeta {
  requestId: string;
  timestamp: string;
}

export interface ReferenceSuccessResponse<T> {
  success: true;
  data: T;
  meta: ReferenceMeta;
}

export interface ReferenceApiClientConfig {
  baseUrl?: string | null | undefined;
  enabled?: boolean | undefined;
  nonProductionOptIn?: boolean | undefined;
  environment?: IdentityUiEnvironment | undefined;
  mode?: "mock" | "live" | undefined;
  timeoutMs?: number | undefined;
  fetch?: typeof fetch | undefined;
  csrfTokenProvider?: (() => Promise<string> | string) | undefined;
}

export interface ReferenceApiClient {
  readonly isEnabled: boolean;
  readonly mode: "mock" | "live";
  readonly baseUrl: string | null;
  readonly isDisposed: boolean;

  getFleetSnapshot(options?: ReferenceApiRequestOptions): Promise<ReferenceSuccessResponse<FleetSnapshot>>;
  getFleetAircraft(options?: ReferenceApiRequestOptions): Promise<ReferenceSuccessResponse<Aircraft[]>>;
  getSeatLayoutById(id: string, options?: ReferenceApiRequestOptions): Promise<ReferenceSuccessResponse<AircraftLayout>>;
  postAdminAircraft(body: AircraftCreateInput, options?: ReferenceApiRequestOptions): Promise<ReferenceSuccessResponse<Aircraft>>;
  patchAdminAircraft(id: string, patch: AircraftUpdatePatch, options?: ReferenceApiRequestOptions): Promise<ReferenceSuccessResponse<Aircraft>>;
  patchAdminAircraftReceipt(id: string, patch: AircraftUpdatePatch, options?: ReferenceApiRequestOptions): Promise<ReferenceSuccessResponse<{ aircraft: Aircraft; changed: boolean; revision: number }>>;
  putAdminSeatLayout(id: string, layout: LayoutUpdateInput, options?: ReferenceApiRequestOptions): Promise<ReferenceSuccessResponse<AircraftLayout>>;
  putAdminSeatLayoutReceipt(id: string, layout: LayoutUpdateInput, options?: ReferenceApiRequestOptions): Promise<ReferenceSuccessResponse<{ layout: AircraftLayout; changed: boolean; revision: number }>>;
  dispose(): void;
}

export function createReferenceApiClient(config: ReferenceApiClientConfig): ReferenceApiClient {
  const baseConfig = { ...config, baseUrl: config.baseUrl ?? undefined };
  const resolved = resolveIdentityApiClientConfig(baseConfig);
  // Tests may inject a token supplier; real browsers always use the accepted staff bootstrap.
  const transport = createMvpApiClient(baseConfig, () => ({
    getStaffCsrfBootstrap: async options => config.csrfTokenProvider
      ? { csrfToken: await config.csrfTokenProvider() }
      : getIdentityUiClient().getStaffCsrfBootstrap(options),
    getAuthCsrfBootstrap: options => getIdentityUiClient().getAuthCsrfBootstrap(options),
  }));
  let disposed = false;
  async function execute<T>(input: MvpRequest<T>): Promise<ReferenceSuccessResponse<T>> {
    try { return await transport.requestEnvelope(input); }
    catch (error) {
      if (error instanceof MvpApiError) throw new ReferenceApiError({
        kind: error.code === "disabled" ? (disposed ? "abort" : "configuration")
          : error.code === "aborted" ? "abort" : error.status ? "http_error" : "protocol",
        message: error.message, code: error.code, status: error.status,
      });
      throw new ReferenceApiError({ kind: "protocol", message: "Invalid reference response." });
    }
  }
  function matchIdentity(actual: string, expected: string) {
    if (actual !== expected) throw new ReferenceApiError({ kind: "protocol", message: "Reference response identity mismatch." });
  }
  return {
    isEnabled: resolved.enabled, mode: resolved.mode, baseUrl: resolved.baseUrl,
    get isDisposed() { return disposed; },
    dispose() { disposed = true; transport.dispose(); },
    getFleetSnapshot: options => execute({ method: "GET", path: "/fleet/snapshot", realm: "public", schema: fleetSnapshotSchema, ...options }),
    getFleetAircraft: options => execute({ method: "GET", path: "/fleet/aircraft", realm: "public", schema: z.array(wireAircraftSchema), ...options }),
    async getSeatLayoutById(id, options) {
      validateRouteSafeId(id);
      const result = await execute({ method: "GET", path: `/fleet/seat-layouts/${id}`, realm: "public", schema: wireLayoutSchema, ...options });
      matchIdentity(result.data.aircraftId, id); return result;
    },
    async postAdminAircraft(body, options) {
      if (body.aircraft.id !== undefined) validateRouteSafeId(body.aircraft.id);
      const result = await execute({ method: "POST", path: "/admin/fleet/aircraft", realm: "staff", body, statuses: [201], schema: wireAircraftSchema, ...options });
      if (body.aircraft.id !== undefined) matchIdentity(result.data.id, body.aircraft.id); return result;
    },
    async patchAdminAircraft(id, body, options) {
      validateRouteSafeId(id);
      const result = await execute({ method: "PATCH", path: `/admin/fleet/aircraft/${id}`, realm: "staff", body, schema: wireAircraftSchema, ...options });
      matchIdentity(result.data.id, id); return result;
    },
    async patchAdminAircraftReceipt(id, body, options) {
      validateRouteSafeId(id);
      const result = await execute({ method: "PATCH", path: `/admin/fleet/aircraft/${id}/receipt`, realm: "staff", body, schema: aircraftReceiptSchema, ...options });
      matchIdentity(result.data.aircraft.id, id); return result;
    },
    async putAdminSeatLayout(id, body, options) {
      validateRouteSafeId(id);
      const result = await execute({ method: "PUT", path: `/admin/fleet/seat-layouts/${id}`, realm: "staff", body, schema: wireLayoutSchema, ...options });
      matchIdentity(result.data.aircraftId, id); return result;
    },
    async putAdminSeatLayoutReceipt(id, body, options) {
      validateRouteSafeId(id);
      const result = await execute({ method: "PUT", path: `/admin/fleet/seat-layouts/${id}/receipt`, realm: "staff", body, schema: layoutReceiptSchema, ...options });
      matchIdentity(result.data.layout.aircraftId, id); return result;
    },
  };
}

let clientInstance: ReferenceApiClient | null = null;

export function getReferenceUiClient(): ReferenceApiClient {
  if (typeof window === "undefined" || !isIdentityUiRequested(import.meta.env ?? {})) {
    throw new ReferenceApiError({
      kind: "configuration",
      message: "Reference UI client is not enabled in this browser (explicit opt-in required).",
    });
  }
  if (!clientInstance) {
    const env: IdentityUiEnvironment = import.meta.env ?? {};
    const config = identityUiClientConfig(env);
    clientInstance = createReferenceApiClient(config);
  }
  return clientInstance;
}

export function discardReferenceUiClient(): void {
  if (clientInstance) {
    clientInstance.dispose();
    clientInstance = null;
  }
}
