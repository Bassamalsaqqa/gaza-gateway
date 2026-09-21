import { AppLink } from "@/components/app-link";
import { ArrowLeft, ArrowRight } from "lucide-react";
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
  },
  {
    id: "present" as const,
    to: "/airport/present" as const,
    numeral: "02",
    labelKey: "airport.present" as const,
  },
  {
    id: "future" as const,
    to: "/airport/future" as const,
    numeral: "03",
    labelKey: "airport.future" as const,
  },
] as const;

export function ChapterNav({ activeChapter, className }: ChapterNavProps) {
  const { t } = useI18n();

  return (
    <nav
      data-slot="airport-chapter-rail"
      aria-label={t("airport.navAria")}
      className={cn("border-b border-border bg-transparent", className)}
    >
      <div className="flex items-center gap-3 sm:gap-6 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {/* Overview Anchor */}
        <AppLink
          to="/airport"
          aria-current={activeChapter === "overview" ? "page" : undefined}
          className={cn(
            "inline-flex h-12 shrink-0 items-center border-b-2 px-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
            activeChapter === "overview"
              ? "border-primary font-semibold text-foreground"
              : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
          )}
        >
          <span>{t("airport.overview")}</span>
        </AppLink>

        {/* 3 Sequential Chapters */}
        <ol className="flex items-center gap-3 sm:gap-6">
          {chapters.map((ch) => {
            const isActive = activeChapter === ch.id;
            return (
              <li key={ch.id} className="shrink-0">
                <AppLink
                  to={ch.to}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "inline-flex h-12 items-center gap-1.5 border-b-2 px-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                    isActive
                      ? "border-primary font-semibold text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  <span className="code-id text-xs text-muted-foreground">
                    {ch.numeral}
                  </span>
                  <span>{t(ch.labelKey)}</span>
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
      data-slot="chapter-pagination"
      aria-label={t("airport.navAria")}
      className={cn("mt-14 border-t border-border pt-8", className)}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Previous Relation */}
        <AppLink
          to={prev.to}
          className="group inline-flex min-h-[44px] items-center gap-2.5 text-sm font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <ArrowLeft aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-hover:-translate-x-0.5 rtl:rotate-180 rtl:group-hover:translate-x-0.5" />
          <span>
            {prev.numeral ? (
              <span className="code-id text-muted-foreground me-1.5">{prev.numeral}</span>
            ) : null}
            {prev.label}
          </span>
        </AppLink>

        {/* Next Relation */}
        <AppLink
          to={next.to}
          className="group inline-flex min-h-[44px] items-center gap-2.5 text-sm font-semibold text-foreground transition-colors hover:text-primary sm:ms-auto focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <span>
            {next.numeral ? (
              <span className="code-id text-muted-foreground me-1.5">{next.numeral}</span>
            ) : null}
            {next.label}
          </span>
          <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
        </AppLink>
      </div>

      {/* Archive Discovery Strip */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-sm text-foreground">
        <p className="text-sm text-muted-foreground">{t("airport.curatorialNotice")}</p>
        <AppLink to="/gallery" className={btnClass("outline", "md")}>
          {t("airport.exploreArchive")}
        </AppLink>
      </div>
    </aside>
  );
}
