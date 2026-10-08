import { AppLink, useAppNavigate } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { btnClass, Container, EmptyState, Field, Input } from "@/components/kit";
import { PublicPhotoHero } from "@/components/media/public-photo-hero";
import { pageHead } from "@/lib/head";
import { useI18n } from "@/lib/i18n";
import { useRepositories } from "@/lib/repositories/registry";
import { matchesBookingIdentifier, normalizePnr } from "@/lib/domain/booking-lookup";

type ManageSearch = { ref?: string | undefined };

export const Route = createFileRoute("/{-$locale}/manage/")({
  validateSearch: (search: Record<string, unknown>): ManageSearch => ({
    ref: typeof search["ref"] === "string" ? (search["ref"] as string) : undefined,
  }),
  head: ({ params }) => {
    const isAr = params.locale === "ar";
    return pageHead({
      title: isAr
        ? "إدارة الحجز — مطار غزة الدولي (GZA)"
        : "Manage booking — Gaza International Airport (GZA)",
      description: isAr
        ? "استرجع حجز الخطوط الجوية الفلسطينية برقم الحجز واسم العائلة لعرض الرحلات والمسافرين والمقاعد والأمتعة."
        : "Retrieve a Palestinian Airlines booking with your reference and last name to view flights, passengers, seats and baggage.",
      locale: params.locale,
      path: "/manage",
      noindex: true,
    });
  },
  component: ManageLookupPage,
});

function ManageLookupPage() {
  const { t } = useI18n();
  const navigate = useAppNavigate();
  const { ref: refParam } = Route.useSearch();
  const { booking: bookingRepo } = useRepositories();
  const [ref, setRef] = useState(refParam ?? "");
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Older links used /manage?ref=ABC123 — send them to the deep-linkable detail route if found.
  useEffect(() => {
    if (!refParam) return;
    const clean = normalizePnr(refParam);
    if (!clean) return;
    let cancelled = false;
    void bookingRepo.getByRef(clean).then((found) => {
      if (!cancelled && found) {
        void navigate({ to: "/manage/$ref", params: { ref: found.ref }, replace: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refParam, bookingRepo, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRef = normalizePnr(ref);
    const cleanIdentifier = identifier.trim();
    if (!cleanIdentifier) {
      setError(t("manage.needIdentifier"));
      setNotFound(false);
      document.getElementById("identifier")?.focus();
      return;
    }
    setError(null);
    setIsSearching(true);
    try {
      const found = await bookingRepo.getByRef(cleanRef);
      if (found && matchesBookingIdentifier(found, cleanIdentifier)) {
        setNotFound(false);
        void navigate({ to: "/manage/$ref", params: { ref: found.ref } });
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <>
      <PublicPhotoHero
        mediaId="manage-booking-hero"
        routeKey="manage"
        title={t("manage.title")}
        description={t("manage.sub")}
        focalPosition="50% 40%"
      />

      <Container className="grid gap-8 py-10 lg:grid-cols-[1fr_1.4fr]">
        <form onSubmit={submit} className="surface h-fit p-5" noValidate>
          <div className="space-y-4">
            <Field label={t("manage.reference")} htmlFor="pnr" hint="ABC123">
              <Input
                id="pnr"
                value={ref}
                onChange={(e) => setRef(e.target.value.toUpperCase())}
                dir="ltr"
                className="code-id tracking-[0.16em] uppercase"
                required
              />
            </Field>
            <Field
              label={t("manage.identifier")}
              htmlFor="identifier"
              hint={t("manage.identifierHint")}
              {...(error ? { error, errorId: "identifier-error" } : {})}
            >
              <Input
                id="identifier"
                dir="auto"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  setError(null);
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "identifier-error" : undefined}
                required
              />
            </Field>
            <button type="submit" disabled={isSearching} className={btnClass("primary", "md", "w-full")}>
              <Search aria-hidden="true" className="size-4" />
              {t("manage.find")}
            </button>
          </div>
        </form>

        <div>
          {notFound ? (
            <EmptyState
              title={t("manage.notFound")}
              description={t("manage.notFoundHint")}
              action={
                <AppLink to="/book" className={btnClass("outline", "md")}>
                  {t("nav.book")}
                </AppLink>
              }
            />
          ) : (
            <EmptyState
              title={t("manage.title")}
              description={t("manage.sub")}
              action={
                <AppLink to="/book" className={btnClass("outline", "md")}>
                  {t("nav.book")}
                </AppLink>
              }
            />
          )}
        </div>
      </Container>
    </>
  );
}
