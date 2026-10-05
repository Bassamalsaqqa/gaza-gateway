import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Flight } from "./data";
import {
  destinationByCode,
  isFlightBookable,
} from "./data";
import { makePnr } from "./format";
import type {
  Contact,
  Draft,
  Extras,
  Passenger,
  PassengerType,
  PaxExtras,
  SearchCriteria,
} from "./booking-draft.ts";
import {
  buildLegacyStoreEnvelope,
  calculateMaxStep,
  createFreshDraft,
  defaultCriteria,
  emptyPassenger,
  emptyPaxExtras,
  extrasFor,
  extrasForPassengers,
  initialDraft,
  passengersFor,
  paxCount,
  totalExtraBags,
  validateAndSanitizeDraft,
} from "./booking-draft.ts";

export type {
  Contact,
  Draft,
  Extras,
  Passenger,
  PassengerType,
  PaxExtras,
  SearchCriteria,
};
export {
  buildLegacyStoreEnvelope,
  calculateMaxStep,
  createFreshDraft,
  defaultCriteria,
  emptyPassenger,
  emptyPaxExtras,
  extrasFor,
  extrasForPassengers,
  initialDraft,
  passengersFor,
  paxCount,
  totalExtraBags,
  validateAndSanitizeDraft,
};

export type {
  Booking,
  BookingPassenger,
  CheckedIn,
  Leg,
} from "./domain/booking";
export {
  anyCheckedIn,
  bookingLegs,
  checkedInPax,
  infantsWith,
  isCheckedIn,
  isPaxCheckedIn,
  legFullyCheckedIn,
  makePassengerId,
  openLegs,
  openPaxForLeg,
  passCount,
  seatedPassengers,
} from "./domain/booking";
import type { Booking, BookingPassenger, CheckedIn, Leg } from "./domain/booking";
import { makePassengerId } from "./domain/booking";
import { useRepositories } from "./repositories";
import { normalizeEmailIdentity } from "./passenger/domain.ts";
import { usePassengerAccount } from "./passenger/queries.ts";

export { bookingTotal } from "./domain/pricing.ts";

type StoreValue = {
  ready: boolean;
  bookings: Booking[];
  addBooking: (
    booking: Omit<Booking, "ref" | "createdAt" | "status" | "checkedIn" | "ownerEmail" | "passengers"> & {
      passengers: (Passenger | BookingPassenger)[];
    },
  ) => Promise<Booking>;
  checkInLeg: (ref: string, leg: Leg, paxIndexes: number[]) => Promise<void>;
  findBooking: (ref: string) => Booking | undefined;
};

const StoreContext = createContext<StoreValue | null>(null);

type LegacyExtras = { extraBags?: number; meal?: string; assistance?: string[] };

/** Bring older locally stored bookings up to the current shape. */
function migrateBooking(raw: Booking): Booking {
  const legacy = raw as Booking & { checkedIn: unknown };
  const passengers = (raw.passengers ?? []).map((p) => ({ ...p, type: p.type ?? "adult" }));
  const seated = passengers.flatMap((p, i) => (p.type === "infant" ? [] : [i]));
  const asList = (value: unknown): number[] => {
    if (Array.isArray(value)) return value.filter((v): v is number => typeof v === "number");
    return value === true ? seated : [];
  };
  const stored = legacy.checkedIn as { out?: unknown; in?: unknown } | boolean | undefined;
  const checkedIn: CheckedIn =
    typeof stored === "boolean"
      ? { out: stored ? seated : [], in: stored ? seated : [] }
      : { out: asList(stored?.out), in: asList(stored?.in) };

  const rawExtras = raw.extras as unknown as (Extras & LegacyExtras) | undefined;
  const extras: Extras = Array.isArray(rawExtras?.pax)
    ? extrasForPassengers({ pax: rawExtras.pax }, passengers.length)
    : {
        pax: passengers.map((_, i) => ({
          extraBags: i === 0 ? (rawExtras?.extraBags ?? 0) : 0,
          meal: rawExtras?.meal ?? "standard",
          assistance: i === 0 ? (rawExtras?.assistance ?? []) : [],
        })),
      };

  return { ...raw, checkedIn, extras, passengers, ownerEmail: raw.ownerEmail ?? null };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { booking: bookingRepo } = useRepositories();
  const { data: canonicalAccount } = usePassengerAccount();
  const [ready, setReady] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);

  // Synchronize bookings with canonical BookingRepository
  useEffect(() => {
    let mounted = true;
    bookingRepo.list().then((list) => {
      if (mounted) {
        setBookings(list);
        setReady(true);
      }
    });

    const unsubscribe = bookingRepo.subscribe(() => {
      bookingRepo.list().then((list) => {
        if (mounted) setBookings(list);
      });
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [bookingRepo]);

  const addBooking = useCallback(
    async (
      booking: Omit<Booking, "ref" | "createdAt" | "status" | "checkedIn" | "ownerEmail" | "passengers"> & {
        passengers: (Passenger | BookingPassenger)[];
      },
    ): Promise<Booking> => {
      if (booking.outbound?.id.startsWith("CAP-PROOF") || booking.inbound?.id.startsWith("CAP-PROOF")) {
        throw new Error("Cannot create booking: test fixture flight cannot be booked.");
      }
      const paxCount = booking.passengers.filter((p) => p.type !== "infant").length || 1;
      if (!isFlightBookable(booking.outbound, { paxCount })) {
        throw new Error("Cannot create booking: outbound flight is not bookable.");
      }
      if (booking.inbound && !isFlightBookable(booking.inbound, { paxCount })) {
        throw new Error("Cannot create booking: inbound flight is not bookable.");
      }

      const ownerEmail = canonicalAccount?.email
        ? normalizeEmailIdentity(canonicalAccount.email)
        : null;

      // Authoritative creation in canonical repository (determines PNR, checks bookability, persists)
      const created = await bookingRepo.create({
        criteria: booking.criteria,
        outbound: booking.outbound,
        inbound: booking.inbound,
        fareId: booking.fareId,
        passengers: booking.passengers,
        seats: booking.seats,
        extras: booking.extras,
        contact: booking.contact,
        total: booking.total,
        ownerEmail,
      });

      setBookings((prev) => [created, ...prev.filter((b) => b.ref !== created.ref)]);
      return created;
    },
    [canonicalAccount, bookingRepo],
  );

  const checkInLeg = useCallback(
    async (ref: string, leg: Leg, paxIndexes: number[]) => {
      const updated = await bookingRepo.checkIn(ref, leg, paxIndexes);
      if (updated) {
        setBookings((prev) =>
          prev.map((b) =>
            b.ref.toUpperCase() === updated.ref.toUpperCase() ? updated : b,
          ),
        );
      }
    },
    [bookingRepo],
  );

  const findBooking = useCallback(
    (ref: string) => bookings.find((b) => b.ref.toUpperCase() === ref.trim().toUpperCase()),
    [bookings],
  );

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      bookings,
      addBooking,
      checkInLeg,
      findBooking,
    }),
    [
      ready,
      bookings,
      addBooking,
      checkInLeg,
      findBooking,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
