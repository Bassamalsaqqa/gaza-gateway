import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, MapPin, PlaneTakeoff, Search, Ticket, UsersRound, X } from "lucide-react";
import { pick, useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { useAdmin } from "@/lib/admin-store";
import { contentItems } from "@/lib/admin";
import { arrivalsOn, departuresOn, destinations, todayISO } from "@/lib/data";
import { useAppNavigate } from "@/components/app-link";
import { cn } from "@/lib/utils";
import { AdminChip, Ltr } from "./admin-kit";

type GroupId = "flights" | "bookings" | "customers" | "destinations" | "content";

type Result = {
  id: string;
  group: GroupId;
  title: string;
  meta: string;
  /** Canonical English path, or null when the target module is not built yet. */
  to: string | null;
};

const groupIcons: Record<GroupId, typeof Search> = {
  flights: PlaneTakeoff,
  bookings: Ticket,
  customers: UsersRound,
  destinations: MapPin,
  content: Archive,
};

const suggestions = ["PS", "GZA", "AMM", "IST"];

export function AdminSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useI18n();
  const { bookings, travelers } = useStore();
  const { toast } = useAdmin();
  const navigate = useAppNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const today = todayISO();

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: Result[] = [];

    const flightMap = new Map<string, typeof departuresOn extends (d: string) => (infer F)[] ? F : never>();
    for (const f of [...departuresOn(today), ...arrivalsOn(today)]) {
      flightMap.set(f.id, f);
    }
    for (const b of bookings) {
      if (b.outbound && !flightMap.has(b.outbound.id)) flightMap.set(b.outbound.id, b.outbound);
      if (b.inbound && !flightMap.has(b.inbound.id)) flightMap.set(b.inbound.id, b.inbound);
    }

    for (const f of flightMap.values()) {
      const hay = `${f.number} ${f.originCode} ${f.destinationCode} ${f.aircraft}`.toLowerCase();
      if (hay.includes(q)) {
        out.push({
          id: `f-${f.id}`,
          group: "flights",
          title: f.number,
          meta: `${f.originCode} → ${f.destinationCode} · ${f.departTime}`,
          to: null,
        });
      }
      if (out.length > 24) break;
    }

    for (const b of bookings) {
      const lead = b.passengers[0];
      const hay = `${b.ref} ${lead?.firstName ?? ""} ${lead?.lastName ?? ""} ${b.contact.email}`.toLowerCase();
      if (hay.includes(q)) {
        out.push({
          id: `b-${b.ref}`,
          group: "bookings",
          title: b.ref,
          meta: `${lead?.firstName ?? ""} ${lead?.lastName ?? ""} · ${b.outbound.originCode} → ${b.outbound.destinationCode}`.trim(),
          to: null,
        });
      }
      if (lead) {
        const name = `${lead.firstName} ${lead.lastName}`.trim();
        if (name && name.toLowerCase().includes(q)) {
          out.push({ id: `c-${b.ref}`, group: "customers", title: name, meta: b.contact.email || b.ref, to: null });
        }
      }
    }

    for (const tr of travelers) {
      const name = `${tr.firstName} ${tr.lastName}`.trim();
      if (name.toLowerCase().includes(q)) {
        out.push({ id: `tr-${tr.id}`, group: "customers", title: name, meta: tr.nationality || tr.document || "", to: null });
      }
    }

    for (const d of destinations) {
      const label = pick(lang, d.city);
      if (`${d.code} ${label} ${pick(lang, d.country)}`.toLowerCase().includes(q)) {
        out.push({ id: `d-${d.code}`, group: "destinations", title: label, meta: d.code, to: null });
      }
    }

    for (const c of contentItems) {
      const label = t(c.titleKey);
      if (label.toLowerCase().includes(q)) {
        out.push({ id: `k-${c.id}`, group: "content", title: label, meta: t(c.module), to: null });
      }
    }

    return out.slice(0, 30);
  }, [query, bookings, travelers, lang, t, today]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const items = Array.from(
          panelRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input") ?? [],
        );
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      triggerRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const grouped = (["flights", "bookings", "customers", "destinations", "content"] as GroupId[])
    .map((g) => ({ group: g, items: results.filter((r) => r.group === g) }))
    .filter((g) => g.items.length > 0);
  const flat = grouped.flatMap((g) => g.items);

  const activate = (result: Result | undefined) => {
    if (!result) return;
    onClose();
    if (result.to) {
      void navigate({ to: result.to });
      return;
    }
    toast(t("adm.quick.later", { action: result.title }));
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (flat.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      activate(flat[active]);
    }
  };

  let cursor = -1;

  return (
    <div className="fixed inset-0 z-60 flex items-start justify-center bg-ink/50 p-4 pt-[8vh]">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("adm.search.title")}
        className="flex max-h-[75vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-lift)]"
      >
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
              className="rounded-md p-1 text-muted-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("adm.search.close")}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>

        <div id="admin-search-results" className="flex-1 overflow-y-auto">
          {query.trim() === "" ? (
            <div className="px-4 py-4">
              <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("adm.search.suggested")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setQuery(s)}
                    className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <Ltr>{s}</Ltr>
                  </button>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">{t("adm.search.hintKeys")}</p>
            </div>
          ) : flat.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-semibold">{t("adm.search.empty", { q: query })}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("adm.search.emptyBody")}</p>
            </div>
          ) : (
            <ul id="admin-search-listbox" role="listbox" aria-label={t("adm.search.results")} className="py-1">
              {grouped.map((g) => {
                const Icon = groupIcons[g.group];
                return (
                  <li key={g.group} role="presentation">
                    <p className="px-4 pb-1 pt-3 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t(`adm.search.group.${g.group}`)}
                    </p>
                    <ul role="presentation">
                      {g.items.map((r) => {
                        cursor += 1;
                        const index = cursor;
                        return (
                          <li
                            key={r.id}
                            id={`admin-search-opt-${r.id}`}
                            role="option"
                            aria-selected={index === active}
                          >
                            <button
                              type="button"
                              tabIndex={-1}
                              onMouseEnter={() => setActive(index)}
                              onClick={() => activate(r)}
                              className={cn(
                                "flex w-full items-center gap-3 px-4 py-2 text-start text-sm",
                                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                                index === active ? "bg-secondary" : "hover:bg-secondary/60",
                              )}
                            >
                              <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                              <span className="min-w-0 flex-1 truncate font-semibold">
                                {r.group === "flights" || r.group === "bookings" ? <Ltr>{r.title}</Ltr> : r.title}
                              </span>
                              <span dir="ltr" className="hidden truncate text-xs text-muted-foreground sm:block">
                                {r.meta}
                              </span>
                              {!r.to ? <AdminChip tone="muted">{t("adm.search.later")}</AdminChip> : null}
                            </button>
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
      </div>
    </div>
  );
}
