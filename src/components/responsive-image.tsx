/**
 * ResponsiveImage — lightweight native-only responsive image wrapper.
 * No image framework. Supports srcSet, sizes, lazy/eager, fetch priority.
 */
import { cn } from "@/lib/utils";
import { buildSrcSet, smallestSrc, type MediaEntry } from "@/lib/media";
import { useI18n, type Lang } from "@/lib/i18n";

export interface ResponsiveImageProps {
  entry: MediaEntry;
  /** CSS sizes attribute — controls which variant the browser selects. */
  sizes: string;
  /** Localized alt override. Falls back to entry.altEn / entry.altAr. */
  altOverride?: { en: string; ar: string };
  /** loading="eager" disables native lazy loading (LCP candidates). */
  loading?: "lazy" | "eager";
  /** fetchpriority hint for LCP images. */
  fetchPriority?: "high" | "low" | "auto";
  className?: string;
  /** When true, wraps in <figure> with <figcaption> concept disclosure. */
  withCaption?: boolean;
}

function altFor(entry: MediaEntry, lang: Lang, override?: { en: string; ar: string }): string {
  if (override) return lang === "ar" ? override.ar : override.en;
  return lang === "ar" ? entry.altAr : entry.altEn;
}

export function ResponsiveImage({
  entry,
  sizes,
  altOverride,
  loading = "lazy",
  fetchPriority = "auto",
  className,
  withCaption = false,
}: ResponsiveImageProps) {
  const { t, lang } = useI18n();
  const alt = altFor(entry, lang as Lang, altOverride);
  const src = smallestSrc(entry);
  const srcSet = buildSrcSet(entry);
  const { width, height } = entry;

  const img = (
    <img
      src={src}
      srcSet={srcSet}
      sizes={sizes}
      width={width}
      height={height}
      alt={alt}
      loading={loading}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fetchPriority={fetchPriority as any}
      decoding={loading === "eager" ? "sync" : "async"}
      className={cn("object-cover", className)}
    />
  );

  if (!withCaption) return img;

  return (
    <figure className="relative m-0">
      {img}
      <figcaption className="mt-1.5 text-xs text-muted-foreground">
        {lang === "ar"
          ? t("media.figureCaptionAr")
          : t("media.figureCaptionEn")}
      </figcaption>
    </figure>
  );
}
