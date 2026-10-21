# iOS App Store submission checklist

Status as of 2026-10-20. ✅ done in the repo · 🔑 needs the paid Apple Developer account · ⚠ needs your decision or a value only you have.

## Do first (longest lead time)

- 🔑 **Enrol in the Apple Developer Program** ($99/yr).
- 🔑 **Request the Family Controls distribution entitlement** for all four bundle IDs. Text is ready in `family-controls-request.md`. Apple reviews it by hand and it can take weeks, so this gates the release.

## Account and signing 🔑

- Set `ios.appleTeamId` in `app.json` (Expo prints a warning until you do).
- Register `group.com.projectscaleup.app` and the four bundle IDs; add the Family Controls capability and the App Group to each.
- Create the App Store Connect app record (bundle ID `com.projectscaleup.app`), then archive, upload and test via TestFlight.

## Listing ✅ (needs a few values)

| Item | Status |
| --- | --- |
| Name, subtitle, promo text, description, keywords, What's New | ✅ `app-store-listing.md` (limits verified by `scripts/store/check_listing.py`) |
| Screenshots, 6.9" × 5 | ✅ `screenshots/6.9-inch/`; ⚠ retake panel 3 on a real iPhone (simulator camera is black) |
| App Review notes | ✅ `app-review-notes.md`; ⚠ add contact details and the purchases line |
| Privacy policy and support pages | ✅ `site/*.html`; ⚠ add date and contact email, **host them**, and put the URLs in the listing |
| Age rating, privacy label, export compliance | ✅ answers in the listing; encryption flag already in the binary |
| App name uniqueness, categories, copyright | ⚠ yours to confirm |
| App icon | ✅ 1024 × 1024, no alpha |

## Decision needed ⚠: Pro and purchases

Purchases aren't wired up. "Upgrade to Pro" shows an "isn't available yet" alert, and Settings has "Manage Subscription"
and "Restore Purchases". App Review rejects advertised purchases that don't work (2.1, 3.1.1). Either ship with RevenueCat
live (needs the account), or hide Pro surfaces on iOS for 1.0. Options and impact are in `app-store-listing.md`.

## Best-practice audit (what was checked)

| Area | Result |
| --- | --- |
| Background modes | **Fixed.** `audio` was declared (expo-audio's plugin default) but the chime only plays in the foreground; Apple rejects unused background modes (2.5.4). Removed on iOS via `plugins/withIosNoBackgroundAudio.js` and `Info.plist`; Android untouched and verified with `expo config --type introspect`. |
| Dynamic Type | **Fixed.** At the largest accessibility size Home clipped (tab labels "Hom/Progr/Setti", "Start", mode tab). Text growth is now capped at 1.6× in `AppText`. Everything fits at the largest system size. |
| Permissions | One camera usage string, clear and specific. Screen Time asked in context. No microphone, location, contacts or tracking prompts. |
| Privacy manifest | Present; `NSPrivacyTracking = false`, no collected data types, required-reason APIs declared. |
| Entitlements | Family Controls and App Group only, on the app and all three extensions. |
| Release build | Builds and runs standalone. Dev tools (coach seeding, tier switcher, away-time debug) are absent; native debug hooks are compiled out. |
| Orientation / devices | iPhone only, portrait. No iPad build, so no iPad screenshots or layout needed. |
| Launch / icon | Solid #121212 launch screen (no white flash); icon 1024, no alpha. |
| Network | None. ATS blocks arbitrary loads (`NSAllowsLocalNetworking` is the Expo default, harmless). |
| Crash / hang | Launch, background/foreground, session start, pause/resume and end verified on the simulator (iPhone 17 and 17 Pro Max, iOS 26.5). |
| Contrast (WCAG AA) | ⚠ **Open, design decision.** `muted` (#7E7E7E) is 3.25:1 on the lighter panel gradient and 4.42:1 on the darker end, below AA 4.5:1 for small text. Raising it to about #9A9A9A fixes it. It is a shared token (changes Android's look too), so it was not changed. |
| UI scan (2026-10-20) | Every screen captured on iPhone 17 Pro Max and iPhone 17e (small), Debug and Release. **Fixed:** Settings dev tools were scattered across the Subscription panel with clipped boxes (now one "Developer tools" section, absent in Release); "Last 0 sessions" shown to new users; mode tabs cut mid-letter (edge fade added); letter placeholders in the permissions hub (camera and hourglass icons). **Added:** Settings > About with the version, plus Privacy Policy and Support rows that appear once their URLs are set in `src/config/legal.ts`. |
| Pro modes in lists | ⚠ Progress lists Pro-only modes ("Meditation, Exam Prep…") with "No data" for free users. Harmless, but worth hiding if Pro is hidden on iOS. |

## Still to verify on a real iPhone 🔑 (the simulator can't)

- Screen Time: authorization prompt, the app picker, silent tracking events, lock after a session, strict mode, "Open anyway".
- Camera presence detection with a real face; battery and thermal behaviour in a 50-minute session.
- VoiceOver pass on every screen (labels exist, 143 accessibility props, but a spoken pass hasn't been done).
- Away time (prototype, flag off): follow `docs/away-time-ios-prototype.md`. It is **not** part of 1.0 unless it passes.
- Add the hosted policy and support URLs to `src/config/legal.ts` so Settings > About links to them.
- Onboarding: the flow exists but is behind `DEV_FLAGS.iosOnboardingPreview`. Turn it on and remove the `App.tsx` bypass only after the real-device test; Harsha reviews that diff.

## Release switches to confirm before archiving

`DEV_FLAGS` in `src/domain/paywall.ts`: `iosOnboardingPreview` (decide), `iosAwayTrackingPreview: false`, `resetOnboarding: false`,
`forcePaidUser: false`. Bump `CFBundleVersion` for every upload.

## Legal pages, store forms and open legal items (added 2026-10-21)

Pages: `site/terms.html`, `site/privacy.html` (Android + iPhone), `site/support.html`, `site/index.html`. Hosting steps: `../hosting-legal.md`. In-app links come from `src/config/legal.ts` and stay hidden until each URL is set.

- **Google Play Console, privacy policy URL:** App content > Privacy policy: the hosted `privacy.html` URL.
- **Accessibility API declaration:** the policy has an "Accessibility service" section describing it: one event type (window came to front), package and class name only, `canRetrieveWindowContent=false`, flagged apps only, on-device, not an accessibility tool. Keep the policy URL live and consistent with the declaration and the in-app disclosure (`settingsGuideConfig.ts`).
- **Data safety form (from the 2026-10-21 audit):** data collected: **none** (no app code makes network requests; no analytics/ads/crash reporting). Data shared: none. Tick "data is processed on device"; no account; deletion: uninstall / clear storage. ⚠ Re-check the SDK dependency question: INTERNET is declared (merged from libraries; see `release-checklist.md`). After RevenueCat ships: add *Purchase history* and *Device or other IDs* (anonymous app user ID), collected, for app functionality, not for tracking, encrypted in transit. Mention Android Auto Backup is enabled (`allowBackup=true`); Google's backup is not "collection by the developer".
- **Apple privacy label:** *Data Not Collected* until RevenueCat ships; then Purchases and Identifiers (User ID), not linked for tracking. Tracking: No. Privacy manifest unchanged.
- **Apple EULA:** either use Apple's standard EULA (default) and say so in the listing, or paste `terms.html`'s URL as a custom EULA in App Store Connect. Subscription apps must show the Terms and Privacy links in the app and the listing's description once Pro is live.
- **Paywall disclosure:** `src/config/subscription.ts` supplies price/period (null now; hidden in release). Fill from RevenueCat offerings.

### Open legal items ⚠

- [ ] Legal entity name
- [ ] Support/contact email
- [ ] Governing law / jurisdiction (and liability cap, if any)
- [ ] Effective date
- [ ] Host the pages and set the URLs in `src/config/legal.ts`
- [ ] Lawyer review of Terms and Privacy Policy before launch
- [ ] Decide on `allowBackup` (see release checklist) and add an in-app "delete my data" if wanted
- [ ] Re-issue the policy and Data safety/privacy label when RevenueCat goes live
