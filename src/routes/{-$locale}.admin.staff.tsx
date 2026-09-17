import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Field, Input, Select, btnClass } from "@/components/kit";
import { AdminChip, AdminPageHeader, AdminPanel, AdminSheet, Ltr, PermissionButton } from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import { staffRows, type StaffRow } from "@/lib/admin-mock";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/{-$locale}/admin/staff")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/staff",
      en: { title: "Staff and roles — Gaza International Airport administration", description: "Staff accounts and the three administration roles." },
      ar: { title: "الموظفون والأدوار — إدارة مطار غزة الدولي", description: "حسابات الموظفين وأدوار الإدارة الثلاثة." },
      noindex: true,
    }),
  component: AdminStaffPage,
});

type SheetKind = "invite" | "role" | null;

function AdminStaffPage() {
  const { t, lang } = useI18n();
  const { can, toast } = useAdmin();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [target, setTarget] = useState<StaffRow | null>(null);
  const mayEdit = can("admin.manage");

  if (!can("admin.manage")) return <AdminDenied area={t("a2.st.title")} permission="admin.manage" />;

  const roleLabel = (role: StaffRow["role"]) => t(`adm.role.${role}`);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("a2.st.title")}
        description={t("a2.st.sub")}
        meta={<p className="text-xs text-muted-foreground">{t("a2.st.roleNote")}</p>}
        action={
          <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} variant="primary" onClick={() => setSheet("invite")}>
            {t("a2.st.invite")}
          </PermissionButton>
        }
      />

      <AdminPanel bodyClassName="p-0">
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-sm">
            <caption className="sr-only">{t("a2.st.title")}</caption>
            <thead>
              <tr className="border-b border-border text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                {[t("a2.st.member"), t("a2.cu.email"), t("a2.st.role"), t("a2.status"), t("a2.st.lastActive"), t("a2.actions")].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 text-start font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staffRows.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-semibold">{pick(lang, s.name)}</td>
                  <td className="px-3 py-2"><Ltr>{s.email}</Ltr></td>
                  <td className="px-3 py-2">{roleLabel(s.role)}</td>
                  <td className="px-3 py-2">
                    <AdminChip tone={s.status === "active" ? "brand" : "muted"}>{t(s.status === "active" ? "a2.st.active" : "a2.st.disabled")}</AdminChip>
                  </td>
                  <td className="px-3 py-2"><Ltr>{s.lastActive}</Ltr></td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      <PermissionButton
                        allowed={mayEdit}
                        reason={t("adm.edit.readOnly")}
                        onClick={() => {
                          setTarget(s);
                          setSheet("role");
                        }}
                      >
                        {t("a2.st.changeRole")}
                      </PermissionButton>
                      <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} onClick={() => toast(t("a2.uiOnly"))}>
                        {t("a2.st.disable")}
                      </PermissionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-border lg:hidden">
          {staffRows.map((s) => (
            <li key={s.id} className="space-y-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{pick(lang, s.name)}</p>
                <AdminChip tone={s.status === "active" ? "brand" : "muted"}>{t(s.status === "active" ? "a2.st.active" : "a2.st.disabled")}</AdminChip>
              </div>
              <p className="text-xs text-muted-foreground"><Ltr>{s.email}</Ltr></p>
              <p className="text-xs text-muted-foreground">
                {`${roleLabel(s.role)} · `}
                <Ltr>{s.lastActive}</Ltr>
              </p>
              <div className="flex flex-wrap gap-1.5">
                <PermissionButton
                  allowed={mayEdit}
                  reason={t("adm.edit.readOnly")}
                  onClick={() => {
                    setTarget(s);
                    setSheet("role");
                  }}
                >
                  {t("a2.st.changeRole")}
                </PermissionButton>
                <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} onClick={() => toast(t("a2.uiOnly"))}>
                  {t("a2.st.disable")}
                </PermissionButton>
              </div>
            </li>
          ))}
        </ul>
      </AdminPanel>

      <AdminSheet
        open={sheet !== null}
        title={sheet === "invite" ? t("a2.st.inviteTitle") : t("a2.st.changeRole")}
        description={sheet === "role" && target ? pick(lang, target.name) : ""}
        onClose={() => setSheet(null)}
        footer={
          <>
            <button type="button" className={btnClass("outline", "sm")} onClick={() => setSheet(null)}>
              {t("a2.cancel")}
            </button>
            <PermissionButton
              allowed={mayEdit}
              reason={t("adm.edit.readOnly")}
              variant="primary"
              onClick={() => {
                toast(t(sheet === "invite" ? "a2.st.inviteSent" : "a2.st.roleChanged"));
                setSheet(null);
              }}
            >
              {t("a2.save")}
            </PermissionButton>
          </>
        }
      >
        <div className="space-y-3">
          {sheet === "invite" ? (
            <Field label={t("a2.cu.email")} htmlFor="st-email">
              <Input id="st-email" dir="ltr" type="email" placeholder="name@gza.ps" />
            </Field>
          ) : null}
          <Field label={t("a2.st.role")} htmlFor="st-role">
            <Select id="st-role" defaultValue={target?.role ?? "viewer"}>
              {(["admin", "editor", "viewer"] as const).map((r) => (
                <option key={r} value={r}>{roleLabel(r)}</option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">{t("a2.st.roleNote")}</p>
        </div>
      </AdminSheet>
    </div>
  );
}
