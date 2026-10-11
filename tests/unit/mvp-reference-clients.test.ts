import assert from "node:assert/strict";
import { test } from "node:test";
import { createMvpApiClient, MvpApiError } from "../../src/lib/api/mvp-client.ts";
import { HttpNetworkRepository } from "../../src/lib/network/http-repository.ts";
import { HttpMealRepository } from "../../src/lib/meals/http-repository.ts";
import { HttpScheduleRepository } from "../../src/lib/schedules/http-repository.ts";
import { encodeScheduleKey, decodeScheduleKey, encodeDatedOfferingId, isValidISODate } from "../../src/lib/offerings/codec.ts";
import { offeringWireSchema } from "../../src/lib/offerings/schema.ts";

const airport = { code: "AMM" as const, airportName: { en: "Test airport", ar: "مطار اختبار" }, city: { en: "Test city", ar: "مدينة اختبار" },
  country: { en: "Test country", ar: "دولة اختبار" }, timezone: "Asia/Amman", blockMinutes: 60, active: true };
const meal = { id: "test-meal", label: { en: "Test meal", ar: "وجبة اختبار" }, active: true, order: 0 };
function fixture(data: unknown, status = 200) {
  const calls: { path: string; init: RequestInit }[] = [];
  const client = createMvpApiClient({ enabled: true, nonProductionOptIn: true, environment: { MODE: "test" }, baseUrl: "https://127.0.0.1:18084",
    fetch: async (input, init) => {
      calls.push({ path: new URL(String(input)).pathname, init: init! });
      const requestId = new Headers(init?.headers).get("x-request-id")!;
      return new Response(JSON.stringify({ success: true, data, meta: { requestId, timestamp: "2026-10-11T00:00:00Z" } }),
        { status, headers: { "content-type": "application/json", "x-request-id": requestId } });
    } }, () => ({ getStaffCsrfBootstrap: async () => ({ csrfToken: "S".repeat(43) }), getAuthCsrfBootstrap: async () => ({ csrfToken: "P".repeat(43) }) }));
  return { client, calls, network: new HttpNetworkRepository(() => client), meals: new HttpMealRepository(() => client) };
}
test("empty network authority does not manufacture the seven prototype destinations", async () => {
  assert.deepEqual(await fixture([]).network.list(), []);
});
test("public network omits GZA base; staff route retains inactive airports", async () => {
  assert.deepEqual(await fixture([{ ...airport, code: "GZA" }, airport]).network.list(), [airport]);
  const f = fixture([{ ...airport, active: false }]);
  assert.deepEqual(await f.network.listAdmin(), [{ ...airport, active: false }]);
  assert.equal(f.calls[0]?.path, "/api/v1/admin/network/airports");
  await assert.rejects(f.network.list());
});
test("network rejects malformed, duplicate and foreign-identity server records", async () => {
  for (const data of [[{ ...airport, timezone: "Not/A_Timezone" }], [airport, airport], [{ ...airport, code: "LHR" }]]) {
    await assert.rejects(fixture(data).network.list(), MvpApiError);
  }
  await assert.rejects(fixture({ airport, changed: true, revision: 1 }).network.patchAirport("CAI", {}));
});
test("server network receipts alone determine no-op notifications; listener failure does not undo the write", async () => {
  let notified = 0;
  const noOp = fixture({ airport, changed: false, revision: 2 }); noOp.network.subscribe(() => notified++);
  assert.equal((await noOp.network.updateWithReceipt("AMM", {})).changed, false); assert.equal(notified, 0);
  const changed = fixture({ airport, changed: true, revision: 3 });
  changed.network.subscribe(() => { throw new Error("subscriber failed"); }); changed.network.subscribe(() => notified++);
  assert.equal((await changed.network.updateWithReceipt("AMM", { active: true })).changed, true); assert.equal(notified, 1);
  assert.equal(changed.calls[0]?.path, "/api/v1/admin/network/airports/AMM/receipt");
  assert.deepEqual(JSON.parse(String(changed.calls[0]?.init.body)), { active: true });
});
test("unsafe network IDs fail before network access", async () => {
  const f = fixture({ airport, changed: false, revision: 1 });
  for (const code of ["AMM/evil", "AMM?x", "AMM\n", "LHR"]) await assert.rejects(f.network.patchAirport(code, {}));
  assert.equal(f.calls.length, 0);
});
test("empty meals are honest and public rejects inactive/default tampering", async () => {
  assert.deepEqual(await fixture({ revision: 0, meals: [], defaultMealId: null }).meals.getPublic(), { revision: 0, meals: [], defaultMealId: null });
  const inactive = fixture({ revision: 1, meals: [{ ...meal, active: false }], defaultMealId: null });
  assert.equal((await inactive.meals.getAdmin()).meals.length, 1); await assert.rejects(inactive.meals.getPublic());
  for (const data of [{ revision: 1, meals: [meal, meal], defaultMealId: null }, { revision: 1, meals: [meal], defaultMealId: "missing" }]) {
    await assert.rejects(fixture(data).meals.getAdmin(), MvpApiError);
  }
});
test("meal commands use closed flat server families and real no-op receipts", async () => {
  const option = fixture({ result: meal, changed: false });
  assert.equal((await option.meals.patch(meal.id, { active: true })).changed, false);
  assert.deepEqual(JSON.parse(String(option.calls[0]?.init.body)), { active: true });
  const catalog = fixture({ result: { revision: 2, meals: [meal], defaultMealId: meal.id }, changed: true });
  await catalog.meals.reorder([meal.id]); await catalog.meals.setDefault(meal.id);
  assert.deepEqual(catalog.calls.map(call => JSON.parse(String(call.init.body))), [{ ids: [meal.id] }, { id: meal.id }]);
  assert.ok(catalog.calls.every(call => new Headers(call.init.headers).get("x-csrf-token") === "S".repeat(43)));
  await assert.rejects(fixture({ result: { ...meal, id: "foreign" }, changed: true }).meals.patch(meal.id, {}));
});
test("unsafe meal path IDs fail before network access", async () => {
  const f = fixture({ result: meal, changed: true });
  for (const id of ["../meal", "meal%2Fbad", "meal\n", "a".repeat(65)]) await assert.rejects(f.meals.patch(id, {}));
  assert.equal(f.calls.length, 0);
});

const schedule = { id: " exact / جدول ", number: "PS100", direction: "out" as const, destination: "AMM" as const, days: [0],
  departTime: "08:00", arriveTime: "09:00", aircraft: "Test airframe", aircraftId: "test-airframe", from: "2026-01-01", until: "2026-12-31", active: true, exceptions: [] };
test("schedule adapter preserves exact IDs and encodes immutable route keys", async () => {
  const f = fixture({ schedule, changed: false, revision: 4 });
  const repository = new HttpScheduleRepository(() => f.client);
  let notified = 0; repository.subscribe(() => notified++);
  const receipt = await repository.updateWithReceipt(schedule.id, { active: true });
  assert.equal(receipt.schedule.id, schedule.id); assert.equal(notified, 0);
  assert.equal(f.calls[0]?.path, `/api/v1/admin/schedules/${encodeScheduleKey(schedule.id)}`);
  assert.equal(decodeScheduleKey(encodeScheduleKey(schedule.id)), schedule.id);
  await assert.rejects(repository.updateWithReceipt("different", {}));
});
test("schedule public discovery is active-only and never supplements an empty authority", async () => {
  const empty = fixture([]); const repository = new HttpScheduleRepository(() => empty.client);
  assert.deepEqual(await repository.listForDiscovery(), []);
  assert.equal(empty.calls[0]?.path, "/api/v1/schedules");
  const inactive = fixture([{ ...schedule, active: false }]); const admin = new HttpScheduleRepository(() => inactive.client);
  assert.equal((await admin.list()).length, 1); await assert.rejects(admin.listForDiscovery());
});
test("schedule codec bounds Unicode identities without trimming or calendar coercion", () => {
  for (const id of [schedule.id, "😀".repeat(80), "x".repeat(160)]) assert.equal(decodeScheduleKey(encodeScheduleKey(id)), id);
  for (const id of ["", "😀".repeat(81), "x\0y", "\ud800"]) assert.throws(() => encodeScheduleKey(id));
  assert.equal(isValidISODate("0001-01-01"), true);
  for (const date of ["0000-01-01", "2026-02-30", "2026-01-01\n"]) assert.equal(isValidISODate(date), false);
});
test("dated offerings reject paid, operational, layout and identity response tampering", () => {
  const offering = { id: encodeDatedOfferingId(schedule.id, "2026-10-11"), scheduleId: schedule.id, date: "2026-10-11", number: "PS100", direction: "out", originCode: "GZA", destinationCode: "AMM",
    departTime: "08:00", arriveTime: "09:00", durationMinutes: 60, aircraftId: "test-airframe", aircraft: "Test airframe",
    layout: { aircraftId: "test-airframe", rows: 2, letters: ["A", "B"], aisleAfter: 1, zones: [{ id: "economy", firstRow: 1, lastRow: 2 }], extraLegroomRows: [], unavailable: [] },
    revisions: { fleet: 1, network: 1, schedules: 1 }, classification: "commemorative", priceMinor: 0 };
  assert.equal(offeringWireSchema.safeParse(offering).success, true);
  for (const tampered of [{ ...offering, priceMinor: 3500 }, { ...offering, gate: "A1" }, { ...offering, scheduleId: "foreign" },
    { ...offering, layout: { ...offering.layout, aircraftId: "foreign" } }, { ...offering, date: "2026-02-30" }]) {
    assert.equal(offeringWireSchema.safeParse(tampered).success, false);
  }
});
