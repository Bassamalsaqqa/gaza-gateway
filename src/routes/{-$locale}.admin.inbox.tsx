import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppLink } from "@/components/app-link";
import { Input, Select, Textarea } from "@/components/kit";
import {
  AdminChip,
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  Ltr,
  PermissionButton,
  Toolbar,
} from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { staffAccounts } from "@/lib/admin";
import { pick, useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/head";
import { cn } from "@/lib/utils";
import {
  useAddContactNote,
  useContactMessages,
  useSaveContactReplyDraft,
  useSetContactAssignee,
  useSetContactStatus,
  type ContactStatus,
  type ContactTopic,
} from "@/lib/contact";

export const Route = createFileRoute("/{-$locale}/admin/inbox")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/inbox",
      en: {
        title: "Contact inbox — Gaza International Airport administration",
        description: "Enquiries received through the public contact form.",
      },
      ar: {
        title: "صندوق الرسائل — إدارة مطار غزة الدولي",
        description: "الرسائل الواردة من نموذج التواصل العام.",
      },
      noindex: true,
    }),
  component: AdminInboxPage,
});

const tone = (s: ContactStatus) =>
  s === "new" ? "brand" : s === "open" ? "info" : s === "resolved" ? "neutral" : "muted";

function formatTimestamp(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const pad = (n: number) => String(n).padStart(2, "0");
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const mins = pad(d.getMinutes());
    return `${year}-${month}-${day} ${hours}:${mins}`;
  } catch {
    return isoStr;
  }
}

function AdminInboxPage() {
  const { t, lang } = useI18n();
  const { can, staff } = useAdmin();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [msgLangFilter, setMsgLangFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  // Note and reply draft form state
  const [newNoteBody, setNewNoteBody] = useState("");
  const [replyDraft, setReplyDraft] = useState("");

  const commandLock = useRef(false);
  const [commandPending, setCommandPending] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);

  const mayEdit = can("engagement.edit");

  // Query canonical contact messages from repository
  const { data: messages = [] } = useContactMessages();

  // Mutations
  const setStatusMutation = useSetContactStatus();
  const addNoteMutation = useAddContactNote();
  const setAssigneeMutation = useSetContactAssignee();
  const saveReplyDraftMutation = useSaveContactReplyDraft();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messages.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (topicFilter !== "all" && m.topic !== topicFilter) return false;
      if (msgLangFilter !== "all" && m.language !== msgLangFilter) return false;
      if (q) {
        const matches = [
          m.senderName.toLowerCase(),
          m.email.toLowerCase(),
          (m.bookingRef ?? "").toLowerCase(),
          m.message.toLowerCase(),
        ];
        if (!matches.some((field) => field.includes(q))) return false;
      }
      return true;
    });
  }, [messages, statusFilter, topicFilter, msgLangFilter, query]);

  // Set active selection
  const active = rows.find((m) => m.id === openId) ?? rows[0];

  const activeId = active?.id;
  const activeReplyDraft = active?.replyDraft;

  // Sync draft reply buffer whenever active message changes
  useEffect(() => {
    setReplyDraft(activeReplyDraft ?? "");
  }, [activeId, activeReplyDraft]);
  useEffect(() => {
    setNewNoteBody("");
    setCommandError(null);
  }, [activeId]);

  if (!can("engagement.view")) {
    return <AdminDenied area={t("a2.in.title")} permission="engagement.view" />;
  }

  const runCommand = async (action: () => Promise<unknown>) => {
    if (!mayEdit || commandLock.current) return;
    commandLock.current = true;
    setCommandPending(true);
    setCommandError(null);
    try {
      await action();
    } catch {
      setCommandError(t("a2.in.saveFailed"));
    } finally {
      commandLock.current = false;
      setCommandPending(false);
    }
  };

  const handleAddNote = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!active || !newNoteBody.trim()) return;
    await runCommand(async () => {
      await addNoteMutation.mutateAsync({
        id: active.id,
        note: {
          body: newNoteBody.trim(),
          staffId: staff?.id ?? "adm-1",
          staffName: staff ? pick(lang, staff.name) : undefined,
        },
      });
      setNewNoteBody("");
    });
  };
  const handleSaveReplyDraft = async () => {
    if (!active) return;
    await runCommand(() => saveReplyDraftMutation.mutateAsync({ id: active.id, replyDraft }));
  };
  const handleClearReplyDraft = async () => {
    if (!active) return;
    await runCommand(async () => {
      await saveReplyDraftMutation.mutateAsync({ id: active.id, replyDraft: "" });
      setReplyDraft("");
    });
  };
  const handleStatusChange = async (status: ContactStatus) => {
    if (!active) return;
    await runCommand(() => setStatusMutation.mutateAsync({ id: active.id, status }));
  };
  const handleAssignment = async (staffId: string | null) => {
    if (!active) return;
    await runCommand(() => setAssigneeMutation.mutateAsync({ id: active.id, staffId }));
  };

  const assignedStaff = active?.assignedStaffId
    ? staffAccounts.find((s) => s.id === active.assignedStaffId)
    : null;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("a2.in.title")}
        description={t("a2.in.sub")}
        meta={<p className="text-xs text-muted-foreground">{t("a2.in.metaPrototype")}</p>}
      />

      {commandError && (
        <p role="alert" className="text-sm text-destructive">
          {commandError}
        </p>
      )}
      <AdminPanel bodyClassName="p-0" aria-busy={commandPending}>
        <Toolbar>
          <Input
            aria-label={t("a2.search")}
            placeholder={t("a2.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full sm:w-56"
          />
          <Select
            aria-label={t("a2.status")}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-auto"
          >
            <option value="all">{t("a2.all")}</option>
            {(["new", "open", "resolved", "spam"] as const).map((s) => (
              <option key={s} value={s}>
                {t(`a2.in.st.${s}`)}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t("a2.in.topic")}
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            className="w-auto"
          >
            <option value="all">{t("a2.all")}</option>
            {(["booking", "baggage", "accessibility", "archive", "media", "other"] as const).map(
              (s) => (
                <option key={s} value={s}>
                  {t(`a2.in.topic.${s}`)}
                </option>
              ),
            )}
          </Select>
          <Select
            aria-label={t("a2.in.language")}
            value={msgLangFilter}
            onChange={(e) => setMsgLangFilter(e.target.value)}
            className="w-auto"
          >
            <option value="all">{t("a2.all")}</option>
            <option value="en">{t("a2.english")}</option>
            <option value="ar">{t("a2.arabic")}</option>
          </Select>
        </Toolbar>

        {rows.length === 0 ? (
          <AdminEmpty title={t("a2.in.empty")} body={t("a2.in.metaPrototype")} />
        ) : (
          <div className="grid lg:grid-cols-[20rem_1fr]">
            <ul className="divide-y divide-border border-b border-border lg:border-b-0 lg:border-e">
              {rows.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(m.id)}
                    aria-current={active?.id === m.id}
                    className={cn(
                      "w-full space-y-1 px-3 py-2.5 text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      active?.id === m.id ? "bg-secondary" : "hover:bg-secondary/60",
                    )}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{m.senderName}</span>
                      <AdminChip tone={tone(m.status)}>{t(`a2.in.st.${m.status}`)}</AdminChip>
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t(`a2.in.topic.${m.topic}`)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      <Ltr>{formatTimestamp(m.createdAt)}</Ltr>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {active ? (
              <div className="space-y-4 p-4 sm:p-5">
                {/* Header details */}
                <div className="space-y-2 border-b border-border pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold">{active.senderName}</h2>
                    <Ltr className="text-xs text-muted-foreground">{active.email}</Ltr>
                    <AdminChip tone={tone(active.status)}>
                      {t(`a2.in.st.${active.status}`)}
                    </AdminChip>
                    <AdminChip tone="muted">{t(`a2.in.topic.${active.topic}`)}</AdminChip>
                    <AdminChip tone="muted">
                      {active.language === "ar" ? t("a2.arabic") : t("a2.english")}
                    </AdminChip>
                    {active.assignedStaffId && (
                      <AdminChip tone="info">
                        {`${t("a2.in.assignedTo")}: `}
                        {assignedStaff ? pick(lang, assignedStaff.name) : active.assignedStaffId}
                      </AdminChip>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {`${t("a2.in.received")}: `}
                    <Ltr>{formatTimestamp(active.createdAt)}</Ltr>
                  </p>

                  {active.bookingRef && (
                    <p className="text-xs">
                      {`${t("a2.in.related")}: `}
                      <AppLink
                        to="/admin/bookings/$ref"
                        params={{ ref: active.bookingRef }}
                        className="underline decoration-dotted text-primary hover:text-primary/80"
                      >
                        <Ltr>{active.bookingRef}</Ltr>
                      </AppLink>
                    </p>
                  )}
                </div>

                {/* Status Transitions Bar */}
                <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t("a2.status")}:
                  </span>
                  {active.status === "new" && (
                    <>
                      <PermissionButton
                        allowed={mayEdit && !commandPending}
                        reason={t(commandPending ? "a2.in.saving" : "adm.edit.readOnly")}
                        onClick={() => handleStatusChange("open")}
                      >
                        {t("a2.in.markOpen")}
                      </PermissionButton>
                      <PermissionButton
                        allowed={mayEdit && !commandPending}
                        reason={t(commandPending ? "a2.in.saving" : "adm.edit.readOnly")}
                        onClick={() => handleStatusChange("resolved")}
                      >
                        {t("a2.in.resolve")}
                      </PermissionButton>
                      <PermissionButton
                        allowed={mayEdit && !commandPending}
                        reason={t(commandPending ? "a2.in.saving" : "adm.edit.readOnly")}
                        onClick={() => handleStatusChange("spam")}
                      >
                        {t("a2.in.markSpam")}
                      </PermissionButton>
                    </>
                  )}
                  {active.status === "open" && (
                    <>
                      <PermissionButton
                        allowed={mayEdit && !commandPending}
                        reason={t(commandPending ? "a2.in.saving" : "adm.edit.readOnly")}
                        onClick={() => handleStatusChange("resolved")}
                      >
                        {t("a2.in.resolve")}
                      </PermissionButton>
                      <PermissionButton
                        allowed={mayEdit && !commandPending}
                        reason={t(commandPending ? "a2.in.saving" : "adm.edit.readOnly")}
                        onClick={() => handleStatusChange("spam")}
                      >
                        {t("a2.in.markSpam")}
                      </PermissionButton>
                    </>
                  )}
                  {(active.status === "resolved" || active.status === "spam") && (
                    <PermissionButton
                      allowed={mayEdit && !commandPending}
                      reason={t(commandPending ? "a2.in.saving" : "adm.edit.readOnly")}
                      onClick={() => handleStatusChange("open")}
                    >
                      {t("a2.in.reopen")}
                    </PermissionButton>
                  )}

                  {/* Staff Assignment */}
                  {active.assignedStaffId ? (
                    <PermissionButton
                      allowed={mayEdit && !commandPending}
                      reason={t(commandPending ? "a2.in.saving" : "adm.edit.readOnly")}
                      onClick={() => handleAssignment(null)}
                    >
                      {t("a2.in.unassign")}
                    </PermissionButton>
                  ) : (
                    <PermissionButton
                      allowed={mayEdit && !commandPending}
                      reason={t(commandPending ? "a2.in.saving" : "adm.edit.readOnly")}
                      onClick={() => handleAssignment(staff?.id ?? "adm-1")}
                    >
                      {t("a2.in.assignToMe")}
                    </PermissionButton>
                  )}
                </div>

                {/* Message Body (Direction strictly follows stored language) */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    {t("a2.in.message")}
                  </h3>
                  <div
                    className="rounded-md border border-border bg-sand p-3.5 text-sm whitespace-pre-wrap break-words leading-relaxed"
                    dir={active.language === "ar" ? "rtl" : "ltr"}
                  >
                    {active.message}
                  </div>
                </div>

                {/* Internal Notes Section */}
                <div className="space-y-3 rounded-md border border-border bg-card p-3.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {t("a2.in.notes")}
                  </h3>

                  {active.internalNotes && active.internalNotes.length > 0 ? (
                    <ul className="space-y-2">
                      {active.internalNotes.map((note) => (
                        <li
                          key={note.id}
                          className="rounded-md border border-border/60 bg-background p-2.5 text-xs space-y-1"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
                            <span className="font-semibold text-foreground">
                              {note.staffName || note.staffId}
                            </span>
                            <Ltr>{formatTimestamp(note.createdAt)}</Ltr>
                          </div>
                          <p className="text-sm whitespace-pre-wrap break-words" dir="auto">
                            {note.body}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t("a2.in.noNotes")}</p>
                  )}

                  {/* Add note form */}
                  <form onSubmit={handleAddNote} className="space-y-2 pt-2">
                    <Textarea
                      aria-label={t("a2.in.addNote")}
                      rows={2}
                      placeholder={t("a2.in.notePlaceholder")}
                      value={newNoteBody}
                      onChange={(e) => setNewNoteBody(e.target.value)}
                      disabled={!mayEdit || commandPending}
                      dir="auto"
                    />
                    <div className="flex justify-end">
                      <PermissionButton
                        allowed={mayEdit && !commandPending && newNoteBody.trim().length > 0}
                        reason={t(commandPending ? "a2.in.saving" : "adm.edit.readOnly")}
                        onClick={handleAddNote}
                      >
                        {t("a2.in.addNote")}
                      </PermissionButton>
                    </div>
                  </form>
                </div>

                {/* Local Reply Draft Section */}
                <div className="space-y-2 border-t border-border pt-3">
                  <label
                    htmlFor="in-reply-draft"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {t("a2.in.replyDraft")}
                  </label>
                  <p className="text-xs text-muted-foreground">{t("a2.in.replyDraftHelp")}</p>
                  <Textarea
                    id="in-reply-draft"
                    rows={4}
                    placeholder={t("a2.in.replyPlaceholder")}
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    disabled={!mayEdit || commandPending}
                    dir="auto"
                  />
                  <div className="flex flex-wrap gap-2">
                    <PermissionButton
                      allowed={mayEdit && !commandPending}
                      reason={t(commandPending ? "a2.in.saving" : "adm.edit.readOnly")}
                      onClick={handleSaveReplyDraft}
                    >
                      {t("a2.in.saveDraft")}
                    </PermissionButton>
                    {(replyDraft.trim().length > 0 || Boolean(active.replyDraft)) && (
                      <PermissionButton
                        allowed={mayEdit && !commandPending}
                        reason={t(commandPending ? "a2.in.saving" : "adm.edit.readOnly")}
                        variant="outline"
                        onClick={handleClearReplyDraft}
                      >
                        {t("a2.in.clearDraft")}
                      </PermissionButton>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <AdminEmpty title={t("a2.in.select")} />
            )}
          </div>
        )}
      </AdminPanel>
    </div>
  );
}
