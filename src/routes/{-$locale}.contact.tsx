import { createFileRoute } from "@tanstack/react-router";
import { Mail, MapPin, Phone, Send } from "lucide-react";
import { useState } from "react";
import { btnClass, Container, Field, Input, Notice, PageHeader, Panel, Select, Textarea } from "@/components/kit";
import { pick, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/{-$locale}/contact")({
  head: () => ({
    meta: [
      { title: "Contact — Gaza International Airport (GZA)" },
      {
        name: "description",
        content:
          "Contact Gaza International Airport and Palestinian Airlines: passenger enquiries, media and archive contributions, plus phone and email details.",
      },
      { property: "og:title", content: "Contact Gaza International Airport" },
      { property: "og:description", content: "Passenger, media and archive enquiries." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const { t, lang } = useI18n();
  const [sent, setSent] = useState(false);

  const subjects = [
    { id: "booking", label: { en: "Booking enquiry", ar: "استفسار عن حجز" } },
    { id: "baggage", label: { en: "Baggage", ar: "الأمتعة" } },
    { id: "accessibility", label: { en: "Accessibility and assistance", ar: "الوصول والمساعدة" } },
    { id: "archive", label: { en: "Archive contribution", ar: "مساهمة أرشيفية" } },
    { id: "media", label: { en: "Media", ar: "إعلام" } },
  ];

  return (
    <>
      <PageHeader eyebrow={t("nav.contact")} title={t("contact.title")} description={t("contact.sub")} />

      <Container className="grid gap-8 py-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          {sent ? (
            <Panel>
              <h2 className="text-xl font-bold">{t("contact.sent")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {pick(lang, {
                  en: "This is a prototype form — nothing was actually sent.",
                  ar: "هذا نموذج تجريبي — لم يُرسل شيء فعلياً.",
                })}
              </p>
              <button type="button" onClick={() => setSent(false)} className={btnClass("outline", "md", "mt-4")}>
                {t("contact.message")}
              </button>
            </Panel>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSent(true);
              }}
              className="surface space-y-4 p-5 sm:p-6"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("contact.name")} htmlFor="c-name">
                  <Input id="c-name" autoComplete="name" required />
                </Field>
                <Field label={t("book.email")} htmlFor="c-email">
                  <Input id="c-email" type="email" autoComplete="email" required />
                </Field>
              </div>
              <Field label={t("contact.subject")} htmlFor="c-subject">
                <Select id="c-subject" defaultValue="booking">
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {pick(lang, subject.label)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("contact.message")} htmlFor="c-message">
                <Textarea id="c-message" rows={6} required />
              </Field>
              <button type="submit" className={btnClass("primary", "md")}>
                <Send aria-hidden="true" className="size-4 rtl:-scale-x-100" />
                {t("contact.send")}
              </button>
              <Notice>
                {pick(lang, {
                  en: "Prototype form: messages are not delivered anywhere yet.",
                  ar: "نموذج تجريبي: الرسائل لا تُسلَّم إلى أي جهة بعد.",
                })}
              </Notice>
            </form>
          )}
        </div>

        <aside className="space-y-4">
          <Panel>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("contact.details")}</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex gap-3">
                <Phone aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-deep" />
                <span className="code-id">+970 8 000 0000</span>
              </li>
              <li className="flex gap-3">
                <Mail aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-deep" />
                <span className="code-id">hello@gza-airport.ps</span>
              </li>
              <li className="flex gap-3">
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-deep" />
                <span className="text-muted-foreground">
                  {pick(lang, { en: "Gaza International Airport, Gaza", ar: "مطار غزة الدولي، غزة" })}
                </span>
              </li>
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              {pick(lang, {
                en: "Placeholder contact details — replace with the real ones.",
                ar: "بيانات اتصال مؤقتة — تُستبدل بالبيانات الحقيقية.",
              })}
            </p>
          </Panel>
          <Panel>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("contact.follow")}</h2>
            <ul className="mt-4 flex flex-wrap gap-2 text-sm">
              {["Instagram", "X", "Facebook", "YouTube"].map((network) => (
                <li key={network}>
                  <a
                    href="#"
                    className="inline-flex rounded-full border border-input bg-card px-3.5 py-1.5 font-semibold hover:border-primary"
                  >
                    {network}
                  </a>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </Container>
    </>
  );
}
