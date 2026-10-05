import { previewBookingTotal, pricingSnapshot, serviceOptions, resolvePreviewSeatLayouts } from "@/lib/commercial/pricing";
import { CommercialCatalogError } from "@/lib/commercial/types";
import { useCommercialOptions } from "@/lib/commercial/queries";
import { CommercialCatalogState } from "@/components/commercial-catalog-state";
import { commercialFarePrice } from "@/lib/commercial/pricing";
import type { FareId } from "@/lib/commercial/types";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CommercialInput,
  AssistanceChoices,
  CommercialSeatPicker,
} from "@/components/admin/commercial-fields";
import {
  validateBookingParty,
  validateBookingContact,
  validateBookingExtras,
} from "@/lib/domain/booking-validation";
import { validateUpdateSeatsAssignments } from "@/lib/domain/seat-validation";
import { commercialErrorKey, commercialFieldErrors } from "@/lib/domain/commercial-errors";
import { Check } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { Field, Input, Select, btnClass } from "@/components/kit";
import {
  AdminChip,
  AdminPageHeader,
  AdminPanel,
  Ltr,
  PermissionButton,
} from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import { destinations, todayISO, addDaysISO, aircraftNameToId, type Flight } from "@/lib/data";
import { getFlightBookability } from "@/lib/booking-rules";
import { bookingTotal } from "@/lib/domain/pricing";
import { money } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { cn } from "@/lib/utils";
import { useFleetQuery, layoutSupportsCabin, parseSeatCode, seatStructurallyAvailable, cabinOfLayoutRow } from "@/lib/fleet";
import {
  useFlightSearchQuery,
  useCreateBookingMutation,
  useBookingsQuery,
  getCanonicalOccupiedSeats,
} from "@/lib/repositories";
import type { Booking, BookingCreateInput } from "@/lib/domain/booking";

export const Route = createFileRoute("/{-$locale}/admin/bookings/new")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/bookings/new",
      en: {
        title: "Create booking — Gaza International Airport administration",
        description: "Staff booking shell for helping a passenger at the desk.",
      },
      ar: {
        title: "إنشاء حجز — إدارة مطار غزة الدولي",
        description: "نموذج حجز للموظفين لمساعدة المسافر على المكتب.",
      },
      noindex: true,
    }),
  component: AdminNewBookingPage,
});

const STEPS = ["a2.nb.step1", "a2.nb.step2", "a2.nb.step3", "a2.nb.step4", "a2.nb.step5"] as const;

interface PassengerFormState {
  type: "adult" | "child" | "infant";
  firstName: string;
  lastName: string;
  dob: string;
  nationality: string;
  document: string;
  withAdult?: number | undefined;
}

function initialPassenger(): PassengerFormState {
  return {
    type: "adult",
    firstName: "",
    lastName: "",
    dob: "",
    nationality: "Palestinian",
    document: "",
  };
}

function AdminNewBookingPage() {
  const { t, lang } = useI18n();
  const commercial = useCommercialOptions();
  const { fares, mealOptions } = commercial;
  const farePrice = (base: number, fare: FareId, cabin: string) => commercial.catalogSnapshot ? commercialFarePrice(commercial.catalogSnapshot, base, fare, cabin) : NaN;
  const { can, toast } = useAdmin();
  const [step, setStep] = useState(0);

  // Stable client submission identity per active attempt
  const [submissionId, setSubmissionId] = useState(
    () => `sub-desk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );

  // Flight search & selection state
  const [date, setDate] = useState(() => addDaysISO(todayISO(), 2));
  const [destinationCode, setDestinationCode] = useState("AMM");
  const [selectedFlightId, setSelectedFlightId] = useState<string>("");

  // Fare selection
  const [fare, setFare] = useState<"essential" | "classic" | "flex">("essential");

  // Passengers & Contact state
  const [passengers, setPassengers] = useState<PassengerFormState[]>([initialPassenger()]);
  const [contact, setContact] = useState({ email: "", phone: "" });

  // Seats & Extras state
  const [seats, setSeats] = useState<Record<string, string>>({});
  const [extrasPax, setExtrasPax] = useState<
    Array<{ extraBags: number; meal: string; assistance: string[] }>
  >([{ extraBags: 0, meal: commercial.catalog?.defaultMealId ?? "standard", assistance: [] }]);

  const initializedCommercial = useRef(false);
  useEffect(() => {
    if (commercial.catalog && !initializedCommercial.current) { initializedCommercial.current = true; setExtrasPax([{extraBags:0,meal:commercial.catalog.defaultMealId,assistance:[]}]); }
  }, [commercial.catalog]);

  // Submission & Success state
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null);
  const [done, setDone] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const mayEdit = can("commercial.edit");
  const createBooking = useCreateBookingMutation();
  const fleetQuery = useFleetQuery();
  const { data: allBookings = [] } = useBookingsQuery();

  // Departures query for Gaza origin
  const { data: availableFlights = [], isLoading: flightsLoading } = useFlightSearchQuery(
    "GZA",
    destinationCode,
    date,
  );
  useEffect(() => {
    if (fleetQuery.isPending || fleetQuery.isError || !fleetQuery.data || !selectedFlightId) return;
    const flight = availableFlights.find(f => f.id === selectedFlightId);
    const layout = flight?.aircraftId ? fleetQuery.data.layouts[flight.aircraftId] : undefined;
    if (!layout || !layoutSupportsCabin(layout, "economy")) {
      setSelectedFlightId(""); setSeats({}); setStep(0); setFormError(t("book.flightCabinUnavailable"));
      return;
    }
    setSeats(previous => Object.fromEntries(Object.entries(previous).filter(([, seat]) => {
      const parsed = parseSeatCode(seat);
      return parsed && seatStructurallyAvailable(layout, seat) && cabinOfLayoutRow(layout, parsed.row) === "economy";
    })));
  }, [fleetQuery.data, fleetQuery.isPending, fleetQuery.isError, selectedFlightId, availableFlights, t]);
  const chosenFlight: Flight | null =
    availableFlights.find((f) => f.id === selectedFlightId) ?? null;

  // Seat-requiring passengers count (adults + children)
  const seatRequiredCount = useMemo(() => {
    return passengers.filter((p) => p.type !== "infant").length || 1;
  }, [passengers]);

  // Evaluate bookability of chosen flight
  const flightBookability = useMemo(() => {
    if (!chosenFlight) return { bookable: false, reason: "flight_missing" };
    return getFlightBookability(chosenFlight, { paxCount: seatRequiredCount });
  }, [chosenFlight, seatRequiredCount]);

  // Candidate booking object for preview pricing
  const previewBooking: Booking | null = useMemo(() => {
    if (!chosenFlight) return null;
    return {
      ref: "PREVIEW",
      createdAt: new Date().toISOString(),
      criteria: {
        tripType: "oneway",
        origin: "GZA",
        destination: chosenFlight.destinationCode,
        departDate: chosenFlight.date,
        returnDate: "",
        adults: passengers.filter((p) => p.type === "adult").length || 1,
        children: passengers.filter((p) => p.type === "child").length,
        infants: passengers.filter((p) => p.type === "infant").length,
        cabin: "economy",
      },
      outbound: chosenFlight,
      inbound: null,
      fareId: fare,
      passengers: passengers.map((p, i) => ({
        ...p,
        id: `pax-PREVIEW-${i}`,
      })),
      seats,
      extras: {
        pax: extrasPax.map((px) => ({
          extraBags: px.extraBags,
          meal: px.meal,
          assistance: px.assistance,
        })),
      },
      contact,
      total: 0,
      status: "confirmed",
      checkedIn: { out: [], in: [] },
      channel: "desk",
      ownerEmail: null,
    };
  }, [chosenFlight, fare, passengers, seats, extrasPax, contact]);

  const previewSeatLayouts = useMemo(
    () => resolvePreviewSeatLayouts(chosenFlight, null, fleetQuery.data),
    [chosenFlight, fleetQuery.data],
  );

  const previewTotal = useMemo(() => {
    if (!previewBooking) return 0;
    return previewBookingTotal(previewBooking, commercial.catalogSnapshot, previewSeatLayouts)?.total ?? NaN;
  }, [previewBooking, commercial.catalogSnapshot, previewSeatLayouts]);

  if (!can("commercial.view")) {
    return <AdminDenied area={t("a2.nb.title")} permission="commercial.view" />;
  }

  if (!commercial.catalog || commercial.query.isError) return <CommercialCatalogState />;
  if (fleetQuery.isError) return <p role="alert" className="text-sm text-status-cancelled">{t("fleet.error.unavailable")}</p>;
  // Step validation helpers
  const validateStep0 = (): string | null => {
    if (fleetQuery.isError || !fleetQuery.data) return t("fleet.error.unavailable");
    if (!chosenFlight) return t("a6.err.flight") || "Please select a flight.";
    if (!flightBookability.bookable) {
      return t(
        flightBookability.reason === "insufficient_seats" || flightBookability.reason === "sold_out"
          ? "a6.err.capacity"
          : "a6.err.flight",
      );
    }
    if (fleetQuery.data?.layouts) {
      const layout = fleetQuery.data.layouts[chosenFlight.aircraftId ?? ""];
      if (!layout || !layoutSupportsCabin(layout, "economy")) {
        return t("book.flightCabinUnavailable") || "The selected cabin class is unavailable on this flight.";
      }
    }
    return null;
  };

  const validateStep1 = (): string | null => {
    try { pricingSnapshot(commercial.catalogSnapshot!,fare,"economy");return null; }catch(error){return t(commercialErrorKey(error));}
  };
  const validateStep2 = (): string | null => {
    try {
      validateBookingParty(passengers);
      validateBookingContact(contact);
      return null;
    } catch (error) {
      return t(commercialErrorKey(error));
    }
  };
  const validateStep3 = (): string | null => {
    try {
      if (!previewBooking || !chosenFlight) return t("a6.err.flight");
      validateBookingExtras({ pax: extrasPax }, passengers.length, commercial.catalog!);
      validateUpdateSeatsAssignments({ ...previewBooking, seats: {} }, seats, {
        outbound: chosenFlight,
        inbound: null,
      });
      return null;
    } catch (error) {
      return t(commercialErrorKey(error));
    }
  };
  const validationForStep = (index: number) =>
    index === 0
      ? validateStep0()
      : index === 1
        ? validateStep1()
        : index === 2
          ? validateStep2()
          : index === 3
            ? validateStep3()
            : null;
  const showValidation = (index: number) => {
    const err = validationForStep(index);
    if (!err) {
      setFormError(null);
      setFieldErrors({});
      return true;
    }
    setFormError(err);
    setFieldErrors({});
    if (index === 2 || index === 3) {
      try {
        if (index === 2) {
          validateBookingParty(passengers);
          validateBookingContact(contact);
        } else if (previewBooking && chosenFlight) {
          validateBookingExtras({ pax: extrasPax }, passengers.length, commercial.catalog!);
          validateUpdateSeatsAssignments({ ...previewBooking, seats: {} }, seats, {
            outbound: chosenFlight,
            inbound: null,
          });
        }
      } catch (error) {
        setFieldErrors(
          Object.fromEntries(
            Object.entries(commercialFieldErrors(error)).map(([key, value]) => [
              key === "email"
                ? "nb-contact-email"
                : key === "phone"
                  ? "nb-contact-phone"
                  : key.startsWith("out-")
                    ? `pax-${key.slice(4)}-seat`
                    : key.replace(/^pax\.(\d+)\.meal$/, "nb-meal-$1").replace(/^pax\.(\d+)\.extraBags$/, "nb-bags-$1"),
              value,
            ]),
          ),
        );
      }
    }
    requestAnimationFrame(() => {
      const node =
        document.querySelector<HTMLElement>('[aria-invalid="true"]') ??
        document.getElementById("nb-errors");
      node?.focus();
    });
    return false;
  };
  const handleNext = () => {
    if (showValidation(step)) setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const handleCreate = () => {
    if (!mayEdit || createBooking.isPending) return;
    for (let index = 0; index < 4; index++) {
      if (!showValidation(index)) {
        setStep(index);
        return;
      }
    }

    if (!chosenFlight) return;
    const input: BookingCreateInput = {
      criteria: {
        tripType: "oneway",
        origin: "GZA",
        destination: chosenFlight.destinationCode,
        departDate: chosenFlight.date,
        returnDate: "",
        adults: passengers.filter((p) => p.type === "adult").length,
        children: passengers.filter((p) => p.type === "child").length,
        infants: passengers.filter((p) => p.type === "infant").length,
        cabin: "economy",
      },
      outbound: chosenFlight,
      inbound: null,
      fareId: fare,
      passengers: passengers.map((p) => ({
        type: p.type,
        firstName: p.firstName.trim(),
        lastName: p.lastName.trim(),
        dob: p.dob.trim(),
        nationality: p.nationality.trim() || "Palestinian",
        document: p.document.trim(),
        withAdult: p.withAdult,
      })),
      seats,
      extras: {
        pax: extrasPax.map((px) => ({
          extraBags: px.extraBags,
          meal: px.meal,
          assistance: px.assistance,
        })),
      },
      contact: {
        email: contact.email.trim(),
        phone: contact.phone.trim(),
      },
      total: previewTotal,
      channel: "desk",
      ownerEmail: null,
      submissionId,
    };

    createBooking.mutate(input, {
      onSuccess: (res) => {
        setCreatedBooking(res);
        setDone(true);
        toast(t("a2.nb.successTitle"));
      },
      onError: (e) => {
        if (e instanceof CommercialCatalogError) setStep(e.reason === "service_unavailable" ? 3 : 1);
        const msg = t(commercialErrorKey(e));
        setFormError(msg);
        setFieldErrors({});
        toast(msg);
      },
    });
  };

  const handleReset = () => {
    setDone(false);
    setCreatedBooking(null);
    setStep(0);
    setSubmissionId(`sub-desk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    setPassengers([initialPassenger()]);
    setContact({ email: "", phone: "" });
    setSelectedFlightId("");
    setFieldErrors({});
    setSeats({});
    setExtrasPax([{ extraBags: 0, meal: commercial.catalog?.defaultMealId ?? "standard", assistance: [] }]);
    setFormError(null);
  };

  if (done && createdBooking) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={t("a2.nb.title")} description={t("a2.nb.sub")} />
        <AdminPanel title={t("a2.nb.successTitle")}>
          <div className="space-y-4 text-center sm:py-6">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-deep">
              <Check className="size-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("a2.nb.pnrCreated")}</p>
              <Ltr className="text-3xl font-extrabold tracking-wider">{createdBooking.ref}</Ltr>
              <div className="mt-2 flex items-center justify-center gap-2">
                <AdminChip tone="brand">{t("a2.channel.desk") || "Desk"}</AdminChip>
                <span className="text-xs text-muted-foreground">
                  <Ltr>{`${createdBooking.outbound.number} · GZA → ${createdBooking.outbound.destinationCode}`}</Ltr>
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
              <AppLink
                to="/admin/bookings/$ref"
                params={{ ref: createdBooking.ref }}
                className={btnClass("primary", "sm")}
              >
                {t("a2.nb.viewBooking")}
              </AppLink>
              <AppLink
                to="/manage/$ref"
                params={{ ref: createdBooking.ref }}
                className={btnClass("outline", "sm")}
              >
                {t("nav.manage")}
              </AppLink>
              <button type="button" onClick={handleReset} className={btnClass("ghost", "sm")}>
                {t("a2.nb.another")}
              </button>
            </div>
          </div>
        </AdminPanel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("a2.nb.title")}
        description={t("a2.nb.sub")}
        meta={
          <div className="flex items-center gap-2">
            <AdminChip tone="brand">{t("a2.channel.desk") || "Desk"}</AdminChip>
            <span className="text-xs text-muted-foreground">
              {t("search.oneWay")} · {t("a6.counter.economy")}
            </span>
          </div>
        }
      />

      <AdminPanel title={t("a6.counter.form")} bodyClassName="p-0">
        <ol className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-5">
          {STEPS.map((k, i) => {
            const isCurrent = step === i;
            const isCompleted = step > i;
            return (
              <li key={k} className="bg-card">
                <button
                  type="button"
                  onClick={() => {
                    if (i < step) {
                      setStep(i);
                    } else if (i > step) {
                      handleNext();
                    }
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 p-3 text-start text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    isCurrent
                      ? "text-brand"
                      : isCompleted
                        ? "text-foreground hover:bg-secondary/40"
                        : "text-muted-foreground opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                      isCurrent
                        ? "bg-brand text-brand-foreground"
                        : isCompleted
                          ? "bg-brand-soft text-brand-deep"
                          : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {isCompleted ? <Check className="size-3" /> : i + 1}
                  </span>
                  <span className="truncate">{t(k)}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="p-4">
          {formError ? (
            <div
              id="nb-errors"
              tabIndex={-1}
              role="alert"
              className="mb-4 rounded-md bg-status-cancelled/15 p-3 text-xs text-status-cancelled"
            >
              {formError}
            </div>
          ) : null}

          {step === 0 ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("flights.date")} htmlFor="nb-date">
                  <Input
                    id="nb-date"
                    type="date"
                    dir="ltr"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value || todayISO());
                      setSelectedFlightId("");
                    }}
                  />
                </Field>
                <Field label={t("search.to")} htmlFor="nb-dest">
                  <Select
                    id="nb-dest"
                    value={destinationCode}
                    onChange={(e) => {
                      setDestinationCode(e.target.value);
                      setSelectedFlightId("");
                    }}
                  >
                    {destinations
                      .filter((d) => d.code !== "GZA")
                      .map((d) => (
                        <option key={d.code} value={d.code}>
                          {d.code} · {pick(lang, d.city)}
                        </option>
                      ))}
                  </Select>
                </Field>
              </div>

              {flightsLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {t("a2.bk.loading")}
                </div>
              ) : availableFlights.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  {t("a2.none")}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {t("adm.fl.title")}: <Ltr>GZA → {destinationCode}</Ltr> (
                    {availableFlights.length})
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {availableFlights.map((f) => {
                      const bookability = getFlightBookability(f, { paxCount: seatRequiredCount });
                      const layout = f.aircraftId && !fleetQuery.isError && fleetQuery.data?.layouts ? fleetQuery.data.layouts[f.aircraftId] : undefined;
                      const supportsCabin = Boolean(layout && layoutSupportsCabin(layout, "economy"));
                      const isBookable = bookability.bookable && supportsCabin;
                      const isSelected = chosenFlight?.id === f.id;
                      return (
                        <label
                          key={f.id}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-md border p-3 text-xs transition",
                            isSelected
                              ? "border-brand bg-brand-soft/30 shadow-xs"
                              : "border-border hover:bg-secondary/40",
                            !isBookable && "opacity-50 cursor-not-allowed",
                          )}
                        >
                          <input
                            type="radio"
                            name="nb-flight-choice"
                            checked={isSelected}
                            disabled={!isBookable}
                            onChange={() => setSelectedFlightId(f.id)}
                            className="size-4 text-brand focus:ring-brand"
                          />
                          <div className="min-w-0">
                            <span className="block font-bold">
                              <Ltr>{`${f.number} · ${f.departTime} → ${f.arriveTime}`}</Ltr>
                            </span>
                            <span className="block text-muted-foreground">
                              {f.aircraft} · {t("a2.se.gates")} {f.gate || "—"}
                            </span>
                            {!isBookable ? (
                              <span className="block text-status-cancelled font-semibold">
                                {!supportsCabin
                                  ? (t("book.flightCabinUnavailable") || "Cabin unavailable")
                                  : t(
                                      bookability.reason === "insufficient_seats" ||
                                        bookability.reason === "sold_out"
                                        ? "a6.err.capacity"
                                        : "a6.err.flight",
                                    )}
                              </span>
                            ) : null}
                          </div>
                          <Ltr className="ms-auto font-semibold">
                            {money(farePrice(f.basePrice, "essential", "economy"), lang)}
                          </Ltr>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground">{t("a2.nb.step2")}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {fares.filter(f=>f.active && f.allowedCabins.includes("economy")).sort((a,b)=>a.order-b.order).map((f) => {
                  const base = chosenFlight?.basePrice ?? 180;
                  const price = farePrice(base, f.id, "economy");
                  const isSelected = fare === f.id;
                  return (
                    <label
                      key={f.id}
                      className={cn(
                        "flex cursor-pointer flex-col justify-between rounded-md border p-3 text-xs transition",
                        isSelected
                          ? "border-brand bg-brand-soft/30 shadow-xs ring-1 ring-brand"
                          : "border-border hover:bg-secondary/40",
                      )}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <input
                            type="radio"
                            name="nb-fare-choice"
                            value={f.id}
                            checked={isSelected}
                            onChange={() => setFare(f.id)}
                            className="size-4 text-brand focus:ring-brand"
                          />
                          <span className="font-bold">{pick(lang, f.name)}</span>
                        </div>
                        <p className="text-muted-foreground text-[11px]">
                          {pick(lang, f.flexibility)}
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-border flex items-baseline justify-between font-bold">
                        <span className="text-muted-foreground text-[11px]">
                          {t("a6.counter.economy")}
                        </span>
                        <Ltr>{money(price, lang)}</Ltr>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  {t("a2.bd.tab.passengers")} ({passengers.length})
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className={btnClass("outline", "sm")}
                    onClick={() => {
                      if (passengers.length < 9) {
                        setPassengers([...passengers, initialPassenger()]);
                        setExtrasPax([
                          ...extrasPax,
                          { extraBags: 0, meal: commercial.catalog?.defaultMealId ?? "standard", assistance: [] },
                        ]);
                      }
                    }}
                  >
                    + {t("a2.bd.passenger")}
                  </button>
                  {passengers.length > 1 ? (
                    <button
                      type="button"
                      className={btnClass("ghost", "sm")}
                      onClick={() => {
                        const next = passengers.slice(0, -1);
                        setPassengers(next);
                        setExtrasPax(extrasPax.slice(0, -1));
                        setSeats((current) =>
                          Object.fromEntries(
                            Object.entries(current).filter(
                              ([key]) => key !== `out-${passengers.length - 1}`,
                            ),
                          ),
                        );
                      }}
                    >
                      - {t("a2.cancel")}
                    </button>
                  ) : null}
                </div>
              </div>

              {passengers.map((p, i) => (
                <div key={i} className="space-y-3 rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground">
                      {`${t("a2.bd.passenger")} ${i + 1}`}
                    </span>
                    <Select
                      value={p.type}
                      onChange={(e) => {
                        const next = [...passengers];
                        const newType = e.target.value as "adult" | "child" | "infant";
                        next[i] = {
                          ...next[i]!,
                          type: newType,
                          withAdult: newType === "infant" ? 0 : undefined,
                        };
                        setPassengers(next);
                      }}
                      className="w-auto text-xs py-1"
                    >
                      <option value="adult">{t("a2.bd.type.adult")}</option>
                      <option value="child">{t("a2.bd.type.child")}</option>
                      <option value="infant">{t("a2.bd.type.infant")}</option>
                    </Select>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label={t("book.firstName")} htmlFor={`pax-${i}-fn`}>
                      <CommercialInput
                        aria-required="true"
                        id={`pax-${i}-fn`}
                        error={fieldErrors[`pax-${i}-fn`]}
                        value={p.firstName}
                        onChange={(e) => {
                          const next = [...passengers];
                          next[i] = { ...next[i]!, firstName: e.target.value };
                          setPassengers(next);
                        }}
                        placeholder={t("book.firstName")}
                      />
                    </Field>
                    <Field label={t("book.lastName")} htmlFor={`pax-${i}-ln`}>
                      <CommercialInput
                        aria-required="true"
                        id={`pax-${i}-ln`}
                        error={fieldErrors[`pax-${i}-ln`]}
                        value={p.lastName}
                        onChange={(e) => {
                          const next = [...passengers];
                          next[i] = { ...next[i]!, lastName: e.target.value };
                          setPassengers(next);
                        }}
                        placeholder={t("book.lastName")}
                      />
                    </Field>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <Field label={t("a2.bd.dob")} htmlFor={`pax-${i}-dob`}>
                      <CommercialInput
                        aria-required="true"
                        id={`pax-${i}-dob`}
                        error={fieldErrors[`pax-${i}-dob`]}
                        dir="ltr"
                        type="date"
                        value={p.dob}
                        onChange={(e) => {
                          const next = [...passengers];
                          next[i] = { ...next[i]!, dob: e.target.value };
                          setPassengers(next);
                        }}
                      />
                    </Field>
                    <Field label={t("a2.bd.document")} htmlFor={`pax-${i}-doc`}>
                      <CommercialInput
                        id={`pax-${i}-doc`}
                        error={fieldErrors[`pax-${i}-doc`]}
                        dir="ltr"
                        value={p.document}
                        onChange={(e) => {
                          const next = [...passengers];
                          next[i] = { ...next[i]!, document: e.target.value.trim().toUpperCase() };
                          setPassengers(next);
                        }}
                        placeholder="P1234567"
                      />
                    </Field>
                    <Field label={t("book.nationality")} htmlFor={`pax-${i}-nat`}>
                      <CommercialInput
                        id={`pax-${i}-nat`}
                        error={fieldErrors[`pax-${i}-nat`]}
                        value={p.nationality}
                        onChange={(e) => {
                          const next = [...passengers];
                          next[i] = { ...next[i]!, nationality: e.target.value };
                          setPassengers(next);
                        }}
                        placeholder="Palestinian"
                      />
                    </Field>
                  </div>

                  {p.type === "infant" ? (
                    <Field label={t("a2.ci.infant")} htmlFor={`pax-${i}-adult`}>
                      <Select
                        id={`pax-${i}-adult`}
                        aria-invalid={Boolean(fieldErrors[`pax-${i}-adult`])}
                        aria-describedby={
                          fieldErrors[`pax-${i}-adult`] ? `pax-${i}-adult-error` : undefined
                        }
                        value={p.withAdult ?? 0}
                        onChange={(e) => {
                          const next = [...passengers];
                          next[i] = { ...next[i]!, withAdult: parseInt(e.target.value, 10) || 0 };
                          setPassengers(next);
                        }}
                      >
                        {passengers.map((ap, aIdx) => {
                          if (ap.type !== "adult") return null;
                          return (
                            <option key={aIdx} value={aIdx}>
                              {ap.firstName || ap.lastName
                                ? `${ap.firstName} ${ap.lastName}`
                                : `${t("a2.bd.type.adult")} ${aIdx + 1}`}
                            </option>
                          );
                        })}
                      </Select>
                      {fieldErrors[`pax-${i}-adult`] ? (
                        <p id={`pax-${i}-adult-error`} className="mt-1 text-xs text-destructive">
                          {t(fieldErrors[`pax-${i}-adult`]!)}
                        </p>
                      ) : null}
                    </Field>
                  ) : null}
                </div>
              ))}

              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground">{t("a2.bd.contact")}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label={t("a2.nb.contactEmail")} htmlFor="nb-contact-email">
                    <CommercialInput
                      error={fieldErrors["nb-contact-email"]}
                      id="nb-contact-email"
                      dir="ltr"
                      type="email"
                      value={contact.email}
                      onChange={(e) => setContact({ ...contact, email: e.target.value })}
                      placeholder="passenger@example.com"
                    />
                  </Field>
                  <Field label={t("a2.nb.contactPhone")} htmlFor="nb-contact-phone">
                    <CommercialInput
                      error={fieldErrors["nb-contact-phone"]}
                      id="nb-contact-phone"
                      dir="ltr"
                      value={contact.phone}
                      onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                      placeholder="+970 59 000 0000"
                    />
                  </Field>
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-muted-foreground">{t("a2.bd.tab.seats")}</p>
              <p className="text-xs text-muted-foreground">{t("commercial.baggageInfo",{kg:commercial.catalog.baggage.cabinKg,dims:commercial.catalog.baggage.cabinDims,checked:commercial.catalog.baggage.checkedKg})} · {money(commercial.catalog.baggage.extraBagPrice,lang)} · {pick(lang,commercial.catalog.baggage.note)}</p>
              {passengers.map((p, i) => (
                <div key={i} className="space-y-3 rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">
                      {p.firstName || p.lastName
                        ? `${p.firstName} ${p.lastName}`
                        : `${t("book.passenger")} ${i + 1}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t(`a2.bd.type.${p.type}`)}
                    </span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    {p.type !== "infant" ? (
                      <Field label={t("a2.bd.seat")} htmlFor={`pax-${i}-seat`}>
                        <CommercialInput
                          id={`pax-${i}-seat`}
                          error={fieldErrors[`pax-${i}-seat`]}
                          dir="ltr"
                          placeholder="12A"
                          value={seats[`out-${i}`] || ""}
                          onChange={(e) =>
                            setSeats({
                              ...seats,
                              [`out-${i}`]: e.target.value.trim().toUpperCase(),
                            })
                          }
                        />
                      </Field>
                    ) : (
                      <div className="text-xs text-muted-foreground flex items-center">
                        {t("a2.ci.infant")}
                      </div>
                    )}
                    <Field label={t("a2.bd.bags")} htmlFor={`pax-${i}-bags`}>
                      <CommercialInput
                        id={`pax-${i}-bags`}
                        error={fieldErrors[`pax-${i}-bags`]}
                        dir="ltr"
                        type="number"
                        min={0}
                        max={5}
                        value={extrasPax[i]?.extraBags ?? 0}
                        onChange={(e) => {
                          const next = [...extrasPax];
                          next[i] = {
                            ...next[i]!,
                            extraBags: Math.max(0, Math.min(5, parseInt(e.target.value, 10) || 0)),
                          };
                          setExtrasPax(next);
                        }}
                      />
                    </Field>
                    <Field label={t("a2.bd.meal")} htmlFor={`nb-meal-${i}`} error={fieldErrors[`nb-meal-${i}`] ? t(fieldErrors[`nb-meal-${i}`]!) : undefined} errorId={`nb-meal-${i}-error`}>
                      <Select
                        id={`nb-meal-${i}`}
                        aria-invalid={fieldErrors[`nb-meal-${i}`] ? true : undefined}
                        aria-describedby={fieldErrors[`nb-meal-${i}`] ? `nb-meal-${i}-error` : undefined}
                        value={extrasPax[i]?.meal ?? "standard"}
                        onChange={(e) => {
                          const next = [...extrasPax];
                          next[i] = { ...next[i]!, meal: e.target.value };
                          setExtrasPax(next);
                        }}
                      >
                        {serviceOptions(mealOptions,[extrasPax[i]?.meal ?? ""]).map((m) => (
                          <option key={m.id} value={m.id} disabled={!m.active}>
                            {pick(lang, m.label)}{!m.active ? ` · ${t("commercial.retired")}` : ""}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  {p.type !== "infant" ? (
                    <CommercialSeatPicker
                      flight={chosenFlight}
                      cabin="economy"
                      seats={seats}
                      leg="out"
                      paxIndex={i}
                      passengerLabels={passengers.map((p) => `${p.firstName} ${p.lastName}`)}
                      layout={
                        fleetQuery.data && chosenFlight
                          ? fleetQuery.data.layouts[
                              chosenFlight.aircraftId ||
                                (chosenFlight.aircraft ? aircraftNameToId(chosenFlight.aircraft) ?? "" : "")
                            ]
                          : undefined
                      }
                      occupiedSeats={
                        chosenFlight
                          ? getCanonicalOccupiedSeats(allBookings, chosenFlight.id)
                          : undefined
                      }
                      onSelect={(seat) =>
                        setSeats((current) => ({ ...current, [`out-${i}`]: seat }))
                      }
                    />
                  ) : null}
                  <AssistanceChoices
                      retained={extrasPax[i]?.assistance ?? []}
                    value={extrasPax[i]?.assistance ?? []}
                    onChange={(assistance) =>
                      setExtrasPax((current) =>
                        current.map((x, index) => (index === i ? { ...x, assistance } : x)),
                      )
                    }
                  />
                </div>
              ))}
            </div>
          ) : null}

          {step === 4 && chosenFlight ? (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-muted-foreground">{t("a2.nb.step5")}</p>
              <dl className="grid gap-3 rounded-md border border-border p-4 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground font-semibold">{t("adm.fl.title")}</dt>
                  <dd className="font-bold text-sm">
                    <Ltr>{`${chosenFlight.number} · GZA → ${chosenFlight.destinationCode}`}</Ltr>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-semibold">{t("flights.date")}</dt>
                  <dd>
                    <Ltr>{`${chosenFlight.date} · ${chosenFlight.departTime}`}</Ltr>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-semibold">{t("a2.nb.step2")}</dt>
                  <dd>
                    {pick(lang, fares.find((f) => f.id === fare)?.name ?? { en: fare, ar: fare })}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-semibold">
                    {t("a2.bd.tab.passengers")}
                  </dt>
                  <dd>
                    {passengers.map((p, idx) => (
                      <span key={idx} className="block">
                        {p.firstName} {p.lastName} ({t(`a2.bd.type.${p.type}`)})
                        {seats[`out-${idx}`] ? ` · ${t("a2.bd.seat")}: ${seats[`out-${idx}`]}` : ""}
                      </span>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-semibold">{t("a2.bd.contact")}</dt>
                  <dd>
                    <Ltr>{contact.email || "—"}</Ltr>
                    {contact.phone ? (
                      <span className="block">
                        <Ltr>{contact.phone}</Ltr>
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-semibold">
                    {t("a2.channel.desk") || "Channel"}
                  </dt>
                  <dd>
                    <AdminChip tone="brand">{t("a2.channel.desk") || "Desk"}</AdminChip>
                  </dd>
                </div>
                <div className="sm:col-span-2 pt-3 border-t border-border flex items-baseline justify-between">
                  <dt className="text-sm font-bold">{t("a2.bk.total")}</dt>
                  <dd className="text-lg font-extrabold text-brand">
                    <Ltr>{Number.isFinite(previewTotal) ? money(previewTotal, lang) : t("commercial.noFare")}</Ltr>
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className={btnClass("outline", "sm")}
          >
            {t("a2.nb.prev")}
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={createBooking.isPending}
              className={btnClass("primary", "sm")}
            >
              {step === 0
                ? t("a2.nb.nextFare")
                : step === 1
                  ? t("a2.nb.nextPax")
                  : step === 2
                    ? t("a2.nb.nextSeats")
                    : t("a2.nb.nextReview")}
            </button>
          ) : (
            <PermissionButton
              allowed={mayEdit && !createBooking.isPending}
              reason={t("adm.edit.readOnly")}
              variant="primary"
              onClick={handleCreate}
            >
              {createBooking.isPending ? t("a2.bk.loading") : t("a2.nb.issueDesk")}
            </PermissionButton>
          )}
        </div>
      </AdminPanel>
    </div>
  );
}
