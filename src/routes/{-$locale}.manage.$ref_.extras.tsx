import { commercialErrorKey, commercialFieldErrors } from "@/lib/domain/commercial-errors";
import { resolveBookingPricing, serviceOptions } from "@/lib/commercial/pricing";
import { useCommercialOptions } from "@/lib/commercial/queries";
import { CommercialCatalogState } from "@/components/commercial-catalog-state";
import { Checkbox } from "@/components/ui/checkbox";
import { Select as UiSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLink, useAppNavigate } from "@/components/app-link";
import { Container, EmptyState, Field, GazaLoadingState, PageHeader, Panel, btnClass } from "@/components/kit";

import { money } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/head";
import { totalExtraBags } from "@/lib/booking-draft";
import { bookingTotal } from "@/lib/domain/pricing";
import { emptyPaxExtras, extrasForPassengers } from "@/lib/booking-draft/factories";
import type { Extras, PaxExtras } from "@/lib/booking-draft/types";
import { useBookingQuery, useUpdateBookingExtrasMutation } from "@/lib/repositories/queries";

export const Route = createFileRoute("/{-$locale}/manage/$ref_/extras")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: `/manage/${params.ref}/extras`,
      noindex: true,
      en: {
        title: `Bags and extras — booking ${params.ref} — Gaza International Airport (GZA)`,
        description: "Add extra baggage, choose a meal and request assistance for each traveller on your booking.",
      },
      ar: {
        title: `الأمتعة والإضافات — الحجز ${params.ref} — مطار غزة الدولي`,
        description: "أضف أمتعة إضافية واختر وجبة واطلب المساعدة لكل مسافر في حجزك.",
      },
    }),
  component: ManageExtrasPage,
});

function ManageExtrasPage() {
  const { ref } = Route.useParams();
  const { t, lang } = useI18n();
  const commercial = useCommercialOptions();
  const { mealOptions, assistanceOptions } = commercial;
  const navigate = useAppNavigate();
  const { data: booking, isLoading } = useBookingQuery(ref);
  const updateExtrasMutation = useUpdateBookingExtrasMutation();

  const [extras, setExtras] = useState<Extras>({ pax: [emptyPaxExtras()] });
  const [fieldErrors, setFieldErrors] = useState<Record<string,string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (booking) {
      setExtras(extrasForPassengers(booking.extras, booking.passengers.length));
    }
  }, [booking]);

  if (isLoading) {
    return (
      <Container className="py-16">
        <GazaLoadingState />
      </Container>
    );
  }

  if (!booking) {
    return (
      <Container className="py-16">
        <EmptyState
          title={t("manage.notFound")}
          description={t("conf.notFoundSub")}
          action={
            <AppLink to="/manage" className={btnClass("primary", "md")}>
              {t("nav.manage")}
            </AppLink>
          }
        />
      </Container>
    );
  }

  if (booking.status === "cancelled") {
    return (
      <Container className="py-16">
        <EmptyState
          title={t("manage.notEditable")}
          description={t("ci.cancelledNote")}
          action={
            <AppLink to="/manage/$ref" params={{ ref: booking.ref }} className={btnClass("primary", "md")}>
              {t("manage.backToBooking")}
            </AppLink>
          }
        />
      </Container>
    );
  }

  if (!commercial.catalog || commercial.query.isError) return <CommercialCatalogState />;
  const basis = resolveBookingPricing(booking);
  const totals = bookingTotal({
    outbound: booking.outbound,
    inbound: booking.inbound,
    fareId: booking.fareId,
    criteria: booking.criteria,
    seats: booking.seats,
    extras,
  }, basis);

  const setPax = (index: number, patch: Partial<PaxExtras>) =>
    setExtras((prev) => ({
      pax: prev.pax.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));

  const save = async () => {
    try {
      setSaveError(null); setFieldErrors({});
      await updateExtrasMutation.mutateAsync({ ref: booking.ref, extras });
      void navigate({ to: "/manage/$ref", params: { ref: booking.ref } });
    } catch (error) {
      setSaveError(t(commercialErrorKey(error)));
      setFieldErrors(commercialFieldErrors(error));
      requestAnimationFrame(()=>document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
    }
  };

  return (
    <Container className="py-8 sm:py-12">
      <PageHeader
        eyebrow={t("nav.manage")}
        title={t("manage.extrasTitle")}
        description={t("manage.extrasSub", { ref: booking.ref })}
      />

      <Panel className="mt-6">
        <p className="text-sm text-muted-foreground">{t("book.extrasPaxNote")}</p>

        <ul className="mt-4 divide-y divide-border">
          {booking.passengers.map((passenger, index) => {
            const value = extras.pax[index] ?? emptyPaxExtras();
            const label =
              `${passenger.firstName} ${passenger.lastName}`.trim() || `${t("book.passenger")} ${index + 1}`;
            return (
              <li key={`pax-extras-${index}`} className="py-4 first:pt-0">
                <h2 className="text-sm font-bold">{label}</h2>

                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <fieldset>
                    <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("book.bagsFor")} · {money(basis.extraBagPrice, lang)}
                    </legend>
                    <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`${t("book.extraBag")} — ${label}`}>
                      {[0, 1, 2, 3, 4].map((count) => {
                        const isSelected = value.extraBags === count;
                        return (
                          <button
                            key={count}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => setPax(index, { extraBags: count })}
                            className={cn(
                              "min-h-11 min-w-11 rounded-xl border px-4 text-sm font-semibold transition-colors cursor-pointer select-none",
                              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                              isSelected
                                ? "border-primary bg-primary text-primary-foreground shadow-xs"
                                : "border-input bg-card text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                            )}
                          >
                            <span className="numeral font-mono tabular-nums">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>

                  <Field label={t("book.meal")} htmlFor={`meal-${index}`} error={fieldErrors[`pax.${index}.meal`] ? t(fieldErrors[`pax.${index}.meal`]!) : undefined} errorId={`meal-${index}-error`}>
                    <UiSelect
                      value={value.meal}
                      onValueChange={(m) => setPax(index, { meal: m })}
                      dir={lang === "ar" ? "rtl" : "ltr"}
                    >
                      <SelectTrigger aria-invalid={fieldErrors[`pax.${index}.meal`] ? true : undefined} aria-describedby={fieldErrors[`pax.${index}.meal`] ? `meal-${index}-error` : undefined} id={`meal-${index}`} className="h-11 rounded-lg bg-card">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {serviceOptions(mealOptions, [booking.extras.pax[index]?.meal ?? ""]).map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {pick(lang, option.label)}{!option.active ? ` ? ${t("commercial.retired")}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </UiSelect>
                  </Field>
                </div>

                <fieldset className="mt-3">
                  <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("book.assistance")}
                  </legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {serviceOptions(assistanceOptions, booking.extras.pax[index]?.assistance ?? []).map((option) => {
                      const checked = value.assistance.includes(option.id);
                      const checkId = `assistance-${index}-${option.id}`;
                      return (
                        <label
                          key={option.id}
                          htmlFor={checkId}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 text-sm transition-colors select-none",
                            checked
                              ? "border-primary bg-brand-soft/50 font-medium"
                              : "border-input bg-card hover:bg-secondary/30",
                          )}
                        >
                          <Checkbox
                            id={checkId}
                            className="size-5"
                            checked={checked}
                            onCheckedChange={(next) =>
                              setPax(index, {
                                assistance:
                                  next === true
                                    ? [...value.assistance, option.id]
                                    : value.assistance.filter((id) => id !== option.id),
                              })
                            }
                          />
                          <span>{pick(lang, option.label)}{!option.active ? ` ? ${t("commercial.retired")}` : ""}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </li>
            );
          })}
        </ul>

        <p className="mt-4 text-xs text-muted-foreground">{t("book.assistanceNote")}</p>

        <dl className="mt-6 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex items-baseline justify-between">
            <dt className="text-muted-foreground">{t("book.extraBag")}</dt>
            <dd className="numeral font-semibold">{totalExtraBags(extras)}</dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="text-muted-foreground">{t("book.extrasTotal")}</dt>
            <dd className="font-semibold">{money(totals.extras, lang)}</dd>
          </div>
          <div className="flex items-baseline justify-between text-base">
            <dt className="font-bold">{t("book.total")}</dt>
            <dd className="font-bold">{money(totals.total, lang)}</dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={updateExtrasMutation.isPending}
            className={btnClass("primary", "md")}
          >
            {t("common.save")}
          </button>
          <AppLink to="/manage/$ref" params={{ ref: booking.ref }} className={btnClass("secondary", "md")}>
            {t("common.cancel")}
          </AppLink>
        </div>
        {saveError ? (
          <p role="alert" className="mt-2 text-sm font-semibold text-destructive">
            {saveError}
          </p>
        ) : null}
      </Panel>
    </Container>
  );
}
