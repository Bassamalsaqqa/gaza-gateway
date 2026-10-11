import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { createMvpApiClient, MvpApiError } from "../../src/lib/api/mvp-client.ts";
import type { IdentityApiClientConfig } from "../../src/lib/api/identity-client-config.ts";
import { IdentityApiError } from "../../src/lib/api/identity-client-errors.ts";

const schema = z.object({ revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict();
const read = { method: "GET", realm: "public", path: "/meals", schema } as const;

for (const realm of ["staff", "passenger"] as const) for (const [status, code] of [[401, "unauthorized"], [403, "forbidden"], [429, "too_many_requests"], [503, "service_unavailable"]] as const) {
  test(`bootstrap review preserves ${realm} ${status} without dispatching a mutation`, async () => {
    const f = fixture();
    const fail = async () => { throw new IdentityApiError({ kind: "http_error", status, code, message: "private-sentinel" }); };
    const client = createMvpApiClient(f.config, () => ({ getStaffCsrfBootstrap: fail, getAuthCsrfBootstrap: fail }));
    await assert.rejects(client.request({ ...read, method: "POST", realm, body: {} }), (error: unknown) =>
      error instanceof MvpApiError && error.status === status && error.code === code && !error.message.includes("private-sentinel"));
    assert.equal(f.calls.length, 0);
  });
}
for (const [kind, code] of [["abort", "aborted"], ["timeout", "timeout"], ["network", "network"], ["protocol", "protocol"]] as const) {
  test(`bootstrap review preserves ${kind} classification without dispatch`, async () => {
    const f = fixture(); const fail = async () => { throw new IdentityApiError({ kind, message: "private-sentinel" }); };
    const client = createMvpApiClient(f.config, () => ({ getStaffCsrfBootstrap: fail, getAuthCsrfBootstrap: fail }));
    await assert.rejects(client.request({ ...read, method: "POST", realm: "staff", body: {} }), (error: unknown) =>
      error instanceof MvpApiError && error.code === code && !error.message.includes("private-sentinel"));
    assert.equal(f.calls.length, 0);
  });
}
test("bootstrap review distinguishes elapsed deadline from caller cancellation", async () => {
  const f = fixture(); const pending = () => new Promise<never>(() => {});
  const client = createMvpApiClient({ ...f.config, timeoutMs: 10 }, () => ({ getStaffCsrfBootstrap: pending, getAuthCsrfBootstrap: pending }));
  await assert.rejects(client.request({ ...read, method: "POST", realm: "staff", body: {} }), (error: unknown) => error instanceof MvpApiError && error.code === "timeout");
  const cancellation = new AbortController();
  const request = client.request({ ...read, method: "POST", realm: "staff", body: {}, signal: cancellation.signal });
  cancellation.abort();
  await assert.rejects(request, (error: unknown) => error instanceof MvpApiError && error.code === "aborted");
  assert.equal(f.calls.length, 0);
});
function fixture(overrides: { status?: number; contentType?: string; body?: (id: string) => unknown } = {}) {
  const calls: RequestInit[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    calls.push(init!);
    const id = new Headers(init?.headers).get("x-request-id")!;
    const body = overrides.body?.(id) ?? { success: true, data: { revision: 1 }, meta: { requestId: id, timestamp: "2026-10-11T00:00:00Z" } };
    return new Response(JSON.stringify(body), { status: overrides.status ?? 200,
      headers: { "content-type": overrides.contentType ?? "application/json", "x-request-id": id } });
  };
  const realms: string[] = [];
  const identity = () => ({
    getStaffCsrfBootstrap: async () => { realms.push("staff"); return { csrfToken: "S".repeat(43) }; },
    getAuthCsrfBootstrap: async () => { realms.push("passenger"); return { csrfToken: "P".repeat(43) }; },
  });
  const config: IdentityApiClientConfig = { enabled: true, nonProductionOptIn: true, environment: { MODE: "test" },
    baseUrl: "https://127.0.0.1:18084", fetch: fetcher };
  return { client: createMvpApiClient(config, identity), config, identity, calls, realms };
}

test("MVP read validates real DTO and correlation, carries cookies and no-store", async () => {
  const f = fixture(); assert.deepEqual(await f.client.request(read), { revision: 1 });
  assert.equal(f.calls[0]?.credentials, "include"); assert.equal(f.calls[0]?.cache, "no-store");
  assert.equal(f.calls[0]?.redirect, "error"); assert.deepEqual(f.realms, []);
});
test("unsafe MVP calls bootstrap the correct accepted identity realm", async () => {
  const f = fixture();
  for (const realm of ["staff", "passenger"] as const) await f.client.request({ ...read, method: "POST", realm, body: {} });
  assert.deepEqual(f.realms, ["staff", "passenger"]);
  assert.equal(new Headers(f.calls[0]?.headers).get("x-csrf-token"), "S".repeat(43));
  assert.equal(new Headers(f.calls[1]?.headers).get("x-csrf-token"), "P".repeat(43));
});
for (const [name, body] of Object.entries({
  wrongDto: (id: string) => ({ success: true, data: { revision: "1" }, meta: { requestId: id, timestamp: "2026-10-11T00:00:00Z" } }),
  extraDto: (id: string) => ({ success: true, data: { revision: 1, ownerApproved: true }, meta: { requestId: id, timestamp: "2026-10-11T00:00:00Z" } }),
  falseSuccess: (id: string) => ({ success: false, data: { revision: 1 }, meta: { requestId: id, timestamp: "2026-10-11T00:00:00Z" } }),
  badCorrelation: () => ({ success: true, data: { revision: 1 }, meta: { requestId: "00000000-0000-4000-8000-000000000001", timestamp: "2026-10-11T00:00:00Z" } }),
  extraEnvelope: (id: string) => ({ success: true, data: { revision: 1 }, secret: "sentinel", meta: { requestId: id, timestamp: "2026-10-11T00:00:00Z" } }),
})) test(`MVP transport rejects ${name}`, async () => {
  await assert.rejects(fixture({ body }).client.request(read), (e: unknown) => e instanceof MvpApiError && e.code === "protocol");
});
test("MVP transport rejects non-JSON and unexpected success statuses", async () => {
  await assert.rejects(fixture({ contentType: "text/html" }).client.request(read), MvpApiError);
  await assert.rejects(fixture({ status: 201 }).client.request(read), MvpApiError);
});
test("canonical conflict remains a conflict; untrusted message never enters client error", async () => {
  const f = fixture({ status: 409, body: id => ({ success: false, error: { code: "seat_taken", message: "secret-sentinel" },
    meta: { requestId: id, timestamp: "2026-10-11T00:00:00Z" } }) });
  await assert.rejects(f.client.request(read), (e: unknown) => e instanceof MvpApiError && e.status === 409 && e.code === "seat_taken" && !e.message.includes("secret-sentinel"));
  assert.equal(f.calls.length, 1);
});
test("disabled, disposed, already aborted and invalid paths perform zero requests", async () => {
  const f = fixture(); const disabled = createMvpApiClient({}, f.identity);
  await assert.rejects(disabled.request(read), MvpApiError);
  const c = new AbortController(); c.abort(); await assert.rejects(f.client.request({ ...read, signal: c.signal }), MvpApiError);
  for (const path of ["//evil.invalid", "/../auth", "/fleet/a%2Fb", "/meals#bad"]) await assert.rejects(f.client.request({ ...read, path }), MvpApiError);
  await assert.rejects(f.client.request({ ...read, method: "POST" }), MvpApiError);
  f.client.dispose(); await assert.rejects(f.client.request(read), MvpApiError); assert.equal(f.calls.length, 0);
});
test("one deadline bounds bootstrap even if a test provider ignores cancellation", async () => {
  const f = fixture(); const client = createMvpApiClient({ ...f.config, timeoutMs: 10 }, () => ({ ...f.identity(),
    getStaffCsrfBootstrap: () => new Promise(() => {}) }));
  await assert.rejects(client.request({ ...read, method: "POST", realm: "staff", body: {} }), MvpApiError);
  assert.equal(f.calls.length, 0);
});
test("actual UTF-8 response bytes are bounded without Content-Length", async () => {
  const f = fixture({ body: id => ({ success: true, data: { revision: 1 }, extra: "界".repeat(175000), meta: { requestId: id, timestamp: "2026-10-11T00:00:00Z" } }) });
  await assert.rejects(f.client.request(read), MvpApiError);
});
