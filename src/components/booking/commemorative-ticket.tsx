/**
 * Gaza Gateway — Dynamic Commemorative E-Ticket / Itinerary Component.
 *
 * EXACT Physical Dimensions: 8 x 3.25 inches = 203.2 x 82.55 mm
 * Landscape Ratio: 32 / 13 = 2.461538
 * Composition: 960 x 390 px reference canvas
 * Distribution: Main 78% (748.8px), Stub 22% (211.2px) with vertical perforation
 *
 * Implements the approved ticket art direction with 100% dynamic, selectable
 * HTML/CSS, strict truth disclosures, bidi RTL/LTR isolation, mobile-friendly
 * detail summary, accessible Radix dialog zoom viewer, and zero mock fallback.
 */

import React, { useState } from "react";
import "./commemorative-ticket.css";
import { useI18n } from "@/lib/i18n";
import type { ReservationDetail } from "@/lib/reservations/client";
import {
  mapTicketPresentation,
  type MappedPassengerTicket,
  type TicketLang,
} from "@/lib/reservations/ticket-presentation";

import logoWebp from "@/assets/media/tickets/gaza-palestinian-airlines-logo.webp";
import terminalPhotoWebp from "@/assets/media/tickets/terminal-concept-clean.webp";
import oliveBranchSvg from "@/assets/media/tickets/olive-branch.svg";
import oliveBranchFooterSvg from "@/assets/media/tickets/olive-branch-footer.svg";
import skylineSvg from "@/assets/media/tickets/architectural-skyline-approximation.svg";
import patternSvg from "@/assets/media/tickets/low-contrast-geometric-pattern.svg";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Maximize2, Printer, Plane } from "lucide-react";

export interface CommemorativeTicketCardProps {
  ticket: MappedPassengerTicket;
  lang: TicketLang;
}

/**
 * Pure physical card rendering with strict 32:13 landscape aspect ratio (8 x 3.25 inches).
 * 78% Main Pass, 22% Perforated Stub with vertical dashed perforation.
 */
export function CommemorativeTicketCard({ ticket, lang }: CommemorativeTicketCardProps) {
  const isRtl = lang === "ar";

  return (
    <article
      className={`gza-ticket ${ticket.isCancelled ? "gza-ticket-cancelled" : ""}`}
      dir={isRtl ? "rtl" : "ltr"}
      lang={lang}
      aria-label={`${ticket.classification} · ${ticket.passengerName} · ${ticket.flightNumber}`}
    >
      {/* Cancellation Banner inside Physical Card */}
      {ticket.isCancelled && (
        <div className="gza-ticket-cancelled-banner-inner" role="status">
          {ticket.statusLabel} —{" "}
          {isRtl
            ? "تم إلغاء هذا الحجز والمقعد محرر"
            : "This reservation is cancelled — seat released"}
        </div>
      )}

      {/* Main Ticket Area (78%) */}
      <div className="gza-ticket-main">
        {/* Row 1: Hero Banner with Future Concept Photo & Airline Branding (125fr) */}
        <section className="gza-ticket-hero">
          <div
            className="gza-ticket-hero-photo"
            style={{ backgroundImage: `url(${terminalPhotoWebp})` }}
            role="img"
            aria-label={isRtl ? "تصميم مبنى مطار غزة" : "Gaza airport terminal architecture"}
          />
          <div
            className={isRtl ? "gza-ticket-hero-overlay-rtl" : "gza-ticket-hero-overlay-ltr"}
            aria-hidden="true"
          />
          <img className="gza-ticket-hero-olive" src={oliveBranchSvg} alt="" aria-hidden="true" />

          <div className="gza-ticket-hero-left">
            <img
              className="gza-ticket-logo"
              src={logoWebp}
              alt={ticket.carrierName}
              width={135}
              height={110}
            />
            <div className="gza-ticket-hero-separator" aria-hidden="true" />
            <div className="gza-ticket-claim">
              <span className="gza-ticket-hub-brand">{ticket.hubName}</span>
              <br />
              PEOPLE · PLACES
              <br />
              A BRIGHTER TOMORROW
              <small className="gza-ticket-claim-sub" lang="ar">
                أكثر من مجرد وجهة
              </small>
            </div>
          </div>

          <div className="gza-ticket-courtesy">
            <strong lang="ar">من غزة إلى العالم</strong>
            <span>FROM GAZA ... TO THE WORLD</span>
          </div>
        </section>

        {/* Row 2: Central Route & Passenger Row (115fr) */}
        <div className="gza-ticket-route-pax">
          <div className="gza-ticket-route-col">
            <div className="gza-ticket-station">
              <div className="gza-ticket-station-label">{isRtl ? "من" : "FROM"}</div>
              <div className="gza-ticket-station-iata" dir="ltr">
                {ticket.originCode}
              </div>
              <div className="gza-ticket-station-city">{ticket.originCity}</div>
            </div>

            <div className="gza-ticket-flight-line" aria-hidden="true">
              <Plane
                className={`gza-ticket-flight-airplane ${isRtl ? "gza-ticket-flight-airplane-rtl" : ""}`}
                aria-hidden="true"
              />
              <span className="gza-ticket-flight-tag" dir="ltr">
                {ticket.flightNumber}
              </span>
            </div>

            <div className="gza-ticket-station gza-ticket-station-dest">
              <div className="gza-ticket-station-label">{isRtl ? "إلى" : "TO"}</div>
              <div className="gza-ticket-station-iata" dir="ltr">
                {ticket.destinationCode}
              </div>
              <div className="gza-ticket-station-city">{ticket.destinationCity}</div>
            </div>
          </div>

          <div className="gza-ticket-pax-col">
            <div className="gza-ticket-field-label">{isRtl ? "المسافر" : "PASSENGER"}</div>
            <div className="gza-ticket-passenger-name" title={ticket.passengerName}>
              {ticket.passengerName}
            </div>
            <div className="gza-ticket-passenger-tag">
              {ticket.passengerTypeLabel} · {ticket.nationality}
            </div>
          </div>
        </div>

        {/* Row 3: Travel Essentials Bar (75fr) */}
        <div className="gza-ticket-essentials">
          <div className="gza-ticket-field">
            <div className="gza-ticket-field-label">{isRtl ? "الرحلة" : "FLIGHT"}</div>
            <div className="gza-ticket-field-value" dir="ltr">
              {ticket.flightNumber}
            </div>
          </div>

          <div className="gza-ticket-field">
            <div className="gza-ticket-field-label">{isRtl ? "التاريخ" : "DATE"}</div>
            <div className="gza-ticket-field-value">{ticket.formattedDate}</div>
          </div>

          <div className="gza-ticket-field">
            <div className="gza-ticket-field-label">{isRtl ? "المغادرة" : "DEPART"}</div>
            <div className="gza-ticket-field-value" dir="ltr">
              {ticket.departTime}
            </div>
          </div>

          <div className="gza-ticket-field">
            <div className="gza-ticket-field-label">{isRtl ? "الوصول" : "ARRIVE"}</div>
            <div className="gza-ticket-field-value" dir="ltr">
              {ticket.arriveTime}
              {ticket.dayOffsetLabel && (
                <span
                  className="gza-ticket-overnight-badge"
                  title={ticket.formattedArrivalDate || undefined}
                >
                  {ticket.dayOffsetLabel}
                </span>
              )}
            </div>
          </div>

          <div className="gza-ticket-field">
            <div className="gza-ticket-field-label">{isRtl ? "المقعد" : "SEAT"}</div>
            <div
              className={`gza-ticket-field-value ${ticket.isCancelled ? "gza-ticket-clay-tag" : ""}`}
              dir={ticket.isCancelled ? undefined : "ltr"}
            >
              {ticket.isCancelled
                ? isRtl
                  ? "تم التحرير"
                  : "RELEASED"
                : ticket.hasAssignedSeat
                  ? ticket.seatCode
                  : "—"}
            </div>
          </div>
        </div>

        {/* Row 4: Decorative Footer Area & Notices (75fr) */}
        <div className="gza-ticket-footer">
          <div
            className="gza-ticket-footer-pattern"
            style={{ backgroundImage: `url(${patternSvg})` }}
            aria-hidden="true"
          />


          <div className="gza-ticket-footer-bar">
            <div className="gza-ticket-footer-verification">
              <div><span className="gza-ticket-footer-meta-label">{isRtl ? "رقم التذكرة" : "TICKET"}</span><bdi dir="ltr">{ticket.ticketNumber}</bdi></div>
              <div><span className="gza-ticket-footer-meta-label">{isRtl ? "مرجع الحجز" : "REFERENCE"}</span><bdi dir="ltr">{ticket.reference}</bdi></div>
            </div>

            <div className="gza-ticket-footer-message">
              <strong lang="ar">رحلات تربط الناس بمستقبل أجمل</strong>
              <small>JOURNEYS THAT BRING US CLOSER</small>
            </div>

            <img
              className="gza-ticket-footer-skyline"
              src={skylineSvg}
              alt=""
              aria-hidden="true"
              title={ticket.skylineNotice}
            />
          </div>
        </div>
      </div>

      {/* Perforated Desktop Stub (22%) */}
      <div
        className={`gza-ticket-stub ${isRtl ? "gza-ticket-stub-rtl" : "gza-ticket-stub-ltr"}`}
      >
        {ticket.isCancelled && <span
          className={`gza-ticket-status-tag ${ticket.isCancelled ? "gza-ticket-status-tag-cancelled" : ""}`}
          role="status"
        >
          {ticket.statusLabel}
        </span>}

        <img className="gza-ticket-stub-logo" src={logoWebp} alt={ticket.carrierName} />

        <div className="gza-ticket-stub-label">{isRtl ? "المسافر" : "PASSENGER"}</div>
        <div className="gza-ticket-stub-value gza-ticket-stub-pax" title={ticket.passengerName}>
          {ticket.passengerName}
        </div>

        <div className="gza-ticket-stub-label">{isRtl ? "الرحلة والمسار" : "FLIGHT & ROUTE"}</div>
        <div className="gza-ticket-stub-route" dir="ltr">
          {ticket.flightNumber} · {ticket.originCode}{" "}
          <Plane
            className={`size-3.5 inline-block ${isRtl ? "-scale-x-100" : ""}`}
            aria-hidden="true"
          />{" "}
          {ticket.destinationCode}
        </div>

        <div className="gza-ticket-stub-label">{isRtl ? "التاريخ" : "DATE"}</div>
        <div className="gza-ticket-stub-value">{ticket.formattedDate}</div>

        <div className="gza-ticket-stub-label">{isRtl ? "المقعد" : "SEAT"}</div>
        <div
          className={`gza-ticket-stub-value ${ticket.isCancelled ? "gza-ticket-clay-tag" : ""}`}
          dir={ticket.isCancelled ? undefined : "ltr"}
        >
          {ticket.isCancelled
            ? isRtl
              ? "تم التحرير"
              : "RELEASED"
            : ticket.hasAssignedSeat
              ? ticket.seatCode
              : "—"}
        </div>

        <div className="gza-ticket-stub-ref-box">
          <div className="gza-ticket-stub-ref-code">
            <span>{isRtl ? "المرجع: " : "REF: "}</span>
            <bdi dir="ltr">{ticket.reference}</bdi>
          </div>
        </div>

        <div className="gza-ticket-stub-band">
          PEOPLE
          <br />
          PLACES
          <br />
          A BRIGHTER TOMORROW
        </div>
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
 * Placed outside the physical pass to keep the 8x3.25 pass clean while ensuring
 * all canonical secondary details (aircraft, meal, timezones, cabin) remain 100% accessible.
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
  const zoomTriggerRef = React.useRef<HTMLButtonElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateScale = () => {
      const width = el.clientWidth;
      if (width > 0) {
        // Physical design canvas is 960px wide
        setScale(Math.min(1, width / 960));
      }
    };

    updateScale();

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        updateScale();
      });
      ro.observe(el);
      return () => ro.disconnect();
    } else {
      window.addEventListener("resize", updateScale);
      return () => window.removeEventListener("resize", updateScale);
    }
  }, []);

  return (
    <div className="gza-ticket-item-container">
      {/* Explicit Cancelled Banner when booking is cancelled (screen-only, card has internal banner for print) */}
      {ticket.isCancelled && (
        <div className="gza-ticket-cancelled-banner print:hidden" role="status">
          {ticket.statusLabel} —{" "}
          {isRtl
            ? "تم إلغاء هذا الحجز (المقعد محرر)"
            : "This reservation has been cancelled — seat released"}
        </div>
      )}

      {/* Action Bar: Zoom Full Size (Print:hidden) */}
      <div className="gza-ticket-actions print:hidden">
        <button
          type="button"
          className="gza-ticket-zoom-btn"
          ref={zoomTriggerRef}
          onClick={() => setZoomOpen(true)}
          aria-label={isRtl ? "عرض التذكرة بالحجم الكامل" : "View ticket full size"}
        >
          <Maximize2 className="size-3.5" aria-hidden="true" />
          <span>
            {isRtl
              ? "تكبير التذكرة (عرض كامل 8 × 3.25 بوصة)"
              : "Full Size View (8 × 3.25 in)"}
          </span>
        </button>
      </div>

      {/* Physical Landscape Ticket (always 32/13 aspect ratio, scaled proportionally) */}
      <div className="gza-ticket-scaler-wrapper" ref={containerRef}>
        <div
          className="gza-ticket-scalable-canvas"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: isRtl ? "top right" : "top left",
          }}
        >
          <CommemorativeTicketCard ticket={ticket} lang={lang} />
        </div>
      </div>

      {/* Mobile-Friendly Booking Detail Summary */}
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
          className="gza-ticket-zoom-dialog max-w-6xl w-[96vw] max-h-[92vh] overflow-y-auto p-4 sm:p-6 bg-[#E7E1D7] border-[#CEC5B7]"
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
                    ? "عرض كامل للتذكرة بالأبعاد الفيزيائية 8 × 3.25 بوصة (203.2 × 82.55 مم). استخدم التمرير الأفقي لمعاينة التفاصيل."
                    : "Full landscape 8 × 3.25 inch (203.2 × 82.55 mm) pass. Scroll horizontally to inspect fine details."}
                </DialogDescription>
              </div>
              <button
                type="button"
                className="gza-ticket-zoom-btn"
                onClick={() => window.print()}
              >
                <Printer className="size-3.5" aria-hidden="true" />
                <span>{isRtl ? "طباعة / حفظ PDF" : "Print / save PDF"}</span>
              </button>
            </div>
          </DialogHeader>

          {/* Horizontally Scrollable High-Res Canvas */}
          <div className="overflow-x-auto py-4 px-1 -webkit-overflow-scrolling-touch">
            <div
              style={{
                width: 960,
                minWidth: 960,
                height: 390,
                aspectRatio: "32 / 13",
                margin: "0 auto",
              }}
            >
              <CommemorativeTicketCard ticket={ticket} lang={lang} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const INLINE_PRINT_STYLE = `
@page {
  size: auto;
  margin: 6mm 3mm;
}
@media print {
  /* Isolate ticket print path and suppress surrounding website chrome when mounted */
  body:has(#mvp-reservation-ticket) header,
  body:has(#mvp-reservation-ticket) footer,
  body:has(#mvp-reservation-ticket) nav,
  body:has(#mvp-reservation-ticket) [data-site-header],
  body:has(#mvp-reservation-ticket) [data-site-footer] {
    display: none !important;
  }
  body:has(#mvp-reservation-ticket) > :not(#mvp-reservation-ticket):not(:has(#mvp-reservation-ticket)),
  body *:has(#mvp-reservation-ticket) > :not(#mvp-reservation-ticket):not(:has(#mvp-reservation-ticket)) {
    display: none !important;
  }
  html, body {
    background: #FFFFFF !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  body:has(#mvp-reservation-ticket) div:has(#mvp-reservation-ticket),
  body:has(#mvp-reservation-ticket) main:has(#mvp-reservation-ticket) {
    display: block !important;
    position: static !important;
    overflow: visible !important;
    transform: none !important;
    margin: 0 !important;
    padding: 0 !important;
    min-height: 0 !important;
    height: auto !important;
    max-width: none !important;
  }

  /* Print root in normal static flow (prevents blank pages and multi-page clipping) */
  #mvp-reservation-ticket {
    position: static !important;
    width: 100% !important;
    margin: 0 auto !important;
    padding: 0 !important;
    background: transparent !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    visibility: visible !important;
  }
  #mvp-reservation-ticket * {
    visibility: visible !important;
  }

  /* Suppress non-printable UI chrome */
  .gza-ticket-zoom-dialog,
  .gza-ticket-actions,
  .gza-ticket-detail-summary,
  .gza-ticket-disclosure-banner,
  .gza-ticket-cancelled-banner {
    display: none !important;
    visibility: hidden !important;
  }

  /* Multi-pass natural pagination: individual tickets do not break internally */
  .gza-ticket-item-container {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    margin: 0 auto 8mm auto !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    width: 203.2mm !important;
  }

  /* Scale 960x390 canvas by exactly 0.8 to fit physical 203.2 x 82.55 mm (768 x 312 CSS px) */
  .gza-ticket-scaler-wrapper {
    max-width: none !important;
    width: 203.2mm !important;
    height: 82.55mm !important;
    aspect-ratio: auto !important;
    overflow: visible !important;
    margin: 0 auto !important;
    position: relative !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }

  .gza-ticket-scalable-canvas {
    position: absolute !important;
    top: 0 !important;
    transform: scale(0.8) !important;
    width: 960px !important;
    height: 390px !important;
  }

  :not([dir="rtl"]) .gza-ticket-scalable-canvas {
    left: 0 !important;
    right: auto !important;
    transform-origin: top left !important;
  }

  [dir="rtl"] .gza-ticket-scalable-canvas,
  :dir(rtl) .gza-ticket-scalable-canvas {
    right: 0 !important;
    left: auto !important;
    transform-origin: top right !important;
  }

  .gza-ticket {
    width: 960px !important;
    height: 390px !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    border: 1px solid #8E8372 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
`;

export interface CommemorativeTicketPrintRegionProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Single, bounded print container for multi-leg or composite ticket layouts.
 * Provides the canonical #mvp-reservation-ticket root and injects print isolation
 * styles only while mounted, preventing layout overlap between legs.
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
      <style>{INLINE_PRINT_STYLE}</style>
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
    <>
      {/* Honest Commemorative Eyebrow Banner */}
      <div className="gza-ticket-disclosure-banner" role="note">
        <strong>{group.classification}</strong>
      </div>

      <div className="space-y-6">
        {group.tickets.map((item) => (
          <CommemorativeTicketItem key={item.ticketNumber} ticket={item} lang={ticketLang} />
        ))}
      </div>
    </>
  );

  if (printRoot) {
    return (
      <div id="mvp-reservation-ticket" className="mvp-reservation-ticket gza-ticket-wrapper">
        <style>{INLINE_PRINT_STYLE}</style>
        {content}
      </div>
    );
  }

  return <div className="mvp-reservation-ticket gza-ticket-wrapper">{content}</div>;
}
