import { GazaTable, GazaTableBody, GazaTableCaption, GazaTableCell, GazaTableHead, GazaTableHeader, GazaTableRow } from "@/components/gaza-table";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Input, Select, Textarea, btnClass } from "@/components/kit";
import {
  AdminChip,
  AdminEmpty,
  AdminField,
  AdminPageHeader,
  AdminPanel,
  GazaSheet,
  AdminTabs,
  BilingualStatus,
  ContentStateChip,
  Ltr,
  PermissionButton,
  Toolbar,
} from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import {
  archiveItems,
  futureItems,
  mediaItems,
  presentFacts,
  sourceRecords,
  timelineEntries,
  type ArchiveItem,
  type MediaItem,
  type SourceRecord,
  type TimelineEntry,
  type Verification,
} from "@/lib/admin-mock";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/{-$locale}/admin/airport/")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/airport",
      en: { title: "Airport and archive — Gaza International Airport administration", description: "Past, present, future, archive, sources and media." },
      ar: { title: "المطار والأرشيف — إدارة مطار غزة الدولي", description: "الماضي والحاضر والمستقبل والأرشيف والمصادر والوسائط." },
      noindex: true,
    }),
  component: AdminAirportPage,
});

type Tab = "past" | "present" | "future" | "archive" | "sources" | "media";
type Lang = "en" | "ar";

const verifTone = (v: Verification) => (v === "verified" ? "brand" : v === "pending" ? "warn" : "danger");

function AdminAirportPage() {
  const { t, lang } = useI18n();
  const { can, toast } = useAdmin();
  const [tab, setTab] = useState<Tab>("past");
  const [editLang, setEditLang] = useState<Lang>("en");
  const [entry, setEntry] = useState<TimelineEntry | null>(null);
  const [item, setItem] = useState<ArchiveItem | null>(null);
  const [source, setSource] = useState<SourceRecord | null>(null);
  const [media, setMedia] = useState<MediaItem | null>(null);
  const [upload, setUpload] = useState(false);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [era, setEra] = useState("all");
  const [category, setCategory] = useState("all");
  const [state, setState] = useState("all");
  const [mediaKind, setMediaKind] = useState("all");
  const mayEdit = can("content.edit");

  const archiveRows = useMemo(
    () =>
      archiveItems.filter((a) => {
        if (era !== "all" && a.era !== era) return false;
        if (category !== "all" && a.category !== category) return false;
        if (state === "missing" && a.source) return false;
        if (state !== "all" && state !== "missing" && a.state !== state) return false;
        return true;
      }),
    [era, category, state],
  );

  const mediaRows = useMemo(() => mediaItems.filter((m) => (mediaKind === "all" ? true : mediaKind === "unused" ? m.usedIn.length === 0 : m.kind === mediaKind)), [mediaKind]);

  if (!can("content.view")) return <AdminDenied area={t("a2.ap.title")} permission="content.view" />;

  const langToggle = (
    <div role="group" aria-label={`${t("a2.english")} / ${t("a2.arabic")}`} className="flex gap-1">
      {(["en", "ar"] as const).map((l) => (
        <button key={l} type="button" aria-pressed={editLang === l} onClick={() => setEditLang(l)} className={btnClass(editLang === l ? "secondary" : "ghost", "sm")}>
          {t(l === "en" ? "a2.english" : "a2.arabic")}
        </button>
      ))}
    </div>
  );

  const sheetFooter = (close: () => void) => (
    <>
      <button type="button" className={btnClass("outline", "sm")} onClick={close}>
        {t("a2.cancel")}
      </button>
      <PermissionButton
        allowed={mayEdit}
        reason={t("adm.edit.readOnly")}
        variant="primary"
        onClick={() => {
          close();
          toast(t("a2.saved"));
        }}
      >
        {t("a2.save")}
      </PermissionButton>
    </>
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("a2.ap.title")}
        description={t("a2.ap.sub")}
        meta={<p className="text-xs text-muted-foreground">{t("a2.mock")}</p>}
        action={
          <>
            <a href="/airport/past" target="_blank" rel="noreferrer" className={btnClass("outline", "sm")}>
              {t("a2.previewEn")}
            </a>
            <a href="/ar/airport/past" target="_blank" rel="noreferrer" className={btnClass("outline", "sm")}>
              {t("a2.previewAr")}
            </a>
          </>
        }
      />

      <AdminPanel bodyClassName="p-0">
        <AdminTabs
          label={t("a2.ap.title")}
          active={tab}
          onChange={setTab}
          tabs={[
            { id: "past", label: t("a2.ap.tab.past"), count: timelineEntries.length },
            { id: "present", label: t("a2.ap.tab.present") },
            { id: "future", label: t("a2.ap.tab.future") },
            { id: "archive", label: t("a2.ap.tab.archive"), count: archiveItems.length },
            { id: "sources", label: t("a2.ap.tab.sources"), count: sourceRecords.length },
            { id: "media", label: t("a2.ap.tab.media"), count: mediaItems.length },
          ]}
        />

        <div className="space-y-4 p-4">
          {tab !== "archive" && tab !== "sources" && tab !== "media" ? langToggle : null}

          {/* ------------------------------- PAST ------------------------------- */}
          {tab === "past" ? (
            <div className="space-y-3">
              <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} variant="primary" onClick={() => setEntry(timelineEntries[0] ?? null)}>
                {t("a2.ap.past.addEntry")}
              </PermissionButton>
              <ol className="space-y-2">
                {timelineEntries.map((e) => (
                  <li key={e.id} className="rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Ltr className="text-sm font-bold">{e.period}</Ltr>
                      <span className="text-sm font-semibold">{pick(lang, e.title)}</span>
                      <ContentStateChip state={e.state} />
                      <AdminChip tone={verifTone(e.verification)}>{t(`a2.ap.ver.${e.verification}`)}</AdminChip>
                      <BilingualStatus missingAr={e.narrative.ar.length === 0} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{pick(lang, e.narrative)}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button type="button" className={btnClass("outline", "sm")} onClick={() => setEntry(e)}>
                        {t("a2.edit")}
                      </button>
                      {[t("a2.duplicate"), t("a2.moveUp"), t("a2.moveDown"), t("a2.archiveAction"), t("a2.ap.past.attach")].map((label) => (
                        <PermissionButton key={label} allowed={mayEdit} reason={t("adm.edit.readOnly")} onClick={() => toast(t("a2.uiOnly"))}>
                          {label}
                        </PermissionButton>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {/* ------------------------------ PRESENT ----------------------------- */}
          {tab === "present" ? (
            <div className="space-y-3">
              <section className="rounded-md border border-border">
                <h3 className="border-b border-border px-3 py-2 text-sm font-bold">{t("a2.ap.pr.facts")}</h3>
                <ul className="divide-y divide-border">
                  {presentFacts.map((f) => (
                    <li key={f.id} className="grid gap-2 p-3 lg:grid-cols-[12rem_1fr_auto] lg:items-end">
                      <AdminField label={t("a2.title")} htmlFor={`pr-l-${f.id}`}>
                        <Input id={`pr-l-${f.id}`} dir={editLang === "ar" ? "rtl" : "ltr"} defaultValue={f.label[editLang]} />
                      </AdminField>
                      <AdminField label={t("a2.body")} htmlFor={`pr-v-${f.id}`}>
                        <Input id={`pr-v-${f.id}`} dir={editLang === "ar" ? "rtl" : "ltr"} defaultValue={f.value[editLang]} />
                      </AdminField>
                      <AdminChip tone={verifTone(f.verification)}>{t(`a2.ap.ver.${f.verification}`)}</AdminChip>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-border p-3">
                  <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} onClick={() => toast(t("a2.uiOnly"))}>
                    {t("a2.ap.pr.addFact")}
                  </PermissionButton>
                </div>
              </section>

              <section className="grid gap-3 rounded-md border border-border p-3 lg:grid-cols-2">
                <AdminField label={t("a2.ap.pr.site")} htmlFor="pr-site">
                  <Textarea id="pr-site" rows={3} dir={editLang === "ar" ? "rtl" : "ltr"} defaultValue="" />
                </AdminField>
                <div className="space-y-2">
                  <AdminField label={t("a2.ap.pr.map")} htmlFor="pr-map" hint={t("a2.selectMedia")}>
                    <Select id="pr-map" defaultValue="site-aerial.jpg">
                      {mediaItems.map((m) => (
                        <option key={m.id} value={m.filename}>{m.filename}</option>
                      ))}
                    </Select>
                  </AdminField>
                  <AdminField label={t("a2.ap.pr.caption")} htmlFor="pr-cap">
                    <Input id="pr-cap" dir={editLang === "ar" ? "rtl" : "ltr"} />
                  </AdminField>
                </div>
              </section>
            </div>
          ) : null}

          {/* ------------------------------- FUTURE ----------------------------- */}
          {tab === "future" ? (
            <div className="space-y-3">
              <p className="rounded-md border border-border bg-sand p-3 text-xs text-muted-foreground">{t("a2.ap.fu.placeholder")}</p>
              <ul className="space-y-2">
                {futureItems.map((f) => (
                  <li key={f.id} className="rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold">{t(f.group)}</h3>
                      <AdminChip tone={f.visible ? "brand" : "muted"}>{t(f.visible ? "a2.visible" : "a2.hidden")}</AdminChip>
                    </div>
                    <div className="mt-2 grid gap-3 lg:grid-cols-2">
                      <AdminField label={t("a2.title")} htmlFor={`fu-t-${f.id}`}>
                        <Input id={`fu-t-${f.id}`} dir={editLang === "ar" ? "rtl" : "ltr"} defaultValue={f.title[editLang]} />
                      </AdminField>
                      <AdminField label={t("a2.media")} htmlFor={`fu-m-${f.id}`} hint={t("a2.ap.fu.gallery")}>
                        <Input id={`fu-m-${f.id}`} dir="ltr" defaultValue={f.media} />
                      </AdminField>
                      <AdminField label={t("a2.body")} htmlFor={`fu-b-${f.id}`} className="lg:col-span-2">
                        <Textarea id={`fu-b-${f.id}`} rows={2} dir={editLang === "ar" ? "rtl" : "ltr"} defaultValue={f.body[editLang]} />
                      </AdminField>
                    </div>
                  </li>
                ))}
              </ul>
              <AdminField label={t("a2.ap.fu.dests")} htmlFor="fu-dests">
                <Input id="fu-dests" dir="ltr" defaultValue="AMM, CAI, IST, DOH, DXB, JED, RUH" />
              </AdminField>
            </div>
          ) : null}

          {/* ------------------------------ ARCHIVE ----------------------------- */}
          {tab === "archive" ? (
            <div className="space-y-3">
              <Toolbar>
                <Select aria-label={t("a2.ap.ar.era")} value={era} onChange={(e) => setEra(e.target.value)} className="w-auto">
                  <option value="all">{t("a2.all")}</option>
                  {(["past", "present", "future"] as const).map((v) => (
                    <option key={v} value={v}>{t(`a2.ap.era.${v}`)}</option>
                  ))}
                </Select>
                <Select aria-label={t("a2.ap.ar.category")} value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto">
                  <option value="all">{t("a2.all")}</option>
                  {(["photograph", "document", "architecture", "concept"] as const).map((v) => (
                    <option key={v} value={v}>{t(`a2.ap.cat.${v}`)}</option>
                  ))}
                </Select>
                <Select aria-label={t("a2.status")} value={state} onChange={(e) => setState(e.target.value)} className="w-auto">
                  <option value="all">{t("a2.all")}</option>
                  <option value="draft">{t("adm.state.draft")}</option>
                  <option value="published">{t("adm.state.published")}</option>
                  <option value="missing">{t("a2.ap.ar.missingSource")}</option>
                </Select>
                <div className="flex gap-1">
                  {(["grid", "table"] as const).map((v) => (
                    <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={btnClass(view === v ? "secondary" : "ghost", "sm")}>
                      {t(`a2.${v}`)}
                    </button>
                  ))}
                </div>
              </Toolbar>

              {archiveRows.length === 0 ? (
                <AdminEmpty title={t("a2.ap.tab.archive")} body={t("a2.mock")} />
              ) : view === "grid" ? (
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {archiveRows.map((a) => (
                    <li key={a.id} className="rounded-md border border-border p-3">
                      <div aria-hidden="true" className="mb-2 h-24 rounded bg-sand" />
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold">{pick(lang, a.title)}</h3>
                        <ContentStateChip state={a.state} />
                        {a.featured ? <AdminChip tone="info">{t("a2.ap.ar.featured")}</AdminChip> : null}
                        {!a.source ? <AdminChip tone="danger">{t("a2.ap.ar.missingSource")}</AdminChip> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {`${t(`a2.ap.era.${a.era}`)} · ${t(`a2.ap.cat.${a.category}`)} · `}
                        <Ltr>{a.date}</Ltr>
                      </p>
                      <button type="button" className={btnClass("outline", "sm", "mt-2")} onClick={() => setItem(a)}>
                        {t("a2.edit")}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="overflow-x-auto">
                  <GazaTable className="w-full text-sm">
                    <GazaTableCaption className="sr-only">{t("a2.ap.tab.archive")}</GazaTableCaption>
                    <GazaTableHeader>
                      <GazaTableRow className="border-b border-border type-th">
                        {[t("a2.title"), t("a2.ap.ar.era"), t("a2.ap.ar.category"), t("a2.date"), t("a2.ap.ar.source"), t("a2.status")].map((h) => (
                          <GazaTableHead key={h} scope="col" className="px-3 py-2 text-start font-bold">{h}</GazaTableHead>
                        ))}
                      </GazaTableRow>
                    </GazaTableHeader>
                    <GazaTableBody>
                      {archiveRows.map((a) => (
                        <GazaTableRow key={a.id} className="border-b border-border last:border-0">
                          <GazaTableCell className="px-3 py-2">
                            <button type="button" className="font-semibold underline decoration-dotted" onClick={() => setItem(a)}>
                              {pick(lang, a.title)}
                            </button>
                          </GazaTableCell>
                          <GazaTableCell className="px-3 py-2">{t(`a2.ap.era.${a.era}`)}</GazaTableCell>
                          <GazaTableCell className="px-3 py-2">{t(`a2.ap.cat.${a.category}`)}</GazaTableCell>
                          <GazaTableCell className="px-3 py-2"><Ltr>{a.date}</Ltr></GazaTableCell>
                          <GazaTableCell className="px-3 py-2">{a.source ? <Ltr>{a.source}</Ltr> : <AdminChip tone="danger">{t("a2.ap.ar.missingSource")}</AdminChip>}</GazaTableCell>
                          <GazaTableCell className="px-3 py-2"><ContentStateChip state={a.state} /></GazaTableCell>
                        </GazaTableRow>
                      ))}
                    </GazaTableBody>
                  </GazaTable>
                </div>
              )}
            </div>
          ) : null}

          {/* ------------------------------ SOURCES ----------------------------- */}
          {tab === "sources" ? (
            <div className="space-y-3">
              <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} variant="primary" onClick={() => setSource(sourceRecords[0] ?? null)}>
                {t("a2.ap.src.add")}
              </PermissionButton>
              <div className="overflow-x-auto">
                <GazaTable className="w-full text-sm">
                  <GazaTableCaption className="sr-only">{t("a2.ap.tab.sources")}</GazaTableCaption>
                  <GazaTableHeader>
                    <GazaTableRow className="border-b border-border type-th">
                      {[t("a2.title"), t("a2.ap.src.type"), t("a2.ap.src.org"), t("a2.ap.src.date"), t("a2.status"), t("a2.ap.src.usedBy")].map((h) => (
                        <GazaTableHead key={h} scope="col" className="px-3 py-2 text-start font-bold">{h}</GazaTableHead>
                      ))}
                    </GazaTableRow>
                  </GazaTableHeader>
                  <GazaTableBody>
                    {sourceRecords.map((s) => (
                      <GazaTableRow key={s.id} className="border-b border-border last:border-0">
                        <GazaTableCell className="px-3 py-2">
                          <button type="button" className="font-semibold underline decoration-dotted" onClick={() => setSource(s)}>
                            {pick(lang, s.title)}
                          </button>
                        </GazaTableCell>
                        <GazaTableCell className="px-3 py-2">{t(`a2.ap.src.t.${s.type}`)}</GazaTableCell>
                        <GazaTableCell className="px-3 py-2">{s.org}</GazaTableCell>
                        <GazaTableCell className="px-3 py-2"><Ltr>{s.date}</Ltr></GazaTableCell>
                        <GazaTableCell className="px-3 py-2"><AdminChip tone={verifTone(s.verification)}>{t(`a2.ap.ver.${s.verification}`)}</AdminChip></GazaTableCell>
                        <GazaTableCell className="px-3 py-2"><Ltr>{s.usedBy}</Ltr></GazaTableCell>
                      </GazaTableRow>
                    ))}
                  </GazaTableBody>
                </GazaTable>
              </div>
            </div>
          ) : null}

          {/* ------------------------------- MEDIA ------------------------------ */}
          {tab === "media" ? (
            <div className="space-y-3">
              <Toolbar>
                <Select aria-label={t("a2.status")} value={mediaKind} onChange={(e) => setMediaKind(e.target.value)} className="w-auto">
                  <option value="all">{t("a2.all")}</option>
                  <option value="image">{t("a2.ap.md.kind.image")}</option>
                  <option value="document">{t("a2.ap.md.kind.document")}</option>
                  <option value="video">{t("a2.ap.md.kind.video")}</option>
                  <option value="unused">{t("a2.ap.md.unused")}</option>
                </Select>
                <div className="flex gap-1">
                  {(["grid", "list"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={(v === "grid") === (view === "grid")}
                      onClick={() => setView(v === "grid" ? "grid" : "table")}
                      className={btnClass((v === "grid") === (view === "grid") ? "secondary" : "ghost", "sm")}
                    >
                      {t(`a2.${v}`)}
                    </button>
                  ))}
                </div>
                <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} onClick={() => setUpload(true)}>
                  {t("a2.ap.md.upload")}
                </PermissionButton>
              </Toolbar>

              {mediaRows.length === 0 ? (
                <AdminEmpty title={t("a2.ap.tab.media")} body={t("a2.mock")} />
              ) : view === "grid" ? (
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {mediaRows.map((m) => (
                    <li key={m.id} className="rounded-md border border-border p-3">
                      <div aria-hidden="true" className="mb-2 h-20 rounded bg-sand" />
                      <p className="text-sm font-semibold">{pick(lang, m.title)}</p>
                      <p className="text-xs text-muted-foreground"><Ltr>{m.filename}</Ltr></p>
                      <p className="text-xs text-muted-foreground"><Ltr>{m.meta}</Ltr></p>
                      {m.usedIn.length === 0 ? <AdminChip tone="warn" className="mt-1">{t("a2.ap.md.unused")}</AdminChip> : null}
                      <button type="button" className={btnClass("outline", "sm", "mt-2")} onClick={() => setMedia(m)}>
                        {t("a2.edit")}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {mediaRows.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{pick(lang, m.title)}</p>
                        <p className="text-xs text-muted-foreground">
                          <Ltr>{`${m.filename} · ${m.meta} · ${m.uploaded}`}</Ltr>
                        </p>
                      </div>
                      <button type="button" className={btnClass("outline", "sm")} onClick={() => setMedia(m)}>
                        {t("a2.edit")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </AdminPanel>

      {/* -------------------------------- sheets -------------------------------- */}
      <GazaSheet open={entry !== null} title={t("a2.ap.past.editor")} description={entry?.period ?? ""} onClose={() => setEntry(null)} footer={sheetFooter(() => setEntry(null))}>
        {entry ? (
          <div className="space-y-3">
            <AdminField label={t("a2.ap.past.period")} htmlFor="pa-period">
              <Input id="pa-period" dir="ltr" defaultValue={entry.period} />
            </AdminField>
            <AdminField label={t("a2.title")} htmlFor="pa-title">
              <Input id="pa-title" dir={editLang === "ar" ? "rtl" : "ltr"} defaultValue={entry.title[editLang]} />
            </AdminField>
            <AdminField label={t("a2.ap.past.narrative")} htmlFor="pa-narr">
              <Textarea id="pa-narr" rows={5} dir={editLang === "ar" ? "rtl" : "ltr"} defaultValue={entry.narrative[editLang]} />
            </AdminField>
            <AdminField label={t("a2.media")} htmlFor="pa-media">
              <Input id="pa-media" dir="ltr" defaultValue={entry.media} />
            </AdminField>
            <AdminField label={t("a2.status")} htmlFor="pa-state">
              <Select id="pa-state" defaultValue={entry.state}>
                {(["draft", "published", "archived"] as const).map((s) => (
                  <option key={s} value={s}>{t(`adm.state.${s}`)}</option>
                ))}
              </Select>
            </AdminField>
          </div>
        ) : null}
      </GazaSheet>

      <GazaSheet open={item !== null} title={t("a2.ap.ar.editor")} description={item?.id ?? ""} onClose={() => setItem(null)} footer={sheetFooter(() => setItem(null))}>
        {item ? (
          <div className="space-y-3">
            <AdminField label={t("a2.title")} htmlFor="ai-title">
              <Input id="ai-title" dir={editLang === "ar" ? "rtl" : "ltr"} defaultValue={item.title[editLang]} />
            </AdminField>
            <AdminField label={t("a2.ap.ar.category")} htmlFor="ai-cat">
              <Select id="ai-cat" defaultValue={item.category}>
                {(["photograph", "document", "architecture", "concept"] as const).map((c) => (
                  <option key={c} value={c}>{t(`a2.ap.cat.${c}`)}</option>
                ))}
              </Select>
            </AdminField>
            <AdminField label={t("a2.ap.ar.era")} htmlFor="ai-era">
              <Select id="ai-era" defaultValue={item.era}>
                {(["past", "present", "future"] as const).map((c) => (
                  <option key={c} value={c}>{t(`a2.ap.era.${c}`)}</option>
                ))}
              </Select>
            </AdminField>
            <AdminField label={t("a2.ap.ar.caption")} htmlFor="ai-cap">
              <Textarea id="ai-cap" rows={2} dir={editLang === "ar" ? "rtl" : "ltr"} defaultValue={item.caption[editLang]} />
            </AdminField>
            <AdminField label={t("a2.ap.ar.credit")} htmlFor="ai-credit">
              <Input id="ai-credit" defaultValue={item.credit} />
            </AdminField>
            <AdminField label={t("a2.date")} htmlFor="ai-date">
              <Input id="ai-date" dir="ltr" defaultValue={item.date} />
            </AdminField>
            <AdminField label={t("a2.ap.ar.source")} htmlFor="ai-source">
              <Select id="ai-source" defaultValue={item.source ?? "none"}>
                <option value="none">{t("a2.none")}</option>
                {sourceRecords.map((s) => (
                  <option key={s.id} value={s.id}>{pick(lang, s.title)}</option>
                ))}
              </Select>
            </AdminField>
            <AdminField label={t("a2.ap.ar.rights")} htmlFor="ai-rights">
              <Input id="ai-rights" defaultValue={item.rights} />
            </AdminField>
            <AdminField label={t("a2.ap.ar.chapter")} htmlFor="ai-chapter">
              <Select id="ai-chapter" defaultValue={item.chapter ?? "none"}>
                <option value="none">{t("a2.none")}</option>
                {timelineEntries.map((e) => (
                  <option key={e.id} value={e.id}>{`${e.period} — ${pick(lang, e.title)}`}</option>
                ))}
              </Select>
            </AdminField>
            <AdminField label={t("a2.ap.ar.internal")} htmlFor="ai-note">
              <Textarea id="ai-note" rows={2} defaultValue={item.note} />
            </AdminField>
            <AdminField label={t("a2.status")} htmlFor="ai-state">
              <Select id="ai-state" defaultValue={item.state}>
                {(["draft", "published", "archived"] as const).map((s) => (
                  <option key={s} value={s}>{t(`adm.state.${s}`)}</option>
                ))}
              </Select>
            </AdminField>
          </div>
        ) : null}
      </GazaSheet>

      <GazaSheet open={source !== null} title={t("a2.ap.src.editor")} description={source?.id ?? ""} onClose={() => setSource(null)} footer={sheetFooter(() => setSource(null))}>
        {source ? (
          <div className="space-y-3">
            <AdminField label={t("a2.title")} htmlFor="sr-title">
              <Input id="sr-title" dir={editLang === "ar" ? "rtl" : "ltr"} defaultValue={source.title[editLang]} />
            </AdminField>
            <AdminField label={t("a2.ap.src.type")} htmlFor="sr-type">
              <Select id="sr-type" defaultValue={source.type}>
                {(["document", "photograph", "report", "interview", "statement", "map", "survey"] as const).map((v) => (
                  <option key={v} value={v}>{t(`a2.ap.src.t.${v}`)}</option>
                ))}
              </Select>
            </AdminField>
            <AdminField label={t("a2.ap.src.org")} htmlFor="sr-org">
              <Input id="sr-org" defaultValue={source.org} />
            </AdminField>
            <AdminField label={t("a2.ap.src.date")} htmlFor="sr-date">
              <Input id="sr-date" dir="ltr" defaultValue={source.date} />
            </AdminField>
            <AdminField label={t("a2.status")} htmlFor="sr-ver">
              <Select id="sr-ver" defaultValue={source.verification}>
                {(["verified", "pending", "unsourced"] as const).map((v) => (
                  <option key={v} value={v}>{t(`a2.ap.ver.${v}`)}</option>
                ))}
              </Select>
            </AdminField>
          </div>
        ) : null}
      </GazaSheet>

      <GazaSheet open={media !== null} title={t("a2.ap.md.editor")} description={media?.filename ?? ""} onClose={() => setMedia(null)} footer={sheetFooter(() => setMedia(null))}>
        {media ? (
          <div className="space-y-3">
            <div aria-hidden="true" className="h-28 rounded bg-sand" />
            <AdminField label={t("a2.ap.md.filename")} htmlFor="md-file">
              <Input id="md-file" dir="ltr" defaultValue={media.filename} />
            </AdminField>
            <AdminField label={t("a2.title")} htmlFor="md-title">
              <Input id="md-title" dir={editLang === "ar" ? "rtl" : "ltr"} defaultValue={media.title[editLang]} />
            </AdminField>
            <AdminField label={t("a2.ap.md.alt")} htmlFor="md-alt">
              <Input id="md-alt" dir={editLang === "ar" ? "rtl" : "ltr"} defaultValue={media.alt[editLang]} />
            </AdminField>
            <AdminField label={t("a2.ap.md.dimensions")} htmlFor="md-dim">
              <Input id="md-dim" dir="ltr" defaultValue={media.meta} />
            </AdminField>
            <AdminField label={t("a2.ap.md.credit")} htmlFor="md-credit">
              <Input id="md-credit" defaultValue="" />
            </AdminField>
            <AdminField label={t("a2.ap.md.rights")} htmlFor="md-rights">
              <Input id="md-rights" defaultValue={media.rights} />
            </AdminField>
            <AdminField label={t("a2.ap.md.tags")} htmlFor="md-tags">
              <Input id="md-tags" defaultValue="" />
            </AdminField>
            <AdminField label={t("a2.ap.md.focal")} htmlFor="md-focal">
              <Select id="md-focal" defaultValue="center">
                <option value="center">Center</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
              </Select>
            </AdminField>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("a2.ap.md.usedIn")}</p>
              {media.usedIn.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("a2.ap.md.unused")}</p>
              ) : (
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {media.usedIn.map((u) => (
                    <li key={u}><Ltr>{u}</Ltr></li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </GazaSheet>

      <GazaSheet
        open={upload}
        title={t("a2.ap.md.upload")}
        description={t("a2.ap.md.uploadBody")}
        onClose={() => setUpload(false)}
        footer={sheetFooter(() => setUpload(false))}
      >
        <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">{t("a2.ap.md.uploadBody")}</div>
      </GazaSheet>
    </div>
  );
}
