import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLink } from "@/components/app-link";
import { Container, Field, Input, Panel, Select, Code, btnClass } from "@/components/kit";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { SeatMap } from "./seat-map";
import { ConfirmedReservationTicket } from "./mvp-reservation-views";
import { CommemorativeTicketPrintRegion } from "./commemorative-ticket";
import { useI18n, pick } from "@/lib/i18n";
import { usePassengerAccount, usePassengerTravelers } from "@/lib/passenger";
import { useMealsQuery } from "@/lib/meals/queries";
import { getMvpUiClient } from "@/lib/api/mvp-ui-runtime";
import { MvpApiError } from "@/lib/api/mvp-client";
import { offeringWireSchema } from "@/lib/offerings/schema";
import { decodeDatedOfferingId } from "@/lib/offerings/codec";
import { ReservationAttempt } from "@/lib/reservations/attempt";
import { reservationClient } from "@/lib/reservations/queries";
import { guestReservationClient } from "@/lib/reservations/guest-client";
import {
  TripReservationAttempt,
  tripClient,
  validateTripChronology,
  type GuestTripCommand,
  type TripCommand,
  type TripResponse,
} from "@/lib/reservations/trip-client";
import type { GuestReservationCommand, ReservationCommand, ReservationDetail } from "@/lib/reservations/client";
import type { PassengerAccount } from "@/lib/passenger/domain";
import { MvpOfferingBoard } from "@/components/mvp-offering-board";

const GUEST_RESEND_COOLDOWN_SECONDS = 60;
const MAX_GUEST_RESEND_ATTEMPTS = 5;

import {
  type GuestBookingRecoveryParams,
  parseGuestBookingRecoveryHash,
} from "@/lib/reservations/guest-recovery";

interface MvpFreeBookingProps {
  offeringId?: string | undefined;
  returnOfferingId?: string | undefined;
}

export function MvpFreeBooking({ offeringId, returnOfferingId }: MvpFreeBookingProps) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const account = usePassengerAccount();
  const [recoveredGuestState, setRecoveredGuestState] = useState<GuestBookingRecoveryParams | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const rec = parseGuestBookingRecoveryHash(window.location.hash);
    if (rec) {
      setRecoveredGuestState(rec);
    }
  }, []);

  const isOutboundValid = Boolean(offeringId && decodeDatedOfferingId(offeringId));
  const isReturnValid = Boolean(returnOfferingId && decodeDatedOfferingId(returnOfferingId));

  return (
    <Container className="space-y-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="type-title-page">
            {returnOfferingId
              ? ar
                ? "حجز رحلة ذهاب وعودة"
                : "Book round-trip flight"
              : ar
                ? "حجز رحلة"
                : "Book a flight"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ar
              ? "حجز رحلة لمطار غزة الدولي. تأكيد فوري بدون دفع أو بطاقة بنكية."
              : "Flight booking for Gaza International Airport. Instant confirmation with no payment or credit card required."}
          </p>
        </div>

        {/* Account indicator / guest switch */}
        <div>
          {account.data ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                {ar ? "مسجّل الدخول كـ" : "Signed in as"}{" "}
                <bdi dir="ltr" className="font-medium text-foreground">
                  {account.data.email}
                </bdi>
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {ar ? "الحجز كزائر (بدون حساب)" : "Booking as guest"}
              </span>
              <span aria-hidden="true">·</span>
              <AppLink to="/signin" className="font-medium underline hover:text-primary">
                {ar ? "تسجيل الدخول" : "Sign in"}
              </AppLink>
            </div>
          )}
        </div>
      </div>

      {isOutboundValid ? (
        <BookingForm
          key={`${offeringId}:${returnOfferingId ?? "ow"}`}
          account={account.data ?? null}
          offeringId={offeringId!}
          returnOfferingId={isReturnValid ? returnOfferingId : undefined}
          initialRecovery={recoveredGuestState}
          onRecoveryConsumed={() => setRecoveredGuestState(null)}
        />
      ) : (
        <MvpOfferingBoard />
      )}
    </Container>
  );
}

interface BookingPassenger {
  id: string;
  type: "adult" | "child";
  firstName: string;
  lastName: string;
  dob: string;
  nationality: string;
  document: string;
  seatCode: string;
  returnSeatCode: string;
  mealId: string | null;
  returnMealId: string | null;
}

const emptyPassenger = (index: number): BookingPassenger => ({
  id: `p${index}`,
  type: "adult",
  firstName: "",
  lastName: "",
  dob: "",
  nationality: "",
  document: "",
  seatCode: "",
  returnSeatCode: "",
  mealId: null,
  returnMealId: null,
});

function BookingForm({
  account,
  offeringId,
  returnOfferingId,
  initialRecovery,
  onRecoveryConsumed,
}: {
  account: PassengerAccount | null;
  offeringId: string;
  returnOfferingId?: string | undefined;
  initialRecovery?: GuestBookingRecoveryParams | null;
  onRecoveryConsumed?: () => void;
}) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const cache = useQueryClient();
  const fieldId = useId();
  const isRoundTrip = Boolean(returnOfferingId);

  // Queries
  const offering = useQuery({
    queryKey: ["mvp", "offering", offeringId],
    retry: false,
    queryFn: async () => {
      const data = await getMvpUiClient().request({
        method: "GET",
        path: `/offerings/${offeringId}`,
        realm: "public",
        schema: offeringWireSchema,
      });
      if (data.id !== offeringId) throw new MvpApiError("protocol");
      return data;
    },
  });

  const returnOffering = useQuery({
    queryKey: ["mvp", "offering", returnOfferingId],
    enabled: isRoundTrip,
    retry: false,
    queryFn: async () => {
      if (!returnOfferingId) throw new Error("No return offering ID");
      const data = await getMvpUiClient().request({
        method: "GET",
        path: `/offerings/${returnOfferingId}`,
        realm: "public",
        schema: offeringWireSchema,
      });
      if (data.id !== returnOfferingId) throw new MvpApiError("protocol");
      return data;
    },
  });

  const occupancy = useQuery({
    queryKey: ["mvp", "occupancy", offeringId],
    retry: false,
    refetchOnWindowFocus: "always",
    queryFn: () => reservationClient.occupancy(offeringId),
  });

  const returnOccupancy = useQuery({
    queryKey: ["mvp", "occupancy", returnOfferingId],
    enabled: isRoundTrip,
    retry: false,
    refetchOnWindowFocus: "always",
    queryFn: () => {
      if (!returnOfferingId) throw new Error("No return offering ID");
      return reservationClient.occupancy(returnOfferingId);
    },
  });

  const meals = useMealsQuery();
  const travelers = usePassengerTravelers();

  // Contact form state
  const [email, setEmail] = useState(() => {
    if (account?.email) return account.email;
    if (initialRecovery?.email) return initialRecovery.email;
    if (typeof window !== "undefined") {
      const rec = parseGuestBookingRecoveryHash(window.location.hash);
      if (rec?.email) return rec.email;
    }
    return "";
  });
  const [phone, setPhone] = useState(() => account?.phone ?? "");
  const emailRef = useRef(email);
  emailRef.current = email;
  const mountedRef = useRef(true);

  // Guest email OTP verification state
  const [guestVerifiedEmail, setGuestVerifiedEmail] = useState<string | null>(null);
  const [guestChallengeId, setGuestChallengeId] = useState<string | null>(() => {
    if (initialRecovery?.challengeId) return initialRecovery.challengeId;
    if (typeof window !== "undefined") {
      const rec = parseGuestBookingRecoveryHash(window.location.hash);
      if (rec?.challengeId) return rec.challengeId;
    }
    return null;
  });
  const [guestOtpCode, setGuestOtpCode] = useState("");
  const [guestSendingCode, setGuestSendingCode] = useState(false);
  const [guestVerifyingCode, setGuestVerifyingCode] = useState(false);
  const [guestCooldown, setGuestCooldown] = useState(0);
  const [guestResendCount, setGuestResendCount] = useState(0);
  const [guestError, setGuestError] = useState<string | null>(null);
  const guestTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendGen = useRef(0);
  const challengeEmailRef = useRef<string | null>(
    initialRecovery?.email ? initialRecovery.email.trim().toLowerCase() : (
      typeof window !== "undefined"
        ? (parseGuestBookingRecoveryHash(window.location.hash)?.email?.trim().toLowerCase() ?? null)
        : null
    ),
  );

  // Guard against late completions and clear intervals after unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sendGen.current += 1;
      if (guestTimerRef.current) {
        clearInterval(guestTimerRef.current);
        guestTimerRef.current = null;
      }
    };
  }, []);

  // Restore guest challenge locator and expected email from initialRecovery or URL fragment
  useEffect(() => {
    if (typeof window === "undefined") return;
    const rec = initialRecovery || parseGuestBookingRecoveryHash(window.location.hash);
    if (rec) {
      if (rec.challengeId) setGuestChallengeId(rec.challengeId);
      if (rec.email) {
        setEmail(rec.email);
        emailRef.current = rec.email;
        challengeEmailRef.current = rec.email.trim().toLowerCase();
      }
      onRecoveryConsumed?.();
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [initialRecovery, onRecoveryConsumed]);

  // Passengers & seats
  const [passengers, setPassengers] = useState<BookingPassenger[]>(() => [
    {
      ...emptyPassenger(1),
      firstName: account?.firstName ?? "",
      lastName: account?.lastName ?? "",
    },
  ]);
  const nextId = useRef(2);

  // UI tabs & selection
  const [activePassenger, setActivePassenger] = useState(0);
  const [activeLegTab, setActiveLegTab] = useState<"outbound" | "return">("outbound");
  const [activeTicketTab, setActiveTicketTab] = useState<"outbound" | "return">("outbound");

  // Attempt idempotency helpers
  const oneWayAttempt = useRef(new ReservationAttempt());
  const tripAttempt = useRef(new TripReservationAttempt());

  // Form submission status
  const [pending, setPending] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync account fields when account data resolves or updates (only if attempt is not locked)
  useEffect(() => {
    if (!account || locked) return;
    if (!phone && account.phone) setPhone(account.phone);
    setPassengers(curr => {
      if (curr.length > 0 && !curr[0]!.firstName && !curr[0]!.lastName && (account.firstName || account.lastName)) {
        return curr.map((p, i) =>
          i === 0
            ? { ...p, firstName: account.firstName ?? "", lastName: account.lastName ?? "" }
            : p,
        );
      }
      return curr;
    });
  }, [account, locked, phone]);

  // Success outcomes
  const [confirmedOneWay, setConfirmedOneWay] = useState<ReservationDetail | null>(null);
  const [confirmedTrip, setConfirmedTrip] = useState<TripResponse | null>(null);

  // Cooldown timer for guest verification
  useEffect(() => {
    if (guestCooldown > 0) {
      guestTimerRef.current = setInterval(() => {
        setGuestCooldown(prev => {
          if (prev <= 1) {
            if (guestTimerRef.current) clearInterval(guestTimerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (guestTimerRef.current) clearInterval(guestTimerRef.current);
    };
  }, [guestCooldown]);

  // Passenger update handler
  const updatePassenger = (index: number, patch: Partial<BookingPassenger>) => {
    if (!locked && !pending) {
      setPassengers(current => current.map((p, i) => (i === index ? { ...p, ...patch } : p)));
    }
  };

  // Guest email modification handler
  const handleEmailChange = (newEmail: string) => {
    if (locked || pending) return;
    const prevNorm = emailRef.current.trim().toLowerCase();
    const nextNorm = newEmail.trim().toLowerCase();
    emailRef.current = newEmail;
    setEmail(newEmail);

    if (prevNorm !== nextNorm) {
      sendGen.current += 1;
      challengeEmailRef.current = null;
      setGuestChallengeId(null);
      setGuestOtpCode("");
      setGuestSendingCode(false);
      setGuestVerifyingCode(false);
      setGuestError(null);
      if (guestTimerRef.current) {
        clearInterval(guestTimerRef.current);
        guestTimerRef.current = null;
      }
      setGuestCooldown(0);
      setGuestResendCount(0);
      if (guestVerifiedEmail) {
        guestReservationClient.invalidateEmailGrant(guestVerifiedEmail);
        setGuestVerifiedEmail(null);
      }
      if (prevNorm) {
        guestReservationClient.invalidateEmailGrant(prevNorm);
      }
    }
  };

  // Trigger guest verification code
  const handleSendGuestCode = async () => {
    const normEmail = emailRef.current.trim().toLowerCase();
    if (!normEmail || !normEmail.includes("@")) {
      setGuestError(ar ? "أدخل بريداً إلكترونياً صالحاً أولاً." : "Please enter a valid email address first.");
      return;
    }
    if (guestCooldown > 0 || guestResendCount >= MAX_GUEST_RESEND_ATTEMPTS || guestSendingCode) return;

    setGuestSendingCode(true);
    setGuestError(null);
    const currentGen = ++sendGen.current;
    try {
      const resp = await guestReservationClient.requestEmailChallenge(normEmail);
      if (!mountedRef.current || currentGen !== sendGen.current || emailRef.current.trim().toLowerCase() !== normEmail) {
        return;
      }
      challengeEmailRef.current = normEmail;
      setGuestChallengeId(resp.challengeId);
      setGuestCooldown(GUEST_RESEND_COOLDOWN_SECONDS);
      setGuestResendCount(c => c + 1);
    } catch (err) {
      if (!mountedRef.current || currentGen !== sendGen.current || emailRef.current.trim().toLowerCase() !== normEmail) return;
      const status = err instanceof MvpApiError ? err.status : undefined;
      if (status === 429) {
        setGuestCooldown(GUEST_RESEND_COOLDOWN_SECONDS);
      }
      setGuestError(
        status === 429
          ? ar
            ? "عدد محاولات كبير. انتظر دقيقة قبل المحاولة مجدداً."
            : "Too many attempts. Please wait a minute before trying again."
          : ar
            ? "تعذر إرسال رمز التحقق. تأكد من البريد وحاول ثانية."
            : "Could not send verification code. Please check your email and try again.",
      );
    } finally {
      if (mountedRef.current && currentGen === sendGen.current) {
        setGuestSendingCode(false);
      }
    }
  };

  // Verify guest OTP code
  const handleVerifyGuestCode = async () => {
    if (!guestChallengeId || guestOtpCode.length !== 6 || guestVerifyingCode) return;
    const currentGen = sendGen.current;
    const targetEmail = challengeEmailRef.current || emailRef.current.trim().toLowerCase();
    if (!targetEmail || !targetEmail.includes("@")) {
      setGuestError(
        ar ? "يرجى إدخال بريد إلكتروني صالح قبل تأكيد الرمز." : "Please enter a valid email address before confirming code.",
      );
      return;
    }
    if (emailRef.current.trim().toLowerCase() !== targetEmail) {
      setGuestError(
        ar
          ? "البريد الإلكتروني لا يطابق رمز التحقق المطلوب. اطلب رمزاً جديداً."
          : "Entered email does not match challenge email. Please request a new verification code.",
      );
      return;
    }

    setGuestVerifyingCode(true);
    setGuestError(null);
    try {
      await guestReservationClient.verifyEmail(guestChallengeId, guestOtpCode, targetEmail);
      if (!mountedRef.current || currentGen !== sendGen.current || emailRef.current.trim().toLowerCase() !== targetEmail) {
        return;
      }
      setGuestVerifiedEmail(targetEmail);
      setGuestChallengeId(null);
    } catch {
      if (!mountedRef.current || currentGen !== sendGen.current || emailRef.current.trim().toLowerCase() !== targetEmail) return;
      setGuestError(
        ar
          ? "رمز التحقق غير صحيح أو منتهي الصلاحية. راجع الرمز وحاول مجدداً."
          : "Invalid or expired verification code. Please check the code and try again.",
      );
    } finally {
      if (mountedRef.current && currentGen === sendGen.current) {
        setGuestVerifyingCode(false);
      }
    }
  };

  // Confirm booking submission
  const confirmBooking = async () => {
    if (pending) return;
    setError(null);

    const effectiveEmail = (account ? account.email : email).trim().toLowerCase();
    const effectivePhone = phone.trim();
    const principalScope = account
      ? `account:${account.email.trim().toLowerCase()}`
      : `guest:${effectiveEmail}`;

    // Verification check for guest checkout
    if (!account) {
      if (!effectiveEmail || !effectiveEmail.includes("@")) {
        setError(ar ? "يرجى إدخال البريد الإلكتروني للتواصل." : "Please enter a valid contact email.");
        return;
      }
      if (!guestVerifiedEmail || guestVerifiedEmail.toLowerCase() !== effectiveEmail) {
        setError(
          ar
            ? "يرجى التحقق من بريدك الإلكتروني عبر الرمز المكوّن من ٦ أرقام قبل إتمام الحجز."
            : "Please verify your email address using the 6-digit code before completing your booking.",
        );
        if (!guestChallengeId) void handleSendGuestCode();
        return;
      }
    }

    // Chronology and route pair check for round-trip (fail closed)
    if (isRoundTrip) {
      const out = offering.data;
      const ret = returnOffering.data;
      const validRoutes = Boolean(
        out &&
          ret &&
          out.id !== ret.id &&
          out.originCode === ret.destinationCode &&
          out.destinationCode === ret.originCode,
      );
      const validTimings = Boolean(
        out?.arriveAt &&
          ret?.departAt &&
          validateTripChronology(out.arriveAt, ret.departAt),
      );

      if (!validRoutes || !validTimings) {
        setError(
          ar
            ? "بيانات رحلة الذهاب والعودة غير صالحة أو غير متوافقة زمنياً وجغرافياً. يجب أن تكون المحطات متقابلة وموعد العودة بعد الوصول."
            : "Round-trip flights are invalid or temporally/geographically incompatible. Must have opposite airports and return departure strictly after outbound arrival.",
        );
        return;
      }
    }

    setPending(true);
    setLocked(true);

    try {
      if (isRoundTrip) {
        // --- Round-Trip Two-Leg Submission ---
        let command: TripCommand | GuestTripCommand;
        try {
          if (!account) {
            command = tripAttempt.current.prepare(
              principalScope,
              {
                contact: { email: effectiveEmail, phone: effectivePhone },
                legs: [
                  {
                    serviceId: offeringId,
                    passengers: passengers.map(p => ({
                      id: p.id,
                      name: p.firstName.trim(),
                      type: p.type,
                      seatCode: p.seatCode,
                      dob: p.dob || null,
                      nationality: p.nationality.trim() || null,
                      document: p.document.trim() || null,
                      mealId: p.mealId || null,
                    })),
                  },
                  {
                    serviceId: returnOfferingId!,
                    passengers: passengers.map(p => ({
                      id: p.id,
                      name: p.firstName.trim(),
                      type: p.type,
                      seatCode: p.returnSeatCode,
                      dob: p.dob || null,
                      nationality: p.nationality.trim() || null,
                      document: p.document.trim() || null,
                      mealId: p.returnMealId || null,
                    })),
                  },
                ],
              },
              true,
            );
          } else {
            command = tripAttempt.current.prepare(
              principalScope,
              {
                contact: { email: effectiveEmail, phone: effectivePhone },
                legs: [
                  {
                    serviceId: offeringId,
                    passengers: passengers.map(p => ({
                      id: p.id,
                      type: p.type,
                      firstName: p.firstName,
                      lastName: p.lastName,
                      dob: p.dob,
                      nationality: p.nationality,
                      document: p.document,
                      seatCode: p.seatCode,
                      mealId: p.mealId,
                    })),
                  },
                  {
                    serviceId: returnOfferingId!,
                    passengers: passengers.map(p => ({
                      id: p.id,
                      type: p.type,
                      firstName: p.firstName,
                      lastName: p.lastName,
                      dob: p.dob,
                      nationality: p.nationality,
                      document: p.document,
                      seatCode: p.returnSeatCode,
                      mealId: p.returnMealId,
                    })),
                  },
                ],
              },
              false,
            );
          }
        } catch {
          setPending(false);
          if (tripAttempt.current.locked) {
            setError(
              ar
                ? "لا يمكن تغيير سياق الحساب أو البريد أثناء وجود محاولة حجز معلقة. يرجى إتمام الحجز الأصلي بنفس البيانات."
                : "Cannot switch account or guest context while an attempt is frozen. Please complete the original booking confirmation.",
            );
            return;
          }
          setLocked(false);
          setError(
            ar
              ? "تحقق من تعبئة جميع بيانات المسافرين والمقاعد لكلا الرحلتين. الأعمار: بالغ ١٢+، طفل ٢–١١."
              : "Check passenger details, birth dates, and seat assignments for both legs. Adult: 12+, child: 2–11.",
          );
          return;
        }

        const result = await tripClient.create(command, !account);
        if (!mountedRef.current) return;
        setConfirmedTrip(result);
        void cache.invalidateQueries({ queryKey: ["mvp", "reservations"] });
      } else {
        // --- One-Way Single-Leg Submission ---
        let command: ReservationCommand | GuestReservationCommand;
        try {
          if (!account) {
            command = oneWayAttempt.current.prepare(
              principalScope,
              {
                serviceId: offeringId,
                contact: { email: effectiveEmail, phone: effectivePhone },
                passengers: passengers.map(p => ({
                  id: p.id,
                  name: p.firstName.trim(),
                  type: p.type,
                  seatCode: p.seatCode,
                  dob: p.dob || null,
                  nationality: p.nationality.trim() || null,
                  document: p.document.trim() || null,
                  mealId: p.mealId || null,
                })),
              },
              true,
            );
          } else {
            command = oneWayAttempt.current.prepare(
              principalScope,
              {
                serviceId: offeringId,
                contact: { email: effectiveEmail, phone: effectivePhone },
                passengers: passengers.map(p => ({
                  id: p.id,
                  type: p.type,
                  firstName: p.firstName,
                  lastName: p.lastName,
                  dob: p.dob,
                  nationality: p.nationality,
                  document: p.document,
                  seatCode: p.seatCode,
                  mealId: p.mealId,
                })),
              },
              false,
            );
          }
        } catch {
          setPending(false);
          if (oneWayAttempt.current.locked) {
            setError(
              ar
                ? "لا يمكن تغيير سياق الحساب أو البريد أثناء وجود محاولة حجز معلقة. يرجى إتمام الحجز الأصلي بنفس البيانات."
                : "Cannot switch account or guest context while an attempt is frozen. Please complete the original booking confirmation.",
            );
            return;
          }
          setLocked(false);
          setError(
            ar
              ? "تحقق من الأسماء وتواريخ الميلاد والوثائق والمقاعد. الأعمار: بالغ ١٢+، طفل ٢–١١."
              : "Check names, birth dates, documents, and seats. Adult: 12+, child: 2–11.",
          );
          return;
        }

        const result = account
          ? await reservationClient.create(command as ReservationCommand)
          : await guestReservationClient.create(command as GuestReservationCommand);

        if (!mountedRef.current) return;
        setConfirmedOneWay(result);
        void cache.invalidateQueries({ queryKey: ["mvp", "reservations"] });
      }
    } catch (failure) {
      if (!mountedRef.current) return;
      const status = failure instanceof MvpApiError ? failure.status : undefined;
      if (isRoundTrip) {
        tripAttempt.current.rejected(status);
        setLocked(tripAttempt.current.locked);
      } else {
        // Only 409 or 422 unlocks. 401, 403, 429, timeouts, and 5xx retain frozen attempt.
        if (status === 409 || status === 422) {
          oneWayAttempt.current.rejected(status);
        }
        setLocked(oneWayAttempt.current.locked);
      }

      if (status === 401 || status === 403) {
        if (!account) {
          setGuestVerifiedEmail(null);
          guestReservationClient.invalidateEmailGrant(emailRef.current);
          setGuestChallengeId(null);
          setGuestOtpCode("");
        }
      }

      if (status === 429) {
        setGuestCooldown(GUEST_RESEND_COOLDOWN_SECONDS);
      }

      setError(
        status === 409
          ? ar
            ? "تغيّر المقعد أو توفر الرحلة. تم تحديث المقاعد؛ اختر مقعداً متاحاً وحاول مجدداً."
            : "A seat or flight availability changed. Seats were refreshed; please pick an available seat and retry."
          : status === 401 || status === 403
            ? ar
              ? "انتهت جلسة التحقق. يرجى إعادة التحقق من البريد قبل إعادة المحاولة."
              : "Verification grant expired. Please re-verify your email before retrying."
            : status === 429
              ? ar
                ? "عدد محاولات كبير. انتظر دقيقة قبل المحاولة مجدداً."
                : "Too many attempts. Please wait a minute before trying again."
              : status === 422
                ? ar
                  ? "تعذر قبول بيانات المسافر أو الوجبة أو المقعد. راجع الحقول المطلوبة."
                  : "Passenger, meal, or seat details were rejected. Please review required fields."
                : (isRoundTrip ? tripAttempt.current.locked : oneWayAttempt.current.locked)
                  ? ar
                    ? "نتيجة التأكيد غير معروفة. أعد المحاولة بنفس الطلب ولا تبدأ حجزاً آخر."
                    : "Confirmation outcome is uncertain. Retry this same confirmation request; do not submit a new booking."
                  : ar
                    ? "لم يتم تأكيد الحجز. حاول مجدداً."
                    : "Booking was not confirmed. Please retry.",
      );

      if (status === 409) {
        void occupancy.refetch();
        void offering.refetch();
        if (isRoundTrip) {
          void returnOccupancy.refetch();
          void returnOffering.refetch();
        }
      }
    } finally {
      if (mountedRef.current) {
        setPending(false);
      }
    }
  };

  // --- Success Screen ---
  if (confirmedOneWay || confirmedTrip) {
    const isRound = Boolean(confirmedTrip);
    const oneWayCancelled = confirmedOneWay?.reservation.status === "cancelled";
    const outRes = confirmedTrip?.reservations[0];
    const inRes = confirmedTrip?.reservations[1];
    const outCancelled = outRes?.reservation.status === "cancelled";
    const inCancelled = inRes?.reservation.status === "cancelled";
    const isRoundAllCancelled = isRound && outCancelled && inCancelled;
    const isRoundMixed = isRound && (outCancelled !== inCancelled);
    const isAnyCancelled = isRound ? (outCancelled || inCancelled) : oneWayCancelled;

    const activeSelectedCancelled = isRound
      ? (activeTicketTab === "outbound" ? outCancelled : inCancelled)
      : oneWayCancelled;

    return (
      <div className="space-y-6">
        <div
          className={`rounded-2xl border p-6 ${
            isAnyCancelled
              ? isRoundAllCancelled || oneWayCancelled
                ? "border-destructive/30 bg-destructive/5 text-destructive"
                : "border-clay/30 bg-clay/5 text-clay"
              : "border-primary/20 bg-primary/5 text-primary"
          }`}
        >
          <h2 className="type-title-section">
            {isRound
              ? isRoundAllCancelled
                ? ar
                  ? "تم استرجاع سجل الحجز (ملغى لكلا الرحلتين)"
                  : "Booking record retrieved (Both legs cancelled)"
                : isRoundMixed
                  ? ar
                    ? "سجل حجز الذهاب والعودة (حالة مختلطة)"
                    : "Round-trip booking record (Mixed status)"
                  : ar
                    ? "تم تأكيد حجز رحلة الذهاب والعودة بنجاح"
                    : "Round-trip booking confirmed successfully"
              : oneWayCancelled
                ? ar
                  ? "تم استرجاع سجل الحجز (ملغى)"
                  : "Booking record retrieved (Cancelled)"
                : ar
                  ? "تم تأكيد حجز رحلتك بنجاح"
                  : "Booking confirmed successfully"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {isAnyCancelled
              ? ar
                ? "تم تحرير المقاعد المحجوزة للرحلات الملغاة. التذاكر الملغاة لاغية."
                : "Reserved seats for cancelled legs have been released. Cancelled tickets are void."
              : ar
                ? "تم حفظ حجزك. تفاصيل الحجز مُجدولة للإرسال إلى بريدك الإلكتروني."
                : "Your booking is saved. Confirmation details are queued for scheduled email dispatch."}
          </p>
        </div>

        {/* Tab selection for round-trip ticket viewing */}
        {isRound && confirmedTrip && (
          <div className="flex flex-wrap gap-2 border-b border-border pb-3 print:hidden">
            <button
              type="button"
              className={btnClass(activeTicketTab === "outbound" ? "primary" : "outline", "sm")}
              onClick={() => setActiveTicketTab("outbound")}
            >
              {ar ? "تذكرة الذهاب" : "Outbound ticket"} (
              {outRes!.reservation.originCode} → {outRes!.reservation.destinationCode})
              {outCancelled ? (ar ? " [ملغى]" : " [Cancelled]") : ""}
            </button>
            <button
              type="button"
              className={btnClass(activeTicketTab === "return" ? "primary" : "outline", "sm")}
              onClick={() => setActiveTicketTab("return")}
            >
              {ar ? "تذكرة العودة" : "Return ticket"} (
              {inRes!.reservation.originCode} → {inRes!.reservation.destinationCode})
              {inCancelled ? (ar ? " [ملغى]" : " [Cancelled]") : ""}
            </button>
          </div>
        )}

        {/* Canonical Ticket rendering */}
        {confirmedOneWay && <ConfirmedReservationTicket data={confirmedOneWay} />}

        {confirmedTrip && (
          <CommemorativeTicketPrintRegion>
            <div className={activeTicketTab === "outbound" ? "" : "hidden print:block"}>
              <ConfirmedReservationTicket data={confirmedTrip.reservations[0]} printRoot={false} />
            </div>
            <div className={activeTicketTab === "return" ? "" : "hidden print:block"}>
              <ConfirmedReservationTicket data={confirmedTrip.reservations[1]} printRoot={false} />
            </div>
          </CommemorativeTicketPrintRegion>
        )}

        {/* Post-booking Actions */}
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <button
            type="button"
            disabled={activeSelectedCancelled}
            className={btnClass("primary", "md")}
            onClick={() => window.print()}
          >
            {isRound
              ? ar
                ? "طباعة مسار الرحلة"
                : "Print itinerary"
              : ar
                ? "طباعة / حفظ PDF"
                : "Print / save PDF"}
          </button>

          {activeSelectedCancelled && (
            <span className="text-xs text-muted-foreground">
              {ar
                ? "لا يمكن طباعة التذكرة الملغاة كوثيقة سفر."
                : "Cancelled tickets cannot be printed as valid travel documents."}
            </span>
          )}

          <AppLink to="/manage" className={btnClass("outline", "md")}>
            {ar ? "إدارة الحجز" : "Manage booking"}
          </AppLink>

          {account && (
            <AppLink to="/account/trips" className={btnClass("ghost", "md")}>
              {ar ? "حجوزاتي في الحساب" : "My account bookings"}
            </AppLink>
          )}
        </div>
      </div>
    );
  }

  // --- Loading / Availability checks ---
  const isLoading =
    offering.isPending ||
    occupancy.isPending ||
    meals.isPending ||
    (isRoundTrip && (returnOffering.isPending || returnOccupancy.isPending));

  const isUnavailable =
    offering.isError ||
    occupancy.isError ||
    meals.isError ||
    (isRoundTrip && (returnOffering.isError || returnOccupancy.isError));

  return (
    <div className="space-y-6">
      {/* Uncertainty banner on retry lock */}
      {locked && (isLoading || isUnavailable) && (
        <div role="alert" className="space-y-3 rounded-xl border border-clay p-4">
          <p className="text-clay">
            {error ??
              (ar
                ? "تحقق من نتيجة الطلب السابق قبل بدء حجز آخر."
                : "Check the previous submission outcome before starting another booking.")}
          </p>
          <button
            disabled={pending}
            className={btnClass("primary", "md")}
            onClick={() => void confirmBooking()}
          >
            {ar ? "إعادة تأكيد نفس الطلب" : "Retry same confirmation"}
          </button>
        </div>
      )}

      {isLoading && (
        <p role="status" className="text-muted-foreground animate-pulse">
          {ar ? "جارٍ تحميل بيانات الرحلة والمقاعد…" : "Loading flight and seat data…"}
        </p>
      )}

      {isUnavailable && (
        <div role="alert" className="space-y-3 rounded-xl border border-destructive p-4">
          <p className="text-destructive">
            {ar
              ? "تعذر تحميل بيانات الرحلة أو المقاعد. لا يمكن تأكيد الحجز حالياً."
              : "Flight or seat data is currently unavailable. Confirmation is disabled."}
          </p>
          <button
            className={btnClass("outline", "sm")}
            onClick={() => {
              void offering.refetch();
              void occupancy.refetch();
              void meals.refetch();
              if (isRoundTrip) {
                void returnOffering.refetch();
                void returnOccupancy.refetch();
              }
            }}
          >
            {ar ? "إعادة المحاولة" : "Retry"}
          </button>
        </div>
      )}

      {!isLoading && !isUnavailable && offering.data && occupancy.data && meals.data && (
        <>
          {/* Flight Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Panel className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {isRoundTrip ? (ar ? "رحلة الذهاب" : "Outbound flight") : (ar ? "الرحلة" : "Flight")}
              </span>
              <div>
                <Code className="text-sm font-bold">
                  {offering.data.number} · {offering.data.originCode} → {offering.data.destinationCode}
                </Code>
                <p className="mt-1 text-sm text-muted-foreground">
                  {offering.data.date} · {offering.data.departTime} → {offering.data.arriveTime} (
                  {offering.data.aircraft})
                </p>
              </div>
            </Panel>

            {isRoundTrip && returnOffering.data && (
              <Panel className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {ar ? "رحلة العودة" : "Return flight"}
                </span>
                <div>
                  <Code className="text-sm font-bold">
                    {returnOffering.data.number} · {returnOffering.data.originCode} →{" "}
                    {returnOffering.data.destinationCode}
                  </Code>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {returnOffering.data.date} · {returnOffering.data.departTime} →{" "}
                    {returnOffering.data.arriveTime} ({returnOffering.data.aircraft})
                  </p>
                </div>
              </Panel>
            )}
          </div>

          <form
            className="space-y-6"
            onSubmit={event => {
              event.preventDefault();
              void confirmBooking();
            }}
          >
            <fieldset disabled={locked || pending} className="space-y-6">
              {/* Passengers Section */}
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">{ar ? "المسافرون" : "Passengers"}</h2>

                {passengers.map((person, index) => (
                  <Panel key={person.id} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">
                        {ar ? "المسافر" : "Passenger"} {index + 1}
                      </h3>
                      {passengers.length > 1 && (
                        <button
                          type="button"
                          className={btnClass("ghost", "sm", "text-destructive")}
                          onClick={() => {
                            setPassengers(curr => curr.filter((_, i) => i !== index));
                            setActivePassenger(0);
                          }}
                        >
                          {ar ? "إزالة المسافر" : "Remove passenger"}
                        </button>
                      )}
                    </div>

                    {/* Saved travelers dropdown for authenticated users */}
                    {account && !!travelers.data?.length && (
                      <Field label={ar ? "استخدام مسافر محفوظ" : "Use saved traveler"}>
                        <Select
                          value=""
                          onChange={e => {
                            const tr = travelers.data?.find(item => item.id === e.target.value);
                            if (tr) {
                              updatePassenger(index, {
                                firstName: tr.firstName,
                                lastName: tr.lastName,
                                dob: tr.dob,
                                nationality: tr.nationality,
                                document: tr.document,
                              });
                            }
                          }}
                        >
                          <option value="">{ar ? "اختر مسافراً" : "Choose traveler"}</option>
                          {travelers.data.map(item => (
                            <option key={item.id} value={item.id}>
                              {item.firstName} {item.lastName}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      {account ? (
                        <>
                          <Field
                            label={ar ? "الاسم الأول" : "First name"}
                            htmlFor={`${fieldId}-${index}-fn`}
                          >
                            <Input
                              id={`${fieldId}-${index}-fn`}
                              required
                              autoComplete="given-name"
                              value={person.firstName}
                              maxLength={120}
                              onChange={e => updatePassenger(index, { firstName: e.target.value })}
                            />
                          </Field>

                          <Field
                            label={ar ? "اسم العائلة" : "Last name"}
                            htmlFor={`${fieldId}-${index}-ln`}
                          >
                            <Input
                              id={`${fieldId}-${index}-ln`}
                              required
                              autoComplete="family-name"
                              value={person.lastName}
                              maxLength={120}
                              onChange={e => updatePassenger(index, { lastName: e.target.value })}
                            />
                          </Field>

                          <Field
                            label={ar ? "تاريخ الميلاد" : "Date of birth"}
                            htmlFor={`${fieldId}-${index}-dob`}
                          >
                            <Input
                              id={`${fieldId}-${index}-dob`}
                              type="date"
                              required
                              value={person.dob}
                              max={offering.data.date}
                              dir="ltr"
                              onChange={e => updatePassenger(index, { dob: e.target.value })}
                            />
                          </Field>

                          <Field
                            label={ar ? "الفئة العمرية" : "Age category"}
                            htmlFor={`${fieldId}-${index}-type`}
                          >
                            <Select
                              id={`${fieldId}-${index}-type`}
                              value={person.type}
                              onChange={e =>
                                updatePassenger(index, { type: e.target.value as "adult" | "child" })
                              }
                            >
                              <option value="adult">{ar ? "بالغ (١٢+)" : "Adult (12+)"}</option>
                              <option value="child">{ar ? "طفل (٢–١١)" : "Child (2–11)"}</option>
                            </Select>
                          </Field>

                          <Field
                            label={ar ? "الجنسية" : "Nationality"}
                            htmlFor={`${fieldId}-${index}-nat`}
                          >
                            <Input
                              id={`${fieldId}-${index}-nat`}
                              required
                              value={person.nationality}
                              maxLength={120}
                              onChange={e => updatePassenger(index, { nationality: e.target.value })}
                            />
                          </Field>

                          <Field
                            label={ar ? "وثيقة السفر (جواز أو هوية)" : "Travel document (Passport / ID)"}
                            htmlFor={`${fieldId}-${index}-doc`}
                          >
                            <Input
                              id={`${fieldId}-${index}-doc`}
                              required
                              value={person.document}
                              maxLength={120}
                              onChange={e => updatePassenger(index, { document: e.target.value })}
                            />
                          </Field>
                        </>
                      ) : (
                        <>
                          <Field
                            label={ar ? "اسم المسافر" : "Passenger name"}
                            htmlFor={`${fieldId}-${index}-name`}
                            className="sm:col-span-2"
                          >
                            <Input
                              id={`${fieldId}-${index}-name`}
                              required
                              autoComplete="name"
                              placeholder={
                                ar
                                  ? "الاسم الكامل (مثال: محمد عبد الله أو Jane Doe)"
                                  : "Full name (e.g. Jane Doe or Ahmed Sharif)"
                              }
                              value={person.firstName}
                              maxLength={120}
                              onChange={e => updatePassenger(index, { firstName: e.target.value })}
                            />
                          </Field>

                          <details className="sm:col-span-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
                              {ar
                                ? "+ تفاصيل إضافية اختيارية (تاريخ الميلاد، الوثيقة، الجنسية)"
                                : "+ Optional additional details (Date of birth, document, nationality)"}
                            </summary>
                            <div className="mt-3 grid gap-4 sm:grid-cols-2">
                              <Field
                                label={ar ? "تاريخ الميلاد (اختياري)" : "Date of birth (Optional)"}
                                htmlFor={`${fieldId}-${index}-dob`}
                              >
                                <Input
                                  id={`${fieldId}-${index}-dob`}
                                  type="date"
                                  value={person.dob}
                                  max={offering.data.date}
                                  dir="ltr"
                                  onChange={e => updatePassenger(index, { dob: e.target.value })}
                                />
                              </Field>

                              <Field
                                label={ar ? "الفئة العمرية" : "Age category"}
                                htmlFor={`${fieldId}-${index}-type`}
                              >
                                <Select
                                  id={`${fieldId}-${index}-type`}
                                  value={person.type}
                                  onChange={e =>
                                    updatePassenger(index, {
                                      type: e.target.value as "adult" | "child",
                                    })
                                  }
                                >
                                  <option value="adult">{ar ? "بالغ (١٢+)" : "Adult (12+)"}</option>
                                  <option value="child">{ar ? "طفل (٢–١١)" : "Child (2–11)"}</option>
                                </Select>
                              </Field>

                              <Field
                                label={ar ? "الجنسية (اختياري)" : "Nationality (Optional)"}
                                htmlFor={`${fieldId}-${index}-nat`}
                              >
                                <Input
                                  id={`${fieldId}-${index}-nat`}
                                  value={person.nationality}
                                  maxLength={120}
                                  onChange={e =>
                                    updatePassenger(index, { nationality: e.target.value })
                                  }
                                />
                              </Field>

                              <Field
                                label={ar ? "وثيقة السفر (اختياري)" : "Travel document (Optional)"}
                                htmlFor={`${fieldId}-${index}-doc`}
                              >
                                <Input
                                  id={`${fieldId}-${index}-doc`}
                                  value={person.document}
                                  maxLength={120}
                                  onChange={e =>
                                    updatePassenger(index, { document: e.target.value })
                                  }
                                />
                              </Field>
                            </div>
                          </details>
                        </>
                      )}

                      {/* Meal choices */}
                      <Field
                        label={
                          isRoundTrip
                            ? ar
                              ? "وجبة رحلة الذهاب"
                              : "Outbound meal"
                            : ar
                              ? "الوجبة"
                              : "Meal"
                        }
                        htmlFor={`${fieldId}-${index}-meal`}
                      >
                        <Select
                          id={`${fieldId}-${index}-meal`}
                          value={person.mealId ?? ""}
                          onChange={e =>
                            updatePassenger(index, { mealId: e.target.value || null })
                          }
                        >
                          <option value="">{ar ? "بدون وجبة" : "No meal"}</option>
                          {meals.data.meals.map(item => (
                            <option key={item.id} value={item.id}>
                              {pick(lang, item.label)}
                            </option>
                          ))}
                        </Select>
                      </Field>

                      {isRoundTrip && (
                        <Field
                          label={ar ? "وجبة رحلة العودة" : "Return meal"}
                          htmlFor={`${fieldId}-${index}-ret-meal`}
                        >
                          <Select
                            id={`${fieldId}-${index}-ret-meal`}
                            value={person.returnMealId ?? ""}
                            onChange={e =>
                              updatePassenger(index, { returnMealId: e.target.value || null })
                            }
                          >
                            <option value="">{ar ? "بدون وجبة" : "No meal"}</option>
                            {meals.data.meals.map(item => (
                              <option key={item.id} value={item.id}>
                                {pick(lang, item.label)}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      )}
                    </div>
                  </Panel>
                ))}

                <button
                  type="button"
                  disabled={passengers.length >= 9}
                  className={btnClass("outline", "sm")}
                  onClick={() =>
                    setPassengers(curr => [...curr, emptyPassenger(nextId.current++)])
                  }
                >
                  {ar ? "إضافة مسافر" : "Add passenger"}
                </button>
              </div>

              {/* Seat Selection Workspace */}
              <Panel className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold">{ar ? "اختيار المقاعد" : "Choose seats"}</h2>

                  {isRoundTrip && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={btnClass(activeLegTab === "outbound" ? "primary" : "outline", "sm")}
                        onClick={() => setActiveLegTab("outbound")}
                      >
                        {ar ? "١. مقاعد الذهاب" : "1. Outbound seats"} (
                        {offering.data.originCode} → {offering.data.destinationCode})
                      </button>
                      <button
                        type="button"
                        className={btnClass(activeLegTab === "return" ? "primary" : "outline", "sm")}
                        onClick={() => setActiveLegTab("return")}
                      >
                        {ar ? "٢. مقاعد العودة" : "2. Return seats"} (
                        {returnOffering.data?.originCode} → {returnOffering.data?.destinationCode})
                      </button>
                    </div>
                  )}
                </div>

                {/* Render active leg SeatMap */}
                {activeLegTab === "outbound" && (
                  <div>
                    <p className="mb-3 text-sm text-muted-foreground">
                      {ar
                        ? `رحلة الذهاب: ${offering.data.number} (${offering.data.aircraft})`
                        : `Outbound flight: ${offering.data.number} (${offering.data.aircraft})`}
                    </p>
                    <SeatMap
                      layout={occupancy.data.layout}
                      occupiedSeats={new Set(occupancy.data.occupiedSeats)}
                      extraLegroomPrice={0}
                      assignments={Object.fromEntries(
                        passengers
                          .map((p, i) => [i, p.seatCode])
                          .filter(([, val]) => Boolean(val)),
                      )}
                      activePassenger={activePassenger}
                      onActivePassengerChange={setActivePassenger}
                      passengerLabels={passengers.map(
                        (p, i) =>
                          `${p.firstName} ${p.lastName}`.trim() ||
                          `${ar ? "المسافر" : "Passenger"} ${i + 1}`,
                      )}
                      onSelect={(idx, seatCode) => updatePassenger(idx, { seatCode })}
                    />
                  </div>
                )}

                {activeLegTab === "return" && isRoundTrip && returnOccupancy.data && (
                  <div>
                    <p className="mb-3 text-sm text-muted-foreground">
                      {ar
                        ? `رحلة العودة: ${returnOffering.data?.number} (${returnOffering.data?.aircraft})`
                        : `Return flight: ${returnOffering.data?.number} (${returnOffering.data?.aircraft})`}
                    </p>
                    <SeatMap
                      layout={returnOccupancy.data.layout}
                      occupiedSeats={new Set(returnOccupancy.data.occupiedSeats)}
                      extraLegroomPrice={0}
                      assignments={Object.fromEntries(
                        passengers
                          .map((p, i) => [i, p.returnSeatCode])
                          .filter(([, val]) => Boolean(val)),
                      )}
                      activePassenger={activePassenger}
                      onActivePassengerChange={setActivePassenger}
                      passengerLabels={passengers.map(
                        (p, i) =>
                          `${p.firstName} ${p.lastName}`.trim() ||
                          `${ar ? "المسافر" : "Passenger"} ${i + 1}`,
                      )}
                      onSelect={(idx, returnSeatCode) =>
                        updatePassenger(idx, { returnSeatCode })
                      }
                    />
                  </div>
                )}
              </Panel>

              {/* Contact Section */}
              <Panel className="space-y-4">
                <h2 className="text-xl font-semibold">{ar ? "بيانات التواصل" : "Contact details"}</h2>

                {account ? (
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {ar ? "البريد الإلكتروني الموثق للحساب" : "Verified account email"}
                    </p>
                    <p className="font-mono text-base font-semibold" dir="ltr">
                      {account.email}
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label={ar ? "البريد الإلكتروني للتذاكر" : "Contact email for tickets"}
                      htmlFor={`${fieldId}-guest-email`}
                    >
                      <Input
                        id={`${fieldId}-guest-email`}
                        type="email"
                        required
                        maxLength={254}
                        value={email}
                        onChange={e => handleEmailChange(e.target.value)}
                        placeholder="name@example.com"
                        dir="ltr"
                        autoComplete="email"
                      />
                    </Field>

                    <Field
                      label={ar ? "الهاتف (اختياري)" : "Phone (optional)"}
                      htmlFor={`${fieldId}-phone`}
                    >
                      <Input
                        id={`${fieldId}-phone`}
                        type="tel"
                        dir="ltr"
                        maxLength={32}
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="+970 599 000000"
                        autoComplete="tel"
                      />
                    </Field>
                  </div>
                )}
              </Panel>
            </fieldset>

            {/* Guest Verification Section (Outside locked passenger fieldset so OTP reverify works while locked) */}
            {!account && (
              <Panel className="space-y-4">
                {guestVerifiedEmail && guestVerifiedEmail.toLowerCase() === email.trim().toLowerCase() ? (
                  <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
                    <span className="font-bold">✓</span>
                    <span>
                      {ar
                        ? `تم التحقق من البريد (${guestVerifiedEmail}). الحجز جاهز للتأكيد.`
                        : `Email verified (${guestVerifiedEmail}). Booking is ready for confirmation.`}
                    </span>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-lg border border-sand-deep/40 bg-sand/30 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">
                          {ar ? "التحقق من البريد الإلكتروني" : "Verify contact email"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ar
                            ? "لضمان استلام تذكرتك وإمكانية إدارتها لاحقاً، سنرسل رمز تحقق مكوّن من ٦ أرقام."
                            : "To ensure you receive your ticket and can manage it later, we verify your email with a 6-digit code."}
                        </p>
                      </div>

                      {!guestChallengeId && (
                        <button
                          type="button"
                          disabled={pending || guestSendingCode || guestCooldown > 0}
                          className={btnClass("outline", "sm")}
                          onClick={() => void handleSendGuestCode()}
                        >
                          {guestSendingCode
                            ? ar
                              ? "جارٍ الإرسال…"
                              : "Sending…"
                            : guestCooldown > 0
                              ? ar
                                ? `انتظر (${guestCooldown} ث)`
                                : `Wait (${guestCooldown}s)`
                              : ar
                                ? "إرسال رمز التحقق"
                                : "Send verification code"}
                        </button>
                      )}
                    </div>

                    {/* OTP Input block when challenge is active */}
                    {guestChallengeId && (
                      <div className="space-y-3 pt-2">
                        <label
                          htmlFor={`${fieldId}-guest-otp`}
                          className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                        >
                          {ar ? "أدخل رمز التحقق (٦ أرقام)" : "Enter 6-digit verification code"}
                        </label>

                        <div className="flex flex-wrap items-center gap-3">
                          <div dir="ltr">
                            <InputOTP
                              id={`${fieldId}-guest-otp`}
                              maxLength={6}
                              value={guestOtpCode}
                              onChange={setGuestOtpCode}
                              autoComplete="one-time-code"
                              disabled={pending || guestVerifyingCode}
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

                          <button
                            type="button"
                            disabled={pending || guestOtpCode.length !== 6 || guestVerifyingCode}
                            className={btnClass("primary", "sm")}
                            onClick={() => void handleVerifyGuestCode()}
                          >
                            {guestVerifyingCode
                              ? ar
                                ? "جارٍ التحقق…"
                                : "Verifying…"
                              : ar
                                ? "تأكيد الرمز"
                                : "Verify code"}
                          </button>

                          <button
                            type="button"
                            disabled={
                              pending ||
                              guestCooldown > 0 ||
                              guestResendCount >= MAX_GUEST_RESEND_ATTEMPTS ||
                              guestSendingCode
                            }
                            className={btnClass("ghost", "sm")}
                            onClick={() => void handleSendGuestCode()}
                          >
                            {guestCooldown > 0
                              ? ar
                                ? `إعادة الإرسال بعد (${guestCooldown} ث)`
                                : `Resend in (${guestCooldown}s)`
                              : ar
                                ? "إعادة إرسال الرمز"
                                : "Resend code"}
                          </button>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          {ar
                            ? "تُرسل رسائل التحقق عبر البريد الإلكتروني المُجدول. تفقد البريد الوارد وغير الهام."
                            : "Verification emails are queued for scheduled email dispatch. Please check your inbox and junk folder."}
                        </p>
                      </div>
                    )}

                    {guestError && (
                      <p role="alert" className="text-sm text-clay">
                        {guestError}
                      </p>
                    )}
                  </div>
                )}
              </Panel>
            )}

            {error && (
              <p role="alert" tabIndex={-1} className="rounded-lg border border-clay p-4 text-clay">
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4">
              <button
                type="submit"
                className={btnClass("primary", "lg")}
                disabled={pending || guestCooldown > 0}
              >
                {pending
                  ? ar
                    ? "جارٍ التأكيد…"
                    : "Confirming…"
                  : guestCooldown > 0
                    ? ar
                      ? `يرجى الانتظار (${guestCooldown} ث)`
                      : `Please wait (${guestCooldown}s)`
                    : locked
                      ? ar
                        ? "إعادة تأكيد نفس الطلب"
                        : "Retry same confirmation"
                      : isRoundTrip
                        ? ar
                          ? "تأكيد حجز الذهاب والعودة مجاناً"
                          : "Confirm free round-trip booking"
                        : ar
                          ? "تأكيد الحجز المجاني"
                          : "Confirm free booking"}
              </button>

              <AppLink to="/manage" className={btnClass("outline", "md")}>
                {ar ? "إدارة حجز سابق" : "Manage existing booking"}
              </AppLink>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
