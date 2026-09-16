import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLink, useAppNavigate } from "@/components/app-link";
import { btnClass, Container, EmptyState, Field, Input, PageHeader, Panel } from "@/components/kit";
import { pageHead } from "@/lib/head";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/{-$locale}/manage/$ref_/contact")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: `/manage/${params.ref}/contact`,
      noindex: true,
      en: {
        title: `Contact details — booking ${params.ref} — Gaza International Airport (GZA)`,
        description: "Update the email address and phone number held for this Palestinian Airlines booking.",
      },
      ar: {
        title: `بيانات التواصل — الحجز ${params.ref} — مطار غزة الدولي`,
        description: "حدّث البريد الإلكتروني ورقم الهاتف المرتبطين بهذا الحجز.",
      },
    }),
  component: ManageContactPage,
});

function ManageContactPage() {
  const { ref } = Route.useParams();
  const { t } = useI18n();
  const navigate = useAppNavigate();
  const { ready, findBooking, updateBooking } = useStore();
  const booking = findBooking(ref);
  const [form, setForm] = useState({
    email: booking?.contact.email ?? "",
    phone: booking?.contact.phone ?? "",
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/.+@.+\..+/.test(form.email.trim())) {
      setError(t("book.required"));
      return;
    }
    setError(null);
    updateBooking(booking.ref, { contact: { email: form.email.trim(), phone: form.phone.trim() } });
    setSaved(true);
  };

  return (
    <Container className="py-8 sm:py-12">
      <PageHeader
        eyebrow={t("nav.manage")}
        title={t("manage.contactTitle")}
        description={t("manage.contactSub", { ref: booking.ref })}
      />

      <Panel className="mt-6 max-w-xl">
        <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label={t("conf.contactEmail")} htmlFor="c-email" {...(error ? { error } : {})}>
            <Input
              id="c-email"
              type="email"
              autoComplete="email"
              value={form.email}
              aria-invalid={error ? true : undefined}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, email: e.target.value }));
                setSaved(false);
                setError(null);
              }}
            />
          </Field>
          <Field label={t("book.phone")} htmlFor="c-phone">
            <Input
              id="c-phone"
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, phone: e.target.value }));
                setSaved(false);
              }}
            />
          </Field>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
            <button type="submit" className={btnClass("primary", "md")}>
              {t("common.save")}
            </button>
            <AppLink to="/manage/$ref" params={{ ref: booking.ref }} className={btnClass("secondary", "md")}>
              {t("common.cancel")}
            </AppLink>
          </div>
          {saved ? (
            <p role="status" className="sm:col-span-2 text-sm font-semibold text-brand-deep">
              {t("common.saved")}
            </p>
          ) : null}
        </form>
      </Panel>
    </Container>
  );
}
