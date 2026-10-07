import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLink, useAppNavigate } from "@/components/app-link";
import { Field, Input, btnClass } from "@/components/kit";
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
import { useI18n } from "@/lib/i18n";
import { useRepositories } from "@/lib/repositories/registry";
import { executeAuditedAdminCommand } from "@/lib/activity/audit-recorder";
import {
  customerToRouteId,
  isBookingUpcoming,
  useAttachBookingToCustomer,
  useCustomerDetailQuery,
  useUpdateCustomerContact,
} from "@/lib/customer-directory";
import { todayISO } from "@/lib/data";
import { pageHead } from "@/lib/head";
import type { Booking } from "@/lib/domain/booking";

export const Route = createFileRoute("/{-$locale}/admin/customers/$id")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: `/admin/customers/${params.id}`,
      en: {
        title: "Customer — Gaza International Airport administration",
        description: "Passenger account, trips, saved travellers and preferences.",
      },
      ar: {
        title: "عميل — إدارة مطار غزة الدولي",
        description: "حساب المسافر ورحلاته والمسافرون المحفوظون والتفضيلات.",
      },
      noindex: true,
    }),
  component: AdminCustomerDetailPage,
});

type Tab = "profile" | "trips" | "travelers" | "prefs" | "activity";

function AdminCustomerDetailPage() {
  const { id } = Route.useParams();
  const navigate = useAppNavigate();
  const { t, lang } = useI18n();
  const { can, toast, actor } = useAdmin();
  const { activity: activityRepo } = useRepositories();
  const [tab, setTab] = useState<Tab>("profile");

  // Contact edit sheet
  const [sheet, setSheet] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [guestEmailInput, setGuestEmailInput] = useState("");
  const [selectedBookingRef, setSelectedBookingRef] = useState<string>("");

  // Attach booking sheet
  const [attachSheet, setAttachSheet] = useState(false);
  const [pnrInput, setPnrInput] = useState("");
  const [attachPending, setAttachPending] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const { data: customer, isLoading, isError, refetch } = useCustomerDetailQuery(id);
  const attachMutation = useAttachBookingToCustomer();
  const updateContactMutation = useUpdateCustomerContact();

  const mayEdit = can("commercial.edit");

  useEffect(() => {
    if (customer) {
      setPhoneInput(customer.phone || "");
      setGuestEmailInput(customer.email || "");
      if (customer.bookings.length > 0 && customer.bookings[0]) {
        setSelectedBookingRef(customer.bookings[0].ref);
      }
    }
  }, [customer]);

  if (!can("commercial.view")) {
    return <AdminDenied area={t("a2.cu.title")} permission="commercial.view" />;
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={t("a2.cu.title")} />
        <AdminPanel bodyClassName="p-8 text-center space-y-4">
          <p className="text-sm text-destructive">
            {lang === "ar"
              ? "تعذر تحميل بيانات العميل. يرجى إعادة المحاولة."
              : "Unable to load customer details. Please retry."}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className={btnClass("outline", "sm")}
          >
            {lang === "ar" ? "إعادة المحاولة" : "Retry"}
          </button>
        </AdminPanel>
      </div>
    );
  }

  if (isLoading) {
    return (
      <AdminPanel>
        <p className="p-6 text-sm text-muted-foreground">{t("a2.loading")}</p>
      </AdminPanel>
    );
  }

  if (!customer) {
    return (
      <AdminPanel>
        <AdminEmpty
          title={t("a2.notFound")}
          body={t("a2.notFoundBody")}
          action={
            <AppLink to="/admin/customers" className={btnClass("outline", "sm", "mt-2")}>
              {t("a2.cu.title")}
            </AppLink>
          }
        />
      </AdminPanel>
    );
  }

  const trips = customer.bookings;
  const clock = todayISO();
  const upcoming = trips.filter((b) => b.status === "confirmed" && isBookingUpcoming(b, clock));
  const previous = trips.filter((b) => b.status === "confirmed" && !isBookingUpcoming(b, clock));
  const cancelled = trips.filter((b) => b.status === "cancelled");

  const tripList = (list: Booking[], title: string) => (
    <section className="rounded-md border border-border">
      <h3 className="border-b border-border px-3 py-2 text-sm font-bold">{title}</h3>
      {list.length === 0 ? (
        <p className="px-3 py-3 text-xs text-muted-foreground">{t("a2.cu.noTrips")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((b) => (
            <li key={b.ref} className="px-3 py-2 text-sm">
              <AppLink
                to="/admin/bookings/$ref"
                params={{ ref: b.ref }}
                className="font-semibold underline decoration-dotted"
              >
                <Ltr>{b.ref}</Ltr>
              </AppLink>
              <span className="ms-2 text-muted-foreground">
                <Ltr>{`${b.outbound.originCode} → ${b.outbound.destinationCode} · ${b.outbound.date}`}</Ltr>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const handleSaveContact = async () => {
    if (!customer) return;
    setContactError(null);
    try {
      if (customer.type === "account") {
        await executeAuditedAdminCommand({
          domainCommand: () =>
            updateContactMutation.mutateAsync({
              type: "account",
              email: customer.email,
              phone: phoneInput.trim(),
            }),
          activityRepo,
          actor,
          event: (receipt) => ({
            module: "commercial",
            action: "updated",
            targetType: "customer",
            targetId: customer.email,
            before: receipt.beforePhone ?? customer.phone ?? "",
            after: receipt.afterPhone ?? phoneInput.trim(),
            metadata: {
              email: customer.email,
              phone: receipt.afterPhone ?? phoneInput.trim(),
            },
          }),
          isNoOp: (r) => !r.changed,
          onAuditWarning: () => toast(t("a2.ac.auditWarning")),
        });
      } else {
        const targetRef = selectedBookingRef || (customer.bookings.length > 0 ? customer.bookings[0]?.ref ?? "" : "");
        const cleanEmail = guestEmailInput.trim();
        const cleanPhone = phoneInput.trim();
        await executeAuditedAdminCommand({
          domainCommand: () =>
            updateContactMutation.mutateAsync({
              type: "guest",
              bookingRef: targetRef,
              email: cleanEmail,
              phone: cleanPhone,
            }),
          activityRepo,
          actor,
          event: (receipt) => ({
            module: "commercial",
            action: "updated",
            targetType: "guest_contact",
            targetId: targetRef,
            before: receipt.beforeContact ?? `${customer.email} / ${customer.phone || ""}`,
            after: receipt.afterContact ?? `${cleanEmail} / ${cleanPhone}`,
            metadata: {
              bookingRef: targetRef,
              email: cleanEmail,
              phone: cleanPhone,
            },
          }),
          isNoOp: (r) => !r.changed,
          onAuditWarning: () => toast(t("a2.ac.auditWarning")),
        });

        if (cleanEmail.toLowerCase() !== customer.email.toLowerCase()) {
          const newRouteId = customerToRouteId("guest", cleanEmail);
          void navigate({
            to: "/admin/customers/$id",
            params: { id: newRouteId },
          });
        }
      }
      toast(t("a2.saved"));
      setSheet(false);
    } catch {
      setContactError(t("a2.in.saveFailed"));
    }
  };

  const handleAttachBooking = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleanRef = pnrInput.trim().toUpperCase();
    if (!cleanRef || !customer || customer.type !== "account") return;

    setAttachPending(true);
    setAttachError(null);
    try {
      const result = await executeAuditedAdminCommand({
        domainCommand: () =>
          attachMutation.mutateAsync({
            ref: cleanRef,
            accountEmail: customer.email,
          }),
        activityRepo,
        actor,
        event: {
          module: "commercial",
          action: "updated",
          targetType: "booking",
          targetId: cleanRef,
          before: "guest",
          after: customer.email,
          metadata: {
            bookingRef: cleanRef,
            accountEmail: customer.email,
          },
        },
        isNoOp: (r) => r.status !== "claimed",
        onAuditWarning: () => toast(t("a2.ac.auditWarning")),
      });

      if (result.status === "claimed") {
        toast(t("a2.cu.attachSuccess"));
        setAttachSheet(false);
        setPnrInput("");
      } else if (result.status === "already-owned-by-user") {
        toast(t("a2.cu.attachAlready"));
        setAttachSheet(false);
        setPnrInput("");
      } else if (result.status === "not-found") {
        setAttachError(t("a2.cu.attachNotFound"));
      } else if (result.status === "contact-mismatch") {
        setAttachError(t("a2.cu.attachMismatch"));
      } else if (result.status === "owned-by-another") {
        setAttachError(t("a2.cu.attachOwnedAnother"));
      }
    } catch {
      setAttachError(t("a2.in.saveFailed"));
    } finally {
      setAttachPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={customer.name}
        description={
          customer.type === "account"
            ? (lang === "ar" ? "حساب مسافر مسجل" : "Registered passenger account")
            : t("a2.cu.st.guest")
        }
        meta={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Ltr className="text-muted-foreground">{customer.email}</Ltr>
            {customer.phone && <Ltr className="text-muted-foreground">{customer.phone}</Ltr>}
            <AdminChip tone={customer.type === "account" ? "brand" : "info"}>
              {customer.type === "account"
                ? (lang === "ar" ? "حساب مسافر" : "Account")
                : t("a2.cu.st.guest")}
            </AdminChip>
          </div>
        }
        action={
          <>
            <PermissionButton
              allowed={mayEdit}
              reason={t("adm.edit.readOnly")}
              onClick={() => {
                setContactError(null);
                setSheet(true);
              }}
            >
              {t("a2.cu.editContact")}
            </PermissionButton>
            {customer.type === "account" ? (
              <PermissionButton
                allowed={mayEdit}
                reason={t("adm.edit.readOnly")}
                onClick={() => {
                  setAttachError(null);
                  setPnrInput("");
                  setAttachSheet(true);
                }}
              >
                {t("a2.cu.attach")}
              </PermissionButton>
            ) : null}
          </>
        }
      />

      <AdminPanel bodyClassName="p-0">
        <AdminTabs
          label={t("a2.cu.title")}
          active={tab}
          onChange={setTab}
          tabs={[
            { id: "profile", label: t("a2.cu.tab.profile") },
            { id: "trips", label: t("a2.cu.tab.trips"), count: trips.length },
            { id: "travelers", label: t("a2.cu.tab.travelers"), count: customer.travelers.length },
            { id: "prefs", label: t("a2.cu.tab.prefs") },
            { id: "activity", label: t("a2.cu.tab.activity") },
          ]}
        />
        <div className="p-4">
          {tab === "profile" ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {[
                { k: t("a2.cu.customer"), v: customer.name },
                { k: t("a2.cu.email"), v: <Ltr>{customer.email}</Ltr> },
                { k: t("a2.cu.phone"), v: <Ltr>{customer.phone || "—"}</Ltr> },
                {
                  k: lang === "ar" ? "النوع" : "Type",
                  v: customer.type === "account"
                    ? (lang === "ar" ? "حساب مسافر" : "Account")
                    : t("a2.cu.st.guest"),
                },
              ].map((row) => (
                <div key={row.k}>
                  <dt className="text-xs font-semibold text-muted-foreground">{row.k}</dt>
                  <dd className="mt-0.5">{row.v}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {tab === "trips" ? (
            <div className="grid gap-3 lg:grid-cols-3">
              {tripList(upcoming, t("a2.cu.tripsUpcoming"))}
              {tripList(previous, t("a2.cu.tripsPrevious"))}
              {tripList(cancelled, t("a2.cu.tripsCancelled"))}
            </div>
          ) : null}

          {tab === "travelers" ? (
            customer.type === "account" ? (
              customer.travelers.length === 0 ? (
                <AdminEmpty
                  title={t("a2.cu.travelers")}
                  body={t("a2.notFoundBody")}
                />
              ) : (
                <ul className="space-y-2">
                  {customer.travelers.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-md border border-border px-3 py-2.5 text-sm"
                    >
                      <p className="font-semibold">{`${p.firstName} ${p.lastName}`.trim()}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        <Ltr>{`${p.dob} · ${p.document || "—"}`}</Ltr>
                        {` · ${p.nationality}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <AdminEmpty
                title={t("a2.cu.tab.travelers")}
                body={t("a2.cu.guestNoTravelers")}
              />
            )
          ) : null}

          {tab === "prefs" ? (
            customer.type === "account" ? (
              customer.seatPreference || customer.mealPreference || (customer.newsletter !== null && customer.newsletter !== undefined) ? (
                <dl className="grid gap-3 text-sm sm:grid-cols-3">
                  {[
                    { k: t("a2.cu.seatPref"), v: customer.seatPreference || "—" },
                    { k: t("a2.cu.mealPref"), v: customer.mealPreference || "—" },
                    {
                      k: t("a2.cu.newsletter"),
                      v: customer.newsletter ? t("a2.visible") : t("a2.hidden"),
                    },
                  ].map((row) => (
                    <div key={row.k}>
                      <dt className="text-xs font-semibold text-muted-foreground">{row.k}</dt>
                      <dd className="mt-0.5">{row.v}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <AdminEmpty
                  title={t("a2.cu.tab.prefs")}
                  body={lang === "ar" ? "لا توجد تفضيلات محفوظة لهذا الحساب." : "No saved preferences for this account."}
                />
              )
            ) : (
              <AdminEmpty
                title={t("a2.cu.tab.prefs")}
                body={t("a2.cu.guestNoPrefs")}
              />
            )
          ) : null}

          {tab === "activity" ? (
            <AdminEmpty
              title={t("a2.cu.tab.activity")}
              body={t("a2.cu.noActivity")}
            />
          ) : null}
        </div>
      </AdminPanel>

      {/* Edit Contact Sheet */}
      <GazaSheet
        open={sheet}
        title={t("a2.cu.editContact")}
        description={customer.name}
        onClose={() => setSheet(false)}
        footer={
          <>
            <button
              type="button"
              className={btnClass("outline", "sm")}
              onClick={() => setSheet(false)}
            >
              {t("a2.cancel")}
            </button>
            <PermissionButton
              allowed={mayEdit && !updateContactMutation.isPending}
              reason={t(updateContactMutation.isPending ? "a2.in.saving" : "adm.edit.readOnly")}
              variant="primary"
              onClick={handleSaveContact}
            >
              {t("a2.save")}
            </PermissionButton>
          </>
        }
      >
        <div className="space-y-3">
          {contactError && (
            <p role="alert" className="text-sm text-destructive">
              {contactError}
            </p>
          )}
          {customer.type === "account" ? (
            <>
              <Field label={t("a2.cu.email")} htmlFor="cu-email">
                <Input
                  id="cu-email"
                  dir="ltr"
                  value={customer.email}
                  disabled
                  readOnly
                  className="bg-muted text-muted-foreground cursor-not-allowed"
                />
              </Field>
              <Field label={t("a2.cu.phone")} htmlFor="cu-phone">
                <Input
                  id="cu-phone"
                  dir="ltr"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                />
              </Field>
            </>
          ) : (
            <>
              {customer.bookings.length > 1 && (
                <Field label={t("a2.bookingRef")} htmlFor="cu-booking-select">
                  <select
                    id="cu-booking-select"
                    value={selectedBookingRef}
                    onChange={(e) => setSelectedBookingRef(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    {customer.bookings.map((b) => (
                      <option key={b.ref} value={b.ref}>
                        {`${b.ref} (${b.outbound.originCode} → ${b.outbound.destinationCode})`}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label={t("a2.cu.email")} htmlFor="cu-guest-email">
                <Input
                  id="cu-guest-email"
                  dir="ltr"
                  value={guestEmailInput}
                  onChange={(e) => setGuestEmailInput(e.target.value)}
                />
              </Field>
              <Field label={t("a2.cu.phone")} htmlFor="cu-guest-phone">
                <Input
                  id="cu-guest-phone"
                  dir="ltr"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                />
              </Field>
            </>
          )}
        </div>
      </GazaSheet>

      {/* Attach Booking Sheet */}
      <GazaSheet
        open={attachSheet}
        title={t("a2.cu.attachTitle")}
        description={customer.name}
        onClose={() => setAttachSheet(false)}
        footer={
          <>
            <button
              type="button"
              className={btnClass("outline", "sm")}
              onClick={() => setAttachSheet(false)}
            >
              {t("a2.cancel")}
            </button>
            <PermissionButton
              allowed={mayEdit && !attachPending && pnrInput.trim().length > 0}
              reason={t(attachPending ? "a2.in.saving" : "adm.edit.readOnly")}
              variant="primary"
              onClick={handleAttachBooking}
            >
              {t("a2.cu.attach")}
            </PermissionButton>
          </>
        }
      >
        <form onSubmit={handleAttachBooking} className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("a2.cu.attachPrompt")}</p>
          <Field label={t("a2.bookingRef")} htmlFor="attach-pnr">
            <Input
              id="attach-pnr"
              dir="ltr"
              placeholder="e.g. GZA-7K8P"
              value={pnrInput}
              onChange={(e) => {
                setPnrInput(e.target.value);
                setAttachError(null);
              }}
              className="uppercase tracking-widest font-mono"
            />
          </Field>
          {attachError && (
            <p role="alert" className="text-sm text-destructive">
              {attachError}
            </p>
          )}
        </form>
      </GazaSheet>
    </div>
  );
}
