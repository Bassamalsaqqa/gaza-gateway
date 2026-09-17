import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Flight, FlightStatus } from "./data";
import { MOCK_PASSPHRASE, staffAccounts, staffByRole, type AdminRole, type Permission, type Staff, can } from "./admin";

const KEY = "gza.admin.v1";

/** Operational change applied to a flight from a quick edit. Local state only. */
export type FlightOverride = {
  status?: FlightStatus;
  gate?: string;
  terminal?: string;
  revisedDepart?: string;
  note?: string;
};

type Persisted = { staffId: string | null; overrides: Record<string, FlightOverride> };

type Toast = { id: number; message: string };

type AdminValue = {
  ready: boolean;
  staff: Staff | null;
  role: AdminRole | undefined;
  signIn: (email: string, passphrase: string) => { ok: boolean; error?: "unknown" | "pass" };
  signOut: () => void;
  setRole: (role: AdminRole) => void;
  can: (permission: Permission) => boolean;
  overrides: Record<string, FlightOverride>;
  applyOverride: (flightId: string, patch: FlightOverride) => void;
  withOverride: (flight: Flight) => Flight & { note?: string; revisedDepart?: string };
  toasts: Toast[];
  toast: (message: string) => void;
  dismissToast: (id: number) => void;
};

const AdminContext = createContext<AdminValue | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [overrides, setOverrides] = useState<Record<string, FlightOverride>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Persisted;
        const found = staffAccounts.find((s) => s.id === parsed.staffId) ?? null;
        setStaff(found);
        setOverrides(parsed.overrides ?? {});
      }
    } catch {
      /* ignore corrupted local state */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const payload: Persisted = { staffId: staff?.id ?? null, overrides };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  }, [ready, staff, overrides]);

  const signIn = useCallback((email: string, passphrase: string) => {
    const found = staffAccounts.find((s) => s.email.toLowerCase() === email.trim().toLowerCase());
    if (!found) return { ok: false, error: "unknown" as const };
    if (passphrase.trim() !== MOCK_PASSPHRASE) return { ok: false, error: "pass" as const };
    setStaff(found);
    return { ok: true };
  }, []);

  const signOut = useCallback(() => setStaff(null), []);

  const setRole = useCallback((role: AdminRole) => setStaff(staffByRole(role)), []);

  const applyOverride = useCallback((flightId: string, patch: FlightOverride) => {
    setOverrides((prev) => ({ ...prev, [flightId]: { ...prev[flightId], ...patch } }));
  }, []);

  const withOverride = useCallback(
    (flight: Flight) => {
      const o = overrides[flight.id];
      if (!o) return flight;
      return {
        ...flight,
        status: o.status ?? flight.status,
        gate: o.gate ?? flight.gate,
        terminal: o.terminal ?? flight.terminal,
        ...(o.revisedDepart ? { revisedDepart: o.revisedDepart } : {}),
        ...(o.note ? { note: o.note } : {}),
      };
    },
    [overrides],
  );

  const toast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((tst) => tst.id !== id)), 4500);
  }, []);

  const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((tst) => tst.id !== id)), []);

  const value = useMemo<AdminValue>(
    () => ({
      ready,
      staff,
      role: staff?.role,
      signIn,
      signOut,
      setRole,
      can: (permission: Permission) => can(staff?.role, permission),
      overrides,
      applyOverride,
      withOverride,
      toasts,
      toast,
      dismissToast,
    }),
    [ready, staff, signIn, signOut, setRole, overrides, applyOverride, withOverride, toasts, toast, dismissToast],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside AdminProvider");
  return ctx;
}
