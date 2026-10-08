import { CommercialProductsTab } from "@/components/admin/commercial-catalog-editor";
import { Switch } from "@/components/ui/switch";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Field, Input, Select, btnClass } from "@/components/kit";
import {
  AdminChip,
  AdminPageHeader,
  AdminPanel,
  GazaSheet,
  AdminStickyActions,
  AdminTabs,
  Ltr,
  PermissionButton,
} from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { useI18n } from "@/lib/i18n";
import { type CabinId } from "@/lib/data";
import {
  useFleetQuery,
  useCreateAircraftMutation,
  useUpdateAircraftMutation,
  useUpdateLayoutMutation,
  layoutCapacity,
  layoutCabins,
  parseSeatCode,
  aircraftLayoutSchema,
  AIRCRAFT_REGISTRATION_REGEX,
  FleetError,
  newAircraftId,
  type AircraftLayout,
} from "@/lib/fleet";
import { SeatMap } from "@/components/booking/seat-map";
import { useRepositories } from "@/lib/repositories/registry";
import { executeAuditedAdminCommand } from "@/lib/activity";
import { pageHead } from "@/lib/head";

type Tab = "aircraft" | "seatmaps" | "fares" | "baggage" | "meals" | "assistance";

type ProductsSearch = {
  tab?: Tab;
};

export const Route = createFileRoute("/{-$locale}/admin/products")({
  validateSearch: (search: Record<string, unknown>): ProductsSearch => {
    const raw = search["tab"];
    const validTabs: Tab[] = ["aircraft", "seatmaps", "fares", "baggage", "meals", "assistance"];
    if (typeof raw === "string" && validTabs.includes(raw as Tab)) {
      return { tab: raw as Tab };
    }
    return {};
  },
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

function AdminProductsPage() {
  const { t } = useI18n();
  const { can } = useAdmin();
  const search = Route.useSearch();
  const [tab, setTab] = useState<Tab>(search.tab ?? "aircraft");

  useEffect(() => {
    if (search.tab) {
      setTab(search.tab);
    }
  }, [search.tab]);

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
        >
          <div className="p-4">
            {tab === "aircraft" ? <AircraftTab /> : null}
            {tab === "seatmaps" ? <SeatMapTab /> : null}
            {tab === "fares" ? <CommercialProductsTab tab="fares" /> : null}
            {tab === "baggage" ? <CommercialProductsTab tab="baggage" /> : null}
            {tab === "meals" ? <CommercialProductsTab tab="meals" /> : null}
            {tab === "assistance" ? <CommercialProductsTab tab="assistance" /> : null}
          </div>
        </AdminTabs>
      </AdminPanel>
    </div>
  );
}

/* -------------------------------- aircraft -------------------------------- */

function AircraftTab() {
  const { t } = useI18n();
  const { can, toast, actor } = useAdmin();
  const { activity: activityRepo } = useRepositories();
  const mayEdit = can("commercial.edit");
  const fleetQuery = useFleetQuery();
  const createAircraftMutation = useCreateAircraftMutation();
  const updateAircraftMutation = useUpdateAircraftMutation();

  const [draft, setDraft] = useState<{ id: string; model: string; registration: string; active: boolean } | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ model?: string | undefined; registration?: string | undefined }>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  if (fleetQuery.isPending) {
    return <p role="status" className="text-sm text-muted-foreground">{t("adm.ops.loading")}</p>;
  }

  if (fleetQuery.isError || !fleetQuery.data) {
    return <p role="alert" className="text-sm font-semibold text-status-cancelled">{t("adm.ops.loadError")}</p>;
  }

  const aircraftList = fleetQuery.data.aircraft;
  const layouts = fleetQuery.data.layouts;

  const save = async () => {
    if (!draft || !mayEdit) return;
    const errors: { model?: string; registration?: string } = {};
    if (!draft.model.trim() || draft.model.trim().length > 120) {
      errors.model = t("common.fieldRequired");
    }
    if (!AIRCRAFT_REGISTRATION_REGEX.test(draft.registration.trim().toUpperCase())) {
      errors.registration = t("fleet.validation.registration");
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      if (errors.model) {
        document.getElementById("ac-name")?.focus();
      } else if (errors.registration) {
        document.getElementById("ac-reg")?.focus();
      }
      return;
    }

    setSaveError(null);
    try {
      if (isNew) {
        await executeAuditedAdminCommand({
          domainCommand: () =>
            createAircraftMutation.mutateAsync({
              aircraft: {
                id: draft.id,
                model: draft.model.trim(),
                registration: draft.registration.trim().toUpperCase(),
                active: draft.active,
              },
              initialLayout: {
                rows: 28,
                letters: ["A", "B", "C", "D", "E", "F"],
                aisleAfter: 3,
                zones: [{ id: "economy", firstRow: 1, lastRow: 28 }],
                extraLegroomRows: [],
                unavailable: [],
              },
            }),
          activityRepo,
          actor,
          event: {
            module: "fleet",
            action: "created",
            targetType: "aircraft",
            targetId: draft.id,
            metadata: {
              model: draft.model.trim(),
              registration: draft.registration.trim().toUpperCase(),
              active: draft.active,
            },
          },
          onAuditWarning: () => toast(t("a2.ac.auditWarning")),
        });
      } else {
        await executeAuditedAdminCommand({
          domainCommand: () =>
            updateAircraftMutation.mutateAsync({
              id: draft.id,
              patch: {
                model: draft.model.trim(),
                registration: draft.registration.trim().toUpperCase(),
                active: draft.active,
              },
            }),
          activityRepo,
          actor,
          event: {
            module: "fleet",
            action: "updated",
            targetType: "aircraft",
            targetId: draft.id,
            metadata: {
              model: draft.model.trim(),
              registration: draft.registration.trim().toUpperCase(),
              active: draft.active,
            },
          },
          isNoOp: (receipt) => !receipt.changed,
          onAuditWarning: () => toast(t("a2.ac.auditWarning")),
        });
      }
      toast(t("adm.prod.ac.saved", { name: draft.model.trim() }));
      setDraft(null);
    } catch (error) {
      if (error instanceof FleetError && error.reason === "duplicate_registration") {
        setFieldErrors({ registration: t("fleet.validation.registrationTaken") });
        document.getElementById("ac-reg")?.focus();
      } else setSaveError(t("adm.ops.saveError"));
    }
  };

  return (
    <div className="space-y-3" data-testid="fleet-aircraft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold">{t("adm.prod.tab.aircraft")}</h2>
        <PermissionButton
          allowed={mayEdit}
          reason={t("adm.edit.readOnly")}
          variant="primary"
          onClick={() => {
            setIsNew(true);
            setFieldErrors({});
            setSaveError(null);
            setDraft({
              id: newAircraftId(),
              model: "",
              registration: "",
              active: false,
            });
          }}
        >
          <Plus aria-hidden="true" className="size-3.5" />
          {t("adm.prod.ac.new")}
        </PermissionButton>
      </div>

      <ul className="divide-y divide-border rounded-md border border-border">
        {aircraftList.map((a) => {
          const layout = layouts[a.id];
          const capacity = layout ? layoutCapacity(layout) : null;
          const cabinsList = layout ? layoutCabins(layout) : [];

          return (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-semibold">
                  <Ltr>{a.model}</Ltr>{" "}
                  <Ltr className="text-xs text-muted-foreground">{a.registration}</Ltr>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <Ltr>{capacity ?? "—"}</Ltr> · {cabinsList.map((c) => t(`cabin.${c}`)).join(" · ")}
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
                    setFieldErrors({});
                    setSaveError(null);
                    setDraft({
                      id: a.id,
                      model: a.model,
                      registration: a.registration,
                      active: a.active,
                    });
                  }}
                >
                  {t("adm.common.edit")}
                </PermissionButton>
              </div>
            </li>
          );
        })}
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
            <PermissionButton
              allowed={mayEdit}
              reason={t("adm.edit.readOnly")}
              variant="primary"
              disabled={createAircraftMutation.isPending || updateAircraftMutation.isPending}
              onClick={() => void save()}
            >
              {t("adm.edit.save")}
            </PermissionButton>
          </>
        }
      >
        {draft ? (
          <div className="space-y-4">
            {saveError ? (
              <p role="alert" className="text-xs font-semibold text-status-cancelled">
                {saveError}
              </p>
            ) : null}
            <Field label={t("adm.prod.ac.name")} htmlFor="ac-name" error={fieldErrors.model} errorId="ac-name-error">
              <Input
                id="ac-name"
                dir="ltr"
                value={draft.model}
                aria-invalid={Boolean(fieldErrors.model) || undefined}
                aria-describedby={fieldErrors.model ? "ac-name-error" : undefined}
                onChange={(e) => {
                  setDraft({ ...draft, model: e.target.value });
                  if (fieldErrors.model) setFieldErrors((prev) => ({ ...prev, model: undefined }));
                }}
              />
            </Field>
            <Field label={t("adm.prod.ac.reg")} htmlFor="ac-reg" error={fieldErrors.registration} errorId="ac-reg-error">
              <Input
                id="ac-reg"
                dir="ltr"
                value={draft.registration}
                aria-invalid={Boolean(fieldErrors.registration) || undefined}
                aria-describedby={fieldErrors.registration ? "ac-reg-error" : undefined}
                onChange={(e) => {
                  setDraft({ ...draft, registration: e.target.value.toUpperCase() });
                  if (fieldErrors.registration) setFieldErrors((prev) => ({ ...prev, registration: undefined }));
                }}
              />
            </Field>
            {!isNew && layouts[draft.id] ? (
              <div className="rounded-md border border-border bg-secondary/20 p-2.5 text-xs text-muted-foreground space-y-1">
                <p>
                  <span className="font-semibold text-foreground">{t("adm.prod.ac.capacity")}:</span>{" "}
                  <Ltr>{layoutCapacity(layouts[draft.id]!)}</Ltr>
                </p>
                <p>
                  <span className="font-semibold text-foreground">{t("adm.prod.ac.cabins")}:</span>{" "}
                  {layoutCabins(layouts[draft.id]!).map((c) => t(`cabin.${c}`)).join(" · ")}
                </p>
              </div>
            ) : null}
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
  const { can, toast, actor } = useAdmin();
  const { activity: activityRepo } = useRepositories();
  const mayEdit = can("commercial.edit");
  const fleetQuery = useFleetQuery();
  const updateLayoutMutation = useUpdateLayoutMutation();

  const aircraftList = fleetQuery.data?.aircraft ?? [];
  const [selectedId, setSelectedId] = useState<string>("");
  const activeAircraftId = selectedId || (aircraftList[0]?.id ?? "");

  const serverLayout = fleetQuery.data?.layouts[activeAircraftId] ?? null;
  const [draft, setDraft] = useState<AircraftLayout | null>(null);
  const [lettersInput, setLettersInput] = useState<string>("");
  const [extraLegroomInput, setExtraLegroomInput] = useState<string>("");
  const [unavailableInput, setUnavailableInput] = useState<string>("");
  const [loadedLayout, setLoadedLayout] = useState<AircraftLayout | null>(null);
  const [lastLoadedId, setLastLoadedId] = useState<string>("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [fieldErrors, setFieldErrors] = useState<{
    rows?: string | undefined;
    aisle?: string | undefined;
    letters?: string | undefined;
    legroom?: string | undefined;
    unavailable?: string | undefined;
    zones?: string | undefined;
  }>({});

  useEffect(() => {
    if (!serverLayout) return;
    if (activeAircraftId !== lastLoadedId || !isDirty) {
      setDraft(structuredClone(serverLayout));
      setLoadedLayout(serverLayout);
      setLettersInput(serverLayout.letters.join(", "));
      setExtraLegroomInput(serverLayout.extraLegroomRows.join(", "));
      setUnavailableInput(serverLayout.unavailable.join(", "));
      setLastLoadedId(activeAircraftId);
      setIsDirty(false);
      setFieldErrors({});
      setSaveError(null);
    }
  }, [activeAircraftId, serverLayout, lastLoadedId, isDirty]);
  const remoteConflict = isDirty && loadedLayout && serverLayout &&
    JSON.stringify(loadedLayout) !== JSON.stringify(serverLayout);

  if (fleetQuery.isPending) {
    return <p role="status" className="text-sm text-muted-foreground">{t("adm.ops.loading")}</p>;
  }

  if (fleetQuery.isError || !fleetQuery.data) {
    return <p role="alert" className="text-sm font-semibold text-status-cancelled">{t("adm.ops.loadError")}</p>;
  }

  const selectedAircraft = aircraftList.find((a) => a.id === activeAircraftId);

  const save = async () => {
    if (!draft || !mayEdit || remoteConflict) return;
    setSaveError(null);
    setFieldErrors({});

    // Parse tokens without dropping invalid entries before validation
    const letters = lettersInput
      .split(",")
      .map((x) => x.trim().toUpperCase());

    const extraLegroomRows = extraLegroomInput
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x.length > 0)
      .map((x) => Number(x));

    const unavailable = unavailableInput
      .split(",")
      .map((x) => x.trim().toUpperCase())
      .filter((x) => x.length > 0);

    const prospectiveLayout = {
      aircraftId: draft.aircraftId,
      rows: draft.rows,
      letters,
      aisleAfter: draft.aisleAfter,
      zones: draft.zones,
      extraLegroomRows,
      unavailable,
    };

    const validation = aircraftLayoutSchema.safeParse(prospectiveLayout);
    if (!validation.success) {
      const errors: {
        rows?: string | undefined;
        aisle?: string | undefined;
        letters?: string | undefined;
        legroom?: string | undefined;
        unavailable?: string | undefined;
        zones?: string | undefined;
      } = {};

      for (const issue of validation.error.issues) {
        const topField = issue.path[0];
        if (topField === "rows" && !errors.rows) {
          errors.rows = `${t("adm.prod.sm.rows")}: 1–60`;
        } else if (topField === "letters" && !errors.letters) {
          errors.letters = t("adm.prod.sm.lettersHint");
        } else if (topField === "aisleAfter" && !errors.aisle) {
          errors.aisle = `${t("adm.prod.sm.aisle")} (1–${Math.max(1, letters.length - 1)})`;
        } else if (topField === "extraLegroomRows" && !errors.legroom) {
          errors.legroom = t("adm.prod.sm.legroomHint");
        } else if (topField === "unavailable" && !errors.unavailable) {
          errors.unavailable = t("adm.prod.sm.unavailableHint");
        } else if (topField === "zones" && !errors.zones) {
          errors.zones = t("adm.prod.sm.zones");
        }
      }

      setFieldErrors(errors);

      if (errors.rows) {
        document.getElementById("sm-rows")?.focus();
      } else if (errors.aisle) {
        document.getElementById("sm-aisle")?.focus();
      } else if (errors.letters) {
        document.getElementById("sm-letters")?.focus();
      } else if (errors.legroom) {
        document.getElementById("sm-legroom")?.focus();
      } else if (errors.unavailable) {
        document.getElementById("sm-unavail")?.focus();
      } else if (errors.zones) {
        document.querySelector<HTMLInputElement>("#sm-zones input")?.focus();
      }
      return;
    }

    try {
      await executeAuditedAdminCommand({
        domainCommand: () =>
          updateLayoutMutation.mutateAsync({
            aircraftId: draft.aircraftId,
            input: validation.data,
          }),
        activityRepo,
        actor,
        event: {
          module: "fleet",
          action: "updated",
          targetType: "seatmap_layout",
          targetId: draft.aircraftId,
          metadata: {
            aircraftId: draft.aircraftId,
            rows: validation.data.rows,
            capacity: validation.data.rows * validation.data.letters.length,
          },
        },
        isNoOp: (receipt) => !receipt.changed,
        onAuditWarning: () => toast(t("a2.ac.auditWarning")),
      });
      setIsDirty(false);
      setFieldErrors({});
      setSaveError(null);
      toast(t("adm.prod.sm.saved", { name: selectedAircraft ? selectedAircraft.model : draft.aircraftId }));
    } catch {
      setSaveError(t("adm.ops.saveError"));
    }
  };

  const capacity = draft ? layoutCapacity(draft) : 0;
  const cabinsList = draft ? layoutCabins(draft) : [];

  return (
    <div className="space-y-4" data-testid="fleet-seatmaps">
      {remoteConflict ? <p role="alert" className="text-sm text-clay">{t("fleet.remoteConflict")} <button type="button" className={btnClass("outline", "sm")} onClick={() => setIsDirty(false)}>{t("fleet.reloadLayout")}</button></p> : null}

      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("adm.prod.sm.aircraft")} htmlFor="sm-ac" className="w-56">
          <Select
            id="sm-ac"
            dir="ltr"
            value={activeAircraftId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setDraft(null);
              setIsDirty(false);
              setFieldErrors({});
              setSaveError(null);
            }}
          >
            {aircraftList.map((a) => (
              <option key={a.id} value={a.id}>
                {a.model} ({a.registration})
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {!draft ? (
        <p className="text-sm text-muted-foreground">{t("adm.common.empty")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="min-w-0 space-y-3">
            {saveError ? (
              <p role="alert" className="text-xs font-semibold text-status-cancelled">
                {saveError}
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t("adm.prod.sm.rows")}
                htmlFor="sm-rows"
                error={fieldErrors.rows}
                errorId="sm-rows-error"
              >
                <Input
                  id="sm-rows"
                  dir="ltr"
                  type="number"
                  min={1}
                  max={60}
                  value={draft.rows}
                  aria-invalid={Boolean(fieldErrors.rows) || undefined}
                  aria-describedby={fieldErrors.rows ? "sm-rows-error" : undefined}
                  onChange={(e) => {
                    const nextRows = Math.min(60, Math.max(1, Number(e.target.value) || 1));
                    setDraft({ ...draft, rows: nextRows });
                    setIsDirty(true);
                    if (fieldErrors.rows) setFieldErrors((prev) => ({ ...prev, rows: undefined }));
                  }}
                />
              </Field>
              <Field
                label={t("adm.prod.sm.aisle")}
                htmlFor="sm-aisle"
                error={fieldErrors.aisle}
                errorId="sm-aisle-error"
              >
                <Input
                  id="sm-aisle"
                  dir="ltr"
                  type="number"
                  min={1}
                  max={Math.max(1, draft.letters.length - 1)}
                  value={draft.aisleAfter}
                  aria-invalid={Boolean(fieldErrors.aisle) || undefined}
                  aria-describedby={fieldErrors.aisle ? "sm-aisle-error" : undefined}
                  onChange={(e) => {
                    setDraft({ ...draft, aisleAfter: Number(e.target.value) || 1 });
                    setIsDirty(true);
                    if (fieldErrors.aisle) setFieldErrors((prev) => ({ ...prev, aisle: undefined }));
                  }}
                />
              </Field>
              <Field
                label={t("adm.prod.sm.letters")}
                htmlFor="sm-letters"
                hint={t("adm.prod.sm.lettersHint")}
                error={fieldErrors.letters}
                errorId="sm-letters-error"
              >
                <Input
                  id="sm-letters"
                  dir="ltr"
                  value={lettersInput}
                  aria-invalid={Boolean(fieldErrors.letters) || undefined}
                  aria-describedby={fieldErrors.letters ? "sm-letters-error" : undefined}
                  onChange={(e) => {
                    setLettersInput(e.target.value);
                    setIsDirty(true);
                    if (fieldErrors.letters) setFieldErrors((prev) => ({ ...prev, letters: undefined }));
                    const parsed = e.target.value
                      .split(",")
                      .map((x) => x.trim().toUpperCase())
                      .filter(Boolean);
                    if (parsed.length > 0) {
                      setDraft({ ...draft, letters: parsed });
                    }
                  }}
                />
              </Field>
              <Field
                label={t("adm.prod.sm.legroom")}
                htmlFor="sm-legroom"
                hint={t("adm.prod.sm.legroomHint")}
                error={fieldErrors.legroom}
                errorId="sm-legroom-error"
              >
                <Input
                  id="sm-legroom"
                  dir="ltr"
                  value={extraLegroomInput}
                  aria-invalid={Boolean(fieldErrors.legroom) || undefined}
                  aria-describedby={fieldErrors.legroom ? "sm-legroom-error" : undefined}
                  onChange={(e) => {
                    setExtraLegroomInput(e.target.value);
                    setIsDirty(true);
                    if (fieldErrors.legroom) setFieldErrors((prev) => ({ ...prev, legroom: undefined }));
                    const parsed = e.target.value
                      .split(",")
                      .map((x) => Number(x.trim()))
                      .filter((n) => Number.isFinite(n) && n > 0);
                    setDraft({ ...draft, extraLegroomRows: parsed });
                  }}
                />
              </Field>
              <Field
                label={t("adm.prod.sm.unavailable")}
                htmlFor="sm-unavail"
                hint={t("adm.prod.sm.unavailableHint")}
                error={fieldErrors.unavailable}
                errorId="sm-unavail-error"
                className="sm:col-span-2"
              >
                <Input
                  id="sm-unavail"
                  dir="ltr"
                  value={unavailableInput}
                  aria-invalid={Boolean(fieldErrors.unavailable) || undefined}
                  aria-describedby={fieldErrors.unavailable ? "sm-unavail-error" : undefined}
                  onChange={(e) => {
                    setUnavailableInput(e.target.value);
                    setIsDirty(true);
                    if (fieldErrors.unavailable) setFieldErrors((prev) => ({ ...prev, unavailable: undefined }));
                    const parsed = e.target.value
                      .split(",")
                      .map((x) => x.trim().toUpperCase())
                      .filter(Boolean);
                    setDraft({ ...draft, unavailable: parsed });
                  }}
                />
              </Field>
            </div>

            <fieldset id="sm-zones" tabIndex={-1} aria-invalid={Boolean(fieldErrors.zones) || undefined} aria-describedby={fieldErrors.zones ? "sm-zones-error" : undefined} className="min-w-0 rounded-md border border-border p-3 focus-visible:ring-1 focus-visible:ring-ring outline-none">
              <div className="flex items-center justify-between mb-2">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("adm.prod.sm.zones")}
                </legend>
                <div className="flex gap-1.5">
                  {(["business", "premium", "economy"] as CabinId[])
                    .filter((c) => !draft.zones.some((z) => z.id === c))
                    .map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          const order: CabinId[] = ["business", "premium", "economy"];
                          const nextZones = [...draft.zones, { id: c, firstRow: 1, lastRow: draft.rows }].sort(
                            (a, b) => order.indexOf(a.id) - order.indexOf(b.id)
                          );
                          setDraft({ ...draft, zones: nextZones });
                          setIsDirty(true);
                          if (fieldErrors.zones) setFieldErrors((prev) => ({ ...prev, zones: undefined }));
                        }}
                        className="rounded border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-secondary"
                      >
                        + {t(`cabin.${c}`)}
                      </button>
                    ))}
                </div>
              </div>

              {fieldErrors.zones ? (
                <p id="sm-zones-error" className="text-xs text-status-cancelled mb-2 font-semibold">
                  {fieldErrors.zones}
                </p>
              ) : null}

              <div className="space-y-2">
                {draft.zones.map((z, i) => (
                  <div key={z.id} className="flex flex-wrap items-end gap-2">
                    <span className="w-28 text-sm font-semibold">{t(`cabin.${z.id}`)}</span>
                    <Field label={t("adm.prod.sm.zoneFrom")} htmlFor={`z-from-${z.id}`} className="w-20">
                      <Input
                        id={`z-from-${z.id}`}
                        aria-invalid={Boolean(fieldErrors.zones) || undefined}
                        aria-describedby={fieldErrors.zones ? "sm-zones-error" : undefined}
                        dir="ltr"
                        type="number"
                        min={1}
                        value={z.firstRow}
                        onChange={(e) => {
                          const zones = [...draft.zones];
                          zones[i] = { ...z, firstRow: Number(e.target.value) || 1 };
                          setDraft({ ...draft, zones });
                          setIsDirty(true);
                          if (fieldErrors.zones) setFieldErrors((prev) => ({ ...prev, zones: undefined }));
                        }}
                      />
                    </Field>
                    <Field label={t("adm.prod.sm.zoneTo")} htmlFor={`z-to-${z.id}`} className="w-20">
                      <Input
                        id={`z-to-${z.id}`}
                        aria-invalid={Boolean(fieldErrors.zones) || undefined}
                        aria-describedby={fieldErrors.zones ? "sm-zones-error" : undefined}
                        dir="ltr"
                        type="number"
                        min={1}
                        value={z.lastRow}
                        onChange={(e) => {
                          const zones = [...draft.zones];
                          zones[i] = { ...z, lastRow: Number(e.target.value) || 1 };
                          setDraft({ ...draft, zones });
                          setIsDirty(true);
                          if (fieldErrors.zones) setFieldErrors((prev) => ({ ...prev, zones: undefined }));
                        }}
                      />
                    </Field>
                    {draft.zones.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => {
                          const zones = draft.zones.filter((x) => x.id !== z.id);
                          setDraft({ ...draft, zones });
                          setIsDirty(true);
                          if (fieldErrors.zones) setFieldErrors((prev) => ({ ...prev, zones: undefined }));
                        }}
                        className="h-9 px-2 text-xs text-muted-foreground hover:text-status-cancelled"
                        title={t("adm.common.delete")}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </fieldset>

            <AdminStickyActions>
              <button
                type="button"
                onClick={() => {
                  if (serverLayout) {
                    setDraft({ ...serverLayout, zones: serverLayout.zones.map((z) => ({ ...z })) });
                    setLettersInput(serverLayout.letters.join(", "));
                    setExtraLegroomInput(serverLayout.extraLegroomRows.join(", "));
                    setUnavailableInput(serverLayout.unavailable.join(", "));
                    setIsDirty(false);
                    setFieldErrors({});
                    setSaveError(null);
                  }
                }}
                className={btnClass("outline", "sm")}
              >
                {t("adm.edit.cancel")}
              </button>
              <PermissionButton
                allowed={mayEdit}
                reason={t("adm.edit.readOnly")}
                variant="primary"
                disabled={updateLayoutMutation.isPending || Boolean(remoteConflict)}
                onClick={() => void save()}
              >
                {t("adm.edit.save")}
              </PermissionButton>
            </AdminStickyActions>
          </div>

          {/* Passenger-style preview using dynamic SeatMap */}
          <div className="rounded-md border border-border bg-sand p-3" data-testid="seatmap-preview">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">{t("adm.prod.sm.preview")}</p>
              <span className="text-xs font-semibold text-muted-foreground">
                <Ltr>{capacity}</Ltr> · {cabinsList.map((c) => t(`cabin.${c}`)).join(" · ")}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("adm.prod.sm.previewNote")}</p>
            <div className="mt-3">
              <SeatMap layout={draft} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
