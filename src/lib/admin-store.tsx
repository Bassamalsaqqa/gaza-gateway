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
import { seedOpsState, type OpsState } from "./admin-ops";

const KEY = "gza.admin.v1";

/** Operational change applied to a flight from a quick edit. Local state only. */
export type FlightOverride = {
  status?: FlightStatus;
  gate?: string;
  terminal?: string;
  revisedDepart?: string;
  aircraft?: string;
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
  /** Operations & commercial configuration held in local state for this session. */
  ops: OpsState;
  patchOps: <K extends keyof OpsState>(key: K, value: OpsState[K]) => void;
  toasts: Toast[];
  toast: (message: string) => void;
  dismissToast: (id: number) => void;
};

const AdminContext = createContext<AdminValue | null>(null);

const VALID_FLIGHT_STATUSES = new Set<FlightStatus>([
  "Scheduled",
  "OnTime",
  "Boarding",
  "Delayed",
  "Departed",
  "Landed",
  "Cancelled",
]);

type RawOverrideShape = {
  status?: unknown;
  gate?: unknown;
  terminal?: unknown;
  revisedDepart?: unknown;
  aircraft?: unknown;
  note?: unknown;
};

function sanitizeOverride(raw: unknown): FlightOverride | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entry = raw as RawOverrideShape;
  const clean: FlightOverride = {};

  if (typeof entry.status === "string" && VALID_FLIGHT_STATUSES.has(entry.status as FlightStatus)) {
    clean.status = entry.status as FlightStatus;
  }
  if (typeof entry.gate === "string") {
    clean.gate = entry.gate.trim();
  }
  if (typeof entry.terminal === "string") {
    clean.terminal = entry.terminal.trim();
  }
  if (typeof entry.revisedDepart === "string") {
    clean.revisedDepart = entry.revisedDepart.trim();
  }
  if (typeof entry.aircraft === "string" && entry.aircraft.trim() !== "") {
    clean.aircraft = entry.aircraft.trim();
  }
  if (typeof entry.note === "string") {
    clean.note = entry.note.trim();
  }

  return Object.keys(clean).length > 0 ? clean : null;
}

function sanitizeOverrides(raw: unknown): Record<string, FlightOverride> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const clean: Record<string, FlightOverride> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== "string" || !key) continue;
    const sanitized = sanitizeOverride(value);
    if (sanitized) clean[key] = sanitized;
  }
  return clean;
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [overrides, setOverrides] = useState<Record<string, FlightOverride>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ops, setOps] = useState<OpsState>(() => seedOpsState());

  const patchOps = useCallback(<K extends keyof OpsState>(key: K, value: OpsState[K]) => {
    setOps((prev) => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const staffId = typeof parsed.staffId === "string" ? parsed.staffId : null;
          const found = staffId ? staffAccounts.find((s) => s.id === staffId) ?? null : null;
          setStaff(found);
          setOverrides(sanitizeOverrides(parsed.overrides));
        }
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
    if (!flightId || typeof flightId !== "string") return;
    const cleanPatch = sanitizeOverride(patch);
    if (!cleanPatch) return;
    setOverrides((prev) => ({
      ...prev,
      [flightId]: { ...(prev[flightId] ?? {}), ...cleanPatch },
    }));
  }, []);

  const withOverride = useCallback(
    (flight: Flight) => {
      if (!flight || typeof flight !== "object") return flight;
      const o = overrides?.[flight.id];
      if (!o || typeof o !== "object") return flight;
      return {
        ...flight,
        status: o.status && VALID_FLIGHT_STATUSES.has(o.status) ? o.status : flight.status,
        gate: typeof o.gate === "string" ? o.gate : flight.gate,
        terminal: typeof o.terminal === "string" ? o.terminal : flight.terminal,
        ...(typeof o.revisedDepart === "string" ? { revisedDepart: o.revisedDepart } : {}),
        ...(typeof o.note === "string" ? { note: o.note } : {}),
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
