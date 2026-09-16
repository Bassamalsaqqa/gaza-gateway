import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { Luggage, Ticket, Users } from "lucide-react";
import { StatusBadge } from "@/components/flight-status";
import { btnClass, Code, EmptyState, Panel } from "@/components/kit";
import { airportByCode } from "@/lib/data";
import { dateLong } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/{-$locale}/account/")({
  head: () => ({
    meta: [
      { title: "Account overview — Gaza International Airport (GZA)" },
      { name: "description", content: "Your upcoming Palestinian Airlines trips, boarding passes and saved travellers." },
      { property: "og:title", content: "Account overview — Gaza International Airport" },
      { property: "og:description", content: "Trips, boarding passes and travellers at a glance." },
    ],
  }),
  component: AccountOverview,
});

function AccountOverview() {
  const { t, lang } = useI18n();
  const { bookings, travelers } = useStore();
  const next = bookings.find((b) => b.status === "confirmed");

  return (
    <div className="space-y-4">
      <Panel>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("account.upcoming")}</h2>
        {next ? (
          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-lg font-bold">
                {pick(lang, airportByCode(next.outbound.originCode)?.city ?? { en: next.outbound.originCode, ar: next.outbound.originCode })}{" "}
                →{" "}
                {pick(
                  lang,
                  airportByCode(next.outbound.destinationCode)?.city ?? {
                    en: next.outbound.destinationCode,
                    ar: next.outbound.destinationCode,
                  },
                )}
              </p>
              <StatusBadge status={next.outbound.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {dateLong(next.outbound.date, lang)} · <Code>{next.outbound.number}</Code> ·{" "}
              <span className="code-id">{next.ref}</span>
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <AppLink to="/account/trips/$ref" params={{ ref: next.ref }} className={btnClass("primary", "sm")}>
                {t("account.viewTrip")}
              </AppLink>
              <AppLink to="/account/boarding-passes" className={btnClass("outline", "sm")}>
                <Ticket aria-hidden="true" className="size-4" />
                {t("book.boardingPass")}
              </AppLink>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState
              title={t("account.noTrips")}
              description={t("account.noTripsSub")}
              action={
                <AppLink to="/book" className={btnClass("primary", "md")}>
                  {t("account.bookNow")}
                </AppLink>
              }
            />
          </div>
        )}
      </Panel>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={Luggage} label={t("account.trips")} value={bookings.length} to="/account/trips" />
        <Stat icon={Ticket} label={t("account.boardingPasses")} value={bookings.filter((b) => b.checkedIn).length} to="/account/boarding-passes" />
        <Stat icon={Users} label={t("account.travelers")} value={travelers.length} to="/account/travelers" />
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  to,
}: {
  icon: typeof Luggage;
  label: string;
  value: number;
  to: "/account/trips" | "/account/boarding-passes" | "/account/travelers";
}) {
  return (
    <AppLink to={to} className="surface p-5 transition-colors hover:border-primary/40">
      <Icon aria-hidden="true" className="size-4 text-clay" />
      <p className="numeral mt-3 text-3xl font-bold">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </AppLink>
  );
}
