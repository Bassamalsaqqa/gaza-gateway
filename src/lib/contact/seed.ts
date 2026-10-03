/**
 * Gaza Gateway — Canonical Contact Seed Data
 *
 * Deterministic baseline seeds migrated from legacy inbox fixtures.
 * Only each message's declared original-language body is preserved
 * (no fabricated bilingual translations). Legacy "access" is mapped to "accessibility".
 */

import type { ContactMessage } from "./types.ts";

export const CANONICAL_CONTACT_SEEDS: ContactMessage[] = [
  {
    id: "m1",
    submissionId: "seed-m1",
    senderName: "Nadia Sabbagh",
    email: "nadia.sabbagh@example.com",
    topic: "booking",
    language: "ar",
    status: "new",
    createdAt: "2026-09-17T09:12:00.000Z",
    updatedAt: "2026-09-17T09:12:00.000Z",
    bookingRef: "GZA4TQ",
    message: "أرغب بتأخير عودتي من عمّان يومين. ما الخيارات المتاحة؟",
    source: "seed",
    internalNotes: [],
  },
  {
    id: "m2",
    submissionId: "seed-m2",
    senderName: "Rami Barghouti",
    email: "rami.barghouti@example.com",
    topic: "accessibility",
    language: "en",
    status: "open",
    createdAt: "2026-09-16T17:48:00.000Z",
    updatedAt: "2026-09-16T17:48:00.000Z",
    bookingRef: "GZA1QE",
    message: "My father uses a wheelchair. How is assistance arranged at the airport?",
    source: "seed",
    internalNotes: [],
  },
  {
    id: "m3",
    submissionId: "seed-m3",
    senderName: "Layan Zurub",
    email: "layan.zurub@example.com",
    topic: "archive",
    language: "ar",
    status: "open",
    createdAt: "2026-09-15T11:05:00.000Z",
    updatedAt: "2026-09-15T11:05:00.000Z",
    bookingRef: undefined,
    message: "لديّ صور عائلية لمبنى المطار وأرغب بمشاركتها.",
    source: "seed",
    internalNotes: [],
  },
  {
    id: "m4",
    submissionId: "seed-m4",
    senderName: "Studio Press Desk",
    email: "desk@example.com",
    topic: "media",
    language: "en",
    status: "resolved",
    createdAt: "2026-09-14T08:20:00.000Z",
    updatedAt: "2026-09-14T08:20:00.000Z",
    bookingRef: undefined,
    message: "We are preparing a feature on the airport and would like to request permission to use archive images.",
    source: "seed",
    internalNotes: [],
  },
  {
    id: "m5",
    submissionId: "seed-m5",
    senderName: "Unknown sender",
    email: "no-reply@example.net",
    topic: "other",
    language: "en",
    status: "spam",
    createdAt: "2026-09-13T03:02:00.000Z",
    updatedAt: "2026-09-13T03:02:00.000Z",
    bookingRef: undefined,
    message: "Promotional message.",
    source: "seed",
    internalNotes: [],
  },
];

export function getCanonicalSeeds(): ContactMessage[] {
  return structuredClone(CANONICAL_CONTACT_SEEDS);
}
