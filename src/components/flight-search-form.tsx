import { useAppNavigate } from "@/components/app-link";
import { ArrowLeftRight, Calendar, Search, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

  // Preserved draft for return date to prevent accidental erasure when toggling round-trip to one-way
  const [returnDateDraft, setReturnDateDraft] = useState<string>(() => criteria.returnDate || "");
  const [minDate, setMinDate] = useState<string>(() => criteria.departDate || "");
  const [paxOpen, setPaxOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paxButtonRef = useRef<HTMLButtonElement | null>(null);
  const paxDropdownRef = useRef<HTMLDivElement | null>(null);

  // Initialize volatile dates on client mount after hydration
  useEffect(() => {
    const today = todayISO();
    const ret = addDaysISO(today, 6);
    setMinDate(today);
    setCriteria((prev) => {
      const needsDate = !prev.departDate;
      const isPast = prev.departDate && prev.departDate < today;
      if (needsDate || isPast) {
        const nextReturn =
          prev.tripType === "round"
            ? prev.returnDate && prev.returnDate >= today
              ? prev.returnDate
              : ret
            : prev.returnDate;
        setReturnDateDraft(nextReturn || ret);
        return {
          ...prev,
          departDate: today,
          returnDate: nextReturn,
        };
      }
      return prev;
    });
  }, []);

  // Dismiss passenger dropdown on outside click or Escape key
  useEffect(() => {
    if (!paxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPaxOpen(false);
        paxButtonRef.current?.focus();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (
        paxDropdownRef.current &&
        !paxDropdownRef.current.contains(e.target as Node) &&
        paxButtonRef.current &&
        !paxButtonRef.current.contains(e.target as Node)
      ) {
        setPaxOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [paxOpen]);

  const set = <K extends keyof SearchCriteria>(key: K, value: SearchCriteria[K]) =>
    setCriteria((prev) => ({ ...prev, [key]: value }));

  /**
   * Trip Type State & Draft Preservation (§10.5.2):
   * Toggling to one-way preserves return date as draft; toggling back restores it.
   */
  const handleTripTypeChange = (type: "round" | "oneway") => {
    if (type === "oneway") {
      if (criteria.returnDate) {
        setReturnDateDraft(criteria.returnDate);
      }
      setCriteria((prev) => ({ ...prev, tripType: "oneway" }));
    } else {
      const restored = returnDateDraft || addDaysISO(criteria.departDate || todayISO(), 6);
      setCriteria((prev) => ({ ...prev, tripType: "round", returnDate: restored }));
    }
  };

  /**
   * Departure & Return date relationship (§10.5.3):
   * Never silently mutate user return date when departure moves forward.
   */
  const handleDepartDateChange = (newDepart: string) => {
    setCriteria((prev) => ({
      ...prev,
      departDate: newDepart,
    }));
  };

  const handleReturnDateChange = (newReturn: string) => {
    setReturnDateDraft(newReturn);
    setCriteria((prev) => ({
      ...prev,
      returnDate: newReturn,
    }));
  };

  /**
   * Network constraint: GZA <-> destination.
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
      if (side === "origin") next.destination = GZA.code;
      else next.origin = GZA.code;
      return next;
    });

  const swap = () =>
    setCriteria((prev) => ({ ...prev, origin: prev.destination, destination: prev.origin }));

  /** Infants travel on adult's lap: infants <= adults. */
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

  // Field-associated date range check
  const isDatePairInvalid =
    criteria.tripType === "round" &&
    Boolean(criteria.departDate && criteria.returnDate && criteria.returnDate < criteria.departDate);

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
        "relative rounded-2xl border border-border bg-card transition-shadow",
        variant === "panel"
          ? "p-4 sm:p-6 lg:p-7 shadow-[var(--shadow-lift)]"
          : "p-4 sm:p-5 shadow-[var(--shadow-soft)]",
      )}
    >
      {/* Accessible Trip Type Fieldset */}
      <fieldset className="border-0 p-0 m-0">
        <legend className="sr-only">{t("search.tripType")}</legend>
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-3">
          {(["round", "oneway"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => handleTripTypeChange(type)}
              aria-pressed={criteria.tripType === type}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-semibold sm:text-sm transition-all focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                criteria.tripType === type
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-sand-deep",
              )}
            >
              {t(type === "round" ? "search.roundTrip" : "search.oneWay")}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Main Console Inputs Grid */}
      <div className="mt-4 grid gap-3.5 sm:gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Origin and Destination with Tactile Swap */}
        <div className="relative grid gap-3 sm:grid-cols-2 lg:col-span-2">
          <Field label={t("search.from")} htmlFor="search-from">
            <Select
              id="search-from"
              value={criteria.origin}
              onChange={(e) => setEndpoint("origin", e.target.value)}
              className="font-medium"
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
            title={t("search.swap")}
            className="absolute start-1/2 top-1/2 z-10 hidden size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-[var(--shadow-soft)] transition-transform hover:scale-105 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring sm:flex rtl:translate-x-1/2"
          >
            <ArrowLeftRight aria-hidden="true" className="size-4 rtl:rotate-180" />
          </button>

          <Field label={t("search.to")} htmlFor="search-to">
            <Select
              id="search-to"
              value={criteria.destination}
              onChange={(e) => setEndpoint("destination", e.target.value)}
              className="font-medium"
            >
              {options.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Departure Date (Strict LTR Latin ASCII Digits) */}
        <Field label={t("search.depart")} htmlFor="search-depart">
          <div className="relative">
            <Input
              id="search-depart"
              type="date"
              min={minDate || undefined}
              value={criteria.departDate}
              onChange={(e) => {
                handleDepartDateChange(e.target.value);
                if (!minDate) setMinDate(todayISO());
              }}
              dir="ltr"
              required
              className="code-id text-start font-mono tabular-nums ps-9"
            />
            <Calendar
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
          </div>
        </Field>

        {/* Return Date (Strict LTR digits; error programmatically associated via aria-describedby) */}
        <Field
          label={t("search.return")}
          htmlFor="search-return"
          hint={criteria.tripType === "oneway" ? t("search.oneWay") : undefined}
          error={isDatePairInvalid ? t("search.errReturn") : undefined}
          errorId="search-return-error"
        >
          <div className="relative">
            <Input
              id="search-return"
              type="date"
              min={criteria.departDate || minDate || undefined}
              value={criteria.tripType === "oneway" ? "" : criteria.returnDate}
              onChange={(e) => handleReturnDateChange(e.target.value)}
              disabled={criteria.tripType === "oneway"}
              aria-invalid={isDatePairInvalid}
              aria-describedby={isDatePairInvalid ? "search-return-error" : undefined}
              dir="ltr"
              className={cn(
                "code-id text-start font-mono tabular-nums ps-9",
                isDatePairInvalid && "border-destructive focus-visible:outline-destructive",
                criteria.tripType === "oneway" && "bg-muted/40 cursor-not-allowed",
              )}
            />
            <Calendar
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
          </div>
        </Field>
      </div>

      {/* Secondary Controls: Passengers, Cabin & Search Action */}
      <div className="mt-3.5 sm:mt-4 grid gap-3.5 sm:gap-4 md:grid-cols-[1.2fr_1.2fr_auto]">
        {/* Passenger Selector with Accessible Dropdown */}
        <div className="relative">
          <Field label={t("search.passengers")}>
            <button
              ref={paxButtonRef}
              type="button"
              onClick={() => setPaxOpen((v) => !v)}
              aria-expanded={paxOpen}
              aria-haspopup="dialog"
              aria-controls="pax-dropdown-dialog"
              className="flex h-11 w-full items-center justify-between rounded-lg border border-input bg-card px-3.5 text-sm font-medium transition-colors hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <span className="flex items-center gap-2">
                <Users aria-hidden="true" className="size-4 text-muted-foreground" />
                <span>
                  {total === 1
                    ? t("search.passengerCountOne")
                    : t("search.passengerCount", { n: total })}
                </span>
              </span>
              <span className="numeral text-xs font-semibold text-muted-foreground">
                ({total})
              </span>
            </button>
          </Field>

          {paxOpen ? (
            <div
              id="pax-dropdown-dialog"
              ref={paxDropdownRef}
              role="dialog"
              aria-label={t("search.passengers")}
              className="absolute z-30 mt-2 w-full min-w-72 rounded-xl border border-border bg-popover p-4 shadow-[var(--shadow-lift)]"
            >
              <div className="space-y-3">
                {(
                  [
                    ["adults", "search.adults", 1, 9],
                    ["children", "search.children", 0, 8],
                    ["infants", "search.infants", 0, 4],
                  ] as const
                ).map(([key, label, min, max]) => (
                  <div key={key} className="flex items-center justify-between gap-4 py-1">
                    <span className="text-sm font-semibold">{t(label)}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="flex size-8 items-center justify-center rounded-md border border-input bg-card text-base font-semibold transition-colors hover:bg-secondary disabled:opacity-40 disabled:hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                        onClick={() => setPax(key, Math.max(min, criteria[key] - 1))}
                        disabled={criteria[key] <= min}
                        aria-label={`${t(label)} −`}
                      >
                        −
                      </button>
                      <span className="numeral w-7 text-center font-mono text-sm font-bold">
                        {criteria[key]}
                      </span>
                      <button
                        type="button"
                        className="flex size-8 items-center justify-center rounded-md border border-input bg-card text-base font-semibold transition-colors hover:bg-secondary disabled:opacity-40 disabled:hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                        onClick={() => setPax(key, Math.min(paxMax(key, max), criteria[key] + 1))}
                        disabled={criteria[key] >= paxMax(key, max)}
                        aria-label={`${t(label)} +`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-3 border-t border-border pt-2.5 text-xs text-muted-foreground">
                {t("search.infantNote")}
              </p>

              <button
                type="button"
                onClick={() => {
                  setPaxOpen(false);
                  paxButtonRef.current?.focus();
                }}
                className={btnClass("secondary", "sm", "mt-3 w-full justify-center")}
              >
                {t("search.done")}
              </button>
            </div>
          ) : null}
        </div>

        {/* Cabin Class Selection */}
        <Field label={t("search.cabin")} htmlFor="search-cabin">
          <Select
            id="search-cabin"
            value={criteria.cabin}
            onChange={(e) => set("cabin", e.target.value)}
            className="font-medium"
          >
            {cabins.map((c) => (
              <option key={c.id} value={c.id}>
                {t(c.label)}
              </option>
            ))}
          </Select>
        </Field>

        {/* Action Button */}
        <div className="flex items-end">
          <button
            type="submit"
            className={btnClass(
              "primary",
              "lg",
              "w-full md:w-auto min-h-[44px] px-7 shadow-[var(--shadow-soft)] hover:shadow-md",
            )}
          >
            <Search aria-hidden="true" className="size-4" />
            <span>{t("search.submit")}</span>
          </button>
        </div>
      </div>

      {/* Validation Banner */}
      {error ? (
        <div
          role="alert"
          aria-live="polite"
          className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive"
        >
          <span>{error}</span>
        </div>
      ) : null}
    </form>
  );
}
