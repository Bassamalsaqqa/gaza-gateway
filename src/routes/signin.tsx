import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { btnClass, Container, Field, Input, Notice } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/signin")({
  head: () => ({
    meta: [
      { title: "Sign in — Gaza International Airport (GZA)" },
      {
        name: "description",
        content: "Sign in to view your Palestinian Airlines trips, boarding passes, saved travellers and preferences.",
      },
      { property: "og:title", content: "Sign in — Gaza International Airport" },
      { property: "og:description", content: "Access your trips and boarding passes." },
    ],
  }),
  component: SignInPage,
});

function SignInPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { signIn } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <Container className="flex justify-center py-14">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold">{t("auth.signinTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("auth.signinSub")}</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            signIn(email);
            void navigate({ to: "/account" });
          }}
          className="surface mt-6 space-y-4 p-5 sm:p-6"
        >
          <Field label={t("book.email")} htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label={t("auth.password")} htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <button type="submit" className={btnClass("primary", "md", "w-full")}>
            {t("auth.signin")}
          </button>
          <Notice>{t("auth.demoNote")}</Notice>
        </form>

        <p className="mt-5 text-sm text-muted-foreground">
          {t("auth.noAccount")}{" "}
          <Link to="/register" className="font-semibold text-brand-deep underline">
            {t("auth.register")}
          </Link>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("auth.guest")}{" "}
          <Link to="/manage" className="font-semibold text-brand-deep underline">
            {t("manage.title")}
          </Link>
        </p>
      </div>
    </Container>
  );
}
