import { validateOperationRequest, validateOperationResponse } from "./identity-schema-validation.ts";
/**
 * Gaza Gateway / Palestinian Airlines
 * Phase 13B Identity API — Isolated Non-Production Identity Client
 *
 * Implements 12 accepted identity operations over HTTPS-only transport.
 * Credentials included ('include'), redirects rejected ('error'), cache: 'no-store',
 * request UUID correlation enforced, bounded fetch timeout (covering body read),
 * strict per-realm CSRF isolation & write serialization, generation/disposal guards.
 */

import type {
  SuccessMeta,
  CsrfTokenResponse,
  RegisterRequest,
  LoginRequest,
  PasswordForgotRequest,
  PasswordResetRequest,
  EmailVerifyRequest,
  PassengerEmailResendRequest,
  UpdatePassengerProfileRequest,
  CreateTravelerRequest,
  PatchTravelerRequest,
  PassengerPasswordChangeRequest,
  StaffLoginRequest,
  StaffMfaChallengeRequest,
  StaffMfaVerifyRequest,
  CreateStaffUserRequest,
  PatchStaffUserRequest,
  StaffMfaEnrollmentConfirmRequest,
  StaffStepUpRequest,
  StaffMfaSetupConfirmRequest,
  StaffPasswordForgotRequest,
  StaffPasswordResetRequest,
  StaffPasswordChangeRequest,
  StaffInvitationAcceptRequest,
  PassengerRegisterReceiptResponse,
  PassengerAuthResponse,
  PassengerLogoutResponse,
  PasswordForgotResponse,
  PasswordResetResponse,
  EmailVerifyResponse,
  PassengerEmailResendResponse,
  PassengerProfileResponse,
  PassengerProfileReceiptResponse,
  SavedTravelersResponse,
  SavedTravelerResponse,
  DeleteTravelerResponse,
  PassengerSessionListResponse,
  PassengerSessionRevokeResponse,
  PassengerPasswordChangeResponse,
  StaffPendingAuthResponse,
  StaffLogoutResponse,
  StaffMeResponse,
  StaffMfaSetupResponse,
  StaffMfaChallengeResponse,
  StaffAuthResponse,
  StaffSessionsListResponse,
  DeleteStaffSessionResponse,
  StaffUsersListResponse,
  StaffUserResponse,
  DeleteStaffUserResponse,
  StaffMfaEnrollmentSetupResponse,
  StaffMfaEnrollmentConfirmResponse,
  StaffStepUpResponse,
  StaffMfaSetupConfirmResponse,
  StaffRecoveryCodesRegenerateResponse,
  StaffPasswordForgotReceiptResponse,
  StaffPasswordResetResponse,
  StaffPasswordChangeResponse,
  StaffInvitationAcceptResponse,
  StaffInviteReissueResponse,
  StaffInviteRevokeResponse,
} from "./identity-types.ts";
import { IdentityApiError, isIdentityApiError } from "./identity-client-errors.ts";
import {
  type IdentityApiClientConfig,
  type ResolvedIdentityApiClientConfig,
  resolveIdentityApiClientConfig,
  validateTimeoutMs,
  validateAndNormalizeBaseUrl,
  isProductionEnvironment,
  isKnownNonProductionEnvironment,
} from "./identity-client-config.ts";
import {
  isValidUuid,
  isValidIsoDateTime,
  parseRetryAfter,
  countUnicodeCodePoints,
  isWellFormedUnicode,
  validatePathUuid,
  validatePathId,
  validateRequestOptions,
  generateCryptographicUuid,
  isPlainObject,
  validateRegisterRequest,
  validateLoginRequest,
  validatePasswordForgotRequest,
  validatePasswordResetRequest,
  validateEmailVerifyRequest,
  validatePassengerEmailResendRequest,
  validateUpdatePassengerProfileRequest,
  validateCreateTravelerRequest,
  validatePatchTravelerRequest,
  validatePassengerPasswordChangeRequest,
  validateStaffLoginRequest,
  validateStaffMfaChallengeRequest,
  validateStaffMfaVerifyRequest,
  validateCreateStaffUserRequest,
  validatePatchStaffUserRequest,
  validateStaffMfaEnrollmentConfirmRequest,
  validateStaffStepUpRequest,
  validateStaffMfaSetupConfirmRequest,
  validateStaffPasswordForgotRequest,
  validateStaffPasswordResetRequest,
  validateStaffPasswordChangeRequest,
  validateStaffInvitationAcceptRequest,
  validateSuccessMeta,
  validateCsrfTokenResponse,
  validatePassengerRegisterReceiptData,
  validatePassengerAuthData,
  validateMessageData,
  validateEmailVerifyData,
  validatePassengerProfileData,
  validatePassengerProfileReceiptData,
  validateTravelerData,
  validateSavedTravelersData,
  validateDeleteTravelerData,
  validatePassengerSessionsData,
  validatePassengerSessionRevokeData,
  validateBooleanChangedData,
  validateStaffPendingAuthData,
  validateStaffMeData,
  validateStaffMfaSetupData,
  validateStaffMfaChallengeData,
  validateStaffAuthData,
  validateStaffSessionsData,
  validateDeleteStaffSessionData,
  validateStaffUsersDirectoryData,
  validateStaffUserData,
  validateDeleteStaffUserData,
  validateStaffMfaEnrollmentSetupData,
  validateStaffMfaEnrollmentConfirmData,
  validateStaffStepUpData,
  validateStaffMfaSetupConfirmData,
  validateStaffRecoveryCodesData,
  validateStaffPasswordForgotReceiptData,
  validateStaffPasswordResetData,
  validateStaffInvitationAcceptData,
  validateStaffInviteReissueData,
  validateStaffInviteRevokeData,
  tryParseCanonicalError,
} from "./identity-client-validators.ts";

export {
  IdentityApiError,
  isIdentityApiError,
  validateAndNormalizeBaseUrl,
  resolveIdentityApiClientConfig,
  isProductionEnvironment,
  isKnownNonProductionEnvironment,
  isValidUuid,
  isValidIsoDateTime,
  parseRetryAfter,
  countUnicodeCodePoints,
  isWellFormedUnicode,
  validatePathUuid,
  validatePathId,
  validateRequestOptions,
  generateCryptographicUuid,
};

export interface IdentityApiRequestOptions {
  requestId?: string | undefined;
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
}

export interface IdentityApiClient {
  readonly isEnabled: boolean;
  readonly mode: "mock" | "live";
  readonly baseUrl: string | null;
  readonly isDisposed: boolean;

  // 41 Core Identity Operations
  getAuthCsrfBootstrap(options?: IdentityApiRequestOptions): Promise<CsrfTokenResponse>;
  postPassengerRegister(body: RegisterRequest, options?: IdentityApiRequestOptions): Promise<PassengerRegisterReceiptResponse>;
  postPassengerLogin(body: LoginRequest, options?: IdentityApiRequestOptions): Promise<PassengerAuthResponse>;
  postPassengerLogout(options?: IdentityApiRequestOptions): Promise<PassengerLogoutResponse>;
  postPassengerPasswordForgot(body: PasswordForgotRequest, options?: IdentityApiRequestOptions): Promise<PasswordForgotResponse>;
  postPassengerPasswordReset(body: PasswordResetRequest, options?: IdentityApiRequestOptions): Promise<PasswordResetResponse>;
  postPassengerEmailVerify(body: EmailVerifyRequest, options?: IdentityApiRequestOptions): Promise<EmailVerifyResponse>;
  getPassengerProfile(options?: IdentityApiRequestOptions): Promise<PassengerProfileResponse>;
  putPassengerProfile(body: UpdatePassengerProfileRequest, options?: IdentityApiRequestOptions): Promise<PassengerProfileReceiptResponse>;
  getSavedTravelers(options?: IdentityApiRequestOptions): Promise<SavedTravelersResponse>;
  postSavedTraveler(body: CreateTravelerRequest, options?: IdentityApiRequestOptions): Promise<SavedTravelerResponse>;
  deleteSavedTraveler(id: string, options?: IdentityApiRequestOptions): Promise<DeleteTravelerResponse>;
  patchSavedTraveler(id: string, body: PatchTravelerRequest, options?: IdentityApiRequestOptions): Promise<SavedTravelerResponse>;
  getStaffCsrfBootstrap(options?: IdentityApiRequestOptions): Promise<CsrfTokenResponse>;
  postStaffLogin(body: StaffLoginRequest, options?: IdentityApiRequestOptions): Promise<StaffPendingAuthResponse>;
  postStaffLogout(options?: IdentityApiRequestOptions): Promise<StaffLogoutResponse>;
  getStaffMe(options?: IdentityApiRequestOptions): Promise<StaffMeResponse>;
  postStaffMfaSetup(options?: IdentityApiRequestOptions): Promise<StaffMfaSetupResponse>;
  postStaffMfaChallenge(body: StaffMfaChallengeRequest, options?: IdentityApiRequestOptions): Promise<StaffMfaChallengeResponse>;
  postStaffMfaVerify(body: StaffMfaVerifyRequest, options?: IdentityApiRequestOptions): Promise<StaffAuthResponse>;
  getStaffSessions(options?: IdentityApiRequestOptions): Promise<StaffSessionsListResponse>;
  deleteStaffSession(id: string, options?: IdentityApiRequestOptions): Promise<DeleteStaffSessionResponse>;
  getStaffUsersDirectory(options?: IdentityApiRequestOptions): Promise<StaffUsersListResponse>;
  postStaffUserInvite(body: CreateStaffUserRequest, options?: IdentityApiRequestOptions): Promise<StaffUserResponse>;
  patchStaffUser(id: string, body: PatchStaffUserRequest, options?: IdentityApiRequestOptions): Promise<StaffUserResponse>;
  deleteStaffUser(id: string, options?: IdentityApiRequestOptions): Promise<DeleteStaffUserResponse>;
  postPassengerEmailResend(body: PassengerEmailResendRequest, options?: IdentityApiRequestOptions): Promise<PassengerRegisterReceiptResponse>;
  getPassengerSessions(options?: IdentityApiRequestOptions): Promise<PassengerSessionListResponse>;
  deletePassengerSession(id: string, options?: IdentityApiRequestOptions): Promise<PassengerSessionRevokeResponse>;
  putPassengerPassword(body: PassengerPasswordChangeRequest, options?: IdentityApiRequestOptions): Promise<PassengerPasswordChangeResponse>;
  postStaffMfaEnrollmentSetup(options?: IdentityApiRequestOptions): Promise<StaffMfaEnrollmentSetupResponse>;
  postStaffMfaEnrollmentConfirm(body: StaffMfaEnrollmentConfirmRequest, options?: IdentityApiRequestOptions): Promise<StaffMfaEnrollmentConfirmResponse>;
  postStaffStepUp(body: StaffStepUpRequest, options?: IdentityApiRequestOptions): Promise<StaffStepUpResponse>;
  postStaffMfaSetupConfirm(body: StaffMfaSetupConfirmRequest, options?: IdentityApiRequestOptions): Promise<StaffMfaSetupConfirmResponse>;
  postStaffMfaRecoveryCodesRegenerate(options?: IdentityApiRequestOptions): Promise<StaffRecoveryCodesRegenerateResponse>;
  postStaffPasswordForgot(body: StaffPasswordForgotRequest, options?: IdentityApiRequestOptions): Promise<StaffPasswordForgotReceiptResponse>;
  postStaffPasswordReset(body: StaffPasswordResetRequest, options?: IdentityApiRequestOptions): Promise<StaffPasswordResetResponse>;
  putStaffPassword(body: StaffPasswordChangeRequest, options?: IdentityApiRequestOptions): Promise<StaffPasswordChangeResponse>;
  postStaffInvitationAccept(body: StaffInvitationAcceptRequest, options?: IdentityApiRequestOptions): Promise<StaffInvitationAcceptResponse>;
  postStaffUserInviteReissue(id: string, options?: IdentityApiRequestOptions): Promise<StaffInviteReissueResponse>;
  postStaffUserInviteRevoke(id: string, options?: IdentityApiRequestOptions): Promise<StaffInviteRevokeResponse>;

  // Ergonomic Operation Aliases (12 original operations)
  getAuthCsrf(options?: IdentityApiRequestOptions): Promise<CsrfTokenResponse>;
  registerPassenger(body: RegisterRequest, options?: IdentityApiRequestOptions): Promise<PassengerRegisterReceiptResponse>;
  loginPassenger(body: LoginRequest, options?: IdentityApiRequestOptions): Promise<PassengerAuthResponse>;
  logoutPassenger(options?: IdentityApiRequestOptions): Promise<PassengerLogoutResponse>;
  forgotPassengerPassword(body: PasswordForgotRequest, options?: IdentityApiRequestOptions): Promise<PasswordForgotResponse>;
  resetPassengerPassword(body: PasswordResetRequest, options?: IdentityApiRequestOptions): Promise<PasswordResetResponse>;
  verifyPassengerEmail(body: EmailVerifyRequest, options?: IdentityApiRequestOptions): Promise<EmailVerifyResponse>;
  resendPassengerEmail(body: PassengerEmailResendRequest, options?: IdentityApiRequestOptions): Promise<PassengerEmailResendResponse>;
  getStaffCsrf(options?: IdentityApiRequestOptions): Promise<CsrfTokenResponse>;
  loginStaff(body: StaffLoginRequest, options?: IdentityApiRequestOptions): Promise<StaffPendingAuthResponse>;
  logoutStaff(options?: IdentityApiRequestOptions): Promise<StaffLogoutResponse>;

  // Diagnostics & Lifecycle
  toJSON(): { isEnabled: boolean; mode: "mock" | "live"; baseUrl: string | null; isDisposed: boolean };
  dispose(): void;
}

const MAX_RESPONSE_BYTES = 1024 * 1024; // 1 MiB safe bound

interface OperationBudget {
  readonly signal: AbortSignal;
  readonly deadline: number;
  remainingMs(): number;
  readonly cancelPromise: Promise<never>;
  isSettled(): boolean;
  dispose(): void;
}

function createOperationBudget(
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
  isDisposedCheck: () => boolean,
  registerDisposeListener: (cb: () => void) => () => void,
  onControllerCreated?: (c: AbortController) => void,
  onControllerCleaned?: (c: AbortController) => void
): OperationBudget {
  if (callerSignal?.aborted) {
    throw new IdentityApiError({
      kind: "abort",
      message: "Identity API request aborted by caller prior to execution.",
    });
  }
  if (isDisposedCheck()) {
    throw new IdentityApiError({
      kind: "abort",
      message: "Identity API client has been disposed.",
    });
  }
  if (timeoutMs <= 0) {
    throw new IdentityApiError({
      kind: "timeout",
      message: "Identity API request timed out prior to dispatch.",
    });
  }

  const deadline = Date.now() + timeoutMs;
  const controller = new AbortController();
  if (onControllerCreated) {
    onControllerCreated(controller);
  }

  let rejectCancel!: (err: IdentityApiError) => void;
  let settled = false;

  const cancelPromise = new Promise<never>((_, reject) => {
    rejectCancel = reject;
  });
  cancelPromise.catch(() => {});

  function triggerCancel(err: IdentityApiError) {
    if (settled) return;
    settled = true;
    try {
      controller.abort(err);
    } catch {
      /* ignore */
    }
    rejectCancel(err);
  }

  const timer = setTimeout(() => {
    triggerCancel(
      new IdentityApiError({
        kind: "timeout",
        message: `Identity API request timed out after ${timeoutMs}ms.`,
      })
    );
  }, timeoutMs);

  let onCallerAbort: (() => void) | null = null;
  if (callerSignal) {
    onCallerAbort = () => {
      triggerCancel(
        new IdentityApiError({
          kind: "abort",
          message: "Identity API request aborted by caller.",
        })
      );
    };
    callerSignal.addEventListener("abort", onCallerAbort, { once: true });
  }

  const unregisterDispose = registerDisposeListener(() => {
    triggerCancel(
      new IdentityApiError({
        kind: "abort",
        message: "Identity API client has been disposed.",
      })
    );
  });

  return {
    signal: controller.signal,
    deadline,
    remainingMs() {
      return Math.max(0, deadline - Date.now());
    },
    cancelPromise,
    isSettled() {
      return settled;
    },
    dispose() {
      settled = true;
      clearTimeout(timer);
      if (callerSignal && onCallerAbort) {
        callerSignal.removeEventListener("abort", onCallerAbort);
      }
      unregisterDispose();
      if (onControllerCleaned) {
        onControllerCleaned(controller);
      }
    },
  };
}

class RealmQueue {
  #tail: Promise<void> = Promise.resolve();

  async runExclusive<T>(
    task: () => Promise<T>,
    budget: OperationBudget,
    isDisposedCheck: () => boolean
  ): Promise<T> {
    if (isDisposedCheck()) {
      throw new IdentityApiError({
        kind: "abort",
        message: "Identity API client has been disposed.",
      });
    }
    if (budget.signal.aborted) {
      throw new IdentityApiError({
        kind: "abort",
        message: "Identity API request aborted by caller prior to queue acquisition.",
      });
    }

    const prev = this.#tail;
    let releaseLock: () => void = () => {};
    const lockAcquired = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.#tail = prev.then(
      () => lockAcquired,
      () => lockAcquired
    );

    let waitError: Error | null = null;
    try {
      await Promise.race([
        prev,
        budget.cancelPromise,
      ]);
    } catch (err) {
      waitError = err instanceof Error ? err : new Error(String(err));
    }

    if (waitError) {
      prev.finally(() => {
        releaseLock();
      });
      throw waitError;
    }

    try {
      if (isDisposedCheck()) {
        throw new IdentityApiError({
          kind: "abort",
          message: "Identity API client has been disposed.",
        });
      }
      if (budget.signal.aborted) {
        throw new IdentityApiError({
          kind: "abort",
          message: "Identity API request aborted by caller.",
        });
      }
      if (budget.remainingMs() <= 0) {
        throw new IdentityApiError({
          kind: "timeout",
          message: "Identity API request timed out while waiting in queue.",
        });
      }

      return await task();
    } finally {
      releaseLock();
    }
  }
}

async function fetchWithBoundedTimeout(
  url: string,
  init: RequestInit,
  budget: OperationBudget,
  fetchFn: typeof fetch,
  isDisposedCheck: () => boolean
): Promise<{ response: Response; bodyText: string }> {
  if (budget.signal.aborted) {
    throw new IdentityApiError({
      kind: "abort",
      message: "Request aborted prior to execution.",
    });
  }
  if (isDisposedCheck()) {
    throw new IdentityApiError({
      kind: "abort",
      message: "Identity API client has been disposed.",
    });
  }

  let activeResponse: Response | null = null;
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  const cancelReaderOrBody = () => {
    if (activeReader) {
      try {
        activeReader.cancel().catch(() => {});
      } catch {
        /* ignore */
      }
    } else if (
      activeResponse?.body &&
      !activeResponse.body.locked &&
      typeof activeResponse.body.cancel === "function"
    ) {
      try {
        activeResponse.body.cancel().catch(() => {});
      } catch {
        /* ignore */
      }
    }
  };

  try {
    const fetchPromise = fetchFn(url, {
      ...init,
      cache: "no-store",
      signal: budget.signal,
    });

    fetchPromise.catch(() => {});
    fetchPromise.then(
      (res) => {
        if (budget.isSettled()) {
          try {
            res.body?.cancel().catch(() => {});
          } catch {
            /* ignore */
          }
        }
      },
      () => {}
    );

    const response = await Promise.race([
      fetchPromise,
      budget.cancelPromise,
    ]);

    activeResponse = response;

    if (isDisposedCheck() || budget.signal.aborted) {
      cancelReaderOrBody();
      throw new IdentityApiError({
        kind: "abort",
        message: isDisposedCheck()
          ? "Identity API client has been disposed."
          : "Identity API request aborted by caller.",
      });
    }

    let bodyText = "";
    if (activeResponse.body && typeof activeResponse.body.getReader === "function") {
      const reader = activeResponse.body.getReader();
      activeReader = reader;
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      try {
        while (true) {
          if (budget.signal.aborted || isDisposedCheck()) {
            cancelReaderOrBody();
            throw new IdentityApiError({
              kind: "abort",
              message: isDisposedCheck()
                ? "Identity API client has been disposed."
                : "Identity API request aborted during body reading.",
            });
          }

          const chunkPromise = reader.read();
          chunkPromise.catch(() => {});

          const { done, value } = await Promise.race([
            chunkPromise,
            budget.cancelPromise,
          ]);

          if (done) break;

          if (value) {
            totalBytes += value.byteLength;
            if (totalBytes > MAX_RESPONSE_BYTES) {
              try {
                reader.cancel(new Error("Response body exceeds maximum allowed size")).catch(() => {});
              } catch {
                /* ignore */
              }
              throw new IdentityApiError({
                kind: "protocol",
                message: `Response body exceeded maximum allowed limit of ${MAX_RESPONSE_BYTES} bytes.`,
              });
            }
            chunks.push(value);
          }
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
          /* ignore */
        }
        activeReader = null;
      }

      const concatenated = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        concatenated.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const decoder = new TextDecoder("utf-8", { fatal: true });
      try {
        bodyText = decoder.decode(concatenated);
      } catch {
        throw new IdentityApiError({
          kind: "protocol",
          message: "Response body contains invalid UTF-8 bytes.",
        });
      }
    } else {
      const cl = activeResponse.headers?.get("content-length");
      if (cl && parseInt(cl, 10) > MAX_RESPONSE_BYTES) {
        throw new IdentityApiError({
          kind: "protocol",
          message: `Response body exceeded maximum allowed limit of ${MAX_RESPONSE_BYTES} bytes.`,
        });
      }
      const textPromise = activeResponse.text();
      textPromise.catch(() => {});
      bodyText = await Promise.race([textPromise, budget.cancelPromise]);
      if (bodyText.length > MAX_RESPONSE_BYTES) {
        throw new IdentityApiError({
          kind: "protocol",
          message: `Response body exceeded maximum allowed limit of ${MAX_RESPONSE_BYTES} bytes.`,
        });
      }
    }

    if (isDisposedCheck() || budget.signal.aborted) {
      throw new IdentityApiError({
        kind: "abort",
        message: isDisposedCheck()
          ? "Identity API client has been disposed."
          : "Identity API request aborted by caller.",
      });
    }

    return { response: activeResponse, bodyText };
  } catch (err: unknown) {
    cancelReaderOrBody();
    if (isIdentityApiError(err)) {
      throw err;
    }

    const rawMessage = err instanceof Error ? err.message : String(err);
    if (/redirect/i.test(rawMessage)) {
      throw new IdentityApiError({
        kind: "protocol",
        message: "Redirects are rejected for Identity API client.",
      });
    }

    throw new IdentityApiError({
      kind: "network",
      message: "Network connection failed or host unreachable.",
    });
  }
}

function getCanonicalErrorMessage(status: number): string {
  switch (status) {
    case 400:
      return "Bad Request: the request was rejected by the identity API.";
    case 401:
      return "Unauthorized: authentication required or invalid credentials.";
    case 403:
      return "Forbidden: caller lacks required permission.";
    case 404:
      return "Not Found: the requested identity resource does not exist.";
    case 419:
      return "CSRF token mismatch or expired session.";
    case 422:
      return "Validation Error: the given data was invalid.";
    case 429:
      return "Too Many Requests: rate limit exceeded.";
    case 503:
      return "Service Unavailable: the identity API is temporarily unavailable.";
    default:
      if (status >= 400 && status < 500) {
        return `Identity API client error (HTTP ${status}).`;
      }
      return `Identity API server error (HTTP ${status}).`;
  }
}

class IdentityApiClientImpl implements IdentityApiClient {
  readonly isEnabled: boolean;
  readonly mode: "mock" | "live";
  readonly baseUrl: string | null;

  #timeoutMs: number;
  #fetchFn: typeof fetch;

  #isDisposed = false;
  #passengerCsrfToken: string | null = null;
  #staffCsrfToken: string | null = null;
  #passengerGeneration = 0;
  #staffGeneration = 0;

  #passengerQueue = new RealmQueue();
  #staffQueue = new RealmQueue();
  #activeControllers = new Set<AbortController>();
  #disposeListeners = new Set<() => void>();

  constructor(config: ResolvedIdentityApiClientConfig) {
    this.isEnabled = config.enabled;
    this.mode = config.mode;
    this.baseUrl = config.baseUrl;
    this.#timeoutMs = config.timeoutMs;
    this.#fetchFn = config.fetch;
  }

  get isDisposed(): boolean {
    return this.#isDisposed;
  }

  toJSON() {
    return {
      isEnabled: this.isEnabled,
      mode: this.mode,
      baseUrl: this.baseUrl,
      isDisposed: this.#isDisposed,
    };
  }

  dispose(): void {
    if (this.#isDisposed) return;
    this.#isDisposed = true;
    this.#dropPassengerCsrf();
    this.#dropStaffCsrf();

    for (const listener of this.#disposeListeners) {
      try {
        listener();
      } catch {
        // Ignore listener errors on dispose
      }
    }
    this.#disposeListeners.clear();

    for (const controller of this.#activeControllers) {
      try {
        controller.abort(new Error("Client disposed"));
      } catch {
        // Ignore abort errors on dispose
      }
    }
    this.#activeControllers.clear();
  }

  #createBudget(
    timeoutMsOption?: number,
    callerSignal?: AbortSignal
  ): OperationBudget {
    const effectiveTimeout =
      timeoutMsOption !== undefined
        ? validateTimeoutMs(timeoutMsOption)
        : this.#timeoutMs;

    return createOperationBudget(
      effectiveTimeout,
      callerSignal,
      () => this.#isDisposed,
      (cb) => {
        this.#disposeListeners.add(cb);
        return () => {
          this.#disposeListeners.delete(cb);
        };
      },
      (controller) => {
        this.#activeControllers.add(controller);
      },
      (controller) => {
        this.#activeControllers.delete(controller);
      }
    );
  }

  #ensureNotDisposed(): void {
    if (this.#isDisposed) {
      throw new IdentityApiError({
        kind: "abort",
        message: "Identity API client has been disposed.",
      });
    }
  }

  #ensureEnabled(): void {
    if (!this.isEnabled) {
      throw new IdentityApiError({
        kind: "configuration",
        message: "Identity API client is disabled; explicit non-production opt-in is required.",
      });
    }
  }

  #dropPassengerCsrf(): void {
    this.#passengerCsrfToken = null;
    this.#passengerGeneration++;
  }

  #dropStaffCsrf(): void {
    this.#staffCsrfToken = null;
    this.#staffGeneration++;
  }

  #resolveRequestId(providedId?: string): string {
    if (providedId !== undefined) {
      if (!isValidUuid(providedId)) {
        throw new IdentityApiError({
          kind: "protocol",
          message: "Invalid caller requestId format: expected RFC 4122 UUID string.",
        });
      }
      return providedId;
    }
    return generateCryptographicUuid();
  }


  // ==========================================
  // GET /auth/csrf (getAuthCsrfBootstrap)
  // ==========================================
  async getAuthCsrfBootstrap(options?: IdentityApiRequestOptions): Promise<CsrfTokenResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const budget = this.#createBudget(options?.timeoutMs, options?.signal);
    try {
      return await this.#passengerQueue.runExclusive(
        async () => {
          return this.executeCsrfBootstrap("passenger", "/auth/csrf", options, budget);
        },
        budget,
        () => this.#isDisposed
      );
    } finally {
      budget.dispose();
    }
  }

  // ==========================================
  // POST /auth/register (postPassengerRegister)
  // ==========================================
  async postPassengerRegister(body: RegisterRequest, options?: IdentityApiRequestOptions): Promise<PassengerRegisterReceiptResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validateRegisterRequest(body);
    return this.executeLiveMutation<PassengerRegisterReceiptResponse>(
      "postPassengerRegister",
      "passenger",
      "/auth/register",
      validatedBody,
      202,
      validatePassengerRegisterReceiptData,
      false,
      options,
      "POST"
    );
  }

  // ==========================================
  // POST /auth/login (postPassengerLogin)
  // ==========================================
  async postPassengerLogin(body: LoginRequest, options?: IdentityApiRequestOptions): Promise<PassengerAuthResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validateLoginRequest(body);
    return this.executeLiveMutation<PassengerAuthResponse>(
      "postPassengerLogin",
      "passenger",
      "/auth/login",
      validatedBody,
      200,
      validatePassengerAuthData,
      true,
      options,
      "POST"
    );
  }

  // ==========================================
  // POST /auth/logout (postPassengerLogout)
  // ==========================================
  async postPassengerLogout(options?: IdentityApiRequestOptions): Promise<PassengerLogoutResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    return this.executeLiveMutation<PassengerLogoutResponse>(
      "postPassengerLogout",
      "passenger",
      "/auth/logout",
      undefined,
      200,
      validateMessageData,
      true,
      options,
      "POST"
    );
  }

  // ==========================================
  // POST /auth/password/forgot (postPassengerPasswordForgot)
  // ==========================================
  async postPassengerPasswordForgot(body: PasswordForgotRequest, options?: IdentityApiRequestOptions): Promise<PasswordForgotResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validatePasswordForgotRequest(body);
    return this.executeLiveMutation<PasswordForgotResponse>(
      "postPassengerPasswordForgot",
      "passenger",
      "/auth/password/forgot",
      validatedBody,
      202,
      validateMessageData,
      false,
      options,
      "POST"
    );
  }

  // ==========================================
  // POST /auth/password/reset (postPassengerPasswordReset)
  // ==========================================
  async postPassengerPasswordReset(body: PasswordResetRequest, options?: IdentityApiRequestOptions): Promise<PasswordResetResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validatePasswordResetRequest(body);
    return this.executeLiveMutation<PasswordResetResponse>(
      "postPassengerPasswordReset",
      "passenger",
      "/auth/password/reset",
      validatedBody,
      200,
      validateMessageData,
      true,
      options,
      "POST"
    );
  }

  // ==========================================
  // POST /auth/email/verify (postPassengerEmailVerify)
  // ==========================================
  async postPassengerEmailVerify(body: EmailVerifyRequest, options?: IdentityApiRequestOptions): Promise<EmailVerifyResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validateEmailVerifyRequest(body);
    return this.executeLiveMutation<EmailVerifyResponse>(
      "postPassengerEmailVerify",
      "passenger",
      "/auth/email/verify",
      validatedBody,
      200,
      validateEmailVerifyData,
      false,
      options,
      "POST"
    );
  }

  // ==========================================
  // GET /auth/passenger/profile (getPassengerProfile)
  // ==========================================
  async getPassengerProfile(options?: IdentityApiRequestOptions): Promise<PassengerProfileResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    return this.executeLiveRead<PassengerProfileResponse>(
      "getPassengerProfile",
      "passenger",
      "/auth/passenger/profile",
      validatePassengerProfileData,
      options
    );
  }

  // ==========================================
  // PUT /auth/passenger/profile (putPassengerProfile)
  // ==========================================
  async putPassengerProfile(body: UpdatePassengerProfileRequest, options?: IdentityApiRequestOptions): Promise<PassengerProfileReceiptResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validateUpdatePassengerProfileRequest(body);
    return this.executeLiveMutation<PassengerProfileReceiptResponse>(
      "putPassengerProfile",
      "passenger",
      "/auth/passenger/profile",
      validatedBody,
      200,
      validatePassengerProfileReceiptData,
      false,
      options,
      "PUT"
    );
  }

  // ==========================================
  // GET /auth/passenger/travelers (getSavedTravelers)
  // ==========================================
  async getSavedTravelers(options?: IdentityApiRequestOptions): Promise<SavedTravelersResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    return this.executeLiveRead<SavedTravelersResponse>(
      "getSavedTravelers",
      "passenger",
      "/auth/passenger/travelers",
      validateSavedTravelersData,
      options
    );
  }

  // ==========================================
  // POST /auth/passenger/travelers (postSavedTraveler)
  // ==========================================
  async postSavedTraveler(body: CreateTravelerRequest, options?: IdentityApiRequestOptions): Promise<SavedTravelerResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validateCreateTravelerRequest(body);
    return this.executeLiveMutation<SavedTravelerResponse>(
      "postSavedTraveler",
      "passenger",
      "/auth/passenger/travelers",
      validatedBody,
      201,
      validateTravelerData,
      false,
      options,
      "POST"
    );
  }

  // ==========================================
  // DELETE /auth/passenger/travelers/{id} (deleteSavedTraveler)
  // ==========================================
  async deleteSavedTraveler(id: string, options?: IdentityApiRequestOptions): Promise<DeleteTravelerResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const encodedId = validatePathId(id, "id");
    return this.executeLiveMutation<DeleteTravelerResponse>(
      "deleteSavedTraveler",
      "passenger",
      `/auth/passenger/travelers/${encodedId}`,
      undefined,
      200,
      validateDeleteTravelerData,
      false,
      options,
      "DELETE"
    );
  }

  // ==========================================
  // PATCH /auth/passenger/travelers/{id} (patchSavedTraveler)
  // ==========================================
  async patchSavedTraveler(id: string, body: PatchTravelerRequest, options?: IdentityApiRequestOptions): Promise<SavedTravelerResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const encodedId = validatePathId(id, "id");
    const validatedBody = validatePatchTravelerRequest(body);
    return this.executeLiveMutation<SavedTravelerResponse>(
      "patchSavedTraveler",
      "passenger",
      `/auth/passenger/travelers/${encodedId}`,
      validatedBody,
      200,
      validateTravelerData,
      false,
      options,
      "PATCH"
    );
  }

  // ==========================================
  // GET /staff/csrf (getStaffCsrfBootstrap)
  // ==========================================
  async getStaffCsrfBootstrap(options?: IdentityApiRequestOptions): Promise<CsrfTokenResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const budget = this.#createBudget(options?.timeoutMs, options?.signal);
    try {
      return await this.#staffQueue.runExclusive(
        async () => {
          return this.executeCsrfBootstrap("staff", "/staff/csrf", options, budget);
        },
        budget,
        () => this.#isDisposed
      );
    } finally {
      budget.dispose();
    }
  }

  // ==========================================
  // POST /staff/login (postStaffLogin)
  // ==========================================
  async postStaffLogin(body: StaffLoginRequest, options?: IdentityApiRequestOptions): Promise<StaffPendingAuthResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validateStaffLoginRequest(body);
    return this.executeLiveMutation<StaffPendingAuthResponse>(
      "postStaffLogin",
      "staff",
      "/staff/login",
      validatedBody,
      200,
      validateStaffPendingAuthData,
      true,
      options,
      "POST"
    );
  }

  // ==========================================
  // POST /staff/logout (postStaffLogout)
  // ==========================================
  async postStaffLogout(options?: IdentityApiRequestOptions): Promise<StaffLogoutResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    return this.executeLiveMutation<StaffLogoutResponse>(
      "postStaffLogout",
      "staff",
      "/staff/logout",
      undefined,
      200,
      validateMessageData,
      true,
      options,
      "POST"
    );
  }

  // ==========================================
  // GET /staff/me (getStaffMe)
  // ==========================================
  async getStaffMe(options?: IdentityApiRequestOptions): Promise<StaffMeResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    return this.executeLiveRead<StaffMeResponse>(
      "getStaffMe",
      "staff",
      "/staff/me",
      validateStaffMeData,
      options
    );
  }

  // ==========================================
  // POST /staff/mfa/setup (postStaffMfaSetup)
  // ==========================================
  async postStaffMfaSetup(options?: IdentityApiRequestOptions): Promise<StaffMfaSetupResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    return this.executeLiveMutation<StaffMfaSetupResponse>(
      "postStaffMfaSetup",
      "staff",
      "/staff/mfa/setup",
      undefined,
      200,
      validateStaffMfaSetupData,
      false,
      options,
      "POST"
    );
  }

  // ==========================================
  // POST /staff/mfa/challenge (postStaffMfaChallenge)
  // ==========================================
  async postStaffMfaChallenge(body: StaffMfaChallengeRequest, options?: IdentityApiRequestOptions): Promise<StaffMfaChallengeResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validateStaffMfaChallengeRequest(body);
    return this.executeLiveMutation<StaffMfaChallengeResponse>(
      "postStaffMfaChallenge",
      "staff",
      "/staff/mfa/challenge",
      validatedBody,
      200,
      validateStaffMfaChallengeData,
      false,
      options,
      "POST"
    );
  }

  // ==========================================
  // POST /staff/mfa/verify (postStaffMfaVerify)
  // ==========================================
  async postStaffMfaVerify(body: StaffMfaVerifyRequest, options?: IdentityApiRequestOptions): Promise<StaffAuthResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validateStaffMfaVerifyRequest(body);
    return this.executeLiveMutation<StaffAuthResponse>(
      "postStaffMfaVerify",
      "staff",
      "/staff/mfa/verify",
      validatedBody,
      200,
      validateStaffAuthData,
      true,
      options,
      "POST"
    );
  }

  // ==========================================
  // GET /staff/sessions (getStaffSessions)
  // ==========================================
  async getStaffSessions(options?: IdentityApiRequestOptions): Promise<StaffSessionsListResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    return this.executeLiveRead<StaffSessionsListResponse>(
      "getStaffSessions",
      "staff",
      "/staff/sessions",
      validateStaffSessionsData,
      options
    );
  }

  // ==========================================
  // DELETE /staff/sessions/{id} (deleteStaffSession)
  // ==========================================
  async deleteStaffSession(id: string, options?: IdentityApiRequestOptions): Promise<DeleteStaffSessionResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const encodedId = validatePathId(id, "id");
    return this.executeLiveMutation<DeleteStaffSessionResponse>(
      "deleteStaffSession",
      "staff",
      `/staff/sessions/${encodedId}`,
      undefined,
      200,
      validateDeleteStaffSessionData,
      true,
      options,
      "DELETE"
    );
  }

  // ==========================================
  // GET /staff/users (getStaffUsersDirectory)
  // ==========================================
  async getStaffUsersDirectory(options?: IdentityApiRequestOptions): Promise<StaffUsersListResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    return this.executeLiveRead<StaffUsersListResponse>(
      "getStaffUsersDirectory",
      "staff",
      "/staff/users",
      validateStaffUsersDirectoryData,
      options
    );
  }

  // ==========================================
  // POST /staff/users (postStaffUserInvite)
  // ==========================================
  async postStaffUserInvite(body: CreateStaffUserRequest, options?: IdentityApiRequestOptions): Promise<StaffUserResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validateCreateStaffUserRequest(body);
    return this.executeLiveMutation<StaffUserResponse>(
      "postStaffUserInvite",
      "staff",
      "/staff/users",
      validatedBody,
      201,
      validateStaffUserData,
      false,
      options,
      "POST"
    );
  }

  // ==========================================
  // PATCH /staff/users/{id} (patchStaffUser)
  // ==========================================
  async patchStaffUser(id: string, body: PatchStaffUserRequest, options?: IdentityApiRequestOptions): Promise<StaffUserResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const encodedId = validatePathUuid(id, "id");
    const validatedBody = validatePatchStaffUserRequest(body);
    return this.executeLiveMutation<StaffUserResponse>(
      "patchStaffUser",
      "staff",
      `/staff/users/${encodedId}`,
      validatedBody,
      200,
      validateStaffUserData,
      false,
      options,
      "PATCH"
    );
  }

  // ==========================================
  // DELETE /staff/users/{id} (deleteStaffUser)
  // ==========================================
  async deleteStaffUser(id: string, options?: IdentityApiRequestOptions): Promise<DeleteStaffUserResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const encodedId = validatePathUuid(id, "id");
    return this.executeLiveMutation<DeleteStaffUserResponse>(
      "deleteStaffUser",
      "staff",
      `/staff/users/${encodedId}`,
      undefined,
      200,
      validateDeleteStaffUserData,
      false,
      options,
      "DELETE"
    );
  }

  // ==========================================
  // POST /auth/email/resend (postPassengerEmailResend)
  // ==========================================
  async postPassengerEmailResend(body: PassengerEmailResendRequest, options?: IdentityApiRequestOptions): Promise<PassengerRegisterReceiptResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validatePassengerEmailResendRequest(body);
    return this.executeLiveMutation<PassengerRegisterReceiptResponse>(
      "postPassengerEmailResend",
      "passenger",
      "/auth/email/resend",
      validatedBody,
      202,
      validatePassengerRegisterReceiptData,
      false,
      options,
      "POST"
    );
  }

  // ==========================================
  // GET /auth/passenger/sessions (getPassengerSessions)
  // ==========================================
  async getPassengerSessions(options?: IdentityApiRequestOptions): Promise<PassengerSessionListResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    return this.executeLiveRead<PassengerSessionListResponse>(
      "getPassengerSessions",
      "passenger",
      "/auth/passenger/sessions",
      validatePassengerSessionsData,
      options
    );
  }

  // ==========================================
  // DELETE /auth/passenger/sessions/{id} (deletePassengerSession)
  // ==========================================
  async deletePassengerSession(id: string, options?: IdentityApiRequestOptions): Promise<PassengerSessionRevokeResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const encodedId = validatePathUuid(id, "id");
    return this.executeLiveMutation<PassengerSessionRevokeResponse>(
      "deletePassengerSession",
      "passenger",
      `/auth/passenger/sessions/${encodedId}`,
      undefined,
      200,
      validatePassengerSessionRevokeData,
      true,
      options,
      "DELETE"
    );
  }

  // ==========================================
  // PUT /auth/passenger/password (putPassengerPassword)
  // ==========================================
  async putPassengerPassword(body: PassengerPasswordChangeRequest, options?: IdentityApiRequestOptions): Promise<PassengerPasswordChangeResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validatePassengerPasswordChangeRequest(body);
    return this.executeLiveMutation<PassengerPasswordChangeResponse>(
      "putPassengerPassword",
      "passenger",
      "/auth/passenger/password",
      validatedBody,
      200,
      validateBooleanChangedData,
      true,
      options,
      "PUT"
    );
  }

  // ==========================================
  // POST /staff/mfa/enrollment/setup (postStaffMfaEnrollmentSetup)
  // ==========================================
  async postStaffMfaEnrollmentSetup(options?: IdentityApiRequestOptions): Promise<StaffMfaEnrollmentSetupResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    return this.executeLiveMutation<StaffMfaEnrollmentSetupResponse>(
      "postStaffMfaEnrollmentSetup",
      "staff",
      "/staff/mfa/enrollment/setup",
      undefined,
      200,
      validateStaffMfaEnrollmentSetupData,
      false,
      options,
      "POST"
    );
  }

  // ==========================================
  // POST /staff/mfa/enrollment/confirm (postStaffMfaEnrollmentConfirm)
  // ==========================================
  async postStaffMfaEnrollmentConfirm(body: StaffMfaEnrollmentConfirmRequest, options?: IdentityApiRequestOptions): Promise<StaffMfaEnrollmentConfirmResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validateStaffMfaEnrollmentConfirmRequest(body);
    return this.executeLiveMutation<StaffMfaEnrollmentConfirmResponse>(
      "postStaffMfaEnrollmentConfirm",
      "staff",
      "/staff/mfa/enrollment/confirm",
      validatedBody,
      200,
      validateStaffMfaEnrollmentConfirmData,
      true,
      options,
      "POST"
    );
  }

  // ==========================================
  // POST /staff/step-up (postStaffStepUp)
  // ==========================================
  async postStaffStepUp(body: StaffStepUpRequest, options?: IdentityApiRequestOptions): Promise<StaffStepUpResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validateStaffStepUpRequest(body);
    return this.executeLiveMutation<StaffStepUpResponse>(
      "postStaffStepUp",
      "staff",
      "/staff/step-up",
      validatedBody,
      200,
      validateStaffStepUpData,
      false,
      options,
      "POST"
    );
  }

  // ==========================================
  // POST /staff/mfa/setup/confirm (postStaffMfaSetupConfirm)
  // ==========================================
  async postStaffMfaSetupConfirm(body: StaffMfaSetupConfirmRequest, options?: IdentityApiRequestOptions): Promise<StaffMfaSetupConfirmResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validateStaffMfaSetupConfirmRequest(body);
    return this.executeLiveMutation<StaffMfaSetupConfirmResponse>(
      "postStaffMfaSetupConfirm",
      "staff",
      "/staff/mfa/setup/confirm",
      validatedBody,
      200,
      validateStaffMfaSetupConfirmData,
      true,
      options,
      "POST"
    );
  }

  // ==========================================
  // POST /staff/mfa/recovery-codes/regenerate (postStaffMfaRecoveryCodesRegenerate)
  // ==========================================
  async postStaffMfaRecoveryCodesRegenerate(options?: IdentityApiRequestOptions): Promise<StaffRecoveryCodesRegenerateResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    return this.executeLiveMutation<StaffRecoveryCodesRegenerateResponse>(
      "postStaffMfaRecoveryCodesRegenerate",
      "staff",
      "/staff/mfa/recovery-codes/regenerate",
      undefined,
      200,
      validateStaffRecoveryCodesData,
      true,
      options,
      "POST"
    );
  }

  // ==========================================
  // POST /staff/password/forgot (postStaffPasswordForgot)
  // ==========================================
  async postStaffPasswordForgot(body: StaffPasswordForgotRequest, options?: IdentityApiRequestOptions): Promise<StaffPasswordForgotReceiptResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validateStaffPasswordForgotRequest(body);
    return this.executeLiveMutation<StaffPasswordForgotReceiptResponse>(
      "postStaffPasswordForgot",
      "staff",
      "/staff/password/forgot",
      validatedBody,
      202,
      validateStaffPasswordForgotReceiptData,
      false,
      options,
      "POST"
    );
  }

  // ==========================================
  // POST /staff/password/reset (postStaffPasswordReset)
  // ==========================================
  async postStaffPasswordReset(body: StaffPasswordResetRequest, options?: IdentityApiRequestOptions): Promise<StaffPasswordResetResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validateStaffPasswordResetRequest(body);
    return this.executeLiveMutation<StaffPasswordResetResponse>(
      "postStaffPasswordReset",
      "staff",
      "/staff/password/reset",
      validatedBody,
      200,
      validateStaffPasswordResetData,
      true,
      options,
      "POST"
    );
  }

  // ==========================================
  // PUT /staff/password (putStaffPassword)
  // ==========================================
  async putStaffPassword(body: StaffPasswordChangeRequest, options?: IdentityApiRequestOptions): Promise<StaffPasswordChangeResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validateStaffPasswordChangeRequest(body);
    return this.executeLiveMutation<StaffPasswordChangeResponse>(
      "putStaffPassword",
      "staff",
      "/staff/password",
      validatedBody,
      200,
      validateBooleanChangedData,
      true,
      options,
      "PUT"
    );
  }

  // ==========================================
  // POST /staff/invitations/accept (postStaffInvitationAccept)
  // ==========================================
  async postStaffInvitationAccept(body: StaffInvitationAcceptRequest, options?: IdentityApiRequestOptions): Promise<StaffInvitationAcceptResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validateStaffInvitationAcceptRequest(body);
    return this.executeLiveMutation<StaffInvitationAcceptResponse>(
      "postStaffInvitationAccept",
      "staff",
      "/staff/invitations/accept",
      validatedBody,
      200,
      validateStaffInvitationAcceptData,
      true,
      options,
      "POST"
    );
  }

  // ==========================================
  // POST /staff/users/{id}/invite/reissue (postStaffUserInviteReissue)
  // ==========================================
  async postStaffUserInviteReissue(id: string, options?: IdentityApiRequestOptions): Promise<StaffInviteReissueResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const encodedId = validatePathUuid(id, "id");
    return this.executeLiveMutation<StaffInviteReissueResponse>(
      "postStaffUserInviteReissue",
      "staff",
      `/staff/users/${encodedId}/invite/reissue`,
      undefined,
      200,
      validateStaffInviteReissueData,
      false,
      options,
      "POST"
    );
  }

  // ==========================================
  // POST /staff/users/{id}/invite/revoke (postStaffUserInviteRevoke)
  // ==========================================
  async postStaffUserInviteRevoke(id: string, options?: IdentityApiRequestOptions): Promise<StaffInviteRevokeResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const encodedId = validatePathUuid(id, "id");
    return this.executeLiveMutation<StaffInviteRevokeResponse>(
      "postStaffUserInviteRevoke",
      "staff",
      `/staff/users/${encodedId}/invite/revoke`,
      undefined,
      200,
      validateStaffInviteRevokeData,
      false,
      options,
      "POST"
    );
  }

  // ==========================================
  // Aliases for backwards-compatibility
  // ==========================================
  getAuthCsrf(options?: IdentityApiRequestOptions): Promise<CsrfTokenResponse> {
    return this.getAuthCsrfBootstrap(options);
  }

  registerPassenger(body: RegisterRequest, options?: IdentityApiRequestOptions): Promise<PassengerRegisterReceiptResponse> {
    return this.postPassengerRegister(body, options);
  }

  loginPassenger(body: LoginRequest, options?: IdentityApiRequestOptions): Promise<PassengerAuthResponse> {
    return this.postPassengerLogin(body, options);
  }

  logoutPassenger(options?: IdentityApiRequestOptions): Promise<PassengerLogoutResponse> {
    return this.postPassengerLogout(options);
  }

  forgotPassengerPassword(body: PasswordForgotRequest, options?: IdentityApiRequestOptions): Promise<PasswordForgotResponse> {
    return this.postPassengerPasswordForgot(body, options);
  }

  resetPassengerPassword(body: PasswordResetRequest, options?: IdentityApiRequestOptions): Promise<PasswordResetResponse> {
    return this.postPassengerPasswordReset(body, options);
  }

  verifyPassengerEmail(body: EmailVerifyRequest, options?: IdentityApiRequestOptions): Promise<EmailVerifyResponse> {
    return this.postPassengerEmailVerify(body, options);
  }

  resendPassengerEmail(body: PassengerEmailResendRequest, options?: IdentityApiRequestOptions): Promise<PassengerEmailResendResponse> {
    return this.postPassengerEmailResend(body, options);
  }

  getStaffCsrf(options?: IdentityApiRequestOptions): Promise<CsrfTokenResponse> {
    return this.getStaffCsrfBootstrap(options);
  }

  loginStaff(body: StaffLoginRequest, options?: IdentityApiRequestOptions): Promise<StaffPendingAuthResponse> {
    return this.postStaffLogin(body, options);
  }

  logoutStaff(options?: IdentityApiRequestOptions): Promise<StaffLogoutResponse> {
    return this.postStaffLogout(options);
  }

  // ==========================================
  // Live Transport Execution
  // ==========================================
  private async executeCsrfBootstrap(
    realm: "passenger" | "staff",
    endpointPath: string,
    options: IdentityApiRequestOptions | undefined,
    budget: OperationBudget
  ): Promise<CsrfTokenResponse> {
    if (budget.remainingMs() <= 0) {
      throw new IdentityApiError({
        kind: "timeout",
        message: "Identity API request timed out prior to CSRF bootstrap dispatch.",
      });
    }

    const requestId = this.#resolveRequestId(options?.requestId);
    const url = `${this.baseUrl}${endpointPath}`;

    const headers: Record<string, string> = {
      Accept: "application/json",
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
    };

    const init: RequestInit = {
      method: "GET",
      headers,
      credentials: "include",
      redirect: "error",
      cache: "no-store",
    };

    const startingGen = realm === "passenger" ? this.#passengerGeneration : this.#staffGeneration;

    try {
      const { response, bodyText } = await fetchWithBoundedTimeout(
        url,
        init,
        budget,
        this.#fetchFn,
        () => this.#isDisposed
      );

      this.#verifyResponseTransport(response, bodyText, 200, requestId, true /* requireHeaderCorrelation */);

      const parsed: unknown = JSON.parse(bodyText);
      validateOperationResponse(
        realm === "passenger" ? "getAuthCsrfBootstrap" : "getStaffCsrfBootstrap",
        response.status,
        parsed
      );
      const tokenResp = validateCsrfTokenResponse(parsed);

      if (this.#isDisposed) {
        throw new IdentityApiError({
          kind: "abort",
          message: "Identity API client has been disposed.",
        });
      }

      const currentGen = realm === "passenger" ? this.#passengerGeneration : this.#staffGeneration;
      if (currentGen !== startingGen) {
        throw new IdentityApiError({
          kind: "protocol",
          message: "CSRF bootstrap token invalidated due to concurrent authentication state change.",
        });
      }

      if (realm === "passenger") {
        this.#passengerCsrfToken = tokenResp.csrfToken;
      } else {
        this.#staffCsrfToken = tokenResp.csrfToken;
      }

      return tokenResp;
    } catch (err) {
      if (realm === "passenger") {
        this.#dropPassengerCsrf();
      } else {
        this.#dropStaffCsrf();
      }
      throw err;
    }
  }

  private async executeLiveRead<T extends { success: true; data: unknown; meta: SuccessMeta }>(
    operationId: string,
    realm: "passenger" | "staff",
    endpointPath: string,
    validateData: (data: unknown) => T["data"],
    options?: IdentityApiRequestOptions
  ): Promise<T> {
    validateOperationRequest(operationId, undefined);
    const budget = this.#createBudget(options?.timeoutMs, options?.signal);
    const requestId = this.#resolveRequestId(options?.requestId);
    const url = `${this.baseUrl}${endpointPath}`;

    const headers: Record<string, string> = {
      Accept: "application/json",
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
    };

    const init: RequestInit = {
      method: "GET",
      headers,
      credentials: "include",
      redirect: "error",
      cache: "no-store",
    };

    try {
      const { response, bodyText } = await fetchWithBoundedTimeout(
        url,
        init,
        budget,
        this.#fetchFn,
        () => this.#isDisposed
      );

      this.#verifyResponseTransport(response, bodyText, 200, requestId, false);

      const parsed: unknown = JSON.parse(bodyText);
      validateOperationResponse(operationId, response.status, parsed);
      return this.#validateEnvelopeAndData<T>(parsed, validateData, requestId, response.status);
    } catch (err) {
      if (realm === "passenger") {
        this.#dropPassengerCsrf();
      } else {
        this.#dropStaffCsrf();
      }
      throw err;
    } finally {
      budget.dispose();
    }
  }

  private async executeLiveMutation<
    T extends { success: true; data: unknown; meta: SuccessMeta },
  >(
    operationId: string,
    realm: "passenger" | "staff",
    endpointPath: string,
    body: unknown,
    expectedStatus: number,
    validateData: (data: unknown) => T["data"],
    isAuthChanging: boolean,
    options?: IdentityApiRequestOptions,
    httpMethod: "POST" | "PUT" | "PATCH" | "DELETE" = "POST"
  ): Promise<T> {
    validateOperationRequest(operationId, body);
    const queue = realm === "passenger" ? this.#passengerQueue : this.#staffQueue;
    const budget = this.#createBudget(options?.timeoutMs, options?.signal);

    try {
      return await queue.runExclusive(
        async () => {
          this.#ensureNotDisposed();
          if (budget.signal.aborted) {
            throw new IdentityApiError({
              kind: "abort",
              message: "Identity API request aborted by caller.",
            });
          }

          if (budget.remainingMs() <= 0) {
            throw new IdentityApiError({
              kind: "timeout",
              message: "Identity API request timed out before mutation execution.",
            });
          }

          const initialGen = realm === "passenger" ? this.#passengerGeneration : this.#staffGeneration;
          let csrfToken = realm === "passenger" ? this.#passengerCsrfToken : this.#staffCsrfToken;

          if (!csrfToken) {
            const bootstrap = await this.executeCsrfBootstrap(
              realm,
              realm === "passenger" ? "/auth/csrf" : "/staff/csrf",
              undefined,
              budget
            );

            this.#ensureNotDisposed();
            const currentGen = realm === "passenger" ? this.#passengerGeneration : this.#staffGeneration;
            if (currentGen !== initialGen) {
              throw new IdentityApiError({
                kind: "protocol",
                message: "CSRF token invalidated during bootstrap.",
              });
            }
            csrfToken = bootstrap.csrfToken;
          }

          if (budget.remainingMs() <= 0) {
            throw new IdentityApiError({
              kind: "timeout",
              message: "Identity API request timed out after CSRF bootstrap.",
            });
          }

          const requestId = this.#resolveRequestId(options?.requestId);
          const url = `${this.baseUrl}${endpointPath}`;

          const headers: Record<string, string> = {
            Accept: "application/json",
            "Cache-Control": "no-store",
            "X-Request-Id": requestId,
            "X-CSRF-TOKEN": csrfToken,
          };

          if (body !== undefined) {
            headers["Content-Type"] = "application/json";
          }

          const init: RequestInit = {
            method: httpMethod,
            headers,
            credentials: "include",
            redirect: "error",
            cache: "no-store",
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          };

          try {
            const { response, bodyText } = await fetchWithBoundedTimeout(
              url,
              init,
              budget,
              this.#fetchFn,
              () => this.#isDisposed
            );

            this.#verifyResponseTransport(response, bodyText, expectedStatus, requestId, false);

            const parsed: unknown = JSON.parse(bodyText);
            validateOperationResponse(operationId, response.status, parsed);
            const result = this.#validateEnvelopeAndData<T>(
              parsed,
              validateData,
              requestId,
              response.status
            );

            if (isAuthChanging) {
              if (realm === "passenger") {
                this.#dropPassengerCsrf();
              } else {
                this.#dropStaffCsrf();
              }
            }

            return result;
          } catch (err) {
            if (realm === "passenger") {
              this.#dropPassengerCsrf();
            } else {
              this.#dropStaffCsrf();
            }
            throw err;
          }
        },
        budget,
        () => this.#isDisposed
      );
    } finally {
      budget.dispose();
    }
  }

  #verifyResponseTransport(
    response: Response,
    bodyText: string,
    expectedStatus: number,
    requestId: string,
    requireHeaderCorrelation = false
  ): void {
    if (
      (response.status >= 300 && response.status < 400) ||
      (response as { type?: string }).type === "opaqueredirect"
    ) {
      throw new IdentityApiError({
        kind: "protocol",
        status: response.status,
        message: "Redirects are rejected for Identity API client.",
        requestId,
      });
    }

    const contentType = response.headers.get("content-type") ?? "";
    const mediaType = contentType.split(";")[0]?.trim().toLowerCase();
    if (mediaType !== "application/json") {
      throw new IdentityApiError({
        kind: "protocol",
        status: response.status,
        message: "Invalid Content-Type: expected application/json.",
        requestId,
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      throw new IdentityApiError({
        kind: "protocol",
        status: response.status,
        message: "Failed to parse response body as JSON.",
        requestId,
      });
    }

    const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
    const responseHeaderRequestId = response.headers.get("x-request-id");

    if (response.status === 429 && retryAfter === undefined) {
      throw new IdentityApiError({
        kind: "protocol",
        status: 429,
        message: "HTTP 429 response must include a valid Retry-After header.",
        requestId,
      });
    }

    if (requireHeaderCorrelation) {
      if (!responseHeaderRequestId) {
        throw new IdentityApiError({
          kind: "protocol",
          status: response.status,
          message: "Missing required X-Request-Id correlation header on response.",
          requestId,
        });
      }
      if (
        !isValidUuid(responseHeaderRequestId) ||
        responseHeaderRequestId.toLowerCase() !== requestId.toLowerCase()
      ) {
        throw new IdentityApiError({
          kind: "protocol",
          status: response.status,
          message: "Response header X-Request-Id correlation mismatch.",
          requestId,
        });
      }
    } else if (responseHeaderRequestId) {
      if (
        !isValidUuid(responseHeaderRequestId) ||
        responseHeaderRequestId.toLowerCase() !== requestId.toLowerCase()
      ) {
        throw new IdentityApiError({
          kind: "protocol",
          status: response.status,
          message: "Response header X-Request-Id correlation mismatch on success response.",
          requestId,
        });
      }
    }

    if (response.status < 200 || response.status >= 300) {
      const canonicalError = tryParseCanonicalError(parsed);
      if (!canonicalError) {
        throw new IdentityApiError({
          kind: "protocol",
          status: response.status,
          message: `Non-canonical error response on HTTP status ${response.status}.`,
          requestId,
          retryAfter,
        });
      }

      const SAFE_CODE_REGEX = /^[a-z0-9_-]{1,64}$/i;
      if (!SAFE_CODE_REGEX.test(canonicalError.error.code)) {
        throw new IdentityApiError({
          kind: "protocol",
          status: response.status,
          message: "Non-canonical error response: invalid error code format.",
          requestId,
          retryAfter,
        });
      }

      if (canonicalError.meta.requestId.toLowerCase() !== requestId.toLowerCase()) {
        throw new IdentityApiError({
          kind: "protocol",
          status: response.status,
          message: "Request ID correlation mismatch on error response metadata.",
          requestId,
        });
      }

      throw new IdentityApiError({
        kind: "http_error",
        status: response.status,
        code: canonicalError.error.code,
        message: getCanonicalErrorMessage(response.status),
        requestId,
        retryAfter,
        ...(canonicalError.error.fields ? { fields: canonicalError.error.fields } : {}),
      });
    }

    if (response.status !== expectedStatus) {
      throw new IdentityApiError({
        kind: "protocol",
        status: response.status,
        message: `Unexpected HTTP status code: expected ${expectedStatus}, got ${response.status}.`,
        requestId,
      });
    }
  }

  #validateEnvelopeAndData<T extends { success: true; data: unknown; meta: SuccessMeta }>(
    parsed: unknown,
    validateData: (data: unknown) => T["data"],
    requestId: string,
    status: number
  ): T {
    if (!isPlainObject(parsed)) {
      throw new IdentityApiError({
        kind: "protocol",
        status,
        message: "Malformed response: expected top-level JSON object.",
        requestId,
      });
    }

    if (parsed["success"] === false) {
      throw new IdentityApiError({
        kind: "protocol",
        status,
        message: "Invalid response: success: false returned on 2xx status.",
        requestId,
      });
    }

    if (parsed["success"] !== true) {
      throw new IdentityApiError({
        kind: "protocol",
        status,
        message: "Malformed response: success must be boolean true.",
        requestId,
      });
    }

    const topKeys = Object.keys(parsed);
    if (
      topKeys.length !== 3 ||
      !topKeys.includes("success") ||
      !topKeys.includes("data") ||
      !topKeys.includes("meta")
    ) {
      throw new IdentityApiError({
        kind: "protocol",
        status,
        message: "Malformed response envelope: unexpected top-level properties.",
        requestId,
      });
    }

    const validatedMeta = validateSuccessMeta(parsed["meta"], requestId);
    const validatedData = validateData(parsed["data"]);

    return {
      success: true,
      data: validatedData,
      meta: validatedMeta,
    } as T;
  }
}

/**
 * Creates an isolated, typed non-production Identity API client instance.
 * Defaults to disabled mode with zero network calls.
 */
export function createIdentityApiClient(config?: IdentityApiClientConfig): IdentityApiClient {
  const resolvedConfig = resolveIdentityApiClientConfig(config);
  return new IdentityApiClientImpl(resolvedConfig);
}
