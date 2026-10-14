import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { AppLink } from "@/components/app-link";
import { AdminPageHeader, AdminPanel, Metric } from "./admin-kit";
import { AdminDenied } from "./admin-denied";
import { GazaTable, GazaTableBody, GazaTableCell, GazaTableHead, GazaTableHeader, GazaTableRow } from "@/components/gaza-table";
import { btnClass } from "@/components/kit";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import { getMvpUiClient } from "@/lib/api/mvp-ui-runtime";
import { activityActionLabel, activityDomainLabel, activityOutcomeLabel, formatActivityTimestamp } from "@/lib/admin-activity-presentation";

const count = z.number().int().nonnegative();
const dashboardSchema = z.object({ confirmedBookings: count, confirmedPassengers: count, cancelledBookings: count,
  passengerAccounts: count, activeDestinations: count, activeAircraft: count, activeSchedules: count }).strict();
const customerSchema = z.object({ id: z.string().uuid(), name: z.string(), email: z.string().email(), phone: z.string(),
  status: z.enum(["active", "unverified", "suspended"]), bookingCount: count, createdAt: z.string() }).strict();
const eventSchema = z.object({ id: z.string(), domain: z.string(), action: z.string(), outcome: z.string(),
  actorId: z.string().nullable(), targetId: z.string().nullable(), occurredAt: z.string() }).strict();
const customerPageSchema = z.object({ items: z.array(customerSchema), page: count, pageSize: z.literal(25), total: count }).strict();
const eventPageSchema = z.object({ items: z.array(eventSchema), page: count, pageSize: z.literal(25), total: count }).strict();

export function LiveAdminDashboard() {
  const { lang, t } = useI18n(); const { staff, can } = useAdmin();
  const query = useQuery({ queryKey: ["live-admin-dashboard", staff?.id], enabled: Boolean(staff && can("dashboard.view")),
    queryFn: ({ signal }) => getMvpUiClient().request({ method: "GET", path: "/admin/dashboard", realm: "staff", schema: dashboardSchema, signal }) });
  const labels = {
    confirmedBookings: ["Confirmed bookings", "الحجوزات المؤكدة"], confirmedPassengers: ["Booked passengers", "المسافرون المحجوزون"],
    cancelledBookings: ["Cancelled bookings", "الحجوزات الملغاة"], passengerAccounts: ["Passenger accounts", "حسابات المسافرين"],
    activeDestinations: ["Available destinations", "الوجهات المتاحة"], activeAircraft: ["Active aircraft", "الطائرات المفعلة"],
    activeSchedules: ["Recurring schedules", "الجداول المتكررة"],
  } as const;
  if (!can("dashboard.view")) return <AdminDenied area={t("adm.nav.dashboard")} permission="dashboard.view" />;
  return <div className="min-w-0 space-y-5" data-testid="live-admin-dashboard">
    <AdminPageHeader title={t("adm.nav.dashboard")} description={pick(lang, { en: "Live totals for the commemorative booking website.", ar: "إحصاءات مباشرة لموقع الحجوزات التذكارية." })} />
    <ReadState loading={query.isPending} error={query.isError} retry={() => void query.refetch()} />
    {query.data && <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(labels).map(([key, label]) =>
      <Metric key={key} label={pick(lang, { en: label[0], ar: label[1] })} value={query.data[key as keyof typeof labels]} />)}</div>}
    <AdminPanel title={pick(lang, { en: "Administration", ar: "الإدارة" })}><div className="flex flex-wrap gap-3">
      {can("commercial.view") && <AppLink to="/admin/bookings" className={btnClass("outline", "sm")}>{t("adm.nav.bookings")}</AppLink>}
      {can("ops.view") && <AppLink to="/admin/schedules" className={btnClass("outline", "sm")}>{t("adm.nav.schedules")}</AppLink>}
      {can("content.view") && <AppLink to="/admin/website" className={btnClass("outline", "sm")}>{t("a2.nav.website")}</AppLink>}
    </div></AdminPanel>
  </div>;
}

function ReadState({ loading, error, retry }: { loading: boolean; error: boolean; retry: () => void }) {
  const { lang } = useI18n();
  if (error) return <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">{pick(lang, { en: "Unable to load server data.", ar: "تعذر تحميل بيانات الخادم." })}
    <button type="button" className={btnClass("outline", "sm")} onClick={retry}>{pick(lang, { en: "Retry", ar: "إعادة المحاولة" })}</button></div>;
  return loading ? <p role="status">{pick(lang, { en: "Loading…", ar: "جارٍ التحميل…" })}</p> : null;
}

export function LiveCustomersPage() {
  const { t, lang } = useI18n(); const { staff, can } = useAdmin(); const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ["live-admin-customers", staff?.id, page], enabled: Boolean(staff && can("admin.manage")),
    queryFn: ({ signal }) => getMvpUiClient().request({ method: "GET", path: `/admin/customers?page=${page}`, realm: "staff", schema: customerPageSchema, signal }) });
  if (!can("admin.manage")) return <AdminDenied area={t("adm.nav.customers")} permission="admin.manage" />;
  return <div className="min-w-0 space-y-4"><AdminPageHeader title={t("adm.nav.customers")} />
    <ReadState loading={query.isPending} error={query.isError} retry={() => void query.refetch()} />
    {query.data && <><GazaTable><GazaTableHeader><GazaTableRow>{[t("adm.nav.customers"), pick(lang,{en:"Email",ar:"البريد الإلكتروني"}), pick(lang,{en:"Status",ar:"الحالة"}), t("adm.nav.bookings")].map(label => <GazaTableHead key={label}>{label}</GazaTableHead>)}</GazaTableRow></GazaTableHeader>
      <GazaTableBody>{query.data.items.map(person => <GazaTableRow key={person.id}><GazaTableCell>{person.name || "—"}</GazaTableCell><GazaTableCell><span dir="ltr" className="break-all">{person.email}</span></GazaTableCell>
        <GazaTableCell>{pick(lang, {en:{active:"Active",unverified:"Unverified",suspended:"Suspended"}[person.status],ar:{active:"نشط",unverified:"غير متحقق",suspended:"موقوف"}[person.status]})}</GazaTableCell><GazaTableCell>{person.bookingCount}</GazaTableCell></GazaTableRow>)}</GazaTableBody></GazaTable>
      {!query.data.items.length && <p>{pick(lang,{en:"No passenger accounts yet.",ar:"لا توجد حسابات مسافرين بعد."})}</p>}
      <Pages page={page} total={query.data.total} setPage={setPage} /></>}
  </div>;
}

export function LiveActivityPage() {
  const { t, lang } = useI18n(); const { staff, can } = useAdmin(); const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ["live-admin-activity", staff?.id, page], enabled: Boolean(staff && can("admin.manage")),
    queryFn: ({ signal }) => getMvpUiClient().request({ method: "GET", path: `/admin/activity?page=${page}`, realm: "staff", schema: eventPageSchema, signal }) });
  if (!can("admin.manage")) return <AdminDenied area={t("adm.nav.activity")} permission="admin.manage" />;
  return <div className="min-w-0 space-y-4"><AdminPageHeader title={t("adm.nav.activity")} description={pick(lang,{en:"Server-recorded account, booking and administration activity.",ar:"نشاط الحسابات والحجوزات والإدارة المسجل على الخادم."})}/>
    <ReadState loading={query.isPending} error={query.isError} retry={() => void query.refetch()} />
    {query.data && <><GazaTable><GazaTableHeader><GazaTableRow>{[pick(lang,{en:"Time (your timezone)",ar:"الوقت (منطقتك الزمنية)"}),pick(lang,{en:"Area",ar:"المجال"}),pick(lang,{en:"Action",ar:"الإجراء"}),pick(lang,{en:"Result",ar:"النتيجة"})].map(label=><GazaTableHead key={label}>{label}</GazaTableHead>)}</GazaTableRow></GazaTableHeader>
      <GazaTableBody>{query.data.items.map(event=><GazaTableRow key={event.id}><GazaTableCell><time dateTime={Number.isFinite(Date.parse(event.occurredAt)) ? event.occurredAt : undefined}>{formatActivityTimestamp(event.occurredAt, lang)}</time></GazaTableCell><GazaTableCell>{activityDomainLabel(event.domain, lang)}</GazaTableCell><GazaTableCell>{activityActionLabel(event.domain, event.action, lang)}<details className="mt-1 text-xs text-muted-foreground"><summary>{pick(lang,{en:"Technical identifier",ar:"المعرف التقني"})}</summary><code dir="ltr" className="break-all">{event.domain}:{event.action}</code></details></GazaTableCell><GazaTableCell>{activityOutcomeLabel(event.outcome, lang)}</GazaTableCell></GazaTableRow>)}</GazaTableBody></GazaTable>
      {!query.data.items.length && <p>{pick(lang,{en:"No recorded activity yet.",ar:"لا يوجد نشاط مسجل بعد."})}</p>}<Pages page={page} total={query.data.total} setPage={setPage}/></>}
  </div>;
}

function Pages({page,total,setPage}:{page:number;total:number;setPage:(page:number)=>void}) {
  const {lang}=useI18n(); return <div className="flex flex-wrap items-center gap-3"><button type="button" className={btnClass("outline","sm")} disabled={page===1} onClick={()=>setPage(page-1)}>{pick(lang,{en:"Previous",ar:"السابق"})}</button>
    <span dir="ltr">{page} / {Math.max(1,Math.ceil(total/25))}</span><button type="button" className={btnClass("outline","sm")} disabled={page*25>=total} onClick={()=>setPage(page+1)}>{pick(lang,{en:"Next",ar:"التالي"})}</button></div>;
}
