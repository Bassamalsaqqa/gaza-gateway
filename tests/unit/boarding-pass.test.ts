import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildBoardingPassViewModel, computeBoardingTime, getBoardingPassData } from "../../src/lib/domain/boarding-pass.ts";
import { type Booking } from "../../src/lib/domain/booking.ts";
import { type Flight } from "../../src/lib/data.ts";

describe("Boarding-Pass Domain Selector (Phase 4.0.1)", () => {
  const mockFlightOut: Flight = {
    id: "f-out",
    number: "PS 101",
    date: "2026-10-10",
    departTime: "10:00",
    arriveTime: "12:00",
    originCode: "GZA",
    destinationCode: "AMM",
    status: "OnTime",
    aircraft: "Boeing 737",
    gate: "1",
    terminal: "T1",
    basePrice: 100,
    durationMinutes: 120,
    seatsLeft: 8,
  };

  const mockFlightIn: Flight = {
    id: "f-in",
    number: "PS 102",
    date: "2026-10-15",
    departTime: "14:30",
    arriveTime: "16:30",
    originCode: "AMM",
    destinationCode: "GZA",
    status: "OnTime",
    aircraft: "Boeing 737",
    gate: "2",
    terminal: "T1",
    basePrice: 100,
    durationMinutes: 120,
    seatsLeft: 8,
  };

  const baseBooking: Booking = {
    ref: "GZA-1234",
    createdAt: "2026-09-01T10:00:00Z",
    status: "confirmed",
    ownerEmail: "test@example.com",
    total: 200,
    contact: { email: "test@example.com", phone: "+970000000" },
    criteria: {
      tripType: "round", origin: "GZA", destination: "AMM", departDate: "2026-10-10",
      returnDate: "2026-10-15", adults: 2, children: 0, infants: 1, cabin: "economy",
    },
    outbound: mockFlightOut,
    inbound: mockFlightIn,
    fareId: "classic",
    passengers: [
      { id: "p1", firstName: "John", lastName: "Doe", type: "adult", dob: "1980-01-01", nationality: "PS", document: "P123" },
      { id: "p2", firstName: "Jane", lastName: "Doe", type: "adult", dob: "1985-01-01", nationality: "PS", document: "P124" },
      { id: "p3", firstName: "Baby", lastName: "Doe", type: "infant", dob: "2025-01-01", nationality: "PS", document: "P125", withAdult: 0 },
    ],
    seats: {
      "out-0": "1A",
      "out-1": "1B",
      "in-0": "2A",
    },
    extras: { pax: [] },
    checkedIn: {
      out: [0, 1],
      in: [0],
    },
  };

  describe("getBoardingPassData", () => {
    it("returns supported outbound facts with a stable passenger ID and accompanying infant", () => {
      const data = getBoardingPassData(baseBooking, "out", 0);
      assert.equal(data?.bookingRef, "GZA-1234");
      assert.equal(data?.passengerId, "p1");
      assert.equal(data?.passengerType, "adult");
      assert.deepEqual(data?.accompanyingInfantNames, ["Baby Doe"]);
      assert.equal(data?.flightId, "f-out");
      assert.equal(data?.originCode, "GZA");
      assert.equal(data?.destinationCode, "AMM");
      assert.equal(data?.scheduledDepartureTime, "10:00");
      assert.equal(data?.seat, "1A");
      assert.equal(data?.fareId, "classic");
      assert.equal(data?.cabin, "economy");
      assert.equal(Object.hasOwn(data ?? {}, "boardingTime"), false);
      assert.equal(Object.hasOwn(data ?? {}, "sequence"), false);
    });

    it("uses inbound route and seat, and omits an unassigned seat", () => {
      const inbound = getBoardingPassData(baseBooking, "in", 0);
      assert.equal(inbound?.originCode, "AMM");
      assert.equal(inbound?.destinationCode, "GZA");
      assert.equal(inbound?.seat, "2A");
      const noSeat = getBoardingPassData({ ...baseBooking, seats: {} }, "out", 0);
      assert.equal(Object.hasOwn(noSeat ?? {}, "seat"), false);
    });

    it("accepts only an effective flight for the booked instance", () => {
      const effective = { ...mockFlightOut, gate: "B7", revisedDepart: "11:00" };
      const data = getBoardingPassData(baseBooking, "out", 0, effective);
      assert.equal(data?.gate, "B7");
      assert.equal(data?.revisedDepartureTime, "11:00");
      assert.equal(data?.scheduledDepartureTime, "10:00");
      assert.equal(getBoardingPassData(baseBooking, "out", 0, mockFlightIn), null);
    });

    it("rejects invalid, infant, unchecked, and nonexistent inbound requests", () => {
      assert.equal(getBoardingPassData(baseBooking, "out", 99), null);
      assert.equal(getBoardingPassData(baseBooking, "out", 2), null);
      assert.equal(getBoardingPassData(baseBooking, "in", 1), null);
      assert.equal(getBoardingPassData({ ...baseBooking, inbound: null }, "in", 0), null);
    });
  });

  describe("computeBoardingTime", () => {
    it("returns time 45 mins earlier", () => {
      assert.equal(computeBoardingTime("10:00"), "09:15");
      assert.equal(computeBoardingTime("00:30"), "23:45");
      assert.equal(computeBoardingTime("invalid"), "invalid");
    });
  });

  describe("buildBoardingPassViewModel", () => {
    it("builds correct view model for outbound leg with seat and infant", () => {
      const vm = buildBoardingPassViewModel(baseBooking, "out", 0);
      assert.equal(vm.ref, "GZA-1234");
      assert.equal(vm.leg, "out");
      assert.equal(vm.paxIndex, 0);
      assert.equal(vm.passengerName, "Doe / John");
      assert.equal(vm.isInfant, false);
      assert.deepEqual(vm.infantNames, ["Baby Doe"]);
      assert.equal(vm.flight, mockFlightOut);
      assert.equal(vm.seat, "1A");
      assert.equal(vm.sequence, 1);
      assert.equal(vm.totalCheckedIn, 2);
      assert.equal(vm.boardingTime, "09:15");
      assert.equal(vm.fareId, "classic");
    });

    it("builds correct view model for inbound leg", () => {
      const vm = buildBoardingPassViewModel(baseBooking, "in", 0);
      assert.equal(vm.leg, "in");
      assert.deepEqual(vm.infantNames, ["Baby Doe"]);
      assert.equal(vm.flight, mockFlightIn);
      assert.equal(vm.seat, "2A");
      assert.equal(vm.sequence, 1);
      assert.equal(vm.totalCheckedIn, 1);
    });

    it("handles missing seat", () => {
      const bookingNoSeat = {
        ...baseBooking,
        seats: {},
        checkedIn: { out: [1], in: [] },
      };
      const vmNoSeat = buildBoardingPassViewModel(bookingNoSeat, "out", 1);
      assert.equal(vmNoSeat.seat, null);
    });

    it("supports operational flight override while preserving scheduled departure for boarding opens", () => {
      const overrideFlight = { ...mockFlightOut, number: "PS 999", gate: "B2", revisedDepart: "11:00" };
      const vm = buildBoardingPassViewModel(baseBooking, "out", 0, overrideFlight);
      assert.equal(vm.flight.number, "PS 999");
      assert.equal(vm.flight.gate, "B2");
      assert.equal(vm.scheduledDepartureTime, "10:00");
      assert.equal(vm.revisedDepartureTime, "11:00");
      // Boarding opens is strictly derived from scheduled departure (10:00 - 45m = 09:15)
      assert.equal(vm.boardingOpensTime, "09:15");
      assert.equal(vm.boardingTime, "09:15");
    });

    it("rejects infant passenger directly", () => {
      assert.throws(() => buildBoardingPassViewModel(baseBooking, "out", 2), /infant/);
    });

    it("rejects passenger not checked in", () => {
      assert.throws(() => buildBoardingPassViewModel(baseBooking, "in", 1), /not checked in/);
    });

    it("rejects missing passenger", () => {
      assert.throws(() => buildBoardingPassViewModel(baseBooking, "out", 99), /not found/);
    });

    it("rejects inbound leg for one-way booking", () => {
      const oneWay = { ...baseBooking, inbound: null, checkedIn: { out: [0], in: [0] } };
      assert.throws(() => buildBoardingPassViewModel(oneWay, "in", 0), /one-way/);
    });
  });
});
