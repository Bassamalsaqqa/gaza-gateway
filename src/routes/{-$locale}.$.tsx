import { createFileRoute } from "@tanstack/react-router";
import { PublicNotFound } from "@/components/public-not-found";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/{-$locale}/$")({
  head: ({ params }) => {
    const isAr = params.locale === "ar";
    return pageHead({
      title: isAr
        ? "الصفحة غير موجودة — مطار غزة الدولي (GZA)"
        : "Page Not Found — Gaza International Airport (GZA)",
      description: isAr
        ? "لم يتم العثور على الصفحة المطلوبة."
        : "The requested page could not be found.",
      locale: params.locale,
      path: "/404",
      noindex: true,
    });
  },
  component: PublicNotFound,
});
