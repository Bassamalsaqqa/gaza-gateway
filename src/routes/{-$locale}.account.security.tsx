import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { btnClass, Notice, Panel } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { usePassengerAccount, useSignOutMutation } from "@/lib/passenger";

export const Route = createFileRoute("/{-$locale}/account/security")({
  head: () => ({
    meta: [
      { title: "Security — Gaza International Airport (GZA)" },
      { name: "description", content: "Review local passenger session and sign out from this device." },
      { property: "og:title", content: "Security — Gaza International Airport" },
      { property: "og:description", content: "Local session and sign out." },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  const { t } = useI18n();
  const { data: account } = usePassengerAccount();
  const signOutMutation = useSignOutMutation();
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setSignOutError(null);
    try {
      await signOutMutation.mutateAsync();
    } catch {
      setSignOutError(t("error.saveFailed"));
    }
  };

  return (
    <div className="space-y-4">
      <Panel>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          {t("account.security")}
        </h2>
        <div className="mt-4 space-y-3">
          <p className="font-semibold text-foreground">
            {t("account.passwordUnavailable")}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("account.passwordUnavailableDetail")}
          </p>
        </div>
      </Panel>

      <Panel>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          {t("account.sessions")}
        </h2>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">{t("account.thisDevice")}</p>
            <p dir="ltr" className="mt-0.5 text-xs text-muted-foreground">{account?.email}</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signOutMutation.isPending}
            className={btnClass("outline", "sm")}
          >
            {signOutMutation.isPending ? t("common.loading") : t("auth.signout")}
          </button>
        </div>
        {signOutError ? (
          <p role="alert" className="mt-3 text-sm font-medium text-destructive">
            {signOutError}
          </p>
        ) : null}
        <div className="mt-5">
          <Notice>{t("auth.demoNote")}</Notice>
        </div>
      </Panel>
    </div>
  );
}
