import { Checkbox } from "@/components/ui/checkbox";
import { Select as UiSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLink, useAppNavigate } from "@/components/app-link";
import { Container, EmptyState, Field, GazaLoadingState, PageHeader, Panel, Select, btnClass } from "@/components/kit";
import { EXTRA_BAG_PRICE, assistanceOptions, mealOptions } from "@/lib/data";
import { money } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/head";
import {
  bookingTotal,
  emptyPaxExtras,
  extrasForPassengers,
  totalExtraBags,
  type Extras,
  type PaxExtras,
  useStore,
} from "@/lib/store";

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
  const navigate = useAppNavigate();
  const { ready, findBooking, updateBooking } = useStore();
  const booking = findBooking(ref);
  const [extras, setExtras] = useState<Extras>(
    booking
      ? extrasForPassengers(booking.extras, booking.passengers.length)
      : { pax: [emptyPaxExtras()] },
  );

  if (!ready) {
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

  const totals = bookingTotal({
    outbound: booking.outbound,
    inbound: booking.inbound,
    fareId: booking.fareId,
    criteria: booking.criteria,
    seats: booking.seats,
    extras,
  });

  const setPax = (index: number, patch: Partial<PaxExtras>) =>
    setExtras((prev) => ({
      pax: prev.pax.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));

  const save = () => {
    updateBooking(booking.ref, { extras, total: totals.total });
    void navigate({ to: "/manage/$ref", params: { ref: booking.ref } });
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
                      {t("book.bagsFor")} · {money(EXTRA_BAG_PRICE, lang)}
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

                  <Field label={t("book.meal")} htmlFor={`meal-${index}`}>
                    <UiSelect
                      value={value.meal}
                      onValueChange={(m) => setPax(index, { meal: m })}
                      dir={lang === "ar" ? "rtl" : "ltr"}
                    >
                      <SelectTrigger id={`meal-${index}`} className="h-11 rounded-lg bg-card">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {mealOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {pick(lang, option.label)}
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
                    {assistanceOptions.map((option) => {
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
                          <span>{pick(lang, option.label)}</span>
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
          <button type="button" onClick={save} className={btnClass("primary", "md")}>
            {t("common.save")}
          </button>
          <AppLink to="/manage/$ref" params={{ ref: booking.ref }} className={btnClass("secondary", "md")}>
            {t("common.cancel")}
          </AppLink>
        </div>
      </Panel>
    </Container>
  );
}
