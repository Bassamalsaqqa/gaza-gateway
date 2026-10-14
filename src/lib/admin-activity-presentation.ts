type Language = "en" | "ar";
type Label = readonly [string, string];
const domains: Record<string, Label> = {
  identity: ["Accounts and security", "الحسابات والأمان"], fleet: ["Aircraft", "الطائرات"],
  network: ["Destinations", "الوجهات"], meals: ["Meals", "الوجبات"], schedules: ["Schedules", "الجداول"],
  content: ["Website content", "محتوى الموقع"], gallery: ["Gallery", "معرض الصور"],
  reservations: ["Bookings", "الحجوزات"], contact: ["Enquiries", "الاستفسارات"],
};
const actions: Record<string, Label> = {
  "aircraft.create": ["Aircraft added", "إضافة طائرة"], "aircraft.patch": ["Aircraft updated", "تحديث طائرة"],
  "layout.put": ["Seat layout updated", "تحديث توزيع المقاعد"],
  "airport.create": ["Destination added", "إضافة وجهة"], "airport.patch": ["Destination updated", "تحديث وجهة"],
  "schedule.create": ["Schedule added", "إضافة جدول"], "schedule.patch": ["Schedule updated", "تحديث جدول"],
  "meal.create": ["Meal added", "إضافة وجبة"], "meal.patch": ["Meal updated", "تحديث وجبة"],
  "meal.reorder": ["Meals reordered", "ترتيب الوجبات"], "meal.default": ["Default meal changed", "تغيير الوجبة الافتراضية"],
  "draft.save": ["Draft saved", "حفظ مسودة"], "draft.discard": ["Draft discarded", "إلغاء مسودة"],
  publish: ["Published", "نشر"], unpublish: ["Publication withdrawn", "سحب النشر"], restore: ["Revision restored", "استعادة إصدار"],
  postStaffLogin: ["Staff sign-in", "تسجيل دخول موظف"], postStaffLogout: ["Staff sign-out", "تسجيل خروج موظف"],
  postStaffMfaVerify: ["Staff verification", "التحقق من الموظف"],
  postStaffInvitationAccept: ["Staff invitation accepted", "قبول دعوة موظف"],
  postStaffPasswordForgot: ["Staff password recovery requested", "طلب استعادة كلمة مرور الموظف"],
  postStaffPasswordReset: ["Staff password reset", "إعادة تعيين كلمة مرور الموظف"],
  postStaffUserInvite: ["Staff invitation issued", "إرسال دعوة موظف"], patchStaffUser: ["Staff account updated", "تحديث حساب موظف"],
  deleteStaffUser: ["Staff account removed", "إزالة حساب موظف"],
  postStaffUserSuspend: ["Staff account suspended", "إيقاف حساب موظف"],
  postStaffUserReactivate: ["Staff account reactivated", "إعادة تنشيط حساب موظف"],
};
const outcomes: Record<string, Label> = {
  success: ["Success", "نجاح"], failure: ["Failed", "فشل"], denied: ["Denied", "مرفوض"],
};
const choose = (value: Label, lang: Language) => value[lang === "ar" ? 1 : 0];
const own = (map: Record<string, Label>, key: string) => Object.hasOwn(map, key) ? map[key] : undefined;
export function activityDomainLabel(domain: string, lang: Language): string {
  return choose(own(domains, domain) ?? ["Other activity", "نشاط آخر"], lang);
}
export function activityActionLabel(domain: string, action: string, lang: Language): string {
  if (domain === "reservations" && action === "created") return choose(["Booking confirmed", "تأكيد حجز"], lang);
  if (domain === "reservations" && action === "cancelled") return choose(["Booking cancelled", "إلغاء حجز"], lang);
  return choose(own(actions, action) ?? ["Recorded action", "إجراء مسجل"], lang);
}
export function activityOutcomeLabel(outcome: string, lang: Language): string {
  return choose(own(outcomes, outcome) ?? ["Recorded result", "نتيجة مسجلة"], lang);
}
export function formatActivityTimestamp(value: string, lang: Language, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  // Require an explicit instant, never guess a zone for a wall-clock value.
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return choose(["Time unavailable", "الوقت غير متاح"], lang);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return choose(["Time unavailable", "الوقت غير متاح"], lang);
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-PS" : "en-GB", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone, timeZoneName: "short",
  }).format(date);
}
