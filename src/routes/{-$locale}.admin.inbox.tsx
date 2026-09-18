import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppLink } from "@/components/app-link";
import { Input, Select, Textarea } from "@/components/kit";
import { AdminChip, AdminEmpty, AdminPageHeader, AdminPanel, Ltr, PermissionButton, Toolbar } from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import { inboxMessages, type InboxMessage } from "@/lib/admin-mock";
import { pageHead } from "@/lib/head";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/{-$locale}/admin/inbox")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/inbox",
      en: { title: "Contact inbox — Gaza International Airport administration", description: "Enquiries received through the public contact form." },
      ar: { title: "صندوق الرسائل — إدارة مطار غزة الدولي", description: "الرسائل الواردة من نموذج التواصل العام." },
      noindex: true,
    }),
  component: AdminInboxPage,
});

const tone = (s: InboxMessage["status"]) => (s === "new" ? "brand" : s === "open" ? "info" : s === "resolved" ? "neutral" : "muted");

function AdminInboxPage() {
  const { t, lang } = useI18n();
  const { can, toast } = useAdmin();
  const [status, setStatus] = useState("all");
  const [topic, setTopic] = useState("all");
  const [msgLang, setMsgLang] = useState("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(inboxMessages[0]?.id ?? null);
  const mayEdit = can("engagement.edit");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inboxMessages.filter((m) => {
      if (status !== "all" && m.status !== status) return false;
      if (topic !== "all" && m.topic !== topic) return false;
      if (msgLang !== "all" && m.language !== msgLang) return false;
      if (q && !`${m.sender} ${m.email} ${m.ref ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [status, topic, msgLang, query]);

  if (!can("engagement.view")) return <AdminDenied area={t("a2.in.title")} permission="engagement.view" />;

  const active = rows.find((m) => m.id === openId) ?? rows[0];

  return (
    <div className="space-y-4">
      <AdminPageHeader title={t("a2.in.title")} description={t("a2.in.sub")} meta={<p className="text-xs text-muted-foreground">{t("a2.mock")}</p>} />

      <AdminPanel bodyClassName="p-0">
        <Toolbar>
          <Input aria-label={t("a2.search")} placeholder={t("a2.search")} value={query} onChange={(e) => setQuery(e.target.value)} className="w-full sm:w-56" />
          <Select aria-label={t("a2.status")} value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
            <option value="all">{t("a2.all")}</option>
            {(["new", "open", "resolved", "spam"] as const).map((s) => (
              <option key={s} value={s}>{t(`a2.in.st.${s}`)}</option>
            ))}
          </Select>
          <Select aria-label={t("a2.in.topic")} value={topic} onChange={(e) => setTopic(e.target.value)} className="w-auto">
            <option value="all">{t("a2.all")}</option>
            {(["booking", "archive", "access", "media", "other"] as const).map((s) => (
              <option key={s} value={s}>{t(`a2.in.topic.${s}`)}</option>
            ))}
          </Select>
          <Select aria-label={t("a2.in.language")} value={msgLang} onChange={(e) => setMsgLang(e.target.value)} className="w-auto">
            <option value="all">{t("a2.all")}</option>
            <option value="en">{t("a2.english")}</option>
            <option value="ar">{t("a2.arabic")}</option>
          </Select>
        </Toolbar>

        {rows.length === 0 ? (
          <AdminEmpty title={t("a2.in.empty")} body={t("a2.mock")} />
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
                      <span className="text-sm font-semibold">{m.sender}</span>
                      <AdminChip tone={tone(m.status)}>{t(`a2.in.st.${m.status}`)}</AdminChip>
                    </span>
                    <span className="block text-xs text-muted-foreground">{t(`a2.in.topic.${m.topic}`)}</span>
                    <span className="block text-xs text-muted-foreground">
                      <Ltr>{m.received}</Ltr>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {active ? (
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-bold">{active.sender}</h2>
                  <Ltr className="text-xs text-muted-foreground">{active.email}</Ltr>
                  <AdminChip tone={tone(active.status)}>{t(`a2.in.st.${active.status}`)}</AdminChip>
                  <AdminChip tone="muted">{t(`a2.in.topic.${active.topic}`)}</AdminChip>
                  <AdminChip tone="muted">{active.language === "ar" ? t("a2.arabic") : t("a2.english")}</AdminChip>
                </div>
                <p className="text-xs text-muted-foreground">
                  {`${t("a2.in.received")}: `}
                  <Ltr>{active.received}</Ltr>
                </p>
                {active.ref ? (
                  <p className="text-xs">
                    {`${t("a2.in.related")}: `}
                    <AppLink to="/admin/bookings/$ref" params={{ ref: active.ref }} className="underline decoration-dotted">
                      <Ltr>{active.ref}</Ltr>
                    </AppLink>
                  </p>
                ) : null}
                <p className="rounded-md border border-border bg-sand p-3 text-sm" dir={active.language === "ar" ? "rtl" : "ltr"}>
                  {pick(lang, active.body)}
                </p>

                <div className="space-y-2">
                  <label htmlFor="in-reply" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("a2.in.reply")}
                  </label>
                  <Textarea id="in-reply" rows={4} placeholder={t("a2.in.replyPlaceholder")} />
                </div>

                <div className="flex flex-wrap gap-2">
                  {[
                    { label: t("a2.in.reply"), key: "a2.uiOnly" },
                    { label: t("a2.in.addNote"), key: "a2.saved" },
                    { label: t("a2.in.assign"), key: "a2.saved" },
                    { label: t("a2.in.resolve"), key: "a2.saved" },
                    { label: t("a2.in.reopen"), key: "a2.saved" },
                  ].map((a) => (
                    <PermissionButton key={a.label} allowed={mayEdit} reason={t("adm.edit.readOnly")} onClick={() => toast(t(a.key))}>
                      {a.label}
                    </PermissionButton>
                  ))}
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
