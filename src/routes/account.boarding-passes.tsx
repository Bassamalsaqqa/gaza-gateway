import { Link, createFileRoute } from "@tanstack/react-router";
import { Plane } from "lucide-react";
import { btnClass, Code, EmptyState } from "@/components/kit";
import { airportByCode } from "@/lib/data";
import { dateShort } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/account/boarding-passes")({
  head: () => ({
    meta: [
      { title: "Boarding passes — Gaza International Airport (GZA)" },
      { name: "description", content: "Boarding passes for checked-in Palestinian Airlines flights from Gaza." },
      { property: "og:title", content: "Boarding passes — Gaza International Airport" },
      { property: "og:description", content: "Your boarding passes for checked-in flights." },
    ],
  }),
  component: BoardingPassesPage,
});

function BoardingPassesPage() {
  const { t, lang } = useI18n();
  const { bookings } = useStore();
  const passes = bookings.filter((b) => b.checkedIn && b.status === "confirmed");

  if (passes.length === 0) {
    return (
      <EmptyState
        title={t("account.noPasses")}
        description={t("account.noPassesSub")}
        action={
          <Link to="/manage" className={btnClass("primary", "md")}>
            {t("manage.checkin")}
          </Link>
        }
      />
    );
  }

  return (
    <ul className="space-y-4">
      {passes.flatMap((booking) =>
        booking.passengers.map((passenger, index) => (
          <li key={`${booking.ref}-${index}`}>
            <article className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between gap-3 bg-ink px-5 py-3 text-ink-foreground">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Plane aria-hidden="true" className="size-4 rtl:-scale-x-100" />
                  {t("brand.airline")}
                </span>
                <Code className="text-sm">{booking.outbound.number}</Code>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-[1.4fr_auto]">
                <div>
                  <p className="eyebrow text-muted-foreground">{t("book.passengersLabel")}</p>
                  <p className="mt-1 text-lg font-bold uppercase">
                    {passenger.lastName} / {passenger.firstName}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Cell label={t("book.from")} value={booking.outbound.originCode} mono />
                    <Cell label={t("search.to")} value={booking.outbound.destinationCode} mono />
                    <Cell label={t("flights.date")} value={dateShort(booking.outbound.date, lang)} />
                    <Cell label={t("flights.gate")} value={booking.outbound.gate} mono />
                    <Cell label={t("search.depart")} value={booking.outbound.departTime} mono />
                    <Cell label={t("book.seatsLabel")} value={booking.seats[`out-${index}`] ?? "—"} mono />
                    <Cell label={t("flights.terminal")} value={booking.outbound.terminal} mono />
                    <Cell label={t("book.reference")} value={booking.ref} mono />
                  </div>
                  <p className="mt-4 text-xs text-muted-foreground">
                    {pick(lang, {
                      en: `${
                        airportByCode(booking.outbound.originCode)?.city.en ?? ""
                      } — boarding closes 20 minutes before departure.`,
                      ar: `${
                        airportByCode(booking.outbound.originCode)?.city.ar ?? ""
                      } — يُغلق الصعود قبل 20 دقيقة من المغادرة.`,
                    })}
                  </p>
                </div>
                <div
                  aria-hidden="true"
                  className="hidden w-28 shrink-0 rounded-lg bg-[repeating-linear-gradient(90deg,var(--color-foreground)_0_3px,transparent_3px_7px)] sm:block"
                />
              </div>
            </article>
          </li>
        )),
      )}
    </ul>
  );
}

function Cell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="eyebrow text-muted-foreground">{label}</p>
      <p className={mono ? "code-id mt-1 text-base font-bold" : "mt-1 text-base font-bold"}>{value}</p>
    </div>
  );
}
