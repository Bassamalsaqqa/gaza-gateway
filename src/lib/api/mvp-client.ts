import type { ZodType } from "zod";
import type { IdentityApiClient } from "./identity-client.ts";
import { IdentityApiError } from "./identity-client-errors.ts";
import { resolveIdentityApiClientConfig, validateTimeoutMs, type IdentityApiClientConfig } from "./identity-client-config.ts";
import { generateCryptographicUuid, isValidUuid, tryParseCanonicalError, validateSuccessMeta } from "./identity-client-validators.ts";

export class MvpApiError extends Error {
  readonly status: number | undefined;
  readonly code: string;
  constructor(code: string, status?: number) {
    super(status === 401 ? "Sign in to continue." : status === 403 ? "This operation is not permitted."
      : status === 409 ? "The data changed. Refresh and try again." : status === 429 ? "Please wait before trying again."
      : code === "aborted" ? "The request was cancelled." : "The server request could not be completed.");
    this.name = "MvpApiError"; this.code = code; this.status = status;
  }
}

export interface MvpRequest<T> {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  realm: "public" | "passenger" | "staff";
  schema: ZodType<T>;
  body?: unknown;
  statuses?: readonly number[];
  signal?: AbortSignal | undefined;
  requestId?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface MvpEnvelope<T> { success: true; data: T; meta: { requestId: string; timestamp: string } }

/** Shared MVP transport. Cookies/CSRF come from the accepted identity client; never persisted here. */
export function createMvpApiClient(config: IdentityApiClientConfig, identity: () => Pick<IdentityApiClient, "getStaffCsrfBootstrap" | "getAuthCsrfBootstrap">) {
  const resolved = resolveIdentityApiClientConfig(config);
  // Native browser fetch rejects an arbitrary object receiver (Illegal invocation).
  const fetchFn = resolved.fetch;
  const active = new Set<AbortController>();
  let disposed = false;

  async function requestEnvelope<T>(input: MvpRequest<T>): Promise<MvpEnvelope<T>> {
    if (!resolved.enabled || !resolved.baseUrl || disposed) throw new MvpApiError("disabled");
    if (input.signal?.aborted) throw new MvpApiError("aborted");
    if (input.requestId !== undefined && !isValidUuid(input.requestId)) throw new MvpApiError("protocol");
    // Adapters use fixed route templates and opaque route-safe IDs, never arbitrary URLs.
    if (input.path.length > 2048 || !/^\/[A-Za-z0-9_./-]+(?:\?[A-Za-z0-9_=&%+-]+)?$/.test(input.path)
      || input.path.includes("//") || input.path.split("?")[0]!.split("/").some(part => part === "." || part === "..")
      || (input.realm === "public" && input.method !== "GET")) throw new MvpApiError("invalid_request");
    const controller = new AbortController(); active.add(controller);
    let timedOut = false;
    const abort = () => controller.abort();
    input.signal?.addEventListener("abort", abort, { once: true });
    let rejectAbort: (error: MvpApiError) => void = () => {};
    const cancelled = new Promise<never>((_, reject) => { rejectAbort = reject; });
    const onAbort = () => rejectAbort(new MvpApiError(timedOut ? "timeout" : "aborted"));
    controller.signal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; abort(); }, input.timeoutMs === undefined ? resolved.timeoutMs : validateTimeoutMs(input.timeoutMs));
    try {
      const operation = async (): Promise<MvpEnvelope<T>> => {
        const requestId = input.requestId ?? generateCryptographicUuid();
        const headers: Record<string, string> = { Accept: "application/json", "X-Request-Id": requestId };
        const isFormData = typeof FormData !== "undefined" && input.body instanceof FormData;
        if (input.method !== "GET") {
          const client = identity();
          const csrf = input.realm === "staff"
            ? await client.getStaffCsrfBootstrap({ signal: controller.signal })
            : await client.getAuthCsrfBootstrap({ signal: controller.signal });
          if (controller.signal.aborted) throw new MvpApiError("aborted");
          headers["X-CSRF-TOKEN"] = csrf.csrfToken;
          if (!isFormData) {
            headers["Content-Type"] = "application/json";
          }
        }
        const response = await fetchFn(resolved.baseUrl + input.path, {
          method: input.method, headers, credentials: "include", cache: "no-store", redirect: "error",
          signal: controller.signal,
          ...(input.body !== undefined
            ? { body: isFormData ? (input.body as BodyInit) : JSON.stringify(input.body) }
            : {}),
        });
        if (!/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "")) throw new MvpApiError("protocol");
        // Count actual streamed UTF-8 bytes, including when Content-Length is absent or dishonest.
        const reader = response.body?.getReader();
        if (!reader) throw new MvpApiError("protocol");
        const decoder = new TextDecoder("utf-8", { fatal: true });
        let text = "", size = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 524288) throw new MvpApiError("protocol");
            text += decoder.decode(value, { stream: true });
          }
          text += decoder.decode();
        } catch (error) {
          await reader.cancel().catch(() => {});
          throw error;
        } finally { reader.releaseLock(); }
        const envelope: unknown = JSON.parse(text);
        if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) throw new MvpApiError("protocol");
        const record = envelope as Record<string, unknown>;
        const meta = validateSuccessMeta(record["meta"], requestId);
        if (meta.requestId !== requestId || response.headers.get("x-request-id") !== requestId) throw new MvpApiError("protocol");
        if (!(input.statuses ?? [200]).includes(response.status)) {
          const error = tryParseCanonicalError(envelope);
          if (response.status < 400 || !error) throw new MvpApiError("protocol");
          throw new MvpApiError(error.error.code, response.status);
        }
        if (record["success"] !== true || Object.keys(record).sort().join(",") !== "data,meta,success") throw new MvpApiError("protocol");
        const result = input.schema.safeParse(record["data"]);
        if (!result.success) throw new MvpApiError("protocol");
        return { success: true, data: result.data, meta: { requestId: meta.requestId, timestamp: meta.timestamp } };
      };
      return await Promise.race([operation(), cancelled]);
    } catch (error) {
      if (error instanceof MvpApiError) throw error;
      if (controller.signal.aborted) throw new MvpApiError(timedOut ? "timeout" : "aborted");
      if (error instanceof IdentityApiError) {
        if (error.kind === "http_error" && error.status !== undefined && error.status >= 400 && error.status <= 599)
          throw new MvpApiError(error.code ?? "http_error", error.status);
        if (error.kind === "timeout" || error.kind === "network") throw new MvpApiError(error.kind);
        if (error.kind === "abort") throw new MvpApiError("aborted");
      }
      throw new MvpApiError(controller.signal.aborted ? "aborted" : "protocol");
    } finally {
      clearTimeout(timer); input.signal?.removeEventListener("abort", abort);
      controller.signal.removeEventListener("abort", onAbort); active.delete(controller);
    }
  }
  async function request<T>(input: MvpRequest<T>): Promise<T> { return (await requestEnvelope(input)).data; }
  return { request, requestEnvelope, dispose() { disposed = true; for (const controller of active) controller.abort(); active.clear(); } };
}

export type MvpApiClient = ReturnType<typeof createMvpApiClient>;
