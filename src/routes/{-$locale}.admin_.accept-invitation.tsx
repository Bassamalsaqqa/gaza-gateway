import { createFileRoute } from "@tanstack/react-router";
import { StaffAccessPage } from "@/components/identity/staff-access-pages";
import { pageHead } from "@/lib/head";
import { identityUiRequested } from "@/lib/api/identity-ui-runtime";
import { AppLink } from "@/components/app-link";

export const Route = createFileRoute("/{-$locale}/admin_/accept-invitation")({
  head: ({ params }) => pageHead({locale:params.locale,path:"/admin/accept-invitation",en:{title:"Accept your staff invitation",description:"Staff account access."},ar:{title:"قبول دعوة الموظف",description:"الوصول إلى حساب الموظف."},noindex:true}),
  component: () => identityUiRequested ? <StaffAccessPage flow="invite" /> : <AppLink to="/admin/signin">Admin</AppLink>,
});
