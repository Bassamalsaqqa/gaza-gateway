/**
 * Gaza Gateway — Activity Event Presentation & Formatting (Phase 6C)
 *
 * Localizes semantic activity events dynamically at render time.
 * Invariant: Storage stores semantic fields; prose is synthesized for the user's active locale.
 */

import type { ActivityEvent } from "./types.ts";

function pick(lang: "en" | "ar", val: { en: string; ar: string }): string {
  return lang === "ar" ? val.ar : val.en;
}

export function formatActivitySummary(
  event: ActivityEvent,
  lang: "en" | "ar",
  t: (key: string) => string,
): string {
  const actorName = pick(lang, event.actor.name) || event.actor.email;
  const isAr = lang === "ar";

  const actionText = t(`a2.ac.act.${event.action}`);
  const moduleText = t(event.module);

  // If specific descriptionKey is present and maps to a translation, format with it
  if (event.descriptionKey) {
    const custom = t(event.descriptionKey);
    if (custom && custom !== event.descriptionKey) {
      return custom;
    }
  }

  // Fallback semantic composition
  if (isAr) {
    switch (event.action) {
      case "signin":
        return `تسجيل دخول ناجح للموظف ${actorName}.`;
      case "created":
        return `قام ${actorName} بإنشاء ${event.targetType} (${event.targetId}).`;
      case "updated":
        return `قام ${actorName} بتحديث ${event.targetType} (${event.targetId}).`;
      case "cancelled":
        return `قام ${actorName} بإلغاء ${event.targetType} (${event.targetId}).`;
      case "checked_in":
        return `قام ${actorName} بإتمام تسجيل الوصول للحجز (${event.targetId}).`;
      case "undo_check_in":
        return `قام ${actorName} بالتراجع عن تسجيل الوصول للحجز (${event.targetId}).`;
      case "assigned":
        return `قام ${actorName} بتعيين مسؤول للرسالة (${event.targetId}).`;
      case "status_changed":
        return `قام ${actorName} بتغيير حالة ${event.targetType} (${event.targetId}) من ${event.before || "—"} إلى ${event.after || "—"}.`;
      case "role_changed":
        return `قام ${actorName} بتغيير صلاحية ${event.targetType} (${event.targetId}) إلى ${event.after || "—"}.`;
      case "cleared":
        return `قام ${actorName} بإزالة التعديل التشغيلي لـ (${event.targetId}).`;
      default:
        return `أجرى ${actorName} إجراء ${actionText} على ${event.targetId}.`;
    }
  }

  // English fallback composition
  switch (event.action) {
    case "signin":
      return `Successful sign-in by ${actorName}.`;
    case "created":
      return `${actorName} created ${event.targetType} (${event.targetId}).`;
    case "updated":
      return `${actorName} updated ${event.targetType} (${event.targetId}).`;
    case "cancelled":
      return `${actorName} cancelled ${event.targetType} (${event.targetId}).`;
    case "checked_in":
      return `${actorName} completed check-in for booking (${event.targetId}).`;
    case "undo_check_in":
      return `${actorName} reverted check-in for booking (${event.targetId}).`;
    case "assigned":
      return `${actorName} assigned contact message (${event.targetId}).`;
    case "status_changed":
      return `${actorName} changed ${event.targetType} (${event.targetId}) status from ${event.before || "—"} to ${event.after || "—"}.`;
    case "role_changed":
      return `${actorName} changed ${event.targetType} (${event.targetId}) role to ${event.after || "—"}.`;
    case "cleared":
      return `${actorName} cleared override for ${event.targetId}.`;
    default:
      return `${actorName} performed ${event.action} on ${event.targetId}.`;
  }
}
