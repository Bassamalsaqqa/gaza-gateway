import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { AppLink, useAppNavigate } from "@/components/app-link";
import { Field, Input, btnClass } from "@/components/kit";
import { AdminChip } from "@/components/admin/admin-kit";
import { MOCK_PASSPHRASE, staffAccounts } from "@/lib/admin";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/{-$locale}/admin/signin")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/signin",
      en: {
        title: "Staff sign in — Gaza International Airport administration",
        description: "Sign in to the Gaza International Airport staff administration workspace.",
      },
      ar: {
        title: "دخول الموظفين — إدارة مطار غزة الدولي",
        description: "تسجيل الدخول إلى مساحة عمل إدارة مطار غزة الدولي.",
      },
      noindex: true,
    }),
  component: AdminSignInPage,
});

function AdminSignInPage() {
  const { t, lang } = useI18n();
  const { signIn, staff } = useAdmin();
  const navigate = useAppNavigate();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (staff) void navigate({ to: "/admin", replace: true });
  }, [staff, navigate]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError(t("adm.signin.errEmail"));
      return;
    }
    const result = signIn(email, pass);
    if (!result.ok) {
      setError(result.error === "pass" ? t("adm.signin.errPass") : t("adm.signin.errUnknown"));
      return;
    }
    setError(null);
    void navigate({ to: "/admin", replace: true });
  };

  return (
    <div className="grid min-h-screen bg-ink lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden flex-col justify-between p-10 lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="code-id inline-flex size-9 items-center justify-center rounded-md bg-brand text-sm font-bold text-primary-foreground">
            GZA
          </span>
          <span className="text-sm font-bold text-ink-foreground">{t("adm.workspace")}</span>
        </div>
        <div className="max-w-md">
          <p className="eyebrow text-clay-soft">{t("adm.signin.eyebrow")}</p>
          <p className="mt-3 font-display text-3xl font-bold leading-tight text-ink-foreground">{t("adm.signin.title")}</p>
          <p className="mt-3 text-sm text-ink-muted">{t("adm.signin.sub")}</p>
        </div>
        <p className="text-xs text-ink-muted">{t("adm.brandLine")}</p>
      </div>

      <div className="flex items-center justify-center bg-background px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <span className="inline-flex size-10 items-center justify-center rounded-md bg-brand-soft text-brand-deep">
            <ShieldCheck aria-hidden="true" className="size-5" />
          </span>
          <h1 className="mt-4 text-2xl font-bold">{t("adm.signin.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground lg:hidden">{t("adm.signin.sub")}</p>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <Field label={t("adm.signin.email")} htmlFor="adm-email" error={error ?? undefined}>
              <Input
                id="adm-email"
                type="email"
                dir="ltr"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label={t("adm.signin.pass")} htmlFor="adm-pass">
              <Input
                id="adm-pass"
                type="password"
                dir="ltr"
                autoComplete="current-password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
              />
            </Field>
            <button type="submit" className={btnClass("primary", "md", "w-full")}>
              {t("adm.signin.submit")}
            </button>
          </form>

          <p className="mt-4 text-xs text-muted-foreground">{t("adm.signin.support")}</p>

          <div className="mt-6 rounded-lg border border-dashed border-border bg-sand p-3">
            <p className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">
              {t("adm.signin.helper")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t("adm.signin.helperNote")}</p>
            <ul className="mt-2 space-y-1.5">
              {staffAccounts.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold">{pick(lang, s.name)}</span>
                    <span dir="ltr" className="block truncate text-[0.7rem] text-muted-foreground">
                      {s.email}
                    </span>
                  </span>
                  <AdminChip tone="muted">{t(`adm.role.${s.role}`)}</AdminChip>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(s.email);
                      setPass(MOCK_PASSPHRASE);
                      setError(null);
                    }}
                    className={btnClass("outline", "sm")}
                  >
                    {t("adm.signin.use")}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <AppLink to="/" className="mt-5 inline-block text-xs font-semibold text-brand-deep underline">
            {t("adm.signin.publicSite")}
          </AppLink>
        </div>
      </div>
    </div>
  );
}
