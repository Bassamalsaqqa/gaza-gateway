import type { ReactNode } from "react";
import { Plane } from "lucide-react";
import { Container } from "@/components/kit";
import { useI18n } from "@/lib/i18n";

export function PassengerAuthShell({ title, description, children, footer }: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t, lang } = useI18n();
  return <Container className="py-10 sm:py-14">
    <section className="mx-auto grid max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-lift)] lg:grid-cols-[0.8fr_1.2fr]">
      <div className="relative overflow-hidden bg-ink px-6 py-8 text-white sm:px-8 lg:flex lg:min-h-[34rem] lg:flex-col lg:justify-between">
        <div className="absolute inset-inline-end-[-4rem] top-[-4rem] size-48 rounded-full border border-white/10" aria-hidden="true" />
        <div className="relative">
          <span className="grid size-11 place-items-center rounded-full border border-white/20 bg-white/5"><Plane aria-hidden="true" className="size-5" /></span>
          <p className={lang === "ar" ? "mt-6 text-xs font-semibold text-white/60" : "mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-white/60"}>{t("brand.airport")}</p>
          <p className="mt-2 max-w-xs text-xl font-bold leading-snug">{t("auth.secureAccess")}</p>
        </div>
        <p className="relative mt-8 text-xs leading-relaxed text-white/55">{t("auth.demoNote")}</p>
      </div>
      <div className="px-5 py-7 sm:px-8 sm:py-9">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        <div className="mt-6">{children}</div>
        {footer ? <div className="mt-5 border-t border-border pt-5">{footer}</div> : null}
      </div>
    </section>
  </Container>;
}
