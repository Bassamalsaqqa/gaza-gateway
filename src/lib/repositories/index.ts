/**
 * Gaza Gateway — Repositories Public API
 */

export * from "./types.ts";
export * from "./storage.ts";
export * from "./booking-repository.ts";
export * from "./flight-repository.ts";
export * from "./registry.ts";
export * from "./queries.ts";
export type {
  BookingDraftRepository,
  BookingDraftStorageState,
  BookingDraftState,
} from "../booking-draft/index.ts";
export { LocalBookingDraftRepository } from "../booking-draft/index.ts";
export type {
  ContactTopic,
  ContactStatus,
  ContactLanguage,
  InternalNote,
  ContactMessage,
  ContactEnvelope,
  ContactFilterOptions,
  ContactCreateInput,
  ContactRepository,
} from "../contact/index.ts";
export {
  LocalContactRepository,
  InMemoryContactRepository,
  ContactStorageCoordinator,
  CONTACT_STORAGE_KEY,
  CONTACT_SCHEMA_VERSION,
  CANONICAL_CONTACT_SEEDS,
} from "../contact/index.ts";
