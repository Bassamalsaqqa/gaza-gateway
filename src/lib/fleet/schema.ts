/**
 * Gaza Gateway — Fleet Zod Validation Schemas
 *
 * Enforces strict validation rules for aircraft and layout definitions,
 * including unique registrations, continuous non-overlapping cabin zones,
 * valid aisle positions, and existing unavailable seat codes.
 */

import { z } from "zod";
import { parseSeatCode } from "./layout.ts";

/**
 * Standard aviation registration pattern (e.g. "PS-GZA", "SU-ABC", "JY-RAM", "A6-EDA").
 * 1-4 uppercase alphanumeric prefix, hyphen, 1-5 uppercase alphanumeric suffix.
 */
export const AIRCRAFT_REGISTRATION_REGEX = /^[A-Z0-9]{1,4}-[A-Z0-9]{1,5}$/;

export const cabinIdSchema = z.enum(["business", "premium", "economy"]);

export const seatZoneSchema = z.object({
  id: cabinIdSchema,
  firstRow: z.number().int().min(1),
  lastRow: z.number().int().min(1),
}).refine((z) => z.lastRow >= z.firstRow, {
  message: "SeatZone lastRow must be greater than or equal to firstRow",
  path: ["lastRow"],
});

export const aircraftSchema = z.object({
  id: z.string().trim().min(1).max(64),
  model: z.string().trim().min(1).max(120),
  registration: z
    .string()
    .trim()
    .transform((val) => val.toUpperCase())
    .refine((val) => AIRCRAFT_REGISTRATION_REGEX.test(val), {
      message: "Registration must follow aviation format (e.g. PS-GZA)",
    }),
  active: z.boolean(),
});

export const aircraftLayoutSchema = z
  .object({
    aircraftId: z.string().trim().min(1),
    rows: z.number().int().min(1).max(60),
    letters: z
      .array(
        z
          .string()
          .length(1)
          .regex(/^[A-Z]$/, "Seat letter must be a single uppercase letter A-Z"),
      )
      .min(1)
      .max(10)
      .refine((letters) => new Set(letters).size === letters.length, {
        message: "Seat letters must be unique",
      }),
    aisleAfter: z.number().int().min(1),
    zones: z.array(seatZoneSchema).min(1).transform((zones) => [...zones].sort((a, b) => a.firstRow - b.firstRow)),
    extraLegroomRows: z.array(z.number().int().min(1)).default([]),
    unavailable: z.array(z.string().trim().toUpperCase()).default([]),
  })
  .superRefine((layout, ctx) => {
    // 1. Validate aisleAfter < letters.length (no aisle after the last column)
    if (layout.aisleAfter >= layout.letters.length) {
      ctx.addIssue({
        code: "custom",
        message: "aisleAfter must be strictly less than letters.length",
        path: ["aisleAfter"],
      });
    }

    // 2. Validate zones: each cabin at most once
    const cabinSet = new Set<string>();
    for (let i = 0; i < layout.zones.length; i++) {
      const z = layout.zones[i]!;
      if (cabinSet.has(z.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Cabin '${z.id}' is defined more than once in zones`,
          path: ["zones", i, "id"],
        });
      }
      cabinSet.add(z.id);
    }

    // 3. Validate zones: continuous, ascending, covering rows 1 through layout.rows exactly
    if (layout.zones.length > 0) {
      // First zone must start at row 1
      if (layout.zones[0]!.firstRow !== 1) {
        ctx.addIssue({
          code: "custom",
          message: "First cabin zone must start at row 1",
          path: ["zones", 0, "firstRow"],
        });
      }

      // Subsequent zones must immediately follow the previous zone
      for (let i = 1; i < layout.zones.length; i++) {
        const prev = layout.zones[i - 1]!;
        const curr = layout.zones[i]!;
        if (curr.firstRow !== prev.lastRow + 1) {
          ctx.addIssue({
            code: "custom",
            message: `Cabin zone ${curr.id} must start at row ${prev.lastRow + 1} (immediately after ${prev.id})`,
            path: ["zones", i, "firstRow"],
          });
        }
      }

      // Last zone must end at layout.rows
      const lastZone = layout.zones[layout.zones.length - 1]!;
      if (lastZone.lastRow !== layout.rows) {
        ctx.addIssue({
          code: "custom",
          message: `Last cabin zone must end at row ${layout.rows}`,
          path: ["zones", layout.zones.length - 1, "lastRow"],
        });
      }
    }

    // 4. Validate extraLegroomRows: unique, within 1..rows
    const legroomSet = new Set<number>();
    for (let i = 0; i < layout.extraLegroomRows.length; i++) {
      const r = layout.extraLegroomRows[i]!;
      if (r < 1 || r > layout.rows) {
        ctx.addIssue({
          code: "custom",
          message: `Extra legroom row ${r} is outside layout rows (1-${layout.rows})`,
          path: ["extraLegroomRows", i],
        });
      }
      if (legroomSet.has(r)) {
        ctx.addIssue({
          code: "custom",
          message: `Extra legroom row ${r} is duplicated`,
          path: ["extraLegroomRows", i],
        });
      }
      legroomSet.add(r);
    }

    // 5. Validate unavailable: unique valid seat codes in layout
    const unavailSet = new Set<string>();
    for (let i = 0; i < layout.unavailable.length; i++) {
      const code = layout.unavailable[i]!;
      const parsed = parseSeatCode(code);
      if (!parsed) {
        ctx.addIssue({
          code: "custom",
          message: `Unavailable seat code '${code}' has invalid syntax`,
          path: ["unavailable", i],
        });
      } else if (
        parsed.row < 1 ||
        parsed.row > layout.rows ||
        !layout.letters.includes(parsed.letter)
      ) {
        ctx.addIssue({
          code: "custom",
          message: `Unavailable seat code '${code}' does not exist in layout grid`,
          path: ["unavailable", i],
        });
      } else if (unavailSet.has(code)) {
        ctx.addIssue({
          code: "custom",
          message: `Unavailable seat code '${code}' is duplicated`,
          path: ["unavailable", i],
        });
      }
      unavailSet.add(code);
    }
  });

export const fleetStorageSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().min(0),
    aircraft: z.array(aircraftSchema),
    layouts: z.record(z.string(), aircraftLayoutSchema),
  })
  .superRefine((data, ctx) => {
    // Check aircraft IDs are unique
    const idSet = new Set<string>();
    // Check registrations are unique case-insensitively
    const regSet = new Set<string>();

    for (let i = 0; i < data.aircraft.length; i++) {
      const plane = data.aircraft[i]!;
      if (idSet.has(plane.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate aircraft id: ${plane.id}`,
          path: ["aircraft", i, "id"],
        });
      }
      idSet.add(plane.id);

      const upperReg = plane.registration.toUpperCase();
      if (regSet.has(upperReg)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate aircraft registration: ${plane.registration}`,
          path: ["aircraft", i, "registration"],
        });
      }
      regSet.add(upperReg);
    }

    // Check each aircraft has exactly one matching layout in layouts
    for (const plane of data.aircraft) {
      const layout = data.layouts[plane.id];
      if (!layout) {
        ctx.addIssue({
          code: "custom",
          message: `Missing layout for aircraft id: ${plane.id}`,
          path: ["layouts", plane.id],
        });
      } else if (layout.aircraftId !== plane.id) {
        ctx.addIssue({
          code: "custom",
          message: `Layout aircraftId '${layout.aircraftId}' does not match key '${plane.id}'`,
          path: ["layouts", plane.id, "aircraftId"],
        });
      }
    }

    // Check no orphaned layouts
    for (const layoutId of Object.keys(data.layouts)) {
      if (!idSet.has(layoutId)) {
        ctx.addIssue({
          code: "custom",
          message: `Orphaned layout without matching aircraft: ${layoutId}`,
          path: ["layouts", layoutId],
        });
      }
    }
  });
