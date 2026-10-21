import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { AdminField, AdminPanel } from "./admin-kit";
import { Button, Input, Select } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { MvpApiError } from "@/lib/api/mvp-client";
import { mailClient, type MailSettingsCommand } from "@/lib/mail/client";

export function MvpEmailSettings() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const query = useQuery({ queryKey: ["mvp-email-settings"], queryFn: mailClient.settings, retry: false });
  const messages = useQuery({ queryKey: ["mvp-email-messages"], queryFn: mailClient.messages, retry: false });
  const [draft, setDraft] = useState<MailSettingsCommand | null>(null);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const localTools = import.meta.env.DEV;
  const resendIds = useRef(new Map<string, string>());
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (query.data && !dirty) {
      const {
        revision, driver, host, port, tls, senderName, senderEmail, replyTo,
        notificationEmail, incomingCcEnabled, incomingCcEmail
      } = query.data;
      setDraft({
        expectedRevision: revision,
        driver,
        host,
        port,
        tls,
        senderName,
        senderEmail,
        replyTo,
        notificationEmail: notificationEmail ?? "notifications@gazaairport.com",
        incomingCcEnabled: incomingCcEnabled ?? false,
        incomingCcEmail: incomingCcEmail ?? "",
      });
    }
  }, [query.data, dirty]);

  useBlocker({
    disabled: !dirty,
    enableBeforeUnload: () => dirty,
    shouldBlockFn: () => dirty && !window.confirm(ar ? "مغادرة الصفحة وتجاهل التعديلات غير المحفوظة؟" : "Leave this page and discard unsaved changes?"),
  });

  const failure = (e: unknown) => setNotice(e instanceof MvpApiError && e.status === 403
    ? (ar ? "يلزم حساب مسؤول وتحقق أمني حديث لحفظ إعدادات البريد." : "An administrator and recent security verification are required to change email settings.")
    : (ar ? "تعذر إتمام الطلب. حدّث البيانات وحاول مجدداً." : "The request failed. Refresh the data and try again."));

  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setNotice("");
    try {
      await mailClient.save(draft);
      setDraft(d => {
        if (!d) return null;
        const clean = { ...d };
        delete clean.username;
        delete clean.password;
        return clean;
      });
      const refreshed = await query.refetch();
      if (!refreshed.isSuccess) {
        setNotice(ar ? "حُفظت الإعدادات؛ تعذر تحديث المراجعة. حدّث البيانات قبل المتابعة." : "Settings saved; the new revision could not be loaded. Refresh before continuing.");
        return;
      }
      setDirty(false);
      setEditing(false);
      setNotice(ar ? "حُفظت الإعدادات على الخادم." : "Settings saved on the server.");
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await mailClient.test(recipient);
      await messages.refetch();
      setNotice(ar ? "أُضيفت رسالة الاختبار إلى الطابور؛ لم يُؤكد التسليم بعد." : "Test email queued; delivery has not yet been confirmed.");
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }

  async function resend(reference: string) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    const requestId = resendIds.current.get(reference) ?? crypto.randomUUID();
    resendIds.current.set(reference, requestId);
    try {
      await mailClient.adminResend(reference, requestId);
      resendIds.current.delete(reference);
      await messages.refetch();
      setNotice(ar ? "أُضيفت الرسالة إلى الطابور." : "Message queued for resend.");
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }

  const labels = ar ? {
    pending: "في الانتظار",
    processing: "قيد المعالجة",
    captured_locally: "حُفظت محلياً فقط",
    accepted: "قبلها خادم البريد",
    failed: "فشلت المحاولة",
    uncertain: "النتيجة غير مؤكدة؛ يلزم التحقيق",
    cancelled: "ملغاة",
  } : {
    pending: "Queued",
    processing: "Processing",
    captured_locally: "Captured locally only",
    accepted: "Accepted by mail server",
    failed: "Attempt failed",
    uncertain: "Uncertain; investigate before retry",
    cancelled: "Cancelled",
  };

  return (
    <AdminPanel className="space-y-4">
      <h2 className="type-title-section">{ar ? "البريد الإلكتروني" : "Email"}</h2>
      <p className="text-sm text-muted-foreground">
        {ar
          ? "تُشفّر بيانات الدخول على الخادم ولا تُعاد إلى المتصفح. الحفظ المحلي لا يعني التسليم إلى بريد المستلم."
          : "Credentials are encrypted on the server and never returned to the browser. Local capture does not certify recipient delivery."}
      </p>

      {query.isError ? (
        <p role="alert">{ar ? "تعذر تحميل إعدادات البريد." : "Email settings could not be loaded."}</p>
      ) : !draft ? (
        <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>
      ) : (
        <>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{ar ? "الإعدادات المحفوظة" : "Saved configuration"}</dt>
              <dd className="mt-1 font-semibold">
                {query.data?.configured ? (ar ? "مهيأة على الخادم" : "Configured on server") : (ar ? "غير مهيأة" : "Not configured")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{ar ? "المرسل" : "Sender"}</dt>
              <dd className="mt-1" dir="ltr">{query.data?.senderEmail || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{ar ? "الاتصال" : "Connection"}</dt>
              <dd className="mt-1" dir="ltr">
                {query.data?.host ? `${query.data.host}:${query.data.port} · ${query.data.tls.toUpperCase()}` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{ar ? "المراجعة" : "Revision"}</dt>
              <dd className="mt-1" dir="ltr">{query.data?.revision ?? 0}</dd>
            </div>
          </dl>

          {/* Incoming notifications recipient overview */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-2 text-sm">
            <h4 className="font-semibold text-foreground">
              {ar ? "إشعارات النماذج الواردة (التواصل والأرشيف)" : "Incoming form notifications (Contact & Archive)"}
            </h4>
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <span>{ar ? "المستلم الأساسي الحالي:" : "Current default primary recipient:"}</span>
              <span dir="ltr" className="font-mono text-foreground font-semibold">
                {query.data?.notificationEmail || "notifications@gazaairport.com"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <span>{ar ? "النسخة الكربونية (CC):" : "Notification CC:"}</span>
              <span>
                {query.data?.incomingCcEnabled && query.data?.incomingCcEmail
                  ? <b dir="ltr" className="font-mono text-foreground">{query.data.incomingCcEmail}</b>
                  : (ar ? "معطلة" : "Disabled")}
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            aria-expanded={editing}
            aria-controls="smtp-configuration"
            disabled={busy}
            onClick={() => {
              if (!editing && !localTools && draft.driver !== "smtp") {
                setDirty(true);
                setDraft({ ...draft, driver: "smtp", port: 465, tls: "tls" });
              }
              setEditing(!editing);
            }}
          >
            {editing ? (ar ? "إخفاء الإعدادات المتقدمة" : "Hide advanced configuration") : (ar ? "تعديل الإعدادات" : "Edit configuration")}
          </Button>

          {editing && (
            <div id="smtp-configuration" className="space-y-5 border-t border-border pt-5">
              <p className="text-sm text-muted-foreground">
                {ar
                  ? "يتطلب الحفظ تحققاً أمنياً حديثاً من قسم الفريق والأمان. اترك حقول الدخول دون تغيير للاحتفاظ بالقيم المحفوظة."
                  : "Saving requires recent verification in Team & security. Leave credential fields unchanged to retain saved values."}
              </p>
              {dirty && (
                <p role="status" className="text-sm text-clay">
                  {ar ? "لديك تعديلات غير محفوظة." : "You have unsaved changes."}
                </p>
              )}

              <form className="space-y-6" onChange={() => setDirty(true)} onSubmit={e => { e.preventDefault(); void save(); }}>
                {/* SMTP Transport Details */}
                <div className="grid gap-4 md:grid-cols-2">
                  <h3 className="md:col-span-2 text-sm font-bold text-foreground border-b border-border pb-1">
                    {ar ? "بيانات خادم الإرسال (SMTP)" : "Outbound Mail Transport (SMTP)"}
                  </h3>

                  {localTools && (
                    <AdminField label={ar ? "طريقة الإرسال" : "Delivery mode"}>
                      <Select value={draft.driver} onChange={e => setDraft({ ...draft, driver: e.target.value as "capture" | "smtp" })}>
                        <option value="capture">{ar ? "حفظ محلي للاختبار" : "Local test capture"}</option>
                        <option value="smtp">SMTP</option>
                      </Select>
                    </AdminField>
                  )}

                  <AdminField label={ar ? "التشفير" : "Encryption"}>
                    <Select value={draft.tls} onChange={e => setDraft({ ...draft, tls: e.target.value as MailSettingsCommand["tls"] })}>
                      {localTools && <option value="none">{ar ? "دون تشفير — الاختبار المحلي فقط" : "None — local sink only"}</option>}
                      <option value="starttls">STARTTLS</option>
                      <option value="tls">TLS</option>
                    </Select>
                  </AdminField>

                  {(["host", "senderName", "senderEmail", "replyTo"] as const).map((key, i) => (
                    <AdminField
                      key={key}
                      label={(ar ? ["خادم البريد", "اسم المرسل", "بريد المرسل", "بريد الرد"] : ["SMTP host", "Sender name", "Sender email", "Reply-to email"])[i]!}
                    >
                      <Input
                        dir={key === "senderName" ? undefined : "ltr"}
                        value={draft[key]}
                        type={key === "senderEmail" || key === "replyTo" ? "email" : "text"}
                        onChange={e => setDraft({ ...draft, [key]: e.target.value })}
                      />
                    </AdminField>
                  ))}

                  <AdminField label={ar ? "المنفذ" : "Port"}>
                    <Input
                      type="number"
                      min={1}
                      max={65535}
                      dir="ltr"
                      value={draft.port}
                      onChange={e => setDraft({ ...draft, port: Number(e.target.value) })}
                    />
                  </AdminField>

                  <AdminField label={ar ? "اسم المستخدم — اترك فارغاً للاحتفاظ بالمحفوظ" : "Username — leave empty to retain saved value"}>
                    <Input
                      autoComplete="off"
                      dir="ltr"
                      value={draft.username ?? ""}
                      placeholder={query.data?.usernameSet ? "••••••" : ""}
                      onChange={e => setDraft({ ...draft, username: e.target.value })}
                    />
                  </AdminField>

                  <AdminField label={ar ? "كلمة المرور — اترك فارغاً للاحتفاظ بالمحفوظة" : "Password — leave empty to retain saved value"}>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={draft.password ?? ""}
                      placeholder={query.data?.passwordSet ? "••••••" : ""}
                      onChange={e => setDraft({ ...draft, password: e.target.value })}
                    />
                  </AdminField>
                </div>

                {/* Scoped Incoming Notifications Settings */}
                <div className="space-y-4 rounded-xl border border-border bg-sand-deep/20 p-4">
                  <h3 className="text-sm font-bold text-foreground">
                    {ar ? "إعدادات الإشعارات الواردة والنسخة الكربونية (CC)" : "Incoming Submissions & Optional CC"}
                  </h3>

                  <AdminField label={ar ? "المستلم الافتراضي لإشعارات النماذج الواردة" : "Default incoming notifications recipient"}>
                    <Input
                      type="email"
                      dir="ltr"
                      value={draft.notificationEmail ?? "notifications@gazaairport.com"}
                      onChange={e => setDraft({ ...draft, notificationEmail: e.target.value })}
                    />
                  </AdminField>

                  <div className="flex items-center gap-3 pt-1">
                    <input
                      id="incomingCcToggle"
                      type="checkbox"
                      className="size-4 rounded border-border text-primary focus:ring-primary"
                      checked={Boolean(draft.incomingCcEnabled)}
                      onChange={e => {
                        setDraft({ ...draft, incomingCcEnabled: e.target.checked });
                      }}
                    />
                    <label htmlFor="incomingCcToggle" className="text-sm font-medium text-foreground cursor-pointer select-none">
                      {ar ? "تفعيل نسخة كربونية اختيارية (CC) للإشعارات الواردة" : "Enable optional notification CC for incoming submissions"}
                    </label>
                  </div>

                  {draft.incomingCcEnabled && (
                    <AdminField label={ar ? "عنوان بريد النسخة الكربونية (CC)" : "Notification CC email address"}>
                      <Input
                        type="email"
                        dir="ltr"
                        required={draft.incomingCcEnabled}
                        placeholder="curator@example.com"
                        value={draft.incomingCcEmail ?? ""}
                        onChange={e => setDraft({ ...draft, incomingCcEmail: e.target.value })}
                      />
                    </AdminField>
                  )}

                  {/* Explicit recipient context notice */}
                  <div className="rounded-lg border border-border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
                    <p className="font-semibold text-foreground mb-1">
                      {ar ? "نطاق المستلمين وتأكيد الأمان:" : "Explicit recipient context & security boundary:"}
                    </p>
                    <p>
                      {ar
                        ? "تنطبق هذه النسخة الإضافية (CC) حصرياً على إشعارات رسائل التواصل العام ومساهمات الأرشيف الواردة إلى الفريق. لا تنطبق نهائياً على حجوزات المسافرين أو تذاكر السفر التذكارية أو رموز التحقق والدخول الأمني (OTP)."
                        : "This optional CC address applies strictly to incoming public contact messages and archive contribution notifications sent to staff. It NEVER applies to passenger bookings, commemorative tickets, or security verification/OTP codes."}
                    </p>
                  </div>
                </div>

                <div>
                  <Button type="submit" disabled={busy}>
                    {ar ? "حفظ إعدادات البريد" : "Save email settings"}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </>
      )}

      <h3 className="border-t border-border pt-5 font-semibold">
        {ar ? "رسالة اختبار" : "Test delivery"}
      </h3>
      <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); void test(); }}>
        <AdminField label={ar ? "مستلم رسالة الاختبار" : "Test recipient"}>
          <Input type="email" required dir="ltr" value={recipient} onChange={e => setRecipient(e.target.value)} />
        </AdminField>
        <Button type="submit" disabled={busy || !query.data?.configured}>
          {ar ? "إرسال اختبار" : "Send test"}
        </Button>
      </form>

      {notice && <p role="status">{notice}</p>}

      <Button variant="outline" disabled={busy} onClick={() => { void query.refetch(); void messages.refetch(); }}>
        {ar ? "تحديث الحالة" : "Refresh status"}
      </Button>

      <h3 className="font-semibold">{ar ? "حالة الرسائل" : "Message status"}</h3>
      {messages.isError ? (
        <p role="alert">{ar ? "تعذر تحميل طابور البريد." : "The mail queue could not be loaded."}</p>
      ) : (
        <ul className="space-y-2">
          {messages.data?.items.map(item => (
            <li key={item.id} className="rounded-xl border p-3 text-sm">
              <b dir="ltr">{item.reference ?? (ar ? "رسالة اختبار" : "Test message")}</b> · {labels[item.status]} · {ar ? "المحاولات" : "Attempts"}: {item.attempts}
              {item.reference && ["failed", "accepted", "captured_locally"].includes(item.status) && (
                <Button className="ms-3" variant="outline" disabled={busy} onClick={() => void resend(item.reference!)}>
                  {ar ? "إعادة الإرسال" : "Resend"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}
