import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Eye, EyeOff, RefreshCw, Search } from "lucide-react";
import { Input, Textarea, btnClass } from "@/components/kit";
import {
  AdminChip,
  AdminPanel,
  Ltr,
  PermissionButton,
  Toolbar,
} from "@/components/admin/admin-kit";
import {
  GazaTable,
  GazaTableBody,
  GazaTableCell,
  GazaTableHead,
  GazaTableHeader,
  GazaTableRow,
} from "@/components/gaza-table";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useAdmin } from "@/lib/admin-store";
import { useI18n } from "@/lib/i18n";
import { getGalleryItems, type GalleryDisplayItem } from "@/lib/archive/catalog";
import { getAllSourceRecords } from "@/lib/archive/sources";
import {
  fetchGalleryEditorial,
  saveGalleryDraft,
  discardGalleryDraft,
  publishGallery,
  unpublishGallery,
  restoreGallery,
  buildDefaultGalleryConfiguration,
  type GalleryEditorialDocument,
  type GalleryItemConfig,
} from "@/lib/archive/gallery-publication";
import { MvpApiError } from "@/lib/api/mvp-client";

export interface GalleryEditState {
  dirty: boolean;
  saving: boolean;
}

export interface GalleryPublicationProps {
  onEditState?: (state: GalleryEditState) => void;
}

export function GalleryPublication({ onEditState }: GalleryPublicationProps = {}) {
  const { t, lang: uiLang } = useI18n();
  const { can, toast } = useAdmin();
  const isAr = uiLang === "ar";

  const mayEdit = can("content.edit");
  const mayPublish = can("admin.manage");

  const [editorial, setEditorial] = useState<GalleryEditorialDocument | null>(null);
  const [items, setItems] = useState<GalleryItemConfig[]>([]);
  const [editLang, setEditLang] = useState<"en" | "ar">("en");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [restoreRevision, setRestoreRevision] = useState("");
  const [search, setSearch] = useState("");
  const [reloadConfirmOpen, setReloadConfirmOpen] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);

  const onEditStateRef = useRef(onEditState);
  onEditStateRef.current = onEditState;

  useEffect(() => {
    onEditStateRef.current?.({ dirty, saving });
  }, [dirty, saving]);

  useEffect(() => {
    return () => {
      onEditStateRef.current?.({ dirty: false, saving: false });
    };
  }, []);

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const editorialRef = useRef(editorial);
  editorialRef.current = editorial;


  const loadSeqRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);

  const compiledItems = useMemo(() => getGalleryItems(), []);
  const compiledById = useMemo(() => {
    return new Map<string, GalleryDisplayItem>(compiledItems.map((item) => [item.id, item]));
  }, [compiledItems]);

  const sourcesById = useMemo(() => {
    const list = getAllSourceRecords();
    return new Map(list.map((s) => [s.id, s]));
  }, []);

  const loadData = useCallback(async (force = false) => {
    activeAbortRef.current?.abort();
    const abortController = new AbortController();
    activeAbortRef.current = abortController;

    const seq = ++loadSeqRef.current;
    setLoading(true);
    setLoadError(null);

    try {
      const doc = await fetchGalleryEditorial(abortController.signal);
      if (seq !== loadSeqRef.current || abortController.signal.aborted) return;

      const remoteRev = doc?.currentRevision ?? 0;
      const localRev = editorialRef.current?.currentRevision ?? 0;

      // If we have unsaved local edits and are not forcing an explicit reload:
      if (dirtyRef.current && !force) {
        if (remoteRev > localRev) {
          // A remote-higher revision was detected while having local dirty edits!
          // Do NOT adopt CAS version alone or silently overwrite.
          // Produce conflict state requiring explicit reload confirmation.
          setConflict(true);
          return;
        }
        return;
      }

      setEditorial(doc);
      if (doc?.payload?.items) {
        setItems(doc.payload.items);
      } else {
        // If uninitialized, initialize draft items from compiled catalog
        const defaultCfg = buildDefaultGalleryConfiguration(compiledItems);
        setItems(defaultCfg.items);
      }
      setDirty(false);
      setConflict(false);
    } catch (err) {
      if (seq !== loadSeqRef.current || abortController.signal.aborted) return;
      if (err instanceof MvpApiError && err.status === 404) {
        // Uninitialized gallery document in the selected backend
        if (!dirtyRef.current || force) {
          setEditorial(null);
          const defaultCfg = buildDefaultGalleryConfiguration(compiledItems);
          setItems(defaultCfg.items);
          setDirty(false);
          setConflict(false);
        }
      } else {
        const msg = err instanceof Error ? err.message : "Failed to load gallery publication.";
        setLoadError(msg);
      }
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  }, [compiledItems]);

  useEffect(() => {
    void loadData();
    return () => {
      activeAbortRef.current?.abort();
    };
  }, [loadData]);

  const handleMove = (index: number, direction: "up" | "down") => {
    if (!mayEdit || loading || saving) return;
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const temp = next[index]!;
    next[index] = next[target]!;
    next[target] = temp;
    setItems(next);
    setDirty(true);
  };

  const handleToggleVisible = (index: number) => {
    if (!mayEdit || loading || saving) return;
    const next = [...items];
    next[index] = { ...next[index]!, visible: !next[index]!.visible };
    setItems(next);
    setDirty(true);
  };

  const handleTitleChange = (index: number, val: string) => {
    if (!mayEdit || loading || saving) return;
    const next = [...items];
    const item = next[index]!;
    next[index] = {
      ...item,
      title: {
        ...item.title,
        [editLang]: val,
      },
    };
    setItems(next);
    setDirty(true);
  };

  const handleCaptionChange = (index: number, val: string) => {
    if (!mayEdit || loading || saving) return;
    const next = [...items];
    const item = next[index]!;
    next[index] = {
      ...item,
      caption: {
        ...item.caption,
        [editLang]: val,
      },
    };
    setItems(next);
    setDirty(true);
  };

  const handleRefreshClick = () => {
    if (loading || saving) return;
    if (dirty) {
      setReloadConfirmOpen(true);
    } else {
      void loadData();
    }
  };

  const handleSaveDraft = async () => {
    if (!mayEdit || loading || saving) return;
    setSaving(true);
    try {
      const expectedRevision = editorial?.currentRevision ?? 0;
      const submittedItems = [...items];
      const receipt = await saveGalleryDraft({ items: submittedItems }, expectedRevision);
      toast(isAr ? "تم حفظ المسودة بنجاح" : "Draft saved successfully.");
      setDirty(false);
      setConflict(false);
      setEditorial((prev) =>
        prev
          ? {
              ...prev,
              revisionNumber: receipt.currentRevision,
              currentRevision: receipt.currentRevision,
              draftRevision: receipt.status === "draft" ? receipt.currentRevision : prev.draftRevision,
              hasDraft: receipt.status === "draft",
              status: receipt.status,
              payload: { items: submittedItems },
            }
          : {
              id: "gallery",
              kind: "gallery",
              slug: "default",
              revisionNumber: receipt.currentRevision,
              currentRevision: receipt.currentRevision,
              publishedRevision: null,
              draftRevision: receipt.status === "draft" ? receipt.currentRevision : null,
              status: receipt.status,
              hasDraft: receipt.status === "draft",
              tombstoned: false,
              updatedAt: "",
              payload: { items: submittedItems },
            },
      );
    } catch (err) {
      if (err instanceof MvpApiError && err.status === 409) {
        setConflict(true);
        toast(isAr ? "تعارض في النسخة: قام مستخدم آخر بالتعديل" : "Revision conflict: data changed on server.");
      } else {
        toast(err instanceof Error ? err.message : (isAr ? "فشل حفظ المسودة." : "Failed to save draft."));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardDraftClick = () => {
    if (!mayEdit || loading || saving) return;
    setDiscardDialogOpen(true);
  };

  const handleConfirmDiscard = async () => {
    setDiscardDialogOpen(false);
    if (!mayEdit || loading || saving) return;
    if (editorial?.hasDraft) {
      setSaving(true);
      try {
        const expectedRevision = editorial?.currentRevision ?? 0;
        const doc = await discardGalleryDraft(expectedRevision);
        setEditorial(doc);
        if (doc?.payload?.items) {
          setItems(doc.payload.items);
        } else {
          const defaultCfg = buildDefaultGalleryConfiguration(compiledItems);
          setItems(defaultCfg.items);
        }
        toast(isAr ? "تم إلغاء المسودة" : "Draft discarded.");
        setDirty(false);
        setConflict(false);
      } catch (err) {
        if (err instanceof MvpApiError && err.status === 409) {
          setConflict(true);
          toast(isAr ? "تعارض في النسخة: قام مستخدم آخر بالتعديل" : "Revision conflict: data changed on server.");
        } else {
          toast(err instanceof Error ? err.message : (isAr ? "فشل إلغاء المسودة." : "Failed to discard draft."));
        }
      } finally {
        setSaving(false);
      }
    } else {
      // Revert local in-memory edits to loaded server document or compiled baseline
      if (editorial?.payload?.items) {
        setItems(editorial.payload.items);
      } else {
        const defaultCfg = buildDefaultGalleryConfiguration(compiledItems);
        setItems(defaultCfg.items);
      }
      setDirty(false);
      setConflict(false);
      toast(isAr ? "تم إلغاء التعديلات غير المحفوظة" : "Unsaved edits discarded.");
    }
  };

  const handlePublish = async () => {
    if (!mayPublish || loading || saving || dirty) return;
    setSaving(true);
    try {
      const expectedRevision = editorial?.currentRevision ?? 0;
      const doc = await publishGallery(expectedRevision);
      setEditorial(doc);
      if (doc?.payload?.items) {
        setItems(doc.payload.items);
      }
      toast(isAr ? "تم نشر المعرض للعامة بنجاح" : "Gallery published successfully.");
      setDirty(false);
      setConflict(false);
    } catch (err) {
      if (err instanceof MvpApiError && err.status === 409) {
        setConflict(true);
        toast(isAr ? "تعارض في النسخة: قام مستخدم آخر بالتعديل" : "Revision conflict: data changed on server.");
      } else {
        toast(err instanceof Error ? err.message : (isAr ? "فشل نشر المعرض." : "Failed to publish gallery."));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUnpublish = async () => {
    if (!mayPublish || loading || saving || dirty) return;
    setSaving(true);
    try {
      const expectedRevision = editorial?.currentRevision ?? 0;
      const doc = await unpublishGallery(expectedRevision);
      setEditorial(doc);
      if (doc?.payload?.items) {
        setItems(doc.payload.items);
      }
      toast(isAr ? "تم إلغاء نشر المعرض" : "Gallery unpublished.");
      setDirty(false);
      setConflict(false);
    } catch (err) {
      if (err instanceof MvpApiError && err.status === 409) {
        setConflict(true);
        toast(isAr ? "تعارض في النسخة: قام مستخدم آخر بالتعديل" : "Revision conflict: data changed on server.");
      } else {
        toast(err instanceof Error ? err.message : (isAr ? "فشل إلغاء نشر المعرض." : "Failed to unpublish gallery."));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async () => {
    const revNum = parseInt(restoreRevision, 10);
    if (!mayPublish || loading || saving || dirty || isNaN(revNum) || revNum < 1) return;
    setSaving(true);
    try {
      const expectedRevision = editorial?.currentRevision ?? 0;
      const doc = await restoreGallery(expectedRevision, revNum);
      setEditorial(doc);
      if (doc?.payload?.items) {
        setItems(doc.payload.items);
      }
      setRestoreRevision("");
      toast(isAr ? `تمت استعادة الإصدار ${revNum} بنجاح` : `Restored revision ${revNum} successfully.`);
      setDirty(false);
      setConflict(false);
    } catch (err) {
      if (err instanceof MvpApiError && err.status === 409) {
        setConflict(true);
        toast(isAr ? "تعارض في النسخة: قام مستخدم آخر بالتعديل" : "Revision conflict: data changed on server.");
      } else {
        toast(err instanceof Error ? err.message : (isAr ? "فشل استعادة الإصدار." : "Failed to restore revision."));
      }
    } finally {
      setSaving(false);
    }
  };

  const filteredIndexedItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items
      .map((item, originalIndex) => ({ item, originalIndex }))
      .filter(({ item }) => {
        if (!query) return true;
        const compiled = compiledById.get(item.recordId);
        const titleEn = item.title?.en ?? compiled?.title.en ?? "";
        const titleAr = item.title?.ar ?? compiled?.title.ar ?? "";
        return (
          item.recordId.toLowerCase().includes(query) ||
          titleEn.toLowerCase().includes(query) ||
          titleAr.includes(query)
        );
      });
  }, [items, search, compiledById]);

  return (
    <div className="space-y-6">
      {/* Header controls & stats */}
      <AdminPanel
        title={isAr ? "إدارة نشر المعرض التوثيقي" : "Archive Gallery Publication"}
        description={
          isAr
            ? "اختيار وترتيب السجلات التوثيقية وتعديل العناوين والشروح المعروضة مباشرة في قاعدة البيانات المشتركة"
            : "Choose the displayed records, their order and bilingual titles and captions."
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div className="flex flex-wrap items-center gap-2">
            {loading ? (
              <AdminChip tone="muted">{isAr ? "جاري التحميل..." : "Loading..."}</AdminChip>
            ) : dirty ? (
              <AdminChip tone="warn">{isAr ? "تغييرات غير محفوظة" : "Unsaved Changes"}</AdminChip>
            ) : editorial?.hasDraft ? (
              <AdminChip tone="info">{isAr ? "مسودة خادم نشطة" : "Active Server Draft"}</AdminChip>
            ) : editorial?.tombstoned ? (
              <AdminChip tone="danger">{isAr ? "معلق (ملغي النشر)" : "Unpublished"}</AdminChip>
            ) : editorial?.publishedRevision ? (
              <AdminChip tone="brand">{isAr ? "منشور للعامة" : "Published Live"}</AdminChip>
            ) : (
              <AdminChip tone="muted">{isAr ? "معرض أولي مبدئي" : "Initial Compiled Baseline"}</AdminChip>
            )}

            <span className="text-xs text-muted-foreground ms-2">
              {isAr ? "الإصدار الحالي" : "Current Rev"}:{" "}
              <bdi dir="ltr" className="font-mono font-medium">
                {editorial?.currentRevision ?? 0}
              </bdi>
            </span>

            {editorial?.publishedRevision && (
              <span className="text-xs text-muted-foreground">
                ({isAr ? "المنشور" : "Published"}: <bdi dir="ltr">{editorial.publishedRevision}</bdi>)
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Lang switcher for edit inputs */}
            <div role="group" aria-label="Editing language" className="flex rounded border border-border bg-card p-0.5">
              <button
                type="button"
                className={btnClass(editLang === "en" ? "secondary" : "ghost", "sm")}
                onClick={() => setEditLang("en")}
                disabled={loading || saving}
              >
                English
              </button>
              <button
                type="button"
                className={btnClass(editLang === "ar" ? "secondary" : "ghost", "sm")}
                onClick={() => setEditLang("ar")}
                disabled={loading || saving}
              >
                العربية
              </button>
            </div>

            <button
              type="button"
              className={btnClass("outline", "sm")}
              onClick={handleRefreshClick}
              disabled={loading || saving}
              aria-label={isAr ? "تحديث" : "Refresh"}
              title={isAr ? "تحديث" : "Refresh"}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Conflict Warning */}
        {conflict && (
          <div role="alert" className="mt-4 flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span>
                {isAr
                  ? "تم تحديث بيانات المعرض على الخادم من قبل مستخدم آخر. يرجى التحديث وإعادة المحاولة."
                  : "Gallery publication was modified on the server by another staff session. Please reload to view current state."}
              </span>
            </div>
            <button
              type="button"
              className={btnClass("destructive", "sm")}
              onClick={handleRefreshClick}
              disabled={loading || saving}
            >
              {isAr ? "إعادة تحميل" : "Reload"}
            </button>
          </div>
        )}

        {loadError && (
          <div role="alert" className="mt-4 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {loadError}
          </div>
        )}

        {/* Action Command Bar */}
        <div className="mt-4 flex flex-wrap items-center gap-2 pt-2">
          <PermissionButton
            allowed={mayEdit && dirty && !loading && !saving}
            reason={t("adm.edit.readOnly")}
            variant="primary"
            onClick={handleSaveDraft}
          >
            {isAr ? "حفظ المسودة" : "Save Draft"}
          </PermissionButton>

          <PermissionButton
            allowed={mayEdit && (editorial?.hasDraft || dirty) && !loading && !saving}
            reason={t("adm.edit.readOnly")}
            variant="outline"
            onClick={handleDiscardDraftClick}
          >
            {isAr ? "إلغاء المسودة" : "Discard Draft"}
          </PermissionButton>

          <PermissionButton
            allowed={mayPublish && !dirty && !loading && !saving && (editorial?.hasDraft || editorial?.status === "draft")}
            reason={t("adm.edit.readOnly")}
            variant="primary"
            onClick={handlePublish}
          >
            {isAr ? "نشر للعامة" : "Publish"}
          </PermissionButton>

          <PermissionButton
            allowed={mayPublish && !dirty && !loading && !saving && Boolean(editorial?.publishedRevision) && !editorial?.tombstoned}
            reason={t("adm.edit.readOnly")}
            variant="outline"
            onClick={handleUnpublish}
          >
            {isAr ? "إلغاء النشر" : "Unpublish"}
          </PermissionButton>

          {/* Restore prior published revision */}
          <div className="flex items-center gap-1.5 ms-auto">
            <Input
              type="number"
              min="1"
              placeholder={isAr ? "رقم الإصدار" : "Rev #"}
              value={restoreRevision}
              onChange={(e) => setRestoreRevision(e.target.value)}
              disabled={loading || saving}
              className="w-24 text-xs"
              dir="ltr"
            />
            <PermissionButton
              allowed={mayPublish && !dirty && !loading && !saving && parseInt(restoreRevision, 10) > 0}
              reason={t("adm.edit.readOnly")}
              variant="outline"
              onClick={handleRestore}
            >
              {isAr ? "استعادة إصدار سابق" : "Restore Revision"}
            </PermissionButton>
          </div>
        </div>
      </AdminPanel>

      {/* Item Curation & Order Table */}
      <AdminPanel
        title={isAr ? `قائمة سجلات المعرض (${items.length})` : `Curated Gallery Items (${items.length})`}
        description={
          isAr
            ? "تحديد السجلات المعروضة وترتيبها وتعديل النصوص. الحقول الوثائقية كالمصدر والحقوق وتاريخ الصورة تبقى محددة وثابتة من الأرشيف المعتمد."
            : "Arrange display sequence, visibility, and title/caption overrides. Source provenance, evidence status, and media rights remain authoritative compiled catalog records."
        }
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder={isAr ? "البحث بالمعرف أو العنوان..." : "Search by ID or title..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={loading || saving}
              className="ps-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {isAr ? "المعروض للعامة" : "Visible items"}:{" "}
              <strong>{items.filter((i) => i.visible).length}</strong> / {items.length}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto rounded border border-border">
          <GazaTable>
            <GazaTableHeader>
              <GazaTableRow>
                <GazaTableHead className="w-16 text-center">{isAr ? "الترتيب" : "Order"}</GazaTableHead>
                <GazaTableHead className="w-20 text-center">{isAr ? "الظهور" : "Visible"}</GazaTableHead>
                <GazaTableHead className="w-40">{isAr ? "المعرف والنوع" : "ID & Type"}</GazaTableHead>
                <GazaTableHead className="min-w-[280px]">
                  {isAr ? `العنوان المعروض (${editLang.toUpperCase()})` : `Display Title (${editLang.toUpperCase()})`}
                </GazaTableHead>
                <GazaTableHead className="min-w-[320px]">
                  {isAr ? `الشرح المعروض (${editLang.toUpperCase()})` : `Display Caption (${editLang.toUpperCase()})`}
                </GazaTableHead>
                <GazaTableHead className="w-48">{isAr ? "المصدر والحقوق" : "Source & Rights"}</GazaTableHead>
              </GazaTableRow>
            </GazaTableHeader>
            <GazaTableBody>
              {filteredIndexedItems.map(({ item, originalIndex }) => {
                const compiled = compiledById.get(item.recordId);
                const sourceRef = compiled
                  ? "sourceRefs" in compiled && Array.isArray(compiled.sourceRefs) && compiled.sourceRefs[0]
                    ? compiled.sourceRefs[0]
                    : "sourceRef" in compiled && typeof compiled.sourceRef === "string"
                      ? compiled.sourceRef
                      : undefined
                  : undefined;
                const sourceRecord = sourceRef ? sourcesById.get(sourceRef) : undefined;

                const currentTitle = item.title?.[editLang] ?? compiled?.title[editLang] ?? "";
                const currentCaption = item.caption?.[editLang] ?? compiled?.caption?.[editLang] ?? "";

                return (
                  <GazaTableRow key={item.recordId} className={item.visible ? "" : "opacity-60 bg-muted/20"}>
                    {/* Order / Reorder actions */}
                    <GazaTableCell className="text-center align-middle">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <span className="font-mono text-xs text-muted-foreground font-semibold">
                          {originalIndex + 1}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            aria-label={isAr ? `\u0646\u0642\u0644 ${item.recordId} \u0644\u0623\u0639\u0644\u0649` : `Move ${item.recordId} up`}
                            disabled={!mayEdit || loading || saving || originalIndex === 0}
                            onClick={() => handleMove(originalIndex, "up")}
                            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-20"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={isAr ? `\u0646\u0642\u0644 ${item.recordId} \u0644\u0623\u0633\u0641\u0644` : `Move ${item.recordId} down`}
                            disabled={!mayEdit || loading || saving || originalIndex === items.length - 1}
                            onClick={() => handleMove(originalIndex, "down")}
                            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-20"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </GazaTableCell>

                    {/* Visibility Toggle */}
                    <GazaTableCell className="text-center align-middle">
                      <button
                        type="button"
                        aria-pressed={item.visible}
                        aria-label={isAr ? `\u062a\u063a\u064a\u064a\u0631 \u0638\u0647\u0648\u0631 ${item.recordId}` : `Toggle visibility for ${item.recordId}`}
                        disabled={!mayEdit || loading || saving}
                        onClick={() => handleToggleVisible(originalIndex)}
                        className={`inline-flex items-center justify-center rounded p-1.5 transition-colors ${
                          item.visible
                            ? "bg-brand/10 text-brand hover:bg-brand/20"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        {item.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                    </GazaTableCell>

                    {/* Identifier and Immutable Classification */}
                    <GazaTableCell className="align-top">
                      <div className="space-y-1">
                        <Ltr className="font-mono text-xs font-bold text-foreground">
                          {item.recordId}
                        </Ltr>
                        <div>
                          <AdminChip tone={compiled?.isVideo ? "info" : "muted"}>
                            {compiled?.isVideo ? (isAr ? "فيديو" : "Video") : (compiled?.medium ?? "photo")}
                          </AdminChip>
                        </div>
                        {compiled?.date && (
                          <p className="text-[11px] text-muted-foreground font-mono">
                            {compiled.date}
                          </p>
                        )}
                      </div>
                    </GazaTableCell>

                    {/* Title Override Input */}
                    <GazaTableCell className="align-top">
                      <Input
                        dir={editLang === "ar" ? "rtl" : "ltr"}
                        aria-label={isAr ? `\u0627\u0644\u0639\u0646\u0648\u0627\u0646 ${item.recordId}` : `Display title ${item.recordId}`}
                        maxLength={500}
                        value={currentTitle}
                        disabled={!mayEdit || loading || saving}
                        onChange={(e) => handleTitleChange(originalIndex, e.target.value)}
                        placeholder={compiled?.title[editLang] ?? ""}
                        className="text-xs"
                      />
                    </GazaTableCell>

                    {/* Caption Override Input */}
                    <GazaTableCell className="align-top">
                      <Textarea
                        rows={2}
                        dir={editLang === "ar" ? "rtl" : "ltr"}
                        aria-label={isAr ? `\u0627\u0644\u0634\u0631\u062d ${item.recordId}` : `Display caption ${item.recordId}`}
                        maxLength={2000}
                        value={currentCaption}
                        disabled={!mayEdit || loading || saving}
                        onChange={(e) => handleCaptionChange(originalIndex, e.target.value)}
                        placeholder={compiled?.caption?.[editLang] ?? ""}
                        className="text-xs resize-y"
                      />
                    </GazaTableCell>

                    {/* Provenance and Rights (Compiled Immutable Authority) */}
                    <GazaTableCell className="align-top text-xs text-muted-foreground">
                      <div className="space-y-0.5">
                        {sourceRecord && (
                          <p className="truncate font-medium text-foreground max-w-[180px]" title={sourceRecord.title}>
                            {sourceRecord.title}
                          </p>
                        )}
                        <p className="font-mono text-[11px]">
                          {compiled && "rights" in compiled ? compiled.rights.status : (isAr ? "\u0631\u0627\u062c\u0639 \u0627\u0644\u0645\u0635\u062f\u0631" : "See source")}
                        </p>
                        <p className="text-[11px]">
                          {compiled && "evidenceStatus" in compiled ? compiled.evidenceStatus : (isAr ? "\u0645\u0631\u062c\u0639 \u0627\u0644\u0641\u064a\u062f\u064a\u0648" : "Video reference")}
                        </p>
                      </div>
                    </GazaTableCell>
                  </GazaTableRow>
                );
              })}
            </GazaTableBody>
          </GazaTable>
        </div>
      </AdminPanel>

      {/* Confirm Reload Modal */}
      <ConfirmDialog
        open={reloadConfirmOpen}
        title={t("cms.conflict.confirmTitle")}
        body={t("cms.conflict.confirmDesc")}
        confirmLabel={t("cms.conflict.reload")}
        cancelLabel={t("cms.conflict.keep")}
        pending={loading || saving}
        onConfirm={() => {
          setReloadConfirmOpen(false);
          void loadData(true);
        }}
        onClose={() => setReloadConfirmOpen(false)}
      />

      {/* Discard Draft Modal */}
      <ConfirmDialog
        open={discardDialogOpen}
        title={t("cms.discard.title")}
        body={
          editorial?.hasDraft
            ? (isAr
                ? "هل تريد إلغاء مسودة المعرض المحفوظة على الخادم واستعادة الحالة المنشورة؟"
                : "Discard the server draft and revert to the published gallery configuration?")
            : t("cms.discard.desc")
        }
        confirmLabel={t("cms.discard.confirm")}
        cancelLabel={t("a2.cancel")}
        pending={saving}
        onConfirm={handleConfirmDiscard}
        onClose={() => setDiscardDialogOpen(false)}
      />
    </div>
  );
}
