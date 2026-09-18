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
import { EXTRA_BAG_PRICE, addDaysISO, farePrice, seatFee, todayISO } from "./data";
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

/** Extras belong to a single passenger, not the whole booking. */
export type PaxExtras = { extraBags: number; meal: string; assistance: string[] };

/** Per-passenger extras, aligned by index with the passenger list. */
export type Extras = { pax: PaxExtras[] };

export function emptyPaxExtras(meal = "standard"): PaxExtras {
  return { extraBags: 0, meal, assistance: [] };
}

export function extrasFor(extras: Extras, index: number): PaxExtras {
  return extras.pax[index] ?? emptyPaxExtras();
}

export function totalExtraBags(extras: Extras): number {
  return extras.pax.reduce((sum, p) => sum + (p?.extraBags ?? 0), 0);
}

/** Grow/shrink the per-passenger extras list so it matches the passenger list. */
export function extrasForPassengers(extras: Extras, count: number, meal = "standard"): Extras {
  const pax: PaxExtras[] = [];
  for (let i = 0; i < count; i += 1) pax.push(extras.pax[i] ?? emptyPaxExtras(meal));
  return { pax };
}

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

/** Per-leg check-in: the passenger indexes that completed check-in on that leg. */
export type CheckedIn = { out: number[]; in: number[] };

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

/** Legs that actually exist on this booking. */
export function bookingLegs(booking: Booking): Leg[] {
  return booking.inbound ? ["out", "in"] : ["out"];
}

/** Passengers who occupy a seat (infants travel on an adult's lap). */
export function seatedPassengers(booking: Pick<Booking, "passengers">): number[] {
  return booking.passengers.flatMap((p, i) => (p.type === "infant" ? [] : [i]));
}

/** Infants travelling on the lap of the given adult. */
export function infantsWith(booking: Pick<Booking, "passengers">, adultIndex: number): number[] {
  return booking.passengers.flatMap((p, i) =>
    p.type === "infant" && (p.withAdult ?? 0) === adultIndex ? [i] : [],
  );
}

/** Passenger indexes checked in on this leg. Cancelled bookings have none. */
export function checkedInPax(booking: Booking, leg: Leg): number[] {
  if (booking.status !== "confirmed") return [];
  return booking.checkedIn?.[leg] ?? [];
}

export function isPaxCheckedIn(booking: Booking, leg: Leg, paxIndex: number): boolean {
  return checkedInPax(booking, leg).includes(paxIndex);
}

/** True when at least one passenger is checked in on this leg. */
export function isCheckedIn(booking: Booking, leg: Leg): boolean {
  return checkedInPax(booking, leg).length > 0;
}

/** Eligible passengers on this leg who have not checked in yet. */
export function openPaxForLeg(booking: Booking, leg: Leg): number[] {
  if (booking.status !== "confirmed") return [];
  const done = checkedInPax(booking, leg);
  return seatedPassengers(booking).filter((i) => !done.includes(i));
}

export function legFullyCheckedIn(booking: Booking, leg: Leg): boolean {
  return booking.status === "confirmed" && openPaxForLeg(booking, leg).length === 0;
}

/** Legs that still have at least one passenger to check in. */
export function openLegs(booking: Booking): Leg[] {
  return bookingLegs(booking).filter((leg) => openPaxForLeg(booking, leg).length > 0);
}

/** True when at least one leg has at least one checked-in passenger. */
export function anyCheckedIn(booking: Booking): boolean {
  return bookingLegs(booking).some((leg) => isCheckedIn(booking, leg));
}

/** How many boarding passes this booking currently has. */
export function passCount(booking: Booking): number {
  return bookingLegs(booking).reduce((sum, leg) => sum + checkedInPax(booking, leg).length, 0);
}

export type Traveler = {
  id: string;
  firstName: string;
  lastName: string;
  dob: string;
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
  const extras = seatCharges + totalExtraBags(draft.extras) * EXTRA_BAG_PRICE;
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
  /** Mark the given passengers of one leg as checked in. */
  checkInLeg: (ref: string, leg: Leg, paxIndexes: number[]) => void;
  updateBooking: (ref: string, patch: Partial<Booking>) => void;
  findBooking: (ref: string) => Booking | undefined;
  account: Account | null;
  signIn: (email: string, firstName?: string, lastName?: string) => void;
  signOut: () => void;
  updateAccount: (patch: Partial<Account>) => void;
  travelers: Traveler[];
  addTraveler: (traveler: Omit<Traveler, "id">) => void;
  updateTraveler: (id: string, patch: Partial<Omit<Traveler, "id">>) => void;
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
  return {
    entry: "search",
    criteria: defaultCriteria("", ""),
    outbound: null,
    inbound: null,
    fareId: "classic",
    passengers: [emptyPassenger()],
    seats: {},
    extras: { pax: [emptyPaxExtras()] },
    contact: { email: "", phone: "" },
  };
}

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
  const [ready, setReady] = useState(false);
  const [draft, setDraftState] = useState<Draft>(initialDraft);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [travelers, setTravelers] = useState<Traveler[]>([]);

  useEffect(() => {
    // Initialize volatile dates on client mount after hydration
    const today = todayISO();
    const ret = addDaysISO(today, 6);
    setDraftState((prev) => {
      const needsDate = !prev.criteria.departDate;
      const isPast = prev.criteria.departDate && prev.criteria.departDate < today;
      if (needsDate || isPast) {
        return {
          ...prev,
          criteria: {
            ...prev.criteria,
            departDate: today,
            returnDate: prev.criteria.tripType === "round" ? ret : prev.criteria.returnDate,
          },
        };
      }
      return prev;
    });

    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Persisted;
        setBookings((parsed.bookings ?? []).map(migrateBooking));
        setAccount(parsed.account ?? null);
        setTravelers((parsed.travelers ?? []).map((tr) => ({ ...tr, dob: tr.dob ?? "" })));
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
      const passengers = passengersFor(criteria);
      // A signed-in traveller's saved meal preference becomes the booking default.
      const meal = account?.mealPreference ?? "standard";
      setDraftState({
        entry: "results",
        criteria,
        outbound: null,
        inbound: null,
        fareId: "classic",
        passengers,
        seats: {},
        extras: { pax: passengers.map(() => emptyPaxExtras(meal)) },
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
        checkedIn: { out: [], in: [] },
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

  const checkInLeg = useCallback((ref: string, leg: Leg, paxIndexes: number[]) => {
    setBookings((prev) =>
      prev.map((b) => {
        if (b.ref.toUpperCase() !== ref.trim().toUpperCase() || b.status !== "confirmed") return b;
        const merged = Array.from(new Set([...(b.checkedIn?.[leg] ?? []), ...paxIndexes])).sort(
          (a, z) => a - z,
        );
        return { ...b, checkedIn: { ...b.checkedIn, [leg]: merged } };
      }),
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

  const updateTraveler = useCallback((id: string, patch: Partial<Omit<Traveler, "id">>) => {
    setTravelers((prev) => prev.map((tr) => (tr.id === id ? { ...tr, ...patch } : tr)));
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
      updateTraveler,
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
      updateTraveler,
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
