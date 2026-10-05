import type { Schedule } from "../schedules/types.ts";

/** Recurring planning frequency, not a dated operational/service count. */
export function plannedWeeklyDepartures(code: string, schedules: readonly Schedule[]): number {
  return schedules.filter(s => s.destination === code && s.active && s.direction === "out")
    .reduce((sum, schedule) => sum + schedule.days.length, 0);
}
