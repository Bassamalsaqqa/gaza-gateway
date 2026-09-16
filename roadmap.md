# Roadmap — passenger experience + bilingual routing

## Bilingual URLs
- [x] Move all pages under `{-$locale}` optional segment (`/` English, `/ar` Arabic)
- [x] URL is always the language source of truth; stored preference never overrides an explicit URL
- [x] Root shell sets `lang`/`dir` from the URL (server-rendered, no English flash on /ar)
- [x] Locale-preserving links (`AppLink`) + switcher that rewrites the current path
- [x] Locale-aware head metadata, self canonical, hreflang alternates
- [x] No `/en` routes

## Passenger workflow
- [x] A. Network-aware search (one side always GZA, no equal endpoints, date validation)
- [x] B. Stable resolvable ids for every bookable flight
- [x] C. Infant model (forms, adult association, no seat, infants <= adults, consistent everywhere)
- [x] D. Per-leg check-in flow at `/manage/$ref/check-in`
- [x] E. Boarding passes follow per-leg check-in; cancelled bookings excluded; print isolation
- [x] F. `/manage/$ref/seats` + `/manage/$ref/extras`; cancel confirmation dialog; no fake flight change
- [x] G. Lookup requires reference + family name or email; remove PNR shortcut chips
- [x] H. Saved travellers / profile / preferences feed the booking forms
- [x] I. Booking ownership + claiming after sign-in; trips list scoped to account
- [x] J. Copy integrity fixes

## Checks
- [x] Typecheck + build clean
- [x] Browser pass EN + AR at 390/768/1024/1280/1440, nested dynamic URLs

## Constraints
No admin, no backend/database/payment/email, no global redesign.

## Batch A completion (in progress)
- [ ] Stabilize per-passenger extras / per-leg check-in migration (typecheck clean)
- [ ] Booking: seat suggestion + cabin in normal seat step; mobile collapsible trip summary
- [ ] Manage extras: compact per-passenger UX
- [ ] All boarding-pass links use /boarding-pass/$ref/$leg/$pax
- [ ] Account: remove Payments, nearest upcoming trip, real pass count, trips tabs, traveler edit, profile/preferences/security copy
- [ ] Guest -> account -> verify -> saved trip handoff carrying ref
- [ ] Public /check-in in utility/mobile/footer nav
- [ ] Copy cleanup ("updated continuously" etc.)
- [ ] Final checks: tsgo, build, EN/AR desktop + 390px browser smoke
