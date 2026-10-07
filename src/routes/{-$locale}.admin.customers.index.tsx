import { GazaTable, GazaTableBody, GazaTableCaption, GazaTableCell, GazaTableHead, GazaTableHeader, GazaTableRow } from "@/components/gaza-table";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppLink } from "@/components/app-link";
import { Input, btnClass } from "@/components/kit";
import { AdminChip, AdminEmpty, AdminPageHeader, AdminPanel, Ltr, Toolbar } from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { useI18n } from "@/lib/i18n";
import { useCustomersQuery } from "@/lib/customer-directory";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/{-$locale}/admin/customers/")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/customers",
      en: { title: "Customers — Gaza International Airport administration", description: "Passenger accounts and saved travellers." },
      ar: { title: "العملاء — إدارة مطار غزة الدولي", description: "حسابات المسافرين والمسافرون المحفوظون." },
      noindex: true,
    }),
  component: AdminCustomersPage,
});

function AdminCustomersPage() {
  const { t, lang } = useI18n();
  const { can } = useAdmin();
  const [query, setQuery] = useState("");
  const { data: customers = [], isPending, isError, refetch } = useCustomersQuery();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => `${c.name} ${c.email} ${c.phone} ${c.refs.join(" ")}`.toLowerCase().includes(q));
  }, [customers, query]);

  if (!can("commercial.view")) return <AdminDenied area={t("a2.cu.title")} permission="commercial.view" />;

  if (isError) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={t("a2.cu.title")} description={t("a2.cu.sub")} />
        <AdminPanel bodyClassName="p-8 text-center space-y-4">
          <p className="text-sm text-destructive">
            {lang === "ar"
              ? "تعذر تحميل سجل العملاء. يرجى إعادة المحاولة."
              : "Unable to load customer directory. Please retry."}
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

  return (
    <div className="space-y-4">
      <AdminPageHeader title={t("a2.cu.title")} description={t("a2.cu.sub")} />

      <AdminPanel bodyClassName="p-0">
        <Toolbar>
          <Input
            aria-label={t("a2.cu.search")}
            placeholder={t("a2.cu.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full sm:w-80"
          />
          <span className="text-xs text-muted-foreground">
            {t("a2.results")}: <Ltr>{rows.length}</Ltr>
          </span>
        </Toolbar>

        {rows.length === 0 ? (
          <AdminEmpty title={t("a2.cu.title")} body={t("a2.notFoundBody")} />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <GazaTable className="w-full text-sm">
                <GazaTableCaption className="sr-only">{t("a2.cu.title")}</GazaTableCaption>
                <GazaTableHeader>
                  <GazaTableRow className="border-b border-border type-th">
                    {[
                      t("a2.cu.customer"),
                      t("a2.cu.email"),
                      t("a2.cu.bookings"),
                      t("a2.cu.upcoming"),
                      t("a2.cu.travelers"),
                      lang === "ar" ? "النوع" : "Type",
                    ].map((h) => (
                      <GazaTableHead key={h} scope="col" className="px-3 py-2 text-start font-bold">
                        {h}
                      </GazaTableHead>
                    ))}
                  </GazaTableRow>
                </GazaTableHeader>
                <GazaTableBody>
                  {rows.map((c) => (
                    <GazaTableRow key={c.id} className="border-b border-border last:border-0">
                      <GazaTableCell className="px-3 py-2">
                        <AppLink to="/admin/customers/$id" params={{ id: c.id }} className="font-semibold underline decoration-dotted">
                          {c.name}
                        </AppLink>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2"><Ltr>{c.email}</Ltr></GazaTableCell>
                      <GazaTableCell className="px-3 py-2"><Ltr>{c.bookingCount}</Ltr></GazaTableCell>
                      <GazaTableCell className="px-3 py-2"><Ltr>{c.upcomingCount}</Ltr></GazaTableCell>
                      <GazaTableCell className="px-3 py-2"><Ltr>{c.travelerCount}</Ltr></GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        <AdminChip tone={c.type === "account" ? "brand" : "info"}>
                          {c.type === "account" ? (lang === "ar" ? "حساب مسافر" : "Account") : t("a2.cu.st.guest")}
                        </AdminChip>
                      </GazaTableCell>
                    </GazaTableRow>
                  ))}
                </GazaTableBody>
              </GazaTable>
            </div>

            <ul className="divide-y divide-border lg:hidden">
              {rows.map((c) => (
                <li key={c.id} className="space-y-1.5 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <AppLink to="/admin/customers/$id" params={{ id: c.id }} className="text-sm font-semibold underline decoration-dotted">
                      {c.name}
                    </AppLink>
                    <AdminChip tone={c.type === "account" ? "brand" : "info"}>
                      {c.type === "account" ? (lang === "ar" ? "حساب مسافر" : "Account") : t("a2.cu.st.guest")}
                    </AdminChip>
                  </div>
                  <p className="text-xs text-muted-foreground"><Ltr>{c.email}</Ltr></p>
                  <p className="text-xs text-muted-foreground">
                    {`${t("a2.cu.bookings")} `}<Ltr>{c.bookingCount}</Ltr>
                    {` · ${t("a2.cu.upcoming")} `}<Ltr>{c.upcomingCount}</Ltr>
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </AdminPanel>
    </div>
  );
}
