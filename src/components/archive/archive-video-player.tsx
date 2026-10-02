import { useState } from "react";
import { Play, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export interface ArchiveVideoPlayerProps {
  youtubeId: string;
  title: string;
  originalUrl?: string | undefined;
  facade?: boolean | undefined;
  className?: string | undefined;
  posterBgClass?: string | undefined;
}

export function ArchiveVideoPlayer({
  youtubeId,
  title,
  originalUrl,
  facade = false,
  className,
  posterBgClass = "bg-ink",
}: ArchiveVideoPlayerProps) {
  const { t } = useI18n();
  const [isPlaying, setIsPlaying] = useState(!facade);

  // Validate YouTube ID format
  const isValidId = /^[a-zA-Z0-9_-]{6,15}$/.test(youtubeId);

  if (!isValidId) {
    return (
      <div
        className={cn(
          "relative aspect-video w-full flex flex-col items-center justify-center rounded-xl bg-ink p-6 text-center text-ink-foreground",
          className,
        )}
      >
        <p className="text-sm font-semibold">{title}</p>
        {originalUrl && (
          <a
            href={originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-clay underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span>{t("gallery.watchSource")}</span>
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        )}
      </div>
    );
  }

  if (facade && !isPlaying) {
    return (
      <div
        className={cn(
          "group relative aspect-video w-full overflow-hidden rounded-xl border border-border flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all hover:border-brand/60 shadow-xs select-none",
          posterBgClass,
          className,
        )}
        data-testid="video-facade"
        onClick={() => setIsPlaying(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsPlaying(true);
          }
        }}
        aria-label={`${t("gallery.watchSource")}: ${title}`}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
        <div className="relative z-10 flex flex-col items-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-brand text-white shadow-lg transition-transform duration-300 group-hover:scale-110">
            <Play
              aria-hidden="true"
              className="size-6 fill-white text-white translate-x-0.5 rtl:-translate-x-0.5"
            />
          </div>
          <p className="mt-3 max-w-md text-sm font-bold text-white drop-shadow-sm line-clamp-2">
            {title}
          </p>
          <span className="mt-1.5 text-xs text-white/80 font-medium">
            {t("gallery.watchSource")}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-xl bg-black border border-border/40 shadow-xs",
        className,
      )}
    >
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?rel=0`}
        title={title}
        loading="lazy"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="size-full border-0"
      />
    </div>
  );
}
