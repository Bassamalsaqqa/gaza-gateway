import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { AppLink, useAppNavigate } from "@/components/app-link";
import { Field, Input, btnClass } from "@/components/kit";
import { AdminChip } from "@/components/admin/admin-kit";
import { MOCK_PASSPHRASE, staffAccounts } from "@/lib/admin";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/{-$locale}/admin_/signin")({
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
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<"email" | "pass" | "form" | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (staff) void navigate({ to: "/admin", replace: true });
  }, [staff, navigate]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError(t("adm.signin.errEmail"));
      setErrorField("email");
      return;
    }
    const result = signIn(email, pass);
    if (!result.ok) {
      setError(result.error === "pass" ? t("adm.signin.errPass") : t("adm.signin.errUnknown"));
      setErrorField(result.error === "pass" ? "pass" : "form");
      return;
    }
    setError(null);
    setErrorField(null);
    void navigate({ to: "/admin", replace: true });
  };

  return (
    <div className="relative grid min-h-screen overflow-hidden bg-ink lg:grid-cols-[1.08fr_1fr]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_18%_18%,var(--brand)_0,transparent_32%),radial-gradient(circle_at_82%_88%,var(--clay)_0,transparent_26%)]"
      />
      <div className="relative hidden flex-col justify-between p-10 xl:p-14 lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="code-id inline-flex size-9 items-center justify-center rounded-md bg-brand text-sm font-bold text-primary-foreground">
            GZA
          </span>
          <span className="text-sm font-bold text-ink-foreground">{t("adm.workspace")}</span>
        </div>
        <div className="max-w-lg border-s border-clay/50 ps-6">
          <p className="eyebrow text-clay-soft">{t("adm.signin.eyebrow")}</p>
          <p className="mt-3 font-display text-3xl font-bold leading-tight text-ink-foreground">{t("adm.signin.title")}</p>
          <p className="mt-3 text-sm text-ink-muted">{t("adm.signin.sub")}</p>
        </div>
        <p className="text-xs text-ink-muted">{t("adm.brandLine")}</p>
      </div>

      <div className="relative flex items-center justify-center bg-sand px-4 py-8 sm:px-8 lg:bg-background/96">
        <motion.main
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-md overflow-hidden rounded-xl border border-border bg-card px-5 py-6 shadow-[var(--shadow-lift)] sm:px-7 sm:py-7"
        >
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px overflow-hidden bg-border">
            <motion.span
              className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-clay to-transparent"
              initial={{ x: "-120%" }}
              animate={reduceMotion ? { x: "0%", opacity: 0.45 } : { x: ["-120%", "420%"] }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 5.5, repeat: Infinity, repeatDelay: 2.5, ease: "easeInOut" }
              }
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <span className="inline-flex size-11 items-center justify-center rounded-md bg-brand text-primary-foreground shadow-sm">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </span>
            <span className="code-id rounded-md border border-border bg-sand px-2 py-1 text-[11px] font-bold text-brand-deep">
              GZA · PS
            </span>
          </div>
          <p className="eyebrow mt-5 text-clay">{t("adm.signin.eyebrow")}</p>
          <h1 className="mt-2 font-display text-2xl font-bold leading-tight text-foreground sm:text-3xl">
            {t("adm.signin.title")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("adm.signin.sub")}</p>
          <div className="mt-4 flex items-start gap-2 border-s-2 border-clay bg-sand/65 px-3 py-2.5 text-xs text-muted-foreground">
            <AdminChip tone="muted" className="mt-0.5 shrink-0 text-[10px]">
              {t("adm.shell.simulation")}
            </AdminChip>
            <span>{t("adm.signin.simulationNote")}</span>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <Field
              label={t("adm.signin.email")}
              htmlFor="adm-email"
              error={errorField === "email" ? (error ?? undefined) : undefined}
              errorId="adm-email-error"
            >
              <Input
                id="adm-email"
                type="email"
                dir="ltr"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={errorField === "email" || undefined}
                aria-describedby={errorField === "email" ? "adm-email-error" : undefined}
              />
            </Field>
            <Field
              label={t("adm.signin.pass")}
              htmlFor="adm-pass"
              error={errorField === "pass" ? (error ?? undefined) : undefined}
              errorId="adm-pass-error"
            >
              <div className="relative">
                <LockKeyhole
                  aria-hidden="true"
                  className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="adm-pass"
                  type={showPass ? "text" : "password"}
                  dir="ltr"
                  autoComplete="current-password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  className="ps-9 pe-12"
                  aria-invalid={errorField === "pass" || undefined}
                  aria-describedby={errorField === "pass" ? "adm-pass-error" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((shown) => !shown)}
                  aria-label={t(showPass ? "adm.signin.hidePass" : "adm.signin.showPass")}
                  aria-pressed={showPass}
                  className="absolute end-0 top-0 flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring"
                >
                  {showPass ? (
                    <EyeOff aria-hidden="true" className="size-4" />
                  ) : (
                    <Eye aria-hidden="true" className="size-4" />
                  )}
                </button>
              </div>
            </Field>
            {errorField === "form" && error ? (
              <p className="border-s-2 border-status-cancelled bg-status-cancelled/5 px-3 py-2 text-xs font-medium text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" className={btnClass("primary", "md", "w-full")}>
              {t("adm.signin.submit")}
            </button>
          </form>

          <p className="mt-4 text-xs text-muted-foreground">{t("adm.signin.support")}</p>

          <div className="mt-6 border-t border-border pt-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("adm.signin.helper")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t("adm.signin.helperNote")}</p>
            <ul className="mt-2 space-y-1.5">
              {staffAccounts.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold">{pick(lang, s.name)}</span>
                    <span dir="ltr" className="block truncate text-xs text-muted-foreground">
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
                      setErrorField(null);
                    }}
                    className={btnClass("outline", "sm")}
                  >
                    {t("adm.signin.use")}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <AppLink to="/" className="mt-5 inline-block text-xs font-semibold text-brand-deep underline underline-offset-4">
            {t("adm.signin.publicSite")}
          </AppLink>
        </motion.main>
      </div>
    </div>
  );
}
