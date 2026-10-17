import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLink } from "@/components/app-link";
import { Container, Field, Input, Panel, Code, btnClass } from "@/components/kit";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ConfirmedReservationTicket } from "./mvp-reservation-views";
import { useI18n } from "@/lib/i18n";
import { MvpApiError } from "@/lib/api/mvp-client";
import {
  guestReservationClient,
  type GuestCancellation,
} from "@/lib/reservations/guest-client";
import type { ReservationDetail } from "@/lib/reservations/client";

const RESEND_COOLDOWN_SECONDS = 60;
const MAX_RESEND_ATTEMPTS = 5;

/**
 * MvpBookingAccess
 *
 * Implements guest booking retrieval, verification, ticket view, printing,
 * and cancellation without requiring account sign-in.
 *
 * Privacy & Security Invariants:
 * - Ephemeral session-scoped proof only: NO tokens or PII in localStorage, sessionStorage, or URL query parameters.
 * - Decoy-safe acknowledgement: Never confirms or denies booking existence prior to verification.
 * - Delivery note: Truthfully states verification emails are queued and may take up to a minute (cron cadence).
 * - Bounded resend with explicit cooldown (no auto-loop).
 * - Real cancellation button with accessible Radix ConfirmDialog.
 * - Cancelled tickets are never presented as valid travel documents.
 * - Ephemeral queries are cleaned up on unmount or identity reset.
 */
import {
  parseGuestAccessRecoveryHash,
} from "@/lib/reservations/guest-recovery";

export function MvpBookingAccess({ checkIn = false }: { checkIn?: boolean }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const fieldId = useId();
  const instanceId = useId();
  const cache = useQueryClient();

  // Workflow stages: "lookup" -> "verify" -> "detail"
  const [stage, setStage] = useState<"lookup" | "verify" | "detail">("lookup");

  // Form states (kept purely in React memory)
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  // Cooldown & attempt limits
  const [cooldown, setCooldown] = useState(0);
  const [resendCount, setResendCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const challengeGen = useRef(0);

  // Status & error tracking
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Cancellation modal
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancellationResult, setCancellationResult] = useState<GuestCancellation | null>(null);

  // Verified detail query (only enabled once stage is "detail" and reference is verified)
  const queryKey = ["mvp", "guest-access", instanceId, reference.trim().toUpperCase()];
  const detailQuery = useQuery({
    queryKey,
    enabled: stage === "detail" && Boolean(reference),
    retry: false,
    queryFn: async ({ signal }): Promise<ReservationDetail> => {
      return guestReservationClient.detail(reference.trim().toUpperCase(), { signal });
    },
  });

  // Cooldown countdown effect
  useEffect(() => {
    if (cooldown > 0) {
      timerRef.current = setInterval(() => {
        setCooldown(prev => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [cooldown]);

  // Clean up ephemeral queries on unmount
  useEffect(() => {
    return () => {
      void cache.removeQueries({ queryKey: ["mvp", "guest-access", instanceId] });
    };
  }, [cache, instanceId]);

  // Restore guest challenge locator, reference, and email from URL fragment if returning from email recovery link
  useEffect(() => {
    if (typeof window === "undefined") return;
    const rec = parseGuestAccessRecoveryHash(window.location.hash);
    if (rec) {
      if (rec.reference) setReference(rec.reference);
      if (rec.email) setEmail(rec.email);
      setChallengeId(rec.challengeId);
      setStage("verify");
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  // Reset all session state back to lookup
  const handleReset = () => {
    challengeGen.current++;
    guestReservationClient.invalidateAccessGrant(reference);
    void cache.removeQueries({ queryKey });
    setStage("lookup");
    setReference("");
    setEmail("");
    setChallengeId(null);
    setCode("");
    setCooldown(0);
    setResendCount(0);
    setFormError(null);
    setCancellationResult(null);
  };

  // 1. Submit lookup challenge
  const handleRequestChallenge = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFormError(null);
    const normRef = reference.trim().toUpperCase();
    const normEmail = email.trim().toLowerCase();

    if (!normRef || normRef.length < 6 || normRef.length > 16) {
      setFormError(
        ar
          ? "أدخل مرجع حجز صالح (٦-١٦ حرفاً، مثل GZA-7K8P)."
          : "Enter a valid booking reference (6–16 characters, e.g. GZA-7K8P).",
      );
      return;
    }
    if (!normEmail || !normEmail.includes("@")) {
      setFormError(ar ? "أدخل بريداً إلكترونياً صالحاً." : "Enter a valid email address.");
      return;
    }

    setPending(true);
    const currentGen = ++challengeGen.current;
    try {
      const response = await guestReservationClient.requestAccessChallenge(normRef, normEmail);
      if (
        currentGen !== challengeGen.current ||
        reference.trim().toUpperCase() !== normRef ||
        email.trim().toLowerCase() !== normEmail
      ) {
        return;
      }
      setChallengeId(response.challengeId);
      setStage("verify");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setCode("");
    } catch (err) {
      if (currentGen !== challengeGen.current) return;
      const status = err instanceof MvpApiError ? err.status : undefined;
      if (status === 429) {
        setFormError(
          ar
            ? "عدد محاولات كبير. يُرجى الانتظار دقيقة قبل المحاولة مجدداً."
            : "Too many attempts. Please wait a moment before trying again.",
        );
      } else {
        setFormError(
          ar
            ? "تعذر إرسال رمز التحقق حالياً. تحقق من البيانات وحاول مجدداً."
            : "Unable to send verification code. Please check your details and try again.",
        );
      }
    } finally {
      if (currentGen === challengeGen.current) {
        setPending(false);
      }
    }
  };

  // 2. Resend code (explicit, bounded cooldown)
  const handleResend = async () => {
    if (cooldown > 0 || resendCount >= MAX_RESEND_ATTEMPTS || pending) return;
    setFormError(null);
    setPending(true);
    const currentGen = ++challengeGen.current;
    try {
      const normRef = reference.trim().toUpperCase();
      const normEmail = email.trim().toLowerCase();
      const response = await guestReservationClient.requestAccessChallenge(normRef, normEmail);
      if (
        currentGen !== challengeGen.current ||
        reference.trim().toUpperCase() !== normRef ||
        email.trim().toLowerCase() !== normEmail
      ) {
        return;
      }
      setChallengeId(response.challengeId);
      setResendCount(c => c + 1);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      if (currentGen !== challengeGen.current) return;
      setFormError(
        ar
          ? "تعذر إعادة إرسال الرمز حالياً. حاول بعد قليل."
          : "Could not resend verification code right now. Please try again shortly.",
      );
    } finally {
      if (currentGen === challengeGen.current) {
        setPending(false);
      }
    }
  };

  // 3. Submit verification code
  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!challengeId || code.length !== 6 || pending) return;
    setFormError(null);
    setPending(true);

    const currentGen = challengeGen.current;
    const normRef = reference.trim().toUpperCase();
    const normEmail = email.trim().toLowerCase();

    try {
      await guestReservationClient.verifyAccess(challengeId, code, normRef, normEmail);
      if (
        currentGen !== challengeGen.current ||
        reference.trim().toUpperCase() !== normRef ||
        email.trim().toLowerCase() !== normEmail
      ) {
        return;
      }
      setStage("detail");
    } catch (err) {
      if (currentGen !== challengeGen.current) return;
      const status = err instanceof MvpApiError ? err.status : undefined;
      if (status === 429) {
        setFormError(
          ar
            ? "تم تجاوز عدد المحاولات للرمز. أعد إرسال رمز جديد."
            : "Verification attempts exceeded. Please request a new code.",
        );
      } else {
        setFormError(
          ar
            ? "رمز التحقق غير صحيح أو انتهت صلاحيته. راجع الرمز وحاول مجدداً."
            : "Invalid or expired verification code. Please check the code and try again.",
        );
      }
    } finally {
      if (currentGen === challengeGen.current) {
        setPending(false);
      }
    }
  };

  // 4. Cancel booking action
  const handleConfirmCancel = async () => {
    if (cancelPending) return;
    setCancelPending(true);
    setCancelError(null);
    const normRef = reference.trim().toUpperCase();

    try {
      const result = await guestReservationClient.cancel(normRef);
      setCancellationResult(result);
      setCancelOpen(false);
      // Invalidate detail query so status reflects cancellation
      void cache.invalidateQueries({ queryKey });
    } catch (err) {
      const status = err instanceof MvpApiError ? err.status : undefined;
      if (status === 401 || status === 403) {
        setCancelError(
          ar
            ? "انتهت صلاحية إذن الوصول. يُرجى التحقق مجدداً."
            : "Verification grant expired. Please re-verify.",
        );
        setStage("lookup");
      } else {
        setCancelError(
          ar
            ? "تعذر إتمام الإلغاء. حاول مجدداً أو حدّث الصفحة."
            : "Could not cancel booking. Please try again or refresh.",
        );
      }
    } finally {
      setCancelPending(false);
    }
  };

  return (
    <Container className="max-w-4xl py-12">
      {/* Page Header */}
      <div className="mb-8 space-y-2">
        <h1 className="type-title-section">{ar ? "إدارة الحجز" : "Manage booking"}</h1>
        {checkIn && (
          <div
            role="status"
            className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground"
          >
            <p className="font-medium">
              {ar ? "معلومات تسجيل الوصول" : "Check-In Information"}
            </p>
            <p className="mt-1 text-muted-foreground">
              {ar
                ? "تذكرتك وسجل حجزك المؤكد متاحان أدناه."
                : "Your ticket and verified booking are accessible below."}
            </p>
          </div>
        )}
      </div>

      {/* Stage 1: Lookup Form */}
      {stage === "lookup" && (
        <Panel className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold">
              {ar ? "استرجاع الحجز برمز التحقق" : "Retrieve booking with code"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {ar
                ? "أدخل مرجع الحجز والبريد الإلكتروني المستخدم أثناء الحجز لتلقي رمز التحقق."
                : "Enter your booking reference and contact email to receive a secure 6-digit access code."}
            </p>
          </div>

          <form onSubmit={handleRequestChallenge} className="space-y-5">
            <Field label={ar ? "مرجع الحجز (PNR)" : "Booking reference (PNR)"} htmlFor={`${fieldId}-ref`}>
              <Input
                id={`${fieldId}-ref`}
                required
                maxLength={16}
                value={reference}
                onChange={e => setReference(e.target.value.toUpperCase())}
                placeholder="GZA-7K8P"
                dir="ltr"
                autoComplete="off"
                className="font-mono uppercase tracking-wider"
              />
            </Field>

            <Field label={ar ? "البريد الإلكتروني للتواصل" : "Contact email"} htmlFor={`${fieldId}-email`}>
              <Input
                id={`${fieldId}-email`}
                type="email"
                required
                maxLength={254}
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@example.com"
                dir="ltr"
                autoComplete="email"
              />
            </Field>

            {formError && (
              <p role="alert" className="rounded-lg border border-clay p-3 text-sm text-clay">
                {formError}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button type="submit" disabled={pending} className={btnClass("primary", "md")}>
                {pending
                  ? ar
                    ? "جارٍ المعالجة…"
                    : "Processing…"
                  : ar
                    ? "إرسال رمز التحقق"
                    : "Send verification code"}
              </button>

              <AppLink to="/account/trips" className={btnClass("ghost", "md")}>
                {ar ? "أو سجّل الدخول لعرض حسابك" : "Or sign in to view account bookings"}
              </AppLink>
            </div>
          </form>
        </Panel>
      )}

      {/* Stage 2: Code Verification */}
      {stage === "verify" && (
        <Panel className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold">
              {ar ? "إدخال رمز التحقق" : "Enter verification code"}
            </h2>
            <div
              role="status"
              className="mt-3 rounded-lg border border-sand-deep/40 bg-sand/30 p-3 text-sm text-foreground"
            >
              <p>
                {ar
                  ? "إذا وُجد حجز مطابق، يتم جدولة إرسال رمز التحقق المكوّن من ٦ أرقام إلى بريدك الإلكتروني. تفقد البريد الوارد وغير الهام."
                  : "If a matching booking exists, a 6-digit verification code is queued for scheduled email dispatch. Please check your inbox and spam folder."}
              </p>
            </div>
          </div>

          <form onSubmit={handleVerify} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor={`${fieldId}-otp`} className="block text-sm font-medium">
                {ar ? "رمز التحقق (٦ أرقام)" : "Verification code (6 digits)"}
              </label>
              <div dir="ltr" className="flex justify-start">
                <InputOTP
                  id={`${fieldId}-otp`}
                  maxLength={6}
                  value={code}
                  onChange={val => setCode(val)}
                  autoComplete="one-time-code"
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>

            {formError && (
              <p role="alert" className="rounded-lg border border-clay p-3 text-sm text-clay">
                {formError}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={code.length !== 6 || pending}
                className={btnClass("primary", "md")}
              >
                {pending
                  ? ar
                    ? "جارٍ التحقق…"
                    : "Verifying…"
                  : ar
                    ? "التحقق وعرض الحجز"
                    : "Verify and view booking"}
              </button>

              <button
                type="button"
                disabled={cooldown > 0 || resendCount >= MAX_RESEND_ATTEMPTS || pending}
                onClick={handleResend}
                className={btnClass("outline", "md")}
              >
                {cooldown > 0
                  ? ar
                    ? `إعادة الإرسال بعد (${cooldown} ث)`
                    : `Resend code (${cooldown}s)`
                  : ar
                    ? "إعادة إرسال الرمز"
                    : "Resend code"}
              </button>

              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  challengeGen.current++;
                  setStage("lookup");
                  setFormError(null);
                }}
                className={btnClass("ghost", "md")}
              >
                {ar ? "تعديل المرجع أو البريد" : "Change reference or email"}
              </button>
            </div>
          </form>
        </Panel>
      )}

      {/* Stage 3: Booking Detail & Actions */}
      {stage === "detail" && (
        <div className="space-y-6">
          {detailQuery.isPending && (
            <p role="status" className="text-muted-foreground animate-pulse">
              {ar ? "جارٍ تحميل تفاصيل الحجز…" : "Loading booking details…"}
            </p>
          )}

          {detailQuery.isError && (
            <div role="alert" className="space-y-4 rounded-xl border border-clay p-5">
              <p className="text-clay">
                {detailQuery.error instanceof MvpApiError &&
                (detailQuery.error.status === 401 || detailQuery.error.status === 403)
                  ? ar
                    ? "انتهت صلاحية جلسة التحقق. يُرجى طلب رمز تحقق جديد للمتابعة."
                    : "Your verification grant has expired. Please request a new code to continue."
                  : ar
                    ? "تعذر استرجاع الحجز. تحقق من المرجع وحاول مجدداً."
                    : "Unable to load booking details. Please try again."}
              </p>
              <div className="flex gap-3">
                <button
                  className={btnClass("primary", "sm")}
                  onClick={() => {
                    setStage("lookup");
                    setFormError(null);
                  }}
                >
                  {ar ? "طلب رمز جديد" : "Request new code"}
                </button>
                <button
                  className={btnClass("outline", "sm")}
                  onClick={() => void detailQuery.refetch()}
                >
                  {ar ? "إعادة المحاولة" : "Retry"}
                </button>
              </div>
            </div>
          )}

          {!detailQuery.isPending && !detailQuery.isError && detailQuery.data && (
            <div className="space-y-6">
              {/* Status Header */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">
                    {detailQuery.data.reservation.status === "confirmed" && !cancellationResult
                      ? ar
                        ? "تفاصيل الحجز المؤكد"
                        : "Confirmed booking details"
                      : ar
                        ? "هذا الحجز ملغى"
                        : "This booking is cancelled"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {ar ? "المرجع" : "Reference"}:{" "}
                    <Code className="text-base font-bold">{detailQuery.data.reservation.reference}</Code>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleReset}
                  className={btnClass("ghost", "sm", "print:hidden")}
                >
                  {ar ? "البحث عن حجز آخر" : "Look up another booking"}
                </button>
              </div>

              {/* Notice for Cancelled Bookings */}
              {(detailQuery.data.reservation.status === "cancelled" || cancellationResult) && (
                <div
                  role="alert"
                  className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive"
                >
                  <p className="font-semibold">
                    {ar ? "الحجز ملغى رسميًا" : "Booking cancelled"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {ar
                      ? "تم تحرير المقاعد المحجوزة. التذاكر السابقة لم تعد صالحة."
                      : "Reserved seats have been released. Previous tickets are no longer valid."}
                  </p>
                </div>
              )}

              {/* Render Valid Ticket only if confirmed */}
              {detailQuery.data.reservation.status === "confirmed" && !cancellationResult && (
                <div className="space-y-6">
                  <ConfirmedReservationTicket data={detailQuery.data} />

                  <div className="flex flex-wrap items-center gap-3 print:hidden">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className={btnClass("primary", "md")}
                    >
                      {ar ? "طباعة / حفظ PDF" : "Print / save PDF"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCancelError(null);
                        setCancelOpen(true);
                      }}
                      className={btnClass("outline", "md")}
                    >
                      {ar ? "إلغاء هذا الحجز" : "Cancel this booking"}
                    </button>

                    <button
                      type="button"
                      onClick={() => void detailQuery.refetch()}
                      className={btnClass("ghost", "md")}
                    >
                      {ar ? "تحديث الحالة" : "Refresh status"}
                    </button>
                  </div>
                </div>
              )}

              {/* Cancel Confirmation Dialog */}
              <ConfirmDialog
                open={cancelOpen}
                title={ar ? "تأكيد إلغاء الحجز؟" : "Confirm booking cancellation?"}
                body={
                  ar
                    ? "سيتم تحرير المقاعد فوراً. سيبقى سجل الحجز الملغى متاحاً للاطلاع فقط ولا يمكن استرجاع التذكرة الملغاة."
                    : "Seats will be immediately released. The cancelled record remains available for history, but cancelled tickets cannot be reinstated."
                }
                confirmLabel={ar ? "نعم، إلغاء الحجز" : "Yes, cancel booking"}
                cancelLabel={ar ? "الاحتفاظ بالحجز" : "Keep booking"}
                onConfirm={handleConfirmCancel}
                onClose={() => setCancelOpen(false)}
                pending={cancelPending}
                error={cancelError}
                preserveOpenOnConfirm
              />
            </div>
          )}
        </div>
      )}
    </Container>
  );
}
