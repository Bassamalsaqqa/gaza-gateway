import { useEffect, useMemo, useState, useCallback } from "react";
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

export function GalleryPublication() {
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

  const compiledItems = useMemo(() => getGalleryItems(), []);
  const compiledById = useMemo(() => {
    return new Map<string, GalleryDisplayItem>(compiledItems.map((item) => [item.id, item]));
  }, [compiledItems]);

  const sourcesById = useMemo(() => {
    const list = getAllSourceRecords();
    return new Map(list.map((s) => [s.id, s]));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setConflict(false);
    try {
      const doc = await fetchGalleryEditorial();
      setEditorial(doc);
      if (doc?.payload?.items) {
        setItems(doc.payload.items);
      } else {
        // If uninitialized, initialize draft items from compiled catalog
        const defaultCfg = buildDefaultGalleryConfiguration(compiledItems);
        setItems(defaultCfg.items);
      }
      setDirty(false);
    } catch (err) {
      if (err instanceof MvpApiError && err.status === 404) {
        // Uninitialized document in PostgreSQL
        setEditorial(null);
        const defaultCfg = buildDefaultGalleryConfiguration(compiledItems);
        setItems(defaultCfg.items);
        setDirty(false);
      } else {
        const msg = err instanceof Error ? err.message : "Failed to load gallery publication.";
        setLoadError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [compiledItems]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleMove = (index: number, direction: "up" | "down") => {
    if (!mayEdit) return;
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
    if (!mayEdit) return;
    const next = [...items];
    next[index] = { ...next[index]!, visible: !next[index]!.visible };
    setItems(next);
    setDirty(true);
  };

  const handleTitleChange = (index: number, val: string) => {
    if (!mayEdit) return;
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
    if (!mayEdit) return;
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

  const handleSaveDraft = async () => {
    if (!mayEdit || saving) return;
    setSaving(true);
    try {
      const expectedRevision = editorial?.currentRevision ?? 0;
      await saveGalleryDraft({ items }, expectedRevision);
      toast(isAr ? "تم حفظ المسودة بنجاح" : "Draft saved successfully.");
      setDirty(false);
      // Refresh state
      await loadData();
    } catch (err) {
      if (err instanceof MvpApiError && err.status === 409) {
        setConflict(true);
        toast(isAr ? "تعارض في النسخة: قام مستخدم آخر بالتعديل" : "Revision conflict: data changed on server.");
      } else {
        toast(err instanceof Error ? err.message : "Failed to save draft.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardDraft = async () => {
    if (!mayEdit || saving) return;
    setSaving(true);
    try {
      const expectedRevision = editorial?.currentRevision ?? 0;
      await discardGalleryDraft(expectedRevision);
      toast(isAr ? "تم إلغاء المسودة" : "Draft discarded.");
      setDirty(false);
      await loadData();
    } catch (err) {
      if (err instanceof MvpApiError && err.status === 409) {
        setConflict(true);
      }
      toast(err instanceof Error ? err.message : "Failed to discard draft.");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!mayPublish || saving || dirty) return;
    setSaving(true);
    try {
      const expectedRevision = editorial?.currentRevision ?? 0;
      const doc = await publishGallery(expectedRevision);
      setEditorial(doc);
      toast(isAr ? "تم نشر المعرض للعامة بنجاح" : "Gallery published successfully.");
      await loadData();
    } catch (err) {
      if (err instanceof MvpApiError && err.status === 409) {
        setConflict(true);
      }
      toast(err instanceof Error ? err.message : "Failed to publish gallery.");
    } finally {
      setSaving(false);
    }
  };

  const handleUnpublish = async () => {
    if (!mayPublish || saving || dirty) return;
    setSaving(true);
    try {
      const expectedRevision = editorial?.currentRevision ?? 0;
      const doc = await unpublishGallery(expectedRevision);
      setEditorial(doc);
      toast(isAr ? "تم إلغاء نشر المعرض" : "Gallery unpublished.");
      await loadData();
    } catch (err) {
      if (err instanceof MvpApiError && err.status === 409) {
        setConflict(true);
      }
      toast(err instanceof Error ? err.message : "Failed to unpublish gallery.");
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async () => {
    const revNum = parseInt(restoreRevision, 10);
    if (!mayPublish || saving || dirty || isNaN(revNum) || revNum < 1) return;
    setSaving(true);
    try {
      const expectedRevision = editorial?.currentRevision ?? 0;
      const doc = await restoreGallery(expectedRevision, revNum);
      setEditorial(doc);
      setRestoreRevision("");
      toast(isAr ? `تمت استعادة الإصدار ${revNum} بنجاح` : `Restored revision ${revNum} successfully.`);
      await loadData();
    } catch (err) {
      if (err instanceof MvpApiError && err.status === 409) {
        setConflict(true);
      }
      toast(err instanceof Error ? err.message : "Failed to restore revision.");
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
              >
                English
              </button>
              <button
                type="button"
                className={btnClass(editLang === "ar" ? "secondary" : "ghost", "sm")}
                onClick={() => setEditLang("ar")}
              >
                العربية
              </button>
            </div>

            <button
              type="button"
              className={btnClass("outline", "sm")}
              onClick={() => void loadData()}
              disabled={loading || saving}
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
              onClick={() => void loadData()}
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
            allowed={mayEdit && dirty && !saving}
            reason={t("adm.edit.readOnly")}
            variant="primary"
            onClick={handleSaveDraft}
          >
            {isAr ? "حفظ المسودة" : "Save Draft"}
          </PermissionButton>

          <PermissionButton
            allowed={mayEdit && (editorial?.hasDraft || dirty) && !saving}
            reason={t("adm.edit.readOnly")}
            variant="outline"
            onClick={handleDiscardDraft}
          >
            {isAr ? "إلغاء المسودة" : "Discard Draft"}
          </PermissionButton>

          <PermissionButton
            allowed={mayPublish && !dirty && !saving && (editorial?.hasDraft || editorial?.status === "draft")}
            reason={t("adm.edit.readOnly")}
            variant="primary"
            onClick={handlePublish}
          >
            {isAr ? "نشر للعامة" : "Publish"}
          </PermissionButton>

          <PermissionButton
            allowed={mayPublish && !dirty && !saving && Boolean(editorial?.publishedRevision) && !editorial?.tombstoned}
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
              className="w-24 text-xs"
              dir="ltr"
            />
            <PermissionButton
              allowed={mayPublish && !dirty && !saving && parseInt(restoreRevision, 10) > 0}
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
                            disabled={!mayEdit || originalIndex === 0}
                            onClick={() => handleMove(originalIndex, "up")}
                            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-20"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={isAr ? `\u0646\u0642\u0644 ${item.recordId} \u0644\u0623\u0633\u0641\u0644` : `Move ${item.recordId} down`}
                            disabled={!mayEdit || originalIndex === items.length - 1}
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
                        disabled={!mayEdit}
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
                        disabled={!mayEdit}
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
                        disabled={!mayEdit}
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
    </div>
  );
}
