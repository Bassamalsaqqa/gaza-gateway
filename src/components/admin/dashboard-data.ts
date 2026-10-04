import { useMemo } from "react";
import { todayISO, type Flight } from "@/lib/data";
import { contentItems, type Permission } from "@/lib/admin";
import { useAdmin, type FlightOverride } from "@/lib/admin-store";
import { useI18n } from "@/lib/i18n";
import { useContactNewCount } from "@/lib/contact";
import { checkedInPax, seatedPassengers, type Booking } from "@/lib/domain/booking";
import { dailyBookingMetrics } from "@/lib/admin-flight-metrics";
import { useFlightsQuery, useBookingsQuery } from "@/lib/repositories";
import { dashboardReadState, dashboardMetric } from "@/lib/admin-dashboard-state";

export type OpsFlight = Flight & { direction: "dep" | "arr"; note?: string; revisedDepart?: string };

export type AttentionItem = {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  module: string;
  next: string;
  flightId?: string;
  permission: Permission;
};

/** Canonical flights/bookings/contact, with explicitly unmigrated compiled content fixtures. */
export function useDashboardData() {
  const { t } = useI18n();
  const bookingsQuery = useBookingsQuery();
  const commercialStatus = dashboardReadState(bookingsQuery);
  const { can } = useAdmin();
  const { data: newContactCount = 0 } = useContactNewCount();
  const today = todayISO();

  // Canonical flights from FlightRepository (overrides already composed)
  const departuresQuery = useFlightsQuery(today, "dep");
  const arrivalsQuery = useFlightsQuery(today, "arr");
  const operationsStatus = dashboardReadState(departuresQuery, arrivalsQuery);

  return useMemo(() => {
    // Unavailable arrays are only internal iteration guards, never successful zero metrics.
    const depFlights = operationsStatus === "ready" ? departuresQuery.data ?? [] : [];
    const arrFlights = operationsStatus === "ready" ? arrivalsQuery.data ?? [] : [];
    const rawBookings = commercialStatus === "ready" ? bookingsQuery.data ?? [] : [];
    const departures: OpsFlight[] = depFlights.map((f) => ({ ...f, direction: "dep" as const }));
    const arrivals: OpsFlight[] = arrFlights.map((f) => ({ ...f, direction: "arr" as const }));
    const operation = [...departures, ...arrivals].sort((a, b) =>
      (a.direction === "dep" ? a.departTime : a.arriveTime).localeCompare(
        b.direction === "dep" ? b.departTime : b.arriveTime,
      ),
    );

    const delayed = operation.filter((f) => f.status === "Delayed");
    const cancelled = operation.filter((f) => f.status === "Cancelled");
    const missingGate = operation.filter((f) => !f.gate || f.gate.trim() === "");

    const bookings = rawBookings;
    const daily = dailyBookingMetrics(bookings, today);

    const contentAttention = contentItems.filter((c) => c.state === "draft" || c.missingAr || c.missingSource).length;

    const allAttention: AttentionItem[] = [];
    for (const f of cancelled) {
      allAttention.push({
        id: `att-c-${f.id}`,
        severity: "high",
        title: t("adm.attn.cancelled", { flight: f.number }),
        module: t("adm.nav.flights"),
        next: t("adm.attn.cancelledNext"),
        flightId: f.id,
        permission: "ops.view",
      });
    }
    for (const f of delayed) {
      allAttention.push({
        id: `att-d-${f.id}`,
        severity: "high",
        title: t("adm.attn.delayed", { flight: f.number }),
        module: t("adm.nav.flights"),
        next: t("adm.attn.delayedNext"),
        flightId: f.id,
        permission: "ops.view",
      });
    }
    for (const f of missingGate) {
      allAttention.push({
        id: `att-g-${f.id}`,
        severity: "medium",
        title: t("adm.attn.gate", { flight: f.number }),
        module: t("adm.nav.flights"),
        next: t("adm.attn.gateNext"),
        flightId: f.id,
        permission: "ops.view",
      });
    }
    for (const { booking: b, leg, flight } of daily.travelling) {
      if (checkedInPax(b, leg).length < seatedPassengers(b).length) {
        allAttention.push({
          id: `att-ci-${b.ref}-${leg}`,
          severity: "medium",
          title: t("adm.attn.checkin", { flight: flight.number }),
          module: t("adm.nav.checkin"),
          next: t("adm.attn.checkinNext"),
          permission: "commercial.view",
        });
      }
    }
    if (newContactCount > 0) {
      allAttention.push({
        id: "att-inbox",
        severity: "medium",
        title: t("adm.attn.enquiry", { n: newContactCount }),
        module: t("adm.nav.inbox"),
        next: t("adm.attn.enquiryNext"),
        permission: "engagement.view",
      });
    }
    for (const c of contentItems) {
      if (c.missingAr) {
        allAttention.push({
          id: `att-ar-${c.id}`,
          severity: "medium",
          title: `${t("adm.attn.arabic")} — ${t(c.titleKey)}`,
          module: t(c.module),
          next: t("adm.attn.arabicNext"),
          permission: "content.view",
        });
      }
      if (c.missingSource) {
        allAttention.push({
          id: `att-src-${c.id}`,
          severity: "low",
          title: `${t("adm.attn.source")} — ${t(c.titleKey)}`,
          module: t(c.module),
          next: t("adm.attn.sourceNext"),
          permission: "content.view",
        });
      }
      if (c.state === "draft") {
        allAttention.push({
          id: `att-dr-${c.id}`,
          severity: "low",
          title: `${t("adm.attn.draft")} — ${t(c.titleKey)}`,
          module: t(c.module),
          next: t("adm.attn.draftNext"),
          permission: "content.view",
        });
      }
    }

    const attention = allAttention.filter((item) => can(item.permission));

    const recent: Booking[] = daily.recent;

    return {
      today,
      operationsStatus,
      commercialStatus,
      bookings,
      operation,
      departures,
      arrivals,
      delayed,
      cancelled,
      metrics: {
        departures: dashboardMetric(operationsStatus, departures.length),
        arrivals: dashboardMetric(operationsStatus, arrivals.length),
        bookingsToday: dashboardMetric(commercialStatus, daily.bookingsToday),
        passengersTravelling: dashboardMetric(commercialStatus, daily.passengersTravelling),
        passengersCheckedIn: dashboardMetric(commercialStatus, daily.passengersCheckedIn),
        delayed: dashboardMetric(operationsStatus, delayed.length),
        cancelled: dashboardMetric(operationsStatus, cancelled.length),
        enquiries: newContactCount,
        contentAttention,
      },
      attention,
      recent,
      content: {
        drafts: contentItems.filter((c) => c.state === "draft").length,
        missingAr: contentItems.filter((c) => c.missingAr).length,
        awaitingSource: contentItems.filter((c) => c.missingSource).length,
        published: contentItems.filter((c) => c.state === "published").length,
        items: contentItems,
      },
    };
  }, [today, bookingsQuery.data, departuresQuery.data, arrivalsQuery.data, operationsStatus, commercialStatus, t, can, newContactCount]) satisfies { attention: AttentionItem[] } & Record<string, unknown>;
}

export type { FlightOverride };
