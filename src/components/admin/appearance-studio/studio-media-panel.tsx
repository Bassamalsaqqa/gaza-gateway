/**
 * Gaza Gateway — Appearance Studio Media & Artwork Panel
 *
 * Provides bounded media controls for approved Guide and Editorial contexts.
 * Strictly enforces truth classification policies:
 * - Historical Past / Present chapters: AI concept visualizations are strictly prohibited.
 * - Future Vision studies: AI visualizations permitted with mandatory illustrative disclosure.
 * - Operational, fare, dossier, form-sheet: Media controls completely omitted.
 */

import { useState } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Check, Image as ImageIcon, Info, RotateCcw, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { MEDIA, smallestSrc, type MediaEntry } from "@/lib/media";
import type { MediaTreatment, SurfaceRecipe } from "@/design/surfaces/types";
import { getTargetMeta, type TargetId } from "@/design/surfaces/targets";

export interface StudioMediaPanelProps {
  targetId: TargetId;
  recipe: SurfaceRecipe;
  onChange: (patch: Partial<SurfaceRecipe>) => void;
  onReset: () => void;
}

const TREATMENT_LABELS: Record<
  "cover" | "top" | "side" | "watermark" | "none",
  { en: string; ar: string }
> = {
  cover: { en: "Cover", ar: "تغطية كاملة" },
  top: { en: "Top banner", ar: "شريط علوي" },
  side: { en: "Side card", ar: "بطاقة جانبية" },
  watermark: { en: "Watermark", ar: "علامة مائية" },
  none: { en: "None", ar: "بدون" },
};

const OVERLAY_LABELS: Record<
  "none" | "subtle" | "dark" | "gradient",
  { en: string; ar: string }
> = {
  none: { en: "None", ar: "بدون غطاء" },
  subtle: { en: "Subtle", ar: "خافت" },
  dark: { en: "Dark", ar: "داكن" },
  gradient: { en: "Gradient", ar: "تدرج" },
};

export function StudioMediaPanel({
  targetId,
  recipe,
  onChange,
  onReset,
}: StudioMediaPanelProps) {
  const { t, lang } = useI18n();
  const isAr = lang === "ar";
  const meta = getTargetMeta(targetId);

  const mediaTreatment: MediaTreatment = recipe.mediaTreatment ?? {
    treatment: "cover",
    focalX: 50,
    focalY: 50,
    overlay: "none",
    aspect: "auto",
  };

  // Filter approved media by target's truth classification rules
  const availableMedia: MediaEntry[] = Object.values(MEDIA).filter((item) => {
    if (!meta.allowedTruthClasses) return false;
    return meta.allowedTruthClasses.includes(item.truthClass);
  });

  const selectedMediaId =
    mediaTreatment.mediaId && mediaTreatment.mediaId in MEDIA
      ? mediaTreatment.mediaId
      : availableMedia[0]?.id;

  const handleSelectMedia = (id: string) => {
    const item = MEDIA[id];
    if (!item) return;

    const nextTreatment: MediaTreatment = {
      ...mediaTreatment,
      mediaId: id,
      truthClass: item.truthClass,
      treatment: mediaTreatment.treatment ?? "cover",
    };

    onChange({ mediaTreatment: nextTreatment });
  };

  const handleUpdateTreatment = (treatment: "none" | "top" | "side" | "cover" | "watermark") => {
    onChange({
      mediaTreatment: {
        ...mediaTreatment,
        treatment,
      },
    });
  };

  const handleUpdateFocal = (axis: "focalX" | "focalY", val: number) => {
    onChange({
      mediaTreatment: {
        ...mediaTreatment,
        [axis]: Math.max(0, Math.min(100, val)),
      },
    });
  };

  const handleUpdateOverlay = (overlay: "none" | "subtle" | "dark" | "gradient") => {
    onChange({
      mediaTreatment: {
        ...mediaTreatment,
        overlay,
      },
    });
  };

  if (!meta.mediaAllowed) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 text-center text-xs text-muted-foreground">
        <Info className="mx-auto mb-2 size-5 text-muted-foreground/60" />
        <p className="font-semibold text-foreground">
          {isAr ? "الوسائط غير مسموحة لهذا العنصر" : "Media Not Permitted on this Target"}
        </p>
        <p className="mt-1 leading-relaxed">
          {isAr
            ? "تقتصر عناصر الوسائط والصور على أدلة المسافرين والفصول التحريرية فقط."
            : "Media controls are strictly limited to Guide and Editorial surfaces. Operational and transactional surfaces remain 100% media-free."}
        </p>
      </div>
    );
  }

  const selectedItem = selectedMediaId ? MEDIA[selectedMediaId] : undefined;

  return (
    <div className="space-y-5">
      {/* Target Truth Policy Notice */}
      {targetId === "airport.chapter-card" ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-sand/60 p-3 text-xs">
          <Info className="mt-0.5 size-4 shrink-0 text-foreground" />
          <p className="leading-relaxed text-foreground">
            {isAr
              ? "سياسة الحقيقة الوثائقية: فصول التاريخ لا تسمح باستخدام صور المفاهيم المستقبلية المولدة بالذكاء الاصطناعي."
              : "Strict Documentary Policy: Historical chapters permit authentic historical and brand assets only. AI future visual studies are excluded."}
          </p>
        </div>
      ) : targetId === "airport.future-editorial" ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="leading-relaxed">
            <p className="font-semibold text-foreground">
              {isAr ? "دراسة تصورية مستقبلية · توضيحي" : "Future Concept Study · Illustrative"}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {isAr
                ? "يتم تطبيق وسم الإفصاح الإلزامي على كافة دراسات التصميم المستقبلية."
                : "Mandatory illustrative disclosure label is automatically rendered on all future terminal concept studies."}
            </p>
          </div>
        </div>
      ) : null}

      {/* Media Picker Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {isAr ? "الصورة المعتمدة" : "Approved Artwork Asset"}
          </label>
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3" />
            <span>{isAr ? "إعادة الضبط" : "Reset Media"}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1 border border-border rounded-lg bg-card">
          {availableMedia.map((item) => {
            const isSelected = selectedMediaId === item.id;
            const thumbSrc = smallestSrc(item);

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectMedia(item.id)}
                className={cn(
                  "group relative flex flex-col overflow-hidden rounded-md border text-start transition-all",
                  isSelected
                    ? "border-primary ring-2 ring-primary/40 bg-primary/5"
                    : "border-border hover:border-foreground/30 bg-background",
                )}
              >
                <div className="aspect-[16/10] w-full overflow-hidden bg-muted">
                  <img
                    src={thumbSrc}
                    alt={isAr ? item.altAr : item.altEn}
                    className="size-full object-cover transition-transform group-hover:scale-105"
                  />
                </div>
                <div className="p-1.5 text-[11px]">
                  <div className="flex items-center justify-between gap-1 font-mono font-bold text-foreground">
                    <span className="truncate">{item.id}</span>
                    {isSelected ? <Check className="size-3 text-primary shrink-0" /> : null}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1">
                    <span
                      className={cn(
                        "rounded px-1 text-[9px] font-medium uppercase",
                        item.truthClass === "future-concept-ai"
                          ? "bg-amber-500/10 text-amber-800 dark:text-amber-200"
                          : "bg-secondary text-muted-foreground",
                      )}
                    >
                      {item.truthClass === "future-concept-ai"
                        ? isAr
                          ? "تخيلي"
                          : "AI Concept"
                        : isAr
                          ? "علامة"
                          : "Brand"}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Media Placement Treatment */}
      {selectedItem ? (
        <div className="space-y-4 rounded-lg border border-border bg-card p-3.5">
          <div className="space-y-1.5">
            <span
              id="treatment-style-label"
              className="block text-xs font-bold uppercase tracking-wider text-muted-foreground"
            >
              {isAr ? "أسلوب العرض" : "Treatment Style"}
            </span>
            <RadioGroupPrimitive.Root
              value={mediaTreatment.treatment ?? "cover"}
              onValueChange={(val) =>
                handleUpdateTreatment(val as "cover" | "top" | "side" | "watermark" | "none")
              }
              dir={isAr ? "rtl" : "ltr"}
              aria-labelledby="treatment-style-label"
              className="grid grid-cols-3 gap-1"
            >
              {(["cover", "top", "side", "watermark", "none"] as const).map((mode) => {
                const isSelected = (mediaTreatment.treatment ?? "cover") === mode;
                return (
                  <RadioGroupPrimitive.Item
                    key={mode}
                    value={mode}
                    data-testid={`treatment-option-${mode}`}
                    className={cn(
                      "rounded border px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring cursor-pointer",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground font-semibold"
                        : "border-border bg-background text-foreground hover:bg-secondary",
                    )}
                  >
                    {isAr ? TREATMENT_LABELS[mode].ar : TREATMENT_LABELS[mode].en}
                  </RadioGroupPrimitive.Item>
                );
              })}
            </RadioGroupPrimitive.Root>
          </div>

          {/* Focal Point Alignment (X and Y percentage) */}
          <div className="space-y-2">
            <span
              id="focal-coords-label"
              className="block text-xs font-bold uppercase tracking-wider text-muted-foreground"
            >
              {isAr ? "نقطة التركيز (المحاذاة)" : "Focal Coordinates (Crop Anchor)"}
            </span>
            <div className="grid grid-cols-2 gap-3" aria-labelledby="focal-coords-label">
              <div>
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span dir="ltr">X: {mediaTreatment.focalX ?? 50}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  aria-label={isAr ? "محاذاة المحور السيني الأفقي" : "Horizontal X anchor"}
                  value={mediaTreatment.focalX ?? 50}
                  onChange={(e) => handleUpdateFocal("focalX", Number(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span dir="ltr">Y: {mediaTreatment.focalY ?? 50}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  aria-label={isAr ? "محاذاة المحور الصادي الرأسي" : "Vertical Y anchor"}
                  value={mediaTreatment.focalY ?? 50}
                  onChange={(e) => handleUpdateFocal("focalY", Number(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Subtle Contrast Overlay */}
          <div className="space-y-1.5">
            <span
              id="overlay-style-label"
              className="block text-xs font-bold uppercase tracking-wider text-muted-foreground"
            >
              {isAr ? "طبقة التعتيم والتباين" : "Contrast Overlay"}
            </span>
            <RadioGroupPrimitive.Root
              value={mediaTreatment.overlay ?? "none"}
              onValueChange={(val) =>
                handleUpdateOverlay(val as "none" | "subtle" | "dark" | "gradient")
              }
              dir={isAr ? "rtl" : "ltr"}
              aria-labelledby="overlay-style-label"
              className="grid grid-cols-4 gap-1"
            >
              {(["none", "subtle", "dark", "gradient"] as const).map((overlay) => {
                const isSelected = (mediaTreatment.overlay ?? "none") === overlay;
                return (
                  <RadioGroupPrimitive.Item
                    key={overlay}
                    value={overlay}
                    data-testid={`overlay-option-${overlay}`}
                    className={cn(
                      "rounded border px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring cursor-pointer",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground font-semibold"
                        : "border-border bg-background text-foreground hover:bg-secondary",
                    )}
                  >
                    {isAr ? OVERLAY_LABELS[overlay].ar : OVERLAY_LABELS[overlay].en}
                  </RadioGroupPrimitive.Item>
                );
              })}
            </RadioGroupPrimitive.Root>
          </div>
        </div>
      ) : null}
    </div>
  );
}
