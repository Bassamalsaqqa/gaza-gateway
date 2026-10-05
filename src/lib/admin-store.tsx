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
import { MOCK_PASSPHRASE, staffAccounts, staffByRole, type AdminRole, type Permission, type Staff, can } from "./admin";
import { isStudioPreviewActive } from "./studio-preview";

export type { FlightOverride } from "./domain/flight";


type Toast = { id: number; message: string };

type AdminValue = {
  ready: boolean;
  staff: Staff | null;
  role: AdminRole | undefined;
  signIn: (email: string, passphrase: string) => { ok: boolean; error?: "unknown" | "pass" };
  signOut: () => void;
  setRole: (role: AdminRole) => void;
  can: (permission: Permission) => boolean;
  toasts: Toast[];
  toast: (message: string) => void;
  dismissToast: (id: number) => void;
};

const AdminContext = createContext<AdminValue | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const initialLegacyAdminRef = useRef<Record<string, unknown>>({});
  const hasStaffMutatedRef = useRef(false);


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
