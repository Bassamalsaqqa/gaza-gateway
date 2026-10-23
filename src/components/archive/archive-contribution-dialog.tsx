import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { Archive, Sparkles } from "lucide-react";
import { ArchiveContributionForm } from "./archive-contribution-form";

export interface ArchiveContributionDialogProps {
  triggerClassName?: string;
  triggerButtonVariant?: "primary" | "outline" | "secondary";
}

export function ArchiveContributionDialog({
  triggerClassName = "",
  triggerButtonVariant = "primary",
}: ArchiveContributionDialogProps) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl bg-card"
      >
        <DialogHeader>
          <div className="flex items-center gap-2 text-clay">
            <Sparkles className="size-4" />
            <span className="text-xs font-bold uppercase tracking-wider">
              {ar ? "الأرشيف الرقمي المفتوح" : "Digital Heritage Preservation"}
            </span>
          </div>
          <DialogTitle className="text-xl font-bold text-foreground">
            {ar ? "المساهمة في أرشيف مطار غزة الدولي" : "Contribute to Gaza Airport Archive"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {ar
              ? "شارك صوراً أو وثائق أو شهادات تاريخية لتوثيق تاريخ مطار غزة والخطوط الجوية الفلسطينية."
              : "Contribute historical photographs, documents, or oral testimonies to preserve the legacy of Gaza Airport."}
          </DialogDescription>
        </DialogHeader>

        <ArchiveContributionForm
          isDialog
          onSuccessDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
