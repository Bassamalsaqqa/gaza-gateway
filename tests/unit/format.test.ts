import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calendarFareAmount, dateParts } from "../../src/lib/format.ts";

describe("Calendar fare amount", () => {
  it("renders numeric fares without repeating currency in day cells", () => {
    assert.equal(calendarFareAmount(145), "145");
    assert.equal(calendarFareAmount(1240), "1,240");
    assert.doesNotMatch(calendarFareAmount(145), /USD|US\$|\$/);
  });
});

describe("Format Helpers — dateParts()", () => {
  it("formats English date with contiguous non-breaking day/month and full weekday", () => {
    const parts = dateParts("2026-09-29", "en");
    assert.ok(parts !== null, "dateParts should return a result object for valid ISO date");
    assert.equal(parts.day, "29");
    assert.equal(parts.month, "Sept");
    // Verify non-breaking space (\u00A0) joins day and month so they never break across lines
    assert.equal(parts.dayMonth, "29\u00A0Sept");
    assert.ok(parts.dayMonth.includes("\u00A0"), "dayMonth must contain non-breaking space (\\u00A0)");
    assert.ok(!parts.dayMonth.includes(" "), "dayMonth must not contain standard breaking space");
    assert.equal(parts.weekday, "Tuesday");
  });

  it("formats Arabic date with Western Latin digits and non-breaking day/month", () => {
    const parts = dateParts("2026-09-29", "ar");
    assert.ok(parts !== null, "dateParts should return a result object for valid ISO date");
    // Must use Western Latin digits (0-9) per engineering invariant (no Arabic-Indic numerals)
    assert.equal(parts.day, "29");
    assert.match(parts.day, /^[0-9]+$/, "Arabic day must strictly use Latin digits");
    assert.equal(parts.month, "سبتمبر");
    // Verify non-breaking space joins day and month
    assert.equal(parts.dayMonth, "29\u00A0سبتمبر");
    assert.ok(parts.dayMonth.includes("\u00A0"), "Arabic dayMonth must contain non-breaking space (\\u00A0)");
    assert.ok(!parts.dayMonth.includes(" "), "Arabic dayMonth must not contain standard breaking space");
    assert.equal(parts.weekday, "الثلاثاء");
  });

  it("returns null safely for null, undefined, empty, or invalid date values", () => {
    assert.equal(dateParts(null, "en"), null);
    assert.equal(dateParts(undefined, "en"), null);
    assert.equal(dateParts("", "en"), null);
    assert.equal(dateParts("invalid-date-string", "en"), null);
  });
});
