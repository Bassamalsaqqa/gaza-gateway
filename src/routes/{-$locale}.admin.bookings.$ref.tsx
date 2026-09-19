import { GazaTable, GazaTableBody, GazaTableCaption, GazaTableCell, GazaTableHead, GazaTableHeader, GazaTableRow } from "@/components/gaza-table";
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
  AdminSheet,
  AdminTabs,
  Ltr,
  PermissionButton,
} from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import { money } from "@/lib/format";
import { mockBookingByRef, type MockBookingStatus, type MockPassenger } from "@/lib/admin-mock";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/{-$locale}/admin/bookings/$ref")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: `/admin/bookings/${params.ref}`,
      en: { title: `Booking ${params.ref} — Gaza International Airport administration`, description: "Booking record, passengers, seats, extras and check-in." },
      ar: { title: `الحجز ${params.ref} — إدارة مطار غزة الدولي`, description: "سجل الحجز والمسافرون والمقاعد والإضافات وتسجيل الوصول." },
      noindex: true,
    }),
  component: AdminBookingDetailPage,
});

type Tab = "overview" | "passengers" | "seats" | "checkin" | "history";
type SheetKind = "contact" | "seat" | "extras" | null;

function statusTone(status: MockBookingStatus) {
  return status === "cancelled" ? "danger" : status === "partial" ? "warn" : status === "checkedin" ? "brand" : status === "upcoming" ? "info" : "neutral";
}

function AdminBookingDetailPage() {
  const { ref } = Route.useParams();
  const { t, lang } = useI18n();
  const { can, toast } = useAdmin();
  const [tab, setTab] = useState<Tab>("overview");
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  const booking = useMemo(() => mockBookingByRef(ref), [ref]);
  const mayEdit = can("commercial.edit");

  if (!can("commercial.view")) return <AdminDenied area={t("a2.bk.title")} permission="commercial.view" />;

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

  const status: MockBookingStatus = cancelled ? "cancelled" : booking.status;
  const eligible = booking.passengers.filter((p) => p.type !== "infant");
  const paxType = (p: MockPassenger) => t(`a2.bd.type.${p.type}`);

  const actions = (
    <>
      <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} onClick={() => setSheet("contact")}>
        {t("a2.bd.editContact")}
      </PermissionButton>
      <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} onClick={() => setSheet("seat")}>
        {t("a2.bd.changeSeat")}
      </PermissionButton>
      <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} onClick={() => setSheet("extras")}>
        {t("a2.bd.editExtras")}
      </PermissionButton>
      <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} onClick={() => toast(t("a2.uiOnly"))}>
        {t("a2.bd.checkIn")}
      </PermissionButton>
      <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} onClick={() => setConfirmCancel(true)}>
        {t("a2.bd.cancel")}
      </PermissionButton>
    </>
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("a2.bk.title")}
        description={t("a2.mock")}
        meta={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Ltr className="text-base font-bold">{booking.ref}</Ltr>
            <AdminChip tone={statusTone(status)}>{t(`a2.bk.st.${status}`)}</AdminChip>
            <Ltr className="text-muted-foreground">{booking.route}</Ltr>
            <Ltr className="text-muted-foreground">{booking.date}</Ltr>
            <span className="text-muted-foreground">
              {t("a2.bk.pax")}: <Ltr>{booking.paxCount}</Ltr>
            </span>
            <span className="text-muted-foreground">{`${booking.cabin} · ${booking.fare}`}</span>
            <AdminChip tone="muted">{booking.account ? t("a2.bd.account") : t("a2.bd.guest")}</AdminChip>
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
            { id: "passengers", label: t("a2.bd.tab.passengers"), count: booking.passengers.length },
            { id: "seats", label: t("a2.bd.tab.seats") },
            { id: "checkin", label: t("a2.bd.tab.checkin") },
            { id: "history", label: t("a2.bd.tab.history") },
          ]}
        />

        <div className="p-4">
          {tab === "overview" ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <section className="lg:col-span-2 rounded-md border border-border">
                <h3 className="border-b border-border px-3 py-2 text-sm font-bold">{t("a2.bd.itinerary")}</h3>
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
                <h3 className="border-b border-border px-3 py-2 text-sm font-bold">{t("a2.bd.contact")}</h3>
                <dl className="space-y-2 px-3 py-2.5 text-sm">
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">{t("a2.cu.email")}</dt>
                    <dd>
                      <Ltr>{booking.email}</Ltr>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">{t("a2.cu.phone")}</dt>
                    <dd>
                      <Ltr>{booking.phone}</Ltr>
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-md border border-border lg:col-span-3">
                <h3 className="border-b border-border px-3 py-2 text-sm font-bold">{t("a2.bd.summary")}</h3>
                <dl className="grid gap-3 px-3 py-2.5 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">{t("a2.bd.fare")}</dt>
                    <dd>{`${booking.cabin} · ${booking.fare}`}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">{t("a2.bd.booked")}</dt>
                    <dd>
                      <Ltr>{booking.booked}</Ltr>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">{t("a2.bd.channel")}</dt>
                    <dd>{t(`a2.bd.channel.${booking.channel}`)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">{t("a2.bk.total")}</dt>
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
                    <AdminChip tone={p.type === "infant" ? "info" : "muted"}>{paxType(p)}</AdminChip>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div>
                      <dt className="font-semibold text-muted-foreground">{t("a2.bd.dob")}</dt>
                      <dd>
                        <Ltr>{p.dob}</Ltr>
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-muted-foreground">{t("a2.bd.nationality")}</dt>
                      <dd>{p.nationality}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-muted-foreground">{t("a2.bd.document")}</dt>
                      <dd>
                        <Ltr>{p.document}</Ltr>
                      </dd>
                    </div>
                    {p.companion ? (
                      <div>
                        <dt className="font-semibold text-muted-foreground">{t("a2.bd.companion")}</dt>
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
                    <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("a2.bd.passenger")}</GazaTableHead>
                    <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{`${t("a2.bd.out")} · ${t("a2.bd.seat")}`}</GazaTableHead>
                    <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{`${t("a2.bd.in")} · ${t("a2.bd.seat")}`}</GazaTableHead>
                    <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("a2.bd.bags")}</GazaTableHead>
                    <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("a2.bd.meal")}</GazaTableHead>
                    <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("a2.bd.assistance")}</GazaTableHead>
                  </GazaTableRow>
                </GazaTableHeader>
                <GazaTableBody>
                  {booking.passengers.map((p) => (
                    <GazaTableRow key={p.id} className="border-b border-border last:border-0">
                      <GazaTableCell className="px-3 py-2">{p.name}</GazaTableCell>
                      <GazaTableCell className="px-3 py-2">{p.seatOut ? <Ltr>{p.seatOut}</Ltr> : <span className="text-muted-foreground">—</span>}</GazaTableCell>
                      <GazaTableCell className="px-3 py-2">{p.seatIn ? <Ltr>{p.seatIn}</Ltr> : <span className="text-muted-foreground">—</span>}</GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        <Ltr>{p.bags}</Ltr>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2">{p.meal}</GazaTableCell>
                      <GazaTableCell className="px-3 py-2 text-muted-foreground">{p.assistance ?? t("a2.none")}</GazaTableCell>
                    </GazaTableRow>
                  ))}
                </GazaTableBody>
              </GazaTable>
            </div>
          ) : null}

          {tab === "checkin" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <AdminChip tone="muted">{`${t("a2.bd.passenger")}: `}<Ltr>{eligible.length}</Ltr></AdminChip>
                <AdminChip tone="brand">{`${t("a2.ci.st.done")}: `}<Ltr>{eligible.filter((p) => p.checkedOut).length}</Ltr></AdminChip>
                <AdminChip tone="warn">{`${t("a2.ci.st.not")}: `}<Ltr>{eligible.filter((p) => !p.checkedOut).length}</Ltr></AdminChip>
              </div>
              <div className="overflow-x-auto">
                <GazaTable className="w-full min-w-[40rem] text-sm">
                  <GazaTableCaption className="sr-only">{t("a2.bd.tab.checkin")}</GazaTableCaption>
                  <GazaTableHeader>
                    <GazaTableRow className="border-b border-border type-th">
                      <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("a2.bd.passenger")}</GazaTableHead>
                      <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("a2.bd.out")}</GazaTableHead>
                      <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("a2.bd.in")}</GazaTableHead>
                      <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("a2.bd.seat")}</GazaTableHead>
                      <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("a2.bd.boardingPass")}</GazaTableHead>
                    </GazaTableRow>
                  </GazaTableHeader>
                  <GazaTableBody>
                    {booking.passengers.map((p) => (
                      <GazaTableRow key={p.id} className="border-b border-border last:border-0">
                        <GazaTableCell className="px-3 py-2">
                          {p.name}
                          {p.type === "infant" ? <AdminChip tone="info" className="ms-2">{t("a2.ci.infant")}</AdminChip> : null}
                        </GazaTableCell>
                        <GazaTableCell className="px-3 py-2">
                          {p.type === "infant" ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <AdminChip tone={p.checkedOut ? "brand" : "muted"}>{t(p.checkedOut ? "a2.ci.st.done" : "a2.ci.st.not")}</AdminChip>
                          )}
                        </GazaTableCell>
                        <GazaTableCell className="px-3 py-2">
                          {p.type === "infant" || !booking.flightIn ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <AdminChip tone={p.checkedIn ? "brand" : "muted"}>{t(p.checkedIn ? "a2.ci.st.done" : "a2.ci.st.not")}</AdminChip>
                          )}
                        </GazaTableCell>
                        <GazaTableCell className="px-3 py-2">{p.seatOut ? <Ltr>{p.seatOut}</Ltr> : <span className="text-muted-foreground">—</span>}</GazaTableCell>
                        <GazaTableCell className="px-3 py-2">
                          {p.type === "infant" ? (
                            <span className="text-muted-foreground">—</span>
                          ) : p.checkedOut ? (
                            <button type="button" onClick={() => toast(t("a2.uiOnly"))} className={btnClass("outline", "sm")}>
                              {t("a2.bd.bp.issued")}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">{t("a2.bd.bp.notIssued")}</span>
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
                  <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />
                  <div>
                    <p className="text-sm">{pick(lang, h.what)}</p>
                    <p className="text-xs text-muted-foreground">
                      <Ltr>{h.when}</Ltr>
                    </p>
                  </div>
                </li>
              ))}
              {cancelled ? (
                <li className="flex gap-3">
                  <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-status-cancelled" />
                  <p className="text-sm">{t("a2.bd.cancelled")}</p>
                </li>
              ) : null}
            </ol>
          ) : null}
        </div>
      </AdminPanel>

      <AdminSheet
        open={sheet !== null}
        title={sheet === "contact" ? t("a2.bd.editContact") : sheet === "seat" ? t("a2.bd.changeSeat") : t("a2.bd.editExtras")}
        description={booking.ref}
        onClose={() => setSheet(null)}
        footer={
          <>
            <button type="button" onClick={() => setSheet(null)} className={btnClass("outline", "sm")}>
              {t("a2.cancel")}
            </button>
            <PermissionButton
              allowed={mayEdit}
              reason={t("adm.edit.readOnly")}
              variant="primary"
              onClick={() => {
                setSheet(null);
                toast(t("a2.saved"));
              }}
            >
              {t("a2.save")}
            </PermissionButton>
          </>
        }
      >
        {sheet === "contact" ? (
          <div className="space-y-3">
            <Field label={t("a2.cu.email")} htmlFor="bd-email">
              <Input id="bd-email" dir="ltr" defaultValue={booking.email} />
            </Field>
            <Field label={t("a2.cu.phone")} htmlFor="bd-phone">
              <Input id="bd-phone" dir="ltr" defaultValue={booking.phone} />
            </Field>
          </div>
        ) : null}

        {sheet === "seat" ? (
          <div className="space-y-3">
            {booking.passengers
              .filter((p) => p.type !== "infant")
              .map((p) => (
                <Field key={p.id} label={`${p.name} · ${t("a2.bd.out")}`} htmlFor={`bd-seat-${p.id}`}>
                  <Input id={`bd-seat-${p.id}`} dir="ltr" defaultValue={p.seatOut ?? ""} placeholder="12A" />
                </Field>
              ))}
          </div>
        ) : null}

        {sheet === "extras" ? (
          <div className="space-y-4">
            {booking.passengers.map((p) => (
              <div key={p.id} className="rounded-md border border-border p-2.5">
                <p className="text-sm font-semibold">{p.name}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Field label={t("a2.bd.bags")} htmlFor={`bd-bags-${p.id}`}>
                    <Input id={`bd-bags-${p.id}`} dir="ltr" type="number" min={0} max={5} defaultValue={p.bags} />
                  </Field>
                  <Field label={t("a2.bd.meal")} htmlFor={`bd-meal-${p.id}`}>
                    <Select id={`bd-meal-${p.id}`} defaultValue={p.meal}>
                      {["Standard", "Vegetarian", "Diabetic", "Child"].map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label={t("a2.bd.assistance")} htmlFor={`bd-assist-${p.id}`} className="mt-2">
                  <Input id={`bd-assist-${p.id}`} defaultValue={p.assistance ?? ""} />
                </Field>
              </div>
            ))}
          </div>
        ) : null}
      </AdminSheet>

      <ConfirmDialog
        open={confirmCancel}
        title={t("a2.bd.cancelTitle")}
        body={t("a2.bd.cancelBody")}
        confirmLabel={t("a2.bd.cancelConfirm")}
        onConfirm={() => {
          setCancelled(true);
          setConfirmCancel(false);
          toast(t("a2.bd.cancelled"));
        }}
        onClose={() => setConfirmCancel(false)}
      />
    </div>
  );
}
