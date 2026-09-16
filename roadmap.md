# Roadmap — passenger experience + bilingual routing

## Bilingual URLs
- [ ] Move all pages under `{-$locale}` optional segment (`/` English, `/ar` Arabic)
- [ ] URL is always the language source of truth; stored preference never overrides an explicit URL
- [ ] Root shell sets `lang`/`dir` from the URL (server-rendered, no English flash on /ar)
- [ ] Locale-preserving links (`AppLink`) + switcher that rewrites the current path
- [ ] Locale-aware head metadata, self canonical, hreflang alternates
- [ ] No `/en` routes

## Passenger workflow
- [ ] A. Network-aware search (one side always GZA, no equal endpoints, date validation)
- [ ] B. Stable resolvable ids for every bookable flight
- [ ] C. Infant model (forms, adult association, no seat, infants <= adults, consistent everywhere)
- [ ] D. Per-leg check-in flow at `/manage/$ref/check-in`
- [ ] E. Boarding passes follow per-leg check-in; cancelled bookings excluded; print isolation
- [ ] F. `/manage/$ref/seats` + `/manage/$ref/extras`; cancel confirmation dialog; no fake flight change
- [ ] G. Lookup requires reference + family name or email; remove PNR shortcut chips
- [ ] H. Saved travellers / profile / preferences feed the booking forms
- [ ] I. Booking ownership + claiming after sign-in; trips list scoped to account
- [ ] J. Copy integrity fixes

## Checks
- [ ] Typecheck + build clean
- [ ] Browser pass EN + AR at 390/768/1024/1280/1440, nested dynamic URLs

## Constraints
No admin, no backend/database/payment/email, no global redesign.
