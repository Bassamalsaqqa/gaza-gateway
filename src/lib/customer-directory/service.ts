/**
 * Gaza Gateway — Derived Customer Directory Service (Phase 6C)
 *
 * Implements the non-persistent customer directory projection by reading from
 * PassengerRepository (gza.passenger.v1) and BookingRepository (gza.repo.v1).
 *
 * Guaranteed invariants:
 * - Pure derived projection: NO persistent `gza.customer.v1` store.
 * - Truthful account ownership: only bookings with `b.ownerEmail === account.email`
 *   are assigned to the account. (Contact email equality does not confer ownership).
 * - Truthful guest grouping: unowned bookings (`!b.ownerEmail`) are grouped by
 *   normalized contact email. No fabricated account entities.
 * - Deterministic, collision-free route IDs with explicit collision guard.
 * - Reactive change propagation subscribing to both underlying repositories.
 * - Detached results preventing reference mutations.
 */

import type { Booking } from "../domain/booking.ts";
import { normalizeEmailIdentity } from "../passenger/domain.ts";
import type { PassengerRepository } from "../passenger/repository.ts";
import type { BookingRepository } from "../repositories/types.ts";
import { todayISO } from "../data.ts";
import {
  assertNoRouteIdCollisions,
  customerToRouteId,
  routeIdToCustomerInfo,
} from "./id.ts";
import type {
  CustomerDetail,
  CustomerDirectoryService,
  CustomerSummary,
} from "./types.ts";

/**
 * Pure predicate determining if a confirmed booking is upcoming relative to a clock date.
 * If outbound departure is on or after the clock date, or if round-trip inbound
 * departure is on or after the clock date, the booking is upcoming.
 */
export function isBookingUpcoming(booking: Booking, clockDate: string): boolean {
  if (booking.status === "cancelled") return false;
  if (booking.outbound.date >= clockDate) return true;
  if (booking.inbound && booking.inbound.date >= clockDate) return true;
  return false;
}

export class LocalCustomerDirectoryService implements CustomerDirectoryService {
  private readonly passengerRepo: PassengerRepository;
  private readonly bookingRepo: BookingRepository;

  constructor(passengerRepo: PassengerRepository, bookingRepo: BookingRepository) {
    this.passengerRepo = passengerRepo;
    this.bookingRepo = bookingRepo;
  }

  public async listCustomers(options?: { clock?: () => string }): Promise<CustomerSummary[]> {
    const clockDate = options?.clock ? options.clock() : todayISO();

    const [account, travelers, allBookings] = await Promise.all([
      this.passengerRepo.getAccount(),
      this.passengerRepo.listTravelers(),
      this.bookingRepo.list(),
    ]);

    const summaries: CustomerSummary[] = [];

    // 1. Account Customer (if passenger account exists locally)
    if (account) {
      const normalizedAccountEmail = normalizeEmailIdentity(account.email);
      // Canonical account ownership: strictly ownerEmail match
      const ownedBookings = allBookings.filter(
        (b) => b.ownerEmail && normalizeEmailIdentity(b.ownerEmail) === normalizedAccountEmail,
      );

      const fullName = `${account.firstName} ${account.lastName}`.trim();
      const name = fullName || account.email;
      const upcomingCount = ownedBookings.filter((b) => isBookingUpcoming(b, clockDate)).length;

      summaries.push({
        id: customerToRouteId("account", normalizedAccountEmail),
        type: "account",
        name,
        email: account.email,
        phone: account.phone,
        bookingCount: ownedBookings.length,
        upcomingCount,
        travelerCount: travelers.length,
        refs: ownedBookings.map((b) => b.ref),
      });
    }

    // 2. Guest Customers: unowned bookings (!ownerEmail) grouped by normalized contact email
    const guestGroups = new Map<string, Booking[]>();

    for (const b of allBookings) {
      if (b.ownerEmail) continue; // Owned booking belongs to account, not guest
      const emailNorm = normalizeEmailIdentity(b.contact.email);
      if (!emailNorm || !emailNorm.includes("@")) continue; // Skip malformed/missing contact email

      const existing = guestGroups.get(emailNorm) ?? [];
      existing.push(b);
      guestGroups.set(emailNorm, existing);
    }

    for (const [normEmail, bookings] of guestGroups.entries()) {
      // Sort bookings by creation date descending (newest first)
      const sorted = [...bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const latest = sorted[0];

      const leadPax = latest?.passengers[0];
      const leadName = leadPax ? `${leadPax.firstName} ${leadPax.lastName}`.trim() : "";
      const name = leadName || latest?.contact.email || normEmail;
      const phone = latest?.contact.phone || "";
      const upcomingCount = bookings.filter((b) => isBookingUpcoming(b, clockDate)).length;

      summaries.push({
        id: customerToRouteId("guest", normEmail),
        type: "guest",
        name,
        email: latest?.contact.email || normEmail,
        phone,
        bookingCount: bookings.length,
        upcomingCount,
        travelerCount: 0,
        refs: bookings.map((b) => b.ref),
      });
    }

    // Explicit collision check
    assertNoRouteIdCollisions(summaries);

    // Return detached copies
    return JSON.parse(JSON.stringify(summaries));
  }

  public async getCustomerById(
    id: string,
    options?: { clock?: () => string },
  ): Promise<CustomerDetail | null> {
    const routeInfo = routeIdToCustomerInfo(id);
    if (!routeInfo) return null;

    const clockDate = options?.clock ? options.clock() : todayISO();

    if (routeInfo.type === "account") {
      const [account, travelers, allBookings] = await Promise.all([
        this.passengerRepo.getAccount(),
        this.passengerRepo.listTravelers(),
        this.bookingRepo.list(),
      ]);

      if (!account) return null;
      if (normalizeEmailIdentity(account.email) !== routeInfo.normalizedEmail) {
        return null;
      }

      const ownedBookings = allBookings.filter(
        (b) => b.ownerEmail && normalizeEmailIdentity(b.ownerEmail) === routeInfo.normalizedEmail,
      );

      const fullName = `${account.firstName} ${account.lastName}`.trim();
      const name = fullName || account.email;
      const upcomingCount = ownedBookings.filter((b) => isBookingUpcoming(b, clockDate)).length;

      const detail: CustomerDetail = {
        id,
        type: "account",
        name,
        email: account.email,
        phone: account.phone,
        bookingCount: ownedBookings.length,
        upcomingCount,
        travelerCount: travelers.length,
        refs: ownedBookings.map((b) => b.ref),
        account,
        travelers,
        bookings: ownedBookings,
        seatPreference: account.seatPreference ?? null,
        mealPreference: account.mealPreference ?? null,
        newsletter: account.newsletter ?? null,
      };

      return JSON.parse(JSON.stringify(detail));
    }

    // Guest Customer Detail
    const allBookings = await this.bookingRepo.list();
    const guestBookings = allBookings.filter(
      (b) =>
        !b.ownerEmail && normalizeEmailIdentity(b.contact.email) === routeInfo.normalizedEmail,
    );

    if (guestBookings.length === 0) {
      return null;
    }

    const sorted = [...guestBookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const latest = sorted[0];

    const leadPax = latest?.passengers[0];
    const leadName = leadPax ? `${leadPax.firstName} ${leadPax.lastName}`.trim() : "";
    const name = leadName || latest?.contact.email || routeInfo.normalizedEmail;
    const phone = latest?.contact.phone || "";
    const upcomingCount = guestBookings.filter((b) => isBookingUpcoming(b, clockDate)).length;

    const detail: CustomerDetail = {
      id,
      type: "guest",
      name,
      email: latest?.contact.email || routeInfo.normalizedEmail,
      phone,
      bookingCount: guestBookings.length,
      upcomingCount,
      travelerCount: 0,
      refs: guestBookings.map((b) => b.ref),
      account: null,
      travelers: [],
      bookings: guestBookings,
      seatPreference: null,
      mealPreference: null,
      newsletter: null,
    };

    return JSON.parse(JSON.stringify(detail));
  }

  public subscribe(listener: () => void): () => void {
    const unsubPassenger = this.passengerRepo.subscribe(listener);
    const unsubBooking = this.bookingRepo.subscribe(listener);

    return () => {
      unsubPassenger();
      unsubBooking();
    };
  }
}
