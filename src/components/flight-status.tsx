import type { FlightStatus } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const tones: Record<FlightStatus, string> = {
  Scheduled: "bg-secondary text-status-neutral",
  OnTime: "bg-brand-soft text-status-ontime",
  Boarding: "bg-status-boarding/12 text-status-boarding",
  Delayed: "bg-status-delayed/15 text-status-delayed",
  Departed: "bg-secondary text-foreground",
  Landed: "bg-secondary text-foreground",
  Cancelled: "bg-status-cancelled/12 text-status-cancelled",
};

export function StatusBadge({ status, className }: { status: FlightStatus; className?: string }) {
  const { t } = useI18n();
  const pulsing = status === "Boarding";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        tones[status],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full bg-current", pulsing && "animate-pulse")}
      />
      {t(`status.${status}`)}
    </span>
  );
}
