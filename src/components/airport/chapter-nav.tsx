import { AppLink } from "@/components/app-link";
import { ArrowLeft, ArrowRight, BookOpen, Compass } from "lucide-react";
import { btnClass } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type AirportChapterId = "past" | "present" | "future" | "overview";

interface ChapterNavProps {
  activeChapter: AirportChapterId;
  className?: string;
}

const chapters = [
  {
    id: "past" as const,
    to: "/airport/past" as const,
    numeral: "01",
    labelKey: "airport.past" as const,
    horizonKey: "airport.pastHorizon" as const,
  },
  {
    id: "present" as const,
    to: "/airport/present" as const,
    numeral: "02",
    labelKey: "airport.present" as const,
    horizonKey: "airport.presentHorizon" as const,
  },
  {
    id: "future" as const,
    to: "/airport/future" as const,
    numeral: "03",
    labelKey: "airport.future" as const,
    horizonKey: "airport.futureHorizon" as const,
  },
] as const;

export function ChapterNav({ activeChapter, className }: ChapterNavProps) {
  const { t } = useI18n();

  return (
    <nav
      aria-label={t("airport.navAria")}
      className={cn(
        "relative rounded-2xl border border-border bg-card/80 p-1.5 shadow-[var(--shadow-soft)] backdrop-blur",
        className,
      )}
    >
      <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {/* Overview Anchor */}
        <AppLink
          to="/airport"
          aria-current={activeChapter === "overview" ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring sm:text-sm",
            activeChapter === "overview"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          <Compass aria-hidden="true" className="size-4 shrink-0" />
          <span>{t("airport.overview")}</span>
        </AppLink>

        <span aria-hidden="true" className="h-6 w-px shrink-0 bg-border/80" />

        {/* 3 Sequential Chapters */}
        <ol className="flex flex-1 items-center gap-1">
          {chapters.map((ch) => {
            const isActive = activeChapter === ch.id;
            return (
              <li key={ch.id} className="min-w-0 flex-1">
                <AppLink
                  to={ch.to}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-start transition-all focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                    isActive
                      ? "bg-sand text-foreground shadow-xs ring-1 ring-border/80"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "numeral grid size-6 shrink-0 place-items-center rounded-md font-mono text-xs font-bold transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground group-hover:text-foreground",
                    )}
                  >
                    {ch.numeral}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-foreground sm:text-sm">
                      {t(ch.labelKey)}
                    </span>
                    <span className="hidden truncate text-[11px] text-muted-foreground md:block">
                      {t(ch.horizonKey)}
                    </span>
                  </div>
                </AppLink>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}

interface ChapterPaginationProps {
  currentChapter: "past" | "present" | "future";
  className?: string;
}

export function ChapterPagination({ currentChapter, className }: ChapterPaginationProps) {
  const { t } = useI18n();

  const prev =
    currentChapter === "past"
      ? { to: "/airport" as const, label: t("airport.overview"), numeral: null }
      : currentChapter === "present"
        ? { to: "/airport/past" as const, label: t("airport.past"), numeral: "01" }
        : { to: "/airport/present" as const, label: t("airport.present"), numeral: "02" };

  const next =
    currentChapter === "past"
      ? { to: "/airport/present" as const, label: t("airport.present"), numeral: "02" }
      : currentChapter === "present"
        ? { to: "/airport/future" as const, label: t("airport.future"), numeral: "03" }
        : { to: "/gallery" as const, label: t("gallery.title"), numeral: null };

  return (
    <aside
      aria-label={t("airport.navAria")}
      className={cn("mt-14 border-t border-border pt-8", className)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Previous Relation */}
        <AppLink
          to={prev.to}
          className="group flex min-h-16 items-center gap-3.5 rounded-2xl border border-border bg-card p-4 transition-all hover:border-border/80 hover:bg-secondary/60 hover:shadow-xs focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-secondary text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <ArrowLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="eyebrow block text-muted-foreground">{t("airport.prevChapter")}</span>
            <span className="mt-0.5 block truncate text-base font-bold text-foreground">
              {prev.numeral ? (
                <>
                  <span className="numeral font-mono text-clay">{prev.numeral} · </span>
                </>
              ) : null}
              {prev.label}
            </span>
          </div>
        </AppLink>

        {/* Next Relation */}
        <AppLink
          to={next.to}
          className="group flex min-h-16 items-center justify-between gap-3.5 rounded-2xl border border-border bg-card p-4 text-end transition-all hover:border-border/80 hover:bg-secondary/60 hover:shadow-xs focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <div className="min-w-0 flex-1">
            <span className="eyebrow block text-muted-foreground">{t("airport.nextChapter")}</span>
            <span className="mt-0.5 block truncate text-base font-bold text-foreground">
              {next.numeral ? (
                <>
                  <span className="numeral font-mono text-clay">{next.numeral} · </span>
                </>
              ) : null}
              {next.label}
            </span>
          </div>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-primary text-primary-foreground transition-colors group-hover:bg-brand-deep">
            <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
          </span>
        </AppLink>
      </div>

      {/* Archive Discovery Strip */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-clay/20 bg-clay-soft/40 p-4 text-sm text-foreground">
        <div className="flex items-center gap-2.5">
          <BookOpen aria-hidden="true" className="size-4 shrink-0 text-clay" />
          <p className="text-sm font-medium">{t("airport.curatorialNotice")}</p>
        </div>
        <AppLink to="/gallery" className={btnClass("outline", "sm")}>
          {t("airport.exploreArchive")}
        </AppLink>
      </div>
    </aside>
  );
}
