import { useState, useRef, type FormEvent, type ChangeEvent } from "react";
import { Button, Input, Select, Textarea } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import {
  archiveContributionsClient,
  type ContributionChapter,
  type ContributionType,
  type ContributionRightsStatus,
  type ContributionSubmissionReceipt,
} from "@/lib/archive/contributions-client";
import { ArchiveThankYouTag } from "./archive-thank-you-tag";
import {
  Archive,
  CheckCircle2,
  UploadCloud,
  AlertCircle,
  Sparkles,
  Link2,
  ShieldCheck,
  Calendar,
  MapPin,
  User,
  ExternalLink,
} from "lucide-react";

const PROHIBITED_EXTENSIONS = [
  "svg", "svgz", "htm", "html", "xhtml", "shtml", "xml",
  "php", "phtml", "phar", "sh", "bash", "exe", "bat", "cmd",
  "com", "scr", "msi", "vbs", "js", "jar", "py", "pl", "cgi",
];

const ALLOWED_EXTENSIONS = [
  "jpg", "jpeg", "png", "webp", "pdf", "mp3", "wav", "mp4", "mov", "aac", "m4a",
];

export interface ArchiveContributionFormProps {
  isDialog?: boolean;
  onSuccessDone?: () => void;
  className?: string;
}

export function ArchiveContributionForm({
  isDialog = false,
  onSuccessDone,
  className = "",
}: ArchiveContributionFormProps) {
  const { lang } = useI18n();
  const ar = lang === "ar";

  const [busy, setBusy] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ContributionSubmissionReceipt | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [email, setEmail] = useState("");
  const [chapter, setChapter] = useState<ContributionChapter>("historical");
  const [type, setType] = useState<ContributionType>("photograph");
  const [rightsStatus, setRightsStatus] = useState<ContributionRightsStatus>("owned_authorized");
  const [approximateDate, setApproximateDate] = useState("");
  const [location, setLocation] = useState("");
  const [credit, setCredit] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [description, setDescription] = useState("");
  const [consent, setConsent] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Draft persistence: retain UUID across network retries, only rotate on clean reset
  const submissionIdRef = useRef<string>(crypto.randomUUID());

  function resetForm() {
    setName("");
    setNameAr("");
    setEmail("");
    setChapter("historical");
    setType("photograph");
    setRightsStatus("owned_authorized");
    setApproximateDate("");
    setLocation("");
    setCredit("");
    setSourceNote("");
    setReferenceUrl("");
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
          ? "يرجى تأكيد إقرار المراجعة التوثيقية الخاصة للمتابعة."
          : "Please confirm permission consent for private curatorial review to proceed."
      );
      return;
    }

    if (rightsStatus === "owned_authorized") {
      if (selectedFiles.length < 1) {
        setErrorNotice(
          ar
            ? "يرجى اختيار ملف رقمي واحد على الأقل للمساهمة الأصلية المصرحة (حتى 5 ملفات)."
            : "Please attach at least one digital file for an authorized upload (up to 5 files)."
        );
        return;
      }
    }

    if (rightsStatus === "reference_unconfirmed") {
      if (!sourceNote.trim() && !referenceUrl.trim()) {
        setErrorNotice(
          ar
            ? "يرجى تقديم بيانات الاستشهاد أو رابط المصدر للإحالة التوثيقية."
            : "Please provide citation details or a reference link for the archival reference."
        );
        return;
      }
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
      formData.append("chapter", chapter);
      formData.append("contributionType", type);
      formData.append("rightsStatus", rightsStatus);

      if (approximateDate.trim()) {
        formData.append("approximateDate", approximateDate.trim());
      }
      if (location.trim()) {
        formData.append("location", location.trim());
      }
      if (credit.trim()) {
        formData.append("credit", credit.trim());
      }
      if (sourceNote.trim()) {
        formData.append("sourceNote", sourceNote.trim());
      }
      if (referenceUrl.trim()) {
        formData.append("referenceUrl", referenceUrl.trim());
      }

      formData.append("description", description.trim());
      formData.append("permissionConsent", "true");
      formData.append("locale", lang);

      // Only attach files if rights are owned/authorized
      if (rightsStatus === "owned_authorized") {
        for (const file of selectedFiles) {
          formData.append("files[]", file);
        }
      }

      const res = await archiveContributionsClient.submit(formData);
      setReceipt(res);
    } catch {
      // Form drafts and selected files are retained in state for retry with identical UUID
      setErrorNotice(
        ar
          ? "تعذر إرسال المساهمة حالياً. بياناتك محفوظة، يرجى التحقق من الاتصال والمحاولة مجدداً."
          : "Unable to submit contribution at this time. Your draft is preserved; please verify inputs and retry."
      );
    } finally {
      setBusy(false);
    }
  }

  // Render receipt confirmation state
  if (receipt) {
    return (
      <div className={`space-y-6 rounded-2xl border border-border bg-card p-6 sm:p-8 ${className}`}>
        <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 p-5 text-sm">
          <CheckCircle2 className="size-6 shrink-0 text-primary mt-0.5" />
          <div className="space-y-1.5">
            <div className="font-semibold text-foreground text-base">
              {ar ? "تم استلام مساهمتك في الأرشيف التوثيقي الخاص بنجاح" : "Archival Contribution Received for Private Review"}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground  font-semibold">
                {ar ? "الرمز المرجعي العام:" : "Public Archival Reference:"}
              </span>
              <span dir="ltr" className="font-mono text-lg font-bold text-primary">
                {receipt.reference}
              </span>
            </div>
            <p className="text-xs text-muted-foreground pt-1 leading-relaxed">
              {ar
                ? "أُدرجت المساهمة ضمن قائمة المراجعة التوثيقية الخاصة. أُدرج إشعار الاستلام في قائمة معالجة البريد؛ لم يُؤكّد وصوله إلى صندوق الوارد بعد. هذا الرمز مرجع عام لا يعرض أي بيانات شخصية، ولا يشكل نشراً فورياً أو تذكرة سفر."
                : "Your submission has been securely queued into private curatorial review. An acknowledgment email is queued for processing; inbox delivery is not yet confirmed. This public reference contains no personal data and is an archival preservation acknowledgment, not an airline booking or immediate public publication."}
            </p>
          </div>
        </div>

        {/* Interactive Commemorative Contributor Tag */}
        <ArchiveThankYouTag
          contributorName={name}
          contributorNameArabic={nameAr}
          archiveReference={receipt.reference}
        />

        <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-border">
          <Button
            variant="outline"
            onClick={() => resetForm()}
          >
            {ar ? "تقديم مساهمة أرشيفية أخرى" : "Contribute another item"}
          </Button>
          {isDialog && onSuccessDone && (
            <Button
              variant="primary"
              onClick={onSuccessDone}
            >
              {ar ? "تم — إغلاق النافذة" : "Done"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Editorial Introduction Panel + High-contrast Ivory Form
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] ${
        isDialog ? "p-4 sm:p-6" : "grid lg:grid-cols-[1.1fr_1.9fr]"
      } ${className}`}
    >
      {/* Editorial Introduction Section (Visible alongside form on desktop) */}
      {!isDialog && (
        <div className="relative flex flex-col justify-between bg-brand-deep p-5 sm:p-7 lg:p-9 text-ink-foreground">
          <div className="space-y-3 lg:space-y-6">
            <div className="flex items-center gap-2 text-clay-soft">
              <Sparkles className="size-4" />
              <span className="text-xs font-bold ">
                {ar ? "الأرشيف التوثيقي المفتوح" : "Digital Heritage & Archive"}
              </span>
            </div>

            <div>
              <h3 className="type-title-section text-2xl font-bold tracking-tight text-ink-foreground">
                {ar ? "سجل مشترك ينتمي للجميع" : "A Shared Record That Belongs to Everyone"}
              </h3>
              <p className="mt-3 hidden text-sm leading-relaxed text-ink-muted lg:block">
                {ar
                  ? "مطار غزة الدولي وثيقة حية للحق في الحركة والعودة. أنتم مدعوون للمساهمة في هذا الأرشيف التوثيقي بموادكم وصوركم وذكرياتكم، أو برؤاكم المعمارية والتصورية لمستقبل المطار."
                  : "Gaza International Airport is a living testament to the right of free movement and return. You are invited to add your own materials, memories, and documents, or imagined designs for what the airport could become."}
              </p>
            </div>

            <p className="text-sm leading-relaxed text-ink-muted lg:hidden">{ar ? "شارك صورة أو ذكرى أو رؤية للمستقبل. تُراجع المواد بشكل خاص ولا تُنشر تلقائياً." : "Share a photograph, memory or future vision. Materials are reviewed privately and never published automatically."}</p>
            {/* Curatorial Principles */}
            <div className="hidden lg:block space-y-4 rounded-xl border border-border/40 bg-ink-muted/10 p-5 text-xs text-ink-foreground">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-ink-foreground">
                    {ar ? "مراجعة توثيقية خاصة" : "Private Curatorial Review"}
                  </div>
                  <div className="text-ink-muted mt-0.5 leading-relaxed">
                    {ar
                      ? "تُحفظ المساهمات في مستودع خاص للمراجعة ولا تُنشر تلقائياً. تبقى حقوق المواد لأصحابها الشرعيين."
                      : "Submissions enter private review and are never automatically published. Intellectual rights remain with their respective owners."}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Link2 className="size-4 text-clay-soft shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-ink-foreground">
                    {ar ? "مسار الإحالات والاستشهاد" : "References & Citations"}
                  </div>
                  <div className="text-ink-muted mt-0.5 leading-relaxed">
                    {ar
                      ? "إذا لم تكن تملك حقوق نشر المادة، يمكنك تقديم إحالة توثيقية ورابط المصدر للمراجعة الخاصة دون الحاجة لرفع ملفات محمية."
                      : "If you lack redistribution rights, submit a reference link and citation note without uploading protected files."}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="hidden lg:block mt-8 pt-6 border-t border-border/30 text-xs text-ink-muted">
            <span className="font-semibold text-clay-soft">
              {ar ? "مشروع فني توثيقي" : "An internet-based art project"}
            </span>{" "}
            — {ar ? "أيمن الأزرق (2008 – الآن)" : "by Ayman Alazraq (2008 – present)"}
          </div>
        </div>
      )}

      {/* Main Form Body */}
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="flex flex-col justify-between bg-card p-4 sm:p-6 lg:p-8 space-y-5"
      >
        {errorNotice && (
          <div
            role="alert"
            className="flex items-center gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-sm text-destructive"
          >
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorNotice}</span>
          </div>
        )}

        {/* 1. Chapter Selection Chips (Prominent) */}
        <div>
          <label className="block text-xs font-bold  text-muted-foreground mb-2">
            {ar ? "1. اختر الفصل التوثيقي *" : "1. Choose a Chapter *"}
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              {
                id: "historical" as const,
                en: "Archive (Historical)",
                ar: "الأرشيف / مواد تاريخية",
                descEn: "1998–2001 operations & heritage",
                descAr: "فترة التشغيل 1998–2001 والذاكرة",
              },
              {
                id: "contemporary" as const,
                en: "Contemporary Documentation",
                ar: "توثيق معاصر",
                descEn: "Present condition, ruins & memories",
                descAr: "الوضع الراهن، الأطلال، والشهادات",
              },
              {
                id: "imagined_future" as const,
                en: "Imagined Future",
                ar: "مستقبل متخيّل",
                descEn: "Reconstruction designs & concepts",
                descAr: "رؤى وتصاميم إعادة البناء",
              },
            ].map((c) => {
              const active = chapter === c.id;
              return (
                <button
                  type="button"
                  key={c.id}
                  aria-pressed={active}
                  onClick={() => setChapter(c.id)}
                  className={`flex flex-col text-start p-3 rounded-xl border transition-all cursor-pointer ${
                    active
                      ? "border-primary bg-primary/10 ring-1 ring-primary shadow-xs"
                      : "border-border bg-card hover:bg-sand-deep/40 text-muted-foreground"
                  }`}
                >
                  <span className={`text-xs font-bold ${active ? "text-primary" : "text-foreground"}`}>
                    {ar ? c.ar : c.en}
                  </span>
                  <span className="hidden sm:block text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    {ar ? c.descAr : c.descEn}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Rights Status Selection */}
        <div>
          <label className="block text-xs font-bold  text-muted-foreground mb-2">
            {ar ? "2. وضع حقوق المواد والمصدر *" : "2. Rights & Provenance Status *"}
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <label
              className={`flex items-start gap-2.5 p-3 rounded-xl border text-start transition-colors cursor-pointer focus-within:ring-2 focus-within:ring-primary ${
                rightsStatus === "owned_authorized"
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border bg-card hover:bg-sand-deep/40"
              }`}
            >
              <input
                type="radio"
                name="rightsStatus"
                checked={rightsStatus === "owned_authorized"}
                onChange={() => setRightsStatus("owned_authorized")}
                className="size-4 mt-0.5 text-primary focus:ring-primary cursor-pointer"
              />
              <div>
                <div className="text-xs font-bold text-foreground">
                  {ar ? "أملك الحقوق / مساهمة أصلية" : "Owned / Authorized Rights"}
                </div>
                <div className="hidden sm:block text-[11px] text-muted-foreground mt-0.5">
                  {ar
                    ? "أملك حقوق المادة أو مخول بمشاركتها مع إمكانية رفع الملفات الأصلية."
                    : "I hold or am authorized to share these materials (Upload original files)."}
                </div>
              </div>
            </label>

            <label
              className={`flex items-start gap-2.5 p-3 rounded-xl border text-start transition-colors cursor-pointer focus-within:ring-2 focus-within:ring-primary ${
                rightsStatus === "reference_unconfirmed"
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border bg-card hover:bg-sand-deep/40"
              }`}
            >
              <input
                type="radio"
                name="rightsStatus"
                checked={rightsStatus === "reference_unconfirmed"}
                onChange={() => {
                  setRightsStatus("reference_unconfirmed");
                  setSelectedFiles([]);
                }}
                className="size-4 mt-0.5 text-primary focus:ring-primary cursor-pointer"
              />
              <div>
                <div className="text-xs font-bold text-foreground">
                  {ar ? "إحالة توثيقية (حقوق غير مؤكدة)" : "Archival Reference (Rights Unconfirmed)"}
                </div>
                <div className="hidden sm:block text-[11px] text-muted-foreground mt-0.5">
                  {ar
                    ? "استشهاد بمصدر خارجي للمراجعة الخاصة دون رفع ملفات محمية."
                    : "Third-party citation or link for private review without file uploads."}
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* 3. Media Type / Category */}
        <div className="grid gap-4">
          <div>
            <label htmlFor="contrib-type" className="block text-xs font-bold  text-muted-foreground mb-1.5">
              {ar ? "نوع المادة التوثيقية *" : "Material / Media Type *"}
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
              <option value="future_concept">{ar ? "رؤية مستقبلية أو مفهوم" : "Future Concept"}</option>
              <option value="design">{ar ? "تصميم أو مخطط معماري" : "Design / Architecture"}</option>
              <option value="other">{ar ? "أخرى" : "Other"}</option>
            </Select>
          </div>


        </div>

        {/* 4. Conditional Upload Zone vs Citation Inputs */}
        {rightsStatus === "owned_authorized" ? (
          <div className="rounded-xl border border-dashed border-border bg-sand-deep/40 p-4">
            <label htmlFor="contrib-files" className="block text-xs font-bold  text-muted-foreground mb-1">
              {ar ? "المرفقات الرقمية (1 إلى 5 ملفات)" : "Digital Attachments (1 to 5 files)"}
            </label>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
              {ar
                ? "الصيغ المدعومة: JPG, PNG, WebP, PDF, MP3, WAV, MP4 (الحد الأقصى 10 ميغابايت لكل ملف، و25 ميغابايت إجمالاً). تُحظر الملفات التنفيذية وملفات SVG."
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
        ) : (
          <div className="rounded-xl border border-border bg-sand-deep/20 p-4 space-y-3">
            <div className="flex items-center gap-2 text-clay font-bold text-xs">
              <Link2 className="size-4" />
              <span>{ar ? "بيانات الاستشهاد والإحالة التوثيقية" : "Archival Citation & Provenance"}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {ar
                ? "لا تقم برفع ملفات محمية بحقوق طرف ثالث. أدخل رابط المادة أو معلومات المصدر وسيتولى القيمون التحقق منها وفق معايير الأرشيف."
                : "Do not upload third-party protected files. Provide a citation link or archival provenance notes below for curatorial assessment."}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="contrib-ref-url" className="block text-xs font-semibold text-muted-foreground mb-1">
                  {ar ? "رابط المصدر أو التسجيل (إن وجد)" : "Reference Link / URL (If available)"}
                </label>
                <Input
                  id="contrib-ref-url"
                  type="url"
                  dir="ltr"
                  maxLength={2000}
                  value={referenceUrl}
                  onChange={(e) => setReferenceUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>

              <div>
                <label htmlFor="contrib-source-note" className="block text-xs font-semibold text-muted-foreground mb-1">
                  {ar ? "مصدر المادة / اسم الناشر *" : "Source / Archive Citation *"}
                </label>
                <Input
                  id="contrib-source-note"
                  maxLength={5000}
                  value={sourceNote}
                  onChange={(e) => setSourceNote(e.target.value)}
                  placeholder={ar ? "مثال: أرشيف صحفي، تقرير ICAO 1999، إلخ." : "e.g. Press archive, agency publication..."}
                />
              </div>
            </div>
          </div>
        )}

        {/* Contributor details */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="contrib-name" className="block text-xs font-bold  text-muted-foreground mb-1.5">
              {ar ? "اسمك *" : "Your name *"}
            </label>
            <Input
              id="contrib-name"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={ar ? "مثال: ليلى المصري" : "e.g. Layla Al-Masri"}
            />
          </div>
          <div>
            <label htmlFor="contrib-email" className="block text-xs font-bold  text-muted-foreground mb-1.5">
              {ar ? "البريد الإلكتروني للإشعار *" : "Notification Email *"}
            </label>
            <Input
              id="contrib-email"
              type="email"
              dir="ltr"
              required
              maxLength={160}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>
        </div>
        <details className="rounded-xl border border-border bg-secondary/40 p-4">
          <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary">{ar ? "\u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u0645\u0635\u062f\u0631 \u0648\u0627\u0644\u062a\u0627\u0631\u064a\u062e (\u0627\u062e\u062a\u064a\u0627\u0631\u064a)" : "Date, credits and provenance (optional)"}</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="contrib-approx-date" className="block text-xs font-bold  text-muted-foreground mb-1.5">
              {ar ? "التاريخ التقريبي (اختياري)" : "Approximate Date (Optional)"}
            </label>
            <Input
              id="contrib-approx-date"
              maxLength={100}
              value={approximateDate}
              onChange={(e) => setApproximateDate(e.target.value)}
              placeholder={ar ? "مثال: 1999 أو أبريل 2000" : "e.g. 1999 or April 2000"}
            />
          </div>
          <div>
            <label htmlFor="contrib-credit" className="block text-xs font-bold  text-muted-foreground mb-1.5">
              {ar ? "نسبة العمل / سطر الإسناد" : "Credit / Creator Line"}
            </label>
            <Input
              id="contrib-credit"
              maxLength={254}
              value={credit}
              onChange={(e) => setCredit(e.target.value)}
              placeholder={ar ? "مثال: تصوير عائلة..." : "e.g. Photo by..."}
            />
          </div>
          <div>
            <label htmlFor="contrib-location" className="block text-xs font-bold  text-muted-foreground mb-1.5">
              {ar ? "المكان (إن كان آمناً)" : "Location (Only if safe)"}
            </label>
            <Input
              id="contrib-location"
              maxLength={200}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={ar ? "مثال: صالة المغادرين" : "e.g. Departure Hall"}
            />
          </div>
          <div>
            <label htmlFor="contrib-name-ar" className="block text-xs font-bold  text-muted-foreground mb-1.5">
              {ar ? "الاسم بالعربية (اختياري)" : "Name in Arabic (Optional)"}
            </label>
            <Input
              id="contrib-name-ar"
              dir="rtl"
              lang="ar"
              maxLength={120}
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              placeholder="مثال: ليلى المصري"
            />
          </div>
          </div>
          {rightsStatus === "owned_authorized" && <div className="mt-4">
            <label htmlFor="contrib-owned-source-note" className="mb-1 block text-xs font-semibold">{ar ? "\u0645\u0644\u0627\u062d\u0638\u0627\u062a \u0627\u0644\u0645\u0635\u062f\u0631 \u0648\u0627\u0644\u062d\u0642\u0648\u0642" : "Source and rights notes"}</label>
            <Textarea id="contrib-owned-source-note" maxLength={5000} rows={2} value={sourceNote} onChange={e=>setSourceNote(e.target.value)} />
          </div>}
        </details>

        {/* 6. Caption & Description Context */}
        <div>
          <label htmlFor="contrib-description" className="block text-xs font-bold  text-muted-foreground mb-1.5">
            {ar ? "سياق المادة والوصف التوثيقي *" : "Description & Archival Context *"}
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
                ? "صف المادة، التاريخ، الأشخاص أو المرافق الظاهرة، وأي تفاصيل تساعد على توثيق أصالتها وأهميتها..."
                : "Describe the item, depicted facilities or individuals, and any provenance details that verify its authenticity..."
            }
          />
          <div className="mt-1 text-end text-[11px] text-muted-foreground">
            {description.length} / 5000
          </div>
        </div>

        {/* 7. Permission Consent & Curatorial Verification Notice */}
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
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
              ? "أؤكد أن هذه المساهمة مقدمة للمراجعة التوثيقية الخاصة والحفظ لدى الأرشيف الرقمي لمطار غزة الدولي. أدرك أن هذا استلام توثيقي خاص وليس ترخيصاً بالتوزيع أو ضماناً بالنشر العام، وأن الحقوق تبقى لأصحابها."
              : "I confirm that this contribution is submitted for private curatorial review and preservation by the Gaza International Airport Digital Archive. I understand this is an archival intake, not a distribution license or public publication guarantee, and rights remain with their respective owners."}
          </label>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
          <div className="text-[11px] text-muted-foreground">
            {ar ? "* حقول إلزامية لإتمام التوثيق" : "* Required fields for archival record"}
          </div>

          <div className="flex gap-3">
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !consent}
              className="gap-2"
            >
              <UploadCloud className="size-4" />
              <span>
                {busy
                  ? (ar ? "جارٍ الإرسال والتخزين الخاص…" : "Submitting to Private Storage…")
                  : (ar ? "إرسال المساهمة للأرشيف" : "Submit Archival Contribution")}
              </span>
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
