import { useMemo } from "react";
import { arrivalsOn, departuresOn, todayISO, type Flight } from "@/lib/data";
import { contentItems, unreadEnquiries, type Permission } from "@/lib/admin";
import { useAdmin, type FlightOverride } from "@/lib/admin-store";
import { useI18n } from "@/lib/i18n";
import { checkedInPax, seatedPassengers, useStore, type Booking } from "@/lib/store";

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

/** Everything the dashboard and the top-bar indicator derive from mock data. */
export function useDashboardData() {
  const { t } = useI18n();
  const { bookings } = useStore();
  const { withOverride, can } = useAdmin();
  const today = todayISO();

  return useMemo(() => {
    const departures: OpsFlight[] = departuresOn(today).map((f) => ({ ...withOverride(f), direction: "dep" as const }));
    const arrivals: OpsFlight[] = arrivalsOn(today).map((f) => ({ ...withOverride(f), direction: "arr" as const }));
    const operation = [...departures, ...arrivals].sort((a, b) =>
      (a.direction === "dep" ? a.departTime : a.arriveTime).localeCompare(
        b.direction === "dep" ? b.departTime : b.arriveTime,
      ),
    );

    const delayed = operation.filter((f) => f.status === "Delayed");
    const cancelled = operation.filter((f) => f.status === "Cancelled");
    const missingGate = operation.filter((f) => !f.gate || f.gate.trim() === "");

    const bookingsToday = bookings.filter((b) => b.createdAt.slice(0, 10) === today);
    const travellingToday = bookings.filter((b) => b.status !== "cancelled" && b.outbound.date === today);
    const passengersTravelling = travellingToday.reduce((n, b) => n + seatedPassengers(b).length, 0);
    const passengersCheckedIn = travellingToday.reduce((n, b) => n + checkedInPax(b, "out").length, 0);

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
    for (const b of travellingToday) {
      if (checkedInPax(b, "out").length < seatedPassengers(b).length) {
        allAttention.push({
          id: `att-ci-${b.ref}`,
          severity: "medium",
          title: t("adm.attn.checkin", { flight: b.outbound.number }),
          module: t("adm.nav.checkin"),
          next: t("adm.attn.checkinNext"),
          permission: "commercial.view",
        });
      }
    }
    if (unreadEnquiries > 0) {
      allAttention.push({
        id: "att-inbox",
        severity: "medium",
        title: t("adm.attn.enquiry", { n: unreadEnquiries }),
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

    const recent: Booking[] = [...bookings].slice(0, 6);

    return {
      today,
      operation,
      departures,
      arrivals,
      delayed,
      cancelled,
      metrics: {
        departures: departures.length,
        arrivals: arrivals.length,
        bookingsToday: bookingsToday.length,
        passengersTravelling,
        passengersCheckedIn,
        delayed: delayed.length,
        cancelled: cancelled.length,
        enquiries: unreadEnquiries,
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
  }, [today, bookings, withOverride, t, can]) satisfies { attention: AttentionItem[] } & Record<string, unknown>;
}

export type { FlightOverride };
