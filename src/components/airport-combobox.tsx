import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Command as CommandPrimitive } from "cmdk";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { Airport } from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Arabic & Latin search normalization according to repository standard.
 * Strips combining accents/diacritics and Arabic tashkeel, and unifies alef,
 * alif maqsura, and taa marbuta variants.
 */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Latin combining diacritical marks
    .replace(/[\u064B-\u065F\u0670]/g, "") // Arabic tashkeel / harakat
    .replace(/[أإآٱ]/g, "ا") // Unify alef variants
    .replace(/[ى]/g, "ي") // Unify alif maqsura
    .replace(/[ة]/g, "ه") // Unify taa marbuta
    .trim();
}

/**
 * Multi-dimensional airport filtering for cmdk:
 * Matches case-insensitively across IATA code, city (EN/AR), country (EN/AR),
 * and airport name (EN/AR), ranking exact code matches highest.
 */
export function airportFilter(
  value: string,
  search: string,
  keywords?: string[],
): number {
  const normQuery = normalizeSearch(search);
  if (!normQuery) return 1;

  const normValue = normalizeSearch(value);

  // Exact IATA match gets absolute top score
  if (normValue === normQuery) return 1;

  // IATA code prefix match (e.g. "GZ" -> GZA)
  if (normValue.startsWith(normQuery)) return 0.98;

  if (keywords && keywords.length > 0) {
    // Exact keyword match
    for (const kw of keywords) {
      if (kw === normQuery) return 0.95;
    }

    // Keyword prefix match
    for (const kw of keywords) {
      if (kw.startsWith(normQuery)) return 0.9;
    }

    // Keyword substring match
    for (const kw of keywords) {
      if (kw.includes(normQuery)) return 0.8;
    }

    // Multi-word query: all words must be found in the composite keywords
    const words = normQuery.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      const allHaystack = [normValue, ...keywords].join(" ");
      if (words.every((w) => allHaystack.includes(w))) return 0.75;
    }
  }

  return 0;
}

export interface AirportComboboxProps {
  id?: string;
  value: string;
  onChange: (code: string) => void;
  airports: Airport[];
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}

export function AirportCombobox({
  id,
  value,
  onChange,
  airports,
  label,
  ariaLabel,
  placeholder,
  searchPlaceholder,
  emptyText,
  disabled = false,
  className,
}: AirportComboboxProps) {
  const { t, lang } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const selectedAirport = React.useMemo(
    () => airports.find((a) => a.code === value),
    [airports, value],
  );

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSearch("");
    }
  };

  const handleSelect = (code: string) => {
    onChange(code);
    handleOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel || label || t("search.selectAirport")}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && !open) {
              e.preventDefault();
              handleOpenChange(true);
            }
          }}
          className={cn(
            "flex h-11 min-h-[44px] w-full items-center justify-between rounded-lg border border-input bg-card px-3 text-sm font-medium transition-colors hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring cursor-pointer select-none",
            disabled && "cursor-not-allowed opacity-50 pointer-events-none",
            className,
          )}
        >
          {selectedAirport ? (
            <div className="flex items-center gap-2 min-w-0 flex-1 text-start">
              <span className="font-semibold text-foreground truncate">
                {pick(lang, selectedAirport.city)}
              </span>
              <span
                dir="ltr"
                className="font-mono text-xs font-bold text-muted-foreground uppercase px-1.5 py-0.5 rounded bg-muted/80 tracking-wider shrink-0 tabular-nums"
              >
                {selectedAirport.code}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground truncate">
              {placeholder || t("search.selectAirport")}
            </span>
          )}
          <ChevronsUpDown
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground opacity-60 ms-2"
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        collisionPadding={12}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
        onCloseAutoFocus={(e) => {
          if (triggerRef.current && triggerRef.current.isConnected) {
            e.preventDefault();
            triggerRef.current.focus();
          }
        }}
        className="w-[calc(100vw-2rem)] sm:w-[var(--radix-popover-trigger-width,340px)] sm:min-w-[300px] max-w-[420px] p-0 shadow-[var(--shadow-lift)] rounded-xl border border-border bg-popover z-50 overflow-hidden"
      >
        <Command
          filter={airportFilter}
          defaultValue={value}
          loop
          className="flex h-full w-full flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground"
        >
          <div
            className="flex items-center border-b border-border/80 px-3 py-2"
            cmdk-input-wrapper=""
          >
            <Search className="size-4 shrink-0 text-muted-foreground opacity-50 me-2" />
            <CommandPrimitive.Input
              ref={inputRef}
              value={search}
              onValueChange={setSearch}
              placeholder={searchPlaceholder || t("search.searchAirport")}
              className="flex h-9 w-full rounded-md bg-transparent text-base sm:text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              autoFocus
            />
          </div>
          <CommandList className="max-h-[260px] overflow-y-auto p-1.5 focus:outline-none">
            <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">
              {emptyText || t("search.noAirportsFound")}
            </CommandEmpty>
            <CommandGroup>
              {airports.map((airport) => {
                const isSelected = airport.code === value;
                const keywords = [
                  normalizeSearch(airport.code),
                  normalizeSearch(airport.city.en),
                  normalizeSearch(airport.city.ar),
                  normalizeSearch(airport.country.en),
                  normalizeSearch(airport.country.ar),
                  normalizeSearch(airport.name.en),
                  normalizeSearch(airport.name.ar),
                ];
                return (
                  <CommandItem
                    key={airport.code}
                    value={airport.code}
                    keywords={keywords}
                    onSelect={() => handleSelect(airport.code)}
                    className={cn(
                      "flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg cursor-pointer select-none text-sm transition-colors",
                      "data-[selected=true]:bg-secondary data-[selected=true]:text-foreground hover:bg-secondary/70",
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span
                        dir="ltr"
                        className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-muted/80 text-foreground shrink-0 tabular-nums"
                      >
                        {airport.code}
                      </span>
                      <div className="min-w-0 flex-1 flex flex-col">
                        <div className="flex items-baseline gap-1.5 truncate">
                          <span className="font-semibold text-foreground truncate text-sm">
                            {pick(lang, airport.city)}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">
                            · {pick(lang, airport.country)}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground/80 truncate">
                          {pick(lang, airport.name)}
                        </span>
                      </div>
                    </div>
                    <Check
                      aria-hidden="true"
                      className={cn(
                        "size-4 shrink-0 text-primary transition-opacity ms-2",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
