import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { btnClass, Container, EmptyState, PageHeader } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/{-$locale}/account")({
  component: AccountLayout,
});

const links = [
  { to: "/account", label: "account.overview", exact: true },
  { to: "/account/trips", label: "account.trips", exact: false },
  { to: "/account/boarding-passes", label: "account.boardingPasses", exact: false },
  { to: "/account/travelers", label: "account.travelers", exact: false },
  { to: "/account/profile", label: "account.profile", exact: false },
  { to: "/account/preferences", label: "account.preferences", exact: false },
  { to: "/account/security", label: "account.security", exact: false },
  { to: "/access-denied", label: "account.payments", exact: false },
] as const;

function AccountLayout() {
  const { t } = useI18n();
  const { account, signOut, ready } = useStore();

  if (!ready) {
    return (
      <Container className="py-16">
        <p className="text-sm text-muted-foreground">…</p>
      </Container>
    );
  }

  if (!account) {
    return (
      <Container className="py-16">
        <EmptyState
          title={t("account.notFound")}
          description={t("auth.signinSub")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/signin" className={btnClass("primary", "md")}>
                {t("auth.signin")}
              </Link>
              <Link to="/manage" className={btnClass("outline", "md")}>
                {t("manage.title")}
              </Link>
            </div>
          }
        />
      </Container>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={t("nav.account")}
        title={t("account.welcome", { name: account.firstName || account.email })}
        description={t("account.title")}
      >
        <button type="button" onClick={signOut} className={btnClass("outline", "sm")}>
          {t("auth.signout")}
        </button>
      </PageHeader>

      <Container className="grid gap-8 py-10 lg:grid-cols-[15rem_1fr]">
        <nav aria-label={t("account.title")}>
          <ul className="flex gap-2 overflow-x-auto pb-2 lg:sticky lg:top-24 lg:flex-col lg:overflow-visible lg:pb-0">
            {links.map((link) => (
              <li key={link.to} className="shrink-0 lg:shrink">
                <Link
                  to={link.to}
                  activeOptions={{ exact: link.exact }}
                  className="block rounded-lg px-3.5 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground data-[status=active]:bg-primary data-[status=active]:text-primary-foreground"
                >
                  {t(link.label)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <Outlet />
        </div>
      </Container>
    </>
  );
}
