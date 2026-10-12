import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Panel } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { mailClient } from "@/lib/mail/client";

export function BookingEmailStatus({ reference, cancelled }: { reference: string; cancelled: boolean }) {
  const { lang } = useI18n(); const ar = lang === "ar";
  const query = useQuery({ queryKey: ["booking-email", reference], queryFn: () => mailClient.status(reference), retry: false });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  const attempt = useRef<string | null>(null);
  const labels = ar ? { pending: "رسالة التذكرة في طابور الإرسال.", processing: "تُعالج رسالة التذكرة.", captured_locally: "حُفظت رسالة التذكرة محلياً للاختبار فقط؛ لم تُرسل خارجياً.", accepted: "قبل خادم البريد الرسالة؛ لم يُؤكد وصولها إلى صندوق الوارد.", failed: "فشلت محاولة الإرسال. ستُعاد المحاولة ضمن الحد المسموح.", uncertain: "نتيجة الإرسال غير مؤكدة. تواصل مع الإدارة قبل إعادة الإرسال.", cancelled: "أُلغي إرسال الرسالة." }
    : { pending: "Your ticket email is queued.", processing: "Your ticket email is processing.", captured_locally: "Your ticket email was captured locally for testing; it was not sent externally.", accepted: "The mail server accepted your email; inbox delivery is not confirmed.", failed: "The email attempt failed. Bounded automatic retries are scheduled.", uncertain: "The delivery outcome is uncertain. Contact administration before resending.", cancelled: "Email sending was cancelled." };
  async function resend() {
    if (busy) return; setBusy(true); setError(false);
    attempt.current ??= crypto.randomUUID();
    try { await mailClient.resend(reference, attempt.current); attempt.current = null; await query.refetch(); }
    catch { setError(true); } finally { setBusy(false); }
  }
  return <Panel className="space-y-3 print:hidden"><h2 className="type-title-section">{ar ? "بريد التذكرة" : "Ticket email"}</h2>
    <p role="status">{query.isError ? (ar ? "تعذر قراءة حالة البريد. يمكنك عرض التذكرة وطباعتها." : "Email status could not be read. You can still view and print your ticket.")
      : query.data ? labels[query.data.status] : (ar ? "جارٍ قراءة حالة البريد…" : "Checking email status…")}</p>
    {error && <p role="alert">{ar ? "تعذر تأكيد إعادة الإرسال. حدّث الحالة قبل المحاولة مجدداً." : "Resend could not be confirmed. Refresh the status before trying again."}</p>}
    <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy} onClick={() => void query.refetch()}>{ar ? "تحديث الحالة" : "Refresh status"}</Button>
      {!cancelled && query.data && ["failed", "accepted", "captured_locally"].includes(query.data.status) && <Button disabled={busy} onClick={() => void resend()}>{ar ? "إعادة إرسال التذكرة" : "Resend ticket email"}</Button>}</div>
  </Panel>;
}
