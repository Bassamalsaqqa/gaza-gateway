import { useSuspenseQuery } from "@tanstack/react-query";
import { identityUiRequested } from "../lib/api/identity-ui-runtime.ts";
import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ContentError, type ContentRepository } from "./repository.ts";
import { useRepositories } from "../lib/repositories/registry.ts";
import type { ContentKey, ContentMap } from "./types.ts";
import { useI18n } from "../lib/i18n.tsx";

/** Published first paint matches prerender; browser draft is applied only after hydration. */
function useMockContentPreview<K extends ContentKey>(key: K, published: ContentMap[K]) {
  const { content: contentRepository } = useRepositories();
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const enabled = new URLSearchParams(searchStr).get("contentPreview") === "1";
  const [snapshot, setSnapshot] = useState<{ key: K; source: ContentRepository; published: ContentMap[K]; content: ContentMap[K]; error: ContentError | null; loading: boolean }>({ key, source: contentRepository, published, content: published, error: null, loading: enabled });
  const belongs = snapshot.key === key && snapshot.source === contentRepository && snapshot.published === published;
  useEffect(() => {
    setSnapshot({ key, source: contentRepository, published, content: published, error: null, loading: enabled });
    if (!enabled) return;
    let alive = true;
    let epoch = 0;
    const refresh = () => {
      const request = ++epoch;
      void contentRepository.getPreview(key).then((next) => {
        if (alive && request === epoch) setSnapshot({ key, source: contentRepository, published, content: next, error: null, loading: false });
      }).catch((error: unknown) => {
        if (alive && request === epoch) setSnapshot({ key, source: contentRepository, published, content: published,
          error: error instanceof ContentError ? error : new ContentError("storage_unavailable"), loading: false });
      });
    };
    const unsubscribe = contentRepository.subscribe(refresh);
    refresh();
    return () => { alive = false; unsubscribe(); };
  }, [key, published, enabled, contentRepository]);
  return {
    content: enabled && belongs ? snapshot.content : published,
    previewing: enabled,
    previewError: enabled && belongs ? snapshot.error : null,
    previewLoading: enabled && (!belongs || snapshot.loading),
  };
}

export function ContentPreviewNotice({ error = null, loading = false }: { error?: ContentError | null; loading?: boolean }) {
  const { t, lang } = useI18n();
  return (
    <aside role={error ? "alert" : "status"} className="border-b border-clay bg-sand px-4 py-2 text-center text-sm text-foreground">
      <strong>{t("content.previewTitle")}</strong> · {identityUiRequested ? (lang === "ar" ? "مسودة الخادم" : "Server draft") : t("content.previewLocal")} · {t("content.previewUnpublished")}
      {error && <p>{lang === "ar" ? "تعذر تحميل المسودة المحلية. يظهر المحتوى المنشور؛ لم تُغيّر المسودة." : "The local draft could not be loaded. Published content is shown; the draft has not been changed."}</p>}
      {loading && <p>{lang === "ar" ? "جارٍ تحميل المسودة المحلية…" : "Loading the local draft…"}</p>}
    </aside>
  );
}

/** The chosen mode is immutable for this application build; hook order cannot switch mid-session. */
export const useContentPreview = identityUiRequested ? useServerContentPreview : useMockContentPreview;
function useServerContentPreview<K extends ContentKey>(key: K, _compiled: ContentMap[K]) {
  const { content: repository } = useRepositories();
  const search = useRouterState({ select: state => state.location.searchStr });
  const previewing = new URLSearchParams(search).get("contentPreview") === "1";
  const result = useSuspenseQuery({ queryKey: ["content", "mvp", previewing ? "staff-preview" : "public", key], retry: false,
    staleTime: 0, refetchOnWindowFocus: "always", queryFn: () => previewing ? repository.getPreview(key) : repository.getPublished(key),
  });
  // A failed background refresh cannot resurrect stale content after an unpublish.
  if (result.error) throw result.error;
  return { content: result.data, previewing, previewError: null, previewLoading: false };
}
