import assert from "node:assert/strict";
import { test } from "node:test";
import { activityActionLabel, activityDomainLabel, activityOutcomeLabel, formatActivityTimestamp } from "../../src/lib/admin-activity-presentation.ts";

test("activity labels distinguish actual booking, reference and staff actions in EN/AR", () => {
  assert.equal(activityActionLabel("reservations", "created", "en"), "Booking confirmed");
  assert.equal(activityActionLabel("reservations", "cancelled", "ar"), "إلغاء حجز");
  assert.equal(activityActionLabel("identity", "postStaffInvitationAccept", "ar"), "قبول دعوة موظف");
  assert.equal(activityActionLabel("fleet", "layout.put", "ar"), "تحديث توزيع المقاعد");
  assert.equal(activityDomainLabel("identity", "ar"), "الحسابات والأمان");
  assert.equal(activityOutcomeLabel("denied", "ar"), "مرفوض");
});
test("unknown audit identifiers have honest localized fallbacks, including object prototype keys", () => {
  assert.equal(activityActionLabel("unknown", "new.operation", "ar"), "إجراء مسجل");
  assert.equal(activityActionLabel("identity", "created", "en"), "Recorded action");
  assert.equal(activityDomainLabel("constructor", "ar"), "نشاط آخر");
  assert.equal(activityOutcomeLabel("__proto__", "en"), "Recorded result");
});
test("activity timestamps reflect the explicit instant and international DST timezone", () => {
  const instant = "2026-10-14T08:00:00Z";
  for (const [lang, locale] of [["en", "en-GB"], ["ar", "ar-PS"]] as const) {
    const expected = new Intl.DateTimeFormat(locale, {year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"America/New_York",timeZoneName:"short"}).format(new Date(instant));
    assert.equal(formatActivityTimestamp(instant, lang, "America/New_York"), expected);
  }
  assert.notEqual(formatActivityTimestamp(instant,"en","America/New_York"), formatActivityTimestamp(instant,"en","Asia/Gaza"));
  assert.equal(formatActivityTimestamp("not-a-date", "ar"), "الوقت غير متاح");
  assert.equal(formatActivityTimestamp("2026-10-14T08:00:00", "en"), "Time unavailable");
});
