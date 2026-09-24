import { ArrowLeft, ArrowRight, Check, Luggage, Plane, ShieldCheck, Ticket, User, UtensilsCrossed } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { btnClass, Code, Eyebrow, Notice } from "@/components/kit";
import {
  airportByCode,
  assistanceOptions,
  fares,
  mealOptions,
  type Flight,
} from "@/lib/data";
import { dateLong, money } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import {
  extrasFor,
  totalExtraBags,
  type Draft,
  type Passenger,
} from "@/lib/store";
import type { BookingStep } from "@/components/booking/stepper";
import { cn } from "@/lib/utils";
import { GazaSurface, SurfaceIndex } from "@/design/surfaces";

export interface ReviewStepProps {
  draft: Draft;
  paxList: Passenger[];
  totals: { fare: number; taxes: number; extras: number; total: number };
  onGoToStep: (step: BookingStep) => void;
  onConfirm: () => void;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
}

export function ReviewStep({
  draft,
  paxList,
  totals,
  onGoToStep,
  onConfirm,
  headingRef,
}: ReviewStepProps) {
  const { t, lang } = useI18n();

  const legs = [
    { type: "outbound" as const, flight: draft.outbound },
    { type: "inbound" as const, flight: draft.inbound },
  ].filter((l): l is { type: "outbound" | "inbound"; flight: Flight } => Boolean(l.flight));

  const fareObj = fares.find((f) => f.id === draft.fareId);

  return (
    <section aria-labelledby="review-title" className="space-y-6">
      {/* Step Header */}
      <div>
        <Eyebrow>{t("step.review")}</Eyebrow>
        <h1
          id="review-title"
          ref={headingRef}
          tabIndex={-1}
          className="mt-2 text-2xl font-bold sm:text-3xl outline-none text-foreground"
        >
          {t("book.reviewTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("book.reviewSub")}</p>
      </div>

      {/* Unified Travel Dossier Document */}
      <GazaSurface
        family="dossier"
        className="rounded-2xl border border-border bg-card shadow-[var(--shadow-lift)] overflow-hidden divide-y divide-border"
      >
        {/* Dossier Header Banner */}
        <div className="bg-sand/70 px-5 py-3.5 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-brand" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">
              {t("book.dossierTitle")}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {draft.criteria.cabin ? t(`cabin.${draft.criteria.cabin}`) : ""}
            {fareObj ? ` · ${pick(lang, fareObj.name)}` : ""}
          </span>
        </div>

        {/* 1. Itinerary / Flights Section (Leading Section) */}
        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Plane className="size-4 text-brand-deep" aria-hidden="true" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                {t("book.itinerary")}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onGoToStep("results")}
              className="text-xs font-semibold text-brand-deep hover:underline cursor-pointer"
            >
              {t("common.edit")}
            </button>
          </div>

          <div className="space-y-4">
            {legs.map(({ type, flight }, idx) => {
              const from = airportByCode(flight.originCode);
              const to = airportByCode(flight.destinationCode);

              return (
                <div
                  key={`${flight.id}-${type}`}
                  className="rounded-xl border border-border bg-sand/35 p-4 sm:p-5"
                >
                  <div className="flex items-center justify-between text-xs text-clay font-bold uppercase tracking-wider mb-2">
                    <span>{t(type === "outbound" ? "book.outbound" : "book.inbound")}</span>
                    <span dir="ltr" className="code-id font-bold text-foreground">
                      {flight.number}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                    {/* Departure */}
                    <div>
                      <span className="block text-xl font-bold text-foreground" dir="ltr">
                        {flight.departTime}
                      </span>
                      <span className="block text-sm font-semibold text-foreground">
                        {from ? pick(lang, from.city) : flight.originCode}{" "}
                        <span className="code-id text-xs text-muted-foreground">({flight.originCode})</span>
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {dateLong(flight.date, lang)}
                      </span>
                    </div>

                    {/* Flight Visual Line */}
                    <div className="hidden sm:flex flex-col items-center justify-center text-center px-2">
                      <span className="text-[11px] text-muted-foreground">{flight.aircraft}</span>
                      <div className="w-full flex items-center my-1 text-muted-foreground/60">
                        <span className="size-1.5 rounded-full bg-border" />
                        <span className="h-px flex-1 bg-border" />
                        <Plane className="size-3.5 mx-1 text-brand-deep rtl:-scale-x-100" />
                        <span className="h-px flex-1 bg-border" />
                        <span className="size-1.5 rounded-full bg-border" />
                      </div>
                      <span className="text-[11px] font-medium text-brand-deep">
                        {t("book.nonstop")}
                      </span>
                    </div>

                    {/* Arrival */}
                    <div className="sm:text-end">
                      <span className="block text-xl font-bold text-foreground" dir="ltr">
                        {flight.arriveTime}
                      </span>
                      <span className="block text-sm font-semibold text-foreground">
                        {to ? pick(lang, to.city) : flight.destinationCode}{" "}
                        <span className="code-id text-xs text-muted-foreground">({flight.destinationCode})</span>
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {dateLong(flight.date, lang)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. Passengers & Assigned Seats */}
        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="size-4 text-brand-deep" aria-hidden="true" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                {t("book.passengerSummary")}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onGoToStep("passengers")}
                className="text-xs font-semibold text-brand-deep hover:underline cursor-pointer"
              >
                {t("common.edit")}
              </button>
            </div>
          </div>

          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {paxList.map((p, i) => {
              const outSeat = draft.seats[`out-${i}`];
              const inSeat = draft.seats[`in-${i}`];

              return (
                <div
                  key={i}
                  className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:px-4 text-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-xs font-bold text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="font-semibold text-foreground">
                      {`${p.firstName} ${p.lastName}`.trim() || `${t("book.passenger")} ${i + 1}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({p.type === "child" ? t("book.child") : p.type === "infant" ? t("book.infant") : t("book.adult")})
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t("book.seatsLabel")}:</span>
                      <span className="code-id font-bold text-foreground">
                        {outSeat ? outSeat : "—"}
                        {draft.inbound ? ` / ${inSeat ? inSeat : "—"}` : ""}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onGoToStep("seats")}
                      className="text-xs text-brand-deep hover:underline cursor-pointer"
                    >
                      {t("manage.changeSeats")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Selected Extras & Meals */}
        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Luggage className="size-4 text-brand-deep" aria-hidden="true" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                {t("step.extras")}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onGoToStep("extras")}
              className="text-xs font-semibold text-brand-deep hover:underline cursor-pointer"
            >
              {t("common.edit")}
            </button>
          </div>

          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {paxList.map((p, i) => {
              const extras = extrasFor(draft.extras, i);
              const mealObj = mealOptions.find((m) => m.id === extras.meal);
              const label = `${p.firstName} ${p.lastName}`.trim() || `${t("book.passenger")} ${i + 1}`;

              return (
                <div key={i} className="p-3.5 sm:px-4 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">{label}</span>
                    <span className="text-xs text-muted-foreground">
                      {extras.extraBags > 0
                        ? `${extras.extraBags} × ${t("book.extraBag")} (${money(extras.extraBags * 45, lang)})`
                        : t("book.cabinBagOnly")}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {t("book.meal")}:{" "}
                      <strong className="text-foreground font-medium">
                        {mealObj ? pick(lang, mealObj.label) : "—"}
                      </strong>
                    </span>

                    {extras.assistance.length > 0 ? (
                      <span>
                        {t("book.assistance")}:{" "}
                        <strong className="text-brand-deep font-medium">
                          {extras.assistance
                            .map((id) =>
                              pick(lang, assistanceOptions.find((a) => a.id === id)?.label ?? { en: id, ar: id }),
                            )
                            .join(", ")}
                        </strong>
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. Contact Information */}
        <div className="p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              {t("book.contact")}
            </h2>
            <button
              type="button"
              onClick={() => onGoToStep("passengers")}
              className="text-xs font-semibold text-brand-deep hover:underline cursor-pointer"
            >
              {t("common.edit")}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-border bg-card p-3.5 text-sm">
            <div>
              <span className="block text-xs text-muted-foreground">{t("book.email")}</span>
              <span className="code-id font-semibold text-foreground" dir="ltr">
                {draft.contact.email || "—"}
              </span>
            </div>
            <div>
              <span className="block text-xs text-muted-foreground">{t("book.phone")}</span>
              <span className="code-id font-semibold text-foreground" dir="ltr">
                {draft.contact.phone || "—"}
              </span>
            </div>
          </div>
        </div>

        {/* 5. Pricing Breakdown & Final Confirmation */}
        <div className="p-5 sm:p-6 bg-sand/40 space-y-5">
          <dl className="space-y-2 text-sm">
            <div className="flex items-baseline justify-between">
              <dt className="text-muted-foreground">{t("book.fareTotal")}</dt>
              <dd className="font-semibold text-foreground tabular-nums">{money(totals.fare, lang)}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-muted-foreground">{t("book.taxes")}</dt>
              <dd className="font-semibold text-foreground tabular-nums">{money(totals.taxes, lang)}</dd>
            </div>
            {totals.extras > 0 ? (
              <div className="flex items-baseline justify-between">
                <dt className="text-muted-foreground">{t("book.extrasTotal")}</dt>
                <dd className="font-semibold text-foreground tabular-nums">{money(totals.extras, lang)}</dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between border-t border-border/80 pt-3 text-base sm:text-lg font-bold">
              <dt className="text-foreground">{t("book.total")}</dt>
              <dd className="text-2xl font-bold text-foreground tabular-nums">
                {money(totals.total, lang)}
              </dd>
            </div>
          </dl>

          {/* Prototype Disclosure Notice */}
          <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
            <p className="flex items-start gap-2">
              <ShieldCheck className="size-4 shrink-0 text-brand-deep mt-0.5" aria-hidden="true" />
              <span>{t("book.prototypeNotice")}</span>
            </p>
          </div>

          {/* Action Row */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => onGoToStep("extras")}
              className={btnClass("outline", "md")}
            >
              <ArrowLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
              {t("book.back")}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={btnClass("primary", "lg", "shadow-[var(--shadow-soft)] hover:shadow-md")}
            >
              <span>{t("book.confirm")}</span>
              <span className="mx-1.5 opacity-60">·</span>
              <span className="tabular-nums">{money(totals.total, lang)}</span>
            </button>
          </div>
        </div>
      </GazaSurface>
    </section>
  );
}
