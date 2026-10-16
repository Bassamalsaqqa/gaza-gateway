import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useCallback } from "react";
import { Container } from "@/components/kit";
import { PublicPhotoHero } from "@/components/media/public-photo-hero";
import { publishedTravel } from "@/content/published/travel";
import { ContentPreviewNotice, useContentPreview } from "@/content/preview";
import { pick, useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/head";
import { getBreadcrumbSchema } from "@/lib/structured-data";
import { AppLink } from "@/components/app-link";
import { btnClass } from "@/components/kit";
import {
  normalizeTravelSections,
  resolveActiveSection,
  TravelNav,
  TravelSectionView,
} from "@/components/travel-guide";
import { Plane, Sparkles } from "lucide-react";

type TravelSearch = {
  skinPreview?: 1;
  studioPreview?: 1;
  section?: string;
  baseline?: 1;
};

export const Route = createFileRoute("/{-$locale}/travel")({
  validateSearch: (search: Record<string, unknown>): TravelSearch => {
    const out: TravelSearch = {};
    const rawPreview = search["skinPreview"];
    if (rawPreview === "1" || rawPreview === 1 || rawPreview === '"1"') {
      out.skinPreview = 1;
    }
    const rawStudio = search["studioPreview"];
    if (rawStudio === "1" || rawStudio === 1 || rawStudio === '"1"') {
      out.studioPreview = 1;
    }
    if (typeof search["section"] === "string") {
      out.section = search["section"];
    }
    const rawBaseline = search["baseline"];
    if (rawBaseline === "1" || rawBaseline === 1 || rawBaseline === '"1"') {
      out.baseline = 1;
    }
    return out;
  },
  head: ({ params }) => {
    const isAr = params.locale === "ar";
    return pageHead({
      locale: params.locale,
      path: "/travel",
      en: {
        title: publishedTravel.seo.title.en,
        description: publishedTravel.seo.description.en,
        socialTitle: "Travel Information — Gaza International Airport (GZA)",
        socialDescription: "Guide to flight bookings, passenger documents, tickets, and airport history.",
      },
      ar: {
        title: publishedTravel.seo.title.ar,
        description: publishedTravel.seo.description.ar,
        socialTitle: "إرشادات السفر — مطار غزة الدولي (GZA)",
        socialDescription: "دليل حجوزات الرحلات، وثائق المسافر، التذاكر، وتاريخ المطار.",
      },
      image: "/social/gaza-airport.jpg",
      schema: [
        getBreadcrumbSchema([
          { name: isAr ? "الرئيسية" : "Home", path: isAr ? "/ar" : "/" },
          { name: isAr ? "إرشادات السفر" : "Travel Information", path: isAr ? "/ar/travel" : "/travel" },
        ]),
      ],
    });
  },
  component: TravelPage,
});

function TravelPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const { content, previewing, previewError, previewLoading } = useContentPreview("travel", publishedTravel);

  // Normalize visible sections and points
  const travelSections = useMemo(
    () => normalizeTravelSections(content.sections),
    [content.sections],
  );

  // Read URL hash on client mount & listen for hash changes
  const [hashSection, setHashSection] = useState<string>(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      return window.location.hash.replace(/^[#/]+/, "").trim();
    }
    return "";
  });

  useEffect(() => {
    const handleHash = () => {
      if (typeof window !== "undefined") {
        setHashSection(window.location.hash.replace(/^[#/]+/, "").trim());
      }
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  // URL query parameter is primary source of truth; fallback to hash; fallback to first section
  const activeId = useMemo(() => {
    return resolveActiveSection(
      travelSections,
      search.section,
      hashSection,
    );
  }, [travelSections, search.section, hashSection]);

  // Navigate to update URL search param without oscillation
  const handleSelectSection = useCallback(
    (id: string) => {
      if (id === activeId) return;
      void navigate({
        search: (prev) => ({
          ...prev,
          section: id,
        }),
        replace: true,
      });
    },
    [activeId, navigate],
  );

  const activeSection = travelSections.find((s) => s.id === activeId) || travelSections[0];

  return (
    <>
      {previewing ? <ContentPreviewNotice error={previewError} loading={previewLoading} /> : null}

      <PublicPhotoHero
        mediaId="travel-info-hero"
        routeKey="travel"
        title={pick(lang, content.intro.title)}
        description={pick(lang, content.intro.description)}
        focalPosition="50% 50%"
      />

      <Container className="py-6 sm:py-10">
        {travelSections.length > 0 ? (
          <>
            {/* Guide Navigation Bar with roving focus & keyboard support */}
            <TravelNav
              sections={travelSections}
              activeId={activeSection?.id ?? ""}
              onSelect={handleSelectSection}
              lang={lang}
            />

            {/* Active Section Surface */}
            {activeSection ? (
              <TravelSectionView section={activeSection} lang={lang} />
            ) : null}

            {/* Next Steps Footer */}
            <section
              aria-label={isAr ? "الخطوات التالية للمسافر" : "Traveler Next Steps"}
              className="mt-10 sm:mt-12 rounded-2xl border border-border bg-card/60 p-5 sm:p-7 shadow-xs"
            >
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="max-w-[58ch]">
                  <h3 className="font-display text-lg sm:text-xl font-bold tracking-tight text-foreground">
                    {isAr
                      ? "استكشاف الرحلات وحجز التذاكر"
                      : "Explore Routes & Flight Reservations"}
                  </h3>
                  <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    {isAr
                      ? "اختر وجهتك عبر شبكة الخطوط الجوية الفلسطينية، واستلم تذكرتك المجانية، أو استرجع حجزك في أي وقت."
                      : "Choose a destination across the Palestinian Airlines network, receive your free printable ticket, or retrieve an existing reservation anytime."}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <AppLink to="/flights" className={btnClass("primary", "md", "gap-2 text-xs sm:text-sm")}>
                    <Plane className="size-4 shrink-0" aria-hidden="true" />
                    <span>{isAr ? "استعراض المواعيد" : "Explore Timetables"}</span>
                  </AppLink>
                  <AppLink to="/book" className={btnClass("outline", "md", "gap-2 text-xs sm:text-sm")}>
                    <Sparkles className="size-4 shrink-0" aria-hidden="true" />
                    <span>{isAr ? "حجز رحلة" : "Book Flight"}</span>
                  </AppLink>
                  <AppLink to="/manage" className={btnClass("ghost", "md", "text-xs sm:text-sm")}>
                    <span>{isAr ? "إدارة الحجز" : "Manage Booking"}</span>
                  </AppLink>
                </div>
              </div>
            </section>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-8 sm:p-12 text-center text-muted-foreground">
            <p className="text-sm sm:text-base font-medium">
              {isAr
                ? "لا توجد أقسام إرشادية معروضة حالياً."
                : "No guide sections are currently available."}
            </p>
          </div>
        )}
      </Container>
    </>
  );
}
