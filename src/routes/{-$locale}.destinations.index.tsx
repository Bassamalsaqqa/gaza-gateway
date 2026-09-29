import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DestinationCard } from "@/components/destination-card";
import { Container, Field, Input } from "@/components/kit";
import { PublicPhotoHero } from "@/components/media/public-photo-hero";
import { destinations } from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";
import { publishedDestinationsPresentation } from "@/content/published/destinations-presentation";
import { ContentPreviewNotice, useContentPreview } from "@/content/preview";
import { getDestinationPhotoByCode, getDestinationPhotoById } from "@/lib/destination-media";

export const Route = createFileRoute("/{-$locale}/destinations/")({
  head: () => ({
    meta: [
      { title: "Destinations — Palestinian Airlines from Gaza (GZA)" },
      {
        name: "description",
        content:
          "Explore the Palestinian Airlines route network from Gaza International Airport: Amman, Cairo, Istanbul, Doha, Dubai, Jeddah and Riyadh.",
      },
      { property: "og:title", content: "Destinations from Gaza International Airport" },
      { property: "og:description", content: "Seven regional gateways in the opening Palestinian Airlines network." },
    ],
  }),
  component: DestinationsPage,
});

function DestinationsPage() {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");

  const { content: presentation, previewing } = useContentPreview(
    "destinations.presentation",
    publishedDestinationsPresentation,
  );

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return destinations;
    return destinations.filter((d) =>
      [d.code, d.city.en, d.city.ar, d.country.en, d.country.ar].join(" ").toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <>
      {previewing && <ContentPreviewNotice />}
      <PublicPhotoHero
        mediaId="destinations-hero"
        routeKey="destinations"
        title={t("dest.title")}
        description={t("dest.sub")}
        focalPosition="50% 45%"
      >
        <div className="max-w-sm">
          <Field label={t("flights.search")} htmlFor="dest-search" className="text-white/90 [&_label]:text-white/90">
            <Input
              id="dest-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={pick(lang, { en: "Amman, Cairo, DXB…", ar: "عمّان، القاهرة، دبي…" })}
              className="bg-card/95 text-foreground placeholder:text-muted-foreground border-white/20 focus-visible:ring-white"
            />
          </Field>
        </div>
      </PublicPhotoHero>

      <Container className="py-10">
        {list.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">{t("gallery.empty")}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((destination) => {
              const assignment = presentation.assignments.find((a) => a.code === destination.code);
              const photo =
                (assignment && getDestinationPhotoById(assignment.photoId)) ??
                getDestinationPhotoByCode(destination.code);
              return (
                <DestinationCard
                  key={destination.code}
                  destination={destination}
                  photoOverride={photo}
                  focalOverride={assignment?.focalPoint}
                />
              );
            })}
          </div>
        )}
      </Container>
    </>
  );
}
