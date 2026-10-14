import { createFileRoute } from "@tanstack/react-router";
import { StaffAccessPage } from "@/components/identity/staff-access-pages";
import { pageHead } from "@/lib/head";
import { identityUiRequested } from "@/lib/api/identity-ui-runtime";
import { AppLink } from "@/components/app-link";

export const Route = createFileRoute("/{-$locale}/admin_/forgot-password")({
  head: ({ params }) => pageHead({locale:params.locale,path:"/admin/forgot-password",en:{title:"Recover your staff password",description:"Staff account access."},ar:{title:"استعادة كلمة مرور الموظف",description:"الوصول إلى حساب الموظف."},noindex:true}),
  component: () => identityUiRequested ? <StaffAccessPage flow="forgot" /> : <AppLink to="/admin/signin">Admin</AppLink>,
});
