/**
 * Gaza Gateway — Approved Commemorative E-Ticket / Itinerary Component.
 *
 * EXACT Canvas Dimensions: 1774 x 887 px (2:1 aspect ratio).
 * Artwork: Exact unchanged approved 1774x887 transparent PNG background
 * (ticket-blank-approved.png) with dynamic 2D canvas overlay calibrated to
 * exact reserved white spaces from the approved specification.
 *
 * Supersedes the legacy 32:13 (960 x 390) HTML reconstruction.
 *
 * Engineering invariants:
 * - Unchanged approved 1774x887 blank PNG asset.
 * - Dynamic canvas overlay uses exact calibrated demo pixel coordinates.
 * - Uniform scaling across all viewport widths (320px to 4K).
 * - Full accessible text summary preserved in DOM with ARIA roles.
 * - Keyboard accessible Radix Dialog full-size zoom viewer.
 * - Client-side high-resolution (1774x887) transparent PNG export download.
 * - Print layout: A4 portrait and landscape, natural pagination, no clipping.
 * - 100% data truthfulness: real confirmed reservation data, truthful cancelled
 *   representation, no fabricated gate/seat/cabin or barcode.
 * - One ticket per passenger and flight leg.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import "./commemorative-ticket.css";
import { useI18n } from "@/lib/i18n";
import type { ReservationDetail } from "@/lib/reservations/client";
import {
  mapTicketPresentation,
  formatTicketDate,
  extractPassengerNames,
  TICKET_CANVAS_WIDTH,
  TICKET_CANVAS_HEIGHT,
  preloadTicketImage,
  type TicketLoadState,
  type MappedPassengerTicket,
  type TicketLang,
} from "@/lib/reservations/ticket-presentation";

import ticketBlankApprovedPng from "@/assets/media/tickets/ticket-blank-approved.png";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Maximize2, Printer, Download } from "lucide-react";

// Spec typography & colors from approved demo
const INK = "#123b35";
const MUTED = "#192d30";
const CLAY = "#A92D32";
const FONT_LATIN = '"Gza Ticket Latin", sans-serif';
const FONT_ARABIC = '"Gza Ticket Arabic", sans-serif';

interface TypeOpts {
  x: number;
  y: number;
  maxWidth: number;
  size?: number;
  minSize?: number;
  weight?: number | string;
  color?: string;
  align?: CanvasTextAlign;
  font?: string;
  dir?: "ltr" | "rtl";
}

function typeText(ctx: CanvasRenderingContext2D, str: string | null | undefined, opts: TypeOpts): void {
  if (!str) return;
  const {
    x,
    y,
    maxWidth,
    size = 26,
    minSize = 14,
    weight = 700,
    color = INK,
    align = "left",
    font = FONT_LATIN,
    dir = "ltr",
  } = opts;

  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.direction = dir;
  ctx.fillStyle = color;

  const s = String(str);
  let px = size;
  while (px > minSize) {
    ctx.font = `${weight} ${px}px ${font}`;
    if (ctx.measureText(s).width <= maxWidth) break;
    px -= 1;
  }
  ctx.font = `${weight} ${px}px ${font}`;
  ctx.fillText(s, x, y, maxWidth);
  ctx.restore();
}

function latinText(ctx: CanvasRenderingContext2D, s: string | null | undefined, o: TypeOpts): void {
  typeText(ctx, String(s || "").toLocaleUpperCase("en-US"), o);
}

function bilingualCities(
  ctx: CanvasRenderingContext2D,
  city: string,
  arabic: string | undefined,
  x: number,
  cityY: number,
  maxWidth: number
): void {
  const value = (city || "").trim();
  typeText(ctx, value, { x, y: cityY, size: 24, maxWidth, weight: 650, color: MUTED, font: FONT_LATIN });
  if (arabic && arabic.trim()) {
    ctx.save();
    ctx.font = `650 24px ${FONT_LATIN}`;
    const used = Math.min(ctx.measureText(value).width, maxWidth - 80);
    ctx.restore();
    typeText(ctx, arabic.trim(), {
      x: x + used + 14,
      y: cityY - 1,
      size: 22,
      minSize: 15,
      maxWidth: Math.max(60, maxWidth - used - 14),
      weight: 600,
      color: MUTED,
      font: FONT_ARABIC,
      dir: "rtl",
    });
  }
}

/**
 * Pure canvas painter using exact coordinates from owner-approved specification demo.
 */
function drawTicketOnCanvas(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | null,
  ticket: MappedPassengerTicket,
  lang: TicketLang = "en"
): void {
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  const W = TICKET_CANVAS_WIDTH;
  const H = TICKET_CANVAS_HEIGHT;

  ctx.clearRect(0, 0, W, H);

  // Background approved artwork
  if (image && image.complete && image.naturalWidth > 0) {
    ctx.drawImage(image, 0, 0, W, H);
  }

  const isRtl = lang === "ar";
  const isCancelled = ticket.isCancelled;

  // Passenger names (Latin & Arabic separation)
  const paxNames = extractPassengerNames(ticket.passengerName);
  const fromCity = (ticket.originCityEn || ticket.originCity || "").toUpperCase();
  const fromCityArabic = ticket.originCityAr || "";
  const toCity = (ticket.destinationCityEn || ticket.destinationCity || "").toUpperCase();
  const toCityArabic = ticket.destinationCityAr || "";

  // 1. Flight route: native pixel coordinates calibrated for 1774×887 artwork
  latinText(ctx, ticket.originCode, { x: 96, y: 522, maxWidth: 230, size: 75, minSize: 45, weight: 800, color: INK });
  latinText(ctx, ticket.destinationCode, { x: 569, y: 522, maxWidth: 230, size: 75, minSize: 45, weight: 800, color: INK });
  bilingualCities(ctx, fromCity, fromCityArabic, 96, 558, 240);
  bilingualCities(ctx, toCity, toCityArabic, 571, 558, 340);

  // 2. Lower information row: each column bounded by the pre-printed gold rules
  const gateValue = (ticket as unknown as { gateCode?: string }).gateCode || "—";
  const seatValue = isCancelled
    ? (isRtl ? "تم التحرير" : "RELEASED")
    : (ticket.hasAssignedSeat ? ticket.seatCode : "—");
  const cabinValue = ticket.cabin || "—";
  const dateValue = formatTicketDate(ticket.date, lang) || ticket.formattedDate;

  const cols: Array<[string, number, number, number, number, string?]> = [
    [ticket.flightNumber, 115, 653, 135, 34],
    [dateValue, 285, 653, 165, 28],
    [ticket.departTime, 482, 653, 190, 34],
    [gateValue, 717, 653, 136, 34],
    [seatValue, 895, 653, 155, 34, isCancelled ? CLAY : MUTED],
    [cabinValue, 1082, 653, 213, 29],
  ];

  for (const [value, colX, colY, colW, colSize, colorOverride] of cols) {
    const isValAr = /[\u0600-\u06FF]/.test(value);
    typeText(ctx, value, {
      x: colX,
      y: colY,
      maxWidth: colW,
      size: colSize,
      minSize: 16,
      color: colorOverride || MUTED,
      weight: 750,
      font: isValAr ? FONT_ARABIC : FONT_LATIN,
      dir: isValAr ? "rtl" : "ltr",
    });
  }

  // 3. Passenger and trip repetition on the detachable right stub
  // Dynamic labels use selected language only (approved baked art stays unchanged)
  const paxLabel = isRtl ? "المسافر" : "PASSENGER";
  typeText(ctx, paxLabel, {
    x: 1390,
    y: 356,
    maxWidth: 226,
    size: 15,
    minSize: 12,
    color: MUTED,
    weight: 700,
    font: isRtl ? FONT_ARABIC : FONT_LATIN,
    dir: isRtl ? "rtl" : "ltr",
  });

  if (paxNames.latin && paxNames.arabic) {
    latinText(ctx, paxNames.latin, { x: 1390, y: 390, maxWidth: 226, size: 27, minSize: 16, color: INK, weight: 800 });
    typeText(ctx, paxNames.arabic, {
      x: 1390,
      y: 415,
      maxWidth: 218,
      size: 18,
      minSize: 13,
      weight: 600,
      color: MUTED,
      font: FONT_ARABIC,
      dir: "rtl",
    });
  } else if (paxNames.arabic && !paxNames.latin) {
    typeText(ctx, paxNames.arabic, {
      x: 1390,
      y: 390,
      maxWidth: 226,
      size: 25,
      minSize: 15,
      weight: 800,
      color: INK,
      font: FONT_ARABIC,
      dir: "rtl",
    });
  } else {
    // Pure Latin, non-Latin (Cyrillic, Greek, CJK, etc.) or any full name: preserve all data!
    const fullName = paxNames.fullName || ticket.passengerName;
    const hasAr = /[\u0600-\u06FF]/.test(fullName);
    typeText(ctx, fullName, {
      x: 1390,
      y: 390,
      maxWidth: 226,
      size: 27,
      minSize: 15,
      weight: 800,
      color: INK,
      font: hasAr ? FONT_ARABIC : FONT_LATIN,
      dir: hasAr ? "rtl" : "ltr",
    });
  }

  const flightLabel = isRtl ? "الرحلة" : "FLIGHT";
  typeText(ctx, flightLabel, {
    x: 1390,
    y: 440,
    maxWidth: 200,
    size: 15,
    minSize: 12,
    weight: 700,
    color: MUTED,
    font: isRtl ? FONT_ARABIC : FONT_LATIN,
    dir: isRtl ? "rtl" : "ltr",
  });
  latinText(ctx, ticket.flightNumber, { x: 1390, y: 471, maxWidth: 200, size: 27, minSize: 16, weight: 800, color: INK });
  latinText(ctx, ticket.originCode, { x: 1390, y: 555, maxWidth: 86, size: 33, minSize: 20, weight: 800, color: INK });
  latinText(ctx, ticket.destinationCode, { x: 1545, y: 555, maxWidth: 73, size: 33, minSize: 20, weight: 800, color: INK });
  typeText(ctx, dateValue, {
    x: 1390,
    y: 638,
    maxWidth: 226,
    size: 25,
    minSize: 14,
    weight: 740,
    color: MUTED,
    font: isRtl ? FONT_ARABIC : FONT_LATIN,
    dir: isRtl ? "rtl" : "ltr",
  });
  typeText(ctx, seatValue, {
    x: 1390,
    y: 696,
    maxWidth: 108,
    size: 25,
    minSize: 15,
    weight: 750,
    color: isCancelled ? CLAY : MUTED,
    font: isCancelled && isRtl ? FONT_ARABIC : FONT_LATIN,
    dir: isCancelled && isRtl ? "rtl" : "ltr",
  });
  typeText(ctx, cabinValue, { x: 1480, y: 696, maxWidth: 111, size: 23, minSize: 13, weight: 750, color: MUTED });

  // 4. Dynamic booking reference inside the intentionally reserved lower-left panel
  const refLabel = isRtl ? "مرجع الحجز" : "BOOKING REFERENCE";
  typeText(ctx, refLabel, {
    x: 108,
    y: 733,
    maxWidth: 340,
    size: 17,
    minSize: 13,
    weight: 600,
    color: "#56665f",
    font: isRtl ? FONT_ARABIC : FONT_LATIN,
    dir: isRtl ? "rtl" : "ltr",
  });
  latinText(ctx, ticket.reference, { x: 109, y: 773, maxWidth: 340, size: 37, minSize: 19, weight: 800, color: INK });

  // 5. Stub scanner area intentionally blank: no fake operational barcode, no sample disclaimer

  // 6. Truthful cancellation representation (no confirmation status on confirmed art)
  if (isCancelled) {
    ctx.save();
    // Authoritative single-language banner across the top
    ctx.fillStyle = CLAY;
    ctx.fillRect(0, 0, W, 44);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `800 17px ${isRtl ? FONT_ARABIC : FONT_LATIN}`;
    ctx.direction = isRtl ? "rtl" : "ltr";
    const cancelBannerText = isRtl
      ? "ملغى · تم إلغاء هذا الحجز والمقعد محرر"
      : "CANCELLED · RESERVATION CANCELLED — SEAT RELEASED";
    ctx.fillText(cancelBannerText, W / 2, 22);
    ctx.restore();
  }
}

/**
 * Downloads a high-resolution 1774x887 transparent PNG directly from canvas.
 */
function downloadTicketPng(
  canvas: HTMLCanvasElement | null,
  reference: string,
  passengerName: string
): void {
  if (!canvas) return;
  const safeRef = (reference || "sample").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 32);
  const safePax = (passengerName || "passenger").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 24);
  const filename = `gaza-airport-ticket-${safeRef}-${safePax}.png`;

  if (typeof canvas.toBlob === "function") {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.download = filename;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  } else {
    const a = document.createElement("a");
    a.download = filename;
    a.href = canvas.toDataURL("image/png");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

export interface CommemorativeTicketCardProps {
  ticket: MappedPassengerTicket;
  lang: TicketLang;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  onStateChange?: (state: TicketLoadState) => void;
}

/**
 * Physical card rendering with exact 2:1 landscape aspect ratio (1774 x 887 px).
 * Renders the unchanged approved background PNG with the dynamic canvas overlay.
 */
export function CommemorativeTicketCard({
  ticket,
  lang,
  onCanvasReady,
  onStateChange,
}: CommemorativeTicketCardProps) {
  const isRtl = lang === "ar";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loadState, setLoadState] = useState<TicketLoadState>("loading");
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    let cancelled = false;
    setLoadState("loading");
    onStateChange?.("loading");

    // Canvas-only faces are not requested by document.fonts.ready on their own.
    // Load both scripts before painting so PNGs and the server use bundled fonts.
    const fontPromise = typeof document !== "undefined" && document.fonts
      ? Promise.all([
          document.fonts.load(`700 27px ${FONT_LATIN}`, "PASSENGER"),
          document.fonts.load(`400 24px ${FONT_LATIN}`, "GZA"),
          document.fonts.load(`700 25px ${FONT_ARABIC}`, "المسافر"),
          document.fonts.load(`400 22px ${FONT_ARABIC}`, "غزة"),
        ]).then((faces) => {
          if (faces.some((loaded) => loaded.length === 0)) {
            throw new Error("Ticket font unavailable");
          }
        })
      : Promise.resolve();

    const imagePromise = preloadTicketImage(ticketBlankApprovedPng);

    Promise.all([imagePromise, fontPromise])
      .then(([img]) => {
        if (cancelled || !isMountedRef.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        drawTicketOnCanvas(canvas, img, ticket, lang);
        setLoadState("ready");
        onStateChange?.("ready");
        onCanvasReady?.(canvas);
      })
      .catch((err) => {
        if (cancelled || !isMountedRef.current) return;
        console.error("Ticket artwork loading failed:", err);
        setLoadState("error");
        onStateChange?.("error");
      });

    return () => {
      cancelled = true;
      isMountedRef.current = false;
    };
  }, [ticket, lang, onCanvasReady, onStateChange]);

  return (
    <article
      className={`gza-ticket-card-root ${ticket.isCancelled ? "is-cancelled" : ""}`}
      dir={isRtl ? "rtl" : "ltr"}
      lang={lang}
      aria-label={`${ticket.classification} · ${ticket.passengerName} · ${ticket.flightNumber}`}
    >
      {/* Visible Error Notification on Load Failure */}
      {loadState === "error" && (
        <div className="gza-ticket-error-notice" role="alert">
          {isRtl
            ? "تعذر تحميل قالب التذكرة المعتمد. يرجى تحديث الصفحة."
            : "Unable to load approved ticket background artwork. Please refresh the page."}
        </div>
      )}

      {/* Scalable High-Res Ticket Canvas */}
      <div className="gza-ticket-canvas-wrapper" aria-busy={loadState === "loading"}>
        <canvas
          ref={canvasRef}
          width={TICKET_CANVAS_WIDTH}
          height={TICKET_CANVAS_HEIGHT}
          className="gza-ticket-canvas"
          role="img"
          aria-label={`${ticket.classification} · ${ticket.passengerName} · ${ticket.flightNumber} · ${ticket.originCode} to ${ticket.destinationCode} · ${ticket.formattedDate}`}
        >
          {/* Accessible fallback text for screen readers */}
          <p>
            {ticket.classification}: {ticket.passengerName}, Flight {ticket.flightNumber},{" "}
            {ticket.originCode} ({ticket.originCity}) to {ticket.destinationCode} ({ticket.destinationCity}),{" "}
            Date: {ticket.formattedDate}, Departure: {ticket.departTime},{" "}
            Seat: {ticket.isCancelled ? "Released" : ticket.hasAssignedSeat ? ticket.seatCode : "Unassigned"},{" "}
            Reference: {ticket.reference}.
          </p>
        </canvas>
      </div>
    </article>
  );
}

export interface BookingDetailSummaryProps {
  ticket: MappedPassengerTicket;
  lang: TicketLang;
}

/**
 * Mobile-friendly reservation and travel detail summary.
 * Placed outside the physical pass to keep the pass clean while ensuring
 * all canonical secondary details remain 100% accessible to screen readers.
 */
export function BookingDetailSummary({ ticket, lang }: BookingDetailSummaryProps) {
  const isRtl = lang === "ar";

  return (
    <div
      className="gza-ticket-detail-summary"
      role="region"
      aria-label={isRtl ? "تفاصيل الحجز الإضافية" : "Additional Reservation Details"}
    >
      <div className="gza-ticket-detail-header">
        <div className="gza-ticket-detail-title">
          <h3>{isRtl ? "ملخص بيانات التذكرة والرحلة" : "Reservation & Travel Details"}</h3>
          <span className="gza-ticket-detail-ref">
            {isRtl ? "المرجع" : "REF"}: <bdi dir="ltr">{ticket.reference}</bdi>
          </span>
        </div>
        <span
          className={`gza-ticket-detail-status ${ticket.isCancelled ? "is-cancelled" : "is-confirmed"}`}
        >
          {ticket.statusLabel}
        </span>
      </div>

      <div className="gza-ticket-detail-grid">
        {/* Full passenger name & type */}
        <div className="gza-ticket-detail-cell">
          <span className="gza-ticket-detail-label">
            {isRtl ? "اسم المسافر الكامل" : "Full Passenger Name"}
          </span>
          <span className="gza-ticket-detail-val font-semibold">{ticket.passengerName}</span>
          <span className="gza-ticket-detail-sub">
            {ticket.passengerTypeLabel} · {ticket.nationality}
          </span>
        </div>

        {/* Route & Stations */}
        <div className="gza-ticket-detail-cell">
          <span className="gza-ticket-detail-label">
            {isRtl ? "المسار والمحطات" : "Route & Stations"}
          </span>
          <span className="gza-ticket-detail-val" dir="ltr">
            {ticket.originCode} ({ticket.originCity}) → {ticket.destinationCode} (
            {ticket.destinationCity})
          </span>
          <span className="gza-ticket-detail-sub">
            {ticket.originAirport} → {ticket.destinationAirport}
          </span>
        </div>

        {/* Schedule & Timing */}
        <div className="gza-ticket-detail-cell">
          <span className="gza-ticket-detail-label">
            {isRtl ? "المواعيد والتوقيت" : "Schedule & Timings"}
          </span>
          <span className="gza-ticket-detail-val" dir="ltr">
            {ticket.departTime}
            {ticket.originTimezone ? ` (${ticket.originTimezone})` : ""} →{" "}
            {ticket.arriveTime}
            {ticket.destinationTimezone ? ` (${ticket.destinationTimezone})` : ""}{" "}
            {ticket.dayOffsetLabel && (
              <span className="gza-ticket-clay-tag font-bold">({ticket.dayOffsetLabel})</span>
            )}
          </span>
          <span className="gza-ticket-detail-sub">
            <span dir="ltr">{ticket.formattedDate}</span>
            {ticket.formattedArrivalDate && ticket.formattedArrivalDate !== ticket.formattedDate
              ? ` · ${isRtl ? "تاريخ الوصول: " : "Arrival Date: "}${ticket.formattedArrivalDate}`
              : ""}
          </span>
        </div>

        {/* Seat Assignment */}
        <div className="gza-ticket-detail-cell">
          <span className="gza-ticket-detail-label">
            {isRtl ? "المقعد المحدد" : "Seat Assignment"}
          </span>
          <span
            className={`gza-ticket-detail-val ${ticket.isCancelled ? "gza-ticket-clay-tag font-semibold" : ""}`}
            dir={ticket.isCancelled || !ticket.hasAssignedSeat ? undefined : "ltr"}
          >
            {ticket.isCancelled
              ? isRtl
                ? "تم تحرير المقعد"
                : "Seat released"
              : ticket.hasAssignedSeat
                ? ticket.seatCode
                : isRtl
                  ? "غير محدد"
                  : "Unassigned"}
          </span>
          <span className="gza-ticket-detail-sub">
            {ticket.isCancelled
              ? isRtl
                ? "الحجز ملغي وتم تحرير تخصيص المقعد"
                : "Reservation cancelled; seat assignment released"
              : ticket.hasAssignedSeat
                ? isRtl
                  ? "مقعد محدد في الحجز"
                  : "Assigned seat in reservation"
                : isRtl
                  ? "لم يتم تحديد مقعد عند الحجز"
                  : "No seat was selected at booking"}
          </span>
        </div>

        {/* Meal Selection */}
        <div className="gza-ticket-detail-cell">
          <span className="gza-ticket-detail-label">
            {isRtl ? "الوجبة المختارة" : "Meal Selection"}
          </span>
          <span className="gza-ticket-detail-val">{ticket.mealLabel}</span>
          <span className="gza-ticket-detail-sub">
            {isRtl ? "اختيار الوجبة" : "Meal preference"}
          </span>
        </div>

        {/* Aircraft Model (only if present in canonical data) */}
        {ticket.aircraftModel && (
          <div className="gza-ticket-detail-cell">
            <span className="gza-ticket-detail-label">
              {isRtl ? "طراز الطائرة" : "Aircraft Model"}
            </span>
            <span className="gza-ticket-detail-val" dir="ltr">
              {ticket.aircraftModel}
            </span>
            <span className="gza-ticket-detail-sub">
              {isRtl ? "الأسطول المجدول" : "Scheduled fleet specification"}
            </span>
          </div>
        )}

        {/* Cabin (only if present in canonical data) */}
        {ticket.cabin && (
          <div className="gza-ticket-detail-cell">
            <span className="gza-ticket-detail-label">{isRtl ? "الدرجة" : "Cabin Class"}</span>
            <span className="gza-ticket-detail-val">{ticket.cabin}</span>
            <span className="gza-ticket-detail-sub">
              {isRtl ? "درجة السفر" : "Travel class"}
            </span>
          </div>
        )}

        {/* E-Ticket Identification */}
        <div className="gza-ticket-detail-cell">
          <span className="gza-ticket-detail-label">
            {isRtl ? "رقم التذكرة الإلكترونية" : "E-Ticket Number"}
          </span>
          <span className="gza-ticket-detail-val font-mono" dir="ltr">
            {ticket.ticketNumber}
          </span>
          <span className="gza-ticket-detail-sub">
            {isRtl ? "معرّف التذكرة" : "Ticket identifier"}
          </span>
        </div>
      </div>
    </div>
  );
}

export interface CommemorativeTicketItemProps {
  ticket: MappedPassengerTicket;
  lang: TicketLang;
}

export function CommemorativeTicketItem({ ticket, lang }: CommemorativeTicketItemProps) {
  const isRtl = lang === "ar";
  const [zoomOpen, setZoomOpen] = useState(false);
  const zoomTriggerRef = useRef<HTMLButtonElement>(null);
  const activeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ticketReady, setTicketReady] = useState(false);

  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement) => {
    activeCanvasRef.current = canvas;
  }, []);

  const handleStateChange = useCallback((state: TicketLoadState) => {
    setTicketReady(state === "ready");
  }, []);

  const handleDownload = useCallback(() => {
    if (!ticketReady || !activeCanvasRef.current) return;
    downloadTicketPng(activeCanvasRef.current, ticket.reference, ticket.passengerName);
  }, [ticketReady, ticket.reference, ticket.passengerName]);

  const handlePrint = useCallback(() => {
    if (!ticketReady) return;
    window.print();
  }, [ticketReady]);

  return (
    <div className="gza-ticket-item-container">
      {/* Explicit Cancelled Status Banner (screen-only) */}
      {ticket.isCancelled && (
        <div className="gza-ticket-cancelled-banner print:hidden" role="status">
          {ticket.statusLabel} —{" "}
          {isRtl
            ? "تم إلغاء هذا الحجز (المقعد محرر)"
            : "This reservation has been cancelled — seat released"}
        </div>
      )}

      {/* Action Bar: Zoom, Download PNG, Print (Print:hidden) */}
      <div className="gza-ticket-actions print:hidden">
        <button
          type="button"
          className="gza-ticket-zoom-btn"
          ref={zoomTriggerRef}
          onClick={() => setZoomOpen(true)}
          disabled={!ticketReady}
          aria-label={isRtl ? "عرض التذكرة بالحجم الكامل" : "View ticket full size"}
        >
          <Maximize2 className="size-3.5" aria-hidden="true" />
          <span>
            {isRtl ? "عرض كامل (1774 × 887)" : "Full Size View (1774 × 887)"}
          </span>
        </button>

        <button
          type="button"
          className="gza-ticket-zoom-btn"
          onClick={handleDownload}
          disabled={!ticketReady}
          aria-label={isRtl ? "تحميل صورة التذكرة بدقة كاملة" : "Download ticket image in full resolution"}
        >
          <Download className="size-3.5" aria-hidden="true" />
          <span>{isRtl ? "تحميل PNG" : "Download PNG"}</span>
        </button>

        <button
          type="button"
          className="gza-ticket-zoom-btn"
          onClick={handlePrint}
          disabled={!ticketReady}
          aria-label={isRtl ? "طباعة أو حفظ التذكرة كملف PDF" : "Print or save ticket as PDF"}
        >
          <Printer className="size-3.5" aria-hidden="true" />
          <span>{isRtl ? "طباعة / PDF" : "Print / PDF"}</span>
        </button>
      </div>

      {/* Pure 2:1 Physical Canvas Ticket */}
      <CommemorativeTicketCard
        ticket={ticket}
        lang={lang}
        onCanvasReady={handleCanvasReady}
        onStateChange={handleStateChange}
      />

      {/* Mobile-Friendly Accessible Booking Detail Summary */}
      <BookingDetailSummary ticket={ticket} lang={lang} />

      {/* Accessible Zoom Modal Dialog */}
      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent
          dir={isRtl ? "rtl" : "ltr"}
          lang={lang}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            zoomTriggerRef.current?.focus();
          }}
          className="gza-ticket-zoom-dialog max-w-6xl w-[96vw] max-h-[92vh] overflow-y-auto p-4 sm:p-6 bg-[#FCF9F2] border-[#CEC5B7]"
          closeLabel={isRtl ? "إغلاق" : "Close"}
        >
          <DialogHeader>
            <div className="flex flex-wrap items-center justify-between gap-3 pe-8">
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-[#23372D]">
                  {ticket.classification} · {ticket.passengerName}
                </DialogTitle>
                <DialogDescription className="text-xs text-[#5B625D]">
                  {isRtl
                    ? "معاينة كاملة للتذكرة بالأبعاد المعتمدة 1774 × 887 بكسل بنسبة 2:1."
                    : "Full 2:1 approved commemorative ticket pass (1774 × 887 native pixels)."}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="gza-ticket-zoom-btn"
                  onClick={handleDownload}
                  disabled={!ticketReady}
                >
                  <Download className="size-3.5" aria-hidden="true" />
                  <span>{isRtl ? "تحميل PNG" : "Download PNG"}</span>
                </button>
                <button
                  type="button"
                  className="gza-ticket-zoom-btn"
                  onClick={handlePrint}
                  disabled={!ticketReady}
                >
                  <Printer className="size-3.5" aria-hidden="true" />
                  <span>{isRtl ? "طباعة / حفظ PDF" : "Print / save PDF"}</span>
                </button>
              </div>
            </div>
          </DialogHeader>

          {/* High-Res View Container */}
          <div className="overflow-x-auto py-4 px-1" tabIndex={0} role="region" aria-label={isRtl ? "عرض التذكرة كاملة" : "Full ticket viewer"}>
            <div className="min-w-[760px]">
            <CommemorativeTicketCard
              ticket={ticket}
              lang={lang}
              onCanvasReady={handleCanvasReady}
            />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export interface CommemorativeTicketPrintRegionProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Single, bounded print container for multi-leg or composite ticket layouts.
 * Provides the canonical #mvp-reservation-ticket root.
 */
export function CommemorativeTicketPrintRegion({
  children,
  className = "",
}: CommemorativeTicketPrintRegionProps) {
  return (
    <div
      id="mvp-reservation-ticket"
      className={`mvp-reservation-ticket gza-ticket-print-region ${className}`.trim()}
    >
      {children}
    </div>
  );
}

export interface CommemorativeTicketProps {
  data: ReservationDetail;
  printRoot?: boolean;
}

export function CommemorativeTicket({ data, printRoot = true }: CommemorativeTicketProps) {
  const { lang } = useI18n();
  const ticketLang: TicketLang = lang === "ar" ? "ar" : "en";
  const group = mapTicketPresentation(data, ticketLang);

  const content = (
    <div className="space-y-6">
      {group.tickets.map((item) => (
        <CommemorativeTicketItem key={item.ticketNumber} ticket={item} lang={ticketLang} />
      ))}
    </div>
  );

  if (printRoot) {
    return (
      <div id="mvp-reservation-ticket" className="mvp-reservation-ticket gza-ticket-wrapper">
        {content}
      </div>
    );
  }

  return <div className="mvp-reservation-ticket gza-ticket-wrapper">{content}</div>;
}
