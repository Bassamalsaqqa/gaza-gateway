import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { Input, Select, btnClass } from "@/components/kit";
import {
  AdminChip,
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  Ltr,
  Toolbar,
} from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { useI18n } from "@/lib/i18n";
import { money } from "@/lib/format";
import { mockBookings, type MockBookingStatus } from "@/lib/admin-mock";
import { destinations } from "@/lib/data";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/{-$locale}/admin/bookings/")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/bookings",
      en: { title: "Bookings — Gaza International Airport administration", description: "Passenger bookings on Palestinian Airlines services from Gaza." },
      ar: { title: "الحجوزات — إدارة مطار غزة الدولي", description: "حجوزات المسافرين على رحلات الخطوط الجوية الفلسطينية من غزة." },
      noindex: true,
    }),
  component: AdminBookingsPage,
});

export function bookingStatusChip(status: MockBookingStatus) {
  const tone =
    status === "cancelled" ? "danger" : status === "partial" ? "warn" : status === "checkedin" ? "brand" : status === "upcoming" ? "info" : "neutral";
  return tone as "danger" | "warn" | "brand" | "info" | "neutral";
}

function AdminBookingsPage() {
  const { t, lang } = useI18n();
  const { can } = useAdmin();
  const [query, setQuery] = useState("");
  const [date, setDate] = useState("");
  const [route, setRoute] = useState("all");
  const [status, setStatus] = useState<"all" | MockBookingStatus>("all");
  const [checkin, setCheckin] = useState<"all" | "none" | "partial" | "done">("all");
  const [fare, setFare] = useState("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mockBookings.filter((b) => {
      if (date && b.date !== date) return false;
      if (route !== "all" && b.destination !== route) return false;
      if (status !== "all" && b.status !== status) return false;
      if (fare !== "all" && b.fare !== fare) return false;
      if (checkin === "done" && b.status !== "checkedin") return false;
      if (checkin === "partial" && b.status !== "partial") return false;
      if (checkin === "none" && (b.status === "checkedin" || b.status === "partial")) return false;
      if (!q) return true;
      return [b.ref, b.lead, b.email, b.phone, b.flightOut, b.flightIn ?? "", b.route]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [query, date, route, status, checkin, fare]);

  if (!can("commercial.view")) return <AdminDenied area={t("a2.bk.title")} permission="commercial.view" />;

  const checkinLabel = (b: (typeof mockBookings)[number]) => {
    const done = b.passengers.filter((p) => p.checkedOut).length;
    const eligible = b.passengers.filter((p) => p.type !== "infant").length;
    return `${done}/${eligible}`;
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("a2.bk.title")}
        description={t("a2.bk.sub")}
        meta={<p className="text-xs text-muted-foreground">{t("a2.mock")}</p>}
        action={
          <AppLink to="/admin/bookings/new" className={btnClass("primary", "sm")}>
            <Plus aria-hidden="true" className="size-3.5" />
            {t("a2.bk.new")}
          </AppLink>
        }
      />

      <AdminPanel bodyClassName="p-0">
        <Toolbar>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("a2.bk.searchPlaceholder")}
            aria-label={t("a2.search")}
            className="h-9 w-full min-w-40 max-w-72 text-sm sm:w-72"
          />
          <Input
            type="date"
            dir="ltr"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label={t("a2.bk.date")}
            className="h-9 w-auto text-sm"
          />
          <Select value={route} onChange={(e) => setRoute(e.target.value)} aria-label={t("a2.bk.route")} className="h-9 w-auto text-sm">
            <option value="all">{t("a2.bk.allRoutes")}</option>
            {destinations.map((d) => (
              <option key={d.code} value={d.code}>
                {`GZA ↔ ${d.code}`}
              </option>
            ))}
          </Select>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as "all" | MockBookingStatus)}
            aria-label={t("a2.status")}
            className="h-9 w-auto text-sm"
          >
            <option value="all">{t("a2.bk.allStatus")}</option>
            {(["confirmed", "upcoming", "partial", "checkedin", "cancelled"] as MockBookingStatus[]).map((s) => (
              <option key={s} value={s}>
                {t(`a2.bk.st.${s}`)}
              </option>
            ))}
          </Select>
          <Select
            value={checkin}
            onChange={(e) => setCheckin(e.target.value as "all" | "none" | "partial" | "done")}
            aria-label={t("a2.bk.checkin")}
            className="h-9 w-auto text-sm"
          >
            <option value="all">{t("a2.bk.allCheckin")}</option>
            <option value="none">{t("a2.ci.st.not")}</option>
            <option value="partial">{t("a2.bk.st.partial")}</option>
            <option value="done">{t("a2.ci.st.done")}</option>
          </Select>
          <Select value={fare} onChange={(e) => setFare(e.target.value)} aria-label={t("a2.bk.cabin")} className="h-9 w-auto text-sm">
            <option value="all">{t("a2.bk.allCabin")}</option>
            {["Essential", "Classic", "Flex"].map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
          <span className="ms-auto text-xs text-muted-foreground">{t("a2.results", { n: rows.length })}</span>
        </Toolbar>

        {rows.length === 0 ? (
          <AdminEmpty title={t("a2.bk.empty")} body={t("a2.bk.emptyBody")} />
        ) : (
          <>
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[62rem] text-sm">
                <caption className="sr-only">{t("a2.bk.title")}</caption>
                <thead>
                  <tr className="border-b border-border type-th">
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("a2.bk.pnr")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("a2.bk.lead")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("a2.bk.route")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("a2.bk.date")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("a2.bk.pax")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("a2.bk.cabin")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("a2.bk.total")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("a2.bk.checkin")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("a2.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.ref} className="border-b border-border last:border-0 hover:bg-secondary/50">
                      <td className="px-3 py-2">
                        <AppLink
                          to="/admin/bookings/$ref"
                          params={{ ref: b.ref }}
                          className="font-bold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          <Ltr>{b.ref}</Ltr>
                        </AppLink>
                      </td>
                      <td className="px-3 py-2">{b.lead}</td>
                      <td className="px-3 py-2">
                        <Ltr>{b.route}</Ltr>
                      </td>
                      <td className="px-3 py-2">
                        <Ltr>{b.date}</Ltr>
                      </td>
                      <td className="px-3 py-2">
                        <Ltr>{b.paxCount}</Ltr>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{`${b.cabin} · ${b.fare}`}</td>
                      <td className="px-3 py-2">
                        <Ltr>{money(b.total, lang)}</Ltr>
                      </td>
                      <td className="px-3 py-2">
                        <Ltr>{checkinLabel(b)}</Ltr>
                      </td>
                      <td className="px-3 py-2">
                        <AdminChip tone={bookingStatusChip(b.status)}>{t(`a2.bk.st.${b.status}`)}</AdminChip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-border xl:hidden">
              {rows.map((b) => (
                <li key={`${b.ref}-card`} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <AppLink to="/admin/bookings/$ref" params={{ ref: b.ref }} className="font-bold underline-offset-2 hover:underline">
                        <Ltr>{b.ref}</Ltr>
                      </AppLink>
                      <p className="text-sm">{b.lead}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <Ltr>{`${b.route} · ${b.date}`}</Ltr>
                      </p>
                    </div>
                    <AdminChip tone={bookingStatusChip(b.status)}>{t(`a2.bk.st.${b.status}`)}</AdminChip>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="font-semibold text-muted-foreground">{t("a2.bk.pax")}</dt>
                      <dd>
                        <Ltr>{b.paxCount}</Ltr>
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-muted-foreground">{t("a2.bk.cabin")}</dt>
                      <dd>{`${b.cabin} · ${b.fare}`}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-muted-foreground">{t("a2.bk.total")}</dt>
                      <dd>
                        <Ltr>{money(b.total, lang)}</Ltr>
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-muted-foreground">{t("a2.bk.checkin")}</dt>
                      <dd>
                        <Ltr>{checkinLabel(b)}</Ltr>
                      </dd>
                    </div>
                  </dl>
                  <AppLink to="/admin/bookings/$ref" params={{ ref: b.ref }} className={btnClass("outline", "sm", "mt-2.5")}>
                    {t("a2.bk.open")}
                  </AppLink>
                </li>
              ))}
            </ul>
          </>
        )}
      </AdminPanel>
    </div>
  );
}
