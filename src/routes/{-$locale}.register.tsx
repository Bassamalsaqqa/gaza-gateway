import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { btnClass, Container, Field, Input, Notice } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/{-$locale}/register")({
  head: () => ({
    meta: [
      { title: "Create an account — Gaza International Airport (GZA)" },
      {
        name: "description",
        content: "Create a passenger account to keep your Palestinian Airlines trips, travellers and travel preferences together.",
      },
      { property: "og:title", content: "Create an account — Gaza International Airport" },
      { property: "og:description", content: "Keep your trips, travellers and preferences in one place." },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { signIn } = useStore();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });

  return (
    <Container className="flex justify-center py-14">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold">{t("auth.registerTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("auth.registerSub")}</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            signIn(form.email, form.firstName, form.lastName);
            void navigate({ to: "/verify-email" });
          }}
          className="surface mt-6 space-y-4 p-5 sm:p-6"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("book.firstName")} htmlFor="r-first">
              <Input
                id="r-first"
                autoComplete="given-name"
                value={form.firstName}
                onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                required
              />
            </Field>
            <Field label={t("book.lastName")} htmlFor="r-last">
              <Input
                id="r-last"
                autoComplete="family-name"
                value={form.lastName}
                onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                required
              />
            </Field>
          </div>
          <Field label={t("book.email")} htmlFor="r-email">
            <Input
              id="r-email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              required
            />
          </Field>
          <Field label={t("auth.password")} htmlFor="r-password">
            <Input
              id="r-password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              required
            />
          </Field>
          <button type="submit" className={btnClass("primary", "md", "w-full")}>
            {t("auth.register")}
          </button>
          <Notice>{t("auth.demoNote")}</Notice>
        </form>

        <p className="mt-5 text-sm text-muted-foreground">
          {t("auth.haveAccount")}{" "}
          <Link to="/signin" className="font-semibold text-brand-deep underline">
            {t("auth.signin")}
          </Link>
        </p>
      </div>
    </Container>
  );
}
