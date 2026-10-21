import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLink } from "@/components/app-link";
import { Container, Field, Input, Panel, Select, Code, btnClass } from "@/components/kit";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SeatMap } from "./seat-map";
import { ConfirmedReservationTicket } from "./mvp-reservation-views";
import { CommemorativeTicketPrintRegion } from "./commemorative-ticket";
import { useI18n, pick } from "@/lib/i18n";
import { usePassengerAccount, usePassengerTravelers } from "@/lib/passenger";
import { useMealsQuery } from "@/lib/meals/queries";
import { getMvpUiClient } from "@/lib/api/mvp-ui-runtime";
import { MvpApiError } from "@/lib/api/mvp-client";
import { offeringWireSchema } from "@/lib/offerings/schema";
import { decodeDatedOfferingId, isValidISODate } from "@/lib/offerings/codec";
import { ReservationAttempt } from "@/lib/reservations/attempt";
import { reservationClient } from "@/lib/reservations/queries";
import { guestReservationClient } from "@/lib/reservations/guest-client";
import {
  TripReservationAttempt,
  tripClient,
  validateTripChronology,
  type TripCommand,
  type GuestTripCommand,
  type TripResponse,
} from "@/lib/reservations/trip-client";
import type { GuestReservationCommand, ReservationCommand, ReservationDetail } from "@/lib/reservations/client";
import { reservationCommandSchema } from "@/lib/reservations/client";
import {
  orchestrateGuestBooking,
} from "@/lib/reservations/guest-orchestrator";
import type { PassengerAccount } from "@/lib/passenger/domain";
import { MvpOfferingBoard } from "@/components/mvp-offering-board";
import { Check, PlaneLanding, PlaneTakeoff } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [guestCooldown, setGuestCooldown] = useState(0);
  const [guestResendCount, setGuestResendCount] = useState(0);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [isOtpDialogOpen, setIsOtpDialogOpen] = useState(false);
  const guestTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendGen = useRef(0);
  const challengeEmailRef = useRef<string | null>(
    initialRecovery?.email ? initialRecovery.email.trim().toLowerCase() : (
      typeof window !== "undefined"
        ? (parseGuestBookingRecoveryHash(window.location.hash)?.email?.trim().toLowerCase() ?? null)
        : null
    ),
  );

  // Field errors for inline validation & focus management
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [mobileStep, setMobileStep] = useState<"traveler" | "seats" | "confirm">("traveler");

  // Synchronous guard against duplicate initial request clicks before await
  const guestSendingRef = useRef(false);

  // DOM Refs for tabs, details & focus management
  const pendingFocusRef = useRef<string | null>(null);
  const dialogInvalidFocusRef = useRef(false);
  const guestDetailsRef = useRef<HTMLDetailsElement | null>(null);
  const seatSectionRef = useRef<HTMLDivElement | null>(null);
  const outboundTabRef = useRef<HTMLButtonElement | null>(null);
  const returnTabRef = useRef<HTMLButtonElement | null>(null);

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
      if (rec.challengeId) {
        setGuestChallengeId(rec.challengeId);
        setIsOtpDialogOpen(true);
      }
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
  const [draftFrozen, setDraftFrozen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Synchronous guard and network tracking refs
  const executingRef = useRef(false);
  const postDispatchedRef = useRef(false);
  const postAmbiguousRef = useRef(false);
  const crossSessionRecoveryRequiredRef = useRef(false);

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
    if (!locked && !pending && !draftFrozen) {
      setPassengers(current => current.map((p, i) => (i === index ? { ...p, ...patch } : p)));
    }
  };

  // Seat selection handler
  const handleSelectSeat = (idx: number, seatCode: string) => {
    if (activeLegTab === "outbound") {
      updatePassenger(idx, { seatCode });
      if (fieldErrors["outboundSeat"]) {
        setFieldErrors(prev => ({ ...prev, outboundSeat: undefined }));
      }
    } else {
      updatePassenger(idx, { returnSeatCode: seatCode });
      if (fieldErrors["returnSeat"]) {
        setFieldErrors(prev => ({ ...prev, returnSeat: undefined }));
      }
    }
  };

  // Guest email modification handler
  const handleEmailChange = (newEmail: string) => {
    if (locked || pending || draftFrozen) return;
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
      setGuestError(null);
      postDispatchedRef.current = false;
      postAmbiguousRef.current = false;
      crossSessionRecoveryRequiredRef.current = false;
      setDraftFrozen(false);
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
  const handleSendGuestCode = async (): Promise<boolean> => {
    const normEmail = emailRef.current.trim().toLowerCase();
    if (!normEmail || !normEmail.includes("@")) {
      const err = ar ? "أدخل بريداً إلكترونياً صالحاً أولاً." : "Please enter a valid email address first.";
      setGuestError(err);
      setFieldErrors(prev => ({ ...prev, email: err }));
      document.getElementById(`${fieldId}-guest-email`)?.focus();
      return false;
    }
    if (guestCooldown > 0 || guestResendCount >= MAX_GUEST_RESEND_ATTEMPTS || guestSendingCode || guestSendingRef.current) {
      return false;
    }

    // Synchronous guard before await against duplicate rapid clicks
    guestSendingRef.current = true;
    setGuestSendingCode(true);
    setGuestError(null);
    const currentGen = ++sendGen.current;
    try {
      const resp = await guestReservationClient.requestEmailChallenge(normEmail);
      if (!mountedRef.current || currentGen !== sendGen.current || emailRef.current.trim().toLowerCase() !== normEmail) {
        return false;
      }
      challengeEmailRef.current = normEmail;
      setGuestChallengeId(resp.challengeId);
      setGuestCooldown(GUEST_RESEND_COOLDOWN_SECONDS);
      setGuestResendCount(c => c + 1);
      return true;
    } catch (err) {
      if (!mountedRef.current || currentGen !== sendGen.current || emailRef.current.trim().toLowerCase() !== normEmail) return false;
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
      return false;
    } finally {
      guestSendingRef.current = false;
      if (mountedRef.current && currentGen === sendGen.current) {
        setGuestSendingCode(false);
      }
    }
  };

  // Specific inline field validation focusing first invalid
  const validateForm = (): boolean => {
    const errors: Record<string, string | undefined> = {};
    const effectiveEmail = (account ? account.email : email).trim().toLowerCase();

    // 1. Email check (for guest)
    if (!account) {
      if (!effectiveEmail) {
        errors["email"] = ar ? "البريد الإلكتروني للتذاكر مطلوب." : "Email address is required for tickets.";
      } else if (!effectiveEmail.includes("@") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(effectiveEmail)) {
        errors["email"] = ar ? "أدخل بريداً إلكترونياً صالحاً للتواصل." : "Please enter a valid email address.";
      }
    }

    // 2. Passengers check
    const flightDate = decodeDatedOfferingId(offeringId)?.date ?? offering.data?.date;
    const returnFlightDate = isRoundTrip && returnOfferingId
      ? (decodeDatedOfferingId(returnOfferingId)?.date ?? returnOffering.data?.date)
      : undefined;

    passengers.forEach((p, i) => {
      if (!account) {
        if (!p.firstName.trim()) {
          errors[`pax-${i}-name`] = ar ? "اسم المسافر مطلوب." : "Passenger name is required.";
        }
        // Optional guest details validation against existing schemas
        if (p.dob && p.dob.trim()) {
          const trimmedDob = p.dob.trim();
          if (!isValidISODate(trimmedDob)) {
            errors[`pax-${i}-dob`] = ar ? "تاريخ الميلاد غير صالح." : "Please enter a valid date of birth.";
          } else if (flightDate) {
            const age = Number(flightDate.slice(0, 4)) - Number(trimmedDob.slice(0, 4)) - (flightDate.slice(5) < trimmedDob.slice(5) ? 1 : 0);
            const pType = p.type ?? "adult";
            if (age < 0 || age > 120 || (pType === "adult" ? age < 12 : age < 2 || age > 11)) {
              errors[`pax-${i}-dob`] = ar
                ? "العمر لا يتطابق مع الفئة العمرية."
                : "Invalid passenger age for category.";
            } else if (returnFlightDate) {
              const retAge = Number(returnFlightDate.slice(0, 4)) - Number(trimmedDob.slice(0, 4)) - (returnFlightDate.slice(5) < trimmedDob.slice(5) ? 1 : 0);
              if (retAge < 0 || retAge > 120 || (pType === "adult" ? retAge < 12 : retAge < 2 || retAge > 11)) {
                errors[`pax-${i}-dob`] = ar
                  ? "العمر لا يتطابق مع الفئة العمرية في رحلة العودة."
                  : "Passenger age does not match category on flight date.";
              }
            }
          }
        }
        if (p.nationality !== undefined && p.nationality !== "") {
          if (!p.nationality.trim()) {
            errors[`pax-${i}-nat`] = ar ? "الجنسية المدخلة غير صالحة." : "Invalid nationality provided.";
          } else if (p.nationality.trim().length > 120) {
            errors[`pax-${i}-nat`] = ar ? "الجنسية يجب ألا تتجاوز ١٢٠ حرفاً." : "Nationality must not exceed 120 characters.";
          }
        }
        if (p.document !== undefined && p.document !== "") {
          if (!p.document.trim()) {
            errors[`pax-${i}-doc`] = ar ? "وثيقة السفر المدخلة غير صالحة." : "Invalid travel document provided.";
          } else if (p.document.trim().length > 120) {
            errors[`pax-${i}-doc`] = ar ? "وثيقة السفر يجب ألا تتجاوز ١٢٠ حرفاً." : "Travel document must not exceed 120 characters.";
          }
        }
      } else {
        if (!p.firstName.trim()) {
          errors[`pax-${i}-fn`] = ar ? "الاسم الأول مطلوب." : "First name is required.";
        }
        if (!p.lastName.trim()) {
          errors[`pax-${i}-ln`] = ar ? "اسم العائلة مطلوب." : "Last name is required.";
        }
        if (!p.dob.trim()) {
          errors[`pax-${i}-dob`] = ar ? "تاريخ الميلاد مطلوب." : "Date of birth is required.";
        } else if (!isValidISODate(p.dob.trim())) {
          errors[`pax-${i}-dob`] = ar ? "تاريخ الميلاد غير صالح." : "Please enter a valid date of birth.";
        } else if (flightDate) {
          const age = Number(flightDate.slice(0, 4)) - Number(p.dob.slice(0, 4)) - (flightDate.slice(5) < p.dob.slice(5) ? 1 : 0);
          const pType = p.type ?? "adult";
          if (age < 0 || age > 120 || (pType === "adult" ? age < 12 : age < 2 || age > 11)) {
            errors[`pax-${i}-dob`] = ar ? "العمر لا يتطابق مع الفئة العمرية." : "Invalid passenger age for category.";
          } else if (returnFlightDate) {
            const retAge = Number(returnFlightDate.slice(0, 4)) - Number(p.dob.slice(0, 4)) - (returnFlightDate.slice(5) < p.dob.slice(5) ? 1 : 0);
            if (retAge < 0 || retAge > 120 || (pType === "adult" ? retAge < 12 : retAge < 2 || retAge > 11)) {
              errors[`pax-${i}-dob`] = ar ? "العمر لا يتطابق مع الفئة العمرية في رحلة العودة." : "Passenger age does not match category on flight date.";
            }
          }
        }
        if (!p.nationality.trim()) {
          errors[`pax-${i}-nat`] = ar ? "الجنسية مطلوبة." : "Nationality is required.";
        } else if (p.nationality.trim().length > 120) {
          errors[`pax-${i}-nat`] = ar ? "الجنسية يجب ألا تتجاوز ١٢٠ حرفاً." : "Nationality must not exceed 120 characters.";
        }
        if (!p.document.trim()) {
          errors[`pax-${i}-doc`] = ar ? "وثيقة السفر مطلوبة." : "Travel document is required.";
        } else if (p.document.trim().length > 120) {
          errors[`pax-${i}-doc`] = ar ? "وثيقة السفر يجب ألا تتجاوز ١٢٠ حرفاً." : "Travel document must not exceed 120 characters.";
        }
      }
    });

    if (!passengers.some(p => (p.type ?? "adult") === "adult")) {
      errors["pax-0-type"] = ar ? "يجب وجود مسافر بالغ واحد على الأقل." : "At least one adult passenger is required.";
    }

    // 3. Outbound seat check
    const missingOutbound = passengers.some(p => !p.seatCode);
    if (missingOutbound) {
      errors["outboundSeat"] = ar
        ? "يرجى اختيار مقعد لرحلة الذهاب لكل مسافر."
        : "Please select an outbound seat for each passenger.";
    }

    // 4. Return seat check (if round-trip)
    if (isRoundTrip) {
      const missingReturn = passengers.some(p => !p.returnSeatCode);
      if (missingReturn) {
        errors["returnSeat"] = ar
          ? "يرجى اختيار مقعد لرحلة العودة لكل مسافر."
          : "Please select a return seat for each passenger.";
      }
    }

    setFieldErrors(errors);

    const hasErrors = Object.values(errors).some(Boolean);
    if (hasErrors) {
      let targetId: string | null = null;
      let targetStep: "traveler" | "seats" | "confirm" | null = null;

      if (errors["email"]) {
        targetStep = "traveler";
        targetId = `${fieldId}-guest-email`;
      } else {
        const firstPaxIdx = passengers.findIndex(
          (_, i) =>
            errors[`pax-${i}-name`] ||
            errors[`pax-${i}-fn`] ||
            errors[`pax-${i}-ln`] ||
            errors[`pax-${i}-dob`] ||
            errors[`pax-${i}-type`] ||
            errors[`pax-${i}-nat`] ||
            errors[`pax-${i}-doc`],
        );
        if (firstPaxIdx !== -1) {
          targetStep = "traveler";
          if (!account) {
            if (errors[`pax-${firstPaxIdx}-name`]) {
              targetId = `${fieldId}-${firstPaxIdx}-name`;
            } else {
              if (guestDetailsRef.current) {
                guestDetailsRef.current.open = true;
              }
              if (errors[`pax-${firstPaxIdx}-dob`]) {
                targetId = `${fieldId}-${firstPaxIdx}-dob`;
              } else if (errors[`pax-${firstPaxIdx}-type`]) {
                targetId = `${fieldId}-${firstPaxIdx}-type`;
              } else if (errors[`pax-${firstPaxIdx}-nat`]) {
                targetId = `${fieldId}-${firstPaxIdx}-nat`;
              } else if (errors[`pax-${firstPaxIdx}-doc`]) {
                targetId = `${fieldId}-${firstPaxIdx}-doc`;
              }
            }
          } else {
            // Signed-in: select first field with actual error
            if (errors[`pax-${firstPaxIdx}-fn`]) {
              targetId = `${fieldId}-${firstPaxIdx}-fn`;
            } else if (errors[`pax-${firstPaxIdx}-ln`]) {
              targetId = `${fieldId}-${firstPaxIdx}-ln`;
            } else if (errors[`pax-${firstPaxIdx}-dob`]) {
              targetId = `${fieldId}-${firstPaxIdx}-dob`;
            } else if (errors[`pax-${firstPaxIdx}-type`]) {
              targetId = `${fieldId}-${firstPaxIdx}-type`;
            } else if (errors[`pax-${firstPaxIdx}-nat`]) {
              targetId = `${fieldId}-${firstPaxIdx}-nat`;
            } else if (errors[`pax-${firstPaxIdx}-doc`]) {
              targetId = `${fieldId}-${firstPaxIdx}-doc`;
            }
          }
        } else if (errors["outboundSeat"]) {
          targetStep = "seats";
          targetId = `${fieldId}-tab-outbound`;
          setActiveLegTab("outbound");
        } else if (errors["returnSeat"]) {
          targetStep = "seats";
          targetId = `${fieldId}-tab-return`;
          setActiveLegTab("return");
        }
      }

      if (targetId) {
        pendingFocusRef.current = targetId;
        if (targetStep && mobileStep !== targetStep) {
          setMobileStep(targetStep);
        } else if (!isOtpDialogOpen) {
          const el = document.getElementById(targetId);
          if (el) {
            const details = el.closest("details");
          if (details) details.open = true;
          el.focus();
            if (targetId.includes("tab")) {
              seatSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
            if (document.activeElement === el) {
              pendingFocusRef.current = null;
            }
          }
        }
      }
      return false;
    }

    return true;
  };

  // Commit focus after mobileStep or dialog transitions commit to DOM
  useLayoutEffect(() => {
    if (pendingFocusRef.current && !isOtpDialogOpen && !dialogInvalidFocusRef.current) {
      const targetId = pendingFocusRef.current;
      const el = document.getElementById(targetId);
      if (el) {
        el.focus();
        if (targetId.includes("tab")) {
          seatSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
        pendingFocusRef.current = null;
      }
    }
  }, [mobileStep, isOtpDialogOpen]);

  // Confirm booking submission
  const confirmBooking = async (fromOtpDialog = false) => {
    if (executingRef.current || pending) return;

    if (fromOtpDialog) {
      const isValid = validateForm();
      if (!isValid) {
        dialogInvalidFocusRef.current = true;
        setIsOtpDialogOpen(false);
        return;
      }

      if (guestOtpCode.length !== 6) {
        setGuestError(
          ar ? "أدخل رمز التحقق المكوّن من ٦ أرقام للمتابعة." : "Please enter the 6-digit verification code.",
        );
        return;
      }
    } else {
      const isValid = validateForm();
      if (!isValid) return;

      if (!account) {
        const effectiveEmail = email.trim().toLowerCase();
        const isAlreadyVerified = Boolean(
          guestVerifiedEmail &&
            guestVerifiedEmail.toLowerCase() === effectiveEmail &&
            guestReservationClient.isEmailVerified(effectiveEmail),
        );

        if (!isAlreadyVerified) {
          if (guestChallengeId) {
            setIsOtpDialogOpen(true);
            return;
          }
          if (guestSendingRef.current) return;
          const sent = await handleSendGuestCode();
          if (sent) {
            setIsOtpDialogOpen(true);
          }
          return;
        }
      }
    }

    executingRef.current = true;
    setError(null);

    const effectiveEmail = (account ? account.email : email).trim().toLowerCase();
    const effectivePhone = phone.trim();
    const principalScope = account
      ? `account:${account.email.trim().toLowerCase()}`
      : `guest:${effectiveEmail}`;

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
        executingRef.current = false;
        if (fromOtpDialog) setIsOtpDialogOpen(false);
        return;
      }
    }

    setPending(true);

    try {
      if (!account) {
        // --- Guest Orchestration Path ---
        if (!effectiveEmail || !effectiveEmail.includes("@")) {
          setError(ar ? "يرجى إدخال البريد الإلكتروني للتواصل." : "Please enter a valid contact email.");
          if (fromOtpDialog) setIsOtpDialogOpen(false);
          return;
        }

        if (postAmbiguousRef.current && !guestReservationClient.isEmailVerified(effectiveEmail)) {
          crossSessionRecoveryRequiredRef.current = true;
        }
        if (crossSessionRecoveryRequiredRef.current) {
          setError(
            ar
              ? "انتهت جلسة التحقق بعد إرسال الطلب وحالة الحجز غير مؤكدة. لمنع تكرار الحجز عبر جلسة جديدة، يرجى مراجعة بريدك الإلكتروني أو إدارة الحجز بالمعرف الأصلي."
              : "Verification session expired after booking submission and outcome is uncertain. To prevent duplicate bookings across sessions, do not submit a new booking. Please check your confirmation email or Manage Booking (/manage).",
          );
          if (fromOtpDialog) setIsOtpDialogOpen(false);
          return;
        }

        const isAlreadyVerified = Boolean(
          guestVerifiedEmail &&
            guestVerifiedEmail.toLowerCase() === effectiveEmail &&
            guestReservationClient.isEmailVerified(effectiveEmail),
        );

        if (!isAlreadyVerified && !guestChallengeId) {
          if (guestSendingRef.current) return;
          const sent = await handleSendGuestCode();
          if (sent) {
            setIsOtpDialogOpen(true);
          }
          return;
        }

        // Freeze draft before verification
        setDraftFrozen(true);

        const result = await orchestrateGuestBooking({
          guestClient: guestReservationClient,
          tripClient,
          oneWayAttempt: oneWayAttempt.current,
          tripAttempt: tripAttempt.current,
          isRoundTrip,
          email: effectiveEmail,
          phone: effectivePhone,
          serviceId: offeringId,
          returnServiceId: returnOfferingId,
          passengers,
          challengeId: guestChallengeId,
          otpCode: guestOtpCode,
          isEmailVerified: isAlreadyVerified,
          postDispatched: postDispatchedRef.current,
          postAmbiguous: postAmbiguousRef.current,
          crossSessionRecoveryRequired: crossSessionRecoveryRequiredRef.current,
        });

        if (!mountedRef.current) return;

        if (result.success) {
          postDispatchedRef.current = false;
          postAmbiguousRef.current = false;
          crossSessionRecoveryRequiredRef.current = false;
          setLocked(false);
          setDraftFrozen(false);
          setGuestVerifiedEmail(result.verifiedEmail);
          setIsOtpDialogOpen(false);
          if (result.type === "round-trip") {
            setConfirmedTrip(result.receipt);
          } else {
            setConfirmedOneWay(result.receipt);
          }
          void cache.invalidateQueries({ queryKey: ["mvp", "reservations"] });
          return;
        }

        // Handle failure stages honestly
        postDispatchedRef.current = result.postDispatched;
        postAmbiguousRef.current = result.postAmbiguous;
        crossSessionRecoveryRequiredRef.current = result.crossSessionRecoveryRequired;

        if (result.verifiedEmail) {
          setGuestVerifiedEmail(result.verifiedEmail);
        } else if (
          result.error === "session_expired" ||
          result.error === "cross_session_recovery_required"
        ) {
          setGuestVerifiedEmail(null);
        }

        if (result.stage === "draft_validation") {
          setDraftFrozen(false);
          setLocked(false);
          setIsOtpDialogOpen(false);
          setError(ar
            ? "راجع بيانات المسافر والمقاعد المحددة ثم حاول مجدداً."
            : "Review the passenger details and selected seats, then try again.");
          return;
        }

        if (result.stage === "verifier") {
          // Attempt is NOT locked because reservation POST was never sent
          setLocked(false);
          if (result.status === 429) {
            setGuestCooldown(GUEST_RESEND_COOLDOWN_SECONDS);
          }
          const verErrorMsg =
            result.status === 429
              ? ar
                ? "عدد محاولات كبير للتحقق. انتظر دقيقة قبل المحاولة مجدداً."
                : "Too many verification attempts. Please wait a minute before trying again."
              : result.error === "invalid_code_format"
                ? ar
                  ? "أدخل رمز التحقق المكوّن من ٦ أرقام للمتابعة."
                  : "Please enter a valid 6-digit verification code."
                : result.status === 422
                  ? ar
                    ? "رمز التحقق غير صحيح أو منتهي الصلاحية. راجع الرمز وحاول مجدداً."
                    : "Invalid or expired verification code. Please check the code and try again."
                  : result.status === 401 || result.status === 403 || result.status === 419
                    ? ar
                      ? "تعذر التحقق من هذه الجلسة. حاول مجدداً أو اطلب رمزاً جديداً. لم يتم إرسال طلب الحجز."
                      : "Could not verify this session. Retry or request a new code. No booking was submitted."
                    : ar
                      ? "تعذر تأكيد التحقق من البريد. لم يتم إرسال طلب الحجز. حاول مجدداً بنفس الرمز."
                      : "Could not confirm email verification. No booking was submitted. Please retry with the same code.";

          setGuestError(verErrorMsg);
          setError(verErrorMsg);
          return;
        }

        // stage === "submission"
        setIsOtpDialogOpen(false);
        if (result.error === "session_expired") {
          setGuestChallengeId(null);
          setGuestOtpCode("");
          setError(
            ar
              ? "انتهت جلسة التحقق. اطلب رمزاً جديداً ثم أكمل نفس الحجز."
              : "Verification session expired. Request a new code to complete this same booking.",
          );
          return;
        }
        if (result.error === "rate_limited") {
          setLocked(true);
          setError(
            ar
              ? "طلبات كثيرة. انتظر دقيقة ثم أعد تأكيد نفس الطلب."
              : "Too many requests. Wait a minute, then retry this same confirmation.",
          );
          return;
        }
        if (result.error === "cross_session_recovery_required") {
          setLocked(true);
          setError(
            ar
              ? "انتهت جلسة التحقق بعد إرسال الطلب وحالة الحجز غير مؤكدة. لمنع تكرار الحجز عبر جلسة جديدة، يرجى مراجعة بريدك الإلكتروني أو إدارة الحجز بالمعرف الأصلي."
              : "Verification session expired after booking submission and outcome is uncertain. To prevent duplicate bookings across sessions, do not submit a new booking. Please check your confirmation email or Manage Booking (/manage).",
          );
          return;
        }

        if (result.error === "conflict") {
          setLocked(false);
          setDraftFrozen(false);
          setError(
            ar
              ? "تغيّر المقعد أو توفر الرحلة. تم تحديث المقاعد؛ اختر مقعداً متاحاً وحاول مجدداً."
              : "A seat or flight availability changed. Seats were refreshed; please pick an available seat and retry.",
          );
          void occupancy.refetch();
          void offering.refetch();
          if (isRoundTrip) {
            void returnOccupancy.refetch();
            void returnOffering.refetch();
          }
          return;
        }

        if (result.error === "validation_error") {
          setLocked(false);
          setDraftFrozen(false);
          setError(
            ar
              ? "تعذر قبول بيانات المسافر أو الوجبة أو المقعد. راجع الحقول المطلوبة."
              : "Passenger, meal, or seat details were rejected. Please review required fields.",
          );
          return;
        }

        if (result.error === "ambiguous_outcome") {
          setLocked(true);
          setError(
            ar
              ? "نتيجة التأكيد غير معروفة. أعد المحاولة بنفس الطلب ولا تبدأ حجزاً آخر."
              : "Confirmation outcome is uncertain. Retry this same confirmation request; do not submit a new booking.",
          );
          return;
        }

        setError(
          ar ? "لم يتم تأكيد الحجز. حاول مجدداً." : "Booking was not confirmed. Please retry.",
        );
      } else {
        // --- Authenticated Account Path (Preserved) ---
        setLocked(true);
        if (isRoundTrip) {
          let command: TripCommand | GuestTripCommand;
          try {
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

          const result = await tripClient.create(command, false);
          if (!mountedRef.current) return;
          setConfirmedTrip(result);
          void cache.invalidateQueries({ queryKey: ["mvp", "reservations"] });
        } else {
          let command: ReservationCommand | GuestReservationCommand;
          try {
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

          const result = await reservationClient.create(reservationCommandSchema.parse(command));
          if (!mountedRef.current) return;
          setConfirmedOneWay(result);
          void cache.invalidateQueries({ queryKey: ["mvp", "reservations"] });
        }
      }
    } catch (failure) {
      if (!mountedRef.current) return;
      const status = failure instanceof MvpApiError ? failure.status : undefined;
      if (isRoundTrip) {
        tripAttempt.current.rejected(status);
        setLocked(tripAttempt.current.locked);
      } else {
        if (status === 409 || status === 422) {
          oneWayAttempt.current.rejected(status);
        }
        setLocked(oneWayAttempt.current.locked);
      }

      setError(
        status === 409
          ? ar
            ? "تغيّر المقعد أو توفر الرحلة. تم تحديث المقاعد؛ اختر مقعداً متاحاً وحاول مجدداً."
            : "A seat or flight availability changed. Seats were refreshed; please pick an available seat and retry."
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
      executingRef.current = false;
    }
  };


  // Per-leg seat assignment counts & status
  const outboundSeatCount = passengers.filter(p => Boolean(p.seatCode)).length;
  const returnSeatCount = passengers.filter(p => Boolean(p.returnSeatCode)).length;
  const totalPassengers = passengers.length;

  const outboundSeatStatusText =
    totalPassengers === 1
      ? passengers[0]?.seatCode
        ? `${ar ? "المقعد" : "Seat"} ${passengers[0].seatCode}`
        : (ar ? "المقعد مطلوب" : "Seat needed")
      : `${outboundSeatCount}/${totalPassengers} ${ar ? "مقاعد" : "seats"}`;

  const returnSeatStatusText =
    totalPassengers === 1
      ? passengers[0]?.returnSeatCode
        ? `${ar ? "المقعد" : "Seat"} ${passengers[0].returnSeatCode}`
        : (ar ? "المقعد مطلوب" : "Seat needed")
      : `${returnSeatCount}/${totalPassengers} ${ar ? "مقاعد" : "seats"}`;

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

      {/* Cross-session recovery required banner after ambiguous outcome and expired session */}
      {crossSessionRecoveryRequiredRef.current && (
        <div role="alert" className="space-y-3 rounded-xl border border-destructive bg-destructive/5 p-4 text-destructive">
          <p className="font-semibold text-sm">
            {ar
              ? "تنبيه: انتهت جلسة التحقق بعد إرسال طلب الحجز وحالته غير مؤكدة."
              : "Notice: Verification session expired after booking submission and outcome is uncertain."}
          </p>
          <p className="text-sm">
            {ar
              ? "لمنع تكرار الحجز عبر جلسة جديدة، تم قفل هذا الطلب. يرجى مراجعة بريدك الإلكتروني للتأكد من وصول التذكرة أو زيارة صفحة إدارة الحجز بالمعرف الأصلي."
              : "To prevent duplicate bookings across sessions, replay under a fresh session is blocked. Please check your confirmation email or visit Manage Booking."}
          </p>
          <div className="flex gap-3">
            <AppLink to="/manage" className={btnClass("primary", "sm")}>
              {ar ? "إدارة الحجز" : "Manage booking"}
            </AppLink>
          </div>
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
          {/* Mobile Step Header (Visible on screens < lg) */}
          <div className="flex items-center justify-between gap-1.5 border-b border-border/70 pb-3 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileStep("traveler")}
              className={cn(
                "flex items-center gap-1 text-xs font-semibold rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer",
                mobileStep === "traveler"
                  ? "border border-primary bg-primary text-primary-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:bg-secondary",
              )}
            >
              <span>1. {ar ? "المسافر" : "Traveler"}</span>
            </button>
            <span className="text-muted-foreground text-xs" aria-hidden="true">→</span>
            <button
              type="button"
              onClick={() => {
                if (passengers[0]?.firstName.trim() && (account || email.includes("@"))) {
                  setMobileStep("seats");
                } else {
                  validateForm();
                }
              }}
              className={cn(
                "flex items-center gap-1 text-xs font-semibold rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer",
                mobileStep === "seats"
                  ? "border border-primary bg-primary text-primary-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:bg-secondary",
              )}
            >
              <span>2. {ar ? "المقاعد" : "Seats"}</span>
              {outboundSeatCount > 0 && <span className="size-1.5 rounded-full bg-primary" />}
            </button>
            <span className="text-muted-foreground text-xs" aria-hidden="true">→</span>
            <button
              type="button"
              onClick={() => {
                if (passengers.every(p => p.seatCode) && (!isRoundTrip || passengers.every(p => p.returnSeatCode))) {
                  setMobileStep("confirm");
                } else {
                  validateForm();
                }
              }}
              className={cn(
                "flex items-center gap-1 text-xs font-semibold rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer",
                mobileStep === "confirm"
                  ? "border border-primary bg-primary text-primary-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:bg-secondary",
              )}
            >
              <span>3. {ar ? "التأكيد" : "Confirm"}</span>
            </button>
          </div>

          <form
            className="space-y-6"
            onSubmit={event => {
              event.preventDefault();
              void confirmBooking();
            }}
          >
            <fieldset disabled={locked || pending || draftFrozen} className="min-w-0 space-y-6">
              {draftFrozen && !locked && !crossSessionRecoveryRequiredRef.current && (
                <div className="flex items-center justify-between rounded-lg border border-sand-deep/40 bg-sand/20 p-3">
                  <span className="text-sm text-muted-foreground">
                    {ar ? "تم تجميد مسودة الحجز للمطابقة مع رمز التحقق." : "Booking draft is frozen to match verification proof."}
                  </span>
                  <button
                    type="button"
                    className={btnClass("outline", "sm")}
                    onClick={() => setDraftFrozen(false)}
                  >
                    {ar ? "تعديل المسودة" : "Edit draft"}
                  </button>
                </div>
              )}

              {/* Two-Column Desktop Layout (7/5) */}
              <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-12 items-start">
                {/* Left Column: Progressive Form Fields (7 cols) */}
                <div className="min-w-0 lg:col-span-7 space-y-6">
                  {/* Step 1: Traveler Details */}
                  <div className={cn("space-y-6", mobileStep !== "traveler" && "hidden lg:block")}>
                    <Panel className="space-y-4 border-border/80 bg-card/90 shadow-xs">
                      <div className="flex items-center justify-between border-b border-border/60 pb-3">
                        <h2 className="text-xl font-bold font-serif text-foreground">
                          {ar ? "١. بيانات المسافر والتواصل" : "1. Passenger & Contact details"}
                        </h2>
                        {account && (
                          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                            {ar ? "حساب موثّق" : "Verified account"}
                          </span>
                        )}
                      </div>

                      {/* Account indicator if signed in */}
                      {account ? (
                        <div className="space-y-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              {ar ? "البريد الإلكتروني الموثق للحساب" : "Verified account email"}
                            </p>
                            <p className="font-mono text-sm font-semibold" dir="ltr">
                              {account.email}
                            </p>
                          </div>

                          {/* Saved travelers dropdown */}
                          {!!travelers.data?.length && (
                            <Field label={ar ? "استخدام مسافر محفوظ" : "Use saved traveler"}>
                              <Select
                                value=""
                                onChange={e => {
                                  const tr = travelers.data?.find(item => item.id === e.target.value);
                                  if (tr) {
                                    updatePassenger(0, {
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

                          {/* Authenticated Passenger fields */}
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field
                              label={ar ? "الاسم الأول" : "First name"}
                              htmlFor={`${fieldId}-0-fn`}
                            >
                              <Input
                                id={`${fieldId}-0-fn`}
                                required
                                autoComplete="given-name"
                                value={passengers[0]?.firstName ?? ""}
                                maxLength={120}
                                onChange={e => {
                                  updatePassenger(0, { firstName: e.target.value });
                                  if (fieldErrors["pax-0-fn"]) setFieldErrors(prev => ({ ...prev, "pax-0-fn": undefined }));
                                }}
                                aria-invalid={Boolean(fieldErrors["pax-0-fn"])}
                                className={cn(fieldErrors["pax-0-fn"] && "border-clay ring-1 ring-clay")}
                              />
                              {fieldErrors["pax-0-fn"] && (
                                <p role="alert" className="mt-1 text-xs font-semibold text-clay">{fieldErrors["pax-0-fn"]}</p>
                              )}
                            </Field>

                            <Field
                              label={ar ? "اسم العائلة" : "Last name"}
                              htmlFor={`${fieldId}-0-ln`}
                            >
                              <Input
                                id={`${fieldId}-0-ln`}
                                required
                                autoComplete="family-name"
                                value={passengers[0]?.lastName ?? ""}
                                maxLength={120}
                                onChange={e => {
                                  updatePassenger(0, { lastName: e.target.value });
                                  if (fieldErrors["pax-0-ln"]) setFieldErrors(prev => ({ ...prev, "pax-0-ln": undefined }));
                                }}
                                aria-invalid={Boolean(fieldErrors["pax-0-ln"])}
                                className={cn(fieldErrors["pax-0-ln"] && "border-clay ring-1 ring-clay")}
                              />
                              {fieldErrors["pax-0-ln"] && (
                                <p role="alert" className="mt-1 text-xs font-semibold text-clay">{fieldErrors["pax-0-ln"]}</p>
                              )}
                            </Field>

                            <Field
                              label={ar ? "تاريخ الميلاد" : "Date of birth"}
                              htmlFor={`${fieldId}-0-dob`}
                            >
                              <Input
                                id={`${fieldId}-0-dob`}
                                type="date"
                                required
                                value={passengers[0]?.dob ?? ""}
                                max={offering.data.date}
                                dir="ltr"
                                onChange={e => {
                                  updatePassenger(0, { dob: e.target.value });
                                  if (fieldErrors["pax-0-dob"]) setFieldErrors(prev => ({ ...prev, "pax-0-dob": undefined }));
                                }}
                                aria-invalid={Boolean(fieldErrors["pax-0-dob"])}
                                className={cn(fieldErrors["pax-0-dob"] && "border-clay ring-1 ring-clay")}
                              />
                              {fieldErrors["pax-0-dob"] && (
                                <p role="alert" className="mt-1 text-xs font-semibold text-clay">{fieldErrors["pax-0-dob"]}</p>
                              )}
                            </Field>

                            <Field
                              label={ar ? "الفئة العمرية" : "Age category"}
                              htmlFor={`${fieldId}-0-type`}
                            >
                              <Select
                                id={`${fieldId}-0-type`}
                                value={passengers[0]?.type ?? "adult"}
                                onChange={e =>
                                  updatePassenger(0, { type: e.target.value as "adult" | "child" })
                                }
                              >
                                <option value="adult">{ar ? "بالغ (١٢+)" : "Adult (12+)"}</option>
                                <option value="child">{ar ? "طفل (٢–١١)" : "Child (2–11)"}</option>
                              </Select>
                            </Field>

                            <Field
                              label={ar ? "الجنسية" : "Nationality"}
                              htmlFor={`${fieldId}-0-nat`}
                            >
                              <Input
                                id={`${fieldId}-0-nat`}
                                required
                                value={passengers[0]?.nationality ?? ""}
                                maxLength={120}
                                onChange={e => {
                                  updatePassenger(0, { nationality: e.target.value });
                                  if (fieldErrors["pax-0-nat"]) setFieldErrors(prev => ({ ...prev, "pax-0-nat": undefined }));
                                }}
                                aria-invalid={Boolean(fieldErrors["pax-0-nat"])}
                                className={cn(fieldErrors["pax-0-nat"] && "border-clay ring-1 ring-clay")}
                              />
                              {fieldErrors["pax-0-nat"] && (
                                <p role="alert" className="mt-1 text-xs font-semibold text-clay">{fieldErrors["pax-0-nat"]}</p>
                              )}
                            </Field>

                            <Field
                              label={ar ? "وثيقة السفر (جواز أو هوية)" : "Travel document (Passport / ID)"}
                              htmlFor={`${fieldId}-0-doc`}
                            >
                              <Input
                                id={`${fieldId}-0-doc`}
                                required
                                value={passengers[0]?.document ?? ""}
                                maxLength={120}
                                onChange={e => {
                                  updatePassenger(0, { document: e.target.value });
                                  if (fieldErrors["pax-0-doc"]) setFieldErrors(prev => ({ ...prev, "pax-0-doc": undefined }));
                                }}
                                aria-invalid={Boolean(fieldErrors["pax-0-doc"])}
                                className={cn(fieldErrors["pax-0-doc"] && "border-clay ring-1 ring-clay")}
                              />
                              {fieldErrors["pax-0-doc"] && (
                                <p role="alert" className="mt-1 text-xs font-semibold text-clay">{fieldErrors["pax-0-doc"]}</p>
                              )}
                            </Field>
                          </div>
                        </div>
                      ) : (
                        /* Guest Mode: Name and Email First! */
                        <div className="space-y-4">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field
                              label={ar ? "البريد الإلكتروني للتذاكر والتواصل" : "Contact email for tickets & confirmation"}
                              htmlFor={`${fieldId}-guest-email`}
                              className="sm:col-span-2"
                            >
                              <Input
                                id={`${fieldId}-guest-email`}
                                type="email"
                                required
                                maxLength={254}
                                value={email}
                                onChange={e => {
                                  handleEmailChange(e.target.value);
                                  if (fieldErrors["email"]) setFieldErrors(prev => ({ ...prev, email: undefined }));
                                }}
                                placeholder="name@example.com"
                                dir="ltr"
                                autoComplete="email"
                                aria-invalid={Boolean(fieldErrors["email"])}
                                aria-describedby={fieldErrors["email"] ? `${fieldId}-guest-email-err` : undefined}
                                className={cn(fieldErrors["email"] && "border-clay ring-1 ring-clay focus-visible:ring-clay")}
                              />
                              {fieldErrors["email"] && (
                                <p id={`${fieldId}-guest-email-err`} role="alert" className="mt-1.5 text-xs font-semibold text-clay">
                                  {fieldErrors["email"]}
                                </p>
                              )}
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {ar
                                  ? "سنرسل تذكرتك الإلكترونية ورمز التحقق إلى هذا البريد."
                                  : "We'll send your digital commemorative ticket and verification code here."}
                              </p>
                            </Field>

                            <Field
                              label={ar ? "اسم المسافر الكامل" : "Primary passenger name"}
                              htmlFor={`${fieldId}-0-name`}
                              className="sm:col-span-2"
                            >
                              <Input
                                id={`${fieldId}-0-name`}
                                required
                                autoComplete="name"
                                placeholder={
                                  ar
                                    ? "الاسم الكامل (مثال: محمد عبد الله أو Jane Doe)"
                                    : "Full name (e.g. Jane Doe or Ahmed Sharif)"
                                }
                                value={passengers[0]?.firstName ?? ""}
                                maxLength={120}
                                onChange={e => {
                                  updatePassenger(0, { firstName: e.target.value });
                                  if (fieldErrors["pax-0-name"]) setFieldErrors(prev => ({ ...prev, "pax-0-name": undefined }));
                                }}
                                aria-invalid={Boolean(fieldErrors["pax-0-name"])}
                                aria-describedby={fieldErrors["pax-0-name"] ? `${fieldId}-0-name-err` : undefined}
                                className={cn(fieldErrors["pax-0-name"] && "border-clay ring-1 ring-clay focus-visible:ring-clay")}
                              />
                              {fieldErrors["pax-0-name"] && (
                                <p id={`${fieldId}-0-name-err`} role="alert" className="mt-1.5 text-xs font-semibold text-clay">
                                  {fieldErrors["pax-0-name"]}
                                </p>
                              )}
                            </Field>

                            <Field
                              label={ar ? "الهاتف (اختياري)" : "Phone number (optional)"}
                              htmlFor={`${fieldId}-phone`}
                              className="sm:col-span-2"
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

                            {/* Optional details collapsed */}
                            <details
                              ref={guestDetailsRef}
                              className="sm:col-span-2 rounded-lg border border-border/70 bg-sand/20 dark:bg-card/40 p-3.5 transition-colors"
                            >
                              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground select-none">
                                {ar
                                  ? "+ تفاصيل إضافية اختيارية (تاريخ الميلاد، الوثيقة، الجنسية)"
                                  : "+ Optional additional details (Date of birth, document, nationality)"}
                              </summary>
                              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                                <Field
                                  label={ar ? "تاريخ الميلاد (اختياري)" : "Date of birth (Optional)"}
                                  htmlFor={`${fieldId}-0-dob`}
                                >
                                  <Input
                                    id={`${fieldId}-0-dob`}
                                    type="date"
                                    value={passengers[0]?.dob ?? ""}
                                    max={offering.data.date}
                                    dir="ltr"
                                    onChange={e => {
                                      updatePassenger(0, { dob: e.target.value });
                                      if (fieldErrors["pax-0-dob"]) setFieldErrors(prev => ({ ...prev, "pax-0-dob": undefined }));
                                    }}
                                    aria-invalid={Boolean(fieldErrors["pax-0-dob"])}
                                    aria-describedby={fieldErrors["pax-0-dob"] ? `${fieldId}-0-dob-err` : undefined}
                                    className={cn(fieldErrors["pax-0-dob"] && "border-clay ring-1 ring-clay focus-visible:ring-clay")}
                                  />
                                  {fieldErrors["pax-0-dob"] && (
                                    <p id={`${fieldId}-0-dob-err`} role="alert" className="mt-1.5 text-xs font-semibold text-clay">
                                      {fieldErrors["pax-0-dob"]}
                                    </p>
                                  )}
                                </Field>

                                <Field
                                  label={ar ? "الفئة العمرية" : "Age category"}
                                  htmlFor={`${fieldId}-0-type`}
                                >
                                  <Select
                                    id={`${fieldId}-0-type`}
                                    value={passengers[0]?.type ?? "adult"}
                                    onChange={e => {
                                      updatePassenger(0, {
                                        type: e.target.value as "adult" | "child",
                                      });
                                      if (fieldErrors["pax-0-type"]) setFieldErrors(prev => ({ ...prev, "pax-0-type": undefined }));
                                      if (fieldErrors["pax-0-dob"]) setFieldErrors(prev => ({ ...prev, "pax-0-dob": undefined }));
                                    }}
                                    aria-invalid={Boolean(fieldErrors["pax-0-type"])}
                                    aria-describedby={fieldErrors["pax-0-type"] ? `${fieldId}-0-type-err` : undefined}
                                    className={cn(fieldErrors["pax-0-type"] && "border-clay ring-1 ring-clay focus-visible:ring-clay")}
                                  >
                                    <option value="adult">{ar ? "بالغ (١٢+)" : "Adult (12+)"}</option>
                                    <option value="child">{ar ? "طفل (٢–١١)" : "Child (2–11)"}</option>
                                  </Select>
                                  {fieldErrors["pax-0-type"] && (
                                    <p id={`${fieldId}-0-type-err`} role="alert" className="mt-1.5 text-xs font-semibold text-clay">
                                      {fieldErrors["pax-0-type"]}
                                    </p>
                                  )}
                                </Field>

                                <Field
                                  label={ar ? "الجنسية (اختياري)" : "Nationality (Optional)"}
                                  htmlFor={`${fieldId}-0-nat`}
                                >
                                  <Input
                                    id={`${fieldId}-0-nat`}
                                    value={passengers[0]?.nationality ?? ""}
                                    maxLength={120}
                                    onChange={e => {
                                      updatePassenger(0, { nationality: e.target.value });
                                      if (fieldErrors["pax-0-nat"]) setFieldErrors(prev => ({ ...prev, "pax-0-nat": undefined }));
                                    }}
                                    aria-invalid={Boolean(fieldErrors["pax-0-nat"])}
                                    aria-describedby={fieldErrors["pax-0-nat"] ? `${fieldId}-0-nat-err` : undefined}
                                    className={cn(fieldErrors["pax-0-nat"] && "border-clay ring-1 ring-clay focus-visible:ring-clay")}
                                  />
                                  {fieldErrors["pax-0-nat"] && (
                                    <p id={`${fieldId}-0-nat-err`} role="alert" className="mt-1.5 text-xs font-semibold text-clay">
                                      {fieldErrors["pax-0-nat"]}
                                    </p>
                                  )}
                                </Field>

                                <Field
                                  label={ar ? "وثيقة السفر (اختياري)" : "Travel document (Optional)"}
                                  htmlFor={`${fieldId}-0-doc`}
                                >
                                  <Input
                                    id={`${fieldId}-0-doc`}
                                    value={passengers[0]?.document ?? ""}
                                    maxLength={120}
                                    onChange={e => {
                                      updatePassenger(0, { document: e.target.value });
                                      if (fieldErrors["pax-0-doc"]) setFieldErrors(prev => ({ ...prev, "pax-0-doc": undefined }));
                                    }}
                                    aria-invalid={Boolean(fieldErrors["pax-0-doc"])}
                                    aria-describedby={fieldErrors["pax-0-doc"] ? `${fieldId}-0-doc-err` : undefined}
                                    className={cn(fieldErrors["pax-0-doc"] && "border-clay ring-1 ring-clay focus-visible:ring-clay")}
                                  />
                                  {fieldErrors["pax-0-doc"] && (
                                    <p id={`${fieldId}-0-doc-err`} role="alert" className="mt-1.5 text-xs font-semibold text-clay">
                                      {fieldErrors["pax-0-doc"]}
                                    </p>
                                  )}
                                </Field>
                              </div>
                            </details>
                          </div>
                        </div>
                      )}

                      {/* Meals for Passenger 1 */}
                      <div className="grid gap-4 sm:grid-cols-2 pt-3 border-t border-border/50">
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
                          htmlFor={`${fieldId}-0-meal`}
                        >
                          <Select
                            id={`${fieldId}-0-meal`}
                            value={passengers[0]?.mealId ?? ""}
                            onChange={e =>
                              updatePassenger(0, { mealId: e.target.value || null })
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
                            htmlFor={`${fieldId}-0-ret-meal`}
                          >
                            <Select
                              id={`${fieldId}-0-ret-meal`}
                              value={passengers[0]?.returnMealId ?? ""}
                              onChange={e =>
                                updatePassenger(0, { returnMealId: e.target.value || null })
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

                      {/* Mobile action to proceed to seats */}
                      <div className="lg:hidden pt-3 border-t border-border/60">
                        <button
                          type="button"
                          className={btnClass("primary", "md", "w-full justify-center")}
                          onClick={() => {
                            const errs: Record<string, string | undefined> = {};
                            if (!account && (!email || !email.includes("@"))) {
                              errs["email"] = ar ? "أدخل بريداً إلكترونياً صالحاً." : "Please enter a valid email address.";
                            }
                            if (!account && !passengers[0]?.firstName.trim()) {
                              errs["pax-0-name"] = ar ? "اسم المسافر مطلوب." : "Passenger name is required.";
                            }
                            const hasErrors = Object.values(errs).some(Boolean);
                            if (hasErrors) {
                              setFieldErrors(prev => ({ ...prev, ...errs }));
                              if (errs["email"]) document.getElementById(`${fieldId}-guest-email`)?.focus();
                              else document.getElementById(`${fieldId}-0-name`)?.focus();
                              return;
                            }
                            setMobileStep("seats");
                          }}
                        >
                          {ar ? "التالي: اختيار المقاعد ←" : "Next: Choose seats →"}
                        </button>
                      </div>
                    </Panel>

                    {/* Additional passengers (index >= 1) */}
                    {passengers.length > 1 && (
                      <div className="space-y-4">
                        {passengers.slice(1).map((person, sliceIndex) => {
                          const index = sliceIndex + 1;
                          return (
                            <Panel key={person.id} className="space-y-4 border-border/80 bg-card/90 shadow-xs">
                              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                                <h3 className="font-bold text-foreground">
                                  {ar ? "المسافر" : "Passenger"} {index + 1}
                                </h3>
                                <button
                                  type="button"
                                  disabled={locked || pending || draftFrozen}
                                  className={btnClass("ghost", "sm", "text-destructive hover:bg-destructive/10")}
                                  onClick={() => {
                                    setPassengers(curr => curr.filter((_, i) => i !== index));
                                    setActivePassenger(0);
                                  }}
                                >
                                  {ar ? "إزالة المسافر" : "Remove passenger"}
                                </button>
                              </div>

                              <Field
                                label={ar ? "اسم المسافر" : "Passenger name"}
                                htmlFor={`${fieldId}-${index}-name`}
                              >
                                <Input
                                  id={`${fieldId}-${index}-name`}
                                  required
                                  value={person.firstName}
                                  maxLength={120}
                                  onChange={e => {
                                    updatePassenger(index, { firstName: e.target.value });
                                    if (fieldErrors[`pax-${index}-name`]) {
                                      setFieldErrors(prev => ({ ...prev, [`pax-${index}-name`]: undefined }));
                                    }
                                  }}
                                  aria-invalid={Boolean(fieldErrors[`pax-${index}-name`])}
                                  className={cn(fieldErrors[`pax-${index}-name`] && "border-clay ring-1 ring-clay")}
                                />
                                {fieldErrors[`pax-${index}-name`] && (
                                  <p role="alert" className="mt-1 text-xs font-semibold text-clay">{fieldErrors[`pax-${index}-name`]}</p>
                                )}
                              </Field>

                              {/* Meals */}
                              <div className="grid gap-4 sm:grid-cols-2">
                                <Field
                                  label={isRoundTrip ? (ar ? "وجبة رحلة الذهاب" : "Outbound meal") : (ar ? "الوجبة" : "Meal")}
                                  htmlFor={`${fieldId}-${index}-meal`}
                                >
                                  <Select
                                    id={`${fieldId}-${index}-meal`}
                                    value={person.mealId ?? ""}
                                    onChange={e => updatePassenger(index, { mealId: e.target.value || null })}
                                  >
                                    <option value="">{ar ? "بدون وجبة" : "No meal"}</option>
                                    {meals.data.meals.map(item => (
                                      <option key={item.id} value={item.id}>{pick(lang, item.label)}</option>
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
                                      onChange={e => updatePassenger(index, { returnMealId: e.target.value || null })}
                                    >
                                      <option value="">{ar ? "بدون وجبة" : "No meal"}</option>
                                      {meals.data.meals.map(item => (
                                        <option key={item.id} value={item.id}>{pick(lang, item.label)}</option>
                                      ))}
                                    </Select>
                                  </Field>
                                )}
                              </div>
                            </Panel>
                          );
                        })}
                      </div>
                    )}

                    {/* Add passenger button */}
                    <div>
                      <button
                        type="button"
                        disabled={locked || pending || draftFrozen || passengers.length >= 9}
                        className={btnClass("outline", "sm")}
                        onClick={() => setPassengers(curr => [...curr, emptyPassenger(nextId.current++)])}
                      >
                        {ar ? "+ إضافة مسافر آخر" : "+ Add another passenger"}
                      </button>
                    </div>
                  </div>

                  {/* Step 3: Review & Submit (Left column desktop bottom, or mobile Step 3) */}
                  <div className={cn("space-y-6", mobileStep !== "confirm" && "hidden lg:block")}>
                    <Panel className="space-y-4 border-border/80 bg-card/90 shadow-xs">
                      <div className="flex items-center justify-between border-b border-border/60 pb-3">
                        <h2 className="text-xl font-bold font-serif text-foreground">
                          {ar ? "٢. المراجعة وتأكيد الحجز" : "2. Review & Confirm booking"}
                        </h2>
                        <span className="text-xs text-muted-foreground">
                          {passengers.length} {passengers.length === 1 ? (ar ? "مسافر" : "passenger") : (ar ? "مسافرين" : "passengers")}
                        </span>
                      </div>

                      {/* Summary chips */}
                      <div className="grid gap-3 sm:grid-cols-2 rounded-lg border border-border/60 bg-sand/20 dark:bg-card/40 p-3.5 text-xs">
                        <div>
                          <span className="font-semibold text-muted-foreground block">{ar ? "المسافر الرئيسي:" : "Primary passenger:"}</span>
                          <span className="font-medium text-foreground">{passengers[0]?.firstName.trim() || "—"}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-muted-foreground block">{ar ? "البريد الإلكتروني للتذاكر:" : "Tickets sent to:"}</span>
                          <span className="font-mono text-foreground" dir="ltr">{account ? account.email : (email || "—")}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-muted-foreground block">{ar ? "مقاعد الذهاب:" : "Outbound seats:"}</span>
                          <span className="font-mono text-foreground">
                            {passengers.map(p => p.seatCode || "—").join(", ")}
                          </span>
                        </div>
                        {isRoundTrip && (
                          <div>
                            <span className="font-semibold text-muted-foreground block">{ar ? "مقاعد العودة:" : "Return seats:"}</span>
                            <span className="font-mono text-foreground">
                              {passengers.map(p => p.returnSeatCode || "—").join(", ")}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Verified email banner if guest is already verified in this session */}
                      {!account && guestVerifiedEmail && guestVerifiedEmail.toLowerCase() === email.trim().toLowerCase() && (
                        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs sm:text-sm text-primary">
                          <Check className="size-4 shrink-0 font-bold" />
                          <span>
                            {ar
                              ? `تم التحقق من البريد الإلكتروني (${guestVerifiedEmail}). الحجز جاهز للتأكيد فوراً.`
                              : `Email verified (${guestVerifiedEmail}). Ready for immediate confirmation.`}
                          </span>
                        </div>
                      )}

                      {/* General Form Error / Retry Alert */}
                      {error && (
                        <p role="alert" tabIndex={-1} className="rounded-lg border border-clay bg-clay/5 p-4 text-sm font-medium text-clay">
                          {error}
                        </p>
                      )}

                      {/* Submit Button & Actions */}
                      <div className="flex flex-wrap items-center gap-4 pt-2">
                        <button
                          type="submit"
                          className={btnClass("primary", "lg", "min-w-[200px]")}
                          disabled={pending || crossSessionRecoveryRequiredRef.current}
                        >
                          {pending
                            ? (ar ? "جارٍ التأكيد…" : "Confirming…")
                            : crossSessionRecoveryRequiredRef.current
                              ? (ar ? "انتهت الجلسة – راجع البريد أو إدارة الحجز" : "Session expired – Check email / Manage booking")
                              : locked
                                ? (ar ? "إعادة تأكيد نفس الطلب" : "Retry same confirmation")
                                : !account && (!guestVerifiedEmail || guestVerifiedEmail.toLowerCase() !== email.trim().toLowerCase())
                                  ? (ar ? "التحقق وتأكيد الحجز المجاني" : "Verify email & confirm booking")
                                  : isRoundTrip
                                    ? (ar ? "تأكيد حجز الذهاب والعودة مجاناً" : "Confirm free round-trip booking")
                                    : (ar ? "تأكيد الحجز المجاني" : "Confirm free booking")}
                        </button>

                        <AppLink to="/manage" className={btnClass("outline", "md")}>
                          {ar ? "إدارة حجز سابق" : "Manage existing booking"}
                        </AppLink>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        {ar
                          ? "حجز تذكاري مجاني لمطار غزة الدولي والخطوط الجوية الفلسطينية. تأكيد فوري بدون دفع أو بطاقة بنكية."
                          : "Free commemorative booking for Gaza International Airport & Palestinian Airlines. Instant confirmation with no payment required."}
                      </p>
                    </Panel>
                  </div>
                </div>

                {/* Right Column: Sticky Summary & Scrolling Seat Selection (5 cols) */}
                <div
                  className={cn(
                    "min-w-0 space-y-5 lg:col-span-5 lg:sticky lg:top-6 lg:self-start",
                    mobileStep !== "seats" && "hidden lg:block",
                  )}
                >
                  {/* Flight Summary Cards */}
                  <Panel className="space-y-3 border-border/80 bg-card/90 shadow-xs">
                    <div className="flex items-center justify-between border-b border-border/60 pb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-primary">
                        {isRoundTrip ? (ar ? "مسار الرحلة" : "Flight Itinerary") : (ar ? "تفاصيل الرحلة" : "Flight Details")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {isRoundTrip ? (ar ? "ذهاب وعودة" : "Round-trip") : (ar ? "اتجاه واحد" : "One-way")}
                      </span>
                    </div>

                    {/* Outbound leg */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="flex items-center gap-1.5 text-foreground">
                          <PlaneTakeoff className="size-3.5 text-primary" aria-hidden="true" />
                          <span>{ar ? "الذهاب" : "Outbound"}:</span>
                          <Code className="font-bold">{offering.data.number}</Code>
                        </span>
                        <span dir="ltr" className="font-mono text-muted-foreground">
                          {offering.data.originCode} → {offering.data.destinationCode}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {offering.data.date} · {offering.data.departTime} → {offering.data.arriveTime} ({offering.data.aircraft})
                      </p>
                    </div>

                    {/* Return leg */}
                    {isRoundTrip && returnOffering.data && (
                      <div className="space-y-1 border-t border-border/40 pt-2">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="flex items-center gap-1.5 text-foreground">
                            <PlaneLanding className="size-3.5 text-primary" aria-hidden="true" />
                            <span>{ar ? "العودة" : "Return"}:</span>
                            <Code className="font-bold">{returnOffering.data.number}</Code>
                          </span>
                          <span dir="ltr" className="font-mono text-muted-foreground">
                            {returnOffering.data.originCode} → {returnOffering.data.destinationCode}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {returnOffering.data.date} · {returnOffering.data.departTime} → {returnOffering.data.arriveTime} ({returnOffering.data.aircraft})
                        </p>
                      </div>
                    )}
                  </Panel>

                  {/* Seat Selection Workspace */}
                  <Panel className="space-y-4 border-border/80 bg-card/90 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                      <div>
                        <h2 className="text-lg font-bold font-serif text-foreground">
                          {ar ? "اختيار المقاعد" : "Choose seats"}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          {isRoundTrip
                            ? ar
                              ? "اختر مقعداً لكل مسافر في رحلتي الذهاب والعودة."
                              : "Select a seat for each passenger on outbound and return flights."
                            : ar
                              ? "اختر مقعدك المفضل على الطائرة."
                              : "Select your preferred seat on the aircraft."}
                        </p>
                      </div>
                    </div>

                    {/* Passenger Selector for multi-passenger bookings */}
                    {passengers.length > 1 && (
                      <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-border/40">
                        <span className="text-xs font-semibold text-muted-foreground">
                          {ar ? "المسافر الحالي:" : "Current passenger:"}
                        </span>
                        {passengers.map((p, i) => {
                          const assigned = activeLegTab === "outbound" ? p.seatCode : p.returnSeatCode;
                          const isCurrent = activePassenger === i;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setActivePassenger(i)}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                                isCurrent
                                  ? "bg-primary text-primary-foreground shadow-xs font-bold"
                                  : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
                              )}
                            >
                              <span>{p.firstName.trim() || `${ar ? "المسافر" : "Pax"} ${i + 1}`}</span>
                              {assigned ? (
                                <span className="font-mono text-[10px] bg-background/30 rounded px-1">{assigned}</span>
                              ) : (
                                <span className="text-[10px] text-clay font-bold">•</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Centered Outbound / Return Filled Tabs with Per-Leg Seat Status */}
                    {isRoundTrip && (
                      <div className="flex justify-center">
                        <div
                          role="tablist"
                          aria-label={ar ? "اختيار الرحلة للمقاعد" : "Seat selection flight leg"}
                          className="grid w-full min-w-0 max-w-md grid-cols-2 items-stretch gap-1.5 rounded-xl border border-border/80 bg-secondary/80 p-1.5 shadow-xs"
                        >
                          <button
                            ref={outboundTabRef}
                            id={`${fieldId}-tab-outbound`}
                            role="tab"
                            type="button"
                            aria-selected={activeLegTab === "outbound"}
                            aria-controls={`${fieldId}-seatmap-panel`}
                            tabIndex={activeLegTab === "outbound" ? 0 : -1}
                            onClick={() => {
                              setActiveLegTab("outbound");
                              if (fieldErrors["outboundSeat"]) setFieldErrors(prev => ({ ...prev, outboundSeat: undefined }));
                            }}
                            className={cn(
                              "flex min-w-0 min-h-[46px] flex-col items-center justify-center rounded-lg px-2 sm:px-4 py-1.5 text-center transition-all cursor-pointer select-none",
                              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                              activeLegTab === "outbound"
                                ? "border border-primary bg-primary text-primary-foreground shadow-xs font-semibold"
                                : "border border-transparent bg-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground",
                              fieldErrors["outboundSeat"] && activeLegTab !== "outbound" && "border-clay text-clay bg-clay-soft/40",
                            )}
                          >
                            <span className="flex flex-wrap items-center justify-center gap-1.5 text-xs uppercase tracking-wider font-bold">
                              <PlaneTakeoff className="size-3.5" aria-hidden="true" />
                              <span>{ar ? "١. الذهاب" : "1. Outbound"}</span>
                              <span dir="ltr" className="font-mono text-[10px] opacity-80">
                                ({offering.data.originCode} → {offering.data.destinationCode})
                              </span>
                            </span>
                            <span className="text-[11px] font-medium opacity-95 mt-0.5">
                              {outboundSeatStatusText}
                            </span>
                          </button>

                          <button
                            ref={returnTabRef}
                            id={`${fieldId}-tab-return`}
                            role="tab"
                            type="button"
                            aria-selected={activeLegTab === "return"}
                            aria-controls={`${fieldId}-seatmap-panel`}
                            tabIndex={activeLegTab === "return" ? 0 : -1}
                            onClick={() => {
                              setActiveLegTab("return");
                              if (fieldErrors["returnSeat"]) setFieldErrors(prev => ({ ...prev, returnSeat: undefined }));
                            }}
                            className={cn(
                              "flex min-w-0 min-h-[46px] flex-col items-center justify-center rounded-lg px-2 sm:px-4 py-1.5 text-center transition-all cursor-pointer select-none",
                              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                              activeLegTab === "return"
                                ? "border border-primary bg-primary text-primary-foreground shadow-xs font-semibold"
                                : "border border-transparent bg-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground",
                              fieldErrors["returnSeat"] && activeLegTab !== "return" && "border-clay text-clay bg-clay-soft/40",
                            )}
                          >
                            <span className="flex flex-wrap items-center justify-center gap-1.5 text-xs uppercase tracking-wider font-bold">
                              <PlaneLanding className="size-3.5" aria-hidden="true" />
                              <span>{ar ? "٢. العودة" : "2. Return"}</span>
                              <span dir="ltr" className="font-mono text-[10px] opacity-80">
                                ({returnOffering.data?.originCode} → {returnOffering.data?.destinationCode})
                              </span>
                            </span>
                            <span className="text-[11px] font-medium opacity-95 mt-0.5">
                              {returnSeatStatusText}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Inline Seat Validation Errors */}
                    {fieldErrors["outboundSeat"] && activeLegTab === "outbound" && (
                      <p role="alert" className="text-center text-xs font-semibold text-clay">
                        {fieldErrors["outboundSeat"]}
                      </p>
                    )}
                    {fieldErrors["returnSeat"] && activeLegTab === "return" && (
                      <p role="alert" className="text-center text-xs font-semibold text-clay">
                        {fieldErrors["returnSeat"]}
                      </p>
                    )}

                    {/* Internally Scrolling Compact SeatMap Container */}
                    <div
                      ref={seatSectionRef}
                      id={`${fieldId}-seatmap-panel`}
                      tabIndex={-1}
                      className="max-h-[440px] sm:max-h-[500px] overflow-y-auto overscroll-contain rounded-xl border border-border/70 bg-card/40 p-2 sm:p-3 shadow-inner focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {activeLegTab === "outbound" && (
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
                          onSelect={(idx, seatCode) => handleSelectSeat(idx, seatCode)}
                        />
                      )}

                      {activeLegTab === "return" && isRoundTrip && returnOccupancy.data && (
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
                          onSelect={(idx, seatCode) => handleSelectSeat(idx, seatCode)}
                        />
                      )}
                    </div>

                    {/* Mobile Action inside Seat Card */}
                    <div className="lg:hidden flex flex-wrap items-center justify-between gap-3 pt-2">
                      <button
                        type="button"
                        className={btnClass("outline", "sm")}
                        onClick={() => setMobileStep("traveler")}
                      >
                        {ar ? "← السابق: المسافر" : "← Back to Traveler"}
                      </button>
                      <button
                        type="button"
                        className={btnClass("primary", "sm")}
                        onClick={() => {
                          if (!passengers.every(p => p.seatCode)) {
                            setActiveLegTab("outbound");
                            setFieldErrors(prev => ({
                              ...prev,
                              outboundSeat: ar ? "يرجى اختيار مقعد للذهاب." : "Please select an outbound seat.",
                            }));
                            return;
                          }
                          if (isRoundTrip && !passengers.every(p => p.returnSeatCode)) {
                            setActiveLegTab("return");
                            setFieldErrors(prev => ({
                              ...prev,
                              returnSeat: ar ? "يرجى اختيار مقعد للعودة." : "Please select a return seat.",
                            }));
                            return;
                          }
                          setMobileStep("confirm");
                        }}
                      >
                        {ar ? "التالي: المراجعة والتأكيد ←" : "Next: Review & Confirm →"}
                      </button>
                    </div>
                  </Panel>
                </div>
              </div>
            </fieldset>
          </form>

          {/* Accessible Radix OTP Verification Dialog */}
          {!account && (
            <Dialog
              open={isOtpDialogOpen}
              onOpenChange={open => {
                if (pending) return;
                setIsOtpDialogOpen(open);
              }}
            >
              <DialogContent
                className="border border-border bg-card p-6 shadow-xl max-w-md sm:rounded-2xl"
                closeLabel={ar ? "إغلاق" : "Close"}
                onCloseAutoFocus={e => {
                  dialogInvalidFocusRef.current = false;
                  if (pendingFocusRef.current) {
                    e.preventDefault();
                    const targetId = pendingFocusRef.current;
                    const el = document.getElementById(targetId);
                    if (el) {
                      const details = el.closest("details");
          if (details) details.open = true;
          el.focus();
                      if (targetId.includes("tab")) {
                        seatSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                      }
                    }
                    pendingFocusRef.current = null;
                  }
                }}
              >
                <DialogHeader className="space-y-2">
                  <DialogTitle className="text-xl font-bold font-serif text-foreground">
                    {ar ? "رمز التحقق من البريد الإلكتروني" : "Email verification code"}
                  </DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground">
                    {ar
                      ? "أدخل رمز التحقق المكون من ٦ أرقام المُرسل إلى: "
                      : "Enter the 6-digit verification code sent to: "}
                    <bdi dir="ltr" className="font-semibold text-foreground">
                      {emailRef.current || email}
                    </bdi>
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="flex justify-center" dir="ltr">
                    <InputOTP
                      id={`${fieldId}-modal-otp`}
                      maxLength={6}
                      value={guestOtpCode}
                      onChange={code => {
                        setGuestOtpCode(code);
                        if (guestError) setGuestError(null);
                      }}
                      autoComplete="one-time-code"
                      disabled={pending}
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

                  {guestError && (
                    <p role="alert" className="text-center text-sm font-medium text-clay">
                      {guestError}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                    <span>
                      {guestCooldown > 0
                        ? ar
                          ? `إعادة الإرسال بعد ${guestCooldown} ث`
                          : `Resend code in ${guestCooldown}s`
                        : guestResendCount >= MAX_GUEST_RESEND_ATTEMPTS
                          ? ar
                            ? "وصلت للحد الأقصى للمحاولات"
                            : "Max attempts reached"
                          : null}
                    </span>
                    <button
                      type="button"
                      disabled={pending || guestCooldown > 0 || guestResendCount >= MAX_GUEST_RESEND_ATTEMPTS || guestSendingCode}
                      className={cn(
                        "text-xs font-semibold underline underline-offset-4 cursor-pointer hover:text-primary transition-colors",
                        (pending || guestCooldown > 0 || guestResendCount >= MAX_GUEST_RESEND_ATTEMPTS || guestSendingCode) && "opacity-50 pointer-events-none",
                      )}
                      onClick={() => void handleSendGuestCode()}
                    >
                      {guestSendingCode
                        ? (ar ? "جارٍ الإرسال…" : "Sending…")
                        : (ar ? "إعادة إرسال الرمز" : "Resend code")}
                    </button>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      disabled={pending || guestOtpCode.length !== 6 || executingRef.current}
                      className={btnClass("primary", "md", "w-full justify-center")}
                      onClick={() => void confirmBooking(true)}
                    >
                      {pending
                        ? (ar ? "جارٍ التحقق وتأكيد الحجز…" : "Verifying & confirming…")
                        : (ar ? "التحقق وتأكيد الحجز" : "Verify & confirm booking")}
                    </button>
                  </div>

                  <p className="text-[11px] text-center text-muted-foreground">
                    {ar
                      ? "يتم إرسال الرمز عبر البريد الإلكتروني المُجدول. الرمز صالح لـ ١٢ ساعة."
                      : "Verification emails are sent to your inbox. Codes are valid for 12 hours."}
                  </p>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </>
      )}
    </div>
  );
}
