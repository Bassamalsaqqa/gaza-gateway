import * as React from "react";
import { ChevronsUpDown, Users } from "lucide-react";
import { normalizeSearch } from "@/components/airport-combobox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Traveler } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { btnClass } from "@/components/kit";
import { cn } from "@/lib/utils";

export interface SavedTravellerPickerProps {
  travelers: Traveler[];
  onSelectTraveler: (traveler: Traveler) => void;
  className?: string | undefined;
}

function travellerFilter(
  value: string,
  search: string,
  keywords?: string[],
): number {
  const normQuery = normalizeSearch(search);
  if (!normQuery) return 1;

  const normValue = normalizeSearch(value);
  if (normValue.includes(normQuery)) return 1;

  if (keywords && keywords.length > 0) {
    for (const kw of keywords) {
      if (normalizeSearch(kw).includes(normQuery)) return 1;
    }
  }

  const words = normQuery.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const haystack = [normValue, ...(keywords || [])].map(normalizeSearch).join(" ");
    if (words.every((w) => haystack.includes(w))) return 1;
  }

  return 0;
}

export function SavedTravellerPicker({
  travelers,
  onSelectTraveler,
  className,
}: SavedTravellerPickerProps) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  if (!travelers || travelers.length === 0) {
    return null;
  }

  const handleSelect = (traveler: Traveler) => {
    onSelectTraveler(traveler);
    setOpen(false);
    setTimeout(() => {
      triggerRef.current?.focus();
    }, 50);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={t("book.useSaved")}
          className={cn(
            btnClass("outline", "sm"),
            "inline-flex items-center gap-1.5 cursor-pointer select-none text-xs font-semibold",
            className,
          )}
        >
          <Users aria-hidden="true" className="size-3.5 text-muted-foreground shrink-0" />
          <span>{t("book.useSaved")}</span>
          <ChevronsUpDown aria-hidden="true" className="size-3 text-muted-foreground/70 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-80 p-0 rounded-xl border border-border bg-popover shadow-[var(--shadow-lift)] z-50 overflow-hidden"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        <Command filter={travellerFilter} className="border-0">
          <CommandInput
            placeholder={t("book.searchTravelers")}
            className="h-10 text-sm border-b border-border/80"
          />
          <CommandList className="max-h-64 overflow-y-auto p-1.5">
            <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">
              {t("book.noTravelersFound")}
            </CommandEmpty>
            <CommandGroup>
              {travelers.map((traveler) => (
                <CommandItem
                  key={traveler.id}
                  value={`${traveler.firstName} ${traveler.lastName} ${traveler.nationality} ${traveler.document} ${traveler.dob}`}
                  keywords={[
                    traveler.firstName,
                    traveler.lastName,
                    traveler.nationality,
                    traveler.document,
                    traveler.dob,
                  ]}
                  onSelect={() => handleSelect(traveler)}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer select-none rounded-lg text-sm transition-colors hover:bg-accent focus:bg-accent aria-selected:bg-accent"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-foreground truncate">
                      {traveler.firstName} {traveler.lastName}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                      {traveler.nationality ? (
                        <span>{traveler.nationality}</span>
                      ) : null}
                      {traveler.dob ? (
                        <>
                          {traveler.nationality ? <span aria-hidden="true">·</span> : null}
                          <span dir="ltr" className="code-id font-mono tabular-nums">
                            {traveler.dob}
                          </span>
                        </>
                      ) : null}
                      {traveler.document ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span dir="ltr" className="code-id font-mono tabular-nums">
                            {traveler.document}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
