import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Field, Input, btnClass } from "@/components/kit";
import { GazaSheet, PermissionButton, AdminChip } from "@/components/admin/admin-kit";
import { CommercialCatalogState } from "@/components/commercial-catalog-state";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import { useRepositories } from "@/lib/repositories";
import { useCommercialCatalogQuery } from "@/lib/commercial/queries";
import { parseCommercialCatalog } from "@/lib/commercial/schema";
import { newCommercialOptionId } from "@/lib/commercial/repository";
import { executeAuditedAdminCommand, type ActivityAction } from "@/lib/activity";
import {
  catalogErrorKey,
  CommercialCatalogError,
  type FareProduct,
  type CabinPricing,
  type BaggagePolicy,
  type CatalogOption,
  type CommercialCatalog,
} from "@/lib/commercial/types";

type Tab = "fares" | "baggage" | "meals" | "assistance";
type Edit =
  | { kind: "fare"; value: FareProduct }
  | { kind: "cabin"; value: CabinPricing }
  | { kind: "baggage"; value: BaggagePolicy }
  | { kind: "meals" | "assistance"; value: CatalogOption; isNew?: boolean };
const ordered = <T extends { order: number; id: string }>(values: T[]) =>
  [...values].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
function prospective(catalog: CommercialCatalog, edit: Edit): CommercialCatalog {
  const next = structuredClone(catalog);
  if (edit.kind === "baggage") next.baggage = edit.value;
  else if (edit.kind === "fare")
    next.fares = next.fares.map((f) => (f.id === edit.value.id ? edit.value : f));
  else if (edit.kind === "cabin")
    next.cabins = next.cabins.map((c) => (c.id === edit.value.id ? edit.value : c));
  else if (edit.isNew) next[edit.kind].push(edit.value);
  else next[edit.kind] = next[edit.kind].map((o) => (o.id === edit.value.id ? edit.value : o));
  return parseCommercialCatalog(next);
}
export function CommercialProductsTab({ tab }: { tab: Tab }) {
  const { t, lang } = useI18n();
  const { can, toast, actor } = useAdmin();
  const { commercial, activity: activityRepo } = useRepositories();
  const query = useCommercialCatalogQuery();
  const [edit, setEdit] = useState<Edit | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const mayEdit = can("commercial.edit");
  const mutation = useMutation({ mutationFn: async (action: () => Promise<unknown>) => action() });
  const run = async (
    action: () => Promise<unknown>,
    close = false,
    auditMeta?: {
      action: ActivityAction;
      targetType: string;
      targetId: string;
      metadata?: Record<string, string | number | boolean>;
    },
  ) => {
    if (!mayEdit || mutation.isPending) return;
    setError(null);
    try {
      await executeAuditedAdminCommand({
        domainCommand: () => mutation.mutateAsync(action),
        activityRepo,
        actor,
        event: auditMeta
          ? {
              module: "commercial",
              action: auditMeta.action,
              targetType: auditMeta.targetType,
              targetId: auditMeta.targetId,
              metadata: auditMeta.metadata,
            }
          : undefined,
        isNoOp: (receipt: unknown) =>
          Boolean(
            receipt &&
              typeof receipt === "object" &&
              "changed" in receipt &&
              (receipt as { changed: boolean }).changed === false,
          ),
        onAuditWarning: () => toast(t("a2.ac.auditWarning")),
      });
      toast(t("adm.edit.save"));
      if (close) setEdit(null);
    } catch (e) {
      setError(t(catalogErrorKey(e)));
    }
  };
  const open = (next: Edit) => {
    setFields({});
    setError(null);
    setEdit(structuredClone(next));
  };
  if (!query.data || query.isError) return <CommercialCatalogState />;
  const catalog = query.data.catalog;
  const field = (key: string, label: string, numeric = false, readOnly = false) => {
    if (!edit) return null;
    const parts = key.split(".");
    const object = edit.value as unknown as Record<string, unknown>;
    const current =
      parts.length === 2 ? (object[parts[0]!] as Record<string, unknown>)[parts[1]!] : object[key];
    const id = `catalog-${edit.kind}-${key.replaceAll(".", "-")}`;
    const message = fields[key];
    return (
      <Field
        key={key}
        label={label}
        htmlFor={id}
        error={message ? t(message) : undefined}
        errorId={`${id}-error`}
        hint={readOnly ? t("commercial.fixedAnchor") : undefined}
      >
        <Input
          id={id}
          type={numeric ? "number" : "text"}
          step={numeric ? "any" : undefined}
          dir={
            numeric || key === "cabinDims" || key.endsWith(".en")
              ? "ltr"
              : key.endsWith(".ar")
                ? "rtl"
                : undefined
          }
          value={String(current ?? "")}
          readOnly={readOnly}
          disabled={mutation.isPending}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? `${id}-error` : undefined}
          onChange={(e) =>
            setEdit((prev) => {
              if (!prev) return prev;
              const next = structuredClone(prev);
              const value = numeric ? Number(e.target.value) : e.target.value;
              const obj = next.value as unknown as Record<string, unknown>;
              if (parts.length === 2)
                (obj[parts[0]!] as Record<string, unknown>)[parts[1]!] = value;
              else obj[key] = value;
              return next;
            })
          }
        />
      </Field>
    );
  };
  const bilingual = (key: string, label: string) => (
    <div key={key} className="grid gap-3 sm:grid-cols-2">
      {field(`${key}.en`, `${label} — ${t("adm.common.english")}`)}
      {field(`${key}.ar`, `${label} — ${t("adm.common.arabic")}`)}
    </div>
  );
  const save = async () => {
    if (!edit || !mayEdit || mutation.isPending) return;
    setFields({});
    setError(null);
    try {
      prospective(catalog, edit);
    } catch (e) {
      if (e instanceof CommercialCatalogError) {
        const prefix =
          edit.kind === "fare"
            ? `fares.${catalog.fares.findIndex((f) => f.id === edit.value.id)}.`
            : edit.kind === "cabin"
              ? `cabins.${catalog.cabins.findIndex((c) => c.id === edit.value.id)}.`
              : edit.kind === "baggage"
                ? "baggage."
                : `${edit.kind}.${edit.isNew ? catalog[edit.kind].length : catalog[edit.kind].findIndex((o) => o.id === edit.value.id)}.`;
        const errors = Object.fromEntries(
          Object.entries(e.fields).map(([key, value]) => [
            key.startsWith(prefix) ? key.slice(prefix.length) : key,
            value,
          ]),
        );
        if (errors["fares"]) errors["allowedCabins"] = "commercial.error.invalid_catalog";
        if (errors["defaultMealId"]) errors["active"] = "commercial.error.invalid_catalog";
        setFields(errors);
        setError(t(catalogErrorKey(e)));
        requestAnimationFrame(() =>
          document.querySelector<HTMLElement>('[role="dialog"] [aria-invalid="true"]')?.focus(),
        );
      } else setError(t("commercial.error.retry"));
      return;
    }
    const draft = edit;
    const isNew = "isNew" in draft && Boolean(draft.isNew);
    const targetType = draft.kind === "baggage" ? "baggage_rule" : draft.kind;
    const targetId = draft.kind === "baggage" ? "baggage" : (draft.value as { id: string }).id;
    await run(
      async () => {
        if (draft.kind === "baggage") return commercial.updateBaggageWithReceipt(draft.value);
        const { id, ...patch } = draft.value;
        if (draft.kind === "fare")
          return commercial.updateFareWithReceipt(draft.value.id, patch as Omit<FareProduct, "id">);
        if (draft.kind === "cabin")
          return commercial.updateCabinPricingWithReceipt(draft.value.id, patch as Omit<CabinPricing, "id">);
        if (draft.kind === "meals")
          return draft.isNew
            ? commercial.createMealWithReceipt(draft.value)
            : commercial.updateMealWithReceipt(id, patch as Omit<CatalogOption, "id">);
        return draft.isNew
          ? commercial.createAssistanceWithReceipt(draft.value)
          : commercial.updateAssistanceWithReceipt(id, patch as Omit<CatalogOption, "id">);
      },
      true,
      {
        action: isNew ? "created" : "updated",
        targetType,
        targetId,
        metadata: {
          category: draft.kind,
        },
      },
    );
  };
  const permit = (label: string, action: () => void, disabled = false) => (
    <PermissionButton
      allowed={mayEdit}
      reason={t("adm.edit.readOnly")}
      onClick={action}
      disabled={disabled || mutation.isPending}
    >
      {label}
    </PermissionButton>
  );
  const options = tab === "meals" || tab === "assistance" ? ordered(catalog[tab]) : [];
  return (
    <div data-testid={`commercial-${tab}`} className="space-y-4 min-w-0">
      <p className="text-xs text-muted-foreground">{t("commercial.local")}</p>
      {error && !edit ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {tab === "fares" ? (
        <>
          <ul className="divide-y divide-border rounded-md border border-border">
            {ordered(catalog.fares).map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-semibold break-words">
                    {pick(lang, f.name)}{" "}
                    {f.highlight ? <AdminChip>{t("book.recommended")}</AdminChip> : null}{" "}
                    {!f.active ? <AdminChip>{t("commercial.retired")}</AdminChip> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span dir="ltr">{f.multiplier} ×</span> · {f.checkedBags} ·{" "}
                    {f.allowedCabins.map((c) => t(`cabin.${c}`)).join(" · ")}
                  </p>
                </div>
                {permit(t("adm.common.edit"), () => open({ kind: "fare", value: f }))}
              </li>
            ))}
          </ul>
          <h3 className="text-sm font-bold">{t("commercial.cabinPricing")}</h3>
          <ul className="grid gap-3 sm:grid-cols-3">
            {catalog.cabins.map((c) => (
              <li key={c.id} className="space-y-2 rounded-lg border border-border p-3 text-sm">
                <p>
                  {t(`cabin.${c.id}`)} · <span dir="ltr">{c.multiplier} ×</span>
                </p>
                {permit(t("adm.common.edit"), () => open({ kind: "cabin", value: c }))}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {tab === "baggage" ? (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm">
            {t("commercial.baggageInfo", {
              kg: catalog.baggage.cabinKg,
              dims: catalog.baggage.cabinDims,
              checked: catalog.baggage.checkedKg,
            })}
          </p>
          <p className="text-sm">{pick(lang, catalog.baggage.note)}</p>
          <p className="text-sm">
            {t("adm.prod.bag.extra")}: <span dir="ltr">${catalog.baggage.extraBagPrice}</span>
          </p>
          {permit(t("adm.common.edit"), () => open({ kind: "baggage", value: catalog.baggage }))}
        </div>
      ) : null}
      {tab === "meals" || tab === "assistance" ? (
        <>
          {permit(t("adm.prod.opt.add"), () =>
            open({
              kind: tab,
              isNew: true,
              value: {
                id: newCommercialOptionId(tab === "meals" ? "meal" : "assistance"),
                label: { en: "", ar: "" },
                active: true,
                order: options.length,
              },
            }),
          )}
          <ul className="divide-y divide-border rounded-lg border border-border">
            {options.map((o, i) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold break-words">
                    {pick(lang, o.label)}{" "}
                    {!o.active ? <AdminChip>{t("commercial.retired")}</AdminChip> : null}
                    {tab === "meals" && catalog.defaultMealId === o.id ? (
                      <AdminChip>{t("commercial.default")}</AdminChip>
                    ) : null}
                  </p>
                  <p dir="ltr" className="break-all text-xs text-muted-foreground">
                    {o.id}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {permit(t("adm.common.edit"), () => open({ kind: tab, value: o }))}
                  {permit(
                    t(o.active ? "commercial.retire" : "commercial.activate"),
                    () =>
                      void run(
                        () =>
                          tab === "meals"
                            ? commercial.updateMealWithReceipt(o.id, { active: !o.active })
                            : commercial.updateAssistanceWithReceipt(o.id, { active: !o.active }),
                        false,
                        {
                          action: "status_changed",
                          targetType: tab === "meals" ? "meal" : "assistance",
                          targetId: o.id,
                          metadata: { active: !o.active },
                        },
                      ),
                  )}
                  {tab === "meals" && o.active && catalog.defaultMealId !== o.id
                    ? permit(
                        t("commercial.makeDefault"),
                        () =>
                          void run(
                            () => commercial.setDefaultMealWithReceipt(o.id),
                            false,
                            {
                              action: "updated",
                              targetType: "default_meal",
                              targetId: o.id,
                            },
                          ),
                      )
                    : null}
                  {[-1, 1].map((delta) => (
                    <PermissionButton
                      key={delta}
                      allowed={mayEdit}
                      reason={t("adm.edit.readOnly")}
                      disabled={mutation.isPending || i + delta < 0 || i + delta >= options.length}
                      onClick={() =>
                        void run(
                          () => {
                            const ids = options.map((o) => o.id);
                            [ids[i], ids[i + delta]] = [ids[i + delta]!, ids[i]!];
                            return tab === "meals"
                              ? commercial.reorderMealsWithReceipt(ids)
                              : commercial.reorderAssistanceWithReceipt(ids);
                          },
                          false,
                          {
                            action: "updated",
                            targetType: tab === "meals" ? "meal_order" : "assistance_order",
                            targetId: tab,
                          },
                        )
                      }
                    >
                      {delta < 0 ? t("commercial.moveUp") : t("commercial.moveDown")}
                    </PermissionButton>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <GazaSheet
        open={Boolean(edit)}
        title={t("adm.common.edit")}
        onClose={() => {
          if (!mutation.isPending) setEdit(null);
        }}
        footer={
          <>
            <button
              type="button"
              disabled={mutation.isPending}
              className={btnClass("outline", "sm")}
              onClick={() => setEdit(null)}
            >
              {t("adm.edit.cancel")}
            </button>
            <PermissionButton
              allowed={mayEdit}
              reason={t("adm.edit.readOnly")}
              disabled={mutation.isPending}
              aria-busy={mutation.isPending}
              variant="primary"
              onClick={() => void save()}
            >
              {mutation.isPending ? t("common.loading") : t("adm.edit.save")}
            </PermissionButton>
          </>
        }
      >
        {edit ? (
          <div className="space-y-4">
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {edit.kind === "fare" ? (
              <>
                <p dir="ltr" className="text-xs text-muted-foreground">
                  {edit.value.id}
                </p>
                {bilingual("name", t("adm.prod.fare.name"))}
                <div className="grid gap-3 sm:grid-cols-2">
                  {field(
                    "multiplier",
                    t("commercial.multiplier"),
                    true,
                    edit.value.id === "essential",
                  )}
                  {field("checkedBags", t("adm.prod.fare.bags"), true)}
                  {field("order", t("adm.prod.fare.order"), true)}
                </div>
                <fieldset
                  aria-describedby={fields["allowedCabins"] ? "catalog-cabins-error" : undefined}
                >
                  <legend className="text-sm font-semibold">{t("adm.prod.fare.cabins")}</legend>
                  <div className="mt-2 flex flex-wrap gap-4">
                    {catalog.cabins.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-ring"
                          aria-invalid={fields["allowedCabins"] ? true : undefined}
                          aria-describedby={
                            fields["allowedCabins"] ? "catalog-cabins-error" : undefined
                          }
                          checked={edit.value.allowedCabins.includes(c.id)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setEdit((prev) =>
                              prev?.kind === "fare"
                                ? {
                                    ...prev,
                                    value: {
                                      ...prev.value,
                                      allowedCabins: checked
                                        ? [...prev.value.allowedCabins, c.id]
                                        : prev.value.allowedCabins.filter((id) => id !== c.id),
                                    },
                                  }
                                : prev,
                            );
                          }}
                        />
                        {t(`cabin.${c.id}`)}
                      </label>
                    ))}
                  </div>
                  {fields["allowedCabins"] ? (
                    <p id="catalog-cabins-error" className="text-xs text-destructive">
                      {t(fields["allowedCabins"])}
                    </p>
                  ) : null}
                </fieldset>
                {bilingual("seatSelection", t("adm.prod.fare.seat"))}
                {bilingual("changes", t("adm.prod.fare.changes"))}
                {bilingual("refund", t("adm.prod.fare.refund"))}
                {bilingual("flexibility", t("commercial.flexibility"))}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(edit.value.highlight)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setEdit((prev) =>
                        prev?.kind === "fare"
                          ? { ...prev, value: { ...prev.value, highlight: checked } }
                          : prev,
                      );
                    }}
                  />
                  {t("adm.prod.fare.featured")}
                </label>
              </>
            ) : edit.kind === "cabin" ? (
              field("multiplier", t("commercial.multiplier"), true, edit.value.id === "economy")
            ) : edit.kind === "baggage" ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {field("cabinKg", t("adm.prod.bag.cabinKg"), true)}
                  {field("cabinDims", t("adm.prod.bag.cabinDims"))}
                  {field("checkedKg", t("adm.prod.bag.checkedKg"), true)}
                  {field("extraBagPrice", t("adm.prod.bag.extra"), true)}
                </div>
                {bilingual("note", t("adm.prod.bag.note"))}
              </>
            ) : (
              <>
                {bilingual("label", t("adm.prod.fare.name"))}
                {field("order", t("adm.prod.fare.order"), true)}
              </>
            )}
            {edit.kind !== "baggage" && edit.kind !== "cabin" ? (
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    id="catalog-active"
                    type="checkbox"
                    checked={edit.value.active}
                    aria-invalid={fields["active"] ? true : undefined}
                    aria-describedby={fields["active"] ? "catalog-active-error" : undefined}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setEdit((prev) =>
                        prev && "active" in prev.value
                          ? ({ ...prev, value: { ...prev.value, active: checked } } as Edit)
                          : prev,
                      );
                    }}
                  />
                  {t("commercial.active")}
                </label>
                {fields["active"] ? (
                  <p id="catalog-active-error" className="text-xs text-destructive">
                    {t(fields["active"])}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </GazaSheet>
    </div>
  );
}
