import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppLink } from "@/components/app-link";
import { Input } from "@/components/kit";
import { AdminChip, AdminEmpty, AdminPageHeader, AdminPanel, Ltr, Toolbar } from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { useI18n } from "@/lib/i18n";
import { mockCustomers } from "@/lib/admin-mock";
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
  const { t } = useI18n();
  const { can } = useAdmin();
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mockCustomers;
    return mockCustomers.filter((c) => `${c.name} ${c.email} ${c.phone} ${c.refs.join(" ")}`.toLowerCase().includes(q));
  }, [query]);

  if (!can("commercial.view")) return <AdminDenied area={t("a2.cu.title")} permission="commercial.view" />;

  const langLabel = (code: "en" | "ar") => (code === "ar" ? t("a2.arabic") : t("a2.english"));

  return (
    <div className="space-y-4">
      <AdminPageHeader title={t("a2.cu.title")} description={t("a2.cu.sub")} meta={<p className="text-xs text-muted-foreground">{t("a2.mock")}</p>} />

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
          <AdminEmpty title={t("a2.cu.title")} body={t("a2.mock")} />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <caption className="sr-only">{t("a2.cu.title")}</caption>
                <thead>
                  <tr className="border-b border-border type-th">
                    {[t("a2.cu.customer"), t("a2.cu.email"), t("a2.cu.bookings"), t("a2.cu.upcoming"), t("a2.cu.travelers"), t("a2.cu.language"), t("a2.status")].map((h) => (
                      <th key={h} scope="col" className="px-3 py-2 text-start font-bold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <AppLink to="/admin/customers/$id" params={{ id: c.id }} className="font-semibold underline decoration-dotted">
                          {c.name}
                        </AppLink>
                      </td>
                      <td className="px-3 py-2"><Ltr>{c.email}</Ltr></td>
                      <td className="px-3 py-2"><Ltr>{c.bookings}</Ltr></td>
                      <td className="px-3 py-2"><Ltr>{c.upcoming}</Ltr></td>
                      <td className="px-3 py-2"><Ltr>{c.travelers.length}</Ltr></td>
                      <td className="px-3 py-2">{langLabel(c.language)}</td>
                      <td className="px-3 py-2">
                        <AdminChip tone={c.status === "active" ? "brand" : c.status === "guest" ? "info" : "muted"}>{t(`a2.cu.st.${c.status}`)}</AdminChip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-border lg:hidden">
              {rows.map((c) => (
                <li key={c.id} className="space-y-1.5 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <AppLink to="/admin/customers/$id" params={{ id: c.id }} className="text-sm font-semibold underline decoration-dotted">
                      {c.name}
                    </AppLink>
                    <AdminChip tone={c.status === "active" ? "brand" : c.status === "guest" ? "info" : "muted"}>{t(`a2.cu.st.${c.status}`)}</AdminChip>
                  </div>
                  <p className="text-xs text-muted-foreground"><Ltr>{c.email}</Ltr></p>
                  <p className="text-xs text-muted-foreground">
                    {`${t("a2.cu.bookings")} `}<Ltr>{c.bookings}</Ltr>
                    {` · ${t("a2.cu.upcoming")} `}<Ltr>{c.upcoming}</Ltr>
                    {` · ${langLabel(c.language)}`}
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
