import { previewBookingTotal, resolvePreviewSeatLayouts } from "@/lib/commercial/pricing";
import { useCommercialOptions } from "@/lib/commercial/queries";
import { CommercialCatalogState } from "@/components/commercial-catalog-state";
import { ArrowRight } from "lucide-react";
import { Code } from "@/components/kit";
import { airportByCode, type Flight } from "@/lib/data";
import { money, dateShort } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import { paxCount, type Draft } from "@/lib/store";
import { useSurfaceRecipe, GazaSurface, SurfaceIndex } from "@/design/surfaces";
import { useFleetQuery } from "@/lib/fleet";
import { useMemo } from "react";

export function PriceSummary({ draft, compact = false }: { draft: Draft; compact?: boolean }) {
  const { t, lang } = useI18n();
  const commercial = useCommercialOptions();
  const fleetQuery = useFleetQuery();
  const { fares } = commercial;
  const { active } = useSurfaceRecipe("dossier");

  const seatLayouts = useMemo(
    () => resolvePreviewSeatLayouts(draft.outbound, draft.inbound, fleetQuery.isError ? undefined : fleetQuery.data),
    [draft.outbound, draft.inbound, fleetQuery.data, fleetQuery.isError],
  );

  const totals = previewBookingTotal(draft, commercial.catalogSnapshot, seatLayouts);
  if (!totals || commercial.query.isError) return <><CommercialCatalogState />{commercial.catalog ? <p role="alert">{t("commercial.error.fare_unavailable")}</p> : null}</>;
  if (draft.outbound && (fleetQuery.isPending || fleetQuery.isError || !seatLayouts)) {
    return <p role={fleetQuery.isPending ? "status" : "alert"} className="p-4 text-sm text-muted-foreground">{t(fleetQuery.isPending ? "common.loading" : "fleet.error.unavailable")}</p>;
  }
  const fare = fares.find((f) => f.id === draft.fareId);

  return (
    <GazaSurface
      family="dossier"
      target="booking.trip-summary"
      as="aside"
      className={compact ? "p-1" : "sticky top-24 p-5"}
      aria-label={t("book.summary")}
    >
      {compact ? null : (
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("book.summary")}</h2>
          {active ? <SurfaceIndex code="MANIFEST" accent="brand" /> : null}
        </div>
      )}

      <div className="mt-4 space-y-4">
        {draft.outbound ? <Leg flight={draft.outbound} label={t("book.outbound")} /> : null}
        {draft.inbound ? <Leg flight={draft.inbound} label={t("book.inbound")} /> : null}
      </div>

      <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
        <Row label={t("search.passengers")} value={String(paxCount(draft.criteria))} />
        <Row label={t("search.cabin")} value={t(`cabin.${draft.criteria.cabin}`)} />
        {fare ? <Row label={t("step.fare")} value={pick(lang, fare.name)} /> : null}
        <Row label={t("book.fareTotal")} value={money(totals.fare, lang)} />
        <Row label={t("book.taxes")} value={money(totals.taxes, lang)} />
        <Row label={t("book.extrasTotal")} value={money(totals.extras, lang)} />
      </dl>

      <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
        <span className="text-sm font-semibold">{t("book.total")}</span>
        <span className="text-2xl font-bold">{money(totals.total, lang)}</span>
      </div>
    </GazaSurface>
  );
}

function Leg({ flight, label }: { flight: Flight; label: string }) {
  const { lang } = useI18n();
  const from = airportByCode(flight.originCode);
  const to = airportByCode(flight.destinationCode);
  return (
    <div className="rounded-lg bg-sand p-3">
      <p className="eyebrow text-clay">{label}</p>
      <p className="mt-1.5 text-sm font-semibold flex items-center gap-1.5">
        <span>{from ? pick(lang, from.city) : flight.originCode}</span>
        <ArrowRight aria-hidden="true" className="size-3.5 rtl:rotate-180 text-muted-foreground shrink-0" />
        <span>{to ? pick(lang, to.city) : flight.destinationCode}</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {dateShort(flight.date, lang)} · <span className="code-id" dir="ltr">{flight.departTime}</span> ·{" "}
        <Code dir="ltr">{flight.number}</Code>
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
