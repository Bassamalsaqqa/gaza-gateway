import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  archiveContributionsClient,
  type ContributionListItem,
  type ContributionDetail,
  type ContributionStatus,
  type ContributionType,
  type ContributionChapter,
  type ContributionRightsStatus,
} from "@/lib/archive/contributions-client";
import { useStaffQuery } from "@/lib/staff";
import { useAdmin } from "@/lib/admin-store";
import { useI18n, pick } from "@/lib/i18n";
import { Button, Input, Select, Textarea } from "@/components/kit";
import { AdminChip, AdminEmpty, AdminPanel, GazaSheet, Toolbar } from "../admin-kit";
import {
  GazaTable,
  GazaTableBody,
  GazaTableCell,
  GazaTableHead,
  GazaTableHeader,
  GazaTableRow,
} from "@/components/gaza-table";
import { Download, RefreshCw, FileText, CheckCircle2, UserCheck, ShieldAlert, Archive } from "lucide-react";

export function ArchiveContributionsAdmin() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const { can } = useAdmin();
  const canEdit = can("content.edit") || can("engagement.edit");

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [chapterFilter, setChapterFilter] = useState<string>("all");
  const [rightsFilter, setRightsFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Queries
  const listQuery = useQuery({
    queryKey: ["archive-contributions", statusFilter, typeFilter, chapterFilter, rightsFilter, searchQuery],
    queryFn: () => {
      const params: {
        status?: string;
        type?: string;
        chapter?: string;
        rightsStatus?: string;
        search?: string;
      } = {};
      if (statusFilter !== "all") params.status = statusFilter;
      if (typeFilter !== "all") params.type = typeFilter;
      if (chapterFilter !== "all") params.chapter = chapterFilter;
      if (rightsFilter !== "all") params.rightsStatus = rightsFilter;
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }
      return archiveContributionsClient.list(params);
    },
    retry: false,
  });

  const detailQuery = useQuery({
    queryKey: ["archive-contribution-detail", selectedId],
    queryFn: () => (selectedId ? archiveContributionsClient.getById(selectedId) : null),
    enabled: Boolean(selectedId),
    retry: false,
  });

  const { data: staffList = [] } = useStaffQuery();

  // Mutations state
  const [busy, setBusy] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [curatorNotesDraft, setCuratorNotesDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState<ContributionStatus>("received");
  const [assigneeDraft, setAssigneeDraft] = useState<string>("");

  useEffect(() => {
    if (detailQuery.data) {
      setCuratorNotesDraft(detailQuery.data.curatorNotes || "");
      setStatusDraft(detailQuery.data.status);
      setAssigneeDraft(detailQuery.data.assignedStaffId || "");
      setActionNotice(null);
    }
  }, [detailQuery.data]);

  const items = listQuery.data?.items ?? [];

  async function handleStatusUpdate() {
    if (!selectedId || busy) return;
    setBusy(true);
    setActionNotice(null);
    try {
      await archiveContributionsClient.updateStatus(selectedId, statusDraft);
      await detailQuery.refetch();
      await listQuery.refetch();
      setActionNotice(ar ? "تم تحديث حالة المساهمة بنجاح." : "Contribution status updated successfully.");
    } catch {
      setActionNotice(ar ? "تعذر تحديث الحالة." : "Failed to update status.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAssignStaff() {
    if (!selectedId || busy) return;
    setBusy(true);
    setActionNotice(null);
    try {
      const staffVal = assigneeDraft.trim() || null;
      await archiveContributionsClient.assignStaff(selectedId, staffVal);
      await detailQuery.refetch();
      await listQuery.refetch();
      setActionNotice(ar ? "تم تعيين الموظف المسؤول." : "Assignee updated successfully.");
    } catch {
      setActionNotice(ar ? "تعذر تحديث التعيين." : "Failed to update assignment.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveNotes() {
    if (!selectedId || busy) return;
    setBusy(true);
    setActionNotice(null);
    try {
      await archiveContributionsClient.saveNotes(selectedId, curatorNotesDraft);
      await detailQuery.refetch();
      await listQuery.refetch();
      setActionNotice(ar ? "تم حفظ ملاحظات القيم." : "Curator notes saved successfully.");
    } catch {
      setActionNotice(ar ? "تعذر حفظ الملاحظات." : "Failed to save curator notes.");
    } finally {
      setBusy(false);
    }
  }

  const statusTone = (status: ContributionStatus): "muted" | "neutral" | "brand" | "info" | "warn" | "danger" => {
    switch (status) {
      case "received": return "brand";
      case "under_review": return "info";
      case "accepted": return "brand";
      case "declined": return "danger";
      case "archived": return "neutral";
      case "submitted": return "info";
      default: return "neutral";
    }
  };

  const statusLabel = (status: ContributionStatus) => {
    const labels: Record<ContributionStatus, { en: string; ar: string }> = {
      submitted: { en: "Submitted", ar: "مقدمة" },
      received: { en: "Received", ar: "مستلمة" },
      under_review: { en: "Under Review", ar: "قيد المراجعة" },
      accepted: { en: "Accepted", ar: "مقبولة" },
      declined: { en: "Declined", ar: "مرفوضة" },
      archived: { en: "Archived", ar: "مؤرشفة" },
    };
    return pick(lang, labels[status] ?? { en: status, ar: status });
  };

  const typeLabel = (t: ContributionType) => {
    const labels: Record<ContributionType, { en: string; ar: string }> = {
      photograph: { en: "Photograph", ar: "صورة فوتوغرافية" },
      document: { en: "Document", ar: "وثيقة تاريخية" },
      video_reference: { en: "Video", ar: "تسجيل مرئي" },
      oral_history: { en: "Oral History", ar: "شهادة شفوية" },
      artifact: { en: "Artifact", ar: "مقتنى تاريخي" },
      future_concept: { en: "Future Concept", ar: "رؤية مستقبلية" },
      design: { en: "Design", ar: "تصميم" },
      other: { en: "Other", ar: "أخرى" },
    };
    return pick(lang, labels[t] ?? { en: t, ar: t });
  };

  const chapterLabel = (ch?: ContributionChapter | null) => {
    if (!ch) return ar ? "غير محدد" : "Unspecified";
    const labels: Record<ContributionChapter, { en: string; ar: string }> = {
      historical: { en: "Historical archive", ar: "الأرشيف التاريخي" },
      contemporary: { en: "Contemporary Document", ar: "وثيقة معاصرة" },
      imagined_future: { en: "Imagined Future", ar: "رؤية مستقبلية" },
    };
    return pick(lang, labels[ch] ?? { en: ch, ar: ch });
  };

  const rightsTone = (r?: ContributionRightsStatus | null): "muted" | "neutral" | "brand" | "info" | "warn" | "danger" => {
    switch (r) {
      case "owned_authorized": return "brand";
      case "reference_unconfirmed": return "warn";
      default: return "muted";
    }
  };

  const rightsLabel = (r?: ContributionRightsStatus | null) => {
    if (!r) return ar ? "غير محدد" : "Unspecified";
    const labels: Record<ContributionRightsStatus, { en: string; ar: string }> = {
      owned_authorized: { en: "Owner / Authorized", ar: "مملوكة / مصرح بها" },
      reference_unconfirmed: { en: "Reference — rights unconfirmed", ar: "إحالة — حقوق غير مؤكدة" },
      unknown: { en: "Legacy / Unknown", ar: "سجل قديم / غير محدد" },
    };
    return pick(lang, labels[r] ?? { en: r, ar: r });
  };

  return (
    <div className="space-y-5">
      {/* Filters Toolbar */}
      <AdminPanel className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="type-title-section text-foreground">
              {ar ? "مساهمات الأرشيف الواردة" : "Archival Contributions"}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {ar
                ? "مراجعة وتوثيق المواد التاريخية المقدمة من الجمهور والتحقق من الحقوق والتنزيل الآمن للمرفقات الخاصة."
                : "Curatorial review, provenance & rights verification, and private attachment downloads for archive contributions."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={listQuery.isFetching}
            onClick={() => void listQuery.refetch()}
          >
            <RefreshCw className={`size-3.5 ${listQuery.isFetching ? "animate-spin" : ""}`} />
            <span>{ar ? "تحديث القائمة" : "Refresh"}</span>
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              {ar ? "الحالة" : "Status"}
            </label>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">{ar ? "جميع الحالات" : "All Statuses"}</option>
              <option value="received">{ar ? "مستلمة جديدة" : "Received"}</option>
              <option value="under_review">{ar ? "قيد المراجعة" : "Under Review"}</option>
              <option value="accepted">{ar ? "مقبولة" : "Accepted"}</option>
              <option value="declined">{ar ? "مرفوضة" : "Declined"}</option>
              <option value="archived">{ar ? "مؤرشفة" : "Archived"}</option>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              {ar ? "الفصل الأرشيفي" : "Chapter"}
            </label>
            <Select
              value={chapterFilter}
              onChange={(e) => setChapterFilter(e.target.value)}
            >
              <option value="all">{ar ? "جميع الفصول" : "All Chapters"}</option>
              <option value="historical">{ar ? "الأرشيف التاريخي (١٩٩٨–٢٠٠١)" : "Historical Archive (1998–2001)"}</option>
              <option value="contemporary">{ar ? "وثيقة معاصرة" : "Contemporary Document"}</option>
              <option value="imagined_future">{ar ? "رؤية مستقبلية" : "Imagined Future"}</option>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              {ar ? "حالة الحقوق" : "Rights Status"}
            </label>
            <Select
              value={rightsFilter}
              onChange={(e) => setRightsFilter(e.target.value)}
            >
              <option value="all">{ar ? "جميع تصنيفات الحقوق" : "All Rights Statuses"}</option>
              <option value="owned_authorized">{ar ? "مملوكة / مصرح بها" : "Owned / Authorized"}</option>
              <option value="reference_unconfirmed">{ar ? "إحالة مرجعية" : "Public Reference"}</option>
              <option value="unknown">{ar ? "سجل قديم / غير محدد" : "Legacy / Unknown"}</option>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              {ar ? "نوع المادة" : "Type"}
            </label>
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">{ar ? "جميع الأنواع" : "All Types"}</option>
              <option value="photograph">{ar ? "صورة فوتوغرافية" : "Photograph"}</option>
              <option value="document">{ar ? "وثيقة" : "Document"}</option>
              <option value="video_reference">{ar ? "تسجيل مرئي" : "Video"}</option>
              <option value="oral_history">{ar ? "شهادة شفوية" : "Oral History"}</option>
              <option value="artifact">{ar ? "مقتنى" : "Artifact"}</option>
              <option value="future_concept">{ar ? "رؤية مستقبلية" : "Future Concept"}</option>
              <option value="design">{ar ? "تصميم" : "Design"}</option>
              <option value="other">{ar ? "أخرى" : "Other"}</option>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              {ar ? "البحث" : "Search"}
            </label>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={ar ? "الاسم، المرجع، البريد..." : "Name, reference, email..."}
            />
          </div>
        </div>
      </AdminPanel>

      {/* Contributions Table */}
      {listQuery.isError ? (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {ar ? "تعذر تحميل قائمة المساهمات من الخادم." : "Failed to load contributions from server."}
        </div>
      ) : items.length === 0 ? (
        <AdminEmpty
          title={ar ? "لا توجد مساهمات مطابقة" : "No contributions found"}
          body={ar ? "لم يتم العثور على مساهمات أرشيفية وفق معايير التصفية المحددة." : "No archive contributions match the selected filter criteria."}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
          <GazaTable>
            <GazaTableHeader>
              <GazaTableRow>
                <GazaTableHead>{ar ? "المرجع العام" : "Reference"}</GazaTableHead>
                <GazaTableHead>{ar ? "المساهم" : "Contributor"}</GazaTableHead>
                <GazaTableHead>{ar ? "الفصل والنوع" : "Chapter & Type"}</GazaTableHead>
                <GazaTableHead>{ar ? "حالة الحقوق" : "Rights"}</GazaTableHead>
                <GazaTableHead>{ar ? "المرفقات" : "Files"}</GazaTableHead>
                <GazaTableHead>{ar ? "الحالة" : "Status"}</GazaTableHead>
                <GazaTableHead>{ar ? "تاريخ الاستلام" : "Received"}</GazaTableHead>
                <GazaTableHead className="text-end">{ar ? "الإجراءات" : "Actions"}</GazaTableHead>
              </GazaTableRow>
            </GazaTableHeader>
            <GazaTableBody>
              {items.map((row) => (
                <GazaTableRow key={row.id}>
                  <GazaTableCell className="font-mono font-bold text-xs" dir="ltr">
                    {row.publicReference}
                  </GazaTableCell>
                  <GazaTableCell>
                    <div className="font-medium text-foreground">{row.contributorName}</div>
                    {row.contributorNameArabic && (
                      <div className="text-xs text-muted-foreground" dir="rtl">{row.contributorNameArabic}</div>
                    )}
                  </GazaTableCell>
                  <GazaTableCell className="text-xs">
                    <div className="font-medium text-foreground">{chapterLabel(row.chapter)}</div>
                    <div className="text-muted-foreground">{typeLabel(row.contributionType)}</div>
                  </GazaTableCell>
                  <GazaTableCell>
                    <AdminChip tone={rightsTone(row.rightsStatus)}>
                      {rightsLabel(row.rightsStatus)}
                    </AdminChip>
                  </GazaTableCell>
                  <GazaTableCell className="text-xs">
                    {(row.filesCount ?? 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-primary">
                        <FileText className="size-3.5" />
                        <span>{row.filesCount}</span>
                      </span>
                    ) : row.rightsStatus === "reference_unconfirmed" ? (
                      <span className="text-amber-800 dark:text-amber-300 font-medium">
                        {ar ? "إحالة (دون ملف)" : "Citation only"}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </GazaTableCell>
                  <GazaTableCell>
                    <AdminChip tone={statusTone(row.status)}>
                      {statusLabel(row.status)}
                    </AdminChip>
                  </GazaTableCell>
                  <GazaTableCell className="text-xs text-muted-foreground" dir="ltr">
                    {row.createdAt ? row.createdAt.slice(0, 10) : "—"}
                  </GazaTableCell>
                  <GazaTableCell className="text-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedId(String(row.id))}
                    >
                      {ar ? "مراجعة" : "Review"}
                    </Button>
                  </GazaTableCell>
                </GazaTableRow>
              ))}
            </GazaTableBody>
          </GazaTable>
        </div>
      )}

      {/* Review Drawer / Sheet */}
      {selectedId && (
        <GazaSheet
          open={Boolean(selectedId)}
          onClose={() => { setSelectedId(null); setActionNotice(null); }}
          title={ar ? "مراجعة مساهمة الأرشيف" : "Review Archive Contribution"}
          description={detailQuery.data?.publicReference || ""}
        >
          {detailQuery.isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {ar ? "جارٍ تحميل تفاصيل المساهمة…" : "Loading contribution details…"}
            </div>
          ) : detailQuery.data ? (
            <div className="space-y-6 p-1">
              {actionNotice && (
                <div role="status" className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-primary font-medium">
                  {actionNotice}
                </div>
              )}

              {/* Contributor Metadata Card */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-3 text-sm">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="font-mono font-bold text-sm text-primary" dir="ltr">
                    {detailQuery.data.publicReference}
                  </span>
                  <div className="flex items-center gap-2">
                    <AdminChip tone={rightsTone(detailQuery.data.rightsStatus)}>
                      {rightsLabel(detailQuery.data.rightsStatus)}
                    </AdminChip>
                    <AdminChip tone={statusTone(detailQuery.data.status)}>
                      {statusLabel(detailQuery.data.status)}
                    </AdminChip>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <span className="text-xs text-muted-foreground uppercase">{ar ? "اسم المساهم:" : "Contributor:"}</span>
                    <div className="font-semibold text-foreground">{detailQuery.data.contributorName}</div>
                    {detailQuery.data.contributorNameArabic && (
                      <div className="text-xs text-muted-foreground" dir="rtl">{detailQuery.data.contributorNameArabic}</div>
                    )}
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground uppercase">{ar ? "البريد الإلكتروني:" : "Email:"}</span>
                    <div className="font-mono text-xs text-foreground" dir="ltr">{detailQuery.data.email}</div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 pt-2 border-t border-border">
                  <div>
                    <span className="text-xs text-muted-foreground uppercase">{ar ? "الفصل الأرشيفي:" : "Archive Chapter:"}</span>
                    <div className="font-medium text-foreground">{chapterLabel(detailQuery.data.chapter)}</div>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground uppercase">{ar ? "نوع المادة:" : "Type:"}</span>
                    <div className="text-sm">{typeLabel(detailQuery.data.contributionType)}</div>
                  </div>
                </div>

                {/* Extended Archival Metadata: Date, Location, Credit */}
                {(detailQuery.data.approximateDate || detailQuery.data.location || detailQuery.data.credit) && (
                  <div className="grid gap-2 sm:grid-cols-3 pt-2 border-t border-border">
                    {detailQuery.data.approximateDate && (
                      <div>
                        <span className="text-xs text-muted-foreground uppercase">{ar ? "التاريخ أو الفترة التقريبية:" : "Approximate Date / Period:"}</span>
                        <div className="text-sm text-foreground">{detailQuery.data.approximateDate}</div>
                      </div>
                    )}
                    {detailQuery.data.location && (
                      <div>
                        <span className="text-xs text-muted-foreground uppercase">{ar ? "المكان الجغرافي:" : "Location:"}</span>
                        <div className="text-sm text-foreground">{detailQuery.data.location}</div>
                      </div>
                    )}
                    {detailQuery.data.credit && (
                      <div>
                        <span className="text-xs text-muted-foreground uppercase">{ar ? "نسبة المادة / الإسناد:" : "Credit / Attribution:"}</span>
                        <div className="text-sm text-foreground">{detailQuery.data.credit}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Reference URL if provided */}
                {detailQuery.data.referenceUrl && (
                  <div className="pt-2 border-t border-border">
                    <span className="text-xs text-muted-foreground uppercase">{ar ? "رابط الإحالة المرجعية:" : "Reference Link / Citation URL:"}</span>
                    <div className="mt-0.5">
                      {detailQuery.data.referenceUrl.startsWith("http://") || detailQuery.data.referenceUrl.startsWith("https://") ? (
                        <a
                          href={detailQuery.data.referenceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-primary underline break-all hover:text-primary/80"
                        >
                          {detailQuery.data.referenceUrl}
                        </a>
                      ) : (
                        <span className="font-mono text-xs text-foreground break-all">{detailQuery.data.referenceUrl}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Source / Rights Context Note */}
                {detailQuery.data.sourceNote && (
                  <div className="pt-2 border-t border-border">
                    <span className="text-xs text-muted-foreground uppercase">{ar ? "ملاحظة المصدر وتوثيق الحقوق:" : "Source & Rights Context Note:"}</span>
                    <p className="mt-1 text-xs leading-relaxed text-foreground whitespace-pre-wrap bg-sand/30 p-2.5 rounded-md border border-border/60">
                      {detailQuery.data.sourceNote}
                    </p>
                  </div>
                )}

                <div className="pt-2 border-t border-border">
                  <span className="text-xs text-muted-foreground uppercase">{ar ? "سياق المادة والوصف التوثيقي:" : "Description & Archival Context:"}</span>
                  <p className="mt-1 text-sm leading-relaxed text-foreground whitespace-pre-wrap bg-sand-deep/20 p-3 rounded-md border border-border/50">
                    {detailQuery.data.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-border text-[11px] text-muted-foreground flex flex-wrap items-center justify-between gap-1">
                  <span>{ar ? "تاريخ التقديم:" : "Submitted:"} <span dir="ltr" className="font-mono">{detailQuery.data.createdAt}</span></span>
                  <span className="italic">{ar ? "إيصال استلام أرشيفي خاص — لا يُعد ترخيصاً بالنشر العام" : "Private intake receipt — not a public license"}</span>
                </div>
              </div>

              {/* Private Attachments Section */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <FileText className="size-4 text-clay" />
                  <span>{ar ? "المرفقات الخاصة المحفوظة" : "Private Storage Attachments"}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    ({detailQuery.data.files.length})
                  </span>
                </h4>

                {detailQuery.data.files.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {detailQuery.data.rightsStatus === "reference_unconfirmed"
                      ? (ar ? "هذه مساهمة مرجعية (إحالة/اقتباس)؛ لم يُسمح برفع مرفقات رقمية محمية بحقوق غير مصرح بها." : "This is a reference citation. Protected digital uploads were disabled for unconfirmed rights.")
                      : (ar ? "لا توجد مرفقات رقمية مرفقة مع هذه المساهمة." : "No files attached with this contribution.")}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {detailQuery.data.files.map((file) => (
                      <li
                        key={file.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-xs bg-background"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-foreground truncate max-w-xs sm:max-w-md" dir="ltr">
                            {file.originalFilename}
                          </div>
                          <div className="text-muted-foreground font-mono text-[11px] mt-0.5">
                            {file.fileBytes ? `${(file.fileBytes / 1024 / 1024).toFixed(2)} MB · ` : ""}{file.mimeType}
                          </div>
                        </div>
                        <a
                          href={archiveContributionsClient.getDownloadUrl(selectedId, file.id)}
                          download={file.originalFilename}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-sand-deep/40 px-3 py-1.5 text-xs font-semibold hover:bg-sand-deep text-foreground transition-colors"
                        >
                          <Download className="size-3.5" />
                          <span>{ar ? "تنزيل المرفق" : "Download"}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Curator Notes & Status Mutation (Authorized Staff Only) */}
              {canEdit && (
                <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                  <h4 className="text-sm font-bold text-foreground">
                    {ar ? "إدارة التوثيق وملاحظات القيم" : "Curator Actions & Review"}
                  </h4>

                  {/* Status Dropdown */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">
                      {ar ? "حالة المساهمة:" : "Contribution Status:"}
                    </label>
                    <div className="flex gap-2">
                      <Select
                        value={statusDraft}
                        onChange={(e) => setStatusDraft(e.target.value as ContributionStatus)}
                        className="flex-1"
                      >
                        <option value="received">{ar ? "مستلمة جديدة" : "Received"}</option>
                        <option value="under_review">{ar ? "قيد المراجعة التوثيقية" : "Under Review"}</option>
                        <option value="accepted">{ar ? "مقبولة للحفظ والأرشفة" : "Accepted"}</option>
                        <option value="declined">{ar ? "مرفوضة" : "Declined"}</option>
                        <option value="archived">{ar ? "مؤرشفة ومغلقة" : "Archived"}</option>
                      </Select>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={busy || statusDraft === detailQuery.data.status}
                        onClick={() => void handleStatusUpdate()}
                      >
                        {ar ? "تحديث الحالة" : "Update Status"}
                      </Button>
                    </div>
                  </div>

                  {/* Staff Assignee */}
                  <div className="space-y-1.5 pt-2 border-t border-border">
                    <label className="text-xs font-semibold text-muted-foreground">
                      {ar ? "تعيين القيم المسؤول:" : "Assigned Curator:"}
                    </label>
                    <div className="flex gap-2">
                      <Select
                        value={assigneeDraft}
                        onChange={(e) => setAssigneeDraft(e.target.value)}
                        className="flex-1"
                      >
                        <option value="">{ar ? "غير معين" : "Unassigned"}</option>
                        {staffList.map((st) => (
                          <option key={st.id} value={st.id}>
                            {pick(lang, st.name)} ({st.role})
                          </option>
                        ))}
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || assigneeDraft === (detailQuery.data.assignedStaffId || "")}
                        onClick={() => void handleAssignStaff()}
                      >
                        {ar ? "حفظ التعيين" : "Assign"}
                      </Button>
                    </div>
                  </div>

                  {/* Curator Notes */}
                  <div className="space-y-1.5 pt-2 border-t border-border">
                    <label className="text-xs font-semibold text-muted-foreground">
                      {ar ? "ملاحظات القيم الداخلية:" : "Internal Curator Notes:"}
                    </label>
                    <Textarea
                      rows={3}
                      value={curatorNotesDraft}
                      onChange={(e) => setCuratorNotesDraft(e.target.value)}
                      placeholder={ar ? "سجل نتائج التحقق من أصالة المواد والمصدر..." : "Record verification notes, provenance details, or curator comments..."}
                    />
                    <div className="flex justify-end pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || curatorNotesDraft === (detailQuery.data.curatorNotes || "")}
                        onClick={() => void handleSaveNotes()}
                      >
                        {ar ? "حفظ الملاحظات" : "Save Notes"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Audit History Trail */}
              {detailQuery.data.audits.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {ar ? "سجل إجراءات القيمين" : "Curatorial Audit Trail"}
                  </h4>
                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    {detailQuery.data.audits.map((a) => (
                      <li key={a.id} className="border-b border-border/40 pb-1 flex justify-between">
                        <span>{a.details || a.action}</span>
                        <span dir="ltr" className="font-mono text-[11px]">{a.createdAt.slice(0, 16).replace("T", " ")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </GazaSheet>
      )}
    </div>
  );
}
