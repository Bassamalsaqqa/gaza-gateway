import { identityUiRequested } from "@/lib/api/identity-ui-runtime";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppLink, usePathname } from "@/components/app-link";
import { btnClass } from "@/components/kit";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminSkeleton } from "@/components/admin/admin-kit";
import { AdminTranslationBoundary } from "@/components/admin/admin-translation-boundary";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import { stripLocale } from "@/lib/locale";
import { isDomainAvailableInServerMode } from "@/lib/admin";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/{-$locale}/admin")({
  component: AdminRouteWrapper,
});

function AdminRouteWrapper() {
  return (
    <AdminTranslationBoundary>
      <AdminLayout />
    </AdminTranslationBoundary>
  );
}

export function AdminUnavailableDomainNotice() {
  const { lang } = useI18n();
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center max-w-xl mx-auto my-12 space-y-4">
      <div className="inline-flex size-12 items-center justify-center rounded-full bg-clay/10 text-clay">
        <ShieldAlert aria-hidden="true" className="size-6" />
      </div>
      <h2 className="text-lg font-bold text-foreground">
        {pick(lang, {
          en: "Domain Not Wired in Server Preview",
          ar: "النطاق غير متصل في معاينة الخادم",
        })}
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {pick(lang, {
          en: "This administrative domain is not yet connected to the reference backend in the current W1 integration batch. Fleet management and staff security settings are actively wired.",
          ar: "هذا النطاق الإداري غير متصل بعد بالخادم المرجعي في دفعة التكامل W1 الحالية. إدارة الأسطول وإعدادات أمان الموظفين متصلة حالياً.",
        })}
      </p>
      <div className="pt-2 flex justify-center gap-3">
        <AppLink to="/admin/products?tab=aircraft" className={btnClass("primary", "md")}>
          {pick(lang, {
            en: "Go to Fleet Management",
            ar: "الانتقال إلى إدارة الأسطول",
          })}
        </AppLink>
        <AppLink to="/admin/settings?tab=security" className={btnClass("outline", "md")}>
          {pick(lang, {
            en: "Security Settings",
            ar: "إعدادات الأمان",
          })}
        </AppLink>
      </div>
    </div>
  );
}

function AdminLayout() {
  const { t } = useI18n();
  const { ready, staff } = useAdmin();
  const path = stripLocale(usePathname());

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

  const breadcrumb = (() => {
    if (path === "/admin/access-denied") return t("adm.denied.title");
    if (path.startsWith("/admin/flights")) return t("adm.nav.flights");
    if (path.startsWith("/admin/schedules")) return t("adm.nav.schedules");
    if (path.startsWith("/admin/destinations")) return t("adm.nav.destinations");
    if (path.startsWith("/admin/products")) return t("adm.prod.title");
    if (path.startsWith("/admin/bookings")) return t("adm.nav.bookings");
    if (path.startsWith("/admin/check-in")) return t("adm.nav.checkin");
    if (path.startsWith("/admin/customers")) return t("adm.nav.customers");
    if (path.startsWith("/admin/website")) return t("a2.nav.website");
    if (path.startsWith("/admin/airport")) return t("a2.nav.airport");
    if (path.startsWith("/admin/inbox")) return t("adm.nav.inbox");
    if (path.startsWith("/admin/analytics")) return t("adm.nav.analytics");
    if (path.startsWith("/admin/staff")) return t("adm.nav.staff");
    if (path.startsWith("/admin/settings")) return t("adm.nav.settings");
    if (path.startsWith("/admin/activity")) return t("adm.nav.activity");
    return t("adm.nav.dashboard");
  })();

  const isServerUnavailable = identityUiRequested && !isDomainAvailableInServerMode(path);

  return (
    <AdminShell breadcrumb={breadcrumb}>
      {isServerUnavailable ? <AdminUnavailableDomainNotice /> : <Outlet />}
    </AdminShell>
  );
}
