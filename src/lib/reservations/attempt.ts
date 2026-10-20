import { generateCryptographicUuid } from "../api/identity-client-validators.ts";
import {
  guestReservationCommandSchema,
  reservationCommandSchema,
  type GuestReservationCommand,
  type ReservationCommand,
} from "./client.ts";

/** An uncertain network result must never mint a different logical submission. Memory only. */
export class ReservationAttempt {
  private command: ReservationCommand | GuestReservationCommand | null = null;
  private owner: string | null = null;
  get locked() { return this.command !== null; }
  get currentSubmissionId(): string | null { return this.command?.submissionId ?? null; }
  prepare(
    owner: string,
    input: Omit<ReservationCommand, "submissionId"> | Omit<GuestReservationCommand, "submissionId">,
    isGuest = false,
  ): ReservationCommand | GuestReservationCommand {
    const normalizedOwner = owner.trim().toLowerCase();
    if (this.command) {
      if (normalizedOwner !== this.owner) throw new Error("Account context changed.");
      return structuredClone(this.command);
    }
    const schema = isGuest ? guestReservationCommandSchema : reservationCommandSchema;
    const command = schema.parse({ ...input, submissionId: generateCryptographicUuid() });
    this.owner = normalizedOwner; this.command = structuredClone(command); return command;
  }
  /** Only a definitive HTTP rejection authorizes editing/new logical submission. */
  rejected(status: number | undefined) {
    if (status === 409 || status === 422) { this.command = null; this.owner = null; }
  }
}
