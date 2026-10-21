/**
 * Gaza Gateway — Focused Tests for Ticket Presentation Mapper & Integrity.
 *
 * Exercises mapper behaviors:
 * - Varied passenger names (Latin, Arabic, compound)
 * - Direction & localization (EN vs AR, Western Latin digits invariant)
 * - Status handling (confirmed vs explicitly cancelled)
 * - Timing & overnight date detection (+1)
 * - Cabin omission invariant (never fake-defaulted to Economy)
 * - Seat and meal absence handling
 * - PII exclusion (no passport, internal UUIDs, or email printed on ticket)
 * - Multi-passenger reservation integrity
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  mapPassengerTicket,
  mapTicketPresentation,
  formatTicketDate,
  resolveAirport,
  computeDayOffset,
  formatDayOffsetLabel,
  extractPassengerNames,
  preloadTicketImage,
  _resetTicketImageCacheForTesting,
  TICKET_CANVAS_WIDTH,
  TICKET_CANVAS_HEIGHT,
  TICKET_CANVAS_ASPECT_RATIO,
  type MappedPassengerTicket,
} from "../../src/lib/reservations/ticket-presentation.ts";
import type { ReservationDetail } from "../../src/lib/reservations/client.ts";

function createSyntheticReservation(overrides?: {
  status?: "confirmed" | "cancelled" | string;
  arrivalDate?: string;
  aircraftModel?: string | null;
  passengers?: Array<{
    firstName: string;
    lastName: string;
    seatCode: string;
    meal?: { id: string; label: { en: string; ar: string } } | null;
    cabin?: string;
  }>;
  cabin?: string;
}): ReservationDetail {
  const status = (overrides?.status ?? "confirmed") as "confirmed" | "cancelled";
  const arrivalDate = overrides?.arrivalDate ?? "2026-09-18";
  const aircraftModel = overrides?.aircraftModel;

  const rawPassengers = overrides?.passengers ?? [
    {
      firstName: "Omar",
      lastName: "Khalil",
      seatCode: "12A",
      meal: { id: "meal-veg", label: { en: "Standard Vegetarian", ar: "نباتي عادي" } },
    },
  ];

  const reservationPassengers = rawPassengers.map((p, idx) => ({
    id: `pax-${idx + 1}`,
    type: "adult" as const,
    firstName: p.firstName,
    lastName: p.lastName,
    seatCode: p.seatCode,
    mealId: p.meal ? p.meal.id : null,
    mealLabel: p.meal ? p.meal.label : null,
  }));

  const tickets = rawPassengers.map((p, idx) => ({
    ticketNumber: `PS-00${idx + 1}2345`,
    reference: "GZA-7K8P",
    status,
    issuedAt: "2026-09-01T10:00:00Z",
    passenger: {
      id: `pax-${idx + 1}`,
      type: "adult" as const,
      firstName: p.firstName,
      lastName: p.lastName,
      nationality: "Palestinian",
      seatCode: p.seatCode,
      meal: p.meal ?? null,
      ...(p.cabin ? { cabin: p.cabin } : {}),
    },
    flight: {
      serviceId: "GZA-AMM-20260918-PS204",
      flightNumber: "PS 204",
      date: "2026-09-18",
      originCode: "GZA",
      destinationCode: "AMM",
      departTime: "14:30",
      arriveTime: "15:25",
      arrivalDate,
      originTimezone: "Asia/Gaza",
      destinationTimezone: "Asia/Amman",
      ...(aircraftModel !== undefined ? { aircraftModel: aircraftModel ?? undefined } : {}),
    },
    contact: {
      email: "passenger@example.com",
      phone: "+970599000000",
    },
    ...(p.cabin || overrides?.cabin ? { cabin: p.cabin || overrides?.cabin } : {}),
  }));

  return {
    reservation: {
      id: "11111111-2222-3333-4444-555555555555",
      reference: "GZA-7K8P",
      status,
      serviceId: "GZA-AMM-20260918-PS204",
      flightNumber: "PS 204",
      date: "2026-09-18",
      originCode: "GZA",
      destinationCode: "AMM",
      departTime: "14:30",
      arriveTime: "15:25",
      contact: {
        email: "passenger@example.com",
        phone: "+970599000000",
      },
      passengers: reservationPassengers,
      createdAt: "2026-09-01T10:00:00Z",
    },
    ticket: {
      reference: "GZA-7K8P",
      status,
      issuedAt: "2026-09-01T10:00:00Z",
      flight: {
        serviceId: "GZA-AMM-20260918-PS204",
        flightNumber: "PS 204",
        date: "2026-09-18",
        originCode: "GZA",
        destinationCode: "AMM",
        departTime: "14:30",
        arriveTime: "15:25",
        arrivalDate,
        originTimezone: "Asia/Gaza",
        destinationTimezone: "Asia/Amman",
        ...(aircraftModel !== undefined ? { aircraftModel: aircraftModel ?? undefined } : {}),
      },
      tickets,
      contact: {
        email: "passenger@example.com",
        phone: "+970599000000",
      },
    },
  };
}

describe("computeDayOffset() & formatDayOffsetLabel()", () => {
  it("calculates same day offset as 0", () => {
    assert.equal(computeDayOffset("2026-09-18", "2026-09-18"), 0);
    assert.equal(formatDayOffsetLabel(0), null);
  });

  it("calculates overnight +1 day offset", () => {
    const offset = computeDayOffset("2026-09-18", "2026-09-19");
    assert.equal(offset, 1);
    assert.equal(formatDayOffsetLabel(offset), "+1");
  });

  it("calculates multi-day +2 day offset", () => {
    const offset = computeDayOffset("2026-09-18", "2026-09-20");
    assert.equal(offset, 2);
    assert.equal(formatDayOffsetLabel(offset), "+2");
  });

  it("calculates westward / cross-day -1 day offset", () => {
    const offset = computeDayOffset("2026-09-18", "2026-09-17");
    assert.equal(offset, -1);
    assert.equal(formatDayOffsetLabel(offset), "-1");
  });

  it("calculates cross-month offsets accurately", () => {
    assert.equal(computeDayOffset("2026-08-31", "2026-09-01"), 1);
    assert.equal(computeDayOffset("2026-03-01", "2026-02-28"), -1);
    assert.equal(computeDayOffset("2026-12-31", "2027-01-01"), 1);
  });

  it("handles null, undefined, or empty inputs safely", () => {
    assert.equal(computeDayOffset(null, "2026-09-18"), 0);
    assert.equal(computeDayOffset("2026-09-18", null), 0);
    assert.equal(computeDayOffset("", ""), 0);
  });
});

describe("formatTicketDate()", () => {
  it("formats English uppercase date with standard month abbreviation", () => {
    assert.equal(formatTicketDate("2026-09-18", "en"), "18 SEP 2026");
    assert.equal(formatTicketDate("2025-04-15", "en"), "15 APR 2025");
    assert.equal(formatTicketDate("2026-01-01", "en"), "1 JAN 2026");
  });

  it("formats Arabic date strictly with Western Latin digits", () => {
    const formatted = formatTicketDate("2026-09-18", "ar");
    assert.equal(formatted, "18 سبتمبر 2026");
    // Ensure no Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) per technical invariant
    assert.match(formatted, /^[0-9]+ [^0-9]+ [0-9]+$/);
  });

  it("handles null or malformed dates gracefully", () => {
    assert.equal(formatTicketDate(null, "en"), "");
    assert.equal(formatTicketDate(undefined, "ar"), "");
    assert.equal(formatTicketDate("invalid", "en"), "invalid");
  });
});

describe("resolveAirport()", () => {
  it("resolves Gaza hub GZA in EN and AR", () => {
    const en = resolveAirport("GZA", "en");
    assert.equal(en.city, "Gaza");
    assert.equal(en.airport, "Gaza International Airport");

    const ar = resolveAirport("GZA", "ar");
    assert.equal(ar.city, "غزة");
    assert.equal(ar.airport, "مطار غزة الدولي");
  });

  it("resolves destination airports across network", () => {
    assert.equal(resolveAirport("AMM", "ar").city, "عمّان");
    assert.equal(resolveAirport("CAI", "ar").city, "القاهرة");
    assert.equal(resolveAirport("IST", "ar").city, "إسطنبول");
    assert.equal(resolveAirport("LHR", "en").city, "London");
  });

  it("gracefully falls back for unknown airport codes", () => {
    const fallback = resolveAirport("XYZ", "en");
    assert.equal(fallback.code, "XYZ");
    assert.equal(fallback.city, "XYZ");
  });
});

describe("mapTicketPresentation() — Data Integrity & Invariants", () => {
  it("maps confirmed booking with all core travel fields", () => {
    const data = createSyntheticReservation({ aircraftModel: "Airbus A320" });
    const group = mapTicketPresentation(data, "en");

    assert.equal(group.reference, "GZA-7K8P");
    assert.equal(group.status, "confirmed");
    assert.equal(group.statusLabel, "Confirmed");
    assert.equal(group.isCancelled, false);
    assert.equal(group.tickets.length, 1);

    const t = group.tickets[0]!;
    assert.equal(t.passengerName, "Omar Khalil");
    assert.equal(t.flightNumber, "PS 204");
    assert.equal(t.originCode, "GZA");
    assert.equal(t.destinationCode, "AMM");
    assert.equal(t.originCity, "Gaza");
    assert.equal(t.destinationCity, "Amman");
    assert.equal(t.formattedDate, "18 SEP 2026");
    assert.equal(t.departTime, "14:30");
    assert.equal(t.arriveTime, "15:25");
    assert.equal(t.seatCode, "12A");
    assert.equal(t.hasAssignedSeat, true);
    assert.equal(t.mealLabel, "Standard Vegetarian");
    assert.equal(t.ticketNumber, "PS-0012345");
    assert.equal(t.aircraftModel, "Airbus A320");
    assert.equal(t.conceptNotice, "AI-generated illustrative future concept · Not the current or historical terminal");
  });

  it("strictly omits aircraft model when canonical data lacks it (no fabricated fallbacks)", () => {
    const dataNoAircraft = createSyntheticReservation({ aircraftModel: null });
    const group = mapTicketPresentation(dataNoAircraft, "en");
    assert.equal(group.tickets[0]!.aircraftModel, null, "Aircraft model must be null when absent; never default to Airbus A320neo");
    assert.equal(group.flight.aircraftModel, null);
  });

  it("fails closed on missing or invalid status", () => {
    const invalidData = createSyntheticReservation() as unknown as Record<string, unknown>;
    (invalidData["reservation"] as Record<string, unknown>)["status"] = "unvalidated_status";
    (invalidData["ticket"] as Record<string, unknown>)["status"] = "unvalidated_status";

    assert.throws(
      () => mapTicketPresentation(invalidData as unknown as ReservationDetail, "en"),
      /Invalid or missing reservation status/
    );
  });

  it("strictly omits cabin when canonical data does not specify it", () => {
    const dataWithoutCabin = createSyntheticReservation();
    const group = mapTicketPresentation(dataWithoutCabin, "en");
    assert.equal(group.tickets[0]!.cabin, null, "Cabin must be null when absent; never default to Economy");

    const dataWithCabin = createSyntheticReservation({ cabin: "Business" });
    const groupWithCabin = mapTicketPresentation(dataWithCabin, "en");
    assert.equal(groupWithCabin.tickets[0]!.cabin, "Business");
  });

  it("detects signed overnight flight (+1) and renders offset and date", () => {
    const overnightData = createSyntheticReservation({ arrivalDate: "2026-09-19" });
    const group = mapTicketPresentation(overnightData, "en");
    const t = group.tickets[0]!;

    assert.equal(t.isOvernight, true);
    assert.equal(t.dayOffset, 1);
    assert.equal(t.dayOffsetLabel, "+1");
    assert.equal(t.formattedArrivalDate, "19 SEP 2026");
    assert.equal(group.flight.dayOffset, 1);
    assert.equal(group.flight.dayOffsetLabel, "+1");
  });

  it("detects multi-day flight (+2) and renders offset and date", () => {
    const multiDayData = createSyntheticReservation({ arrivalDate: "2026-09-20" });
    const group = mapTicketPresentation(multiDayData, "en");
    const t = group.tickets[0]!;

    assert.equal(t.isOvernight, true);
    assert.equal(t.dayOffset, 2);
    assert.equal(t.dayOffsetLabel, "+2");
    assert.equal(t.formattedArrivalDate, "20 SEP 2026");
  });

  it("detects cross-day westward flight (-1) and renders offset and date", () => {
    const crossDayData = createSyntheticReservation({ arrivalDate: "2026-09-17" });
    const group = mapTicketPresentation(crossDayData, "en");
    const t = group.tickets[0]!;

    assert.equal(t.isOvernight, true);
    assert.equal(t.dayOffset, -1);
    assert.equal(t.dayOffsetLabel, "-1");
    assert.equal(t.formattedArrivalDate, "17 SEP 2026");
  });

  it("correctly identifies same-day flight as offset 0 and not overnight", () => {
    const sameDayData = createSyntheticReservation({ arrivalDate: "2026-09-18" });
    const group = mapTicketPresentation(sameDayData, "en");
    const t = group.tickets[0]!;

    assert.equal(t.isOvernight, false);
    assert.equal(t.dayOffset, 0);
    assert.equal(t.dayOffsetLabel, null);
    assert.equal(t.formattedArrivalDate, "18 SEP 2026");
  });

  it("maps cancelled reservation with explicit visible text", () => {
    const cancelledData = createSyntheticReservation({ status: "cancelled" });
    const enGroup = mapTicketPresentation(cancelledData, "en");
    assert.equal(enGroup.isCancelled, true);
    assert.equal(enGroup.statusLabel, "Cancelled");
    assert.equal(enGroup.tickets[0]!.statusLabel, "Cancelled");

    const arGroup = mapTicketPresentation(cancelledData, "ar");
    assert.equal(arGroup.isCancelled, true);
    assert.equal(arGroup.statusLabel, "ملغى");
    assert.equal(arGroup.tickets[0]!.statusLabel, "ملغى");
  });

  it("protects PII: no passport number, phone, contact email, or UUID in mapped ticket", () => {
    const data = createSyntheticReservation();
    const group = mapTicketPresentation(data, "en");
    const t = group.tickets[0] as unknown as Record<string, unknown>;

    assert.equal(t["email"], undefined);
    assert.equal(t["phone"], undefined);
    assert.equal(t["contact"], undefined);
    assert.equal(t["passport"], undefined);
    assert.equal(t["document"], undefined);
    assert.equal(t["id"], undefined);
  });

  it("maps multi-passenger reservations with varied names and seat assignments", () => {
    const multiPaxData = createSyntheticReservation({
      passengers: [
        { firstName: "Fatima", lastName: "Al-Husseini", seatCode: "4A", meal: null },
        { firstName: "طارق", lastName: "البرغوثي", seatCode: "4B", meal: { id: "m1", label: { en: "Fruit Platter", ar: "طبق فواكه" } } },
        { firstName: "Lina", lastName: "", seatCode: "", meal: null },
      ],
    });

    const groupEn = mapTicketPresentation(multiPaxData, "en");
    assert.equal(groupEn.tickets.length, 3);

    assert.equal(groupEn.tickets[0]!.passengerName, "Fatima Al-Husseini");
    assert.equal(groupEn.tickets[0]!.seatCode, "4A");
    assert.equal(groupEn.tickets[0]!.mealLabel, "No meal");

    assert.equal(groupEn.tickets[1]!.passengerName, "طارق البرغوثي");
    assert.equal(groupEn.tickets[1]!.seatCode, "4B");
    assert.equal(groupEn.tickets[1]!.mealLabel, "Fruit Platter");

    assert.equal(groupEn.tickets[2]!.passengerName, "Lina");
    assert.equal(groupEn.tickets[2]!.seatCode, "");
    assert.equal(groupEn.tickets[2]!.hasAssignedSeat, false);

    const groupAr = mapTicketPresentation(multiPaxData, "ar");
    assert.equal(groupAr.tickets[1]!.mealLabel, "طبق فواكه");
    assert.equal(groupAr.tickets[0]!.mealLabel, "بدون وجبة");
  });

  it("maps owner-neutral classification and omits footer disclaimer", () => {
    const data = createSyntheticReservation();
    const groupEn = mapTicketPresentation(data, "en");
    assert.equal(groupEn.classification, "Ticket / Itinerary");
    assert.equal(groupEn.validityNotice, "");
    assert.equal(groupEn.tickets[0]!.classification, "Ticket / Itinerary");
    assert.equal(groupEn.tickets[0]!.validityNotice, "");

    const groupAr = mapTicketPresentation(data, "ar");
    assert.equal(groupAr.classification, "التذكرة / مسار الرحلة");
    assert.equal(groupAr.validityNotice, "");
    assert.equal(groupAr.tickets[0]!.classification, "التذكرة / مسار الرحلة");
    assert.equal(groupAr.tickets[0]!.validityNotice, "");
  });
});

describe("extractPassengerNames() — Name Integrity & Data Loss Prevention", () => {
  it("extracts dual-script Latin/Arabic names separated by slash or parens", () => {
    const slash = extractPassengerNames("Omar Khalil / عمر خليل");
    assert.equal(slash.latin, "Omar Khalil");
    assert.equal(slash.arabic, "عمر خليل");
    assert.equal(slash.fullName, "Omar Khalil / عمر خليل");

    const parens = extractPassengerNames("عمر خليل (Omar Khalil)");
    assert.equal(parens.latin, "Omar Khalil");
    assert.equal(parens.arabic, "عمر خليل");
    assert.equal(parens.fullName, "عمر خليل (Omar Khalil)");
  });

  it("handles pure Latin names with accents and hyphens", () => {
    const latin = extractPassengerNames("José García-Müller");
    assert.equal(latin.latin, "José García-Müller");
    assert.equal(latin.arabic, "");
    assert.equal(latin.fullName, "José García-Müller");
  });

  it("handles pure Arabic names without data loss", () => {
    const arabic = extractPassengerNames("عمر خليل البرغوثي");
    assert.equal(arabic.latin, "");
    assert.equal(arabic.arabic, "عمر خليل البرغوثي");
    assert.equal(arabic.fullName, "عمر خليل البرغوثي");
  });

  it("preserves non-Latin scripts (Cyrillic, CJK, Greek) without data loss", () => {
    const cyrillic = extractPassengerNames("Иван Иванов");
    assert.equal(cyrillic.fullName, "Иван Иванов");
    assert.equal(cyrillic.latin, "Иван Иванов");

    const cjk = extractPassengerNames("李小龙");
    assert.equal(cjk.fullName, "李小龙");
    assert.equal(cjk.latin, "李小龙");

    const greek = extractPassengerNames("Νικόλαος Παπαδόπουλος");
    assert.equal(greek.fullName, "Νικόلاος Παπαδόπουλος".replace("لا", "λα"));
    assert.equal(greek.latin, "Νικόلاος Παπαδόπουλος".replace("لا", "λα"));
  });

  it("handles empty or whitespace-only names gracefully", () => {
    const empty = extractPassengerNames("   ");
    assert.equal(empty.latin, "");
    assert.equal(empty.arabic, "");
    assert.equal(empty.fullName, "");
  });
});

describe("preloadTicketImage() — Concurrent Loads & Unmount Invariants", () => {
  let originalImage: unknown;

  class MockImage {
    public src = "";
    public complete = false;
    public naturalWidth = 0;
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public static instances: MockImage[] = [];

    constructor() {
      MockImage.instances.push(this);
    }
  }

  // Setup mock before tests
  const setupMock = () => {
    originalImage = (globalThis as unknown as { Image: unknown }).Image;
    (globalThis as unknown as { Image: unknown }).Image = MockImage;
    MockImage.instances = [];
    _resetTicketImageCacheForTesting();
  };

  const teardownMock = () => {
    (globalThis as unknown as { Image: unknown }).Image = originalImage;
    _resetTicketImageCacheForTesting();
  };

  it("concurrent requests share a single immutable promise and resolve both instances", async () => {
    setupMock();
    try {
      const p1 = preloadTicketImage("ticket-blank.png");
      const p2 = preloadTicketImage("ticket-blank.png");

      assert.strictEqual(p1, p2, "Both callers must share the exact same promise");
      assert.equal(MockImage.instances.length, 1, "Only one Image instance must be created");

      const img = MockImage.instances[0]!;
      img.complete = true;
      img.naturalWidth = 1774;

      let resolved1: unknown = null;
      let resolved2: unknown = null;

      p1.then((i) => { resolved1 = i; });
      p2.then((i) => { resolved2 = i; });

      // Trigger load
      img.onload?.();

      const [r1, r2] = await Promise.all([p1, p2]);
      assert.strictEqual(r1, img);
      assert.strictEqual(r2, img);
      assert.strictEqual(resolved1, img);
      assert.strictEqual(resolved2, img);
    } finally {
      teardownMock();
    }
  });

  it("disposed unmount listener flag prevents state dispatch", async () => {
    setupMock();
    try {
      let stateCalled = false;
      let cancelled = false;

      const p = preloadTicketImage("ticket-blank.png");
      p.then(() => {
        if (!cancelled) {
          stateCalled = true;
        }
      });

      // Simulate component unmount before image load completes
      cancelled = true;

      const img = MockImage.instances[0]!;
      img.complete = true;
      img.naturalWidth = 1774;
      img.onload?.();

      await p;
      assert.equal(stateCalled, false, "Cancelled callback must not be invoked on unmounted instance");
    } finally {
      teardownMock();
    }
  });

  it("load failure cleanly rejects and clears cache allowing subsequent retry", async () => {
    setupMock();
    try {
      const pFail = preloadTicketImage("fail.png");
      const img1 = MockImage.instances[0]!;

      img1.onerror?.();

      await assert.rejects(pFail, { message: "Failed to load approved ticket background artwork" });

      // Subsequent call creates a new instance because cache was reset
      const pRetry = preloadTicketImage("fail.png");
      assert.equal(MockImage.instances.length, 2, "Failed cache must reset so retry instantiates new image");
      const img2 = MockImage.instances[1]!;
      img2.complete = true;
      img2.naturalWidth = 1774;
      img2.onload?.();

      const success = await pRetry;
      assert.strictEqual(success, img2);
    } finally {
      teardownMock();
    }
  });
});

describe("Approved Ticket Artwork & Layout Invariants", () => {
  it("enforces exact 1774x887 (2:1) dimensions", () => {
    assert.equal(TICKET_CANVAS_WIDTH, 1774);
    assert.equal(TICKET_CANVAS_HEIGHT, 887);
    assert.equal(TICKET_CANVAS_ASPECT_RATIO, "1774 / 887");
  });

  it("source files contain zero references to 1744 typo", () => {
    const tsxPath = path.resolve("src/components/booking/commemorative-ticket.tsx");
    const cssPath = path.resolve("src/components/booking/commemorative-ticket.css");
    const tsx = readFileSync(tsxPath, "utf8");
    const css = readFileSync(cssPath, "utf8");

    assert.equal(tsx.includes("1744"), false, "commemorative-ticket.tsx must not contain 1744 typo");
    assert.equal(css.includes("1744"), false, "commemorative-ticket.css must not contain 1744 typo");
  });

  it("commemorative-ticket.tsx does not duplicate inline print styles", () => {
    const tsxPath = path.resolve("src/components/booking/commemorative-ticket.tsx");
    const tsx = readFileSync(tsxPath, "utf8");

    assert.equal(tsx.includes("INLINE_PRINT_STYLE"), false, "Must not define redundant INLINE_PRINT_STYLE string");
    assert.equal(tsx.includes("<style>{INLINE_PRINT_STYLE}</style>"), false, "Must not inject duplicate inline style");
  });

  it("commemorative-ticket.tsx does not combine EN/AR labels into single UI strings", () => {
    const tsxPath = path.resolve("src/components/booking/commemorative-ticket.tsx");
    const tsx = readFileSync(tsxPath, "utf8");

    assert.equal(tsx.includes('"PASSENGER / المسافر"'), false, "Must not combine EN/AR into single passenger label");
    assert.equal(tsx.includes('"FLIGHT / الرحلة"'), false, "Must not combine EN/AR into single flight label");
    assert.equal(tsx.includes('"BOOKING REFERENCE / مرجع الحجز"'), false, "Must not combine EN/AR into single reference label");
  });

  it("commemorative-ticket.tsx omits fake barcode text and sample disclaimers", () => {
    const tsxPath = path.resolve("src/components/booking/commemorative-ticket.tsx");
    const tsx = readFileSync(tsxPath, "utf8");

    assert.equal(tsx.includes("SAMPLE · NO BARCODE"), false, "Must omit SAMPLE · NO BARCODE disclaimer text");
    assert.equal(tsx.includes("gza-ticket-disclosure-banner"), false, "Must omit visible commemorative eyebrow banner");
  });

  it("commemorative-ticket.css includes complete print isolation without clipping", () => {
    const cssPath = path.resolve("src/components/booking/commemorative-ticket.css");
    const css = readFileSync(cssPath, "utf8");

    assert.equal(css.includes("@media print"), true, "Must include print media queries");
    assert.equal(css.includes("max-width: 190mm"), true, "Must bound print width to A4 190mm printable area");
    assert.equal(css.includes("break-inside: avoid"), true, "Must prevent breaking individual ticket cards");
  });
});
