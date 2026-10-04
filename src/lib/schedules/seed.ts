/**
 * Gaza Gateway — Schedule Seeds
 *
 * Deterministic compiled recurring schedule seeds.
 * Identical to the seeds previously in admin-ops.ts.
 * Used when localStorage key is missing; never written on read.
 */

import { destinations } from "../data.ts";
import type { Schedule } from "./types.ts";

const outSlots = ["07:15", "08:40", "10:05", "13:20", "16:45", "19:10", "21:35"];
const inSlots = ["11:30", "12:55", "14:20", "17:35", "20:00", "22:25", "06:50"];

function addMinutes(time: string, minutes: number): string {
  const [hh, mm] = time.split(":");
  const total = Number(hh ?? 0) * 60 + Number(mm ?? 0) + minutes;
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${`${Math.floor(wrapped / 60)}`.padStart(2, "0")}:${`${wrapped % 60}`.padStart(2, "0")}`;
}

const AIRCRAFT_NAMES = ["Airbus A320neo", "Airbus A321neo", "Boeing 737-800"] as const;

/** Deterministic recurring schedule seeds. Called when storage key is missing. */
export function seedSchedules(): Schedule[] {
  const list: Schedule[] = [];
  destinations.forEach((dest, i) => {
    const aircraft = AIRCRAFT_NAMES[i % AIRCRAFT_NAMES.length] as string;
    const out = outSlots[i % outSlots.length] as string;
    const back = inSlots[i % inSlots.length] as string;
    list.push({
      id: `sch-${dest.code}-out`,
      number: `PS${100 + i * 2}`,
      direction: "out",
      destination: dest.code,
      days: [...dest.days],
      departTime: out,
      arriveTime: addMinutes(out, dest.flightMinutes),
      aircraft,
      from: "2026-01-11",
      until: "2026-12-19",
      active: true,
      exceptions: [],
    });
    list.push({
      id: `sch-${dest.code}-in`,
      number: `PS${101 + i * 2}`,
      direction: "in",
      destination: dest.code,
      days: [...dest.days],
      departTime: back,
      arriveTime: addMinutes(back, dest.flightMinutes),
      aircraft,
      from: "2026-01-11",
      until: "2026-12-19",
      active: dest.code !== "RUH",
      exceptions: [],
    });
  });
  const first = list[0];
  if (first) {
    first.exceptions = [
      { id: "exc-1", date: "2026-10-03", kind: "cancelled", detail: "Runway maintenance window" },
      { id: "exc-2", date: "2026-10-17", kind: "time", detail: "Departs 09:10 instead of 07:15" },
    ];
  }
  const second = list[2];
  if (second) {
    second.exceptions = [
      { id: "exc-3", date: "2026-11-05", kind: "aircraft", detail: "Operated by Airbus A321neo" },
    ];
  }
  return list;
}
