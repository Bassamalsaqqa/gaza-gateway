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
import { EXTRA_BAG_PRICE, farePrice, seatFee } from "./data";
import { makePnr } from "./format";

export type PassengerType = "adult" | "child" | "infant";

export type Passenger = {
  type: PassengerType;
  /** For infants: index of the accompanying adult in the passenger list. */
  withAdult?: number;
  firstName: string;
  lastName: string;
  dob: string;
  nationality: string;
  document: string;
};

export type Extras = {
  extraBags: number;
  meal: string;
  assistance: string[];
};

export type Contact = { email: string; phone: string };

export type SearchCriteria = {
  tripType: "round" | "oneway";
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string;
  adults: number;
  children: number;
  infants: number;
  cabin: string;
};

export type Leg = "out" | "in";

/** Per-leg check-in state: a leg is checked in only when its own list is set. */
export type CheckedIn = { out: boolean; in: boolean };

export type Booking = {
  ref: string;
  createdAt: string;
  criteria: SearchCriteria;
  outbound: Flight;
  inbound: Flight | null;
  fareId: "essential" | "classic" | "flex";
  passengers: Passenger[];
  seats: Record<string, string>; // "out-0" | "in-0" -> "12A"
  extras: Extras;
  contact: Contact;
  total: number;
  status: "confirmed" | "cancelled";
  checkedIn: CheckedIn;
  /** Local-only ownership: the account email this booking is linked to. */
  ownerEmail: string | null;
};

/** True when the given leg of this booking has completed check-in. */
export function isCheckedIn(booking: Booking, leg: Leg): boolean {
  return booking.status === "confirmed" && Boolean(booking.checkedIn?.[leg]);
}

/** Legs that actually exist on this booking. */
export function bookingLegs(booking: Booking): Leg[] {
  return booking.inbound ? ["out", "in"] : ["out"];
}

/** True when at least one leg is checked in. */
export function anyCheckedIn(booking: Booking): boolean {
  return bookingLegs(booking).some((leg) => isCheckedIn(booking, leg));
}

/** Passengers who occupy a seat (infants travel on an adult's lap). */
export function seatedPassengers(booking: Pick<Booking, "passengers">): number[] {
  return booking.passengers.flatMap((p, i) => (p.type === "infant" ? [] : [i]));
}

export type Traveler = {
  id: string;
  firstName: string;
  lastName: string;
  nationality: string;
  document: string;
};

export type Account = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  seatPreference: string;
  mealPreference: string;
  newsletter: boolean;
};

export type Draft = {
  entry: "search" | "results";
  criteria: SearchCriteria;
  outbound: Flight | null;
  inbound: Flight | null;
  fareId: Booking["fareId"];
  passengers: Passenger[];
  seats: Record<string, string>;
  extras: Extras;
  contact: Contact;
};

export function emptyPassenger(type: PassengerType = "adult", withAdult?: number): Passenger {
  return {
    type,
    ...(type === "infant" ? { withAdult: withAdult ?? 0 } : {}),
    firstName: "",
    lastName: "",
    dob: "",
    nationality: "",
    document: "",
  };
}

/**
 * Passenger forms for a search: adults, then children, then infants.
 * Each infant is associated with an adult (index in the same list).
 */
export function passengersFor(criteria: SearchCriteria): Passenger[] {
  const adults = Math.max(1, criteria.adults);
  const list: Passenger[] = [];
  for (let i = 0; i < adults; i += 1) list.push(emptyPassenger("adult"));
  for (let i = 0; i < criteria.children; i += 1) list.push(emptyPassenger("child"));
  for (let i = 0; i < Math.min(criteria.infants, adults); i += 1)
    list.push(emptyPassenger("infant", i));
  return list;
}

export function defaultCriteria(departDate: string, returnDate: string): SearchCriteria {
  return {
    tripType: "round",
    origin: "GZA",
    destination: "AMM",
    departDate,
    returnDate,
    adults: 1,
    children: 0,
    infants: 0,
    cabin: "economy",
  };
}

export function paxCount(c: SearchCriteria): number {
  return c.adults + c.children + c.infants;
}

export function bookingTotal(draft: {
  outbound: Flight | null;
  inbound: Flight | null;
  fareId: Booking["fareId"];
  criteria: SearchCriteria;
  seats: Record<string, string>;
  extras: Extras;
}): { fare: number; taxes: number; extras: number; total: number } {
  const pax = Math.max(1, draft.criteria.adults + draft.criteria.children);
  const legs = [draft.outbound, draft.inbound].filter((f): f is Flight => Boolean(f));
  const fare = legs.reduce(
    (sum, leg) => sum + farePrice(leg.basePrice, draft.fareId, draft.criteria.cabin) * pax,
    0,
  );
  const taxes = Math.round(fare * 0.14);
  const seatCharges = Object.values(draft.seats).reduce(
    (sum, seat) => sum + seatFee(Number(seat.replace(/\D/g, ""))),
    0,
  );
  const extras = seatCharges + draft.extras.extraBags * EXTRA_BAG_PRICE;
  return { fare, taxes, extras, total: fare + taxes + extras };
}

type StoreValue = {
  ready: boolean;
  draft: Draft;
  setDraft: (updater: (prev: Draft) => Draft) => void;
  resetDraft: (criteria: SearchCriteria) => void;
  bookings: Booking[];
  addBooking: (
    booking: Omit<Booking, "ref" | "createdAt" | "status" | "checkedIn" | "ownerEmail">,
  ) => Booking;
  /** Bookings linked to the signed-in account only. */
  myBookings: Booking[];
  /** Link a booking made as a guest to the signed-in account (local only). */
  claimBooking: (ref: string) => void;
  /** Mark one leg of a booking as checked in. */
  checkInLeg: (ref: string, leg: Leg) => void;
  updateBooking: (ref: string, patch: Partial<Booking>) => void;
  findBooking: (ref: string) => Booking | undefined;
  account: Account | null;
  signIn: (email: string, firstName?: string, lastName?: string) => void;
  signOut: () => void;
  updateAccount: (patch: Partial<Account>) => void;
  travelers: Traveler[];
  addTraveler: (traveler: Omit<Traveler, "id">) => void;
  removeTraveler: (id: string) => void;
};

const StoreContext = createContext<StoreValue | null>(null);

const KEY = "gza.store.v1";

type Persisted = {
  bookings: Booking[];
  account: Account | null;
  travelers: Traveler[];
};

function initialDraft(): Draft {
  const today = new Date();
  const depart = today.toISOString().slice(0, 10);
  const ret = new Date(today.getTime() + 6 * 86400000).toISOString().slice(0, 10);
  return {
    entry: "search",
    criteria: defaultCriteria(depart, ret),
    outbound: null,
    inbound: null,
    fareId: "classic",
    passengers: [emptyPassenger()],
    seats: {},
    extras: { extraBags: 0, meal: "standard", assistance: [] },
    contact: { email: "", phone: "" },
  };
}

/** Bring older locally stored bookings up to the current shape. */
function migrateBooking(raw: Booking): Booking {
  const legacy = raw as Booking & { checkedIn: unknown };
  const checkedIn: CheckedIn =
    typeof legacy.checkedIn === "boolean"
      ? { out: legacy.checkedIn, in: legacy.checkedIn }
      : {
          out: Boolean((legacy.checkedIn as CheckedIn | undefined)?.out),
          in: Boolean((legacy.checkedIn as CheckedIn | undefined)?.in),
        };
  return {
    ...raw,
    checkedIn,
    ownerEmail: raw.ownerEmail ?? null,
    passengers: (raw.passengers ?? []).map((p) => ({ ...p, type: p.type ?? "adult" })),
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [draft, setDraftState] = useState<Draft>(initialDraft);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [travelers, setTravelers] = useState<Traveler[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Persisted;
        setBookings((parsed.bookings ?? []).map(migrateBooking));
        setAccount(parsed.account ?? null);
        setTravelers(parsed.travelers ?? []);
      }
    } catch {
      /* ignore corrupted state */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const payload: Persisted = { bookings, account, travelers };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  }, [ready, bookings, account, travelers]);

  const setDraft = useCallback((updater: (prev: Draft) => Draft) => {
    setDraftState((prev) => updater(prev));
  }, []);

  const resetDraft = useCallback(
    (criteria: SearchCriteria) => {
      setDraftState({
        entry: "results",
        criteria,
        outbound: null,
        inbound: null,
        fareId: "classic",
        passengers: passengersFor(criteria),
        seats: {},
        // A signed-in traveller's saved meal preference becomes the booking default.
        extras: { extraBags: 0, meal: account?.mealPreference ?? "standard", assistance: [] },
        contact: { email: account?.email ?? "", phone: account?.phone ?? "" },
      });
    },
    [account],
  );

  const addBooking = useCallback(
    (booking: Omit<Booking, "ref" | "createdAt" | "status" | "checkedIn" | "ownerEmail">) => {
      const created: Booking = {
        ...booking,
        ref: makePnr(),
        createdAt: new Date().toISOString(),
        status: "confirmed",
        checkedIn: { out: false, in: false },
        ownerEmail: account?.email ?? null,
      };
      setBookings((prev) => [created, ...prev]);
      return created;
    },
    [account],
  );

  const claimBooking = useCallback((ref: string) => {
    setAccount((acc) => {
      if (acc) {
        setBookings((prev) =>
          prev.map((b) =>
            b.ref.toUpperCase() === ref.trim().toUpperCase() && !b.ownerEmail
              ? { ...b, ownerEmail: acc.email }
              : b,
          ),
        );
      }
      return acc;
    });
  }, []);

  const checkInLeg = useCallback((ref: string, leg: Leg) => {
    setBookings((prev) =>
      prev.map((b) =>
        b.ref.toUpperCase() === ref.trim().toUpperCase() && b.status === "confirmed"
          ? { ...b, checkedIn: { ...b.checkedIn, [leg]: true } }
          : b,
      ),
    );
  }, []);

  const updateBooking = useCallback((ref: string, patch: Partial<Booking>) => {
    setBookings((prev) => prev.map((b) => (b.ref === ref ? { ...b, ...patch } : b)));
  }, []);

  const findBooking = useCallback(
    (ref: string) => bookings.find((b) => b.ref.toUpperCase() === ref.trim().toUpperCase()),
    [bookings],
  );

  const signIn = useCallback((email: string, firstName?: string, lastName?: string) => {
    setAccount((prev) => ({
      email,
      firstName: firstName ?? prev?.firstName ?? email.split("@")[0] ?? "Traveller",
      lastName: lastName ?? prev?.lastName ?? "",
      phone: prev?.phone ?? "",
      seatPreference: prev?.seatPreference ?? "window",
      mealPreference: prev?.mealPreference ?? "standard",
      newsletter: prev?.newsletter ?? false,
    }));
  }, []);

  const signOut = useCallback(() => setAccount(null), []);

  const updateAccount = useCallback((patch: Partial<Account>) => {
    setAccount((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const addTraveler = useCallback((traveler: Omit<Traveler, "id">) => {
    setTravelers((prev) => [...prev, { ...traveler, id: `t-${Date.now()}` }]);
  }, []);

  const removeTraveler = useCallback((id: string) => {
    setTravelers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const myBookings = useMemo(
    () => (account ? bookings.filter((b) => b.ownerEmail === account.email) : []),
    [account, bookings],
  );

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      draft,
      setDraft,
      resetDraft,
      bookings,
      myBookings,
      addBooking,
      updateBooking,
      claimBooking,
      checkInLeg,
      findBooking,
      account,
      signIn,
      signOut,
      updateAccount,
      travelers,
      addTraveler,
      removeTraveler,
    }),
    [
      ready,
      draft,
      setDraft,
      resetDraft,
      bookings,
      myBookings,
      addBooking,
      updateBooking,
      claimBooking,
      checkInLeg,
      findBooking,
      account,
      signIn,
      signOut,
      updateAccount,
      travelers,
      addTraveler,
      removeTraveler,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
