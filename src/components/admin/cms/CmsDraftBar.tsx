import { btnClass } from "@/components/kit";
import { AdminChip, PermissionButton } from "@/components/admin/admin-kit";
import { useI18n } from "@/lib/i18n";
import { useState } from "react";

export interface CmsDraftBarProps {
  mayEdit: boolean;
  draftReady: boolean;
  dirty: boolean;
  savedDraft: unknown | null;
  saving: boolean;
  unavailable?: boolean;
  previewUrlEn: string;
  previewUrlAr: string;
  onSave: () => void;
  onDiscard: () => void;
  publication?: { revision: number | undefined; mayPublish: boolean; transition: (action: "publish" | "unpublish" | "restore", targetRevision?: number) => Promise<boolean> } | undefined;
}

export function CmsDraftBar({
  mayEdit,
  draftReady,
  dirty,
  savedDraft,
  saving,
  unavailable = false,
  previewUrlEn,
  previewUrlAr,
  onSave,
  onDiscard,
  publication,
}: CmsDraftBarProps) {
  const { t, lang } = useI18n();
  const [restoreRevision, setRestoreRevision] = useState("");
  const ar = lang === "ar";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!draftReady ? (
        <AdminChip tone="muted">{t(unavailable ? "cms.unavailable" : "cms.loading")}</AdminChip>
      ) : dirty ? (
        <AdminChip tone="warn">{t("content.unsavedChanges")}</AdminChip>
      ) : savedDraft !== null ? (
        <AdminChip tone="info">{publication ? (ar ? "مسودة على الخادم" : "Server draft") : t("content.localDraft")}</AdminChip>
      ) : (
        <AdminChip tone="brand">{publication ? (ar ? "المحتوى الحالي" : "Current content") : t("content.compiledPublished")}</AdminChip>
      )}

      <PermissionButton
        allowed={mayEdit && draftReady && dirty && !saving}
        reason={t("adm.edit.readOnly")}
        variant="primary"
        onClick={onSave}
      >
        {t("a2.saveDraft")}
      </PermissionButton>

      <a
        href={previewUrlEn}
        target="_blank"
        rel="noreferrer"
        className={btnClass("outline", "sm")}
      >
        {t("a2.previewEn")}
      </a>

      <a
        href={previewUrlAr}
        target="_blank"
        rel="noreferrer"
        className={btnClass("outline", "sm")}
      >
        {t("a2.previewAr")}
      </a>

      <PermissionButton
        allowed={mayEdit && draftReady && (savedDraft !== null || dirty) && !saving}
        reason={t("adm.edit.readOnly")}
        variant="outline"
        onClick={onDiscard}
      >
        {t("content.discardDraft")}
      </PermissionButton>
      {publication ? <>
        <span className="text-xs text-muted-foreground">{ar ? "الإصدار" : "Revision"}: <bdi dir="ltr">{publication.revision ?? "—"}</bdi></span>
        <PermissionButton allowed={publication.mayPublish && draftReady && !dirty && !saving && savedDraft !== null} reason={t("adm.edit.readOnly")} variant="primary" onClick={() => void publication.transition("publish")}>
          {ar ? "نشر" : "Publish"}
        </PermissionButton>
        <PermissionButton allowed={publication.mayPublish && draftReady && !dirty && !saving && (publication.revision ?? 0) > 0} reason={t("adm.edit.readOnly")} variant="outline" onClick={() => void publication.transition("unpublish")}>
          {ar ? "إلغاء النشر" : "Unpublish"}
        </PermissionButton>
        <label className="text-xs">{ar ? "إصدار محفوظ للاستعادة" : "Saved revision to restore"}
          <input type="number" min="1" dir="ltr" value={restoreRevision} onChange={event => setRestoreRevision(event.target.value)} className="ms-2 w-20 rounded border border-border bg-card p-2 focus-visible:outline-ring" />
        </label>
        <PermissionButton allowed={publication.mayPublish && draftReady && !dirty && !saving && Number.isSafeInteger(Number(restoreRevision)) && Number(restoreRevision) > 0} reason={t("adm.edit.readOnly")} variant="outline" onClick={() => void publication.transition("restore", Number(restoreRevision))}>
          {ar ? "استعادة" : "Restore"}
        </PermissionButton>
      </> : null}
    </div>
  );
}
