import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { StatusBadge } from "@/components/flight-status";
import { btnClass, Code, EmptyState, Panel, Pill } from "@/components/kit";
import { airportByCode } from "@/lib/data";
import { dateLong, money } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import { useState } from "react";
import { passCount, useStore } from "@/lib/store";

export const Route = createFileRoute("/{-$locale}/account/trips/")({
  head: () => ({
    meta: [
      { title: "My trips — Gaza International Airport (GZA)" },
      { name: "description", content: "All your Palestinian Airlines bookings from Gaza, upcoming and past." },
      { property: "og:title", content: "My trips — Gaza International Airport" },
      { property: "og:description", content: "Upcoming and past bookings in one list." },
    ],
  }),
  component: TripsPage,
});

type Group = "upcoming" | "past" | "cancelled";

function TripsPage() {
  const { t, lang } = useI18n();
  const { myBookings: bookings } = useStore();
  const [group, setGroup] = useState<Group>("upcoming");

  const today = new Date().toISOString().slice(0, 10);
  const grouped: Record<Group, typeof bookings> = {
    cancelled: bookings.filter((b) => b.status === "cancelled"),
    upcoming: bookings.filter((b) => b.status !== "cancelled" && b.outbound.date >= today),
    past: bookings.filter((b) => b.status !== "cancelled" && b.outbound.date < today),
  };
  const list = grouped[group];

  const tabs: { id: Group; label: string }[] = [
    { id: "upcoming", label: t("account.tabUpcoming") },
    { id: "past", label: t("account.tabPast") },
    { id: "cancelled", label: t("account.tabCancelled") },
  ];

  if (bookings.length === 0) {
    return (
      <EmptyState
        title={t("account.noTrips")}
        description={t("account.noTripsSub")}
        action={
          <AppLink to="/book" className={btnClass("primary", "md")}>
            {t("account.bookNow")}
          </AppLink>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label={t("account.trips")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={group === tab.id}
            onClick={() => setGroup(tab.id)}
            className={btnClass(group === tab.id ? "ink" : "outline", "sm")}
          >
            {tab.label}
            <span className="numeral ms-1">{grouped[tab.id].length}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState
          title={t(`account.empty.${group}`)}
          description={t("account.emptyGroupSub")}
          action={
            <AppLink to="/book" className={btnClass("primary", "md")}>
              {t("account.bookNow")}
            </AppLink>
          }
        />
      ) : (
        <ul className="space-y-4" role="tabpanel">
          {list.map((booking) => (
        <li key={booking.ref}>
          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold">
                  {pick(
                    lang,
                    airportByCode(booking.outbound.originCode)?.city ?? {
                      en: booking.outbound.originCode,
                      ar: booking.outbound.originCode,
                    },
                  )}{" "}
                  →{" "}
                  {pick(
                    lang,
                    airportByCode(booking.outbound.destinationCode)?.city ?? {
                      en: booking.outbound.destinationCode,
                      ar: booking.outbound.destinationCode,
                    },
                  )}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {dateLong(booking.outbound.date, lang)} · <Code>{booking.outbound.number}</Code> ·{" "}
                  <span className="code-id">{booking.ref}</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {booking.status === "cancelled" ? (
                  <Pill tone="ink">{t("manage.cancelled")}</Pill>
                ) : (
                  <StatusBadge status={booking.outbound.status} />
                )}
                {booking.status !== "cancelled" && passCount(booking) > 0 ? (
                  <Pill tone="brand">{t("manage.checkedIn")}</Pill>
                ) : null}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                {t("book.total")}: <span className="font-semibold text-foreground">{money(booking.total, lang)}</span>
              </p>
              <AppLink to="/account/trips/$ref" params={{ ref: booking.ref }} className={btnClass("outline", "sm")}>
                {t("account.viewTrip")}
              </AppLink>
            </div>
          </Panel>
        </li>
          ))}
        </ul>
      )}
    </div>
  );
}

