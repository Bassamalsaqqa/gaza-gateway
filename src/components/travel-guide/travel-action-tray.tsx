import { AppLink } from "@/components/app-link";
import { btnClass } from "@/components/kit";
import type { Lang } from "@/lib/locale";
import { getSectionActions } from "./travel-helpers";
import { ArrowRight, ArrowLeft } from "lucide-react";

interface TravelActionTrayProps {
  sectionId: string;
  lang: Lang;
}

export function TravelActionTray({ sectionId, lang }: TravelActionTrayProps) {
  const actions = getSectionActions(sectionId, lang);
  const isAr = lang === "ar";
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  if (actions.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={isAr ? "إجراءات القسم" : "Section actions"}
      className="mt-8 flex flex-wrap items-center gap-3 border-t border-border/80 pt-6"
    >
      {actions.map((act, idx) => (
        <AppLink
          key={idx}
          to={act.to}
          className={btnClass(act.variant, "md", "gap-2")}
        >
          <span>{act.label}</span>
          {act.variant === "primary" ? (
            <Arrow className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          ) : null}
        </AppLink>
      ))}
    </div>
  );
}
