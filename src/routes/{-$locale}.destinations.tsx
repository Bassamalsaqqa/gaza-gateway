import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DestinationCard } from "@/components/destination-card";
import { Container, Field, Input, PageHeader } from "@/components/kit";
import { destinations } from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/{-$locale}/destinations")({
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

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return destinations;
    return destinations.filter((d) =>
      [d.code, d.city.en, d.city.ar, d.country.en, d.country.ar].join(" ").toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <>
      <PageHeader title={t("dest.title")} description={t("dest.sub")}>
        <div className="max-w-sm">
          <Field label={t("flights.search")} htmlFor="dest-search">
            <Input
              id="dest-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={pick(lang, { en: "Amman, Cairo, DXB…", ar: "عمّان، القاهرة، دبي…" })}
            />
          </Field>
        </div>
      </PageHeader>

      <Container className="py-10">
        {list.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">{t("gallery.empty")}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((destination) => (
              <DestinationCard key={destination.code} destination={destination} />
            ))}
          </div>
        )}
      </Container>
    </>
  );
}
