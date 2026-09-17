import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { Field, Input, Select, btnClass } from "@/components/kit";
import { AdminChip, AdminPageHeader, AdminPanel, Ltr, PermissionButton } from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import { destinations, fares } from "@/lib/data";
import { money } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/{-$locale}/admin/bookings/new")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/bookings/new",
      en: { title: "Create booking — Gaza International Airport administration", description: "Staff booking shell for helping a passenger at the desk." },
      ar: { title: "إنشاء حجز — إدارة مطار غزة الدولي", description: "نموذج حجز للموظفين لمساعدة المسافر على المكتب." },
      noindex: true,
    }),
  component: AdminNewBookingPage,
});

const STEPS = ["a2.nb.step1", "a2.nb.step2", "a2.nb.step3", "a2.nb.step4", "a2.nb.step5"] as const;

const mockFlights = [
  { id: "n1", number: "PS100", dest: "AMM", depart: "08:10", arrive: "09:25", price: 289 },
  { id: "n2", number: "PS106", dest: "IST", depart: "11:35", arrive: "14:40", price: 412 },
  { id: "n3", number: "PS108", dest: "DOH", depart: "14:50", arrive: "19:05", price: 468 },
];

function AdminNewBookingPage() {
  const { t, lang } = useI18n();
  const { can, toast } = useAdmin();
  const [step, setStep] = useState(0);
  const [flight, setFlight] = useState(mockFlights[0]!.id);
  const [fare, setFare] = useState(fares[0]?.id ?? "essential");
  const [paxCount, setPaxCount] = useState(1);
  const [done, setDone] = useState(false);

  const mayEdit = can("commercial.edit");
  const chosen = mockFlights.find((f) => f.id === flight)!;
  const chosenFare = fares.find((f) => f.id === fare);

  if (!can("commercial.view")) return <AdminDenied area={t("a2.nb.title")} permission="commercial.view" />;

  if (done) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={t("a2.nb.title")} description={t("a2.mock")} />
        <AdminPanel>
          <div className="mx-auto max-w-md text-center">
            <span className="inline-flex size-10 items-center justify-center rounded-md bg-brand-soft text-brand-deep">
              <Check aria-hidden="true" className="size-5" />
            </span>
            <h2 className="mt-3 text-lg font-bold">{t("a2.nb.successTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("a2.nb.successBody")}</p>
            <p className="mt-3">
              <Ltr className="text-xl font-bold">GZA-NEW1</Ltr>
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDone(false);
                  setStep(0);
                }}
                className={btnClass("primary", "sm")}
              >
                {t("a2.nb.another")}
              </button>
              <AppLink to="/admin/bookings" className={btnClass("outline", "sm")}>
                {t("a2.bk.title")}
              </AppLink>
            </div>
          </div>
        </AdminPanel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader title={t("a2.nb.title")} description={t("a2.nb.sub")} meta={<p className="text-xs text-muted-foreground">{t("a2.mock")}</p>} />

      <AdminPanel bodyClassName="p-0">
        <ol className="flex flex-wrap gap-1 border-b border-border px-3 py-2 text-xs">
          {STEPS.map((key, i) => (
            <li key={key}>
              <button
                type="button"
                onClick={() => setStep(i)}
                aria-current={i === step ? "step" : undefined}
                className={cn(
                  "rounded-md px-2 py-1 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  i === step ? "bg-brand-soft text-brand-deep" : "text-muted-foreground hover:bg-secondary",
                )}
              >
                <Ltr className="me-1">{i + 1}</Ltr>
                {t(key)}
              </button>
            </li>
          ))}
        </ol>

        <div className="space-y-4 p-4">
          {step === 0 ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-bold">{t("a2.nb.chooseFlight")}</legend>
              {mockFlights.map((f) => (
                <label
                  key={f.id}
                  className={cn(
                    "flex cursor-pointer flex-wrap items-center gap-3 rounded-md border px-3 py-2.5 text-sm",
                    flight === f.id ? "border-brand bg-brand-soft/40" : "border-border hover:bg-secondary",
                  )}
                >
                  <input type="radio" name="nb-flight" checked={flight === f.id} onChange={() => setFlight(f.id)} className="size-4 accent-[var(--brand)]" />
                  <Ltr className="font-bold">{f.number}</Ltr>
                  <Ltr>{`GZA → ${f.dest}`}</Ltr>
                  <Ltr className="text-muted-foreground">{`${f.depart} – ${f.arrive}`}</Ltr>
                  <Ltr className="ms-auto font-semibold">{money(f.price, lang)}</Ltr>
                </label>
              ))}
              <p className="text-xs text-muted-foreground">
                {t("a2.bk.route")}: <Ltr>{destinations.length}</Ltr>
              </p>
            </fieldset>
          ) : null}

          {step === 1 ? (
            <fieldset className="grid gap-2 sm:grid-cols-3">
              <legend className="mb-1 text-sm font-bold sm:col-span-3">{t("a2.nb.chooseFare")}</legend>
              {fares.map((f) => (
                <label
                  key={f.id}
                  className={cn(
                    "cursor-pointer rounded-md border px-3 py-2.5 text-sm",
                    fare === f.id ? "border-brand bg-brand-soft/40" : "border-border hover:bg-secondary",
                  )}
                >
                  <input type="radio" name="nb-fare" checked={fare === f.id} onChange={() => setFare(f.id)} className="me-2 size-4 accent-[var(--brand)]" />
                  <span className="font-semibold">{pick(lang, f.name)}</span>
                  <p className="mt-1 text-xs text-muted-foreground">{pick(lang, f.flexibility)}</p>
                </label>
              ))}
            </fieldset>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <Field label={t("a2.nb.paxCount")} htmlFor="nb-pax">
                <Select id="nb-pax" value={String(paxCount)} onChange={(e) => setPaxCount(Number(e.target.value))}>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </Field>
              {Array.from({ length: paxCount }).map((_, i) => (
                <div key={i} className="grid gap-2 rounded-md border border-border p-2.5 sm:grid-cols-3">
                  <Field label={`${t("a2.bd.passenger")} ${i + 1}`} htmlFor={`nb-name-${i}`}>
                    <Input id={`nb-name-${i}`} placeholder="Given name Family name" />
                  </Field>
                  <Field label={t("a2.bd.dob")} htmlFor={`nb-dob-${i}`}>
                    <Input id={`nb-dob-${i}`} dir="ltr" type="date" />
                  </Field>
                  <Field label={t("a2.bd.document")} htmlFor={`nb-doc-${i}`}>
                    <Input id={`nb-doc-${i}`} dir="ltr" />
                  </Field>
                </div>
              ))}
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label={t("a2.nb.contactEmail")} htmlFor="nb-email">
                  <Input id="nb-email" dir="ltr" type="email" />
                </Field>
                <Field label={t("a2.nb.contactPhone")} htmlFor="nb-phone">
                  <Input id="nb-phone" dir="ltr" />
                </Field>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              {Array.from({ length: paxCount }).map((_, i) => (
                <div key={i} className="grid gap-2 rounded-md border border-border p-2.5 sm:grid-cols-4">
                  <Field label={`${t("a2.bd.seat")} ${i + 1}`} htmlFor={`nb-seat-${i}`}>
                    <Input id={`nb-seat-${i}`} dir="ltr" placeholder="12A" />
                  </Field>
                  <Field label={t("a2.bd.bags")} htmlFor={`nb-bags-${i}`}>
                    <Input id={`nb-bags-${i}`} dir="ltr" type="number" min={0} max={5} defaultValue={1} />
                  </Field>
                  <Field label={t("a2.bd.meal")} htmlFor={`nb-meal-${i}`}>
                    <Select id={`nb-meal-${i}`}>
                      {["Standard", "Vegetarian", "Diabetic", "Child"].map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t("a2.bd.assistance")} htmlFor={`nb-assist-${i}`}>
                    <Input id={`nb-assist-${i}`} />
                  </Field>
                </div>
              ))}
            </div>
          ) : null}

          {step === 4 ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">{t("a2.nb.step1")}</dt>
                <dd>
                  <Ltr>{`${chosen.number} · GZA → ${chosen.dest} · ${chosen.depart}`}</Ltr>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">{t("a2.nb.step2")}</dt>
                <dd>{chosenFare ? pick(lang, chosenFare.name) : fare}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">{t("a2.nb.paxCount")}</dt>
                <dd>
                  <Ltr>{paxCount}</Ltr>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">{t("a2.bk.total")}</dt>
                <dd className="font-bold">
                  <Ltr>{money(chosen.price * paxCount, lang)}</Ltr>
                </dd>
              </div>
              <div className="sm:col-span-2">
                <AdminChip tone="muted">{t("a2.mock")}</AdminChip>
              </div>
            </dl>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className={btnClass("outline", "sm")}>
            {t("a2.back")}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={() => setStep((s) => s + 1)} className={btnClass("primary", "sm")}>
              {t("a2.next")}
            </button>
          ) : (
            <PermissionButton
              allowed={mayEdit}
              reason={t("adm.edit.readOnly")}
              variant="primary"
              onClick={() => {
                setDone(true);
                toast(t("a2.nb.successTitle"));
              }}
            >
              {t("a2.nb.create")}
            </PermissionButton>
          )}
        </div>
      </AdminPanel>
    </div>
  );
}
