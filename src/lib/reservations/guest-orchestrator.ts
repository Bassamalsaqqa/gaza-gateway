import type { GuestReservationClient } from "./guest-client.ts";
import type { TripClient, TripResponse } from "./trip-client.ts";
import type { ReservationAttempt } from "./attempt.ts";
import type { TripReservationAttempt } from "./trip-client.ts";
import type { ReservationDetail } from "./client.ts";
import { MvpApiError } from "../api/mvp-client.ts";

export interface GuestPassengerInput {
  id: string;
  type?: "adult" | "child";
  firstName: string;
  lastName?: string | null;
  dob?: string | null;
  nationality?: string | null;
  document?: string | null;
  seatCode: string;
  returnSeatCode?: string;
  mealId?: string | null;
  returnMealId?: string | null;
}

export interface GuestOrchestrationParams {
  guestClient: GuestReservationClient;
  tripClient: TripClient;
  oneWayAttempt: ReservationAttempt;
  tripAttempt: TripReservationAttempt;
  isRoundTrip: boolean;
  email: string;
  phone?: string;
  serviceId: string;
  returnServiceId?: string | undefined;
  passengers: GuestPassengerInput[];
  challengeId: string | null;
  otpCode: string;
  isEmailVerified: boolean;
  postDispatched: boolean;
  postAmbiguous: boolean;
  crossSessionRecoveryRequired: boolean;
}

export type GuestOrchestrationResult =
  | {
      success: true;
      type: "one-way";
      receipt: ReservationDetail;
      verifiedEmail: string;
    }
  | {
      success: true;
      type: "round-trip";
      receipt: TripResponse;
      verifiedEmail: string;
    }
  | {
      success: false;
      stage: "draft_validation" | "verifier" | "submission";
      error: string;
      status?: number | undefined;
      postDispatched: boolean;
      postAmbiguous: boolean;
      crossSessionRecoveryRequired: boolean;
      verifiedEmail?: string | undefined;
    };

export async function orchestrateGuestBooking(
  params: GuestOrchestrationParams,
): Promise<GuestOrchestrationResult> {
  const normEmail = params.email.trim().toLowerCase();
  const principalScope = `guest:${normEmail}`;

  // 1. Check if cross-session recovery is required after prior ambiguous POST
  if (params.crossSessionRecoveryRequired || (params.postAmbiguous && !params.isEmailVerified)) {
    return {
      success: false,
      stage: "submission",
      error: "cross_session_recovery_required",
      postDispatched: params.postDispatched,
      postAmbiguous: true,
      crossSessionRecoveryRequired: true,
    };
  }

  // 2. Prepare & Freeze draft BEFORE verification (schema validation first)
  let oneWayCommand;
  let tripCommand;

  try {
    if (params.isRoundTrip) {
      if (!params.returnServiceId) {
        return {
          success: false,
          stage: "draft_validation",
          error: "missing_return_service",
          postDispatched: params.postDispatched,
          postAmbiguous: params.postAmbiguous,
          crossSessionRecoveryRequired: false,
        };
      }
      tripCommand = params.tripAttempt.prepare(
        principalScope,
        {
          contact: { email: normEmail, phone: params.phone?.trim() ?? "" },
          legs: [
            {
              serviceId: params.serviceId,
              passengers: params.passengers.map(p => ({
                id: p.id,
                name: p.firstName.trim(),
                lastName: p.lastName?.trim() || null,
                type: p.type,
                seatCode: p.seatCode,
                dob: p.dob || null,
                nationality: p.nationality?.trim() || null,
                document: p.document?.trim() || null,
                mealId: p.mealId || null,
              })),
            },
            {
              serviceId: params.returnServiceId,
              passengers: params.passengers.map(p => ({
                id: p.id,
                name: p.firstName.trim(),
                lastName: p.lastName?.trim() || null,
                type: p.type,
                seatCode: p.returnSeatCode ?? "",
                dob: p.dob || null,
                nationality: p.nationality?.trim() || null,
                document: p.document?.trim() || null,
                mealId: p.returnMealId || null,
              })),
            },
          ],
        },
        true,
      );
    } else {
      oneWayCommand = params.oneWayAttempt.prepare(
        principalScope,
        {
          serviceId: params.serviceId,
          contact: { email: normEmail, phone: params.phone?.trim() ?? "" },
          passengers: params.passengers.map(p => ({
            id: p.id,
            name: p.firstName.trim(),
            lastName: p.lastName?.trim() || null,
            type: p.type,
            seatCode: p.seatCode,
            dob: p.dob || null,
            nationality: p.nationality?.trim() || null,
            document: p.document?.trim() || null,
            mealId: p.mealId || null,
          })),
        },
        true,
      );
    }
  } catch (prepErr) {
    return {
      success: false,
      stage: "draft_validation",
      error: prepErr instanceof Error ? prepErr.message : "validation_error",
      status: 422,
      postDispatched: params.postDispatched,
      postAmbiguous: params.postAmbiguous,
      crossSessionRecoveryRequired: false,
    };
  }

  // 3. Verify OTP if not already verified in current session
  let currentVerifiedEmail = params.isEmailVerified ? normEmail : null;
  if (!currentVerifiedEmail) {
    const code = params.otpCode.trim();
    if (!params.challengeId) {
      return {
        success: false,
        stage: "verifier",
        error: "missing_challenge",
        postDispatched: params.postDispatched,
        postAmbiguous: params.postAmbiguous,
        crossSessionRecoveryRequired: false,
      };
    }
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      return {
        success: false,
        stage: "verifier",
        error: "invalid_code_format",
        status: 422,
        postDispatched: params.postDispatched,
        postAmbiguous: params.postAmbiguous,
        crossSessionRecoveryRequired: false,
      };
    }
    try {
      await params.guestClient.verifyEmail(params.challengeId, code, normEmail);
      currentVerifiedEmail = normEmail;
    } catch (verErr) {
      const status = verErr instanceof MvpApiError ? verErr.status : undefined;
      return {
        success: false,
        stage: "verifier",
        error: verErr instanceof MvpApiError ? verErr.code : "verification_failed",
        status,
        postDispatched: params.postDispatched,
        postAmbiguous: params.postAmbiguous,
        crossSessionRecoveryRequired: false,
      };
    }
  }

  // 4. Submit reservation exactly once with prepared command
  try {
    if (params.isRoundTrip && tripCommand) {
      const receipt = await params.tripClient.create(tripCommand, true);
      for (const res of receipt.reservations) {
        params.guestClient.recordVerifiedReference(res.reservation.reference, normEmail);
      }
      return {
        success: true,
        type: "round-trip",
        receipt,
        verifiedEmail: currentVerifiedEmail,
      };
    } else if (oneWayCommand) {
      const receipt = await params.guestClient.create(oneWayCommand);
      return {
        success: true,
        type: "one-way",
        receipt,
        verifiedEmail: currentVerifiedEmail,
      };
    }
    throw new Error("Invalid booking state.");
  } catch (subErr) {
    const status = subErr instanceof MvpApiError ? subErr.status : undefined;

    // Record that POST was dispatched
    const wasDispatched = true;

    if (status === 429) {
      return {
        success: false, stage: "submission", error: "rate_limited", status,
        postDispatched: params.postDispatched,
        postAmbiguous: params.postAmbiguous,
        crossSessionRecoveryRequired: false,
        verifiedEmail: currentVerifiedEmail,
      };
    }

    if (status === 409 || status === 422) {
      // Definitive rejections unlock attempt
      if (params.isRoundTrip) {
        params.tripAttempt.rejected(status);
      } else {
        params.oneWayAttempt.rejected(status);
      }
      return {
        success: false,
        stage: "submission",
        error: status === 409 ? "conflict" : "validation_error",
        status,
        postDispatched: false,
        postAmbiguous: false,
        crossSessionRecoveryRequired: false,
        verifiedEmail: currentVerifiedEmail,
      };
    }

    if (status === 401 || status === 403 || status === 419) {
      // Session expired.
      params.guestClient.invalidateEmailGrant(normEmail);
      // If a previous POST was already ambiguous, renewing session must fail closed against cross-session replay!
      const mustFailClosed = Boolean(params.postAmbiguous);
      return {
        success: false,
        stage: "submission",
        error: mustFailClosed ? "cross_session_recovery_required" : "session_expired",
        status,
        postDispatched: false,
        postAmbiguous: mustFailClosed,
        crossSessionRecoveryRequired: mustFailClosed,
        verifiedEmail: undefined,
      };
    }

    // Network timeout / 5xx -> ambiguous outcome! Lock retained.
    return {
      success: false,
      stage: "submission",
      error: "ambiguous_outcome",
      status,
      postDispatched: wasDispatched,
      postAmbiguous: true,
      crossSessionRecoveryRequired: false,
      verifiedEmail: currentVerifiedEmail,
    };
  }
}
