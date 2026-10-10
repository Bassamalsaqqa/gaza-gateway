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
  StaffLoginRequest,
  PassengerRegisterReceiptResponse,
  PassengerAuthResponse,
  PassengerLogoutResponse,
  PasswordForgotResponse,
  PasswordResetResponse,
  EmailVerifyResponse,
  PassengerEmailResendResponse,
  StaffPendingAuthResponse,
  StaffLogoutResponse,
  StaffMeResponse,
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
  validateRequestOptions,
  generateCryptographicUuid,
  isPlainObject,
  validateRegisterRequest,
  validateLoginRequest,
  validatePasswordForgotRequest,
  validatePasswordResetRequest,
  validateEmailVerifyRequest,
  validatePassengerEmailResendRequest,
  validateStaffLoginRequest,
  validateSuccessMeta,
  validateCsrfTokenResponse,
  validatePassengerRegisterReceiptData,
  validatePassengerAuthData,
  validateMessageData,
  validateEmailVerifyData,
  validateStaffPendingAuthData,
  validateStaffMeData,
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

  // Passenger Realm Operations
  getAuthCsrfBootstrap(options?: IdentityApiRequestOptions): Promise<CsrfTokenResponse>;
  getAuthCsrf(options?: IdentityApiRequestOptions): Promise<CsrfTokenResponse>;

  postPassengerRegister(
    body: RegisterRequest,
    options?: IdentityApiRequestOptions
  ): Promise<PassengerRegisterReceiptResponse>;
  registerPassenger(
    body: RegisterRequest,
    options?: IdentityApiRequestOptions
  ): Promise<PassengerRegisterReceiptResponse>;

  postPassengerLogin(
    body: LoginRequest,
    options?: IdentityApiRequestOptions
  ): Promise<PassengerAuthResponse>;
  loginPassenger(
    body: LoginRequest,
    options?: IdentityApiRequestOptions
  ): Promise<PassengerAuthResponse>;

  postPassengerLogout(options?: IdentityApiRequestOptions): Promise<PassengerLogoutResponse>;
  logoutPassenger(options?: IdentityApiRequestOptions): Promise<PassengerLogoutResponse>;

  postPassengerPasswordForgot(
    body: PasswordForgotRequest,
    options?: IdentityApiRequestOptions
  ): Promise<PasswordForgotResponse>;
  forgotPassengerPassword(
    body: PasswordForgotRequest,
    options?: IdentityApiRequestOptions
  ): Promise<PasswordForgotResponse>;

  postPassengerPasswordReset(
    body: PasswordResetRequest,
    options?: IdentityApiRequestOptions
  ): Promise<PasswordResetResponse>;
  resetPassengerPassword(
    body: PasswordResetRequest,
    options?: IdentityApiRequestOptions
  ): Promise<PasswordResetResponse>;

  postPassengerEmailVerify(
    body: EmailVerifyRequest,
    options?: IdentityApiRequestOptions
  ): Promise<EmailVerifyResponse>;
  verifyPassengerEmail(
    body: EmailVerifyRequest,
    options?: IdentityApiRequestOptions
  ): Promise<EmailVerifyResponse>;

  postPassengerEmailResend(
    body: PassengerEmailResendRequest,
    options?: IdentityApiRequestOptions
  ): Promise<PassengerEmailResendResponse>;
  resendPassengerEmail(
    body: PassengerEmailResendRequest,
    options?: IdentityApiRequestOptions
  ): Promise<PassengerEmailResendResponse>;

  // Staff Realm Operations
  getStaffCsrfBootstrap(options?: IdentityApiRequestOptions): Promise<CsrfTokenResponse>;
  getStaffCsrf(options?: IdentityApiRequestOptions): Promise<CsrfTokenResponse>;

  postStaffLogin(
    body: StaffLoginRequest,
    options?: IdentityApiRequestOptions
  ): Promise<StaffPendingAuthResponse>;
  loginStaff(
    body: StaffLoginRequest,
    options?: IdentityApiRequestOptions
  ): Promise<StaffPendingAuthResponse>;

  postStaffLogout(options?: IdentityApiRequestOptions): Promise<StaffLogoutResponse>;
  logoutStaff(options?: IdentityApiRequestOptions): Promise<StaffLogoutResponse>;

  getStaffMe(options?: IdentityApiRequestOptions): Promise<StaffMeResponse>;

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
  // 1. GET /auth/csrf
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

  getAuthCsrf(options?: IdentityApiRequestOptions): Promise<CsrfTokenResponse> {
    return this.getAuthCsrfBootstrap(options);
  }

  // ==========================================
  // 2. POST /auth/register
  // ==========================================
  async postPassengerRegister(
    body: RegisterRequest,
    options?: IdentityApiRequestOptions
  ): Promise<PassengerRegisterReceiptResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validateRegisterRequest(body);

    return this.executeLiveMutation<PassengerRegisterReceiptResponse>(
      "passenger",
      "/auth/register",
      validatedBody,
      202,
      validatePassengerRegisterReceiptData,
      false, // not auth-changing
      options
    );
  }

  registerPassenger(
    body: RegisterRequest,
    options?: IdentityApiRequestOptions
  ): Promise<PassengerRegisterReceiptResponse> {
    return this.postPassengerRegister(body, options);
  }

  // ==========================================
  // 3. POST /auth/login
  // ==========================================
  async postPassengerLogin(
    body: LoginRequest,
    options?: IdentityApiRequestOptions
  ): Promise<PassengerAuthResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validateLoginRequest(body);

    return this.executeLiveMutation<PassengerAuthResponse>(
      "passenger",
      "/auth/login",
      validatedBody,
      200,
      validatePassengerAuthData,
      true, // auth-changing: rotates session & drops CSRF
      options
    );
  }

  loginPassenger(
    body: LoginRequest,
    options?: IdentityApiRequestOptions
  ): Promise<PassengerAuthResponse> {
    return this.postPassengerLogin(body, options);
  }

  // ==========================================
  // 4. POST /auth/logout
  // ==========================================
  async postPassengerLogout(
    options?: IdentityApiRequestOptions
  ): Promise<PassengerLogoutResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();

    return this.executeLiveMutation<PassengerLogoutResponse>(
      "passenger",
      "/auth/logout",
      undefined,
      200,
      validateMessageData,
      true, // auth-changing: revokes session & drops CSRF
      options
    );
  }

  logoutPassenger(options?: IdentityApiRequestOptions): Promise<PassengerLogoutResponse> {
    return this.postPassengerLogout(options);
  }

  // ==========================================
  // 5. POST /auth/password/forgot
  // ==========================================
  async postPassengerPasswordForgot(
    body: PasswordForgotRequest,
    options?: IdentityApiRequestOptions
  ): Promise<PasswordForgotResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validatePasswordForgotRequest(body);

    return this.executeLiveMutation<PasswordForgotResponse>(
      "passenger",
      "/auth/password/forgot",
      validatedBody,
      202,
      validateMessageData,
      false, // not auth-changing
      options
    );
  }

  forgotPassengerPassword(
    body: PasswordForgotRequest,
    options?: IdentityApiRequestOptions
  ): Promise<PasswordForgotResponse> {
    return this.postPassengerPasswordForgot(body, options);
  }

  // ==========================================
  // 6. POST /auth/password/reset
  // ==========================================
  async postPassengerPasswordReset(
    body: PasswordResetRequest,
    options?: IdentityApiRequestOptions
  ): Promise<PasswordResetResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validatePasswordResetRequest(body);

    return this.executeLiveMutation<PasswordResetResponse>(
      "passenger",
      "/auth/password/reset",
      validatedBody,
      200,
      validateMessageData,
      true, // auth-changing: rotates credential epoch & drops CSRF
      options
    );
  }

  resetPassengerPassword(
    body: PasswordResetRequest,
    options?: IdentityApiRequestOptions
  ): Promise<PasswordResetResponse> {
    return this.postPassengerPasswordReset(body, options);
  }

  // ==========================================
  // 7. POST /auth/email/verify
  // ==========================================
  async postPassengerEmailVerify(
    body: EmailVerifyRequest,
    options?: IdentityApiRequestOptions
  ): Promise<EmailVerifyResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validateEmailVerifyRequest(body);

    return this.executeLiveMutation<EmailVerifyResponse>(
      "passenger",
      "/auth/email/verify",
      validatedBody,
      200,
      validateEmailVerifyData,
      false, // not auth-changing
      options
    );
  }

  verifyPassengerEmail(
    body: EmailVerifyRequest,
    options?: IdentityApiRequestOptions
  ): Promise<EmailVerifyResponse> {
    return this.postPassengerEmailVerify(body, options);
  }

  // ==========================================
  // 8. POST /auth/email/resend
  // ==========================================
  async postPassengerEmailResend(
    body: PassengerEmailResendRequest,
    options?: IdentityApiRequestOptions
  ): Promise<PassengerEmailResendResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validatePassengerEmailResendRequest(body);

    return this.executeLiveMutation<PassengerEmailResendResponse>(
      "passenger",
      "/auth/email/resend",
      validatedBody,
      202,
      validatePassengerRegisterReceiptData,
      false, // not auth-changing
      options
    );
  }

  resendPassengerEmail(
    body: PassengerEmailResendRequest,
    options?: IdentityApiRequestOptions
  ): Promise<PassengerEmailResendResponse> {
    return this.postPassengerEmailResend(body, options);
  }

  // ==========================================
  // 9. GET /staff/csrf
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

  getStaffCsrf(options?: IdentityApiRequestOptions): Promise<CsrfTokenResponse> {
    return this.getStaffCsrfBootstrap(options);
  }

  // ==========================================
  // 10. POST /staff/login
  // ==========================================
  async postStaffLogin(
    body: StaffLoginRequest,
    options?: IdentityApiRequestOptions
  ): Promise<StaffPendingAuthResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();
    const validatedBody = validateStaffLoginRequest(body);

    return this.executeLiveMutation<StaffPendingAuthResponse>(
      "staff",
      "/staff/login",
      validatedBody,
      200,
      validateStaffPendingAuthData,
      true, // auth-changing: issues pending MFA proof & drops CSRF
      options
    );
  }

  loginStaff(
    body: StaffLoginRequest,
    options?: IdentityApiRequestOptions
  ): Promise<StaffPendingAuthResponse> {
    return this.postStaffLogin(body, options);
  }

  // ==========================================
  // 11. POST /staff/logout
  // ==========================================
  async postStaffLogout(options?: IdentityApiRequestOptions): Promise<StaffLogoutResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();

    return this.executeLiveMutation<StaffLogoutResponse>(
      "staff",
      "/staff/logout",
      undefined,
      200,
      validateMessageData,
      true, // auth-changing: revokes staff session & drops CSRF
      options
    );
  }

  logoutStaff(options?: IdentityApiRequestOptions): Promise<StaffLogoutResponse> {
    return this.postStaffLogout(options);
  }

  // ==========================================
  // 12. GET /staff/me
  // ==========================================
  async getStaffMe(options?: IdentityApiRequestOptions): Promise<StaffMeResponse> {
    validateRequestOptions(options);
    this.#ensureEnabled();
    this.#ensureNotDisposed();

    return this.executeLiveRead<StaffMeResponse>(
      "staff",
      "/staff/me",
      validateStaffMeData,
      options
    );
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
    realm: "passenger" | "staff",
    endpointPath: string,
    validateData: (data: unknown) => T["data"],
    options?: IdentityApiRequestOptions
  ): Promise<T> {
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
    realm: "passenger" | "staff",
    endpointPath: string,
    body: unknown,
    expectedStatus: number,
    validateData: (data: unknown) => T["data"],
    isAuthChanging: boolean,
    options?: IdentityApiRequestOptions
  ): Promise<T> {
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
            method: "POST",
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
