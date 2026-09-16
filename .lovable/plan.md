# Passenger experience completion + bilingual URLs

Large turn, split into two parts: (1) the Arabic URL namespace, (2) the passenger workflow fixes. No admin, no backend, no global redesign.

## Part 1 — Bilingual URL architecture

**Decision:** every existing page moves under one optional locale segment, so each page has exactly one file serving both languages.

```text
src/routes/{-$locale}/index.tsx        ->  /        and /ar
src/routes/{-$locale}/destinations.$code.tsx -> /destinations/AMM and /ar/destinations/AMM
src/routes/{-$locale}/manage.$ref.tsx  ->  /manage/ABC123 and /ar/manage/ABC123
```

- The locale segment accepts only `ar`; anything else falls through to the designed 404.
- Language comes from the URL, read during the first render, so a fresh device opening `/ar/gallery` gets Arabic RTL with no English flash and no dependence on stored settings. Stored language stays only as the preference used when someone lands on an unprefixed English URL and as what the switcher writes.
- `html lang`/`dir` are set from the URL in the root shell, server-rendered.
- The switcher rewrites the current path (adds or strips the `ar` prefix) and keeps params and query, so `/destinations/AMM` <-> `/ar/destinations/AMM`.
- A small `AppLink` wrapper (and `useLocaleHref`) keeps the current locale on every internal link so nav, footer, buttons and redirects never drop out of Arabic.
- Each page's `head()` returns locale-aware title/description plus self-canonical and `hreflang` alternates for `en`/`ar`.
- No `/en` routes.

## Part 2 — Passenger workflow

**A. Network-aware search** — one endpoint is always GZA; changing either side updates the other; origin never equals destination; return date never before departure; inline errors tied to fields.

**B. Flight ids** — the second search option gets a real resolvable id (its own `PS` number + date + direction) so `/flight/<id>` works for every bookable flight.

**C. Infants** — infant travellers get their own forms, each linked to an adult, no seat and no seat fee by default, `infants <= adults` enforced, and they appear consistently in review, confirmation, manage booking and account trips.

**D. Real check-in** — new `/manage/$ref/check-in` (Arabic `/ar/manage/$ref/check-in`): pick leg -> pick passengers -> confirm details -> seat -> review -> done, ending at the boarding passes for that leg. Booking state changes from one `checkedIn` flag to per-leg check-in (outbound and return tracked separately, per passenger).

**E. Boarding passes** — only checked-in legs produce passes; cancelled bookings never offer check-in; per passenger/leg resolution; print styling hides site header, footer and nav; derived boarding time labelled as scheduled-derived, not live.

**F. Manage booking really manages** — new `/manage/$ref/seats` and `/manage/$ref/extras` edit the existing booking (seats per eligible leg, extra bags with total recalculated, meal/assistance preserved) and return to the booking. "Add baggage" no longer sends people into a new booking. Flight change is shown as not available rather than pretending. Cancel requires a confirmation dialog with focus handling and clear announcement.

**G. Lookup tightening** — reference plus family name or booking email required; the developer PNR shortcut chips are removed from the page.

**H. Account data feeds booking** — saved travellers can fill a passenger form, the account holder can prefill Passenger 1, meal preference becomes the default, seat preference appears as a suggestion during seat selection (never auto-applied). Guest booking unchanged.

**I. Booking ownership** — bookings carry an owner field; guest bookings stay retrievable by reference; signing in or registering after booking can claim the booking; account trip lists show only that account's bookings.

**J. Copy integrity** — "Contact email" instead of "Confirmation sent to"; no live-data claims on generated schedules; drop repetitive prototype/demo labels while keeping the few notices that prevent misleading impressions.

## Verification

Type check plus a browser pass at 390 / 768 / 1024 / 1280 / 1440 on English and Arabic direct URLs, including nested dynamic ones (`/ar/manage/ABC123/check-in`, `/ar/flight/<id>`), covering keyboard focus, dialog behaviour and RTL composition of drawers, steppers, seat map and action groups.

## Deferred

No flight change/rebooking engine, no payment, no real check-in cut-off enforcement beyond simple mock rules, no admin.
