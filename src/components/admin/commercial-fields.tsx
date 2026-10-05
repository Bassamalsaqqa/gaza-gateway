import { serviceOptions } from "@/lib/commercial/pricing";
import { useCommercialOptions } from "@/lib/commercial/queries";
import { CommercialCatalogState } from "@/components/commercial-catalog-state";
import type { ComponentProps } from "react";
import { Input } from "@/components/kit";
import { useI18n, pick } from "@/lib/i18n";
import { type Flight } from "@/lib/data";
import { SeatMap } from "@/components/booking/seat-map";
import { type LayoutGeometry } from "@/lib/fleet/layout";
import { type LegSeatLayoutSnapshot } from "@/lib/domain/booking";

export function CommercialInput({
  error,
  ...props
}: ComponentProps<typeof Input> & { error?: string | undefined }) {
  const { t } = useI18n();
  const errorId = `${props.id}-error`;
  return (
    <>
      <Input
        {...props}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : props["aria-describedby"]}
      />
      {error ? (
        <p id={errorId} className="mt-1 text-xs text-destructive">
          {t(error)}
        </p>
      ) : null}
    </>
  );
}

export function AssistanceChoices({
  value,
  retained = [],
  onChange,
}: {
  value: string[];
  retained?: string[];
  onChange: (value: string[]) => void;
}) {
  const { lang, t } = useI18n();
  const { assistanceOptions, query } = useCommercialOptions();
  if (!query.data || query.isError) return <CommercialCatalogState />;
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-xs font-semibold">{t("a2.bd.assistance")}</legend>
      {serviceOptions(assistanceOptions, retained).map((a) => (
        <label key={a.id} className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            value={a.id}
            checked={value.includes(a.id)}
            onChange={(e) =>
              onChange(e.target.checked ? [...value, a.id] : value.filter((id) => id !== a.id))
            }
            className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-ring"
          />
          {pick(lang, a.label)}{!a.active ? ` · ${t("commercial.retired")}` : ""}
        </label>
      ))}
    </fieldset>
  );
}

export function ServiceValue({
  value,
  kind,
}: {
  value: string | null | undefined;
  kind: "meal" | "assistance";
}) {
  const { lang, t } = useI18n();
  const { mealOptions, assistanceOptions } = useCommercialOptions();
  const options = kind === "meal" ? mealOptions : assistanceOptions;
  return (
    <>
      {value
        ? value
            .split(", ")
            .map((id) => {
              const option = options.find((x) => x.id === id);
              return option ? pick(lang, option.label) : id;
            })
            .join(" · ")
        : t("a2.none")}
    </>
  );
}

/** The existing SeatMap controls geometry/availability; commands validate again on commit. */
export function CommercialSeatPicker({
  flight,
  cabin,
  seats,
  leg,
  paxIndex,
  passengerLabels,
  layout,
  occupiedSeats,
  extraLegroomPrice,
  onSelect,
}: {
  flight: Flight | null;
  cabin: string;
  seats: Record<string, string>;
  leg: "out" | "in";
  paxIndex: number;
  passengerLabels: string[];
  layout?: LayoutGeometry | LegSeatLayoutSnapshot | undefined;
  occupiedSeats?: Set<string> | undefined;
  extraLegroomPrice?: number | undefined;
  onSelect: (seat: string) => void;
}) {
  const { t } = useI18n();
  if (!flight) return null;
  const assignments = Object.fromEntries(
    Object.entries(seats)
      .filter(([key]) => key.startsWith(`${leg}-`))
      .map(([key, value]) => [Number(key.slice(leg.length + 1)), value]),
  );
  return (
    <details className="min-w-0 rounded-md border border-border p-3">
      <summary className="cursor-pointer text-xs font-semibold focus-visible:outline-2 focus-visible:outline-ring">
        {t("book.seatTitle")}
      </summary>
      <SeatMap
        className="[&_.overflow-x-auto]:[direction:ltr]"
        flightId={flight.id}
        cabin={cabin}
        assignments={assignments}
        activePassenger={paxIndex}
        passengerLabels={passengerLabels}
        onActivePassengerChange={() => {}}
        onSelect={(_, seat) => onSelect(seat)}
        layout={layout}
        occupiedSeats={occupiedSeats}
        extraLegroomPrice={extraLegroomPrice}
      />
    </details>
  );
}
