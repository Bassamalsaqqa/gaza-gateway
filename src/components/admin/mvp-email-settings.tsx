import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminField, AdminPanel } from "./admin-kit";
import { Button, Input, Select } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { MvpApiError } from "@/lib/api/mvp-client";
import { mailClient, type MailSettingsCommand } from "@/lib/mail/client";

export function MvpEmailSettings() {
  const { lang } = useI18n(); const ar = lang === "ar";
  const query = useQuery({ queryKey: ["mvp-email-settings"], queryFn: mailClient.settings, retry: false });
  const messages = useQuery({ queryKey: ["mvp-email-messages"], queryFn: mailClient.messages, retry: false });
  const [draft, setDraft] = useState<MailSettingsCommand | null>(null);
  const resendIds = useRef(new Map<string, string>());
  const [recipient, setRecipient] = useState(""); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  useEffect(() => { if (query.data) { const { revision, driver, host, port, tls, senderName, senderEmail, replyTo } = query.data;
    setDraft({ expectedRevision: revision, driver, host, port, tls, senderName, senderEmail, replyTo }); } }, [query.data]);
  const failure = (e: unknown) => setNotice(e instanceof MvpApiError && e.status === 403
    ? (ar ? "يلزم حساب مسؤول وتحقق أمني حديث لحفظ إعدادات البريد." : "An administrator and recent security verification are required to change email settings.")
    : (ar ? "تعذر إتمام الطلب. حدّث البيانات وحاول مجدداً." : "The request failed. Refresh the data and try again."));
  async function save() {
    if (!draft || busy) return; setBusy(true); setNotice("");
    try { await mailClient.save(draft); setDraft(d => { if (!d) return null; const clean = { ...d }; delete clean.username; delete clean.password; return clean; });
      await query.refetch(); setNotice(ar ? "حُفظت الإعدادات على الخادم." : "Settings saved on the server."); }
    catch (e) { failure(e); } finally { setBusy(false); }
  }
  async function test() {
    if (busy) return; setBusy(true); setNotice("");
    try { await mailClient.test(recipient); await messages.refetch(); setNotice(ar ? "أُضيفت رسالة الاختبار إلى الطابور؛ لم يُؤكد التسليم بعد." : "Test email queued; delivery has not yet been confirmed."); }
    catch (e) { failure(e); } finally { setBusy(false); }
  }
  async function resend(reference: string) {
    if (busy) return; setBusy(true); setNotice("");
    const requestId = resendIds.current.get(reference) ?? crypto.randomUUID();
    resendIds.current.set(reference, requestId);
    try { await mailClient.adminResend(reference, requestId); resendIds.current.delete(reference); await messages.refetch();
      setNotice(ar ? "أُضيفت الرسالة إلى الطابور." : "Message queued for resend."); }
    catch (e) { failure(e); } finally { setBusy(false); }
  }
  const labels = ar ? { pending: "في الانتظار", processing: "قيد المعالجة", captured_locally: "حُفظت محلياً فقط", accepted: "قبلها خادم البريد", failed: "فشلت المحاولة", uncertain: "النتيجة غير مؤكدة؛ يلزم التحقيق", cancelled: "ملغاة" }
    : { pending: "Queued", processing: "Processing", captured_locally: "Captured locally only", accepted: "Accepted by mail server", failed: "Attempt failed", uncertain: "Uncertain; investigate before retry", cancelled: "Cancelled" };
  return <AdminPanel className="space-y-4"><h2 className="type-title-section">{ar ? "البريد الإلكتروني" : "Email"}</h2>
    <p className="text-sm text-muted-foreground">{ar ? "تُشفّر بيانات الدخول على الخادم ولا تُعاد إلى المتصفح. الحفظ المحلي لا يعني التسليم إلى بريد المستلم." : "Credentials are encrypted on the server and never returned to the browser. Local capture does not certify recipient delivery."}</p>
    {query.isError ? <p role="alert">{ar ? "تعذر تحميل إعدادات البريد." : "Email settings could not be loaded."}</p> : !draft ? <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p> : <form className="grid gap-4 md:grid-cols-2" onSubmit={e => { e.preventDefault(); void save(); }}>
      <AdminField label={ar ? "طريقة الإرسال" : "Delivery mode"}><Select value={draft.driver} onChange={e => setDraft({ ...draft, driver: e.target.value as "capture" | "smtp" })}><option value="capture">{ar ? "حفظ محلي للاختبار" : "Local test capture"}</option><option value="smtp">SMTP</option></Select></AdminField>
      <AdminField label={ar ? "التشفير" : "Encryption"}><Select value={draft.tls} onChange={e => setDraft({ ...draft, tls: e.target.value as MailSettingsCommand["tls"] })}><option value="none">{ar ? "دون تشفير — الاختبار المحلي فقط" : "None — local sink only"}</option><option value="starttls">STARTTLS</option><option value="tls">TLS</option></Select></AdminField>
      {(["host", "senderName", "senderEmail", "replyTo"] as const).map((key, i) => <AdminField key={key} label={(ar ? ["خادم البريد", "اسم المرسل", "بريد المرسل", "بريد الرد"] : ["SMTP host", "Sender name", "Sender email", "Reply-to email"])[i]!}><Input dir={key === "senderName" ? undefined : "ltr"} value={draft[key]} type={key === "senderEmail" || key === "replyTo" ? "email" : "text"} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /></AdminField>)}
      <AdminField label={ar ? "المنفذ" : "Port"}><Input type="number" min={1} max={65535} dir="ltr" value={draft.port} onChange={e => setDraft({ ...draft, port: Number(e.target.value) })} /></AdminField>
      <AdminField label={ar ? "اسم المستخدم — اتركه دون تغيير للاحتفاظ بالمحفوظ" : "Username — leave unchanged to retain saved value"}><Input autoComplete="off" dir="ltr" value={draft.username ?? ""} placeholder={query.data?.usernameSet ? "••••••" : ""} onChange={e => setDraft({ ...draft, username: e.target.value })} /></AdminField>
      <AdminField label={ar ? "كلمة المرور — اتركها دون تغيير للاحتفاظ بالمحفوظة" : "Password — leave unchanged to retain saved value"}><Input type="password" autoComplete="new-password" value={draft.password ?? ""} placeholder={query.data?.passwordSet ? "••••••" : ""} onChange={e => setDraft({ ...draft, password: e.target.value })} /></AdminField>
      <div className="md:col-span-2"><Button type="submit" disabled={busy}>{ar ? "حفظ إعدادات البريد" : "Save email settings"}</Button></div>
    </form>}
    <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); void test(); }}><AdminField label={ar ? "مستلم رسالة الاختبار" : "Test recipient"}><Input type="email" required dir="ltr" value={recipient} onChange={e => setRecipient(e.target.value)} /></AdminField><Button type="submit" disabled={busy || !query.data?.configured}>{ar ? "إرسال اختبار" : "Send test"}</Button></form>
    {notice && <p role="status">{notice}</p>}
    <Button variant="outline" disabled={busy} onClick={() => { void query.refetch(); void messages.refetch(); }}>{ar ? "تحديث الحالة" : "Refresh status"}</Button>
    {messages.isError ? <p role="alert">{ar ? "تعذر تحميل طابور البريد." : "The mail queue could not be loaded."}</p> : <ul className="space-y-2">{messages.data?.items.map(item => <li key={item.id} className="rounded-xl border p-3 text-sm"><b dir="ltr">{item.reference ?? (ar ? "رسالة اختبار" : "Test message")}</b> · {labels[item.status]} · {ar ? "المحاولات" : "Attempts"}: {item.attempts}{item.reference && ["failed", "accepted", "captured_locally"].includes(item.status) && <Button className="ms-3" variant="outline" disabled={busy} onClick={() => void resend(item.reference!)}>{ar ? "إعادة الإرسال" : "Resend"}</Button>}</li>)}</ul>}
  </AdminPanel>;
}
