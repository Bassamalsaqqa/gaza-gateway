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
import { type AdminRole, type Permission, type Staff, can } from "./admin";
import { isStudioPreviewActive } from "./studio-preview";
import { useRepositories } from "./repositories/registry";
import { type ActivityActorSnapshot } from "./activity/index.ts";
import { AdminSessionCoordinator, type AdminSessionState } from "./staff/index.ts";
import { useI18n } from "./i18n";

export type { FlightOverride } from "./domain/flight";

type Toast = { id: number; message: string };

type AdminValue = {
  ready: boolean;
  staff: Staff | null;
  role: AdminRole | undefined;
  directoryUnavailable: boolean;
  actor: ActivityActorSnapshot | null;
  signIn: (email: string, passphrase: string, onAuditWarning?: () => void) => Promise<{ ok: boolean; error?: "unknown" | "pass" | "storage_unavailable" }>;
  signOut: () => void;
  can: (permission: Permission) => boolean;
  toasts: Toast[];
  toast: (message: string) => void;
  dismissToast: (id: number) => void;
};

const AdminContext = createContext<AdminValue | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { staff: staffRepo, activity: activityRepo } = useRepositories();
  const coordinatorRef = useRef<AdminSessionCoordinator | null>(null);

  if (!coordinatorRef.current) {
    coordinatorRef.current = new AdminSessionCoordinator({
      staffRepo,
      activityRepo,
      isStudioPreview: isStudioPreviewActive(),
    });
  } else {
    coordinatorRef.current.setActivityRepository(activityRepo);
  }

  const coordinator = coordinatorRef.current;
  const [sessionState, setSessionState] = useState<AdminSessionState>(() => coordinator.getState());
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const unsubscribe = coordinator.subscribe(() => {
      setSessionState(coordinator.getState());
    });

    setSessionState(coordinator.getState());
    void coordinator.resolveCurrentSession();

    return () => {
      unsubscribe();
      coordinator.destroy();
    };
  }, [coordinator]);

  const toast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((tst) => tst.id !== id)), 4500);
  }, []);

  const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((tst) => tst.id !== id)), []);

  const signIn = useCallback(
    async (email: string, passphrase: string, onAuditWarning?: () => void) => {
      return coordinator.signIn(email, passphrase, () => {
        toast(t("a2.ac.auditWarning"));
        onAuditWarning?.();
      });
    },
    [coordinator, t, toast],
  );

  const signOut = useCallback(() => {
    coordinator.signOut();
  }, [coordinator]);

  const { ready, staff, directoryUnavailable, actor } = sessionState;

  const value = useMemo<AdminValue>(
    () => ({
      ready,
      staff,
      role: staff?.status === "active" ? staff.role : undefined,
      directoryUnavailable,
      actor,
      signIn,
      signOut,
      can: (permission: Permission) => {
        if (!staff || staff.status !== "active") return false;
        return can(staff.role, permission);
      },
      toasts,
      toast,
      dismissToast,
    }),
    [
      ready,
      staff,
      directoryUnavailable,
      actor,
      signIn,
      signOut,
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
