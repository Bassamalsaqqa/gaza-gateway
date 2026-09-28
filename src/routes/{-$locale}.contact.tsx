import { createFileRoute } from "@tanstack/react-router";
import { Mail, MapPin, Phone, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { btnClass, Container, Field, Input, Notice, PageHeader, Panel, Select, Textarea } from "@/components/kit";
import { pick, useI18n } from "@/lib/i18n";
import { settingsRepository, PUBLISHED_CONTACT_SETTINGS } from "@/lib/settings";
import type { ContactSettings } from "@/lib/settings";

type ContactSearch = {
  settingsPreview?: 1;
};

export const Route = createFileRoute("/{-$locale}/contact")({
  validateSearch: (search: Record<string, unknown>): ContactSearch => {
    const out: ContactSearch = {};
    if (search["settingsPreview"] === "1" || search["settingsPreview"] === 1) {
      out.settingsPreview = 1;
    }
    return out;
  },
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
  const search = Route.useSearch();
  const [sent, setSent] = useState(false);
  const [settings, setSettings] = useState<ContactSettings>(PUBLISHED_CONTACT_SETTINGS);
  const [activeDraft, setActiveDraft] = useState<ContactSettings | null>(null);

  useEffect(() => {
    let unmounted = false;

    const syncSettings = async () => {
      if (search.settingsPreview === 1 && typeof window !== "undefined") {
        try {
          const draft = await settingsRepository.getContactDraft();
          if (!unmounted) {
            if (draft) {
              setSettings(draft);
              setActiveDraft(draft);
            } else {
              setSettings(PUBLISHED_CONTACT_SETTINGS);
              setActiveDraft(null);
            }
          }
        } catch {
          if (!unmounted) {
            setSettings(PUBLISHED_CONTACT_SETTINGS);
            setActiveDraft(null);
          }
        }
      } else {
        // Normal published URL or leaving ?settingsPreview=1 in SPA navigation
        if (!unmounted) {
          setSettings(PUBLISHED_CONTACT_SETTINGS);
          setActiveDraft(null);
        }
      }
    };

    syncSettings();

    // Subscribe to saved-draft events and cross-tab storage changes
    const unsub = settingsRepository.subscribe((newEnvelope) => {
      if (!unmounted && search.settingsPreview === 1) {
        const contactDraft = newEnvelope?.site?.contact ?? null;
        if (contactDraft) {
          setSettings(contactDraft);
          setActiveDraft(contactDraft);
        } else {
          setSettings(PUBLISHED_CONTACT_SETTINGS);
          setActiveDraft(null);
        }
      }
    });

    return () => {
      unmounted = true;
      unsub();
    };
  }, [search.settingsPreview]);

  const subjects = [
    { id: "booking", label: { en: "Booking enquiry", ar: "استفسار عن حجز" } },
    { id: "baggage", label: { en: "Baggage", ar: "الأمتعة" } },
    { id: "accessibility", label: { en: "Accessibility and assistance", ar: "الوصول والمساعدة" } },
    { id: "archive", label: { en: "Archive contribution", ar: "مساهمة أرشيفية" } },
    { id: "media", label: { en: "Media", ar: "إعلام" } },
  ];

  const socialNetworks = [
    { name: "Instagram", url: settings.socialInstagram },
    { name: "X", url: settings.socialX },
    { name: "Facebook", url: settings.socialFacebook },
    { name: "YouTube", url: settings.socialYouTube },
  ];

  return (
    <>
      <PageHeader title={t("contact.title")} description={t("contact.sub")} />

      <Container className="grid gap-8 py-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          {search.settingsPreview === 1 && activeDraft !== null && (
            <div className="mb-4 text-xs font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 p-2.5 rounded-md border border-amber-300 dark:border-amber-800">
              {pick(lang, {
                en: "Stored in this browser • Not published",
                ar: "مسودة محفوظة في هذا المتصفح • غير منشورة",
              })}
            </div>
          )}
          {sent ? (
            <Panel>
              <h2 className="text-xl font-bold">{t("contact.sent")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {pick(lang, {
                  en: "Your message has not been sent anywhere yet — messaging is not connected.",
                  ar: "لم تُرسل رسالتك إلى أي مكان بعد — الواجهة الخلفية غير متصلة.",
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
                  ar: "نموذج تجريبي: الرسائل لا تُسلَّم إلى أي مكان بعد.",
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
                <span className="code-id">{settings.phone}</span>
              </li>
              <li className="flex gap-3">
                <Mail aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-deep" />
                <span className="code-id">{settings.email}</span>
              </li>
              <li className="flex gap-3">
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-deep" />
                <span className="text-muted-foreground">
                  {pick(lang, { en: settings.addressEn, ar: settings.addressAr })}
                </span>
              </li>
            </ul>
          </Panel>
          <Panel>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("contact.follow")}</h2>
            <ul className="mt-4 flex flex-wrap gap-2 text-sm">
              {socialNetworks.map((network) => (
                <li key={network.name}>
                  {network.url ? (
                    <a
                      href={network.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex rounded-full border border-input bg-card px-3.5 py-1.5 font-semibold hover:border-primary text-primary"
                    >
                      {network.name}
                    </a>
                  ) : (
                    <span
                      className="inline-flex rounded-full border border-input bg-muted px-3.5 py-1.5 font-semibold text-muted-foreground cursor-not-allowed opacity-50"
                    >
                      {network.name}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </Container>
    </>
  );
}
