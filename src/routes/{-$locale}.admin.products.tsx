import { CommercialProductsTab } from "@/components/admin/commercial-catalog-editor";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Field, Input, Select, Textarea, btnClass } from "@/components/kit";
import {
  AdminChip,
  AdminPageHeader,
  AdminPanel,
  GazaSheet,
  AdminStickyActions,
  AdminTabs,
  BilingualStatus,
  Ltr,
  PermissionButton,
} from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { useI18n } from "@/lib/i18n";
import { cabins, type CabinId } from "@/lib/data";
import {
  type AircraftType,
  type SeatMapConfig,
} from "@/lib/admin-ops";
import { pageHead } from "@/lib/head";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/{-$locale}/admin/products")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/products",
      en: {
        title: "Aircraft, products & fares — Gaza International Airport administration",
        description: "Aircraft, seat maps, fares, baggage, meals and assistance offered to travellers.",
      },
      ar: {
        title: "الطائرات والخدمات والأسعار — إدارة مطار غزة الدولي",
        description: "الطائرات وخرائط المقاعد والأجرات والأمتعة والوجبات والمساعدة المتاحة للمسافرين.",
      },
      noindex: true,
    }),
  component: AdminProductsPage,
});

type Tab = "aircraft" | "seatmaps" | "fares" | "baggage" | "meals" | "assistance";

function AdminProductsPage() {
  const { t } = useI18n();
  const { can } = useAdmin();
  const [tab, setTab] = useState<Tab>("aircraft");

  if (!can("commercial.view")) return <AdminDenied area={t("adm.prod.title")} permission="commercial.view" />;

  return (
    <div className="space-y-4">
      <AdminPageHeader title={t("adm.prod.title")} description={t("adm.prod.sub")} />

      <AdminPanel bodyClassName="p-0">
        <AdminTabs
          label={t("adm.prod.tabs")}
          active={tab}
          onChange={setTab}
          tabs={[
            { id: "aircraft" as Tab, label: t("adm.prod.tab.aircraft") },
            { id: "seatmaps" as Tab, label: t("adm.prod.tab.seatmaps") },
            { id: "fares" as Tab, label: t("adm.prod.tab.fares") },
            { id: "baggage" as Tab, label: t("adm.prod.tab.baggage") },
            { id: "meals" as Tab, label: t("adm.prod.tab.meals") },
            { id: "assistance" as Tab, label: t("adm.prod.tab.assistance") },
          ]}
        />
        <div className="p-4">
          {tab === "aircraft" || tab === "seatmaps" ? <p className="mb-4 text-xs text-muted-foreground">{t("commercial.sessionOnly")}</p> : null}
          {tab === "aircraft" ? <AircraftTab /> : null}
          {tab === "seatmaps" ? <SeatMapTab /> : null}
          {tab === "fares" ? <CommercialProductsTab tab="fares" /> : null}
          {tab === "baggage" ? <CommercialProductsTab tab="baggage" /> : null}
          {tab === "meals" ? <CommercialProductsTab tab="meals" /> : null}
          {tab === "assistance" ? <CommercialProductsTab tab="assistance" /> : null}
        </div>
      </AdminPanel>
    </div>
  );
}

/* -------------------------------- aircraft -------------------------------- */

function AircraftTab() {
  const { t } = useI18n();
  const { can, ops, patchOps, toast } = useAdmin();
  const mayEdit = can("commercial.edit");
  const [draft, setDraft] = useState<AircraftType | null>(null);
  const [isNew, setIsNew] = useState(false);

  const save = () => {
    if (!draft) return;
    const list = isNew ? [...ops.aircraft, draft] : ops.aircraft.map((a) => (a.id === draft.id ? draft : a));
    patchOps("aircraft", list);
    if (isNew && !ops.seatMaps[draft.id]) {
      patchOps("seatMaps", { ...ops.seatMaps, [draft.id]: { ...(ops.seatMaps["a320neo"] as SeatMapConfig), aircraftId: draft.id } });
    }
    toast(t("adm.prod.ac.saved", { name: draft.name }));
    setDraft(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold">{t("adm.prod.tab.aircraft")}</h2>
        <PermissionButton
          allowed={mayEdit}
          reason={t("adm.edit.readOnly")}
          variant="primary"
          onClick={() => {
            setIsNew(true);
            setDraft({
              id: `ac-${Date.now()}`,
              name: "",
              registration: "",
              capacity: 168,
              cabins: ["economy"],
              active: true,
            });
          }}
        >
          <Plus aria-hidden="true" className="size-3.5" />
          {t("adm.prod.ac.new")}
        </PermissionButton>
      </div>

      <ul className="divide-y divide-border rounded-md border border-border">
        {ops.aircraft.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="font-semibold">
                <Ltr>{a.name}</Ltr>{" "}
                <Ltr className="text-xs text-muted-foreground">{a.registration}</Ltr>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <Ltr>{a.capacity}</Ltr> · {a.cabins.map((c) => t(`cabin.${c}`)).join(" · ")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <AdminChip tone={a.active ? "brand" : "muted"}>
                {t(a.active ? "adm.common.active" : "adm.common.inactive")}
              </AdminChip>
              <PermissionButton
                allowed={mayEdit}
                reason={t("adm.edit.readOnly")}
                onClick={() => {
                  setIsNew(false);
                  setDraft({ ...a, cabins: [...a.cabins] });
                }}
              >
                {t("adm.common.edit")}
              </PermissionButton>
            </div>
          </li>
        ))}
      </ul>

      <GazaSheet
        open={draft !== null}
        title={isNew ? t("adm.prod.ac.new") : t("adm.prod.ac.edit")}
        onClose={() => setDraft(null)}
        footer={
          <>
            <button type="button" onClick={() => setDraft(null)} className={btnClass("outline", "sm")}>
              {t("adm.edit.cancel")}
            </button>
            <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} variant="primary" onClick={save}>
              {t("adm.edit.save")}
            </PermissionButton>
          </>
        }
      >
        {draft ? (
          <div className="space-y-4">
            <Field label={t("adm.prod.ac.name")} htmlFor="ac-name">
              <Input id="ac-name" dir="ltr" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("adm.prod.ac.reg")} htmlFor="ac-reg">
                <Input
                  id="ac-reg"
                  dir="ltr"
                  value={draft.registration}
                  onChange={(e) => setDraft({ ...draft, registration: e.target.value.toUpperCase() })}
                />
              </Field>
              <Field label={t("adm.prod.ac.capacity")} htmlFor="ac-cap">
                <Input
                  id="ac-cap"
                  dir="ltr"
                  type="number"
                  min={1}
                  value={draft.capacity}
                  onChange={(e) => setDraft({ ...draft, capacity: Number(e.target.value) || 0 })}
                />
              </Field>
            </div>
            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("adm.prod.ac.cabins")}
              </legend>
              <div className="mt-1.5 flex flex-wrap gap-4">
                {cabins.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
                    <Checkbox
                      checked={draft.cabins.includes(c.id)}
                      onCheckedChange={(checked) =>
                        setDraft({
                          ...draft,
                          cabins: checked === true
                            ? [...draft.cabins, c.id]
                            : draft.cabins.filter((x) => x !== c.id),
                        })
                      }
                      className="size-4"
                    />
                    {t(`cabin.${c.id}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex items-center gap-2.5">
              <Switch
                id="ac-draft-active"
                checked={draft.active}
                onCheckedChange={(val) => setDraft({ ...draft, active: val })}
              />
              <label htmlFor="ac-draft-active" className="text-sm font-semibold cursor-pointer select-none">
                {t("adm.common.active")}
              </label>
            </div>
          </div>
        ) : null}
      </GazaSheet>
    </div>
  );
}

/* -------------------------------- seat maps ------------------------------- */

function SeatMapTab() {
  const { t } = useI18n();
  const { can, ops, patchOps, toast } = useAdmin();
  const mayEdit = can("commercial.edit");
  const first = ops.aircraft[0];
  const [aircraftId, setAircraftId] = useState(first ? first.id : "");
  const stored = ops.seatMaps[aircraftId];
  const [draft, setDraft] = useState<SeatMapConfig | null>(stored ?? null);
  const [loaded, setLoaded] = useState(aircraftId);

  if (aircraftId !== loaded) {
    setLoaded(aircraftId);
    setDraft(ops.seatMaps[aircraftId] ?? null);
  }

  const aircraft = ops.aircraft.find((a) => a.id === aircraftId);

  const save = () => {
    if (!draft) return;
    patchOps("seatMaps", { ...ops.seatMaps, [draft.aircraftId]: draft });
    toast(t("adm.prod.sm.saved", { name: aircraft ? aircraft.name : draft.aircraftId }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("adm.prod.sm.aircraft")} htmlFor="sm-ac" className="w-56">
          <Select id="sm-ac" dir="ltr" value={aircraftId} onChange={(e) => setAircraftId(e.target.value)}>
            {ops.aircraft.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {!draft ? (
        <p className="text-sm text-muted-foreground">{t("adm.common.empty")}</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("adm.prod.sm.rows")} htmlFor="sm-rows">
                <Input
                  id="sm-rows"
                  dir="ltr"
                  type="number"
                  min={1}
                  max={60}
                  value={draft.rows}
                  onChange={(e) => setDraft({ ...draft, rows: Math.min(60, Math.max(1, Number(e.target.value) || 1)) })}
                />
              </Field>
              <Field label={t("adm.prod.sm.aisle")} htmlFor="sm-aisle">
                <Input
                  id="sm-aisle"
                  dir="ltr"
                  type="number"
                  min={1}
                  max={draft.letters.length}
                  value={draft.aisleAfter}
                  onChange={(e) => setDraft({ ...draft, aisleAfter: Number(e.target.value) || 1 })}
                />
              </Field>
              <Field label={t("adm.prod.sm.letters")} htmlFor="sm-letters" hint={t("adm.prod.sm.lettersHint")}>
                <Input
                  id="sm-letters"
                  dir="ltr"
                  value={draft.letters.join(", ")}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      letters: e.target.value
                        .split(",")
                        .map((x) => x.trim().toUpperCase())
                        .filter(Boolean),
                    })
                  }
                />
              </Field>
              <Field label={t("adm.prod.sm.legroom")} htmlFor="sm-legroom" hint={t("adm.prod.sm.legroomHint")}>
                <Input
                  id="sm-legroom"
                  dir="ltr"
                  value={draft.extraLegroomRows.join(", ")}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      extraLegroomRows: e.target.value
                        .split(",")
                        .map((x) => Number(x.trim()))
                        .filter((n) => Number.isFinite(n) && n > 0),
                    })
                  }
                />
              </Field>
              <Field
                label={t("adm.prod.sm.unavailable")}
                htmlFor="sm-unavail"
                hint={t("adm.prod.sm.unavailableHint")}
                className="sm:col-span-2"
              >
                <Input
                  id="sm-unavail"
                  dir="ltr"
                  value={draft.unavailable.join(", ")}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      unavailable: e.target.value
                        .split(",")
                        .map((x) => x.trim().toUpperCase())
                        .filter(Boolean),
                    })
                  }
                />
              </Field>
              <Field label={`${t("adm.prod.sm.fee")} — ${t("adm.common.english")}`} htmlFor="sm-fee-en">
                <Input id="sm-fee-en" value={draft.feeLabelEn} onChange={(e) => setDraft({ ...draft, feeLabelEn: e.target.value })} />
              </Field>
              <Field label={`${t("adm.prod.sm.fee")} — ${t("adm.common.arabic")}`} htmlFor="sm-fee-ar">
                <Input id="sm-fee-ar" dir="rtl" value={draft.feeLabelAr} onChange={(e) => setDraft({ ...draft, feeLabelAr: e.target.value })} />
              </Field>
            </div>

            <fieldset className="rounded-md border border-border p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("adm.prod.sm.zones")}
              </legend>
              <div className="space-y-2">
                {draft.zones.map((z, i) => (
                  <div key={z.id} className="flex flex-wrap items-end gap-2">
                    <span className="w-36 text-sm font-semibold">{t(`cabin.${z.id}`)}</span>
                    <Field label={t("adm.prod.sm.zoneFrom")} htmlFor={`z-from-${z.id}`} className="w-24">
                      <Input
                        id={`z-from-${z.id}`}
                        dir="ltr"
                        type="number"
                        min={1}
                        value={z.firstRow}
                        onChange={(e) => {
                          const zones = [...draft.zones];
                          zones[i] = { ...z, firstRow: Number(e.target.value) || 1 };
                          setDraft({ ...draft, zones });
                        }}
                      />
                    </Field>
                    <Field label={t("adm.prod.sm.zoneTo")} htmlFor={`z-to-${z.id}`} className="w-24">
                      <Input
                        id={`z-to-${z.id}`}
                        dir="ltr"
                        type="number"
                        min={1}
                        value={z.lastRow}
                        onChange={(e) => {
                          const zones = [...draft.zones];
                          zones[i] = { ...z, lastRow: Number(e.target.value) || 1 };
                          setDraft({ ...draft, zones });
                        }}
                      />
                    </Field>
                  </div>
                ))}
              </div>
            </fieldset>

            <AdminStickyActions>
              <button type="button" onClick={() => setDraft(stored ?? null)} className={btnClass("outline", "sm")}>
                {t("adm.edit.cancel")}
              </button>
              <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} variant="primary" onClick={save}>
                {t("adm.edit.save")}
              </PermissionButton>
            </AdminStickyActions>
          </div>

          {/* Passenger-style preview */}
          <div className="rounded-md border border-border bg-sand p-3">
            <p className="text-sm font-bold">{t("adm.prod.sm.preview")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("adm.prod.sm.previewNote")}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-3 rounded bg-brand-soft" />
                {t("adm.prod.sm.legend")}
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-3 rounded bg-secondary" />
                {t("adm.prod.sm.legendBlocked")}
              </span>
            </div>
            <div dir="ltr" className="mt-3 max-h-96 overflow-y-auto pe-1">
              {Array.from({ length: draft.rows }, (_, r) => r + 1).map((row) => (
                <div key={row} className="mb-1 flex items-center gap-1">
                  <span className="code-id w-6 shrink-0 text-end text-[0.65rem] text-muted-foreground">{row}</span>
                  {draft.letters.map((letter, idx) => {
                    const id = `${row}${letter}`;
                    const blocked = draft.unavailable.includes(id);
                    const legroom = draft.extraLegroomRows.includes(row);
                    return (
                      <span key={id} className="flex items-center">
                        <span
                          className={cn(
                            "flex size-6 items-center justify-center rounded border text-[0.6rem] font-semibold",
                            blocked
                              ? "border-border bg-secondary text-muted-foreground"
                              : legroom
                                ? "border-brand bg-brand-soft text-brand-deep"
                                : "border-border bg-card",
                          )}
                        >
                          {letter}
                        </span>
                        {idx + 1 === draft.aisleAfter ? <span aria-hidden="true" className="w-3" /> : null}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
