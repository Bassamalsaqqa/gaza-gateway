import { useAppNavigate } from "@/components/app-link";
import { ArrowLeftRight, Search, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { btnClass, Field, Input, Select } from "./kit";
import { GZA, addDaysISO, cabins, destinations, todayISO } from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";
import { paxCount, useStore, type SearchCriteria } from "@/lib/store";
import { cn } from "@/lib/utils";

export function FlightSearchForm({
  variant = "panel",
  initial,
}: {
  variant?: "panel" | "inline";
  initial?: Partial<SearchCriteria>;
}) {
  const { t, lang } = useI18n();
  const { draft, resetDraft } = useStore();
  const navigate = useAppNavigate();
  const [criteria, setCriteria] = useState<SearchCriteria>(() => ({
    ...draft.criteria,
    ...initial,
  }));
  const [minDate, setMinDate] = useState<string>(() => criteria.departDate || "");
  const [paxOpen, setPaxOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize volatile dates on client mount after hydration
  useEffect(() => {
    const today = todayISO();
    const ret = addDaysISO(today, 6);
    setMinDate(today);
    setCriteria((prev) => {
      const needsDate = !prev.departDate;
      const isPast = prev.departDate && prev.departDate < today;
      if (needsDate || isPast) {
        return {
          ...prev,
          departDate: today,
          returnDate:
            prev.tripType === "round"
              ? prev.returnDate && prev.returnDate >= today
                ? prev.returnDate
                : ret
              : prev.returnDate,
        };
      }
      return prev;
    });
  }, []);

  const set = <K extends keyof SearchCriteria>(key: K, value: SearchCriteria[K]) =>
    setCriteria((prev) => ({ ...prev, [key]: value }));

  /**
   * The opening network is GZA <-> destination, so one endpoint is always GZA.
   * Changing one endpoint constrains the other instead of allowing an
   * impossible destination-to-destination pair.
   */
  const setEndpoint = (side: "origin" | "destination", code: string) =>
    setCriteria((prev) => {
      const other = side === "origin" ? prev.destination : prev.origin;
      const next = { ...prev, [side]: code } as SearchCriteria;
      if (code === GZA.code) {
        if (other === GZA.code) {
          if (side === "origin") next.destination = destinations[0]?.code ?? "AMM";
          else next.origin = destinations[0]?.code ?? "AMM";
        }
        return next;
      }
      // A non-GZA endpoint forces the other side to Gaza.
      if (side === "origin") next.destination = GZA.code;
      else next.origin = GZA.code;
      return next;
    });

  const swap = () =>
    setCriteria((prev) => ({ ...prev, origin: prev.destination, destination: prev.origin }));

  /** Infants travel on an adult's lap, so there can never be more infants than adults. */
  const setPax = (key: "adults" | "children" | "infants", value: number) =>
    setCriteria((prev) => {
      const next = { ...prev, [key]: value } as SearchCriteria;
      if (next.infants > next.adults) next.infants = next.adults;
      return next;
    });

  const paxMax = (key: "adults" | "children" | "infants", max: number) =>
    key === "infants" ? Math.min(max, criteria.adults) : max;

  const options = [
    { code: GZA.code, label: `${pick(lang, GZA.city)} · GZA` },
    ...destinations.map((d) => ({ code: d.code, label: `${pick(lang, d.city)} · ${d.code}` })),
  ];

  const total = paxCount(criteria);

  const validate = (c: SearchCriteria): string | null => {
    if (c.origin === c.destination) return t("search.errSame");
    if (c.origin !== GZA.code && c.destination !== GZA.code) return t("search.errNetwork");
    if (!c.departDate) return t("search.errDepart");
    if (c.departDate < todayISO()) return t("search.errPast");
    if (c.tripType === "round" && (!c.returnDate || c.returnDate < c.departDate))
      return t("search.errReturn");
    if (c.infants > c.adults) return t("search.errInfants");
    return null;
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = validate(criteria);
    setError(problem);
    if (problem) return;
    resetDraft(criteria);
    void navigate({ to: "/book" });
  };

  return (
    <form
      onSubmit={submit}
      aria-label={t("search.title")}
      className={cn(
        variant === "panel"
          ? "rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-lift)] sm:p-6"
          : "rounded-xl border border-border bg-card p-4",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {(["round", "oneway"] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => set("tripType", type)}
            aria-pressed={criteria.tripType === type}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              criteria.tripType === type
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {t(type === "round" ? "search.roundTrip" : "search.oneWay")}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div className="relative grid gap-3 sm:grid-cols-2 lg:col-span-2">
          <Field label={t("search.from")} htmlFor="search-from">
            <Select
              id="search-from"
              value={criteria.origin}
              onChange={(e) => setEndpoint("origin", e.target.value)}
            >
              {options.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <button
            type="button"
            onClick={swap}
            aria-label={t("search.swap")}
            className="absolute start-1/2 top-1/2 z-10 hidden size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-input bg-card text-muted-foreground transition-colors hover:text-foreground sm:flex rtl:translate-x-1/2"
          >
            <ArrowLeftRight aria-hidden="true" className="size-4" />
          </button>
          <Field label={t("search.to")} htmlFor="search-to">
            <Select
              id="search-to"
              value={criteria.destination}
              onChange={(e) => setEndpoint("destination", e.target.value)}
            >
              {options.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={t("search.depart")} htmlFor="search-depart">
          <Input
            id="search-depart"
            type="date"
            min={minDate || undefined}
            value={criteria.departDate}
            onChange={(e) => {
              set("departDate", e.target.value);
              if (!minDate) setMinDate(todayISO());
            }}
            required
          />
        </Field>

        <Field
          label={t("search.return")}
          htmlFor="search-return"
          hint={criteria.tripType === "oneway" ? t("search.oneWay") : undefined}
        >
          <Input
            id="search-return"
            type="date"
            min={criteria.departDate || minDate || undefined}
            value={criteria.tripType === "oneway" ? "" : criteria.returnDate}
            onChange={(e) => set("returnDate", e.target.value)}
            disabled={criteria.tripType === "oneway"}
          />
        </Field>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <div className="relative">
          <Field label={t("search.passengers")}>
            <button
              type="button"
              onClick={() => setPaxOpen((v) => !v)}
              aria-expanded={paxOpen}
              className="flex h-11 w-full items-center justify-between rounded-lg border border-input bg-card px-3.5 text-sm"
            >
              <span className="flex items-center gap-2">
                <Users aria-hidden="true" className="size-4 text-muted-foreground" />
                {total === 1
                  ? t("search.passengerCountOne")
                  : t("search.passengerCount", { n: total })}
              </span>
            </button>
          </Field>
          {paxOpen ? (
            <div className="absolute z-20 mt-2 w-full min-w-64 rounded-xl border border-border bg-popover p-4 shadow-[var(--shadow-lift)]">
              {(
                [
                  ["adults", "search.adults", 1, 9],
                  ["children", "search.children", 0, 8],
                  ["infants", "search.infants", 0, 4],
                ] as const
              ).map(([key, label, min, max]) => (
                <div key={key} className="flex items-center justify-between gap-4 py-2">
                  <span className="text-sm font-medium">{t(label)}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="size-8 rounded-md border border-input text-lg leading-none disabled:opacity-40"
                      onClick={() => setPax(key, Math.max(min, criteria[key] - 1))}
                      disabled={criteria[key] <= min}
                      aria-label={`${t(label)} −`}
                    >
                      −
                    </button>
                    <span className="numeral w-6 text-center text-sm font-semibold">
                      {criteria[key]}
                    </span>
                    <button
                      type="button"
                      className="size-8 rounded-md border border-input text-lg leading-none disabled:opacity-40"
                      onClick={() => setPax(key, Math.min(paxMax(key, max), criteria[key] + 1))}
                      disabled={criteria[key] >= paxMax(key, max)}
                      aria-label={`${t(label)} +`}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
              <p className="mt-1 text-xs text-muted-foreground">{t("search.infantNote")}</p>
              <button
                type="button"
                onClick={() => setPaxOpen(false)}
                className={btnClass("secondary", "sm", "mt-3 w-full")}
              >
                {t("search.done")}
              </button>
            </div>
          ) : null}
        </div>

        <Field label={t("search.cabin")} htmlFor="search-cabin">
          <Select
            id="search-cabin"
            value={criteria.cabin}
            onChange={(e) => set("cabin", e.target.value)}
          >
            {cabins.map((c) => (
              <option key={c.id} value={c.id}>
                {t(c.label)}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex items-end">
          <button type="submit" className={btnClass("primary", "lg", "w-full md:w-auto")}>
            <Search aria-hidden="true" className="size-4" />
            {t("search.submit")}
          </button>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
