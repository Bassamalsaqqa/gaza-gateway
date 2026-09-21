import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  CalendarClock,
  Command,
  Inbox,
  Landmark,
  LayoutDashboard,
  MapPin,
  PlaneLanding,
  PlaneTakeoff,
  PlusCircle,
  Search,
  Ticket,
  UsersRound,
  X,
} from "lucide-react";
import { pick, useI18n } from "@/lib/i18n";
import { useAdmin } from "@/lib/admin-store";
import { contentItems, type Permission } from "@/lib/admin";
import { mockBookings, mockCustomers } from "@/lib/admin-mock";
import { arrivalsOn, departuresOn, destinations, todayISO } from "@/lib/data";
import { useAppNavigate } from "@/components/app-link";
import { cn } from "@/lib/utils";
import { Ltr } from "./admin-kit";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type GroupId = "commands" | "flights" | "bookings" | "customers" | "destinations" | "content";

type Result = {
  id: string;
  group: GroupId;
  title: string;
  meta: string;
  to: string;
  params?: Record<string, string> | undefined;
  search?: Record<string, unknown> | undefined;
  icon?: typeof Search | undefined;
};

const groupIcons: Record<GroupId, typeof Search> = {
  commands: Command,
  flights: PlaneTakeoff,
  bookings: Ticket,
  customers: UsersRound,
  destinations: MapPin,
  content: Archive,
};

interface AdminCommandDef {
  id: string;
  key: string;
  to: string;
  permission?: Permission | undefined;
  search?: Record<string, unknown> | undefined;
  icon: typeof Search;
  keywords: string[];
}

const COMMAND_DEFINITIONS: AdminCommandDef[] = [
  {
    id: "cmd-dashboard",
    key: "adm.nav.dashboard",
    to: "/admin",
    permission: "dashboard.view",
    icon: LayoutDashboard,
    keywords: ["dashboard", "home", "لوحة المتابعة", "الرئيسية"],
  },
  {
    id: "cmd-flights",
    key: "adm.nav.flights",
    to: "/admin/flights",
    permission: "ops.view",
    icon: PlaneTakeoff,
    keywords: ["flight", "board", "رحلات", "لوحة", "طيران", "عمليات", "ops"],
  },
  {
    id: "cmd-arrivals",
    key: "adm.cmd.filterArrivals",
    to: "/admin/flights",
    permission: "ops.view",
    search: { dir: "arr" },
    icon: PlaneLanding,
    keywords: ["arrival", "arrivals", "قادمة", "وصول", "هبوط", "arr"],
  },
  {
    id: "cmd-departures",
    key: "adm.cmd.filterDepartures",
    to: "/admin/flights",
    permission: "ops.view",
    search: { dir: "dep" },
    icon: PlaneTakeoff,
    keywords: ["departure", "departures", "مغادرة", "إقلاع", "dep"],
  },
  {
    id: "cmd-delayed",
    key: "adm.cmd.filterDelayed",
    to: "/admin/flights",
    permission: "ops.view",
    search: { status: "delayed" },
    icon: PlaneTakeoff,
    keywords: ["delayed", "delay", "متأخرة", "تأخير"],
  },
  {
    id: "cmd-new-booking",
    key: "adm.cmd.newBooking",
    to: "/admin/bookings/new",
    permission: "commercial.edit",
    icon: PlusCircle,
    keywords: ["new booking", "create booking", "حجز جديد", "إنشاء حجز"],
  },
  {
    id: "cmd-bookings",
    key: "adm.nav.bookings",
    to: "/admin/bookings",
    permission: "commercial.view",
    icon: Ticket,
    keywords: ["booking", "bookings", "pnr", "حجز", "حجوزات", "سجل"],
  },
  {
    id: "cmd-customers",
    key: "adm.nav.customers",
    to: "/admin/customers",
    permission: "commercial.view",
    icon: UsersRound,
    keywords: ["customer", "passenger", "traveler", "عميل", "مسافر", "ركاب", "دليل"],
  },
  {
    id: "cmd-destinations",
    key: "adm.nav.destinations",
    to: "/admin/destinations",
    permission: "ops.view",
    icon: MapPin,
    keywords: ["destination", "destinations", "route", "routes", "وجهات", "محطات", "خطوط"],
  },
  {
    id: "cmd-schedules",
    key: "adm.cmd.newSchedule",
    to: "/admin/schedules",
    permission: "ops.edit",
    icon: CalendarClock,
    keywords: ["schedule", "timetable", "مواعيد", "جدول", "جداول"],
  },
  {
    id: "cmd-inbox",
    key: "adm.nav.inbox",
    to: "/admin/inbox",
    permission: "engagement.view",
    icon: Inbox,
    keywords: ["inbox", "messages", "requests", "بريد", "صندوق", "رسائل", "طلبات"],
  },
  {
    id: "cmd-website",
    key: "a2.nav.website",
    to: "/admin/website",
    permission: "content.view",
    icon: Archive,
    keywords: ["website", "content", "cms", "موقع", "محتوى", "بوابة"],
  },
  {
    id: "cmd-airport",
    key: "a2.nav.airport",
    to: "/admin/airport",
    permission: "content.view",
    icon: Landmark,
    keywords: ["airport", "facility", "runway", "gate", "مطار", "مرافق", "مدارج", "بوابات"],
  },
];

function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ى]/g, "ي")
    .replace(/[ة]/g, "ه");
}

export function AdminSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useI18n();
  const { can } = useAdmin();
  const navigate = useAppNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const canOps = can("ops.view");
  const canCommercial = can("commercial.view");
  const canContent = can("content.view");

  const today = todayISO();

  const suggestions = useMemo(() => {
    const delayedTerm = lang === "ar" ? "متأخرة" : "Delayed";
    const archiveTerm = lang === "ar" ? "الأرشيف" : "Archive";
    if (canCommercial || canOps) return ["PS", "GZA", "AMM", "IST", delayedTerm];
    return ["GZA", "AMM", "IST", archiveTerm];
  }, [canCommercial, canOps, lang]);

  // Permitted commands
  const permittedCommands = useMemo(() => {
    return COMMAND_DEFINITIONS.filter((c) => !c.permission || can(c.permission));
  }, [can]);

  const results = useMemo<Result[]>(() => {
    const raw = query.trim();
    const q = normalizeSearch(raw);
    const out: Result[] = [];

    // If query is empty, surface permitted quick commands
    if (!raw) {
      for (const cmd of permittedCommands) {
        out.push({
          id: cmd.id,
          group: "commands",
          title: t(cmd.key),
          meta: cmd.to,
          to: cmd.to,
          search: cmd.search,
          icon: cmd.icon,
        });
      }
      return out;
    }

    // 1. Commands matching query
    for (const cmd of permittedCommands) {
      const title = t(cmd.key);
      const hay = normalizeSearch(`${title} ${cmd.keywords.join(" ")} ${cmd.to}`);
      if (hay.includes(q)) {
        out.push({
          id: cmd.id,
          group: "commands",
          title,
          meta: cmd.to,
          to: cmd.to,
          search: cmd.search,
          icon: cmd.icon,
        });
      }
    }

    // 2. Flights (requires ops.view)
    if (canOps) {
      const flightMap = new Map<string, typeof departuresOn extends (d: string) => (infer F)[] ? F : never>();
      for (const f of [...departuresOn(today), ...arrivalsOn(today)]) {
        flightMap.set(f.id, f);
      }
      for (const f of flightMap.values()) {
        const statusText = f.status === "Delayed" ? "delayed متأخرة" : f.status;
        const hay = normalizeSearch(`${f.number} ${f.originCode} ${f.destinationCode} ${f.aircraft} ${statusText}`);
        if (hay.includes(q)) {
          out.push({
            id: `f-${f.id}`,
            group: "flights",
            title: f.number,
            meta: `${f.originCode} → ${f.destinationCode} · ${f.departTime}`,
            to: "/admin/flights/$flightId",
            params: { flightId: f.id },
          });
        }
        if (out.length >= 12) break;
      }
    }

    // 3. Bookings and customers (requires commercial.view)
    if (canCommercial) {
      const seenEmails = new Set<string>();
      for (const b of mockBookings) {
        const hay = normalizeSearch(`${b.ref} ${b.lead} ${b.email} ${b.route} ${b.flightOut}`);
        if (hay.includes(q)) {
          out.push({
            id: `b-${b.ref}`,
            group: "bookings",
            title: b.ref,
            meta: `${b.lead} · ${b.route}`,
            to: "/admin/bookings/$ref",
            params: { ref: b.ref },
          });
        }
      }

      // Check mockCustomers
      for (const mc of mockCustomers) {
        const hay = normalizeSearch(`${mc.name} ${mc.email} ${mc.phone} ${mc.id}`);
        if (hay.includes(q) && !seenEmails.has(mc.email)) {
          seenEmails.add(mc.email);
          out.push({
            id: `mc-${mc.id}`,
            group: "customers",
            title: mc.name,
            meta: `${mc.email} · ${mc.phone}`,
            to: "/admin/customers/$id",
            params: { id: mc.id },
          });
        }
      }
    }

    // 4. Destinations (requires ops.view or content.view)
    if (canOps || canContent) {
      for (const d of destinations) {
        const labelEn = d.city.en;
        const labelAr = d.city.ar;
        const countryEn = d.country.en;
        const countryAr = d.country.ar;
        const hay = normalizeSearch(`${d.code} ${labelEn} ${labelAr} ${countryEn} ${countryAr}`);
        if (hay.includes(q)) {
          const displayCity = pick(lang, d.city);
          out.push({
            id: `d-${d.code}`,
            group: "destinations",
            title: displayCity,
            meta: d.code,
            to: "/admin/destinations/$code",
            params: { code: d.code },
          });
        }
      }
    }

    // 5. Content (requires content.view)
    if (canContent) {
      for (const c of contentItems) {
        const label = t(c.titleKey);
        const moduleLabel = t(c.module);
        const hay = normalizeSearch(`${label} ${moduleLabel}`);
        if (hay.includes(q)) {
          out.push({
            id: `k-${c.id}`,
            group: "content",
            title: label,
            meta: moduleLabel,
            to: "/admin/website",
          });
        }
      }
    }

    return out.slice(0, 30);
  }, [query, lang, t, today, canOps, canCommercial, canContent, permittedCommands]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (open) triggerRef.current = document.activeElement as HTMLElement | null;
  }, [open]);

  if (!open) return null;

  const grouped = (["commands", "flights", "bookings", "customers", "destinations", "content"] as GroupId[])
    .map((g) => ({ group: g, items: results.filter((r) => r.group === g) }))
    .filter((g) => g.items.length > 0);
  const flat = grouped.flatMap((g) => g.items);

  const activate = (result: Result | undefined) => {
    if (!result) return;
    onClose();
    if (result.params && result.search) {
      void navigate({ to: result.to, params: result.params, search: result.search });
    } else if (result.params) {
      void navigate({ to: result.to, params: result.params });
    } else if (result.search) {
      void navigate({ to: result.to, search: result.search });
    } else {
      void navigate({ to: result.to });
    }
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (flat.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(flat.length - 1, active + 1);
      setActive(next);
      const targetId = flat[next]?.id;
      if (targetId) {
        document.getElementById(`admin-search-opt-${targetId}`)?.scrollIntoView({ block: "nearest" });
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = Math.max(0, active - 1);
      setActive(prev);
      const targetId = flat[prev]?.id;
      if (targetId) {
        document.getElementById(`admin-search-opt-${targetId}`)?.scrollIntoView({ block: "nearest" });
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      activate(flat[active]);
    }
  };

  let cursor = -1;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        closeLabel={t("adm.search.close")}
        aria-label={t("adm.search.title")}
        className="top-[8vh] flex max-h-[75vh] w-[calc(100%_-_2rem)] max-w-2xl translate-y-0 flex-col gap-0 overflow-hidden rounded-xl border-border bg-card p-0 shadow-[var(--shadow-lift)]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (triggerRef.current?.isConnected) triggerRef.current.focus();
          triggerRef.current = null;
        }}
      >
        <DialogTitle className="sr-only">{t("adm.search.title")}</DialogTitle>
        <DialogDescription className="sr-only">{t("adm.search.placeholder")}</DialogDescription>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search aria-hidden="true" className="size-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-autocomplete="list"
            aria-controls={flat.length > 0 ? "admin-search-listbox" : undefined}
            aria-activedescendant={
              flat.length > 0 && flat[active] ? `admin-search-opt-${flat[active].id}` : undefined
            }
            aria-label={t("adm.search.title")}
            placeholder={t("adm.search.placeholder")}
            className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label={t("adm.search.clear")}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : null}
          <span className="size-11 shrink-0" aria-hidden="true" />
        </div>

        <div id="admin-search-results" className="flex-1 overflow-y-auto">
          {query.trim() === "" ? (
            <div className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("adm.search.suggested")}
                </span>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setQuery(s)}
                    className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {/^[A-Z0-9 ]+$/.test(s) ? <Ltr>{s}</Ltr> : <span>{s}</span>}
                  </button>
                ))}
              </div>
              <ul id="admin-search-listbox" role="listbox" aria-label={t("adm.search.results")} className="py-1">
                {grouped.map((g) => {
                  return (
                    <li key={g.group} role="presentation">
                      <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t(`adm.search.group.${g.group}`)}
                      </p>
                      <ul role="presentation">
                        {g.items.map((r) => {
                          cursor += 1;
                          const index = cursor;
                          const ItemIcon = r.icon || groupIcons[r.group];
                          return (
                            <li
                              key={r.id}
                              id={`admin-search-opt-${r.id}`}
                              role="option"
                              aria-selected={index === active}
                              onMouseEnter={() => setActive(index)}
                              onClick={() => activate(r)}
                              className={cn(
                                "flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-start text-sm select-none",
                                index === active ? "bg-secondary text-foreground" : "hover:bg-secondary/60",
                              )}
                            >
                              <ItemIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                              <span className="min-w-0 flex-1 truncate font-semibold">
                                {r.group === "flights" || r.group === "bookings" ? <Ltr>{r.title}</Ltr> : r.title}
                              </span>
                              <span dir="ltr" className="hidden truncate text-xs text-muted-foreground sm:block">
                                {r.meta}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
              </ul>
              <p className="border-t border-border pt-3 text-xs text-muted-foreground">{t("adm.search.hintKeys")}</p>
            </div>
          ) : flat.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-semibold">{t("adm.search.empty", { q: query })}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("adm.search.emptyBody")}</p>
            </div>
          ) : (
            <ul id="admin-search-listbox" role="listbox" aria-label={t("adm.search.results")} className="py-1">
              {grouped.map((g) => {
                return (
                  <li key={g.group} role="presentation">
                    <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t(`adm.search.group.${g.group}`)}
                    </p>
                    <ul role="presentation">
                      {g.items.map((r) => {
                        cursor += 1;
                        const index = cursor;
                        const ItemIcon = r.icon || groupIcons[r.group];
                        return (
                          <li
                            key={r.id}
                            id={`admin-search-opt-${r.id}`}
                            role="option"
                            aria-selected={index === active}
                            onMouseEnter={() => setActive(index)}
                            onClick={() => activate(r)}
                            className={cn(
                              "flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-start text-sm select-none",
                              index === active ? "bg-secondary text-foreground" : "hover:bg-secondary/60",
                            )}
                          >
                            <ItemIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate font-semibold">
                              {r.group === "flights" || r.group === "bookings" ? <Ltr>{r.title}</Ltr> : r.title}
                            </span>
                            <span dir="ltr" className="hidden truncate text-xs text-muted-foreground sm:block">
                              {r.meta}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
