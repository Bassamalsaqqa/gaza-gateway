import { GazaTable, GazaTableBody, GazaTableCaption, GazaTableCell, GazaTableHead, GazaTableHeader, GazaTableRow } from "@/components/gaza-table";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Input, Select, btnClass } from "@/components/kit";
import { AdminChip, AdminEmpty, AdminPageHeader, AdminPanel, GazaSheet, Ltr, Toolbar } from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import { formatActivitySummary, useActivityQuery, type ActivityEvent } from "@/lib/activity";
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

function formatTimestamp(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const pad = (n: number) => String(n).padStart(2, "0");
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const mins = pad(d.getMinutes());
    return `${year}-${month}-${day} ${hours}:${mins}`;
  } catch {
    return isoStr;
  }
}

function AdminActivityPage() {
  const { t, lang } = useI18n();
  const { can } = useAdmin();
  const [actor, setActor] = useState("all");
  const [module, setModule] = useState("all");
  const [action, setAction] = useState("all");
  const [date, setDate] = useState("");
  const [open, setOpen] = useState<ActivityEvent | null>(null);

  const { data: events = [], isLoading, isError, refetch } = useActivityQuery();

  const actors = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of events) {
      const name = pick(lang, e.actor.name) || e.actor.email;
      map.set(e.actor.id, name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [events, lang]);

  const modules = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) {
      set.add(e.module);
    }
    return Array.from(set);
  }, [events]);

  const rows = useMemo(() => {
    return events.filter((e) => {
      if (actor !== "all" && e.actor.id !== actor) return false;
      if (module !== "all" && e.module !== module) return false;
      if (action !== "all" && e.action !== action) return false;
      if (date && !e.timestamp.startsWith(date)) return false;
      return true;
    });
  }, [events, actor, module, action, date]);

  if (!can("admin.manage")) return <AdminDenied area={t("a2.ac.title")} permission="admin.manage" />;

  if (isError) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={t("a2.ac.title")} description={t("a2.ac.sub")} />
        <AdminPanel bodyClassName="p-8 text-center space-y-4">
          <p className="text-sm text-destructive">
            {lang === "ar"
              ? "تعذر تحميل سجل النشاط. يرجى إعادة المحاولة."
              : "Unable to load activity log. Please retry."}
          </p>
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

  const moduleName = (mod: string) => {
    switch (mod) {
      case "bookings":
        return t("a2.cu.bookings");
      case "flights":
        return t("adm.nav.flights");
      case "schedules":
        return t("adm.nav.schedules");
      case "network":
        return t("adm.nav.destinations");
      case "fleet":
        return t("adm.nav.products");
      case "commercial":
        return t("adm.nav.products");
      case "inbox":
        return t("a2.in.title");
      case "staff":
        return t("a2.st.title");
      case "session":
        return t("adm.nav.dashboard");
      case "content":
        return t("a2.web.title");
      default:
        return mod;
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title={t("a2.ac.title")} description={t("a2.ac.sub")} />

      <AdminPanel bodyClassName="p-0">
        <Toolbar>
          <Select aria-label={t("a2.ac.allStaff")} value={actor} onChange={(e) => setActor(e.target.value)} className="w-auto">
            <option value="all">{t("a2.ac.allStaff")}</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
          <Select aria-label={t("a2.ac.allModules")} value={module} onChange={(e) => setModule(e.target.value)} className="w-auto">
            <option value="all">{t("a2.ac.allModules")}</option>
            {modules.map((m) => (
              <option key={m} value={m}>{moduleName(m)}</option>
            ))}
          </Select>
          <Select aria-label={t("a2.ac.allActions")} value={action} onChange={(e) => setAction(e.target.value)} className="w-auto">
            <option value="all">{t("a2.ac.allActions")}</option>
            {(["created", "updated", "cancelled", "checked_in", "undo_check_in", "assigned", "status_changed", "role_changed", "signin", "cleared"] as const).map((a) => (
              <option key={a} value={a}>{t(`a2.ac.act.${a}`)}</option>
            ))}
          </Select>
          <Input aria-label={t("a2.date")} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
        </Toolbar>

        {rows.length === 0 ? (
          <AdminEmpty title={t("a2.ac.title")} body={t("a2.cu.noActivity")} />
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
                        <button type="button" className="font-semibold underline decoration-dotted text-start" onClick={() => setOpen(e)}>
                          {pick(lang, e.actor.name) || e.actor.email}
                        </button>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        <AdminChip tone="muted">{t(`a2.ac.act.${e.action}`)}</AdminChip>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2">{moduleName(e.module)}</GazaTableCell>
                      <GazaTableCell className="px-3 py-2"><Ltr>{e.targetId}</Ltr></GazaTableCell>
                      <GazaTableCell className="px-3 py-2"><Ltr>{formatTimestamp(e.timestamp)}</Ltr></GazaTableCell>
                    </GazaTableRow>
                  ))}
                </GazaTableBody>
              </GazaTable>
            </div>

            <ul className="divide-y divide-border lg:hidden">
              {rows.map((e) => (
                <li key={e.id} className="p-3">
                  <button type="button" className="w-full text-start" onClick={() => setOpen(e)}>
                    <span className="block text-sm font-medium">{formatActivitySummary(e, lang, t)}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      <Ltr>{formatTimestamp(e.timestamp)}</Ltr>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </AdminPanel>

      <GazaSheet
        open={open !== null}
        title={t("a2.ac.detail")}
        description={open ? (pick(lang, open.actor.name) || open.actor.email) : ""}
        onClose={() => setOpen(null)}
      >
        {open ? (
          <dl className="space-y-3 text-sm">
            {[
              { k: t("a2.ac.actor"), v: `${pick(lang, open.actor.name) || open.actor.email} (${t(`a2.st.role.${open.actor.role}`)})` },
              { k: t("a2.ac.action"), v: t(`a2.ac.act.${open.action}`) },
              { k: t("a2.ac.module"), v: moduleName(open.module) },
              { k: t("a2.ac.object"), v: <Ltr>{`${open.targetType} (${open.targetId})`}</Ltr> },
              ...(open.before ? [{ k: t("a2.ac.old"), v: open.before }] : []),
              ...(open.after ? [{ k: t("a2.ac.new"), v: open.after }] : []),
              { k: t("a2.ac.when"), v: <Ltr>{formatTimestamp(open.timestamp)}</Ltr> },
            ].map((row) => (
              <div key={row.k}>
                <dt className="text-xs font-semibold text-muted-foreground">{row.k}</dt>
                <dd>{row.v}</dd>
              </div>
            ))}
            <div className="rounded-md border border-border bg-sand p-3 text-xs leading-relaxed">
              {formatActivitySummary(open, lang, t)}
            </div>
          </dl>
        ) : null}
      </GazaSheet>
    </div>
  );
}
