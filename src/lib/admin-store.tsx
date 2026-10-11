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
import { useQueryClient } from "@tanstack/react-query";
import { type AdminRole, type Permission, type Staff, can } from "./admin";
import { isStudioPreviewActive } from "./studio-preview";
import { useRepositories } from "./repositories/registry";
import { type ActivityActorSnapshot } from "./activity/index.ts";
import { AdminSessionCoordinator, type AdminSessionState } from "./staff/index.ts";
import { useI18n } from "./i18n";
import { identityUiRequested, getIdentityUiClient, discardIdentityUiClient } from "./api/identity-ui-runtime";
import { discardReferenceUiClient } from "./api/reference-client";
import type { StaffProfile } from "./api/identity-types";
import { discardMvpUiClient } from "./api/mvp-ui-runtime";

export type { FlightOverride } from "./domain/flight";

type Toast = { id: number; message: string };

type AdminSessionStaff = Pick<Staff, "id" | "name" | "email" | "role" | "status"> & Partial<Pick<Staff, "title">>;

type AdminValue = {
  ready: boolean;
  staff: AdminSessionStaff | null;
  role: AdminRole | undefined;
  directoryUnavailable: boolean;
  actor: ActivityActorSnapshot | null;
  signIn: (email: string, passphrase: string, onAuditWarning?: () => void) => Promise<{ ok: boolean; error?: "unknown" | "pass" | "storage_unavailable" | "directory_unavailable" }>;
  signOut: () => void;
  refreshStaff: () => Promise<void>;
  can: (permission: Permission) => boolean;
  toasts: Toast[];
  toast: (message: string) => void;
  dismissToast: (id: number) => void;
};

const AdminContext = createContext<AdminValue | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  // In explicit backend mode, render RealAdminProvider using getStaffMe with server permissions.
  // Never initialize mock staff sessions in server mode.
  return identityUiRequested ? <RealAdminProvider>{children}</RealAdminProvider>
    : <MockAdminProvider>{children}</MockAdminProvider>;
}

function RealAdminProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastStaffIdRef = useRef<string | null>(null);

  const admission = useRef({ generation: 0, controller: null as AbortController | null });
  const purge = useCallback(() => {
    void queryClient.cancelQueries();
    queryClient.clear();
    discardReferenceUiClient();
    discardMvpUiClient();
  }, [queryClient]);
  const revalidate = useCallback(async () => {
    admission.current.controller?.abort();
    const controller = new AbortController();
    const generation = ++admission.current.generation;
    admission.current.controller = controller;
    try {
      const result = await getIdentityUiClient().getStaffMe({ signal: controller.signal });
      if (controller.signal.aborted || generation !== admission.current.generation) return;
      const profile = result.data;
      if (lastStaffIdRef.current !== profile.id) purge();
      lastStaffIdRef.current = profile.id;
      setStaffProfile(profile);
    } catch {
      if (controller.signal.aborted || generation !== admission.current.generation) return;
      setStaffProfile(null); lastStaffIdRef.current = null; purge();
    } finally {
      if (!controller.signal.aborted && generation === admission.current.generation) setReady(true);
    }
  }, [purge]);
  useEffect(() => {
    const currentAdmission = admission.current;
    void revalidate();
    const onFocus = () => { void revalidate(); };
    window.addEventListener("focus", onFocus);
    return () => {
      ++currentAdmission.generation; currentAdmission.controller?.abort();
      window.removeEventListener("focus", onFocus);
    };
  }, [revalidate]);

  const toast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((tst) => tst.id !== id)), 4500);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((tst) => tst.id !== id));
  }, []);

  const signOut = useCallback(async () => {
    ++admission.current.generation; admission.current.controller?.abort();
    setStaffProfile(null); lastStaffIdRef.current = null; purge();
    try { await getIdentityUiClient().postStaffLogout(); }
    finally { discardIdentityUiClient(); }
  }, [purge]);

  const signIn = useCallback(async () => {
    // Staff authentication in server mode uses the official /admin/signin route (StaffIdentityAuth)
    return { ok: false, error: "directory_unavailable" as const };
  }, []);

  const staff = useMemo<AdminSessionStaff | null>(() => {
    if (!staffProfile) return null;
    return {
      id: staffProfile.id,
      name: { en: staffProfile.fullNameEn, ar: staffProfile.fullNameAr },
      email: staffProfile.email,
      role: staffProfile.role,
      status: "active",
    };
  }, [staffProfile]);

  const actor = useMemo<ActivityActorSnapshot | null>(() => {
    if (!staff) return null;
    return {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
    };
  }, [staff]);

  const value = useMemo<AdminValue>(
    () => ({
      ready,
      staff,
      role: staffProfile ? staffProfile.role : undefined,
      directoryUnavailable: false,
      actor,
      signIn,
      signOut,
      refreshStaff: revalidate,
      can: (permission: Permission) => {
        if (!staffProfile) return false;
        // Authoritative permissions derived directly from staff profile permissions
        return staffProfile.permissions.includes(permission);
      },
      toasts,
      toast,
      dismissToast,
    }),
    [ready, staff, staffProfile, actor, signIn, signOut, revalidate, toasts, toast, dismissToast]
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

function MockAdminProvider({ children }: { children: ReactNode }) {
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
      refreshStaff: async () => { await coordinator.resolveCurrentSession(); },
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
      coordinator,
    ],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside AdminProvider");
  return ctx;
}
