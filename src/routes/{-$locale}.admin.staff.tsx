import { GazaTable, GazaTableBody, GazaTableCaption, GazaTableCell, GazaTableHead, GazaTableHeader, GazaTableRow } from "@/components/gaza-table";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Field, Input, Select, btnClass } from "@/components/kit";
import { AdminChip, AdminPageHeader, AdminPanel, GazaSheet, Ltr, PermissionButton } from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import { useRepositories } from "@/lib/repositories/registry";
import { executeAuditedAdminCommand } from "@/lib/activity";
import {
  useStaffQuery,
  useCreateStaffMutation,
  useUpdateStaffRoleMutation,
  useSetStaffStatusMutation,
  StaffError,
  type StaffMember,
} from "@/lib/staff";
import type { AdminRole } from "@/lib/admin";
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

type SheetKind = "create" | "role" | null;

function AdminStaffPage() {
  const { t, lang } = useI18n();
  const { can, toast, actor } = useAdmin();
  const { activity: activityRepo } = useRepositories();
  const { data: staffList = [], isLoading, isError, refetch } = useStaffQuery();
  const createMutation = useCreateStaffMutation();
  const updateRoleMutation = useUpdateStaffRoleMutation();
  const setStatusMutation = useSetStaffStatusMutation();

  const [sheet, setSheet] = useState<SheetKind>(null);
  const [target, setTarget] = useState<StaffMember | null>(null);

  // Create form state
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("editor");
  const [titleEn, setTitleEn] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Role edit state
  const [selectedRole, setSelectedRole] = useState<AdminRole>("editor");

  const mayEdit = can("admin.manage");

  if (!can("admin.manage")) return <AdminDenied area={t("a2.st.title")} permission="admin.manage" />;

  const roleLabel = (r: AdminRole) => t(`adm.role.${r}`);

  const formatLastActive = (iso: string | null) => {
    if (!iso) return t("a2.st.neverActive");
    return iso.slice(0, 16).replace("T", " ");
  };

  const handleOpenCreate = () => {
    setNameEn("");
    setNameAr("");
    setEmail("");
    setRole("editor");
    setTitleEn("");
    setTitleAr("");
    setFormError(null);
    setSheet("create");
  };

  const handleOpenRole = (member: StaffMember) => {
    setTarget(member);
    setSelectedRole(member.role);
    setFormError(null);
    setSheet("role");
  };

  const handleSaveCreate = async () => {
    setFormError(null);
    if (!nameEn.trim() || !nameAr.trim()) {
      setFormError(lang === "ar" ? "يرجى إدخال الاسم باللغتين." : "Please enter the name in both English and Arabic.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setFormError(lang === "ar" ? "يرجى إدخال بريد إلكتروني صالح." : "Please enter a valid email address.");
      return;
    }

    try {
      await executeAuditedAdminCommand({
        domainCommand: () =>
          createMutation.mutateAsync({
            name: { en: nameEn.trim(), ar: nameAr.trim() },
            email: email.trim(),
            role,
            title: titleEn.trim() && titleAr.trim() ? { en: titleEn.trim(), ar: titleAr.trim() } : undefined,
          }),
        activityRepo,
        actor,
        event: (created) => ({
          module: "staff",
          action: "created",
          targetType: "staff",
          targetId: created.id,
          metadata: {
            name: created.name.en,
            email: created.email,
            role: created.role,
          },
        }),
        onAuditWarning: () => toast(t("a2.ac.auditWarning")),
      });
      toast(t("a2.st.inviteSent"));
      setSheet(null);
    } catch (err) {
      if (err instanceof StaffError && err.code === "email_taken") {
        setFormError(t("a2.st.errEmailTaken"));
      } else {
        setFormError(t("a2.st.errSave"));
      }
    }
  };

  const handleSaveRole = async () => {
    if (!target) return;
    setFormError(null);
    const targetSnapshot = { ...target };
    const intendedRole = selectedRole;
    try {
      await executeAuditedAdminCommand({
        domainCommand: () =>
          updateRoleMutation.mutateAsync({ id: targetSnapshot.id, role: intendedRole }),
        activityRepo,
        actor,
        event: (receipt) => ({
          module: "staff",
          action: "role_changed",
          targetType: "staff",
          targetId: receipt.member.id,
          before: receipt.beforeRole ?? targetSnapshot.role,
          after: receipt.member.role,
          metadata: {
            email: receipt.member.email,
            role: receipt.member.role,
          },
        }),
        isNoOp: (receipt) => !receipt.changed,
        onAuditWarning: () => toast(t("a2.ac.auditWarning")),
      });
      toast(t("a2.st.roleChanged"));
      setSheet(null);
    } catch (err) {
      if (err instanceof StaffError && err.code === "last_admin_protected") {
        setFormError(t("a2.st.errLastAdmin"));
      } else {
        setFormError(t("a2.st.errSave"));
      }
    }
  };

  const handleToggleStatus = async (member: StaffMember) => {
    const nextStatus = member.status === "active" ? "disabled" : "active";
    const memberSnapshot = { ...member };
    try {
      await executeAuditedAdminCommand({
        domainCommand: () =>
          setStatusMutation.mutateAsync({ id: memberSnapshot.id, status: nextStatus }),
        activityRepo,
        actor,
        event: (receipt) => ({
          module: "staff",
          action: "status_changed",
          targetType: "staff",
          targetId: receipt.member.id,
          before: receipt.beforeStatus ?? memberSnapshot.status,
          after: receipt.member.status,
          metadata: {
            email: receipt.member.email,
            status: receipt.member.status,
          },
        }),
        isNoOp: (receipt) => !receipt.changed,
        onAuditWarning: () => toast(t("a2.ac.auditWarning")),
      });
      toast(t("a2.st.statusChanged"));
    } catch (err) {
      if (err instanceof StaffError && err.code === "last_admin_protected") {
        toast(t("a2.st.errLastAdmin"));
      } else {
        toast(t("a2.st.errSave"));
      }
    }
  };

  if (isError) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={t("a2.st.title")} description={t("a2.st.sub")} />
        <AdminPanel bodyClassName="p-8 text-center space-y-4">
          <p className="text-sm text-destructive">{t("a2.st.errSave")}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className={btnClass("outline", "sm")}
          >
            {lang === "ar" ? "إعادة المحاولة" : "Retry"}
          </button>
        </AdminPanel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("a2.st.title")}
        description={t("a2.st.sub")}
        meta={<p className="text-xs text-muted-foreground">{t("a2.st.roleNote")}</p>}
        action={
          <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} variant="primary" onClick={handleOpenCreate}>
            {t("a2.st.invite")}
          </PermissionButton>
        }
      />

      <AdminPanel bodyClassName="p-0">
        <div className="hidden overflow-x-auto lg:block">
          <GazaTable className="w-full text-sm">
            <GazaTableCaption className="sr-only">{t("a2.st.title")}</GazaTableCaption>
            <GazaTableHeader>
              <GazaTableRow className="border-b border-border type-th">
                {[t("a2.st.member"), t("a2.cu.email"), t("a2.st.role"), t("a2.status"), t("a2.st.lastActive"), t("a2.actions")].map((h) => (
                  <GazaTableHead key={h} scope="col" className="px-3 py-2 text-start font-bold">{h}</GazaTableHead>
                ))}
              </GazaTableRow>
            </GazaTableHeader>
            <GazaTableBody>
              {staffList.map((s) => (
                <GazaTableRow key={s.id} className="border-b border-border last:border-0">
                  <GazaTableCell className="px-3 py-2 font-semibold">
                    <div>
                      <span>{pick(lang, s.name)}</span>
                      <span className="block text-xs font-normal text-muted-foreground">{pick(lang, s.title)}</span>
                    </div>
                  </GazaTableCell>
                  <GazaTableCell className="px-3 py-2"><Ltr>{s.email}</Ltr></GazaTableCell>
                  <GazaTableCell className="px-3 py-2">{roleLabel(s.role)}</GazaTableCell>
                  <GazaTableCell className="px-3 py-2">
                    <AdminChip tone={s.status === "active" ? "brand" : "muted"}>{t(s.status === "active" ? "a2.st.active" : "a2.st.disabled")}</AdminChip>
                  </GazaTableCell>
                  <GazaTableCell className="px-3 py-2"><Ltr>{formatLastActive(s.lastActiveAt)}</Ltr></GazaTableCell>
                  <GazaTableCell className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      <PermissionButton
                        allowed={mayEdit}
                        reason={t("adm.edit.readOnly")}
                        onClick={() => handleOpenRole(s)}
                      >
                        {t("a2.st.changeRole")}
                      </PermissionButton>
                      <PermissionButton
                        allowed={mayEdit}
                        reason={t("adm.edit.readOnly")}
                        onClick={() => void handleToggleStatus(s)}
                      >
                        {t(s.status === "active" ? "a2.st.disable" : "a2.st.enable")}
                      </PermissionButton>
                    </div>
                  </GazaTableCell>
                </GazaTableRow>
              ))}
            </GazaTableBody>
          </GazaTable>
        </div>

        <ul className="divide-y divide-border lg:hidden">
          {staffList.map((s) => (
            <li key={s.id} className="space-y-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{pick(lang, s.name)}</p>
                <AdminChip tone={s.status === "active" ? "brand" : "muted"}>{t(s.status === "active" ? "a2.st.active" : "a2.st.disabled")}</AdminChip>
              </div>
              <p className="text-xs text-muted-foreground"><Ltr>{s.email}</Ltr></p>
              <p className="text-xs text-muted-foreground">
                {`${roleLabel(s.role)} · `}
                <Ltr>{formatLastActive(s.lastActiveAt)}</Ltr>
              </p>
              <div className="flex flex-wrap gap-1.5">
                <PermissionButton
                  allowed={mayEdit}
                  reason={t("adm.edit.readOnly")}
                  onClick={() => handleOpenRole(s)}
                >
                  {t("a2.st.changeRole")}
                </PermissionButton>
                <PermissionButton
                  allowed={mayEdit}
                  reason={t("adm.edit.readOnly")}
                  onClick={() => void handleToggleStatus(s)}
                >
                  {t(s.status === "active" ? "a2.st.disable" : "a2.st.enable")}
                </PermissionButton>
              </div>
            </li>
          ))}
        </ul>
      </AdminPanel>

      <GazaSheet
        open={sheet !== null}
        title={sheet === "create" ? t("a2.st.inviteTitle") : t("a2.st.changeRole")}
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
              onClick={sheet === "create" ? () => void handleSaveCreate() : () => void handleSaveRole()}
            >
              {sheet === "create" ? t("a2.st.saveProfile") : t("a2.save")}
            </PermissionButton>
          </>
        }
      >
        <div className="space-y-3">
          {formError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive" role="alert">
              {formError}
            </div>
          )}

          {sheet === "create" ? (
            <>
              <Field label={t("a2.st.nameEn")} htmlFor="st-name-en">
                <Input
                  id="st-name-en"
                  dir="ltr"
                  placeholder="e.g. Tariq Mansour"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                />
              </Field>
              <Field label={t("a2.st.nameAr")} htmlFor="st-name-ar">
                <Input
                  id="st-name-ar"
                  dir="rtl"
                  placeholder="مثال: طارق منصور"
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                />
              </Field>
              <Field label={t("a2.cu.email")} htmlFor="st-email">
                <Input
                  id="st-email"
                  dir="ltr"
                  type="email"
                  placeholder="tariq.mansour@gza.ps"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label={t("a2.st.role")} htmlFor="st-role">
                <Select id="st-role" value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
                  {(["admin", "editor", "viewer"] as const).map((r) => (
                    <option key={r} value={r}>{roleLabel(r)}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t("a2.st.titleEn")} htmlFor="st-title-en">
                <Input
                  id="st-title-en"
                  dir="ltr"
                  placeholder="e.g. Ground Operations Specialist"
                  value={titleEn}
                  onChange={(e) => setTitleEn(e.target.value)}
                />
              </Field>
              <Field label={t("a2.st.titleAr")} htmlFor="st-title-ar">
                <Input
                  id="st-title-ar"
                  dir="rtl"
                  placeholder="مثال: أخصائي العمليات الأرضية"
                  value={titleAr}
                  onChange={(e) => setTitleAr(e.target.value)}
                />
              </Field>
            </>
          ) : (
            <Field label={t("a2.st.role")} htmlFor="st-role-edit">
              <Select id="st-role-edit" value={selectedRole} onChange={(e) => setSelectedRole(e.target.value as AdminRole)}>
                {(["admin", "editor", "viewer"] as const).map((r) => (
                  <option key={r} value={r}>{roleLabel(r)}</option>
                ))}
              </Select>
            </Field>
          )}

          <p className="text-xs text-muted-foreground">{t("a2.st.roleNote")}</p>
        </div>
      </GazaSheet>
    </div>
  );
}
