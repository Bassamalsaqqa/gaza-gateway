import { z } from "zod";
import type { MvpApiClient } from "../api/mvp-client.ts";
import { MvpApiError } from "../api/mvp-client.ts";
import { getMvpUiClient } from "../api/mvp-ui-runtime.ts";
import {
  guestReservationCommandSchema,
  reservationCommandSchema,
  reservationDetailSchema,
  type GuestReservationCommand,
  type ReservationCommand,
  type ReservationDetail,
} from "./client.ts";

const ref = z.string().regex(/^[A-Za-z0-9_-]{6,16}(?![\s\S])/);
const code = z.string().trim().regex(/^\d{6}$/);

export const emailChallengeRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
}).strict();

export const emailChallengeResponseSchema = z.object({
  challengeId: z.string().uuid(),
  expiresInSeconds: z.number().int().positive(),
}).strict();

export const emailVerificationRequestSchema = z.object({
  challengeId: z.string().uuid(),
  code,
}).strict();

export const emailVerificationResponseSchema = z.object({
  verified: z.literal(true),
}).strict();

export const accessChallengeRequestSchema = z.object({
  reference: ref,
  email: z.string().trim().toLowerCase().email().max(254),
}).strict();

export const accessChallengeResponseSchema = z.object({
  challengeId: z.string().uuid(),
  expiresInSeconds: z.number().int().positive(),
}).strict();

export const accessVerificationRequestSchema = z.object({
  challengeId: z.string().uuid(),
  code,
}).strict();

export const accessVerificationResponseSchema = z.object({
  verified: z.literal(true),
  reference: ref,
}).strict();

export const guestCancellationSchema = z.object({
  reference: ref,
  status: z.literal("cancelled"),
  changed: z.boolean(),
  cancelledAt: z.string().nullable(),
}).strict();

export const guestTicketSchema = z.object({
  reference: ref,
  status: z.enum(["confirmed", "cancelled"]),
  tickets: reservationDetailSchema.innerType().shape.ticket.shape.tickets,
}).strict().superRefine((data, ctx) => {
  if (data.tickets.some(t => t.reference !== data.reference || t.status !== data.status)) {
    ctx.addIssue({ code: "custom", message: "Passenger ticket reference or status mismatch." });
  }
});

export type EmailChallengeRequest = z.infer<typeof emailChallengeRequestSchema>;
export type EmailChallengeResponse = z.infer<typeof emailChallengeResponseSchema>;
export type EmailVerificationRequest = z.infer<typeof emailVerificationRequestSchema>;
export type EmailVerificationResponse = z.infer<typeof emailVerificationResponseSchema>;
export type AccessChallengeRequest = z.infer<typeof accessChallengeRequestSchema>;
export type AccessChallengeResponse = z.infer<typeof accessChallengeResponseSchema>;
export type AccessVerificationRequest = z.infer<typeof accessVerificationRequestSchema>;
export type AccessVerificationResponse = z.infer<typeof accessVerificationResponseSchema>;
export type GuestCancellation = z.infer<typeof guestCancellationSchema>;
export type GuestTicket = z.infer<typeof guestTicketSchema>;

/** In-memory verification grant lifetime: 30 minutes. */
const GRANT_LIFETIME_MS = 30 * 60 * 1000;

/**
 * GuestReservationClient
 *
 * Implements guest email verification, guest booking creation, and booking management
 * via OTP challenges without account creation.
 *
 * Security & Invariants:
 * - Session-scoped cookies and CSRF protection via passenger bootstrap.
 * - No tokens or PII stored in localStorage or URL parameters.
 * - In-memory verification grants expire after 30 minutes.
 * - Challenge lifetime: 10 minutes (600s), bounded to 5 attempts on the server.
 * - Generic error messages prevent booking or email enumeration.
 * - Lost grant (401/403) cleanly clears in-memory state for reverification.
 */
export class GuestReservationClient {
  constructor(privateClient: () => MvpApiClient = getMvpUiClient) {
    this.client = privateClient;
  }

  private readonly client: () => MvpApiClient;
  private readonly verifiedEmails = new Map<string, number>();
  private readonly verifiedReferences = new Map<string, { email: string; expiresAt: number }>();

  /** Request a 6-digit email verification code for guest checkout. */
  async requestEmailChallenge(email: string): Promise<EmailChallengeResponse> {
    const normalized = emailChallengeRequestSchema.parse({ email }).email;
    return this.client().request({
      method: "POST",
      path: "/guest-reservations/email-challenges",
      realm: "passenger",
      body: { email: normalized },
      statuses: [202],
      schema: emailChallengeResponseSchema,
    });
  }

  /** Verify a 6-digit email code for guest checkout. Grants 30min in-memory booking proof. */
  async verifyEmail(challengeId: string, inputCode: string, emailForGrant?: string): Promise<EmailVerificationResponse> {
    const body = emailVerificationRequestSchema.parse({ challengeId, code: inputCode });
    const result = await this.client().request({
      method: "POST",
      path: "/guest-reservations/email-verifications",
      realm: "passenger",
      body,
      statuses: [200],
      schema: emailVerificationResponseSchema,
    });
    if (emailForGrant) {
      const normalized = emailForGrant.trim().toLowerCase();
      this.verifiedEmails.set(normalized, Date.now() + GRANT_LIFETIME_MS);
    }
    return result;
  }

  /** Check if email holds an active in-memory verification grant. */
  isEmailVerified(email: string): boolean {
    const normalized = email.trim().toLowerCase();
    const expiresAt = this.verifiedEmails.get(normalized);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      this.verifiedEmails.delete(normalized);
      return false;
    }
    return true;
  }

  /** Invalidate in-memory email verification grant (e.g. user modified email). */
  invalidateEmailGrant(email?: string): void {
    if (email) {
      this.verifiedEmails.delete(email.trim().toLowerCase());
    } else {
      this.verifiedEmails.clear();
    }
  }

  /** Create guest reservation. Requires email verification on the backend. */
  async create(command: GuestReservationCommand | ReservationCommand): Promise<ReservationDetail> {
    const isStrictAccount =
      "passengers" in command &&
      command.passengers.length > 0 &&
      "dob" in command.passengers[0]! &&
      Boolean((command.passengers[0] as { dob?: unknown }).dob);
    const body = isStrictAccount && reservationCommandSchema.safeParse(command).success
      ? reservationCommandSchema.parse(command)
      : guestReservationCommandSchema.parse(command);
    const normalizedEmail = body.contact.email.trim().toLowerCase();

    try {
      const data = await this.client().request({
        method: "POST",
        path: "/guest-reservations",
        realm: "passenger",
        body,
        statuses: [200, 201],
        schema: reservationDetailSchema,
      });

      // Strict response-to-command cross validation matching existing ReservationClient
      if (
        data.reservation.contact.email.toLowerCase() !== normalizedEmail ||
        data.reservation.contact.phone !== body.contact.phone ||
        data.reservation.serviceId !== body.serviceId ||
        data.reservation.passengers.length !== body.passengers.length ||
        data.reservation.passengers.some(
          p =>
            !body.passengers.some(
              item => {
                const nameMatches =
                  ("name" in item && item.name?.trim() === p.firstName) ||
                  ("firstName" in item && item.firstName?.trim() === p.firstName);
                const lastMatches =
                  ("lastName" in item ? (item.lastName?.trim() || null) : null) === (p.lastName || null);
                const typeMatches = ("type" in item && item.type ? item.type : "adult") === p.type;
                return (
                  item.id === p.id &&
                  item.seatCode === p.seatCode &&
                  typeMatches &&
                  nameMatches &&
                  lastMatches
                );
              },
            ),
        )
      ) {
        throw new MvpApiError("protocol");
      }

      // Record in-memory management access for newly created booking
      this.verifiedReferences.set(data.reservation.reference, {
        email: normalizedEmail,
        expiresAt: Date.now() + GRANT_LIFETIME_MS,
      });

      return data;
    } catch (error) {
      if (error instanceof MvpApiError && (error.status === 401 || error.status === 403)) {
        this.verifiedEmails.delete(normalizedEmail);
      }
      throw error;
    }
  }

  /** Request management access challenge. Returns decoy or real challenge shape identically. */
  async requestAccessChallenge(reference: string, email: string): Promise<AccessChallengeResponse> {
    const body = accessChallengeRequestSchema.parse({ reference, email });
    return this.client().request({
      method: "POST",
      path: "/guest-reservations/access-challenges",
      realm: "passenger",
      body,
      statuses: [202],
      schema: accessChallengeResponseSchema,
    });
  }

  /** Verify access challenge code. On success, grants 30min in-memory access proof. */
  async verifyAccess(challengeId: string, inputCode: string, expectedReference?: string, emailForGrant?: string): Promise<AccessVerificationResponse> {
    const body = accessVerificationRequestSchema.parse({ challengeId, code: inputCode });
    const result = await this.client().request({
      method: "POST",
      path: "/guest-reservations/access-verifications",
      realm: "passenger",
      body,
      statuses: [200],
      schema: accessVerificationResponseSchema,
    });

    if (expectedReference && result.reference !== expectedReference) {
      throw new MvpApiError("protocol");
    }

    this.verifiedReferences.set(result.reference, {
      email: (emailForGrant ?? "").trim().toLowerCase(),
      expiresAt: Date.now() + GRANT_LIFETIME_MS,
    });

    return result;
  }

  /** Check if a reference holds active in-memory management proof. */
  isAccessVerified(reference: string): boolean {
    ref.parse(reference);
    const grant = this.verifiedReferences.get(reference);
    if (!grant) return false;
    if (Date.now() > grant.expiresAt) {
      this.verifiedReferences.delete(reference);
      return false;
    }
    return true;
  }

  /** Invalidate in-memory reference access proof (e.g. user unmounts or resets). */
  invalidateAccessGrant(reference?: string): void {
    if (reference) {
      this.verifiedReferences.delete(reference);
    } else {
      this.verifiedReferences.clear();
    }
  }

  /** Fetch guest reservation detail. Session-scoped proof required on server. */
  async detail(reference: string, options?: { signal?: AbortSignal }): Promise<ReservationDetail> {
    ref.parse(reference);
    try {
      const data = await this.client().request({
        method: "GET",
        path: `/guest-reservations/${reference}`,
        realm: "passenger",
        schema: reservationDetailSchema,
        signal: options?.signal,
      });
      if (data.reservation.reference !== reference) throw new MvpApiError("protocol");
      return data;
    } catch (error) {
      if (error instanceof MvpApiError && (error.status === 401 || error.status === 403)) {
        this.verifiedReferences.delete(reference);
      }
      throw error;
    }
  }

  /** Fetch guest reservation ticket. Session-scoped proof required on server. */
  async ticket(reference: string, options?: { signal?: AbortSignal }): Promise<GuestTicket> {
    ref.parse(reference);
    try {
      const data = await this.client().request({
        method: "GET",
        path: `/guest-reservations/${reference}/ticket`,
        realm: "passenger",
        schema: guestTicketSchema,
        signal: options?.signal,
      });
      if (data.reference !== reference) throw new MvpApiError("protocol");
      return data;
    } catch (error) {
      if (error instanceof MvpApiError && (error.status === 401 || error.status === 403)) {
        this.verifiedReferences.delete(reference);
      }
      throw error;
    }
  }

  /** Cancel guest reservation. Session-scoped proof required on server. */
  async cancel(reference: string, options?: { signal?: AbortSignal }): Promise<GuestCancellation> {
    ref.parse(reference);
    try {
      const data = await this.client().request({
        method: "POST",
        path: `/guest-reservations/${reference}/cancel`,
        realm: "passenger",
        body: {},
        statuses: [200],
        schema: guestCancellationSchema,
        signal: options?.signal,
      });
      if (data.reference !== reference) throw new MvpApiError("protocol");
      return data;
    } catch (error) {
      if (error instanceof MvpApiError && (error.status === 401 || error.status === 403)) {
        this.verifiedReferences.delete(reference);
      }
      throw error;
    }
  }
}

export const guestReservationClient = new GuestReservationClient();
