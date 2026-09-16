import { AppLink } from "@/components/app-link";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { btnClass, Container, EmptyState, Field, Input, Notice, PageHeader } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

type ManageSearch = { ref?: string | undefined };

export const Route = createFileRoute("/{-$locale}/manage/")({
  validateSearch: (search: Record<string, unknown>): ManageSearch => ({
    ref: typeof search["ref"] === "string" ? (search["ref"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Manage booking — Gaza International Airport (GZA)" },
      {
        name: "description",
        content:
          "Retrieve a Palestinian Airlines booking with your reference and last name to view flights, passengers, seats and baggage.",
      },
      { property: "og:title", content: "Manage your booking — Palestinian Airlines" },
      { property: "og:description", content: "Look up a booking by reference and last name." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManageLookupPage,
});

function ManageLookupPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { ref: refParam } = Route.useSearch();
  const { findBooking, bookings, ready } = useStore();
  const [ref, setRef] = useState(refParam ?? "");
  const [lastName, setLastName] = useState("");
  const [notFound, setNotFound] = useState(false);

  // Older links used /manage?ref=ABC123 — send them to the deep-linkable detail route.
  useEffect(() => {
    if (ready && refParam && findBooking(refParam)) {
      void navigate({ to: "/manage/$ref", params: { ref: refParam }, replace: true });
    }
  }, [ready, refParam, findBooking, navigate]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = findBooking(ref.trim());
    const nameOk =
      !lastName.trim() ||
      found?.passengers.some((p) => p.lastName.trim().toLowerCase() === lastName.trim().toLowerCase()) ||
      found?.contact.email.toLowerCase() === lastName.trim().toLowerCase();
    if (found && nameOk) {
      setNotFound(false);
      void navigate({ to: "/manage/$ref", params: { ref: found.ref } });
    } else {
      setNotFound(true);
    }
  };

  return (
    <>
      <PageHeader eyebrow={t("nav.manage")} title={t("manage.title")} description={t("manage.sub")} />

      <Container className="grid gap-8 py-10 lg:grid-cols-[1fr_1.4fr]">
        <form onSubmit={submit} className="surface h-fit p-5">
          <div className="space-y-4">
            <Field label={t("manage.reference")} htmlFor="pnr" hint="ABC123">
              <Input
                id="pnr"
                value={ref}
                onChange={(e) => setRef(e.target.value.toUpperCase())}
                className="code-id tracking-[0.16em] uppercase"
                required
              />
            </Field>
            <Field label={t("manage.lastName")} htmlFor="lastname">
              <Input
                id="lastname"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
              />
            </Field>
            <button type="submit" className={btnClass("primary", "md", "w-full")}>
              <Search aria-hidden="true" className="size-4" />
              {t("manage.find")}
            </button>
          </div>
          <div className="mt-5">
            <Notice>{t("manage.demoHint")}</Notice>
          </div>
          {bookings.length > 0 ? (
            <div className="mt-5 border-t border-border pt-4">
              <p className="eyebrow text-muted-foreground">{t("account.trips")}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {bookings.map((b) => (
                  <li key={b.ref}>
                    <AppLink
                      to="/manage/$ref"
                      params={{ ref: b.ref }}
                      className="code-id block rounded-md border border-input bg-card px-2.5 py-1.5 text-xs font-semibold"
                    >
                      {b.ref}
                    </AppLink>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </form>

        <div>
          {notFound ? (
            <EmptyState
              title={t("manage.notFound")}
              description={t("manage.demoHint")}
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
