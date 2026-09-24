/**
 * Gaza Gateway — Surface Lab Production Specimens
 *
 * Authored specimens rendering the 7 required semantic archetypes for
 * deterministic, truthful Baseline vs. Gaza Surface Grammar comparison:
 *
 * 1. Flight Option (operational)
 * 2. Fare Option (fare)
 * 3. Trip Manifest / Summary (dossier)
 * 4. Passenger Form Sheet (form-sheet)
 * 5. Travel Guide Plate (guide)
 * 6. Airport Chapter / Future Editorial Card (editorial)
 * 7. Booking Review Dossier (dossier)
 *
 * Baseline mode (forceGrammar=false): faithfully renders current production anatomy
 * (standard rounded-xl border border-border bg-card without surface indexing or rail).
 * Grammar mode (forceGrammar=true): renders authored Gaza Surface Grammar primitives
 * (GazaSurface, SurfaceRail, SurfaceIndex, SurfaceLedger, SurfaceMedia, SurfaceDatum).
 */

import { useState } from "react";
import { ArrowRight, Check, Compass, Plane } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { MEDIA, smallestSrc } from "@/lib/media";
import { cn } from "@/lib/utils";
import {
  GazaSurface,
  SurfaceDatum,
  SurfaceIndex,
  SurfaceLedger,
  SurfaceLedgerRow,
  SurfaceLedgerTotal,
  SurfaceMedia,
  SurfaceRule,
  type SurfaceRecipe,
} from "@/design/surfaces";

interface SpecimenProps {
  forceGrammar: boolean;
  recipe?: SurfaceRecipe;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Flight Option Specimen (operational)
// ─────────────────────────────────────────────────────────────────────────────

export function FlightOptionSpecimen({ forceGrammar, recipe }: SpecimenProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [selected, setSelected] = useState(true);

  return (
    <div data-surface-specimen="operational.flight-option" className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-wider">
          {isAr ? "خيارات الرحلات (تشغيلي)" : "Flight Options (Operational)"}
        </span>
        <button
          type="button"
          onClick={() => setSelected(!selected)}
          className="text-xs font-medium text-brand hover:underline"
        >
          {selected
            ? isAr
              ? "تبديل إلى غير محدد"
              : "Toggle Unselected"
            : isAr
              ? "تبديل إلى محدد"
              : "Toggle Selected"}
        </button>
      </div>

      {!forceGrammar ? (
        /* Baseline Flight Option: authentic current card anatomy without SurfaceIndex */
        <div
          data-specimen-mode="baseline"
          className={cn(
            "relative block w-full rounded-xl border border-border bg-card p-4 sm:p-5 text-start transition-all",
            selected && "border-primary ring-2 ring-primary/30",
          )}
        >
          {selected ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-xl bg-brand-soft/20"
            />
          ) : null}

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4 sm:gap-6">
              <div>
                <p className="code-id text-2xl font-bold" dir="ltr">
                  10:30
                </p>
                <span className="text-xs text-muted-foreground font-mono" dir="ltr">
                  GZA
                </span>
              </div>
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <span className="numeral text-xs">{isAr ? "1س 15د" : "1h 15m"}</span>
                <span aria-hidden="true" className="flex w-16 items-center gap-1 sm:w-24">
                  <span className="h-px flex-1 bg-border" />
                  <Plane className="size-3.5 rtl:-scale-x-100" />
                  <span className="h-px flex-1 bg-border" />
                </span>
                <span className="text-xs">{isAr ? "مباشر" : "Non-stop"}</span>
              </div>
              <div>
                <p className="code-id text-2xl font-bold" dir="ltr">
                  11:45
                </p>
                <span className="text-xs text-muted-foreground font-mono" dir="ltr">
                  AMM
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
              <div className="text-start sm:text-end">
                <p className="text-lg font-bold" dir="ltr">
                  $140
                </p>
                <p className="text-xs text-muted-foreground">
                  {isAr ? "لكل مسافر" : "per passenger"}
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-secondary/60 text-muted-foreground hover:border-primary/50",
                )}
              >
                <span
                  className={cn(
                    "size-3.5 rounded-full border-2 flex items-center justify-center shrink-0",
                    selected ? "border-primary-foreground" : "border-muted-foreground",
                  )}
                >
                  {selected ? (
                    <span className="block size-1.5 rounded-full bg-primary-foreground" />
                  ) : null}
                </span>
                <span>
                  {selected
                    ? isAr
                      ? "تم الاختيار"
                      : "Selected"
                    : isAr
                      ? "اختيار"
                      : "Select"}
                </span>
              </span>
            </div>
          </div>

          <div className="relative mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground font-mono" dir="ltr">
              PS 204
            </span>
            <span>Embraer 190</span>
            <span>{isAr ? "غزة الدولي → عمّان QAIA" : "Gaza Intl → Amman QAIA"}</span>
            <span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-foreground">
              {isAr ? "مجدولة" : "Scheduled"}
            </span>
            <span className="numeral">{isAr ? "4 مقاعد متبقية" : "4 seats left"}</span>
          </div>
        </div>
      ) : (
        /* Gaza Surface Grammar Flight Option: authored rail, SurfaceIndex, SurfaceDatum, elevation */
        <GazaSurface
          family="operational"
          recipe={recipe}
          forceGrammar={true}
          selected={selected}
          data-specimen-mode="grammar"
          className="p-4 sm:p-5"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3">
              <div className="flex items-center justify-between">
                <SurfaceIndex
                  code="PS 204"
                  label={isAr ? "ذهاب · مؤكد" : "Outbound · Confirmed"}
                  accent={recipe?.accent ?? "brand"}
                />
                <span className="rounded bg-brand/10 px-2 py-0.5 text-[11px] font-mono font-medium text-brand">
                  {isAr ? "مجدولة" : "Scheduled"}
                </span>
              </div>

              <div className="flex items-center gap-4 sm:gap-8">
                <div className="flex flex-col">
                  <span className="text-xl sm:text-2xl font-bold tracking-tight text-foreground" dir="ltr">
                    10:30
                  </span>
                  <span className="font-semibold text-xs text-foreground" dir="ltr">
                    GZA
                  </span>
                  <span className="text-[11px] text-muted-foreground truncate max-w-[100px]">
                    {isAr ? "غزة الدولي" : "Gaza Intl"}
                  </span>
                </div>

                <SurfaceDatum
                  originCode="GZA"
                  destinationCode="AMM"
                  duration={isAr ? "1س 15د" : "1h 15m"}
                />

                <div className="flex flex-col">
                  <span className="text-xl sm:text-2xl font-bold tracking-tight text-foreground" dir="ltr">
                    11:45
                  </span>
                  <span className="font-semibold text-xs text-foreground" dir="ltr">
                    AMM
                  </span>
                  <span className="text-[11px] text-muted-foreground truncate max-w-[100px]">
                    {isAr ? "عمّان الملكة علياء" : "Amman QAIA"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground border-t border-border/40 pt-2">
                <span className="font-medium text-foreground">Embraer 190</span>
                <span>·</span>
                <span>{isAr ? "مباشر" : "Non-stop"}</span>
                <span>·</span>
                <span>{isAr ? "حقيبة مقصورة 7 كغ" : "1 × 7 kg cabin bag"}</span>
                <span>·</span>
                <span className="numeral">{isAr ? "4 مقاعد متبقية" : "4 seats left"}</span>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border/60 pt-3 sm:flex-col sm:items-end sm:justify-center sm:border-t-0 sm:border-s sm:border-border/60 sm:ps-6 sm:pt-0">
              <div className="text-start sm:text-end">
                <span className="text-xs text-muted-foreground block">
                  {isAr ? "ابتداءً من" : "from"}
                </span>
                <span className="text-2xl font-bold text-foreground" dir="ltr">
                  $140
                </span>
              </div>

              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors mt-2",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                )}
              >
                {selected ? (
                  <>
                    <Check className="size-3.5" />
                    <span>{isAr ? "تم الاختيار" : "Selected"}</span>
                  </>
                ) : (
                  <span>{isAr ? "اختيار" : "Select"}</span>
                )}
              </span>
            </div>
          </div>
        </GazaSurface>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Fare Option Specimen (fare)
// ─────────────────────────────────────────────────────────────────────────────

export function FareOptionSpecimen({ forceGrammar, recipe }: SpecimenProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [selectedFare, setSelectedFare] = useState<"01" | "02" | "03">("02");

  const fares = [
    {
      id: "01" as const,
      index: "01",
      nameEn: "Essential",
      nameAr: "الأساسية",
      price: "$140",
      featuresEn: ["1 × 7 kg cabin bag", "Standard seat at check-in", "Changes for $40 fee"],
      featuresAr: ["حقيبة يد 7 كغ", "مقعد عادي عند تسجيل الوصول", "تغيير الحجز برسم 40$"],
      recommended: false,
    },
    {
      id: "02" as const,
      index: "02",
      nameEn: "Classic",
      nameAr: "الكلاسيكية",
      price: "$180",
      featuresEn: [
        "1 × 7 kg cabin + 1 × 23 kg checked",
        "Free standard seat selection",
        "Flexible date change ($15 fee)",
      ],
      featuresAr: [
        "حقيبة مقصورة 7 كغ + حقيبة 23 كغ",
        "اختيار مجاني للمقعد العادي",
        "تغيير مرن للرحلة برسم 15$",
      ],
      recommended: true,
    },
    {
      id: "03" as const,
      index: "03",
      nameEn: "Flex",
      nameAr: "المرنة",
      price: "$240",
      featuresEn: [
        "1 × 7 kg cabin + 2 × 23 kg checked",
        "Any seat free (including Extra Legroom)",
        "Free unlimited changes & refund",
      ],
      featuresAr: [
        "حقيبة مقصورة 7 كغ + حقيبتان 23 كغ",
        "أي مقعد مجاناً شامل المساحة الإضافية",
        "تعديل واسترجاع مجاني بالكامل",
      ],
      recommended: false,
    },
  ];

  return (
    <div data-surface-specimen="fare.fare-option" className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-wider">
          {isAr ? "خيارات الأسعار (فئة الأسعار)" : "Fare Options (Fare)"}
        </span>
      </div>

      {!forceGrammar ? (
        /* Baseline Fare Options: 3 white cards with plain names, pill badge, no SurfaceIndex */
        <div data-specimen-mode="baseline" className="grid gap-3 sm:grid-cols-3">
          {fares.map((f) => {
            const isSelected = selectedFare === f.id;

            return (
              <div
                key={f.id}
                onClick={() => setSelectedFare(f.id)}
                className={cn(
                  "relative flex flex-col justify-between rounded-xl border border-border bg-card p-4 text-start transition-all cursor-pointer",
                  isSelected
                    ? "border-primary ring-2 ring-primary/30 shadow-xs"
                    : "hover:border-primary/50",
                )}
              >
                {isSelected ? (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-xl bg-brand-soft/20"
                  />
                ) : null}

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-bold text-foreground">
                      {isAr ? f.nameAr : f.nameEn}
                    </h4>
                    {f.recommended ? (
                      <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
                        {isAr ? "موصى بها" : "Recommended"}
                      </span>
                    ) : null}
                  </div>

                  <div>
                    <span className="text-2xl font-bold text-foreground" dir="ltr">
                      {f.price}
                    </span>
                    <span className="text-xs text-muted-foreground ms-1">
                      {isAr ? "/ مسافر" : "/ pax"}
                    </span>
                  </div>

                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    {(isAr ? f.featuresAr : f.featuresEn).map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <Check className="size-3.5 shrink-0 text-primary mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4 pt-3 border-t border-border">
                  <span
                    className={cn(
                      "block w-full text-center rounded-lg py-1.5 text-xs font-semibold transition-colors",
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                    )}
                  >
                    {isSelected
                      ? isAr
                        ? "تم الاختيار"
                        : "Selected"
                      : isAr
                        ? "اختيار الفئة"
                        : "Select Fare"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Gaza Surface Grammar Fare Options: unified indexed trio, SurfaceIndex, coordinated rail */
        <div data-specimen-mode="grammar" className="grid gap-3 sm:grid-cols-3">
          {fares.map((f) => {
            const isSelected = selectedFare === f.id;

            return (
              <GazaSurface
                key={f.id}
                family="fare"
                recipe={recipe}
                forceGrammar={true}
                selected={isSelected}
                onClick={() => setSelectedFare(f.id)}
                className="flex flex-col justify-between p-4 cursor-pointer"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <SurfaceIndex
                      code={f.index}
                      label={isAr ? f.nameAr : f.nameEn}
                      accent={f.recommended ? "brand" : "none"}
                    />
                    {f.recommended ? (
                      <span className="rounded bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand uppercase tracking-wider">
                        {isAr ? "موصى بها" : "Recommended"}
                      </span>
                    ) : null}
                  </div>

                  <div>
                    <span className="text-2xl font-bold text-foreground" dir="ltr">
                      {f.price}
                    </span>
                    <span className="text-xs text-muted-foreground ms-1">
                      {isAr ? "/ مسافر" : "/ pax"}
                    </span>
                  </div>

                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    {(isAr ? f.featuresAr : f.featuresEn).map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <Check className="size-3.5 shrink-0 text-brand mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4 pt-3 border-t border-border/60">
                  <span
                    className={cn(
                      "block w-full text-center rounded py-1.5 text-xs font-semibold transition-colors",
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                    )}
                  >
                    {isSelected
                      ? isAr
                        ? "تم الاختيار"
                        : "Selected"
                      : isAr
                        ? "اختيار الفئة"
                        : "Select Fare"}
                  </span>
                </div>
              </GazaSurface>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Trip Manifest / Summary Specimen (dossier)
// ─────────────────────────────────────────────────────────────────────────────

export function TripSummarySpecimen({ forceGrammar, recipe }: SpecimenProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  return (
    <div data-surface-specimen="dossier.trip-summary" className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-wider">
          {isAr ? "ملخص وثيقة الحجز (ملف / مستند)" : "Trip Manifest & Summary (Dossier)"}
        </span>
      </div>

      {!forceGrammar ? (
        /* Baseline Trip Summary: standard white card, plain table layout, no SurfaceIndex */
        <div
          data-specimen-mode="baseline"
          className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h4 className="text-base font-bold text-foreground">
              {isAr ? "ملخص حجز الرحلة" : "Passenger Trip Summary"}
            </h4>
            <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium text-foreground">
              {isAr ? "مؤكد" : "Confirmed"}
            </span>
          </div>

          <p className="text-sm font-semibold text-foreground">
            {isAr ? "غزة (GZA) إلى عمّان (AMM)" : "Gaza (GZA) to Amman (AMM)"}
          </p>

          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              {isAr ? "الرحلة" : "Flight"}: PS 204 · Embraer 190 · 2026-10-15
            </p>
            <p>
              {isAr ? "المسافر" : "Passenger"}: Bassam Al-Saqqa · {isAr ? "المقعد" : "Seat"} 04A
            </p>
          </div>

          <div className="border-t border-border pt-3 space-y-1.5 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>{isAr ? "سعر التذكرة الأساسي" : "Base Fare"}</span>
              <span dir="ltr">$140.00</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>{isAr ? "رسوم المطار والأمن" : "Airport & Security Fees"}</span>
              <span dir="ltr">$28.50</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>{isAr ? "ضريبة الوقود والخدمات الملاحية" : "Fuel & Air Navigation Charge"}</span>
              <span dir="ltr">$11.50</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-sm font-bold text-foreground">
              <span>{isAr ? "الإجمالي الكلي" : "Total Amount Due"}</span>
              <span dir="ltr">$180.00 USD</span>
            </div>
          </div>
        </div>
      ) : (
        /* Gaza Surface Grammar Trip Summary: ticket/dossier frame, SurfaceIndex, SurfaceLedger */
        <GazaSurface
          family="dossier"
          recipe={recipe}
          forceGrammar={true}
          data-specimen-mode="grammar"
          className="p-5 sm:p-6"
        >
          <div className="flex items-center justify-between border-b border-border/80 pb-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {isAr ? "وثيقة حجز رحلة طيران" : "Passenger Trip Manifest"}
              </span>
              <h4 className="text-lg font-bold text-foreground mt-0.5">
                {isAr ? "غزة (GZA) إلى عمّان (AMM)" : "Gaza (GZA) to Amman (AMM)"}
              </h4>
            </div>
            <SurfaceIndex code="GZA-7K8P" label={isAr ? "مؤكد" : "Confirmed"} accent="brand" />
          </div>

          <div className="py-4 space-y-2 text-xs">
            <div className="flex justify-between items-center text-muted-foreground">
              <span>
                {isAr ? "الرحلة" : "Flight"}:{" "}
                <strong className="text-foreground" dir="ltr">
                  PS 204
                </strong>{" "}
                · Embraer 190
              </span>
              <span dir="ltr">2026-10-15</span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground">
              <span>
                {isAr ? "المسافر" : "Passenger"}:{" "}
                <strong className="text-foreground">Bassam Al-Saqqa (Adult)</strong>
              </span>
              <span>
                {isAr ? "المقعد" : "Seat"}:{" "}
                <strong className="text-foreground" dir="ltr">
                  04A
                </strong>
              </span>
            </div>
          </div>

          <SurfaceRule />

          <SurfaceLedger>
            <SurfaceLedgerRow
              label={isAr ? "سعر التذكرة الأساسي (1 بالغ)" : "Base Fare (1 Adult)"}
              value="$140.00"
              secondary={isAr ? "فئة كلاسيك · رحلة مباشرة" : "Classic Fare · Non-stop"}
            />
            <SurfaceLedgerRow
              label={isAr ? "رسوم المطار والأمن" : "Airport & Security Fees"}
              value="$28.50"
            />
            <SurfaceLedgerRow
              label={isAr ? "ضريبة الوقود والخدمات الملاحية" : "Fuel & Air Navigation Charge"}
              value="$11.50"
            />
            <SurfaceLedgerTotal
              label={isAr ? "الإجمالي الكلي المستحق" : "Total Amount Due"}
              value="$180.00 USD"
            />
          </SurfaceLedger>
        </GazaSurface>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Passenger Form Sheet Specimen (form-sheet)
// ─────────────────────────────────────────────────────────────────────────────

export function PassengerFormSpecimen({ forceGrammar, recipe }: SpecimenProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  return (
    <div data-surface-specimen="form-sheet.passenger-form" className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-wider">
          {isAr ? "استمارة بيانات المسافر (استمارة)" : "Passenger Form Sheet (Form-Sheet)"}
        </span>
      </div>

      {!forceGrammar ? (
        /* Baseline Passenger Form: plain card header without SurfaceIndex */
        <div
          data-specimen-mode="baseline"
          className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-4"
        >
          <div className="border-b border-border pb-3">
            <h4 className="text-base font-bold text-foreground">
              {isAr ? "بيانات المسافر 1 (بالغ)" : "Passenger 1 Details (Adult)"}
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr ? "حسب وثيقة السفر الرسمية" : "As on official travel document"}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {isAr ? "الاسم الأول" : "Given Name"}
              </label>
              <input
                type="text"
                readOnly
                value="Bassam"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {isAr ? "اسم العائلة" : "Family Name"}
              </label>
              <input
                type="text"
                readOnly
                value="Al-Saqqa"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {isAr ? "الجنسية" : "Nationality"}
              </label>
              <input
                type="text"
                readOnly
                value={isAr ? "فلسطين" : "State of Palestine"}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {isAr ? "رقم وثيقة السفر" : "Travel Document Number"}
              </label>
              <input
                type="text"
                readOnly
                dir="ltr"
                value="P01928341"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none"
              />
            </div>
          </div>
        </div>
      ) : (
        /* Gaza Surface Grammar Form Sheet: paper sheet tone, SurfaceIndex, pattern-free background */
        <GazaSurface
          family="form-sheet"
          recipe={recipe}
          forceGrammar={true}
          data-specimen-mode="grammar"
          className="p-5 sm:p-6"
        >
          <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-4">
            <SurfaceIndex
              code="PAX 01"
              label={isAr ? "المسافر الأساسي (بالغ)" : "Primary Passenger (Adult)"}
              accent="brand"
            />
            <span className="text-xs text-muted-foreground">
              {isAr ? "حسب وثيقة السفر الرسمية" : "As on official passport"}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {isAr ? "الاسم الأول (Given Name)" : "Given Name"}
              </label>
              <input
                type="text"
                readOnly
                value="Bassam"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {isAr ? "اسم العائلة (Family Name)" : "Family Name"}
              </label>
              <input
                type="text"
                readOnly
                value="Al-Saqqa"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {isAr ? "الجنسية" : "Nationality"}
              </label>
              <input
                type="text"
                readOnly
                value={isAr ? "فلسطين" : "State of Palestine"}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {isAr ? "رقم وثيقة السفر (جواز السفر)" : "Travel Document Number"}
              </label>
              <input
                type="text"
                readOnly
                dir="ltr"
                value="P01928341"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none"
              />
            </div>
          </div>
        </GazaSurface>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Travel Guide Plate Specimen (guide)
// ─────────────────────────────────────────────────────────────────────────────

export function GuidePlateSpecimen({ forceGrammar, recipe }: SpecimenProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  return (
    <div data-surface-specimen="guide.guide-plate" className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-wider">
          {isAr ? "لوحة الإرشادات ودليل المسافر (دليل)" : "Travel Guide Plate (Guide)"}
        </span>
      </div>

      {!forceGrammar ? (
        /* Baseline Guide Plate: simple info card, no SurfaceIndex or chapter rail */
        <div
          data-specimen-mode="baseline"
          className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center gap-2 text-primary font-semibold text-sm">
            <Compass className="size-4" />
            <span>{isAr ? "دليل الوصول والمبنى" : "Terminal Arrival Guide"}</span>
          </div>

          <h4 className="text-lg font-bold text-foreground">
            {isAr ? "الوصول واستلام الأمتعة في مبنى الركاب" : "Terminal Arrival & Baggage Reclaim"}
          </h4>

          <p className="text-sm leading-relaxed text-muted-foreground">
            {isAr
              ? "يتم توجيه جميع المسافرين القادمين عبر الممر الشرقي إلى صالة الجوازات المركزية. تصل الأمتعة المسجلة إلى الأحزمة 1 و2 خلال 15 دقيقة من هبوط الطائرة مع توفر عربات مجانية."
              : "All arriving passengers are guided through the central hall to border inspection. Checked luggage arrives at carousels 1 & 2 within 15 minutes of wheel touchdown with complimentary carts."}
          </p>

          <div className="border-t border-border pt-3">
            <span className="text-xs font-semibold text-primary hover:underline cursor-pointer inline-flex items-center gap-1">
              <span>{isAr ? "قراءة كافة الإرشادات" : "Read full guidance"}</span>
              <ArrowRight className="size-3.5 rtl:rotate-180" />
            </span>
          </div>
        </div>
      ) : (
        /* Gaza Surface Grammar Guide Plate: chapter rail frame, SurfaceIndex, checklist, SurfaceMedia */
        <GazaSurface
          family="guide"
          recipe={recipe}
          forceGrammar={true}
          data-specimen-mode="grammar"
          className="p-5 sm:p-6"
        >
          <div className="flex flex-col md:flex-row gap-5 items-start">
            <div className="flex-1 space-y-3">
              <SurfaceIndex
                code="GUIDE 03"
                label={isAr ? "إجراءات الوصول والمبنى" : "Arrival & Baggage Protocol"}
                accent="brass"
              />

              <h4 className="text-lg font-bold text-foreground">
                {isAr ? "الوصول واستلام الأمتعة في مبنى الركاب" : "Terminal Arrival & Baggage Reclaim"}
              </h4>

              <p className="text-sm leading-relaxed text-muted-foreground">
                {isAr
                  ? "يتم توجيه جميع المسافرين القادمين عبر الممر الشرقي إلى صالة الجوازات المركزية. تصل الأمتعة المسجلة إلى الأحزمة 1 و2 خلال 15 دقيقة من هبوط الطائرة مع توفر عربات مجانية."
                  : "All arriving passengers are guided through the central hall to border inspection. Checked luggage arrives at carousels 1 & 2 within 15 minutes of wheel touchdown with complimentary carts."}
              </p>

              <ul className="space-y-2 text-xs text-foreground font-medium pt-1">
                <li className="flex items-center gap-2">
                  <Check className="size-4 text-brand shrink-0" />
                  <span>
                    {isAr
                      ? "إبراز جواز السفر وبطاقة الصعود الرقمية"
                      : "Present valid passport and digital boarding pass"}
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-4 text-brand shrink-0" />
                  <span>
                    {isAr
                      ? "استلام الحقائب من الحزام المخصص للرحلة"
                      : "Collect bags from dedicated flight carousel"}
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-4 text-brand shrink-0" />
                  <span>
                    {isAr
                      ? "مخرج مباشر إلى ساحة الحافلات ومركبات الأجرة"
                      : "Direct covered access to express shuttles & taxis"}
                  </span>
                </li>
              </ul>
            </div>

            <div className="w-full md:w-56 shrink-0">
              <SurfaceMedia
                caption={isAr ? "ممر صالة الوصول المركزية" : "Central Passenger Concourse"}
                truthClass="illustrative"
                aspect="4:3"
              >
                <img
                  src={smallestSrc(MEDIA["concourse-day"]!)}
                  alt={isAr ? "صالة الوصول" : "Concourse"}
                  className="w-full h-full object-cover"
                />
              </SurfaceMedia>
            </div>
          </div>
        </GazaSurface>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Airport Chapter / Future Editorial Card Specimen (editorial)
// ─────────────────────────────────────────────────────────────────────────────

export function EditorialCardSpecimen({ forceGrammar, recipe }: SpecimenProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  return (
    <div data-surface-specimen="editorial.chapter-card" className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-wider">
          {isAr ? "بطاقة تحريرية لفصول المطار (تحريري)" : "Airport Vision Chapter Card (Editorial)"}
        </span>
      </div>

      {!forceGrammar ? (
        /* Baseline Editorial Card: standard article card with top media, no SurfaceIndex or chapter frame */
        <div
          data-specimen-mode="baseline"
          className="rounded-xl border border-border bg-card overflow-hidden"
        >
          <div className="aspect-[16/9] w-full overflow-hidden bg-ink">
            <img
              src={smallestSrc(MEDIA["interior-wide-a"]!)}
              alt={isAr ? "صالة المطار" : "Terminal Concept"}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="p-5 sm:p-6 space-y-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {isAr ? "فصول المطار" : "Airport Story"}
            </span>
            <h3 className="text-xl font-bold text-foreground">
              {isAr
                ? "أقواس المبنى الجديد: هندسة مستدامة للضياء والتبريد"
                : "Canopy Arches: Sustainable Geometry for Daylight & Airflow"}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {isAr
                ? "دراسة معمارية تصورية تستكشف تصاميم الأقواس الإنشائية واسعة المدى لمبنى المسافرين الجديد."
                : "Conceptual architectural exploration examining wide-span structural bay arches for the future passenger terminal."}
            </p>
            <div className="pt-2 text-xs font-semibold text-primary inline-flex items-center gap-1">
              <span>{isAr ? "استكشاف الفصل" : "Explore chapter"}</span>
              <ArrowRight className="size-3.5 rtl:rotate-180" />
            </div>
          </div>
        </div>
      ) : (
        /* Gaza Surface Grammar Editorial Card: chapter frame, SurfaceIndex, SurfaceMedia, scoped dark contrast */
        <GazaSurface
          family="editorial"
          recipe={recipe}
          forceGrammar={true}
          data-specimen-mode="grammar"
          className="p-5 sm:p-6"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <SurfaceIndex
                code="CHAPTER 04"
                label={isAr ? "رؤية المستقبل المعماري" : "Architectural Future Vision"}
                accent="clay"
              />
              <span className="text-[11px] font-mono text-muted-foreground">
                GAZA AIRFIELD 2026+
              </span>
            </div>

            <h3 className="text-xl font-bold tracking-tight text-foreground">
              {isAr
                ? "أقواس المبنى الجديد: هندسة مستدامة للضياء والتبريد"
                : "Canopy Arches: Sustainable Geometry for Daylight & Airflow"}
            </h3>

            <p className="text-sm leading-relaxed text-muted-foreground">
              {isAr
                ? "دراسة معمارية تصورية تستكشف تصاميم الأقواس الإنشائية واسعة المدى لمبنى المسافرين الجديد، بهدف تحقيق التبريد السلبي وتقليل استهلاك الطاقة مع توفير فضاءات مضيئة بروح البحر المتوسط."
                : "Conceptual architectural exploration examining wide-span structural bay arches for the future passenger terminal, leveraging natural passive cooling and Mediterranean daylight harvesting."}
            </p>

            <SurfaceMedia
              caption={
                isAr
                  ? "مفهوم معماري تصوري لصالة الركاب المستقبلية"
                  : "Exploratory architectural concept for future terminal expansion"
              }
              provenance="PALESTINIAN CIVIL AVIATION STUDY ARCHIVE · 2026 CONCEPT"
              truthClass="illustrative"
              aspect="16:9"
            >
              <img
                src={smallestSrc(MEDIA["interior-wide-a"]!)}
                alt={isAr ? "تصور لصالة المطار" : "Terminal Concept"}
                className="w-full h-full object-cover"
              />
            </SurfaceMedia>
          </div>
        </GazaSurface>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Booking Review Dossier Specimen (dossier)
// ─────────────────────────────────────────────────────────────────────────────

export function ReviewDossierSpecimen({ forceGrammar, recipe }: SpecimenProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  return (
    <div data-surface-specimen="dossier.review-dossier" className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-wider">
          {isAr ? "ملف المراجعة النهائية للحجز (ملف توثيقي)" : "Booking Review Dossier (Dossier)"}
        </span>
      </div>

      {!forceGrammar ? (
        /* Baseline Review Dossier: plain card with simple boxes and plain text total */
        <div
          data-specimen-mode="baseline"
          className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-4"
        >
          <div className="border-b border-border pb-3">
            <h4 className="text-base font-bold text-foreground">
              {isAr ? "مراجعة تفاصيل الحجز" : "Booking Review"}
            </h4>
            <p className="font-mono text-xs text-muted-foreground" dir="ltr">
              REF: GZA-9284
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <p>
              <strong>{isAr ? "مسار الرحلة" : "Flight"}:</strong> PS 204 · GZA 10:30 → AMM 11:45
            </p>
            <p>
              <strong>{isAr ? "المسافر" : "Passenger"}:</strong> Bassam Al-Saqqa · Seat 04A · Classic Fare
            </p>
          </div>

          <div className="border-t border-border pt-3 flex justify-between items-baseline font-bold">
            <span className="text-sm">{isAr ? "المجموع الكلي" : "Total Amount"}</span>
            <span className="text-lg" dir="ltr">
              $180.00 USD
            </span>
          </div>
        </div>
      ) : (
        /* Gaza Surface Grammar Review Dossier: SurfaceIndex, structured document boxes, SurfaceLedger */
        <GazaSurface
          family="dossier"
          recipe={recipe}
          forceGrammar={true}
          data-specimen-mode="grammar"
          className="p-5 sm:p-6"
        >
          <div className="border-b border-border/80 pb-3 mb-4 flex items-center justify-between">
            <SurfaceIndex
              code="DOSSIER"
              label={isAr ? "مراجعة تفاصيل الحجز الرسمية" : "Final Booking Review"}
              accent="brand"
            />
            <span className="font-mono text-xs text-muted-foreground" dir="ltr">
              REF: GZA-9284 / STEP 06
            </span>
          </div>

          <div className="space-y-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded border border-border/60 bg-secondary/30 p-3">
                <span className="text-xs text-muted-foreground block mb-1">
                  {isAr ? "مسار الرحلة المؤكد" : "Flight Itinerary"}
                </span>
                <span className="font-bold text-foreground block">
                  PS 204 · GZA 10:30 → AMM 11:45
                </span>
                <span className="text-xs text-muted-foreground">2026-10-15 · Non-stop</span>
              </div>

              <div className="rounded border border-border/60 bg-secondary/30 p-3">
                <span className="text-xs text-muted-foreground block mb-1">
                  {isAr ? "المسافر والمقعد" : "Traveler & Assigned Seat"}
                </span>
                <span className="font-bold text-foreground block">
                  Bassam Al-Saqqa (Adult)
                </span>
                <span className="text-xs text-muted-foreground">Seat 04A · Classic Fare</span>
              </div>
            </div>

            <SurfaceRule />

            <SurfaceLedger>
              <SurfaceLedgerRow
                label={isAr ? "تذكرة الطيران (فئة كلاسيك)" : "Airfare (Classic Tier)"}
                value="$140.00"
              />
              <SurfaceLedgerRow
                label={isAr ? "الضرائب ورسوم الخدمات الجوية" : "Taxes & Navigation Fees"}
                value="$40.00"
              />
              <SurfaceLedgerTotal
                label={isAr ? "المبلغ الإجمالي المعتمد" : "Confirmed Total Amount"}
                value="$180.00 USD"
              />
            </SurfaceLedger>
          </div>
        </GazaSurface>
      )}
    </div>
  );
}
