import { dateParts } from "@/lib/format";
import type { Lang } from "@/lib/i18n";

/** Keep Western digits isolated while month names use the locale's interface font. */
export function DatePartsLabel({ iso, lang }: { iso: string; lang: Lang }) {
  const parts = dateParts(iso, lang);
  if (!parts) return null;
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap" data-slot="date-day-month">
      <span dir="ltr" className="numeral font-mono tabular-nums">{parts.day}</span>
      <span>{parts.month}</span>
    </span>
  );
}
