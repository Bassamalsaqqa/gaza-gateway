import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Flight, FlightStatus } from "./data";
import { MOCK_PASSPHRASE, staffAccounts, staffByRole, type AdminRole, type Permission, type Staff, can } from "./admin";
import { seedOpsState, type OpsState } from "./admin-ops";
import type { FlightOverride } from "./domain/flight";
import { getEffectiveFlight, sanitizeFlightOverride } from "./domain/flight";
import { useRepositories } from "./repositories";
import { isStudioPreviewActive } from "./studio-preview";

export type { FlightOverride };

type Persisted = { staffId: string | null; overrides?: Record<string, FlightOverride> };

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
  applyOverride: (flightId: string, patch: FlightOverride) => Promise<void>;
  withOverride: (flight: Flight) => Flight;
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
  const { flight: flightRepo } = useRepositories();
  const [ready, setReady] = useState(false);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [overrides, setOverrides] = useState<Record<string, FlightOverride>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ops, setOps] = useState<OpsState>(() => seedOpsState());
  const initialLegacyAdminRef = useRef<Record<string, unknown>>({});
  const hasStaffMutatedRef = useRef(false);

  // Synchronize overrides with canonical FlightRepository
  useEffect(() => {
    let mounted = true;
    flightRepo.getOverrides().then((ovs) => {
      if (mounted) setOverrides(ovs);
    });

    const unsubscribe = flightRepo.subscribe(() => {
      flightRepo.getOverrides().then((ovs) => {
        if (mounted) setOverrides(ovs);
      });
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [flightRepo]);

  const patchOps = useCallback(<K extends keyof OpsState>(key: K, value: OpsState[K]) => {
    setOps((prev) => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    if (isStudioPreviewActive()) {
      setReady(true);
      return;
    }

    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const raw = window.localStorage.getItem("gza.admin.v1");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            initialLegacyAdminRef.current = parsed;
            const staffId = typeof parsed.staffId === "string" ? parsed.staffId : null;
            const found = staffId ? staffAccounts.find((s) => s.id === staffId) ?? null : null;
            setStaff(found);
          }
        }
      }
    } catch {
      /* ignore corrupted local state */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !hasStaffMutatedRef.current || isStudioPreviewActive()) return;
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const payload = {
          ...initialLegacyAdminRef.current,
          staffId: staff?.id ?? null,
        };
        window.localStorage.setItem("gza.admin.v1", JSON.stringify(payload));
      }
    } catch {
      /* ignore storage write error */
    }
  }, [ready, staff]);

  const signIn = useCallback((email: string, passphrase: string) => {
    const found = staffAccounts.find((s) => s.email.toLowerCase() === email.trim().toLowerCase());
    if (!found) return { ok: false, error: "unknown" as const };
    if (passphrase.trim() !== MOCK_PASSPHRASE) return { ok: false, error: "pass" as const };
    hasStaffMutatedRef.current = true;
    setStaff(found);
    return { ok: true };
  }, []);

  const signOut = useCallback(() => {
    hasStaffMutatedRef.current = true;
    setStaff(null);
  }, []);

  const setRole = useCallback((role: AdminRole) => {
    hasStaffMutatedRef.current = true;
    setStaff(staffByRole(role));
  }, []);

  const applyOverride = useCallback(
    async (flightId: string, patch: FlightOverride): Promise<void> => {
      if (!flightId || typeof flightId !== "string") return;
      const cleanPatch = sanitizeFlightOverride(patch);
      if (!cleanPatch) return;

      // Authoritative transactional commit through canonical FlightRepository
      await flightRepo.setOverride(flightId, cleanPatch);

      // On successful commit, refresh local state from repository
      const refreshed = await flightRepo.getOverrides();
      setOverrides(refreshed);
    },
    [flightRepo],
  );

  const withOverride = useCallback(
    (flight: Flight) => {
      if (!flight || typeof flight !== "object") return flight;
      const o = overrides?.[flight.id];
      return getEffectiveFlight(flight, o);
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
      ops,
      patchOps,
      toasts,
      toast,
      dismissToast,
    }),
    [
      ready,
      staff,
      signIn,
      signOut,
      setRole,
      overrides,
      applyOverride,
      withOverride,
      ops,
      patchOps,
      toasts,
      toast,
      dismissToast,
    ],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside AdminProvider");
  return ctx;
}
