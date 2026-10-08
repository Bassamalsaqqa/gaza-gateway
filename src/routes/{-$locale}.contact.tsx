import { compiledContentHead } from "@/content/head";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Mail, MapPin, Phone, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  btnClass,
  Button,
  Container,
  Field,
  Input,
  Notice,
  PageHeader,
  Panel,
  Select,
  Textarea,
} from "@/components/kit";
import { pick, useI18n } from "@/lib/i18n";
import { publishedInformationPages } from "@/content/published/information-pages";
import { ContentPreviewNotice, useContentPreview } from "@/content/preview";
import { settingsRepository, PUBLISHED_CONTACT_SETTINGS } from "@/lib/settings";
import type { ContactSettings } from "@/lib/settings";
import {
  useCreateContactMessage,
  validateContactCreateInput,
  type ContactTopic,
} from "@/lib/contact";

type ContactSearch = {
  contentPreview?: 1;
  settingsPreview?: 1;
};

import { getBreadcrumbSchema } from "@/lib/structured-data";

export const Route = createFileRoute("/{-$locale}/contact")({
  validateSearch: (search: Record<string, unknown>): ContactSearch => {
    const out: ContactSearch = {};
    if (search["contentPreview"] === "1" || search["contentPreview"] === 1) out.contentPreview = 1;
    if (search["settingsPreview"] === "1" || search["settingsPreview"] === 1) {
      out.settingsPreview = 1;
    }
    return out;
  },
  head: ({ params }) => {
    const isAr = params.locale === "ar";
    const seo = publishedInformationPages.pages.find((page) => page.id === "contact")!.seo;
    return compiledContentHead(seo, params.locale, false, "/contact", {
      image: "/social/gaza-airport.jpg",
      schema: [
        getBreadcrumbSchema([
          { name: isAr ? "الرئيسية" : "Home", path: isAr ? "/ar" : "/" },
          { name: isAr ? "الاتصال بنا" : "Contact", path: isAr ? "/ar/contact" : "/contact" },
        ]),
      ],
    });
  },
  component: ContactPage,
});

function generateSubmissionId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `sub-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function ContactPage() {
  const { t, lang } = useI18n();
  const { content, previewing, previewError, previewLoading } = useContentPreview("pages.information", publishedInformationPages);
  const page = content.pages.find((entry) => entry.id === "contact")!;
  const search = Route.useSearch();
  const createContactMutation = useCreateContactMessage();

  // Controlled form state
  const [submissionId, setSubmissionId] = useState(generateSubmissionId);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<ContactTopic>("booking");
  const [bookingRef, setBookingRef] = useState("");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successIsPreview, setSuccessIsPreview] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const submitting = useRef(false);
  const successHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (isSuccess) successHeading.current?.focus();
  }, [isSuccess]);

  // Contact settings state (Phase 4C preserved)
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

  const subjects: { id: ContactTopic; label: string }[] = [
    { id: "booking", label: t("contact.topic.booking") },
    { id: "baggage", label: t("contact.topic.baggage") },
    { id: "accessibility", label: t("contact.topic.accessibility") },
    { id: "archive", label: t("contact.topic.archive") },
    { id: "media", label: t("contact.topic.media") },
    { id: "other", label: t("contact.topic.other") },
  ];

  const socialNetworks = [
    { name: "Instagram", url: settings.socialInstagram },
    { name: "X", url: settings.socialX },
    { name: "Facebook", url: settings.socialFacebook },
    { name: "YouTube", url: settings.socialYouTube },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    setSubmitError(null);

    const validation = validateContactCreateInput({
      submissionId,
      senderName: name,
      email,
      topic,
      message,
      language: lang === "ar" ? "ar" : "en",
      bookingRef: bookingRef.trim() ? bookingRef : undefined,
    });

    if (!validation.success) {
      const errors = Object.fromEntries(
        Object.keys(validation.errors ?? {}).map((field) => [field, t(`contact.error.${field}`)]),
      );
      setFieldErrors(errors);
      const firstField = Object.keys(errors)[0];
      const control = firstField
        ? e.currentTarget.querySelector<HTMLElement>(`[name="${firstField}"]`)
        : null;
      control?.focus();
      return;
    }

    setFieldErrors({});
    setIsPending(true);
    submitting.current = true;
    setSuccessIsPreview(search.settingsPreview === 1);

    try {
      if (search.settingsPreview === 1) {
        // Settings preview immunity: validate normally, but do NOT write to gza.contact.v1!
        // Storage remains byte-for-byte untouched.
        setIsSuccess(true);
      } else {
        await createContactMutation.mutateAsync(validation.data!);
        setIsSuccess(true);
      }
    } catch {
      setSubmitError(t("contact.saveFailed"));
    } finally {
      submitting.current = false;
      setIsPending(false);
    }
  };

  const handleReset = () => {
    setName("");
    setEmail("");
    setTopic("booking");
    setBookingRef("");
    setMessage("");
    setFieldErrors({});
    setSubmitError(null);
    setIsSuccess(false);
    setSubmissionId(generateSubmissionId());
  };

  return (
    <>
      {previewing && <ContentPreviewNotice error={previewError} loading={previewLoading} />}
      <PageHeader title={pick(lang, page.title)} description={pick(lang, page.description)} />
      {page.blocks.some((block) => block.visible) && <Container className="space-y-4 pt-6">
        {page.blocks.filter((block) => block.visible).map((block) => <Panel key={block.id}>
          <h2 className="text-lg font-bold">{pick(lang, block.title)}</h2>
          {block.paragraphs.map((paragraph, index) => <p key={index} className="mt-3 text-sm leading-relaxed text-muted-foreground">{pick(lang, paragraph)}</p>)}
        </Panel>)}
      </Container>}

      <Container className="grid gap-8 py-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          {search.settingsPreview === 1 && <Notice>{t("contact.previewNotice")}</Notice>}
          {search.settingsPreview === 1 && activeDraft !== null && (
            <div className="mb-4 text-xs font-semibold text-status-delayed bg-status-delayed/15 p-2.5 rounded-md border border-status-delayed/30">
              {pick(lang, {
                en: "Stored in this browser • Not published",
                ar: "مسودة محفوظة في هذا المتصفح • غير منشورة",
              })}
            </div>
          )}

          {isSuccess ? (
            <Panel className="space-y-4" role="status" aria-live="polite">
              <div className="flex items-center gap-3 text-brand">
                <CheckCircle2 className="size-6 shrink-0" aria-hidden="true" />
                <h2 ref={successHeading} tabIndex={-1} className="text-xl font-bold">
                  {t(successIsPreview ? "contact.previewSuccess" : "contact.saved")}
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t(
                  successIsPreview ? "contact.previewSuccessDesc" : "contact.savedDesc",
                )}
              </p>
              <button
                type="button"
                onClick={handleReset}
                className={btnClass("outline", "md", "mt-4")}
              >
                {t("contact.sendAnother")}
              </button>
            </Panel>
          ) : (
            <form onSubmit={handleSubmit} className="surface space-y-4 p-5 sm:p-6" noValidate>
              {submitError && (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  {submitError}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t("contact.name")}
                  htmlFor="c-name"
                  error={fieldErrors["senderName"]}
                  errorId="c-name-err"
                >
                  <Input
                    id="c-name"
                    name="senderName"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-invalid={Boolean(fieldErrors["senderName"])}
                    aria-describedby={fieldErrors["senderName"] ? "c-name-err" : undefined}
                  />
                </Field>
                <Field
                  label={t("book.email")}
                  htmlFor="c-email"
                  error={fieldErrors["email"]}
                  errorId="c-email-err"
                >
                  <Input
                    id="c-email"
                    dir="ltr"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={Boolean(fieldErrors["email"])}
                    aria-describedby={fieldErrors["email"] ? "c-email-err" : undefined}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t("contact.subject")}
                  htmlFor="c-subject"
                  error={fieldErrors["topic"]}
                  errorId="c-subject-err"
                >
                  <Select
                    id="c-subject"
                    name="topic"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value as ContactTopic)}
                    aria-invalid={Boolean(fieldErrors["topic"])}
                    aria-describedby={fieldErrors["topic"] ? "c-subject-err" : undefined}
                  >
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label={t("contact.bookingRef")}
                  htmlFor="c-booking-ref"
                  hint={t("contact.bookingRefHelp")}
                  error={fieldErrors["bookingRef"]}
                  errorId="c-booking-ref-err"
                >
                  <Input
                    id="c-booking-ref"
                    dir="ltr"
                    name="bookingRef"
                    placeholder="GZA4TQ"
                    value={bookingRef}
                    onChange={(e) => setBookingRef(e.target.value.toUpperCase())}
                    aria-invalid={Boolean(fieldErrors["bookingRef"])}
                    aria-describedby={fieldErrors["bookingRef"] ? "c-booking-ref-err" : undefined}
                  />
                </Field>
              </div>

              <Field
                label={t("contact.message")}
                htmlFor="c-message"
                error={fieldErrors["message"]}
                errorId="c-message-err"
              >
                <Textarea
                  id="c-message"
                  name="message"
                  rows={6}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  aria-invalid={Boolean(fieldErrors["message"])}
                  aria-describedby={fieldErrors["message"] ? "c-message-err" : undefined}
                />
              </Field>

              <Button
                type="submit"
                variant="primary"
                size="md"
                pending={isPending}
                disabled={isPending}
              >
                <Send aria-hidden="true" className="size-4 rtl:-scale-x-100" />
                {t("contact.send")}
              </Button>

              <Notice>
                {search.settingsPreview === 1
                  ? t("contact.previewNotice")
                  : pick(lang, {
                      en: "Prototype form: enquiries are saved in this browser for workflow testing.",
                      ar: "نموذج تجريبي: تُحفظ الاستفسارات في هذا المتصفح لاختبار سير العمل.",
                    })}
              </Notice>
            </form>
          )}
        </div>

        <aside className="space-y-4">
          <Panel>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              {t("contact.details")}
            </h2>
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
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              {t("contact.follow")}
            </h2>
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
                    <span className="inline-flex rounded-full border border-input bg-muted px-3.5 py-1.5 font-semibold text-muted-foreground cursor-not-allowed opacity-50">
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
