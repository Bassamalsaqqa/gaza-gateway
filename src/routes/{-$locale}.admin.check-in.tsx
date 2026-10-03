import {
  GazaTable,
  GazaTableBody,
  GazaTableCaption,
  GazaTableCell,
  GazaTableHead,
  GazaTableHeader,
  GazaTableRow,
} from "@/components/gaza-table";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppLink, useAppNavigate } from "@/components/app-link";
import {
  CommercialInput,
  ServiceValue,
  CommercialSeatPicker,
} from "@/components/admin/commercial-fields";
import { commercialErrorKey } from "@/lib/domain/commercial-errors";
import { Field, Input, btnClass } from "@/components/kit";
import {
  AdminChip,
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  GazaSheet,
  Ltr,
  PermissionButton,
  Toolbar,
} from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import { todayISO, mealOptions, assistanceOptions, type Flight } from "@/lib/data";
import { pageHead } from "@/lib/head";
import { cn } from "@/lib/utils";
import {
  useFlightsQuery,
  useBookingsQuery,
  useCompleteCheckInMutation,
  useUndoCheckInMutation,
} from "@/lib/repositories/queries";
import {
  buildAdminCheckInRows,
  sanitizeAdminCheckInSearch,
  type AdminCheckInRow,
  type DeskPassengerStatus,
} from "@/lib/domain/desk";

export interface AdminCheckInSearch {
  date?: string | undefined;
  ref?: string | undefined;
  flightId?: string | undefined;
}

export const Route = createFileRoute("/{-$locale}/admin/check-in")({
  validateSearch: sanitizeAdminCheckInSearch,
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/check-in",
      en: {
        title: "Check-in desk — Gaza International Airport administration",
        description: "Passenger service desk for departures from Gaza.",
      },
      ar: {
        title: "مكتب تسجيل الوصول — إدارة مطار غزة الدولي",
        description: "مكتب خدمة المسافرين للمغادرات من غزة.",
      },
      noindex: true,
    }),
  component: AdminCheckInPage,
});
export type { AdminCheckInRow, DeskPassengerStatus };

const statusTone = (s: DeskPassengerStatus) =>
  s === "done"
    ? "brand"
    : s === "ready"
      ? "info"
      : s === "docs"
        ? "danger"
        : s === "seat"
          ? "warn"
          : "muted";

function AdminCheckInPage() {
  const { t, lang } = useI18n();
  const { can, toast } = useAdmin();
  const search = sanitizeAdminCheckInSearch(Route.useSearch() as Record<string, unknown>);
  const navigate = useAppNavigate();

  const [date, setDate] = useState<string>(() => search.date || todayISO());
  const [selectedFlightId, setSelectedFlightId] = useState<string>(() => search.flightId || "");
  const [query, setQuery] = useState<string>(() => search.ref || "");

  // Gaza physical station departures query
  const { data: flights = [], isLoading: flightsLoading } = useFlightsQuery(date, "dep");
  const gzaFlights = useMemo(() => flights.filter((f) => f.originCode === "GZA"), [flights]);

  // Ensure selectedFlightId points to a valid current flight
  const effectiveFlightId = useMemo(() => {
    if (selectedFlightId && gzaFlights.some((f) => f.id === selectedFlightId)) {
      return selectedFlightId;
    }
    return gzaFlights[0]?.id ?? "";
  }, [selectedFlightId, gzaFlights]);

  const currentFlight = useMemo(
    () => gzaFlights.find((f) => f.id === effectiveFlightId) ?? null,
    [gzaFlights, effectiveFlightId],
  );

  // Canonical bookings query
  const { data: bookings = [], isLoading: bookingsLoading } = useBookingsQuery();

  // Mutations
  const completeCheckInMutation = useCompleteCheckInMutation();
  const undoCheckInMutation = useUndoCheckInMutation();

  // Selected row for detail/check-in sheet
  const [sheetRow, setSheetRow] = useState<AdminCheckInRow | null>(null);
  const [sheetDoc, setSheetDoc] = useState("");
  const [sheetSeat, setSheetSeat] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);

  // Pure rows selector
  const allRows = useMemo(
    () => buildAdminCheckInRows(currentFlight, bookings),
    [currentFlight, bookings],
  );

  // Filtered rows by search query
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.ref.toLowerCase().includes(q) ||
        (r.seat && r.seat.toLowerCase().includes(q)) ||
        (r.document && r.document.toLowerCase().includes(q)),
    );
  }, [allRows, query]);

  // Compute flight departure booked & checkedIn counts from canonical bookings
  const flightCounts = useMemo(() => {
    const map = new Map<string, { booked: number; checkedIn: number }>();
    for (const f of gzaFlights) {
      const matchingRows = buildAdminCheckInRows(f, bookings);
      const booked = matchingRows.length;
      const checkedIn = matchingRows.filter((row) => row.checkedIn).length;
      map.set(f.id, { booked, checkedIn });
    }
    return map;
  }, [gzaFlights, bookings]);

  const mayEdit = can("commercial.edit");

  if (!can("commercial.view")) {
    return <AdminDenied area={t("a2.ci.title")} permission="commercial.view" />;
  }

  const openSheetFor = (r: AdminCheckInRow) => {
    setSheetRow(r);
    setSheetDoc(r.document || "");
    setSheetSeat(r.seat || "");
    setMutationError(null);
  };

  const handleCompleteCheckIn = (
    r: AdminCheckInRow,
    docOverride?: string,
    seatOverride?: string,
  ) => {
    const docToUse = docOverride ?? r.document;
    const seatToUse = seatOverride ?? r.seat;

    if (!docToUse || !docToUse.trim()) {
      openSheetFor(r);
      return;
    }
    if (!seatToUse || !seatToUse.trim()) {
      openSheetFor(r);
      return;
    }

    setMutationError(null);
    completeCheckInMutation.mutate(
      {
        ref: r.ref,
        leg: r.leg,
        selectedPaxIndexes: [r.paxIndex],
        documents: { [r.paxIndex]: docToUse.trim() },
        seats: { [r.paxIndex]: seatToUse.trim().toUpperCase() },
      },
      {
        onSuccess: () => {
          toast(t("a6.saved"));
          setSheetRow(null);
        },
        onError: (err) => {
          const msg = t(commercialErrorKey(err));
          setMutationError(msg);
          toast(msg);
        },
      },
    );
  };

  const handleUndoCheckIn = (r: AdminCheckInRow) => {
    undoCheckInMutation.mutate(
      {
        ref: r.ref,
        leg: r.leg,
        selectedPaxIndexes: [r.paxIndex],
      },
      {
        onSuccess: () => {
          toast(t("a6.saved"));
        },
        onError: (err) => {
          toast(t(commercialErrorKey(err)));
        },
      },
    );
  };

  const statusLabel = (s: DeskPassengerStatus) => {
    if (s === "done") return t("a2.ci.st.done");
    if (s === "ready") return t("a2.ci.st.ready");
    if (s === "docs") return t("a2.ci.st.docs");
    if (s === "seat") return t("a2.ci.st.seat");
    return t("a2.ci.st.closed");
  };

  const actionsFor = (r: AdminCheckInRow) => (
    <div className="flex flex-wrap gap-1.5">
      {r.status === "done" ? (
        <>
          <PermissionButton
            allowed={mayEdit && !undoCheckInMutation.isPending}
            reason={t("adm.edit.readOnly")}
            onClick={() => handleUndoCheckIn(r)}
          >
            {t("a2.ci.undo")}
          </PermissionButton>
          <AppLink
            to="/boarding-pass/$ref/$leg/$pax"
            params={{ ref: r.ref, leg: r.leg, pax: String(r.paxIndex) }}
            className={btnClass("outline", "sm")}
          >
            {t("a2.ci.issue")}
          </AppLink>
        </>
      ) : r.status === "closed" ? (
        <span className="text-xs text-muted-foreground self-center">{statusLabel(r.status)}</span>
      ) : (
        <PermissionButton
          allowed={mayEdit && !completeCheckInMutation.isPending}
          reason={t("adm.edit.readOnly")}
          onClick={() => {
            if (r.status === "ready") {
              handleCompleteCheckIn(r);
            } else {
              openSheetFor(r);
            }
          }}
        >
          {t("a2.ci.checkIn")}
        </PermissionButton>
      )}
      <button type="button" className={btnClass("ghost", "sm")} onClick={() => openSheetFor(r)}>
        {t("a2.ci.viewExtras")}
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("a2.ci.title")}
        description={t("a2.ci.sub")}
        meta={
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              {t("a2.ci.today")}: <Ltr>{date}</Ltr>
            </span>
            <span>·</span>
            <span>
              {gzaFlights.length} {t("adm.fl.title").toLowerCase()}
            </span>
          </div>
        }
      />

      <AdminPanel title={t("a2.ci.today")} bodyClassName="p-0">
        <Toolbar>
          <div className="flex flex-wrap items-center gap-3 w-full">
            <Input
              aria-label={t("a2.ci.search")}
              placeholder={t("a2.ci.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full sm:w-72"
            />
            <div className="flex items-center gap-2 ms-auto">
              <label htmlFor="desk-date" className="text-xs font-semibold text-muted-foreground">
                <Ltr>{t("flights.date")}</Ltr>
              </label>
              <Input
                id="desk-date"
                type="date"
                value={date}
                onChange={(e) => {
                  const val = e.target.value;
                  setDate(val || todayISO());
                  setSelectedFlightId("");
                }}
                className="w-auto text-xs py-1"
              />
            </div>
          </div>
        </Toolbar>

        {flightsLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">{t("a2.bk.loading")}</div>
        ) : gzaFlights.length === 0 ? (
          <AdminEmpty title={t("a2.ci.selectFlight")} body={t("a2.none")} />
        ) : (
          <ul className="flex flex-wrap gap-2 border-b border-border p-3">
            {gzaFlights.map((f) => {
              const counts = flightCounts.get(f.id) ?? { booked: 0, checkedIn: 0 };
              const isSelected = effectiveFlightId === f.id;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedFlightId(f.id)}
                    aria-pressed={isSelected}
                    className={cn(
                      "rounded-md border px-3 py-2 text-start text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      isSelected
                        ? "border-brand bg-brand-soft/40"
                        : "border-border hover:bg-secondary",
                    )}
                  >
                    <span className="block font-bold">
                      <Ltr>{`${f.departTime} · ${f.number}`}</Ltr>
                    </span>
                    <span className="block text-muted-foreground">
                      <Ltr>{`GZA → ${f.destinationCode} · ${t("a2.se.gates")} ${f.gate || "A1"}`}</Ltr>
                    </span>
                    <span className="block text-muted-foreground">
                      <Ltr>{`${counts.checkedIn}/${counts.booked}`}</Ltr>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {rows.length === 0 ? (
          <AdminEmpty
            title={t("a2.ci.selectFlight")}
            body={gzaFlights.length === 0 ? t("a2.none") : t("a2.notFoundBody")}
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto xl:block">
              <GazaTable className="w-full text-sm">
                <GazaTableCaption className="sr-only">{t("a2.ci.title")}</GazaTableCaption>
                <GazaTableHeader>
                  <GazaTableRow className="border-b border-border type-th">
                    {[
                      t("a2.ci.passenger"),
                      "PNR",
                      t("a2.ci.docs"),
                      t("a2.bd.seat"),
                      t("a2.bd.bags"),
                      t("a2.bd.assistance"),
                      t("a2.status"),
                      t("a2.actions"),
                    ].map((h) => (
                      <GazaTableHead key={h} scope="col" className="px-3 py-2 text-start font-bold">
                        {h}
                      </GazaTableHead>
                    ))}
                  </GazaTableRow>
                </GazaTableHeader>
                <GazaTableBody>
                  {rows.map((r) => (
                    <GazaTableRow
                      key={r.id}
                      className="border-b border-border last:border-0 align-top"
                    >
                      <GazaTableCell className="px-3 py-2">
                        <button
                          type="button"
                          className="font-semibold underline decoration-dotted"
                          onClick={() => openSheetFor(r)}
                        >
                          {r.name}
                        </button>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        <Ltr>{r.ref}</Ltr>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        <AdminChip tone={r.document ? "brand" : "danger"}>
                          {t(r.document ? "a2.ci.docsOk" : "a2.ci.docsMissing")}
                        </AdminChip>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        {r.seat ? (
                          <Ltr>{r.seat}</Ltr>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        <Ltr>{r.bags}</Ltr>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2 text-muted-foreground">
                        <ServiceValue value={r.assistance} kind="assistance" />
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        <AdminChip tone={statusTone(r.status)}>{statusLabel(r.status)}</AdminChip>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2">{actionsFor(r)}</GazaTableCell>
                    </GazaTableRow>
                  ))}
                </GazaTableBody>
              </GazaTable>
            </div>

            <ul className="divide-y divide-border xl:hidden">
              {rows.map((r) => (
                <li key={r.id} className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="text-sm font-semibold underline decoration-dotted"
                      onClick={() => openSheetFor(r)}
                    >
                      {r.name}
                    </button>
                    <Ltr className="text-xs text-muted-foreground">{r.ref}</Ltr>
                    <AdminChip tone={statusTone(r.status)}>{statusLabel(r.status)}</AdminChip>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <Ltr>{r.seat ?? "—"}</Ltr> · {t("a2.bd.bags")} <Ltr>{r.bags}</Ltr> ·{" "}
                    <ServiceValue value={r.assistance} kind="assistance" />
                  </p>
                  {actionsFor(r)}
                </li>
              ))}
            </ul>
          </>
        )}
      </AdminPanel>

      <GazaSheet
        open={sheetRow !== null}
        title={t("a2.ci.sheet")}
        description={sheetRow ? `${sheetRow.name} · ${sheetRow.ref}` : ""}
        onClose={() => setSheetRow(null)}
        footer={
          <>
            <button
              type="button"
              className={btnClass("outline", "sm")}
              onClick={() => setSheetRow(null)}
            >
              {t("a2.cancel")}
            </button>
            {sheetRow && sheetRow.status !== "done" && sheetRow.status !== "closed" ? (
              <PermissionButton
                allowed={
                  mayEdit &&
                  !completeCheckInMutation.isPending &&
                  Boolean(sheetDoc.trim()) &&
                  Boolean(sheetSeat.trim())
                }
                reason={t("adm.edit.readOnly")}
                variant="primary"
                onClick={() => {
                  if (sheetRow) {
                    handleCompleteCheckIn(sheetRow, sheetDoc, sheetSeat);
                  }
                }}
              >
                {completeCheckInMutation.isPending ? t("a2.bk.loading") : t("a2.ci.checkIn")}
              </PermissionButton>
            ) : null}
          </>
        }
      >
        {sheetRow ? (
          <div className="space-y-4 text-sm">
            {mutationError ? (
              <div
                role="alert"
                className="p-3 rounded-md bg-status-cancelled/15 text-status-cancelled text-xs"
              >
                {mutationError}
              </div>
            ) : null}

            <dl className="space-y-3">
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">PNR</dt>
                <dd>
                  <Ltr>{sheetRow.ref}</Ltr>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">{t("a2.status")}</dt>
                <dd>
                  <AdminChip tone={statusTone(sheetRow.status)}>
                    {statusLabel(sheetRow.status)}
                  </AdminChip>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">{t("a2.bd.bags")}</dt>
                <dd>
                  <Ltr>{sheetRow.bags}</Ltr>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">{t("a2.bd.meal")}</dt>
                <dd>{sheetRow.meal}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">
                  {t("a2.bd.assistance")}
                </dt>
                <dd className="text-muted-foreground">{sheetRow.assistance ?? t("a2.none")}</dd>
              </div>
            </dl>

            {sheetRow.status !== "done" && sheetRow.status !== "closed" ? (
              <div className="pt-3 border-t border-border space-y-3">
                <Field label={t("a2.ci.docs")} htmlFor="sheet-ci-doc">
                  <CommercialInput
                    error={mutationError ? "a6.err.passengers" : undefined}
                    aria-required="true"
                    id="sheet-ci-doc"
                    dir="ltr"
                    value={sheetDoc}
                    onChange={(e) => setSheetDoc(e.target.value)}
                    placeholder="P1234567"
                  />
                </Field>
                <Field label={t("a2.bd.seat")} htmlFor="sheet-ci-seat">
                  <CommercialInput
                    error={mutationError ? "a6.err.seats" : undefined}
                    aria-required="true"
                    id="sheet-ci-seat"
                    dir="ltr"
                    value={sheetSeat}
                    onChange={(e) => setSheetSeat(e.target.value.trim().toUpperCase())}
                    placeholder="12A"
                  />
                </Field>
                <CommercialSeatPicker
                  flight={currentFlight}
                  cabin={sheetRow.booking.criteria.cabin}
                  seats={{
                    ...sheetRow.booking.seats,
                    [`${sheetRow.leg}-${sheetRow.paxIndex}`]: sheetSeat,
                  }}
                  leg={sheetRow.leg}
                  paxIndex={sheetRow.paxIndex}
                  passengerLabels={sheetRow.booking.passengers.map(
                    (p) => `${p.firstName} ${p.lastName}`,
                  )}
                  onSelect={setSheetSeat}
                />
              </div>
            ) : (
              <dl className="space-y-3 pt-3 border-t border-border">
                <div>
                  <dt className="text-xs font-semibold text-muted-foreground">{t("a2.ci.docs")}</dt>
                  <dd>
                    <Ltr>{sheetRow.document || t("a2.ci.docsMissing")}</Ltr>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-muted-foreground">{t("a2.bd.seat")}</dt>
                  <dd>
                    {sheetRow.seat ? (
                      <Ltr>{sheetRow.seat}</Ltr>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </dd>
                </div>
              </dl>
            )}
          </div>
        ) : null}
      </GazaSheet>
    </div>
  );
}
