import { createFileRoute } from "@tanstack/react-router";
import { Luggage, Plane, Search, Ticket } from "lucide-react";
import { useState } from "react";
import { AppLink, useAppNavigate } from "@/components/app-link";
import { btnClass, Container, EmptyState, Field, Input, PageHeader, Panel } from "@/components/kit";
import { pageHead } from "@/lib/head";
import { useI18n } from "@/lib/i18n";
import { openLegs, useStore } from "@/lib/store";

export const Route = createFileRoute("/{-$locale}/check-in")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/check-in",
      en: {
        title: "Online check-in — Palestinian Airlines from Gaza (GZA)",
        description:
          "Check in for your Palestinian Airlines flight from Gaza International Airport with your booking reference and family name.",
      },
      ar: {
        title: "تسجيل الوصول عبر الإنترنت — الخطوط الجوية الفلسطينية من غزة",
        description:
          "سجّل وصولك لرحلتك مع الخطوط الجوية الفلسطينية من مطار غزة الدولي باستخدام رقم الحجز واسم العائلة.",
      },
    }),
  component: CheckInEntryPage,
});

function CheckInEntryPage() {
  const { t } = useI18n();
  const navigate = useAppNavigate();
  const { findBooking } = useStore();
  const [ref, setRef] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "notFound" | "noneEligible">("idle");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = identifier.trim().toLowerCase();
    if (!value) {
      setError(t("manage.needIdentifier"));
      setStatus("idle");
      return;
    }
    setError(null);
    const found = findBooking(ref.trim());
    const matches =
      found?.passengers.some((p) => p.lastName.trim().toLowerCase() === value) ||
      found?.contact.email.trim().toLowerCase() === value;
    if (!found || !matches) {
      setStatus("notFound");
      return;
    }
    if (found.status !== "confirmed" || openLegs(found).length === 0) {
      setStatus("noneEligible");
      return;
    }
    setStatus("idle");
    void navigate({ to: "/manage/$ref/check-in", params: { ref: found.ref } });
  };

  return (
    <>
      <PageHeader title={t("ci.publicTitle")} description={t("ci.publicSub")} />

      <Container className="grid gap-8 py-10 lg:grid-cols-[1fr_1.2fr]">
        <form onSubmit={submit} className="surface h-fit p-5" noValidate>
          <div className="space-y-4">
            <Field label={t("manage.reference")} htmlFor="ci-pnr" hint="ABC123">
              <Input
                id="ci-pnr"
                value={ref}
                onChange={(e) => setRef(e.target.value.toUpperCase())}
                className="code-id tracking-[0.16em] uppercase"
                required
              />
            </Field>
            <Field
              label={t("manage.identifier")}
              htmlFor="ci-identifier"
              hint={t("manage.identifierHint")}
              {...(error ? { error } : {})}
            >
              <Input
                id="ci-identifier"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  setError(null);
                }}
                aria-invalid={error ? true : undefined}
                required
              />
            </Field>
            <button type="submit" className={btnClass("primary", "md", "w-full")}>
              <Search aria-hidden="true" className="size-4" />
              {t("ci.publicFind")}
            </button>
            <p className="text-xs text-muted-foreground">{t("ci.publicHint")}</p>
          </div>
        </form>

        <div className="space-y-4">
          {status === "notFound" ? (
            <EmptyState
              title={t("manage.notFound")}
              description={t("ci.notFoundHint")}
              action={
                <AppLink to="/manage" className={btnClass("outline", "md")}>
                  {t("ci.backToManage")}
                </AppLink>
              }
            />
          ) : status === "noneEligible" ? (
            <EmptyState
              title={t("ci.notAvailable")}
              description={t("ci.noneEligible")}
              action={
                <AppLink to="/manage" className={btnClass("outline", "md")}>
                  {t("ci.backToManage")}
                </AppLink>
              }
            />
          ) : (
            <Panel>
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("ci.title")}</h2>
              <ol className="mt-4 space-y-3 text-sm">
                <Line icon={Plane} label={t("ci.chooseLeg")} />
                <Line icon={Ticket} label={t("ci.choosePax")} />
                <Line icon={Luggage} label={t("ci.seats")} />
              </ol>
              <div className="mt-5 flex flex-wrap gap-2">
                <AppLink to="/manage" className={btnClass("outline", "sm")}>
                  {t("ci.backToManage")}
                </AppLink>
                <AppLink to="/travel" className={btnClass("ghost", "sm")}>
                  {t("nav.travel")}
                </AppLink>
              </div>
            </Panel>
          )}
        </div>
      </Container>
    </>
  );
}

function Line({ icon: Icon, label }: { icon: typeof Plane; label: string }) {
  return (
    <li className="flex items-start gap-3">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-clay" />
      <span>{label}</span>
    </li>
  );
}
