import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppLink } from "@/components/app-link";
import { Field, Input, btnClass } from "@/components/kit";
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
import { mockBookings, mockCustomerById } from "@/lib/admin-mock";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/{-$locale}/admin/customers/$id")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: `/admin/customers/${params.id}`,
      en: { title: "Customer — Gaza International Airport administration", description: "Passenger account, trips, saved travellers and preferences." },
      ar: { title: "عميل — إدارة مطار غزة الدولي", description: "حساب المسافر ورحلاته والمسافرون المحفوظون والتفضيلات." },
      noindex: true,
    }),
  component: AdminCustomerDetailPage,
});

type Tab = "profile" | "trips" | "travelers" | "prefs" | "activity";

function AdminCustomerDetailPage() {
  const { id } = Route.useParams();
  const { t, lang } = useI18n();
  const { can, toast } = useAdmin();
  const [tab, setTab] = useState<Tab>("profile");
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const customer = useMemo(() => mockCustomerById(id), [id]);
  const mayEdit = can("commercial.edit");

  if (!can("commercial.view")) return <AdminDenied area={t("a2.cu.title")} permission="commercial.view" />;

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

  const trips = mockBookings.filter((b) => customer.refs.includes(b.ref));
  const upcoming = trips.filter((b) => b.status === "upcoming" || b.status === "confirmed");
  const previous = trips.filter((b) => b.status === "checkedin" || b.status === "partial");
  const cancelled = trips.filter((b) => b.status === "cancelled");

  const tripList = (list: typeof trips, title: string) => (
    <section className="rounded-md border border-border">
      <h3 className="border-b border-border px-3 py-2 text-sm font-bold">{title}</h3>
      {list.length === 0 ? (
        <p className="px-3 py-3 text-xs text-muted-foreground">{t("a2.cu.noTrips")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((b) => (
            <li key={b.ref} className="px-3 py-2 text-sm">
              <AppLink to="/admin/bookings/$ref" params={{ ref: b.ref }} className="font-semibold underline decoration-dotted">
                <Ltr>{b.ref}</Ltr>
              </AppLink>
              <span className="ms-2 text-muted-foreground">
                <Ltr>{`${b.route} · ${b.date}`}</Ltr>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={customer.name}
        description={t("a2.mock")}
        meta={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Ltr className="text-muted-foreground">{customer.email}</Ltr>
            <Ltr className="text-muted-foreground">{customer.phone}</Ltr>
            <AdminChip tone={customer.status === "active" ? "brand" : customer.status === "guest" ? "info" : "muted"}>
              {t(`a2.cu.st.${customer.status}`)}
            </AdminChip>
          </div>
        }
        action={
          <>
            <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} onClick={() => setSheet(true)}>
              {t("a2.cu.editContact")}
            </PermissionButton>
            <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} onClick={() => toast(t("a2.uiOnly"))}>
              {t("a2.cu.attach")}
            </PermissionButton>
            <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} onClick={() => toast(t("a2.uiOnly"))}>
              {t("a2.cu.reset")}
            </PermissionButton>
            <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} onClick={() => setConfirm(true)}>
              {t("a2.cu.disable")}
            </PermissionButton>
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
                { k: t("a2.cu.phone"), v: <Ltr>{customer.phone}</Ltr> },
                { k: t("a2.cu.prefLang"), v: customer.language === "ar" ? t("a2.arabic") : t("a2.english") },
                { k: t("a2.cu.accountStatus"), v: t(`a2.cu.st.${customer.status}`) },
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
            customer.travelers.length === 0 ? (
              <AdminEmpty title={t("a2.cu.travelers")} body={t("a2.mock")} />
            ) : (
              <ul className="space-y-2">
                {customer.travelers.map((p) => (
                  <li key={p.document} className="rounded-md border border-border px-3 py-2.5 text-sm">
                    <p className="font-semibold">{p.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <Ltr>{`${p.dob} · ${p.document}`}</Ltr>
                      {` · ${p.nationality}`}
                    </p>
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {tab === "prefs" ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              {[
                { k: t("a2.cu.seatPref"), v: customer.seatPref },
                { k: t("a2.cu.mealPref"), v: customer.mealPref },
                { k: t("a2.cu.newsletter"), v: customer.newsletter ? t("a2.visible") : t("a2.hidden") },
              ].map((row) => (
                <div key={row.k}>
                  <dt className="text-xs font-semibold text-muted-foreground">{row.k}</dt>
                  <dd className="mt-0.5">{row.v}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {tab === "activity" ? (
            <ol className="space-y-3">
              {customer.activity.map((a) => (
                <li key={a.id} className="flex gap-3">
                  <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />
                  <div>
                    <p className="text-sm">{pick(lang, a.what)}</p>
                    <p className="text-xs text-muted-foreground">
                      <Ltr>{a.when}</Ltr>
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </AdminPanel>

      <AdminSheet
        open={sheet}
        title={t("a2.cu.editContact")}
        description={customer.name}
        onClose={() => setSheet(false)}
        footer={
          <>
            <button type="button" className={btnClass("outline", "sm")} onClick={() => setSheet(false)}>
              {t("a2.cancel")}
            </button>
            <PermissionButton
              allowed={mayEdit}
              reason={t("adm.edit.readOnly")}
              variant="primary"
              onClick={() => {
                setSheet(false);
                toast(t("a2.saved"));
              }}
            >
              {t("a2.save")}
            </PermissionButton>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t("a2.cu.email")} htmlFor="cu-email">
            <Input id="cu-email" dir="ltr" defaultValue={customer.email} />
          </Field>
          <Field label={t("a2.cu.phone")} htmlFor="cu-phone">
            <Input id="cu-phone" dir="ltr" defaultValue={customer.phone} />
          </Field>
        </div>
      </AdminSheet>

      <ConfirmDialog
        open={confirm}
        title={t("a2.cu.disableTitle")}
        body={t("a2.cu.disableBody")}
        confirmLabel={t("a2.cu.disable")}
        onConfirm={() => {
          setConfirm(false);
          toast(t("a2.uiOnly"));
        }}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}
