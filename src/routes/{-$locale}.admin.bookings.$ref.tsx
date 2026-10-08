import { validateBookingExtras } from "@/lib/domain/booking-validation";
import { serviceOptions } from "@/lib/commercial/pricing";
import { useCommercialOptions } from "@/lib/commercial/queries";
import { CommercialCatalogState } from "@/components/commercial-catalog-state";
import {
  CommercialInput,
  AssistanceChoices,
  ServiceValue,
  CommercialSeatPicker,
} from "@/components/admin/commercial-fields";
import { commercialErrorKey, commercialFieldErrors } from "@/lib/domain/commercial-errors";
import { validateUpdateSeatsAssignments } from "@/lib/domain/seat-validation";
import { validateBookingContact } from "@/lib/domain/booking-validation";
import { cabins } from "@/lib/data";
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
import { AppLink } from "@/components/app-link";
import { Field, Input, Select, btnClass } from "@/components/kit";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  AdminChip,
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  GazaSheet,
  AdminTabs,
  Ltr,
  PermissionButton,
} from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import { money } from "@/lib/format";
import { type MockBookingStatus, type MockPassenger } from "@/lib/admin-mock";
import { pageHead } from "@/lib/head";
import { resolveBookingPricing } from "@/lib/commercial/pricing";
import {
  useBookingQuery,
  useBookingEffectiveFlights,
  useBookingsQuery,
  useCancelBookingMutation,
  useUpdateBookingContactMutation,
  useUpdateBookingSeatsMutation,
  useUpdateBookingExtrasMutation,
  getCanonicalOccupiedSeats,
} from "@/lib/repositories";
import {
  bookingToMockBooking,
  isPaxCheckedIn,
  resolveBookingLegLayout,
  type AdaptedAdminBooking,
  type AdaptedAdminPassenger,
} from "@/lib/domain/booking";
import type { PaxExtras } from "@/lib/booking-draft";
import { emptyPaxExtras } from "@/lib/booking-draft";
import { useRepositories } from "@/lib/repositories/registry";
import { executeAuditedAdminCommand } from "@/lib/activity";

export const Route = createFileRoute("/{-$locale}/admin/bookings/$ref")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: `/admin/bookings/${params.ref}`,
      en: {
        title: `Booking ${params.ref} — Gaza International Airport administration`,
        description: "Booking record, passengers, seats, extras and check-in.",
      },
      ar: {
        title: `الحجز ${params.ref} — إدارة مطار غزة الدولي`,
        description: "سجل الحجز والمسافرون والمقاعد والإضافات وتسجيل الوصول.",
      },
      noindex: true,
    }),
  component: AdminBookingDetailPage,
});

type Tab = "overview" | "passengers" | "seats" | "checkin" | "history";
type SheetKind = "contact" | "seat" | "extras" | null;

function statusTone(status: MockBookingStatus) {
  return status === "cancelled"
    ? "danger"
    : status === "partial"
      ? "warn"
      : status === "checkedin"
        ? "brand"
        : status === "upcoming"
          ? "info"
          : "neutral";
}

function AdminBookingDetailPage() {
  const { ref } = Route.useParams();
  const { t, lang } = useI18n();
  const commercial = useCommercialOptions();
  const { fares, mealOptions } = commercial;
  const { can, toast, actor } = useAdmin();
  const { activity: activityRepo } = useRepositories();
  const [tab, setTab] = useState<Tab>("overview");
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const { data: canonicalBooking, isPending, isError } = useBookingQuery(ref);
  const effectiveFlights = useBookingEffectiveFlights(canonicalBooking);
  const { data: allBookings = [] } = useBookingsQuery();
  const cancelBookingMutation = useCancelBookingMutation();
  const updateContactMutation = useUpdateBookingContactMutation();
  const updateSeatsMutation = useUpdateBookingSeatsMutation();
  const updateExtrasMutation = useUpdateBookingExtrasMutation();
  const [editContact, setEditContact] = useState({ email: "", phone: "" });
  const [editSeats, setEditSeats] = useState<Record<string, string>>({});
  const [editExtras, setEditExtras] = useState<PaxExtras[]>([]);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const booking = useMemo<AdaptedAdminBooking | undefined>(() => {
    if (canonicalBooking) return bookingToMockBooking({ ...canonicalBooking, outbound: effectiveFlights.outbound.effectiveFlight ?? canonicalBooking.outbound, inbound: effectiveFlights.inbound?.effectiveFlight ?? canonicalBooking.inbound });
    return undefined;
  }, [canonicalBooking, effectiveFlights.outbound.effectiveFlight, effectiveFlights.inbound?.effectiveFlight]);

  const mayEdit = can("commercial.edit");

  if (!can("commercial.view"))
    return <AdminDenied area={t("a2.bk.title")} permission="commercial.view" />;

  if (isPending) {
    return (
      <AdminPanel>
        <div role="status" className="p-8 text-center text-muted-foreground">
          {t("a2.bk.loading")}
        </div>
      </AdminPanel>
    );
  }

  if (isError) {
    return (
      <AdminPanel>
        <AdminEmpty title={t("a2.bk.loadError")} body={t("a2.bk.loadErrorBody")} />
      </AdminPanel>
    );
  }

  if (!booking) {
    return (
      <AdminPanel>
        <AdminEmpty
          title={t("a2.notFound")}
          body={t("a2.notFoundBody")}
          action={
            <AppLink to="/admin/bookings" className={btnClass("outline", "sm", "mt-2")}>
              {t("a2.bk.title")}
            </AppLink>
          }
        />
      </AdminPanel>
    );
  }

  const status: MockBookingStatus = booking.status;
  const eligible = booking.passengers.filter((p) => p.type !== "infant");
  const paxType = (p: MockPassenger | AdaptedAdminPassenger) => t(`a2.bd.type.${p.type}`);

  const deskFlight =
    canonicalBooking?.outbound.originCode === "GZA"
      ? canonicalBooking.outbound
      : canonicalBooking?.inbound?.originCode === "GZA"
        ? canonicalBooking.inbound
        : null;
  const isNotCancelled = status !== "cancelled";

  const actions = (
    <>
      <PermissionButton
        allowed={mayEdit && isNotCancelled}
        reason={!isNotCancelled ? t("a2.bd.cancelled") : t("adm.edit.readOnly")}
        onClick={() => {
          setEditContact({
            email: canonicalBooking?.contact.email || "",
            phone: canonicalBooking?.contact.phone || "",
          });
          setSheetError(null);
          setFieldErrors({});
          setSheet("contact");
        }}
      >
        {t("a2.bd.editContact")}
      </PermissionButton>
      <PermissionButton
        allowed={mayEdit && isNotCancelled}
        reason={!isNotCancelled ? t("a2.bd.cancelled") : t("adm.edit.readOnly")}
        onClick={() => {
          const s: Record<string, string> = {};
          canonicalBooking?.passengers.forEach((_, i) => {
            if (canonicalBooking.seats[`out-${i}`])
              s[`out-${i}`] = canonicalBooking.seats[`out-${i}`] || "";
            if (canonicalBooking.seats[`in-${i}`])
              s[`in-${i}`] = canonicalBooking.seats[`in-${i}`] || "";
          });
          setEditSeats(s);
          setSheetError(null);
          setFieldErrors({});
          setSheet("seat");
        }}
      >
        {t("a2.bd.changeSeat")}
      </PermissionButton>
      <PermissionButton
        allowed={mayEdit && isNotCancelled}
        reason={!isNotCancelled ? t("a2.bd.cancelled") : t("adm.edit.readOnly")}
        onClick={() => {
          setEditExtras(
            canonicalBooking?.passengers.map(
              (_, index) => canonicalBooking.extras?.pax?.[index] ?? emptyPaxExtras(),
            ) ?? [],
          );
          setSheetError(null);
          setFieldErrors({});
          setSheet("extras");
        }}
      >
        {t("a2.bd.editExtras")}
      </PermissionButton>
      {deskFlight && isNotCancelled && canonicalBooking ? (
        <AppLink
          to="/admin/check-in"
          search={{
            ref: canonicalBooking.ref,
            flightId: deskFlight.id,
            date: deskFlight.date,
          }}
          className={btnClass("primary", "sm")}
        >
          {t("a2.bd.checkIn")}
        </AppLink>
      ) : null}
      {isNotCancelled ? (
        <PermissionButton
          allowed={mayEdit}
          reason={t("adm.edit.readOnly")}
          onClick={() => {
            setCancelError(null);
            setConfirmCancel(true);
          }}
        >
          {t("a2.bd.cancel")}
        </PermissionButton>
      ) : null}
    </>
  );

  return (
    <div className="space-y-4">
      <CommercialCatalogState />
      <AdminPageHeader
        title={t("a2.bk.title")}
        description={t("a6.detail.local")}
        meta={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Ltr className="text-base font-bold">{booking.ref}</Ltr>
            <span className="font-semibold text-foreground">{booking.lead}</span>
            <AdminChip tone={statusTone(status)}>{t(`a2.bk.st.${status}`)}</AdminChip>
            <Ltr className="text-muted-foreground">{booking.route}</Ltr>
            <Ltr className="text-muted-foreground">{booking.date}</Ltr>
            <span className="text-muted-foreground">
              {t("a2.bk.pax")}: <Ltr>{booking.paxCount}</Ltr>
            </span>
            <span className="text-muted-foreground">
              {t(
                cabins.find((c) => c.id === booking.canonical.criteria.cabin)?.label ??
                  "cabin.economy",
              )}{" "}
              ·{" "}
              {pick(
                lang,
                fares.find((f) => f.id === booking.canonical.fareId)?.name ?? { en: "—", ar: "—" },
              )}
            </span>
            <AdminChip tone="muted">
              {booking.account ? t("a2.bd.account") : t("a2.bd.guest")}
            </AdminChip>
          </div>
        }
        action={actions}
      />

      <AdminPanel bodyClassName="p-0">
        <AdminTabs
          label={t("a2.bk.title")}
          active={tab}
          onChange={setTab}
          tabs={[
            { id: "overview", label: t("a2.bd.tab.overview") },
            {
              id: "passengers",
              label: t("a2.bd.tab.passengers"),
              count: booking.passengers.length,
            },
            { id: "seats", label: t("a2.bd.tab.seats") },
            { id: "checkin", label: t("a2.bd.tab.checkin") },
            { id: "history", label: t("a2.bd.tab.history") },
          ]}
        >

        <div className="p-4">
          {tab === "overview" ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <section className="lg:col-span-2 rounded-md border border-border">
                <h3 className="border-b border-border px-3 py-2 text-sm font-bold">
                  {t("a2.bd.itinerary")}
                </h3>
                <ul className="divide-y divide-border">
                  <li className="px-3 py-2.5 text-sm">
                    <p className="font-semibold">{t("a2.bd.out")}</p>
                    <p className="text-muted-foreground">
                      <Ltr>{`${booking.flightOut} · ${booking.route} · ${booking.date}`}</Ltr>
                    </p>
                  </li>
                  {booking.flightIn ? (
                    <li className="px-3 py-2.5 text-sm">
                      <p className="font-semibold">{t("a2.bd.in")}</p>
                      <p className="text-muted-foreground">
                        <Ltr>{`${booking.flightIn} · ${booking.destination} → GZA · ${booking.returnDate ?? ""}`}</Ltr>
                      </p>
                    </li>
                  ) : null}
                </ul>
              </section>

              <section className="rounded-md border border-border">
                <h3 className="border-b border-border px-3 py-2 text-sm font-bold">
                  {t("a2.bd.contact")}
                </h3>
                <dl className="space-y-2 px-3 py-2.5 text-sm">
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">
                      {t("a2.bk.lead")}
                    </dt>
                    <dd className="font-medium text-foreground">{booking.lead}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">
                      {t("a2.cu.email")}
                    </dt>
                    <dd>
                      <Ltr>{booking.email}</Ltr>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">
                      {t("a2.cu.phone")}
                    </dt>
                    <dd>
                      <Ltr>{booking.phone}</Ltr>
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-md border border-border lg:col-span-3">
                <h3 className="border-b border-border px-3 py-2 text-sm font-bold">
                  {t("a2.bd.summary")}
                </h3>
                <dl className="grid gap-3 px-3 py-2.5 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">
                      {t("a2.bd.fare")}
                    </dt>
                    <dd>
                      {t(
                        cabins.find((c) => c.id === booking.canonical.criteria.cabin)?.label ??
                          "cabin.economy",
                      )}{" "}
                      ·{" "}
                      {pick(
                        lang,
                        fares.find((f) => f.id === booking.canonical.fareId)?.name ?? {
                          en: "—",
                          ar: "—",
                        },
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">
                      {t("a2.bd.booked")}
                    </dt>
                    <dd>
                      <Ltr>{booking.booked}</Ltr>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">
                      {t("a2.bd.channel")}
                    </dt>
                    <dd>{t(`a2.bd.channel.${booking.channel}`)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">
                      {t("a2.bk.total")}
                    </dt>
                    <dd className="font-bold">
                      <Ltr>{money(booking.total, lang)}</Ltr>
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
          ) : null}

          {tab === "passengers" ? (
            <ul className="space-y-2">
              {booking.passengers.map((p) => (
                <li key={p.id} className="rounded-md border border-border px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{p.name}</p>
                    <AdminChip tone={p.type === "infant" ? "info" : "muted"}>
                      {paxType(p)}
                    </AdminChip>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div>
                      <dt className="font-semibold text-muted-foreground">{t("a2.bd.dob")}</dt>
                      <dd>
                        <Ltr>{p.dob || "—"}</Ltr>
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-muted-foreground">
                        {t("a2.bd.nationality")}
                      </dt>
                      <dd>{p.nationality || "—"}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-muted-foreground">{t("a2.bd.document")}</dt>
                      <dd>
                        <Ltr>{p.document || "—"}</Ltr>
                      </dd>
                    </div>
                    {p.companion ? (
                      <div>
                        <dt className="font-semibold text-muted-foreground">
                          {t("a2.bd.companion")}
                        </dt>
                        <dd>{p.companion}</dd>
                      </div>
                    ) : null}
                  </dl>
                </li>
              ))}
            </ul>
          ) : null}

          {tab === "seats" ? (
            <div className="overflow-x-auto">
              <GazaTable className="w-full min-w-[40rem] text-sm">
                <GazaTableCaption className="sr-only">{t("a2.bd.tab.seats")}</GazaTableCaption>
                <GazaTableHeader>
                  <GazaTableRow className="border-b border-border type-th">
                    <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                      {t("a2.bd.passenger")}
                    </GazaTableHead>
                    <GazaTableHead
                      scope="col"
                      className="px-3 py-2 text-start font-bold"
                    >{`${t("a2.bd.out")} · ${t("a2.bd.seat")}`}</GazaTableHead>
                    <GazaTableHead
                      scope="col"
                      className="px-3 py-2 text-start font-bold"
                    >{`${t("a2.bd.in")} · ${t("a2.bd.seat")}`}</GazaTableHead>
                    <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                      {t("a2.bd.bags")}
                    </GazaTableHead>
                    <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                      {t("a2.bd.meal")}
                    </GazaTableHead>
                    <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                      {t("a2.bd.assistance")}
                    </GazaTableHead>
                  </GazaTableRow>
                </GazaTableHeader>
                <GazaTableBody>
                  {booking.passengers.map((p) => (
                    <GazaTableRow key={p.id} className="border-b border-border last:border-0">
                      <GazaTableCell className="px-3 py-2">{p.name}</GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        {p.seatOut ? (
                          <Ltr>{p.seatOut}</Ltr>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        {p.seatIn ? (
                          <Ltr>{p.seatIn}</Ltr>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        <Ltr>{p.bags}</Ltr>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        <ServiceValue value={p.meal} kind="meal" />
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2 text-muted-foreground">
                        <ServiceValue value={p.assistance} kind="assistance" />
                      </GazaTableCell>
                    </GazaTableRow>
                  ))}
                </GazaTableBody>
              </GazaTable>
            </div>
          ) : null}

          {tab === "checkin" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <AdminChip tone="muted">
                  {`${t("a2.bd.passenger")}: `}
                  <Ltr>{eligible.length}</Ltr>
                </AdminChip>
                <AdminChip tone="brand">
                  {`${t("a2.ci.st.done")}: `}
                  <Ltr>{eligible.filter((p) => p.checkedOut).length}</Ltr>
                </AdminChip>
                <AdminChip tone="warn">
                  {`${t("a2.ci.st.not")}: `}
                  <Ltr>{eligible.filter((p) => !p.checkedOut).length}</Ltr>
                </AdminChip>
              </div>
              <div className="overflow-x-auto">
                <GazaTable className="w-full min-w-[40rem] text-sm">
                  <GazaTableCaption className="sr-only">{t("a2.bd.tab.checkin")}</GazaTableCaption>
                  <GazaTableHeader>
                    <GazaTableRow className="border-b border-border type-th">
                      <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                        {t("a2.bd.passenger")}
                      </GazaTableHead>
                      <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                        {t("a2.bd.out")}
                      </GazaTableHead>
                      <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                        {t("a2.bd.in")}
                      </GazaTableHead>
                      <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                        {t("a2.bd.seat")}
                      </GazaTableHead>
                      <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                        {t("a2.bd.boardingPass")}
                      </GazaTableHead>
                    </GazaTableRow>
                  </GazaTableHeader>
                  <GazaTableBody>
                    {booking.passengers.map((p) => (
                      <GazaTableRow key={p.id} className="border-b border-border last:border-0">
                        <GazaTableCell className="px-3 py-2">
                          {p.name}
                          {p.type === "infant" ? (
                            <AdminChip tone="info" className="ms-2">
                              {t("a2.ci.infant")}
                            </AdminChip>
                          ) : null}
                        </GazaTableCell>
                        <GazaTableCell className="px-3 py-2">
                          {p.type === "infant" ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <AdminChip tone={p.checkedOut ? "brand" : "muted"}>
                              {t(p.checkedOut ? "a2.ci.st.done" : "a2.ci.st.not")}
                            </AdminChip>
                          )}
                        </GazaTableCell>
                        <GazaTableCell className="px-3 py-2">
                          {p.type === "infant" || !booking.flightIn ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <AdminChip tone={p.checkedIn ? "brand" : "muted"}>
                              {t(p.checkedIn ? "a2.ci.st.done" : "a2.ci.st.not")}
                            </AdminChip>
                          )}
                        </GazaTableCell>
                        <GazaTableCell className="px-3 py-2">
                          {p.seatOut ? (
                            <Ltr>{p.seatOut}</Ltr>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </GazaTableCell>
                        <GazaTableCell className="px-3 py-2">
                          {p.type === "infant" ? (
                            <span className="text-muted-foreground">—</span>
                          ) : p.checkedOut ? (
                            <AppLink
                              to="/boarding-pass/$ref/$leg/$pax"
                              params={{
                                ref: booking.ref,
                                leg: "out",
                                pax: String(booking.passengers.indexOf(p)),
                              }}
                              className={btnClass("outline", "sm")}
                            >
                              {t("a2.bd.bp.issued")}
                            </AppLink>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {t("a2.bd.bp.notIssued")}
                            </span>
                          )}
                        </GazaTableCell>
                      </GazaTableRow>
                    ))}
                  </GazaTableBody>
                </GazaTable>
              </div>
            </div>
          ) : null}

          {tab === "history" ? (
            <ol className="space-y-3">
              {booking.history.map((h) => (
                <li key={h.id} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-brand"
                  />
                  <div>
                    <p className="text-sm">{pick(lang, h.what)}</p>
                    <p className="text-xs text-muted-foreground">
                      <Ltr>{h.when}</Ltr>
                    </p>
                  </div>
                </li>
              ))}
              {status === "cancelled" ? (
                <li className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-status-cancelled"
                  />
                  <p className="text-sm">{t("a2.bd.cancelled")}</p>
                </li>
              ) : null}
            </ol>
          ) : null}
        </div>
        </AdminTabs>
      </AdminPanel>

      <GazaSheet
        open={sheet !== null}
        title={
          sheet === "contact"
            ? t("a2.bd.editContact")
            : sheet === "seat"
              ? t("a2.bd.changeSeat")
              : t("a2.bd.editExtras")
        }
        description={booking.ref}
        onClose={() => setSheet(null)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setSheet(null)}
              className={btnClass("outline", "sm")}
            >
              {t("a2.cancel")}
            </button>
            <PermissionButton
              allowed={
                mayEdit &&
                !updateContactMutation.isPending &&
                !updateSeatsMutation.isPending &&
                !updateExtrasMutation.isPending
              }
              reason={t("adm.edit.readOnly")}
              variant="primary"
              onClick={() => {
                if (!canonicalBooking) return;
                if (sheet === "contact") {
                  try {
                    validateBookingContact(editContact);
                  } catch (error) {
                    setSheetError(t(commercialErrorKey(error)));
                    setFieldErrors(commercialFieldErrors(error));
                    requestAnimationFrame(() =>
                      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
                    );
                    return;
                  }
                  setSheetError(null);
                  setFieldErrors({});
                  void (async () => {
                    try {
                      await executeAuditedAdminCommand({
                        domainCommand: () =>
                          updateContactMutation.mutateAsync({
                            ref: canonicalBooking.ref,
                            contact: {
                              email: editContact.email.trim(),
                              phone: editContact.phone.trim(),
                            },
                          }),
                        activityRepo,
                        actor,
                        event: {
                          module: "bookings",
                          action: "updated",
                          targetType: "booking_contact",
                          targetId: canonicalBooking.ref,
                          metadata: {
                            ref: canonicalBooking.ref,
                            email: editContact.email.trim(),
                            phone: editContact.phone.trim(),
                          },
                        },
                        isNoOp: (receipt) => !receipt.changed,
                        onAuditWarning: () => toast(t("a2.ac.auditWarning")),
                      });
                      toast(t("a6.saved"));
                      setSheet(null);
                    } catch (err) {
                      const msg = t(commercialErrorKey(err));
                      setSheetError(msg);
                      setFieldErrors(commercialFieldErrors(err));
                      toast(msg);
                    }
                  })();
                } else if (sheet === "seat") {
                  setSheetError(null);
                  setFieldErrors({});
                  try {
                    validateUpdateSeatsAssignments(canonicalBooking, editSeats, {
                      outbound: effectiveFlights.outbound.effectiveFlight ?? canonicalBooking.outbound,
                      inbound: effectiveFlights.inbound?.effectiveFlight ?? canonicalBooking.inbound,
                    });
                  } catch (error) {
                    setSheetError(t(commercialErrorKey(error)));
                    setFieldErrors(commercialFieldErrors(error));
                    requestAnimationFrame(() =>
                      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
                    );
                    return;
                  }
                  void (async () => {
                    try {
                      await executeAuditedAdminCommand({
                        domainCommand: () =>
                          updateSeatsMutation.mutateAsync({
                            ref: canonicalBooking.ref,
                            seats: editSeats,
                          }),
                        activityRepo,
                        actor,
                        event: {
                          module: "bookings",
                          action: "updated",
                          targetType: "booking_seats",
                          targetId: canonicalBooking.ref,
                          metadata: {
                            ref: canonicalBooking.ref,
                            seats: Object.values(editSeats).join(", "),
                          },
                        },
                        isNoOp: (receipt) => !receipt.changed,
                        onAuditWarning: () => toast(t("a2.ac.auditWarning")),
                      });
                      toast(t("a6.saved"));
                      setSheet(null);
                    } catch (err) {
                      const msg = t(commercialErrorKey(err));
                      setSheetError(msg);
                      setFieldErrors(commercialFieldErrors(err));
                      toast(msg);
                    }
                  })();
                } else if (sheet === "extras") {
                  setSheetError(null);
                  setFieldErrors({});
                  const canonicalPax = editExtras.map((px) => ({
                    extraBags: px.extraBags,
                    meal: px.meal,
                    assistance: Array.isArray(px.assistance) ? px.assistance : [],
                  }));
                  try {
                    if (!commercial.catalog || commercial.query.isError) { setSheetError(t("commercial.error.catalog_unavailable")); return; }
                    validateBookingExtras({pax:canonicalPax}, canonicalBooking.passengers.length, commercial.catalog, canonicalBooking.extras);
                  } catch (error) { setSheetError(t(commercialErrorKey(error)));setFieldErrors(commercialFieldErrors(error));requestAnimationFrame(()=>document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());return; }
                  void (async () => {
                    try {
                      await executeAuditedAdminCommand({
                        domainCommand: () =>
                          updateExtrasMutation.mutateAsync({
                            ref: canonicalBooking.ref,
                            extras: { pax: canonicalPax },
                          }),
                        activityRepo,
                        actor,
                        event: {
                          module: "bookings",
                          action: "updated",
                          targetType: "booking_extras",
                          targetId: canonicalBooking.ref,
                          metadata: {
                            ref: canonicalBooking.ref,
                            paxCount: canonicalPax.length,
                          },
                        },
                        isNoOp: (receipt) => !receipt.changed,
                        onAuditWarning: () => toast(t("a2.ac.auditWarning")),
                      });
                      toast(t("a6.saved"));
                      setSheet(null);
                    } catch (err) {
                      const msg = t(commercialErrorKey(err));
                      setSheetError(msg);
                      setFieldErrors(commercialFieldErrors(err));
                      toast(msg);
                    }
                  })();
                }
              }}
            >
              {updateContactMutation.isPending ||
              updateSeatsMutation.isPending ||
              updateExtrasMutation.isPending
                ? t("a2.bk.loading")
                : t("a2.save")}
            </PermissionButton>
          </>
        }
      >
        {sheetError ? (
          <div
            role="alert"
            className="p-3 rounded-md bg-status-cancelled/15 text-status-cancelled text-xs mb-3"
          >
            {sheetError}
          </div>
        ) : null}

        {sheet === "contact" ? (
          <div className="space-y-3">
            <Field label={t("a2.cu.email")} htmlFor="bd-email">
              <CommercialInput
                error={fieldErrors["email"]}
                id="bd-email"
                dir="ltr"
                type="email"
                value={editContact.email}
                onChange={(e) => setEditContact({ ...editContact, email: e.target.value })}
              />
            </Field>
            <Field label={t("a2.cu.phone")} htmlFor="bd-phone">
              <CommercialInput
                error={fieldErrors["phone"]}
                id="bd-phone"
                dir="ltr"
                value={editContact.phone}
                onChange={(e) => setEditContact({ ...editContact, phone: e.target.value })}
              />
            </Field>
          </div>
        ) : null}

        {sheet === "seat" && canonicalBooking ? (
          <div className="space-y-4">
            {canonicalBooking.passengers
              .filter((p) => p.type !== "infant")
              .map((p) => {
                const pIdx = canonicalBooking.passengers.indexOf(p);
                const isOutChecked = isPaxCheckedIn(canonicalBooking, "out", pIdx);
                const isInChecked = canonicalBooking.inbound
                  ? isPaxCheckedIn(canonicalBooking, "in", pIdx)
                  : false;

                return (
                  <div key={p.id} className="space-y-2 rounded-md border border-border p-3">
                    <p className="text-sm font-semibold">
                      {p.firstName} {p.lastName}
                    </p>
                    <Field
                      label={`${t("a2.bd.out")} (${canonicalBooking.outbound.originCode} → ${canonicalBooking.outbound.destinationCode})`}
                      htmlFor={`bd-seat-out-${p.id}`}
                    >
                      {isOutChecked ? (
                        <div className="flex items-center gap-2">
                          <Input
                            id={`bd-seat-out-${p.id}`}
                            dir="ltr"
                            value={editSeats[`out-${pIdx}`] || ""}
                            disabled
                            className="opacity-70 bg-muted"
                          />
                          <AdminChip tone="brand">{t("a2.ci.st.done")}</AdminChip>
                        </div>
                      ) : (
                        <CommercialInput
                          error={fieldErrors[`out-${pIdx}`]}
                          id={`bd-seat-out-${p.id}`}
                          dir="ltr"
                          value={editSeats[`out-${pIdx}`] || ""}
                          onChange={(e) =>
                            setEditSeats({
                              ...editSeats,
                              [`out-${pIdx}`]: e.target.value.trim().toUpperCase(),
                            })
                          }
                          placeholder="12A"
                        />
                      )}
                    </Field>

                    {!isOutChecked ? (
                      <CommercialSeatPicker
                        flight={effectiveFlights.outbound.effectiveFlight ?? canonicalBooking.outbound}
                        cabin={canonicalBooking.criteria.cabin}
                        seats={editSeats}
                        leg="out"
                        paxIndex={pIdx}
                        passengerLabels={canonicalBooking.passengers.map(
                          (p) => `${p.firstName} ${p.lastName}`,
                        )}
                        layout={resolveBookingLegLayout(canonicalBooking, "out")}
                        occupiedSeats={getCanonicalOccupiedSeats(
                          allBookings,
                          canonicalBooking.outbound.id,
                          canonicalBooking.ref,
                        )}
                        extraLegroomPrice={
                          resolveBookingPricing(canonicalBooking).seatPricing.extraLegroomPrice
                        }
                        onSelect={(seat) =>
                          setEditSeats((current) => ({ ...current, [`out-${pIdx}`]: seat }))
                        }
                      />
                    ) : null}
                    {canonicalBooking.inbound ? (
                      <Field
                        label={`${t("a2.bd.in")} (${canonicalBooking.inbound.originCode} → ${canonicalBooking.inbound.destinationCode})`}
                        htmlFor={`bd-seat-in-${p.id}`}
                      >
                        {isInChecked ? (
                          <div className="flex items-center gap-2">
                            <Input
                              id={`bd-seat-in-${p.id}`}
                              dir="ltr"
                              value={editSeats[`in-${pIdx}`] || ""}
                              disabled
                              className="opacity-70 bg-muted"
                            />
                            <AdminChip tone="brand">{t("a2.ci.st.done")}</AdminChip>
                          </div>
                        ) : (
                          <CommercialInput
                            error={fieldErrors[`in-${pIdx}`]}
                            id={`bd-seat-in-${p.id}`}
                            dir="ltr"
                            value={editSeats[`in-${pIdx}`] || ""}
                            onChange={(e) =>
                              setEditSeats({
                                ...editSeats,
                                [`in-${pIdx}`]: e.target.value.trim().toUpperCase(),
                              })
                            }
                            placeholder="12A"
                          />
                        )}
                      </Field>
                    ) : null}
                    {canonicalBooking.inbound && !isInChecked ? (
                      <CommercialSeatPicker
                        flight={effectiveFlights.inbound?.effectiveFlight ?? canonicalBooking.inbound}
                        cabin={canonicalBooking.criteria.cabin}
                        seats={editSeats}
                        leg="in"
                        paxIndex={pIdx}
                        passengerLabels={canonicalBooking.passengers.map(
                          (p) => `${p.firstName} ${p.lastName}`,
                        )}
                        layout={resolveBookingLegLayout(canonicalBooking, "in")}
                        occupiedSeats={getCanonicalOccupiedSeats(
                          allBookings,
                          canonicalBooking.inbound.id,
                          canonicalBooking.ref,
                        )}
                        extraLegroomPrice={
                          resolveBookingPricing(canonicalBooking).seatPricing.extraLegroomPrice
                        }
                        onSelect={(seat) =>
                          setEditSeats((current) => ({ ...current, [`in-${pIdx}`]: seat }))
                        }
                      />
                    ) : null}
                  </div>
                );
              })}
          </div>
        ) : null}

        {sheet === "extras" && canonicalBooking ? (
          <div className="space-y-4">
            {canonicalBooking.passengers.map((p, i) => (
              <div key={p.id} className="rounded-md border border-border p-3 space-y-2">
                <p className="text-sm font-semibold">
                  {p.firstName} {p.lastName}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t("a2.bd.bags")} htmlFor={`bd-bags-${p.id}`}>
                    <Input
                      id={`bd-bags-${p.id}`}
                      dir="ltr"
                      type="number"
                      min={0}
                      max={5}
                      value={editExtras[i]?.extraBags ?? 0}
                      onChange={(e) => {
                        const next = [...editExtras];
                        const cur = next[i] ?? emptyPaxExtras();
                        next[i] = {
                          ...cur,
                          extraBags: Math.max(0, Math.min(5, parseInt(e.target.value, 10) || 0)),
                        };
                        setEditExtras(next);
                      }}
                    />
                  </Field>
                  <Field label={t("a2.bd.meal")} htmlFor={`bd-meal-${p.id}`} error={fieldErrors[`pax.${i}.meal`] ? t(fieldErrors[`pax.${i}.meal`]!) : undefined} errorId={`bd-meal-${p.id}-error`}>
                    <Select
                      id={`bd-meal-${p.id}`}
                      aria-invalid={fieldErrors[`pax.${i}.meal`] ? true : undefined}
                      aria-describedby={fieldErrors[`pax.${i}.meal`] ? `bd-meal-${p.id}-error` : undefined}
                      value={editExtras[i]?.meal ?? "standard"}
                      onChange={(e) => {
                        const next = [...editExtras];
                        const cur = next[i] ?? emptyPaxExtras();
                        next[i] = { ...cur, meal: e.target.value };
                        setEditExtras(next);
                      }}
                    >
                      {serviceOptions(mealOptions, [canonicalBooking.extras.pax[i]?.meal ?? ""]).map((m) => (
                        <option key={m.id} value={m.id}>
                          {pick(lang, m.label)}{!m.active ? ` · ${t("commercial.retired")}` : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <AssistanceChoices
                  value={editExtras[i]?.assistance ?? []}
                  retained={canonicalBooking.extras.pax[i]?.assistance ?? []}
                  onChange={(assistance) =>
                    setEditExtras((current) =>
                      canonicalBooking.passengers.map((_, index) =>
                        index === i
                          ? { ...(current[index] ?? emptyPaxExtras()), assistance }
                          : (current[index] ?? emptyPaxExtras()),
                      ),
                    )
                  }
                />
              </div>
            ))}
          </div>
        ) : null}
      </GazaSheet>

      <ConfirmDialog
        open={confirmCancel}
        title={t("a2.bd.cancelTitle")}
        body={t("a2.bd.cancelBody")}
        confirmLabel={t("a2.bd.cancelConfirm")}
        pending={cancelBookingMutation.isPending}
        error={cancelError}
        preserveOpenOnConfirm
        onConfirm={async () => {
          if (!mayEdit || cancelBookingMutation.isPending) return;
          setCancelError(null);
          try {
            await executeAuditedAdminCommand({
              domainCommand: () => cancelBookingMutation.mutateAsync({ ref: booking.ref }),
              activityRepo,
              actor,
              event: {
                module: "bookings",
                action: "cancelled",
                targetType: "booking",
                targetId: booking.ref,
                metadata: {
                  ref: booking.ref,
                },
              },
              isNoOp: (receipt) => !receipt.changed,
              onAuditWarning: () => toast(t("a2.ac.auditWarning")),
            });
            setConfirmCancel(false);
            toast(t("a2.bd.cancelled"));
          } catch (error) {
            setCancelError(t(commercialErrorKey(error)));
          }
        }}
        onClose={() => setConfirmCancel(false)}
      />
    </div>
  );
}
