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

export type Passenger = {
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
  checkedIn: boolean;
};

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

export function emptyPassenger(): Passenger {
  return { firstName: "", lastName: "", dob: "", nationality: "", document: "" };
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
  addBooking: (booking: Omit<Booking, "ref" | "createdAt" | "status" | "checkedIn">) => Booking;
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
        setBookings(parsed.bookings ?? []);
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

  const resetDraft = useCallback((criteria: SearchCriteria) => {
    setDraftState({
      entry: "results",
      criteria,
      outbound: null,
      inbound: null,
      fareId: "classic",
      passengers: Array.from({ length: Math.max(1, criteria.adults + criteria.children) }, () =>
        emptyPassenger(),
      ),
      seats: {},
      extras: { extraBags: 0, meal: "standard", assistance: [] },
      contact: { email: "", phone: "" },
    });
  }, []);

  const addBooking = useCallback(
    (booking: Omit<Booking, "ref" | "createdAt" | "status" | "checkedIn">) => {
      const created: Booking = {
        ...booking,
        ref: makePnr(),
        createdAt: new Date().toISOString(),
        status: "confirmed",
        checkedIn: false,
      };
      setBookings((prev) => [created, ...prev]);
      return created;
    },
    [],
  );

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

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      draft,
      setDraft,
      resetDraft,
      bookings,
      addBooking,
      updateBooking,
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
      addBooking,
      updateBooking,
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
