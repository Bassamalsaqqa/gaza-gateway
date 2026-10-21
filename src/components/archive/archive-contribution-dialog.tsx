import { useState, useRef, type FormEvent, type ChangeEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button, Input, Select, Textarea } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import {
  archiveContributionsClient,
  type ContributionType,
  type ContributionSubmissionReceipt,
} from "@/lib/archive/contributions-client";
import { ArchiveThankYouTag } from "./archive-thank-you-tag";
import { Archive, CheckCircle2, UploadCloud, AlertCircle, Sparkles } from "lucide-react";

interface ArchiveContributionDialogProps {
  triggerClassName?: string;
  triggerButtonVariant?: "primary" | "outline" | "secondary";
}

const PROHIBITED_EXTENSIONS = [
  "svg", "svgz", "htm", "html", "xhtml", "shtml", "xml",
  "php", "phtml", "phar", "sh", "bash", "exe", "bat", "cmd",
  "com", "scr", "msi", "vbs", "js", "jar", "py", "pl", "cgi",
];

const ALLOWED_EXTENSIONS = [
  "jpg", "jpeg", "png", "webp", "pdf", "mp3", "wav", "mp4", "mov", "aac", "m4a",
];

export function ArchiveContributionDialog({
  triggerClassName = "",
  triggerButtonVariant = "primary",
}: ArchiveContributionDialogProps) {
  const { lang } = useI18n();
  const ar = lang === "ar";

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ContributionSubmissionReceipt | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState<ContributionType>("photograph");
  const [description, setDescription] = useState("");
  const [consent, setConsent] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const submissionIdRef = useRef<string>(crypto.randomUUID());

  function resetForm() {
    setName("");
    setNameAr("");
    setEmail("");
    setType("photograph");
    setDescription("");
    setConsent(false);
    setSelectedFiles([]);
    setErrorNotice(null);
    setReceipt(null);
    submissionIdRef.current = crypto.randomUUID();
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setErrorNotice(null);
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    if (files.length > 5) {
      setErrorNotice(
        ar
          ? "الحد الأقصى المسموح به هو 5 ملفات لكل مساهمة."
          : "A maximum of 5 files is permitted per submission."
      );
      e.target.value = "";
      return;
    }

    let totalBytes = 0;
    for (const file of files) {
      totalBytes += file.size;
      if (file.size > 10 * 1024 * 1024) {
        setErrorNotice(
          ar
            ? `الملف "${file.name}" يتجاوز الحد الأقصى للحجم (10 ميغابايت).`
            : `File "${file.name}" exceeds the maximum individual limit (10 MB).`
        );
        e.target.value = "";
        return;
      }

      // Check extensions & double extensions
      const nameParts = file.name.toLowerCase().split(".");
      if (nameParts.length < 2) {
        setErrorNotice(
          ar
            ? `الملف "${file.name}" بدون امتداد صالح.`
            : `File "${file.name}" lacks a valid file extension.`
        );
        e.target.value = "";
        return;
      }

      const finalExt = nameParts[nameParts.length - 1]!;
      if (!ALLOWED_EXTENSIONS.includes(finalExt)) {
        setErrorNotice(
          ar
            ? `امتداد الملف ".${finalExt}" غير مدعوم. الصيغ المدعومة: صور، وثائق PDF، وتسجيلات صوتية أو مرئية.`
            : `File extension ".${finalExt}" is not supported. Allowed formats: images, PDF documents, audio, or video.`
        );
        e.target.value = "";
        return;
      }

      // Deny double extensions
      const subParts = nameParts.slice(0, -1);
      for (const sub of subParts) {
        if (PROHIBITED_EXTENSIONS.includes(sub)) {
          setErrorNotice(
            ar
              ? `الملف "${file.name}" يحتوي على امتداد مزدوج أو غير آمن.`
              : `File "${file.name}" contains an unsafe double extension.`
          );
          e.target.value = "";
          return;
        }
      }
    }

    if (totalBytes > 25 * 1024 * 1024) {
      setErrorNotice(
        ar
          ? "إجمالي حجم الملفات يتجاوز 25 ميغابايت."
          : "Total files size exceeds the 25 MB limit."
      );
      e.target.value = "";
      return;
    }

    setSelectedFiles(files);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErrorNotice(null);

    if (!consent) {
      setErrorNotice(
        ar
          ? "يرجى تأكيد موافقة إتاحة المواد التاريخية للأرشيف الرقمي للمتابعة."
          : "Please confirm permission consent to contribute archival materials."
      );
      return;
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("submissionId", submissionIdRef.current);
      formData.append("contributorName", name.trim());
      if (nameAr.trim()) {
        formData.append("contributorNameArabic", nameAr.trim());
      }
      formData.append("email", email.trim().toLowerCase());
      formData.append("contributionType", type);
      formData.append("locale", lang);
      formData.append("description", description.trim());
      formData.append("permissionConsent", "true");

      for (const file of selectedFiles) {
        formData.append("files[]", file);
      }

      const res = await archiveContributionsClient.submit(formData);
      setReceipt(res);
    } catch {
      setErrorNotice(
        ar
          ? "تعذر إرسال المساهمة حالياً. تحقق من صحة البيانات وحاول مجدداً."
          : "Unable to submit contribution at this time. Please verify inputs and try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button
          variant={triggerButtonVariant}
          className={`gap-2 cursor-pointer ${triggerClassName}`}
        >
          <Archive aria-hidden="true" className="size-4" />
          <span>{ar ? "المساهمة في الأرشيف" : "Contribute to Archive"}</span>
        </Button>
      </DialogTrigger>

      <DialogContent
        closeLabel={ar ? "إغلاق النافذة" : "Close dialog"}
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <div className="flex items-center gap-2 text-clay">
            <Sparkles className="size-4" />
            <span className="text-xs font-bold uppercase tracking-wider">
              {ar ? "الأرشيف الرقمي المفتوح" : "Digital Heritage Preservation"}
            </span>
          </div>
          <DialogTitle className="text-xl font-bold text-foreground">
            {receipt
              ? (ar ? "تم استلام مساهمتك بنجاح" : "Archival Contribution Received")
              : (ar ? "المساهمة في أرشيف مطار غزة الدولي" : "Contribute to Gaza Airport Archive")}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {receipt
              ? (ar
                ? "حُفظت مساهمتك بأمان في التخزين الخاص للمراجعة التوثيقية، وصدرت بطاقتك التذكارية المعتمدة."
                : "Your contribution has been securely received into private curatorial storage, and your personalized commemorative tag has been issued.")
              : (ar
                ? "شارك صوراً أو وثائق أو شهادات تاريخية لتوثيق تاريخ مطار غزة والخطوط الجوية الفلسطينية."
                : "Contribute historical photographs, documents, or oral testimonies to preserve the legacy of Gaza Airport and Palestinian Airlines.")}
          </DialogDescription>
        </DialogHeader>

        {receipt ? (
          /* Confirmation & Thank-You Tag Card View */
          <div className="space-y-5 pt-2">
            <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
              <CheckCircle2 className="size-5 shrink-0 text-primary mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold text-foreground">
                  {ar ? "المرجع التوثيقي العام للمساهمة:" : "Public Archival Reference:"}
                </div>
                <div dir="ltr" className="font-mono text-lg font-bold text-primary">
                  {receipt.reference}
                </div>
                <p className="text-xs text-muted-foreground pt-1">
                  {ar
                    ? "أُرسل إشعار الاستلام إلى بريدك الإلكتروني. هذا المرجع عام ولا يعرض أي بيانات شخصية."
                    : "An acknowledgment email has been queued to your address. This public reference contains no personal data."}
                </p>
              </div>
            </div>

            {/* Interactive Contributor Thank-You Tag */}
            <ArchiveThankYouTag
              contributorName={name}
              contributorNameArabic={nameAr}
              archiveReference={receipt.reference}
            />

            <div className="flex justify-end gap-3 pt-3 border-t border-border">
              <Button
                variant="outline"
                onClick={() => resetForm()}
              >
                {ar ? "تقديم مساهمة أخرى" : "Contribute another item"}
              </Button>
              <Button
                variant="primary"
                onClick={() => setOpen(false)}
              >
                {ar ? "تم — إغلاق" : "Done"}
              </Button>
            </div>
          </div>
        ) : (
          /* Submission Form View */
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 pt-2">
            {errorNotice && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <AlertCircle className="size-4 shrink-0" />
                <span>{errorNotice}</span>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="contrib-name" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                  {ar ? "الاسم الكامل (بالإنجليزية) *" : "Full Name (English) *"}
                </label>
                <Input
                  id="contrib-name"
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Omar Khalil"
                />
              </div>

              <div>
                <label htmlFor="contrib-name-ar" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                  {ar ? "الاسم بالعربية (اختياري)" : "Name in Arabic (Optional)"}
                </label>
                <Input
                  id="contrib-name-ar"
                  dir="rtl"
                  lang="ar"
                  maxLength={120}
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  placeholder="مثال: عمر خليل"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="contrib-email" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                  {ar ? "البريد الإلكتروني للإشعار *" : "Notification Email *"}
                </label>
                <Input
                  id="contrib-email"
                  type="email"
                  dir="ltr"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                />
              </div>

              <div>
                <label htmlFor="contrib-type" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                  {ar ? "نوع المادة التاريخية *" : "Contribution Type *"}
                </label>
                <Select
                  id="contrib-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as ContributionType)}
                >
                  <option value="photograph">{ar ? "صورة فوتوغرافية" : "Photograph"}</option>
                  <option value="document">{ar ? "وثيقة تاريخية أو مطبوعة" : "Historical Document"}</option>
                  <option value="video_reference">{ar ? "تسجيل مرئي أو إذاعي" : "Video or Broadcast"}</option>
                  <option value="oral_history">{ar ? "شهادة شفوية أو ذكريات" : "Oral History / Testimony"}</option>
                  <option value="artifact">{ar ? "مقتنى تاريخي أو تذكار" : "Physical Artifact / Ephemera"}</option>
                  <option value="future_concept">{ar ? "رؤية مستقبلية أو مفهوم" : "Future Concept / Concept"}</option>
                  <option value="design">{ar ? "تصميم أو مخطط معماري" : "Design / Architectural Plan"}</option>
                  <option value="other">{ar ? "أخرى" : "Other"}</option>
                </Select>
              </div>
            </div>

            <div>
              <label htmlFor="contrib-description" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                {ar ? "وصف المادة وسياقها التاريخي *" : "Description & Historical Context *"}
              </label>
              <Textarea
                id="contrib-description"
                required
                minLength={10}
                maxLength={5000}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  ar
                    ? "صف المادة، التاريخ التقريبي، الأشخاص أو الأماكن الظاهرة، وأي معلومات تساهم في توثيق أصالتها..."
                    : "Describe the item, approximate date, depicted individuals or locations, and provenance context..."
                }
              />
              <div className="mt-1 text-end text-[11px] text-muted-foreground">
                {description.length} / 5000
              </div>
            </div>

            {/* File Upload Zone */}
            <div className="rounded-xl border border-dashed border-border bg-sand-deep/30 p-4">
              <label htmlFor="contrib-files" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                {ar ? "المرفقات الرقمية (اختياري، حتى 5 ملفات)" : "Digital Attachments (Optional, up to 5 files)"}
              </label>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                {ar
                  ? "الصيغ المدعومة: JPG, PNG, WebP, PDF, MP3, WAV, MP4 (الحد الأقصى 10 ميغابايت لكل ملف، و25 ميغابايت إجمالاً). تُحظر الملفات البرمجية وملفات SVG."
                  : "Supported: JPG, PNG, WebP, PDF, MP3, WAV, MP4 (Max 10 MB per file, 25 MB total). Executable files and SVG are prohibited."}
              </p>
              <input
                id="contrib-files"
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp,.pdf,.mp3,.wav,.mp4,.mov,.aac,.m4a"
                onChange={handleFileChange}
                className="block w-full text-xs text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
              />
              {selectedFiles.length > 0 && (
                <div className="mt-3 space-y-1">
                  <span className="text-xs font-semibold text-foreground">
                    {ar ? "الملفات المختارة:" : "Selected files:"}
                  </span>
                  <ul className="text-xs text-muted-foreground list-disc list-inside">
                    {selectedFiles.map((f, idx) => (
                      <li key={idx} className="font-mono">
                        {f.name} ({(f.size / 1024 / 1024).toFixed(2)} MB)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Permission Consent Checkbox */}
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
              <input
                id="contrib-consent"
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="size-4 shrink-0 rounded border-border text-primary focus:ring-primary mt-0.5 cursor-pointer"
              />
              <label htmlFor="contrib-consent" className="text-xs leading-relaxed text-muted-foreground cursor-pointer select-none">
                {ar
                  ? "أؤكد أنني أملك حقوق مشاركة هذه المواد، أو أنها مواد تاريخية مقدمة لحفظ التراث والتوثيق التعليمي العام في الأرشيف الرقمي لمطار غزة الدولي، مع الموافقة على معالجتها وتخزينها بأمان."
                  : "I confirm that I hold the rights to share these materials or that they are historical materials contributed for public educational preservation in the Gaza Airport digital archive, with consent for private curatorial storage."}
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                {ar ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={busy || !consent}
              >
                <UploadCloud className="size-4" />
                <span>{busy ? (ar ? "جارٍ الإرسال…" : "Submitting…") : (ar ? "إرسال المساهمة للأرشيف" : "Submit Archival Contribution")}</span>
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
