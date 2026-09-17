import { Lock } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { btnClass } from "@/components/kit";
import { AdminChip, AdminPanel, Ltr } from "@/components/admin/admin-kit";
import { useAdmin } from "@/lib/admin-store";
import { useI18n } from "@/lib/i18n";

/**
 * Calm in-place restricted notice, used when a staff role may not open a module.
 * Deliberately never suggests the account is broken.
 */
export function AdminDenied({ area, permission }: { area?: string; permission?: string }) {
  const { t } = useI18n();
  const { staff } = useAdmin();

  return (
    <div className="mx-auto max-w-xl">
      <AdminPanel>
        <span className="inline-flex size-10 items-center justify-center rounded-md bg-clay-soft text-accent-foreground">
          <Lock aria-hidden="true" className="size-5" />
        </span>
        <h1 className="mt-4 text-xl font-bold">{t("adm.denied.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("adm.denied.sub")}</p>
        <p className="mt-4 text-sm">{t("adm.denied.body")}</p>

        <dl className="mt-4 space-y-2 rounded-md border border-border bg-sand p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <dt className="font-semibold text-muted-foreground">{t("adm.shell.role")}</dt>
            <dd>
              <AdminChip tone="brand">{staff ? t(`adm.role.${staff.role}`) : "—"}</AdminChip>
            </dd>
          </div>
          {area ? (
            <div className="flex items-center justify-between gap-2">
              <dt className="font-semibold text-muted-foreground">{t("adm.denied.area")}</dt>
              <dd>{area}</dd>
            </div>
          ) : null}
          {permission ? (
            <div className="flex items-center justify-between gap-2">
              <dt className="font-semibold text-muted-foreground">{t("adm.denied.permission")}</dt>
              <dd>
                <Ltr>{permission}</Ltr>
              </dd>
            </div>
          ) : null}
        </dl>

        <p className="mt-4 text-xs text-muted-foreground">{t("adm.denied.contactAdmin")}</p>

        <div className="mt-5 flex flex-wrap gap-2">
          <AppLink to="/admin" className={btnClass("primary", "sm")}>
            {t("adm.denied.back")}
          </AppLink>
        </div>
      </AdminPanel>
    </div>
  );
}
