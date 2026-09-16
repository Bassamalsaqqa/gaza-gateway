import { Link, createFileRoute } from "@tanstack/react-router";
import { Ticket } from "lucide-react";
import { BoardingPassCard, passesForBooking } from "@/components/booking/boarding-pass";
import { btnClass, EmptyState, Notice, Panel, Pill } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/{-$locale}/account/boarding-passes")({
  head: () => ({
    meta: [
      { title: "Boarding passes — Gaza International Airport (GZA)" },
      {
        name: "description",
        content: "All boarding passes for your checked-in Palestinian Airlines flights, ready to view and print.",
      },
      { property: "og:title", content: "Boarding passes — Palestinian Airlines" },
      { property: "og:description", content: "View and print boarding passes for checked-in flights." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BoardingPassesPage,
});

function BoardingPassesPage() {
  const { t } = useI18n();
  const { bookings } = useStore();

  const passes = bookings.flatMap((b) => passesForBooking(b));
  const pendingCheckin = bookings.filter((b) => b.status === "confirmed" && !b.checkedIn);

  if (passes.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          title={t("account.noPasses")}
          description={t("account.noPassesSub")}
          icon={<Ticket aria-hidden="true" className="size-6" />}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {pendingCheckin[0] ? (
                <Link
                  to="/manage/$ref"
                  params={{ ref: pendingCheckin[0].ref }}
                  className={btnClass("primary", "md")}
                >
                  {t("bp.checkinCta")}
                </Link>
              ) : null}
              <Link to="/manage" className={btnClass("outline", "md")}>
                {t("manage.title")}
              </Link>
              <Link to="/book" className={btnClass("ghost", "md")}>
                {t("nav.book")}
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Pill tone="brand">{passes.length === 1 ? t("bp.countOne") : t("bp.count", { n: passes.length })}</Pill>
        <Link to="/manage" className={btnClass("outline", "sm")}>
          {t("manage.title")}
        </Link>
      </div>

      <Notice>{t("bp.notReal")}</Notice>

      <ul className="space-y-5">
        {passes.map((item) => (
          <li key={`${item.booking.ref}-${item.leg}-${item.paxIndex}`} className="space-y-2">
            <BoardingPassCard item={item} compact />
            <div className="flex flex-wrap gap-2">
              <Link
                to="/boarding-pass/$ref/$pax"
                params={{ ref: item.booking.ref, pax: String(item.paxIndex) }}
                className={btnClass("primary", "sm")}
              >
                {t("bp.view")}
              </Link>
              <Link
                to="/account/trips/$ref"
                params={{ ref: item.booking.ref }}
                className={btnClass("outline", "sm")}
              >
                {t("book.viewBooking")}
              </Link>
            </div>
          </li>
        ))}
      </ul>

      {pendingCheckin.length > 0 ? (
        <Panel>
          <p className="eyebrow text-clay">{t("manage.checkin")}</p>
          <ul className="mt-3 space-y-2">
            {pendingCheckin.map((b) => (
              <li key={b.ref} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="code-id font-semibold">{b.ref}</span>
                <Link to="/manage/$ref" params={{ ref: b.ref }} className={btnClass("outline", "sm")}>
                  {t("bp.checkinCta")}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
