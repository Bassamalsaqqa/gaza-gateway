/** Compiled public navigation shared by the site and its truthful read-only CMS inventory. */
export const primaryNav = [
  { to: "/flights", key: "nav.flights" },
  { to: "/destinations", key: "nav.destinations" },
  { to: "/airport", key: "nav.airport" },
  { to: "/gallery", key: "nav.gallery" },
  { to: "/travel", key: "nav.travel" },
] as const;

export const drawerNav = [
  { to: "/flights", key: "nav.flights" },
  { to: "/destinations", key: "nav.destinations" },
  { to: "/airport", key: "nav.airport" },
  { to: "/gallery", key: "nav.gallery" },
  { to: "/travel", key: "nav.travel" },
  { to: "/manage", key: "nav.manage" },
  { to: "/check-in", key: "nav.checkin" },
  { to: "/about", key: "nav.about" },
  { to: "/contact", key: "nav.contact" },
] as const;

export const footerColumns = [
  {
    key: "footer.plan",
    links: [
      { to: "/book", key: "nav.book" },
      { to: "/flights", key: "nav.flights" },
      { to: "/destinations", key: "nav.destinations" },
      { to: "/manage", key: "nav.manage" },
      { to: "/check-in", key: "nav.checkin" },
    ],
  },
  {
    key: "footer.discover",
    links: [
      { to: "/airport", key: "nav.airport" },
      { to: "/airport/past", key: "airport.past" },
      { to: "/airport/present", key: "airport.present" },
      { to: "/airport/future", key: "airport.future" },
      { to: "/gallery", key: "nav.gallery" },
    ],
  },
  {
    key: "footer.help",
    links: [
      { to: "/travel", key: "nav.travel" },
      { to: "/about", key: "nav.about" },
      { to: "/contact", key: "nav.contact" },
      { to: "/signin", key: "nav.signin" },
    ],
  },
  {
    key: "footer.legal",
    links: [
      { to: "/privacy", key: "legal.privacyTitle" },
      { to: "/terms", key: "legal.termsTitle" },
    ],
  },
] as const;
