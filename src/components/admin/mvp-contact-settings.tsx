import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { AdminField, AdminPanel } from "./admin-kit";
import { Button, Input } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { siteClient } from "@/lib/settings/site-client";
import { PUBLISHED_CONTACT_SETTINGS } from "@/lib/settings/defaults";
import type { ContactSettings } from "@/lib/settings/types";

export function MvpContactSettings() {
  const { lang } = useI18n(); const ar = lang === "ar";
  const query = useQuery({ queryKey: ["site-contact-settings"], queryFn: siteClient.contactSettings, retry: false });
  const [draft, setDraft] = useState<ContactSettings>({ ...PUBLISHED_CONTACT_SETTINGS });
  const [dirty, setDirty] = useState(false);
  const [revision, setRevision] = useState<number | null>(null);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  useEffect(() => { if (query.data && !dirty) { setDraft(query.data.draft ?? query.data.published ?? { ...PUBLISHED_CONTACT_SETTINGS }); setRevision(query.data.revision); } }, [query.data, dirty]);
  useBlocker({ disabled: !dirty, enableBeforeUnload: () => dirty,
    shouldBlockFn: () => dirty && !window.confirm(ar ? "مغادرة الصفحة وتجاهل التعديلات غير المحفوظة؟" : "Leave this page and discard unsaved changes?") });
  async function command(action: "save" | "publish" | "discard") {
    if (!query.data || revision === null || busy || (action === "publish" && dirty)) return;
    if (action === "discard" && dirty && !window.confirm(ar ? "تجاهل التعديلات غير المحفوظة؟" : "Discard unsaved changes?")) return;
    setBusy(true); setNotice("");
    try { if (action === "save") await siteClient.saveContact(revision, draft);
      else if (action === "publish") await siteClient.publishContact(revision);
      else await siteClient.discardContact(revision);
      const refreshed = await query.refetch();
      if (!refreshed.isSuccess) { setNotice(ar ? "حُفظ التغيير؛ تعذر تحميل المراجعة الجديدة. حدّث البيانات قبل المتابعة." : "The change was saved; its new revision could not be loaded. Refresh before continuing."); return; }
      if (refreshed.data) { setDraft(refreshed.data.draft ?? refreshed.data.published ?? { ...PUBLISHED_CONTACT_SETTINGS }); setRevision(refreshed.data.revision); }
      setDirty(false); setNotice(action === "publish" ? (ar ? "نُشرت بيانات التواصل. يقرأها الزوار من الخادم." : "Contact details published. Visitors now read them from the server.")
        : action === "save" ? (ar ? "حُفظت المسودة؛ لم تُنشر بعد." : "Draft saved; it has not been published.") : (ar ? "أُلغيت المسودة." : "Draft discarded."));
    } catch { setNotice(ar ? "تعذر إتمام التغيير. حدّث البيانات وتحقق من صلاحياتك." : "The change failed. Refresh the data and check your permissions."); }
    finally { setBusy(false); }
  }
  const fields: [keyof ContactSettings, string, string][] = [["phone", "Phone", "الهاتف"], ["email", "Contact email", "بريد التواصل"], ["addressEn", "Address in English", "العنوان بالإنجليزية"], ["addressAr", "Address in Arabic", "العنوان بالعربية"],
    ["socialInstagram", "Instagram", "إنستغرام"], ["socialX", "X", "إكس"], ["socialFacebook", "Facebook", "فيسبوك"], ["socialYouTube", "YouTube", "يوتيوب"]];
  return <AdminPanel className="space-y-4"><h2 className="type-title-section">{ar ? "بيانات التواصل المنشورة" : "Published contact details"}</h2>
    {query.isError ? <p role="alert">{ar ? "تعذر تحميل البيانات." : "Contact settings could not be loaded."}</p> : query.isPending ? <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p> : <>
      <p className="text-sm text-muted-foreground">{query.data.publishedRevision === null ? (ar ? "لم تُنشر تعديلات من الخادم بعد؛ تظهر البيانات المعتمدة الأصلية." : "No server revision is published yet; the approved compiled baseline is visible.") : `${ar ? "المراجعة المنشورة" : "Published revision"}: ${query.data.publishedRevision}`}</p>
      {dirty && <p role="status" className="text-sm text-clay">{ar ? "لديك تعديلات غير محفوظة. احفظها قبل النشر." : "You have unsaved changes. Save them before publishing."}</p>}
      <form className="grid gap-4 md:grid-cols-2" onSubmit={e => { e.preventDefault(); void command("save"); }}>{fields.map(([key, en, labelAr]) => <AdminField key={key} label={ar ? labelAr : en} htmlFor={`site-contact-${key}`}><Input id={`site-contact-${key}`} value={draft[key]} dir={key === "addressAr" ? "rtl" : "ltr"} type={key === "email" ? "email" : key.startsWith("social") ? "url" : "text"} onChange={e => { setDirty(true); setDraft({ ...draft, [key]: e.target.value }); }} /></AdminField>)}
        <div className="md:col-span-2"><Button type="submit" disabled={busy}>{ar ? "حفظ المسودة" : "Save draft"}</Button></div></form>
      <div className="flex flex-wrap gap-3"><Button disabled={busy || dirty || query.data.draft === null} onClick={() => void command("publish")}>{ar ? "نشر المسودة المحفوظة" : "Publish saved draft"}</Button>
        <Button variant="outline" disabled={busy || query.data.draft === null} onClick={() => void command("discard")}>{ar ? "إلغاء المسودة" : "Discard draft"}</Button></div>
    </>}
    <Button variant="outline" disabled={busy} onClick={() => void query.refetch()}>{ar ? "تحديث البيانات" : "Refresh data"}</Button>{notice && <p role="status">{notice}</p>}
  </AdminPanel>;
}
