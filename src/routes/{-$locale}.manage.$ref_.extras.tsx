import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLink, useAppNavigate } from "@/components/app-link";
import { btnClass, Code, Container, EmptyState, Field, PageHeader, Panel, Select } from "@/components/kit";
import { EXTRA_BAG_PRICE, assistanceOptions, mealOptions } from "@/lib/data";
import { money } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import { bookingTotal, type Extras, useStore } from "@/lib/store";

export const Route = createFileRoute("/{-$locale}/manage/$ref_/extras")({
  head: ({ params }) => ({
    meta: [
      { title: `Bags and extras — booking ${params.ref} — Gaza International Airport (GZA)` },
      {
        name: "description",
        content: "Add extra baggage, choose a meal and request special assistance for your Palestinian Airlines booking.",
      },
      { property: "og:title", content: "Bags and extras — Palestinian Airlines" },
      { property: "og:description", content: "Update the baggage, meal and assistance on your booking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
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
    booking?.extras ?? { extraBags: 0, meal: "none", assistance: [] },
  );

  if (!ready) {
    return (
      <Container className="py-16">
        <p className="text-sm text-muted-foreground">…</p>
      </Container>
    );
  }

  if (!booking) {
    return (
      <Container className="py-16">
        <EmptyState
          title={t("manage.notFound")}
          body={t("conf.notFoundSub")}
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
          body={t("ci.cancelledNote")}
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

  const save = () => {
    updateBooking(booking.ref, { extras, total: totals.total });
    void navigate({ to: "/manage/$ref", params: { ref: booking.ref } });
  };

  return (
    <Container className="py-8 sm:py-12">
      <PageHeader
        eyebrow={<Code>{booking.ref}</Code>}
        title={t("manage.extrasTitle")}
        subtitle={t("manage.extrasSub", { ref: booking.ref })}
      />

      <Panel className="mt-6">
        <fieldset>
          <legend className="text-sm font-bold">{t("book.extraBag")}</legend>
          <p className="mt-1 text-sm text-muted-foreground">{money(EXTRA_BAG_PRICE, lang)}</p>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t("book.extraBag")}>
            {[0, 1, 2, 3, 4].map((count) => (
              <button
                key={count}
                type="button"
                aria-pressed={extras.extraBags === count}
                onClick={() => setExtras((prev) => ({ ...prev, extraBags: count }))}
                className={
                  extras.extraBags === count
                    ? "min-w-11 rounded-full border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                    : "min-w-11 rounded-full border border-input bg-card px-4 py-2 text-sm font-semibold text-muted-foreground"
                }
              >
                <span className="numeral">{count}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-6 max-w-sm">
          <Field label={t("book.meal")} htmlFor="meal">
            <Select
              id="meal"
              value={extras.meal}
              onChange={(e) => setExtras((prev) => ({ ...prev, meal: e.target.value }))}
            >
              {mealOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {pick(lang, option.label)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <fieldset className="mt-6">
          <legend className="text-sm font-bold">{t("book.assistance")}</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {assistanceOptions.map((option) => (
              <label key={option.id} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="size-5 rounded border-input accent-[var(--color-primary)]"
                  checked={extras.assistance.includes(option.id)}
                  onChange={(e) =>
                    setExtras((prev) => ({
                      ...prev,
                      assistance: e.target.checked
                        ? [...prev.assistance, option.id]
                        : prev.assistance.filter((id) => id !== option.id),
                    }))
                  }
                />
                {pick(lang, option.label)}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("book.assistanceNote")}</p>
        </fieldset>

        <dl className="mt-6 space-y-2 border-t border-border pt-4 text-sm">
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
