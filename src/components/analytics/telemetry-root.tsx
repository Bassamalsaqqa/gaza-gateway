import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useAdmin } from "@/lib/admin-store";
import { telemetryClient } from "@/lib/analytics/telemetry-client";
import { PrivacyPreferenceBanner } from "./privacy-preference-banner";

export function TelemetryRoot() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { staff } = useAdmin();
  const isStaff = staff?.status === "active";

  const isAdminRoute =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/ar/admin") ||
    pathname.startsWith("/admin_") ||
    pathname.startsWith("/ar/admin_");

  useEffect(() => {
    telemetryClient.setStaffActive(isStaff);
  }, [isStaff]);

  useEffect(() => {
    if (!isStaff && !isAdminRoute) {
      telemetryClient.start();
    }
    return () => {
      telemetryClient.stop();
    };
  }, [isStaff, isAdminRoute]);

  useEffect(() => {
    if (pathname && !isStaff && !isAdminRoute) {
      telemetryClient.onRouteChange(pathname);
    }
  }, [pathname, isStaff, isAdminRoute]);

  if (isStaff || isAdminRoute) {
    return null;
  }

  return <PrivacyPreferenceBanner />;
}
