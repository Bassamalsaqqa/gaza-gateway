/**
 * ResponsiveImage — lightweight native-only responsive image wrapper.
 * No image framework. Supports srcSet, sizes, lazy/eager, fetch priority,
 * absolute positioning, object position, and custom captions.
 */
import type React from "react";
import { cn } from "@/lib/utils";
import { buildSrcSet, smallestSrc, MEDIA, type MediaEntry } from "@/lib/media";
import { useI18n, type Lang } from "@/lib/i18n";

export interface ResponsiveImageProps {
  entry: MediaEntry | (keyof typeof MEDIA);
  /** CSS sizes attribute — controls which variant the browser selects. */
  sizes: string;
  /** Localized alt override. Falls back to entry.altEn / entry.altAr. */
  altOverride?: { en: string; ar: string };
  /** loading="eager" disables native lazy loading (LCP candidates). */
  loading?: "lazy" | "eager";
  /** fetchpriority hint for LCP images. */
  fetchPriority?: "high" | "low" | "auto";
  className?: string;
  style?: React.CSSProperties;
  /** Optional container / figure className when wrapped in figure */
  containerClassName?: string;
  /** Custom caption content for figcaption */
  caption?: React.ReactNode;
  /** When true, wraps in <figure> with default localized concept disclosure. */
  withCaption?: boolean;
}

function resolveEntry(entry: MediaEntry | (keyof typeof MEDIA)): MediaEntry {
  if (typeof entry === "string") {
    const resolved = MEDIA[entry];
    if (!resolved) {
      throw new Error(`[ResponsiveImage] Unknown media key: "${entry}"`);
    }
    return resolved;
  }
  return entry;
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
  style,
  containerClassName,
  caption,
  withCaption = false,
}: ResponsiveImageProps) {
  const { t, lang } = useI18n();
  const mediaEntry = resolveEntry(entry);
  const alt = altFor(mediaEntry, lang as Lang, altOverride);
  const src = smallestSrc(mediaEntry);
  const srcSet = buildSrcSet(mediaEntry);
  const { width, height } = mediaEntry;

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
      style={style}
      className={cn("object-cover", className)}
    />
  );

  if (caption !== undefined) {
    return (
      <figure className={cn("relative m-0", containerClassName)}>
        {img}
        <figcaption className="mt-1.5 text-xs text-muted-foreground">
          {caption}
        </figcaption>
      </figure>
    );
  }

  if (!withCaption) return img;

  return (
    <figure className={cn("relative m-0", containerClassName)}>
      {img}
      <figcaption className="mt-1.5 text-xs text-muted-foreground">
        {lang === "ar"
          ? t("media.figureCaptionAr")
          : t("media.figureCaptionEn")}
      </figcaption>
    </figure>
  );
}
