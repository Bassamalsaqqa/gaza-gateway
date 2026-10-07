import { btnClass } from "@/components/kit";
import { AdminChip, PermissionButton } from "@/components/admin/admin-kit";
import { useI18n } from "@/lib/i18n";

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
}: CmsDraftBarProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!draftReady ? (
        <AdminChip tone="muted">{t(unavailable ? "cms.unavailable" : "cms.loading")}</AdminChip>
      ) : dirty ? (
        <AdminChip tone="warn">{t("content.unsavedChanges")}</AdminChip>
      ) : savedDraft !== null ? (
        <AdminChip tone="info">{t("content.localDraft")}</AdminChip>
      ) : (
        <AdminChip tone="brand">{t("content.compiledPublished")}</AdminChip>
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
    </div>
  );
}
