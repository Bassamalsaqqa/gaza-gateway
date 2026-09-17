import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppLink, usePathname } from "@/components/app-link";
import { btnClass } from "@/components/kit";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminSkeleton } from "@/components/admin/admin-kit";
import { useDashboardData } from "@/components/admin/dashboard-data";
import { useAdmin } from "@/lib/admin-store";
import { useI18n } from "@/lib/i18n";
import { stripLocale } from "@/lib/locale";

export const Route = createFileRoute("/{-$locale}/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { t } = useI18n();
  const { ready, staff } = useAdmin();
  const path = stripLocale(usePathname());
  const { attention } = useDashboardData();

  if (!ready) {
    return (
      <div className="min-h-screen bg-background p-6">
        <AdminSkeleton rows={6} />
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sand px-4">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6">
          <p className="eyebrow text-clay">{t("adm.signin.eyebrow")}</p>
          <h1 className="mt-2 text-xl font-bold">{t("adm.signin.required")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("adm.signin.requiredBody")}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <AppLink to="/admin/signin" className={btnClass("primary", "md")}>
              {t("adm.signin.submit")}
            </AppLink>
            <AppLink to="/" className={btnClass("outline", "md")}>
              {t("adm.signin.publicSite")}
            </AppLink>
          </div>
        </div>
      </div>
    );
  }

  const breadcrumb = path === "/admin/access-denied" ? t("adm.denied.title") : t("adm.nav.dashboard");

  return (
    <AdminShell breadcrumb={breadcrumb} attentionCount={attention.length}>
      <Outlet />
    </AdminShell>
  );
}
