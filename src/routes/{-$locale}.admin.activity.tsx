import { GazaTable, GazaTableBody, GazaTableCaption, GazaTableCell, GazaTableHead, GazaTableHeader, GazaTableRow } from "@/components/gaza-table";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Input, Select } from "@/components/kit";
import { AdminChip, AdminEmpty, AdminPageHeader, AdminPanel, AdminSheet, Ltr, Toolbar } from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import { activityEntries, type ActivityEntry } from "@/lib/admin-mock";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/{-$locale}/admin/activity")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/activity",
      en: { title: "Activity log — Gaza International Airport administration", description: "Recent changes made by staff across the administration." },
      ar: { title: "سجل النشاط — إدارة مطار غزة الدولي", description: "التغييرات الأخيرة التي أجراها الموظفون." },
      noindex: true,
    }),
  component: AdminActivityPage,
});

function AdminActivityPage() {
  const { t, lang } = useI18n();
  const { can } = useAdmin();
  const [actor, setActor] = useState("all");
  const [module, setModule] = useState("all");
  const [action, setAction] = useState("all");
  const [date, setDate] = useState("");
  const [open, setOpen] = useState<ActivityEntry | null>(null);

  const actors = useMemo(() => Array.from(new Set(activityEntries.map((e) => e.actor.en))), []);
  const modules = useMemo(() => Array.from(new Set(activityEntries.map((e) => e.module))), []);

  const rows = useMemo(
    () =>
      activityEntries.filter((e) => {
        if (actor !== "all" && e.actor.en !== actor) return false;
        if (module !== "all" && e.module !== module) return false;
        if (action !== "all" && e.action !== action) return false;
        if (date && !e.when.startsWith(date)) return false;
        return true;
      }),
    [actor, module, action, date],
  );

  if (!can("admin.manage")) return <AdminDenied area={t("a2.ac.title")} permission="admin.manage" />;

  return (
    <div className="space-y-4">
      <AdminPageHeader title={t("a2.ac.title")} description={t("a2.ac.sub")} meta={<p className="text-xs text-muted-foreground">{t("a2.mock")}</p>} />

      <AdminPanel bodyClassName="p-0">
        <Toolbar>
          <Select aria-label={t("a2.ac.allStaff")} value={actor} onChange={(e) => setActor(e.target.value)} className="w-auto">
            <option value="all">{t("a2.ac.allStaff")}</option>
            {actors.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </Select>
          <Select aria-label={t("a2.ac.allModules")} value={module} onChange={(e) => setModule(e.target.value)} className="w-auto">
            <option value="all">{t("a2.ac.allModules")}</option>
            {modules.map((m) => (
              <option key={m} value={m}>{t(m)}</option>
            ))}
          </Select>
          <Select aria-label={t("a2.ac.allActions")} value={action} onChange={(e) => setAction(e.target.value)} className="w-auto">
            <option value="all">{t("a2.ac.allActions")}</option>
            {(["updated", "published", "cancelled", "created", "signin"] as const).map((a) => (
              <option key={a} value={a}>{t(`a2.ac.act.${a}`)}</option>
            ))}
          </Select>
          <Input aria-label={t("a2.date")} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
        </Toolbar>

        {rows.length === 0 ? (
          <AdminEmpty title={t("a2.ac.title")} body={t("a2.mock")} />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <GazaTable className="w-full text-sm">
                <GazaTableCaption className="sr-only">{t("a2.ac.title")}</GazaTableCaption>
                <GazaTableHeader>
                  <GazaTableRow className="border-b border-border type-th">
                    {[t("a2.ac.actor"), t("a2.ac.action"), t("a2.ac.module"), t("a2.ac.object"), t("a2.ac.when")].map((h) => (
                      <GazaTableHead key={h} scope="col" className="px-3 py-2 text-start font-bold">{h}</GazaTableHead>
                    ))}
                  </GazaTableRow>
                </GazaTableHeader>
                <GazaTableBody>
                  {rows.map((e) => (
                    <GazaTableRow key={e.id} className="border-b border-border last:border-0">
                      <GazaTableCell className="px-3 py-2">
                        <button type="button" className="font-semibold underline decoration-dotted" onClick={() => setOpen(e)}>
                          {pick(lang, e.actor)}
                        </button>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2"><AdminChip tone="muted">{t(`a2.ac.act.${e.action}`)}</AdminChip></GazaTableCell>
                      <GazaTableCell className="px-3 py-2">{t(e.module)}</GazaTableCell>
                      <GazaTableCell className="px-3 py-2"><Ltr>{e.object}</Ltr></GazaTableCell>
                      <GazaTableCell className="px-3 py-2"><Ltr>{e.when}</Ltr></GazaTableCell>
                    </GazaTableRow>
                  ))}
                </GazaTableBody>
              </GazaTable>
            </div>

            <ul className="divide-y divide-border lg:hidden">
              {rows.map((e) => (
                <li key={e.id} className="p-3">
                  <button type="button" className="w-full text-start" onClick={() => setOpen(e)}>
                    <span className="block text-sm">{pick(lang, e.summary)}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      <Ltr>{e.when}</Ltr>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </AdminPanel>

      <AdminSheet open={open !== null} title={t("a2.ac.detail")} description={open ? pick(lang, open.actor) : ""} onClose={() => setOpen(null)}>
        {open ? (
          <dl className="space-y-3 text-sm">
            {[
              { k: t("a2.ac.actor"), v: pick(lang, open.actor) },
              { k: t("a2.ac.action"), v: t(`a2.ac.act.${open.action}`) },
              { k: t("a2.ac.module"), v: t(open.module) },
              { k: t("a2.ac.object"), v: <Ltr>{open.object}</Ltr> },
              { k: t("a2.ac.old"), v: open.before },
              { k: t("a2.ac.new"), v: open.after },
              { k: t("a2.ac.when"), v: <Ltr>{open.when}</Ltr> },
            ].map((row) => (
              <div key={row.k}>
                <dt className="text-xs font-semibold text-muted-foreground">{row.k}</dt>
                <dd>{row.v}</dd>
              </div>
            ))}
            <p className="rounded-md border border-border bg-sand p-3 text-xs">{pick(lang, open.summary)}</p>
          </dl>
        ) : null}
      </AdminSheet>
    </div>
  );
}
