import { ChevronDown, ChevronUp, Lock } from "lucide-react";
import { btnClass } from "@/components/kit";
import { AdminChip, Ltr, PermissionButton } from "@/components/admin/admin-kit";
import { useI18n } from "@/lib/i18n";
import {
  HOME_SECTION_POLICY,
  type HomeSection,
  type HomeSectionId,
} from "@/content/types";

export interface CmsSectionListProps {
  sections: HomeSection[];
  mayEdit: boolean;
  onChange: (updatedSections: HomeSection[]) => void;
}

const SECTION_LABEL_MAP: Record<HomeSectionId, string> = {
  hero: "a2.web.hp.hero",
  search: "a2.web.hp.search",
  board: "a2.web.hp.board",
  heritage: "a2.web.hp.story",
  destinations: "a2.web.hp.featured",
  manage: "a2.web.hp.manage",
  travel: "a2.web.hp.shortcuts",
  archive: "a2.web.hp.archive",
};

export function CmsSectionList({ sections, mayEdit, onChange }: CmsSectionListProps) {
  const { t } = useI18n();

  const handleMoveUp = (index: number) => {
    if (index <= 3 || index >= sections.length) return;
    const next = [...sections];
    const prevSec = next[index - 1];
    const currSec = next[index];
    if (!prevSec || !currSec) return;
    next[index - 1] = currSec;
    next[index] = prevSec;
    onChange(next);
  };

  const handleMoveDown = (index: number) => {
    if (index < 3 || index >= sections.length - 1) return;
    const next = [...sections];
    const nextSec = next[index + 1];
    const currSec = next[index];
    if (!nextSec || !currSec) return;
    next[index + 1] = currSec;
    next[index] = nextSec;
    onChange(next);
  };

  const handleToggleVisible = (index: number) => {
    const sec = sections[index];
    if (!sec) return;
    const policy = HOME_SECTION_POLICY[sec.id];
    if (policy.required) return;
    const next = [...sections];
    next[index] = { ...sec, visible: !sec.visible };
    onChange(next);
  };

  return (
    <section aria-labelledby="cms-sections-heading" className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="border-b border-border pb-3">
        <h2 id="cms-sections-heading" className="text-sm font-bold tracking-tight">
          {t("cms.sections.heading")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("cms.sections.requiredHint")}</p>
      </div>

      <ul className="space-y-2">
        {sections.map((sec, index) => {
          const policy = HOME_SECTION_POLICY[sec.id];
          const isRequired = policy.required;
          const canMoveUp = mayEdit && !isRequired && index > 3;
          const canMoveDown = mayEdit && !isRequired && index < sections.length - 1;
          const labelKey = SECTION_LABEL_MAP[sec.id] ?? sec.id;

          return (
            <li
              key={sec.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-secondary/20 p-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="code-id text-xs text-muted-foreground">
                  <Ltr>{index + 1}</Ltr>
                </span>
                <span className="text-sm font-semibold">{t(labelKey)}</span>
                <span className="text-xs text-muted-foreground">
                  (<Ltr>{sec.id}</Ltr>)
                </span>
                {isRequired ? (
                  <AdminChip
                    tone="muted"
                    icon={<Lock aria-hidden="true" className="size-3" />}
                  >
                    {t("cms.sections.required")}
                  </AdminChip>
                ) : (
                  <AdminChip tone={sec.visible ? "brand" : "muted"}>
                    {t(sec.visible ? "a2.visible" : "a2.hidden")}
                  </AdminChip>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {!isRequired ? (
                  <PermissionButton
                    allowed={mayEdit}
                    reason={t("adm.edit.readOnly")}
                    variant={sec.visible ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => handleToggleVisible(index)}
                  >
                    {t(sec.visible ? "a2.visible" : "a2.hidden")}
                  </PermissionButton>
                ) : null}

                <div className="flex gap-1">
                  <PermissionButton
                    allowed={canMoveUp}
                    reason={isRequired ? t("cms.sections.requiredHint") : t("adm.edit.readOnly")}
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMoveUp(index)}
                  >
                    <ChevronUp aria-hidden="true" className="size-4" />
                    <span className="sr-only">{`${t("a2.moveUp")}: ${t(labelKey)}`}</span>
                  </PermissionButton>

                  <PermissionButton
                    allowed={canMoveDown}
                    reason={isRequired ? t("cms.sections.requiredHint") : t("adm.edit.readOnly")}
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMoveDown(index)}
                  >
                    <ChevronDown aria-hidden="true" className="size-4" />
                    <span className="sr-only">{`${t("a2.moveDown")}: ${t(labelKey)}`}</span>
                  </PermissionButton>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
