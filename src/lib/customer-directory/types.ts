/**
 * Gaza Gateway — Derived Customer Directory Types (Phase 6C)
 *
 * Defines the read-only projection contract for the customer directory.
 * Customer directory is NON-PERSISTENT: it derives on-the-fly from
 * PassengerRepository (gza.passenger.v1) and BookingRepository (gza.repo.v1).
 */

import type { Booking } from "../domain/booking.ts";
import type { PassengerAccount, Traveler } from "../passenger/domain.ts";

export type CustomerType = "account" | "guest";

export interface CustomerSummary {
  /** Stable non-raw-email route identifier (e.g. cus_acc_<base64url> or cus_gst_<base64url>) */
  id: string;
  type: CustomerType;
  name: string;
  email: string;
  phone: string;
  bookingCount: number;
  upcomingCount: number;
  travelerCount: number;
  refs: string[];
}

export interface CustomerDetail extends CustomerSummary {
  account: PassengerAccount | null;
  travelers: Traveler[];
  bookings: Booking[];
  seatPreference?: string | null;
  mealPreference?: string | null;
  newsletter?: boolean | null;
}

export interface CustomerDirectoryService {
  listCustomers(options?: { clock?: () => string }): Promise<CustomerSummary[]>;
  getCustomerById(id: string, options?: { clock?: () => string }): Promise<CustomerDetail | null>;
  subscribe(listener: () => void): () => void;
}
