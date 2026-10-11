import { AppLink } from "@/components/app-link";
import { Container, Panel, btnClass } from "@/components/kit";
import { useI18n } from "@/lib/i18n";

/** Legacy operational check-in and surname lookup are unavailable in the free MVP. */
export function MvpBookingAccess({ checkIn = false }: { checkIn?: boolean }) {
  const { lang } = useI18n(); const ar = lang === "ar";
  return <Container className="py-12"><Panel>
    <h1 className="type-title-section">{ar ? "إدارة الحجز" : "Manage booking"}</h1>
    <p className="my-5">{checkIn
      ? (ar ? "لا تتطلب الحجوزات التذكارية تسجيل وصول تشغيلي. تذكرتك متاحة في حسابك." : "Commemorative bookings do not require operational check-in. Your ticket is available in your account.")
      : (ar ? "سجّل الدخول لعرض حجوزاتك وتذاكرك أو إلغاء الحجز." : "Sign in to view your bookings and tickets or cancel a booking.")}</p>
    <AppLink to="/account/trips" className={btnClass("primary", "md")}>{ar ? "حجوزاتي" : "My bookings"}</AppLink>
  </Panel></Container>;
}
