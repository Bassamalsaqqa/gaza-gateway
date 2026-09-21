/**
 * Admin foundation model: staff roles, permissions, navigation IA and the
 * derived operational figures the dashboard shows. Frontend-only mock data.
 */
import {
  ArmchairIcon,
  BarChart3,
  CalendarClock,
  Home,
  Inbox,
  Landmark,
  LayoutDashboard,
  type LucideIcon,
  MapPin,
  PlaneTakeoff,
  ScanLine,
  ScrollText,
  Settings,
  ShieldCheck,

  Ticket,
  UsersRound,
} from "lucide-react";

export type AdminRole = "admin" | "editor" | "viewer";

export type Staff = {
  id: string;
  name: { en: string; ar: string };
  email: string;
  role: AdminRole;
  title: { en: string; ar: string };
};

/** Mock staff identities used to exercise the permission UX. */
export const staffAccounts: Staff[] = [
  {
    id: "adm-1",
    name: { en: "Rana Habib", ar: "رنا حبيب" },
    email: "rana.habib@gza.ps",
    role: "admin",
    title: { en: "Airport administrator", ar: "مسؤولة المطار" },
  },
  {
    id: "adm-2",
    name: { en: "Yousef Nasser", ar: "يوسف ناصر" },
    email: "yousef.nasser@gza.ps",
    role: "editor",
    title: { en: "Content editor", ar: "محرِّر المحتوى" },
  },
  {
    id: "adm-3",
    name: { en: "Layla Odeh", ar: "ليلى عودة" },
    email: "layla.odeh@gza.ps",
    role: "viewer",
    title: { en: "Operations viewer", ar: "مطالعة العمليات" },
  },
];

export const staffByRole = (role: AdminRole): Staff =>
  staffAccounts.find((s) => s.role === role) ?? (staffAccounts[0] as Staff);

/** Single mock passphrase; there is no authentication infrastructure here. */
export const MOCK_PASSPHRASE = "gza-admin";

export type Permission =
  | "dashboard.view"
  | "ops.view"
  | "ops.edit"
  | "content.view"
  | "content.edit"
  | "commercial.view"
  | "commercial.edit"
  | "engagement.view"
  | "engagement.edit"
  | "admin.manage";

const permissions: Record<AdminRole, Permission[]> = {
  admin: [
    "dashboard.view",
    "ops.view",
    "ops.edit",
    "content.view",
    "content.edit",
    "commercial.view",
    "commercial.edit",
    "engagement.view",
    "engagement.edit",
    "admin.manage",
  ],
  editor: [
    "dashboard.view",
    "content.view",
    "content.edit",
  ],
  viewer: [
    "dashboard.view",
    "ops.view",
    "commercial.view",
    "content.view",
    "engagement.view",
  ],
};

export function can(role: AdminRole | undefined, permission: Permission): boolean {
  if (!role) return false;
  return permissions[role].includes(permission);
}

export type AdminNavItem = {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  /** Canonical English path, or null when the module arrives in a later batch. */
  to: string | null;
  permission: Permission;
};

export type AdminNavGroup = { id: string; labelKey: string; items: AdminNavItem[] };

export const adminNav: AdminNavGroup[] = [
  {
    id: "overview",
    labelKey: "adm.group.overview",
    items: [
      { id: "dashboard", labelKey: "adm.nav.dashboard", icon: LayoutDashboard, to: "/admin", permission: "dashboard.view" },
    ],
  },
  {
    id: "operations",
    labelKey: "adm.group.operations",
    items: [
      { id: "flights", labelKey: "adm.nav.flights", icon: PlaneTakeoff, to: "/admin/flights", permission: "ops.view" },
      { id: "schedules", labelKey: "adm.nav.schedules", icon: CalendarClock, to: "/admin/schedules", permission: "ops.view" },
      { id: "destinations", labelKey: "adm.nav.destinations", icon: MapPin, to: "/admin/destinations", permission: "ops.view" },
    ],
  },
  {
    id: "commercial",
    labelKey: "adm.group.commercial",
    items: [
      { id: "products", labelKey: "adm.nav.products", icon: ArmchairIcon, to: "/admin/products", permission: "commercial.view" },
      { id: "bookings", labelKey: "adm.nav.bookings", icon: Ticket, to: "/admin/bookings", permission: "commercial.view" },
      { id: "checkin", labelKey: "adm.nav.checkin", icon: ScanLine, to: "/admin/check-in", permission: "commercial.view" },
      { id: "customers", labelKey: "adm.nav.customers", icon: UsersRound, to: "/admin/customers", permission: "commercial.view" },
    ],
  },
  {
    id: "content",
    labelKey: "adm.group.content",
    items: [
      { id: "website", labelKey: "a2.nav.website", icon: Home, to: "/admin/website", permission: "content.view" },
      { id: "airport", labelKey: "a2.nav.airport", icon: Landmark, to: "/admin/airport", permission: "content.view" },
    ],
  },
  {
    id: "engagement",
    labelKey: "adm.group.engagement",
    items: [
      { id: "inbox", labelKey: "adm.nav.inbox", icon: Inbox, to: "/admin/inbox", permission: "engagement.view" },
      { id: "analytics", labelKey: "adm.nav.analytics", icon: BarChart3, to: "/admin/analytics", permission: "engagement.view" },
    ],
  },
  {
    id: "administration",
    labelKey: "adm.group.administration",
    items: [
      { id: "staff", labelKey: "adm.nav.staff", icon: ShieldCheck, to: "/admin/staff", permission: "admin.manage" },
      { id: "settings", labelKey: "adm.nav.settings", icon: Settings, to: "/admin/settings", permission: "admin.manage" },
      { id: "activity", labelKey: "adm.nav.activity", icon: ScrollText, to: "/admin/activity", permission: "admin.manage" },
    ],
  },
];

/* ------------------------------ editorial mock ----------------------------- */

export type ContentItem = {
  id: string;
  titleKey: string;
  module: string;
  state: "draft" | "published" | "archived";
  missingAr?: boolean;
  missingSource?: boolean;
  updated: string;
};

export const contentItems: ContentItem[] = [
  { id: "c1", titleKey: "adm.content.item1", module: "adm.nav.homepage", state: "draft", updated: "2 h" },
  { id: "c2", titleKey: "adm.content.item2", module: "adm.nav.travel", state: "published", missingAr: true, updated: "1 d" },
  { id: "c3", titleKey: "adm.content.item3", module: "adm.nav.archive", state: "draft", missingSource: true, updated: "1 d" },
  { id: "c4", titleKey: "adm.content.item4", module: "adm.nav.story", state: "published", updated: "3 d" },
  { id: "c5", titleKey: "adm.content.item5", module: "adm.nav.archive", state: "draft", missingAr: true, missingSource: true, updated: "5 d" },
];

/** Mock unresolved contact enquiries (the real inbox arrives in a later batch). */
export const unreadEnquiries = 4;
