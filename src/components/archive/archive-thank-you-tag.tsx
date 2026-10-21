import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { Download, FileText } from "lucide-react";
import "./archive-thank-you-tag.css";

const FONT_LATIN = '"Gza Ticket Latin", sans-serif';
const FONT_ARABIC = '"Gza Ticket Arabic", sans-serif';

const TAG_WIDTH = 1122;
const TAG_HEIGHT = 1402;
const TEMPLATE_URL = "/media/archive/archive-thank-you-tag-template.png";

interface ExtractedNames {
  latin: string;
  arabic: string;
}

function extractNames(contributorName: string, contributorNameArabic?: string | null): ExtractedNames {
  const trimmed = (contributorName || "").trim();
  const explicitArabic = (contributorNameArabic || "").trim();

  if (explicitArabic) {
    return {
      latin: trimmed,
      arabic: explicitArabic,
    };
  }

  if (!trimmed) {
    return { latin: "", arabic: "" };
  }

  // Check for explicit combined pattern like "Latin / Arabic" or "Arabic / Latin" or "Latin (Arabic)"
  const delimiterMatch = /^([^/(]+?)\s*[/|(]\s*([^/)]+?)\)?$/.exec(trimmed);
  if (delimiterMatch && delimiterMatch[1] && delimiterMatch[2]) {
    const part1 = delimiterMatch[1].trim();
    const part2 = delimiterMatch[2].trim();
    const part1HasAr = /[\u0600-\u06FF]/.test(part1);
    const part2HasAr = /[\u0600-\u06FF]/.test(part2);

    if (!part1HasAr && part2HasAr) {
      return { latin: part1, arabic: part2 };
    }
    if (part1HasAr && !part2HasAr) {
      return { latin: part2, arabic: part1 };
    }
  }

  const hasArabic = /[\u0600-\u06FF]/.test(trimmed);
  const hasLatin = /[A-Za-z]/.test(trimmed);

  if (hasArabic && !hasLatin) {
    return { latin: "", arabic: trimmed };
  }
  if (hasLatin && !hasArabic) {
    return { latin: trimmed, arabic: "" };
  }

  return { latin: trimmed, arabic: "" };
}

interface FittedTextOptions {
  x: number;
  y: number;
  maxWidth: number;
  size: number;
  minSize?: number;
  font?: string;
  weight?: number | string;
  color?: string;
  direction?: CanvasDirection;
  align?: CanvasTextAlign;
}

function fittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  options: FittedTextOptions
): void {
  if (!text) return;

  const {
    x,
    y,
    maxWidth,
    size,
    minSize = 16,
    font = FONT_LATIN,
    weight = 700,
    color = "#123a30",
    direction = "ltr",
    align = "left",
  } = options;

  ctx.save();
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.direction = direction;
  ctx.textAlign = align;

  let px = size;
  let iterations = 0;
  while (px > minSize && iterations < 50) {
    ctx.font = `${weight} ${px}px ${font}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    px -= 1;
    iterations++;
  }

  ctx.font = `${weight} ${px}px ${font}`;
  ctx.fillText(text, x, y, maxWidth);
  ctx.restore();
}

function paintTag(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  contributorName: string,
  contributorNameArabic: string | null | undefined,
  archiveReference: string
): void {
  ctx.clearRect(0, 0, TAG_WIDTH, TAG_HEIGHT);
  ctx.drawImage(img, 0, 0, TAG_WIDTH, TAG_HEIGHT);

  const names = extractNames(contributorName, contributorNameArabic);

  if (names.latin && names.arabic) {
    // Both Latin and Arabic contributor names:
    // Latin at baseline 983
    fittedText(ctx, names.latin.toLocaleUpperCase("en"), {
      x: 270,
      y: 983,
      maxWidth: 405,
      size: 28,
      minSize: 16,
      color: "#123a30",
      weight: 700,
      font: FONT_LATIN,
      direction: "ltr",
      align: "left",
    });

    // Arabic at baseline 1007 (regular weight, Arabic font)
    fittedText(ctx, names.arabic, {
      x: 270,
      y: 1007,
      maxWidth: 390,
      size: 18,
      minSize: 15,
      color: "#153a30",
      weight: 400,
      font: FONT_ARABIC,
      direction: "rtl",
      align: "left",
    });
  } else if (names.arabic) {
    // Pure Arabic contributor name: baseline 995 with Arabic font.
    // Avoid inventing artificial Latin translation.
    fittedText(ctx, names.arabic, {
      x: 270,
      y: 995,
      maxWidth: 405,
      size: 28,
      minSize: 16,
      color: "#153a30",
      weight: 700,
      font: FONT_ARABIC,
      direction: "rtl",
      align: "left",
    });
  } else {
    // Pure Latin contributor name: baseline 995 with Latin font.
    // Avoid inventing artificial Arabic translation.
    const text = (names.latin || contributorName || "").toLocaleUpperCase("en");
    fittedText(ctx, text, {
      x: 270,
      y: 995,
      maxWidth: 405,
      size: 28,
      minSize: 16,
      color: "#123a30",
      weight: 700,
      font: FONT_LATIN,
      direction: "ltr",
      align: "left",
    });
  }

  // Unique archive submission reference: baseline 1201 (Latin font, strictly LTR)
  // archiveId = publicref
  fittedText(ctx, (archiveReference || "").toLocaleUpperCase("en"), {
    x: 269,
    y: 1201,
    maxWidth: 276,
    size: 24,
    minSize: 16,
    color: "#182120",
    weight: 700,
    font: FONT_LATIN,
    direction: "ltr",
    align: "left",
  });
}

export interface ArchiveThankYouTagProps {
  contributorName: string;
  contributorNameArabic?: string | null;
  archiveReference: string;
  className?: string;
}

export function ArchiveThankYouTag({
  contributorName,
  contributorNameArabic,
  archiveReference,
  className = "",
}: ArchiveThankYouTagProps) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const names = extractNames(contributorName, contributorNameArabic);

  useEffect(() => {
    let cancelled = false;
    let imgToClean: HTMLImageElement | null = null;

    // Reset readiness on props changes
    setReady(false);
    setLoadError(false);

    // Font loading promise: load bundled NotoSans / NotoSansArabic faces
    const fontPromise =
      typeof document !== "undefined" && document.fonts && typeof document.fonts.load === "function"
        ? Promise.all([
            document.fonts.load(`700 28px ${FONT_LATIN}`, "CONTRIBUTOR"),
            document.fonts.load(`400 24px ${FONT_LATIN}`, "GZA"),
            document.fonts.load(`700 28px ${FONT_ARABIC}`, "المساهم"),
            document.fonts.load(`400 18px ${FONT_ARABIC}`, "الأرشيف"),
          ])
        : Promise.resolve();

    // Image loading promise: onload callback registered BEFORE setting src
    const imagePromise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      imgToClean = img;
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load archive template image"));
      img.src = TEMPLATE_URL;
    });

    // Await both fonts AND template image before painting
    Promise.all([imagePromise, fontPromise])
      .then(([img]) => {
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d", { alpha: true });
        if (!ctx) throw new Error("Canvas rendering unavailable");

        paintTag(ctx, img, contributorName, contributorNameArabic, archiveReference);

        // Set ready ONLY after painting is completed
        if (!cancelled) {
          setReady(true);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Archive tag rendering failed:", err);
        setLoadError(true);
      });

    return () => {
      cancelled = true;
      if (imgToClean) {
        imgToClean.onload = null;
        imgToClean.onerror = null;
        imgToClean.src = "";
      }
    };
  }, [contributorName, contributorNameArabic, archiveReference]);

  async function handleDownloadPng() {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    setDownloading(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) return;
      const safeRef = archiveReference.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40) || "archive";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gaza-archive-thank-you-${safeRef}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className={`space-y-4 rounded-xl border border-border bg-card p-5 ${className}`}>
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-clay">
            {ar ? "بطاقة شكر وتقدير للمساهم" : "Contributor Thank-You Tag"}
          </span>
          <h3 className="text-base font-semibold text-foreground">
            {ar ? "بطاقة الأرشيف التذكارية المعتمدة" : "Approved Commemorative Archive Tag"}
          </h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDetails(!showDetails)}
          className="archive-tag-details-toggle"
        >
          <FileText className="size-4" />
          <span>
            {showDetails
              ? (ar ? "إخفاء التفاصيل" : "Hide details")
              : (ar ? "عرض التفاصيل" : "View details")}
          </span>
        </Button>
      </div>

      {/* Visible Error Notification on Load Failure */}
      {loadError && (
        <div
          className="rounded-lg border border-clay/30 bg-clay/10 p-3 text-center text-xs font-semibold text-clay"
          role="alert"
        >
          {ar
            ? "تعذر تحميل قالب البطاقة التذكارية. يتم عرض تفاصيل المساهمة أدناه."
            : "Unable to load approved tag artwork. Displaying contribution details below."}
        </div>
      )}

      {/* Accessible Record Data Details (toggled or on image error fallback) */}
      {(showDetails || loadError) && (
        <div className="rounded-lg border border-border bg-sand-deep/20 p-4 space-y-3 text-sm">
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {ar ? "بيانات الوثيقة التذكارية المحفوظة" : "Saved Commemorative Record Data"}
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              {ar ? "المساهم:" : "Contributor:"}
            </span>
            {names.latin && (
              <div className="text-base font-bold text-foreground" dir="ltr">
                {names.latin}
              </div>
            )}
            {names.arabic && (
              <div className="text-base font-bold text-foreground" dir="rtl">
                {names.arabic}
              </div>
            )}
            {!names.latin && !names.arabic && (
              <div className="text-base font-bold text-foreground">
                {contributorName}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              {ar ? "مرجع الأرشيف العام:" : "Public Archive Reference:"}
            </span>
            <div className="font-mono text-base font-bold text-primary" dir="ltr">
              {archiveReference}
            </div>
          </div>
        </div>
      )}

      {/* Tag Canvas Presentation (preserves alpha transparent template shape, no unbranded stone bg) */}
      {!loadError && (
        <div className="flex flex-col items-center">
          <div className="archive-tag-canvas-wrapper" aria-busy={!ready}>
            <canvas
              ref={canvasRef}
              width={TAG_WIDTH}
              height={TAG_HEIGHT}
              role="img"
              aria-label={
                ar
                  ? `بطاقة شكر وتقدير تذكارية لمساهم الأرشيف · ${contributorName} · مرجع: ${archiveReference}`
                  : `Personalized commemorative archive thank-you luggage tag · ${contributorName} · Ref: ${archiveReference}`
              }
              className="archive-tag-canvas"
            >
              {/* Accessible fallback text for screen readers inside canvas */}
              <p>
                {ar
                  ? `بطاقة شكر وتقدير لمساهم الأرشيف: ${contributorName}، مرجع الأرشيف: ${archiveReference}.`
                  : `Commemorative Archive Thank-You Tag: ${contributorName}, Reference: ${archiveReference}.`}
              </p>
            </canvas>
          </div>
        </div>
      )}

      {/* Action button */}
      <div className="archive-tag-actions flex flex-wrap items-center justify-center gap-3 pt-2">
        <Button
          variant="primary"
          onClick={() => void handleDownloadPng()}
          disabled={!ready || downloading}
        >
          <Download className="size-4" />
          <span>
            {downloading
              ? (ar ? "جارٍ التحميل…" : "Downloading…")
              : (ar ? "تحميل PNG" : "Download PNG")}
          </span>
        </Button>
      </div>

      {/* Single concise honest acknowledgment note */}
      <p className="text-center text-xs text-muted-foreground leading-relaxed pt-2 border-t border-border">
        {ar
          ? "بطاقة شكر وتقدير تذكارية لحفظ المواد في الأرشيف الرقمي لمطار غزة الدولي. الباركود تذكاري وجمالي ضمن التصميم الأصلي المعتمد."
          : "Commemorative acknowledgment tag for materials preserved in the Gaza Airport digital archive. The barcode is decorative artwork."}
      </p>
    </div>
  );
}
