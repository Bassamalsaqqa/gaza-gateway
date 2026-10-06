import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isFlightBookable,
  getFlightBookability,
  getSeatRequiredPaxCount,
} from "../../src/lib/booking-rules.ts";
import { type Flight } from "../../src/lib/data.ts";
import { currentDeparturesOn } from "../helpers/current-service-fixture.ts";
import { createRepositories } from "../../src/lib/repositories/registry.ts";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

function createMockFlight(overrides: Partial<Flight> = {}): Flight {
  return {
    ...currentDeparturesOn("2026-10-15", "2026-10-01").find(f => f.destinationCode === "AMM")!,
    ...overrides,
  };
}

describe("Sellable Service Matrix & Authority Convergence", () => {
  describe("1. Pure Bookability Evaluation Matrix", () => {
    it("all Cancelled: evaluates as unbookable across all records", () => {
      const flights: Flight[] = [
        createMockFlight({ id: "F1", status: "Cancelled", seatsLeft: 10 }),
        createMockFlight({ id: "F2", status: "Cancelled", seatsLeft: 5 }),
      ];

      for (const f of flights) {
        const result = getFlightBookability(f, { paxCount: 1 });
        assert.equal(result.bookable, false);
        assert.equal(result.reason, "cancelled");
        assert.equal(isFlightBookable(f, { paxCount: 1 }), false);
      }

      const hasSellableService = flights.some((f) => isFlightBookable(f, { paxCount: 1 }));
      assert.equal(hasSellableService, false);
    });

    it("all sold out (seatsLeft = 0): evaluates as sold_out", () => {
      const flights: Flight[] = [
        createMockFlight({ id: "F1", status: "Scheduled", seatsLeft: 0 }),
        createMockFlight({ id: "F2", status: "OnTime", seatsLeft: 0 }),
      ];

      for (const f of flights) {
        const result = getFlightBookability(f, { paxCount: 1 });
        assert.equal(result.bookable, false);
        assert.equal(result.reason, "sold_out");
        assert.equal(isFlightBookable(f, { paxCount: 1 }), false);
      }

      const hasSellableService = flights.some((f) => isFlightBookable(f, { paxCount: 1 }));
      assert.equal(hasSellableService, false);
    });

    it("capacity below requested party: evaluates as insufficient_seats", () => {
      const flight = createMockFlight({ seatsLeft: 2 });

      // Party of 1 adult + 1 child = 2 seats -> bookable
      const pax2 = getSeatRequiredPaxCount({ adults: 1, children: 1, infants: 1 });
      assert.equal(pax2, 2);
      assert.equal(isFlightBookable(flight, { paxCount: pax2 }), true);

      // Party of 2 adults + 1 child = 3 seats -> insufficient_seats
      const pax3 = getSeatRequiredPaxCount({ adults: 2, children: 1, infants: 0 });
      assert.equal(pax3, 3);
      const res3 = getFlightBookability(flight, { paxCount: pax3 });
      assert.equal(res3.bookable, false);
      assert.equal(res3.reason, "insufficient_seats");
      assert.equal(isFlightBookable(flight, { paxCount: pax3 }), false);
    });

    it("mixed unavailable plus one bookable: sellable service exists and selects bookable", () => {
      const flights: Flight[] = [
        createMockFlight({ id: "F-CAN", status: "Cancelled", basePrice: 100, seatsLeft: 10 }),
        createMockFlight({ id: "F-SOLD", status: "Scheduled", basePrice: 120, seatsLeft: 0 }),
        createMockFlight({ id: "F-PAST", status: "Departed", basePrice: 130, seatsLeft: 5 }),
        createMockFlight({ id: "F-GOOD", status: "Scheduled", basePrice: 190, seatsLeft: 4 }),
      ];

      const bookable = flights.filter((f) => isFlightBookable(f, { paxCount: 2 }));
      assert.equal(bookable.length, 1);
      assert.equal(bookable[0]?.id, "F-GOOD");

      const hasSellableService = flights.some((f) => isFlightBookable(f, { paxCount: 2 }));
      assert.equal(hasSellableService, true);
    });
  });

  describe("2. FlightRepository Convergence & Round-Trip Matrix", () => {
    it("search and monthly service agree on bookability for same route, date, and paxCount", async () => {
      const storage = new MemoryStorage();
      const repos = createRepositories({ storage });

      const date = "2026-10-15";
      const origin = "GZA";
      const dest = "AMM";
      const paxCount = 1;

      // Initial baseline: flights exist and are bookable
      const searchResult = await repos.flight.searchFlights(origin, dest, date);
      assert.ok(searchResult.every(f => f.id.startsWith("svc1-") && f.scheduleId));
      const searchBookable = searchResult.filter((f) => isFlightBookable(f, { paxCount }));
      const hasSearchService = searchBookable.length > 0;
      assert.equal(hasSearchService, true);

      const monthlyMap = await repos.flight.getMonthlyServiceMap(2026, 10, origin, dest, { paxCount });
      assert.equal(monthlyMap[date]?.hasService, true);
      assert.equal(hasSearchService, monthlyMap[date]?.hasService);

      // Now cancel all flights on that date via repository overrides
      for (const f of searchResult) {
        await repos.flight.setOverride(f.id, { status: "Cancelled" });
      }

      // Re-query both
      const updatedSearch = await repos.flight.searchFlights(origin, dest, date);
      const updatedSearchBookable = updatedSearch.filter((f) => isFlightBookable(f, { paxCount }));
      const updatedSearchService = updatedSearchBookable.length > 0;
      assert.equal(updatedSearchService, false);

      const updatedMonthly = await repos.flight.getMonthlyServiceMap(2026, 10, origin, dest, { paxCount });
      assert.equal(updatedMonthly[date]?.hasService, false);
      assert.equal(updatedMonthly[date]?.lowestFare, null);

      // 100% agreement between search and calendar
      assert.equal(updatedSearchService, updatedMonthly[date]?.hasService);
    });

    it("correct reverse route for round trip: outbound GZA->AMM and return AMM->GZA are independent", async () => {
      const storage = new MemoryStorage();
      const repos = createRepositories({ storage });

      const departDate = "2026-10-15";
      const returnDate = "2026-10-20";

      const outFlights = await repos.flight.searchFlights("GZA", "AMM", departDate);
      assert.ok(outFlights.length > 0);
      assert.equal(outFlights[0]?.originCode, "GZA");
      assert.equal(outFlights[0]?.destinationCode, "AMM");

      const inFlights = await repos.flight.searchFlights("AMM", "GZA", returnDate);
      assert.ok(inFlights.length > 0);
      assert.equal(inFlights[0]?.originCode, "AMM");
      assert.equal(inFlights[0]?.destinationCode, "GZA");

      // Cancel return flights only
      for (const inf of inFlights) {
        await repos.flight.setOverride(inf.id, { status: "Cancelled" });
      }

      // Outbound remains bookable
      const refreshedOut = await repos.flight.searchFlights("GZA", "AMM", departDate);
      const hasOutService = refreshedOut.some((f) => isFlightBookable(f, { paxCount: 1 }));
      assert.equal(hasOutService, true);

      // Return has no bookable service
      const refreshedIn = await repos.flight.searchFlights("AMM", "GZA", returnDate);
      const hasInService = refreshedIn.some((f) => isFlightBookable(f, { paxCount: 1 }));
      assert.equal(hasInService, false);
    });
  });
});
