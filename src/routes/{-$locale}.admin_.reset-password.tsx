import { createFileRoute } from "@tanstack/react-router";
import { StaffAccessPage } from "@/components/identity/staff-access-pages";
import { pageHead } from "@/lib/head";
import { identityUiRequested } from "@/lib/api/identity-ui-runtime";
import { AppLink } from "@/components/app-link";

export const Route = createFileRoute("/{-$locale}/admin_/reset-password")({
  head: ({ params }) => pageHead({locale:params.locale,path:"/admin/reset-password",en:{title:"Reset your staff password",description:"Staff account access."},ar:{title:"إعادة تعيين كلمة مرور الموظف",description:"الوصول إلى حساب الموظف."},noindex:true}),
  component: () => identityUiRequested ? <StaffAccessPage flow="reset" /> : <AppLink to="/admin/signin">Admin</AppLink>,
});
