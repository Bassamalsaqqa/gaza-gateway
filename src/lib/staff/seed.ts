/**
 * Gaza Gateway — Canonical Staff Seeds
 *
 * Deterministic synthetic demo profiles for local development and demonstration.
 * These are compiled baseline demo records, not real employee claims.
 * Used when `gza.staff.v1` is missing; never written to storage on read.
 */

import type { StaffEnvelopeV1, StaffMember } from "./types.ts";

export const SEED_STAFF_MEMBERS: readonly StaffMember[] = [
  {
    id: "adm-1",
    name: { en: "Rana Habib", ar: "رنا حبيب" },
    email: "rana.habib@gza.ps",
    role: "admin",
    status: "active",
    title: { en: "Airport administrator", ar: "مسؤولة المطار" },
    createdAt: "2026-01-01T00:00:00.000Z",
    lastActiveAt: "2026-09-17T08:40:00.000Z",
  },
  {
    id: "adm-2",
    name: { en: "Yousef Nasser", ar: "يوسف ناصر" },
    email: "yousef.nasser@gza.ps",
    role: "editor",
    status: "active",
    title: { en: "Content editor", ar: "محرِّر المحتوى" },
    createdAt: "2026-01-01T00:00:00.000Z",
    lastActiveAt: "2026-09-16T15:12:00.000Z",
  },
  {
    id: "adm-3",
    name: { en: "Layla Odeh", ar: "ليلى عودة" },
    email: "layla.odeh@gza.ps",
    role: "viewer",
    status: "active",
    title: { en: "Operations viewer", ar: "مطالعة العمليات" },
    createdAt: "2026-01-01T00:00:00.000Z",
    lastActiveAt: "2026-09-15T11:03:00.000Z",
  },
  {
    id: "adm-4",
    name: { en: "Samir Khoury", ar: "سمير خوري" },
    email: "samir.khoury@gza.ps",
    role: "editor",
    status: "disabled",
    title: { en: "Content editor", ar: "محرِّر المحتوى" },
    createdAt: "2026-01-01T00:00:00.000Z",
    lastActiveAt: "2026-07-28T09:55:00.000Z",
  },
];

export function seedStaffEnvelope(): StaffEnvelopeV1 {
  return {
    schemaVersion: 1,
    revision: 1,
    staff: SEED_STAFF_MEMBERS.map((s) => ({ ...s })),
  };
}
