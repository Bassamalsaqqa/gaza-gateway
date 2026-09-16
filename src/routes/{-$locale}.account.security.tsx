import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { btnClass, Field, Input, Notice, Panel } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/{-$locale}/account/security")({
  head: () => ({
    meta: [
      { title: "Security — Gaza International Airport (GZA)" },
      { name: "description", content: "Change your password and review sign-in activity for your passenger account." },
      { property: "og:title", content: "Security — Gaza International Airport" },
      { property: "og:description", content: "Password and sign-in activity." },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  const { t } = useI18n();
  const { account, signOut } = useStore();
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const mismatch = form.next !== "" && form.confirm !== "" && form.next !== form.confirm;

  return (
    <div className="space-y-4">
      <Panel>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("account.changePassword")}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (mismatch) return;
            setForm({ current: "", next: "", confirm: "" });
            setDone(true);
          }}
          className="mt-4 grid max-w-md gap-3"
        >
          <Field label={t("account.currentPassword")} htmlFor="s-current">
            <Input
              id="s-current"
              type="password"
              autoComplete="current-password"
              value={form.current}
              onChange={(e) => setForm((prev) => ({ ...prev, current: e.target.value }))}
              required
            />
          </Field>
          <Field label={t("account.newPassword")} htmlFor="s-next">
            <Input
              id="s-next"
              type="password"
              autoComplete="new-password"
              value={form.next}
              onChange={(e) => setForm((prev) => ({ ...prev, next: e.target.value }))}
              required
            />
          </Field>
          <Field
            label={t("account.confirmPassword")}
            htmlFor="s-confirm"
            error={mismatch ? t("account.passwordMismatch") : undefined}
          >
            <Input
              id="s-confirm"
              type="password"
              autoComplete="new-password"
              value={form.confirm}
              onChange={(e) => setForm((prev) => ({ ...prev, confirm: e.target.value }))}
              required
            />
          </Field>
          <div>
            <button type="submit" className={btnClass("primary", "md")}>
              {t("account.save")}
            </button>
            {done ? <p className="mt-3 text-sm font-medium text-brand-deep">{t("account.saved")}</p> : null}
          </div>
        </form>
      </Panel>

      <Panel>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("account.sessions")}</h2>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">{t("account.thisDevice")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{account?.email}</p>
          </div>
          <button type="button" onClick={signOut} className={btnClass("outline", "sm")}>
            {t("auth.signout")}
          </button>
        </div>
        <div className="mt-5">
          <Notice>{t("auth.demoNote")}</Notice>
        </div>
      </Panel>
    </div>
  );
}
