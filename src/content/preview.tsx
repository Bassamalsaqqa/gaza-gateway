import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { contentRepository } from "./repository.ts";
import type { ContentKey, ContentMap } from "./types.ts";
import { useI18n } from "../lib/i18n.tsx";

/** Published first paint matches prerender; browser draft is applied only after hydration. */
export function useContentPreview<K extends ContentKey>(key: K, published: ContentMap[K]): { content: ContentMap[K]; previewing: boolean } {
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const [content, setContent] = useState<ContentMap[K]>(published);
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => {
    const enabled = new URLSearchParams(searchStr).get("contentPreview") === "1";
    if (!enabled) { setContent(published); setPreviewing(false); return; }
    setPreviewing(true);
    let alive = true;
    const refresh = () => { void contentRepository.getPreview(key).then((next) => { if (alive) setContent(next); }); };
    refresh();
    const unsubscribe = contentRepository.subscribe(refresh);
    return () => { alive = false; unsubscribe(); };
  }, [key, published, searchStr]);
  return { content, previewing };
}

export function ContentPreviewNotice() {
  const { t } = useI18n();
  return (
    <aside role="status" className="border-b border-clay bg-sand px-4 py-2 text-center text-sm text-foreground">
      <strong>{t("content.previewTitle")}</strong> · {t("content.previewLocal")} · {t("content.previewUnpublished")}
    </aside>
  );
}
