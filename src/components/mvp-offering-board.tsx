import { useI18n } from "@/lib/i18n";
import { MvpFlightSearchConsole } from "./mvp-flight-search-console";

/**
 * Commemorative flight search and departures board.
 * Reuses the shared intelligent offering console to provide one-way and round-trip searches,
 * live date availability chips, and nearest available date alternatives without dead ends.
 */
export function MvpOfferingBoard() {
  const { lang } = useI18n();
  const ar = lang === "ar";

  return (
    <section className="space-y-6" aria-label={ar ? "لوحة الرحلات" : "Flight board"}>
      <div>
        <h2 className="type-title-section">{ar ? "الرحلات" : "Flights"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {ar
            ? "مواعيد وجداول معتمدة لرحلات مطار غزة. ابحث عن رحلات الذهاب أو الذهاب والعودة مع بدائل متوفرة."
            : "Server-published schedules for Gaza Airport. Search one-way or round-trip journeys with available alternatives."}
        </p>
      </div>

      <MvpFlightSearchConsole variant="default" />
    </section>
  );
}
