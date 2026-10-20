# App Store listing: Project ScaleUp (iPhone)

Everything App Store Connect asks for, ready to paste. Limits are Apple's; counts are checked by
`python3 scripts/store/check_listing.py`. **Items marked ⚠ need a decision or a value only you have.**

## Identity

| Field | Value | Limit |
| --- | --- | --- |
| App name | ⚠ **Project ScaleUp** (working title; the name must be unique on the App Store, so have 2 to 3 fallbacks ready, for example "ScaleUp Focus") | 30 |
| Subtitle | Focus timer that keeps you put | 30 |
| Bundle ID | `com.projectscaleup.app` | |
| Primary category | Productivity | |
| Secondary category | ⚠ Health & Fitness or Education (your call) | |
| Version / build | 1.0.0 (1) | |
| Price | ⚠ Free (see "Pro and purchases" below) | |
| Availability | all territories (nothing here is region-specific) | |
| Devices | iPhone only (`supportsTablet: false`), so no iPad screenshots are needed | |

## Promotional text (can be changed without a new build)

Start a timer, sit down and stay put. The camera checks you're still at your desk, and the apps that pull you away get locked afterwards.

## Description

Project ScaleUp is a focus timer that holds you to it.

Pick a mode, start the timer and get to work. While the timer runs, the front camera checks that you're still at your desk. If you wander off, it's counted. If you open one of the apps you flagged as a distraction, that's counted too. Nothing is judged mid-session: you can use your phone, and you find out afterwards.

HOW IT WORKS
• Choose a mode: Deep Work (50 min), Study (45 min) or Creative Work (60 min). Each mode remembers the length you last used.
• Start the timer. The camera confirms you're present. Pause up to twice per session if life happens.
• Flag the apps that pull you away. Project ScaleUp notices when you open them during a session, using Apple's Screen Time, so it never learns which apps you chose.
• When the session ends, the apps you actually used are locked for a while. The more distractions, the longer the lock.
• Prefer a stricter session? Turn on strict mode and flagged apps are locked while the timer runs.

SEE YOUR PROGRESS
• A tally that fills in with every finished session.
• Streaks, a weekly strip and your most-used modes.
• A distraction trend, so you can see whether sessions are getting cleaner.

PRIVATE BY DESIGN
• The camera is analysed on your iPhone as live video. Nothing is photographed, recorded, saved or sent anywhere.
• Your flagged apps are chosen in Apple's own picker and stay hidden from the app. Sessions and progress stay on your device.
• No account, no ads and no tracking.

Project ScaleUp needs two permissions to work: Camera, to check you're at your desk, and Screen Time, to notice and lock the apps you pick. You can change either in Settings at any time.

## Keywords (comma-separated, no spaces after commas)

focus,timer,study,productivity,pomodoro,distraction,screen time,deep work,streak,app blocker,habit

## What's New (1.0)

First release.

## URLs ⚠ (required; host the files in `docs/store/site/`)

| Field | Value |
| --- | --- |
| Privacy Policy URL | ⚠ `https://<your-host>/privacy` (file: `site/privacy.html`) |
| Support URL | ⚠ `https://<your-host>/support` (file: `site/support.html`) |
| Marketing URL (optional) | leave blank |
| Copyright | ⚠ © 2026 *your name or company* |

## Age rating

**4+.** Answer "None" to every content question (no violence, mature themes, gambling, unrestricted web access or user-generated content).

## App Privacy ("nutrition label")

- **Data Not Collected.** Camera video is analysed on the device and never stored or sent. Screen Time data stays on the device and is not readable by the app. There are no network requests.
- **Tracking:** No.
- Privacy manifest (`PrivacyInfo.xcprivacy`) matches: `NSPrivacyTracking = false`, no collected data types.
- ⚠ This changes the day billing (RevenueCat) or any network feature is added; re-run `docs/security-privacy-review.md`.

## Export compliance

Already answered in the binary: `ITSAppUsesNonExemptEncryption = NO` (the only cryptography is a SHA-256 hash used to label apps, which is exempt). App Store Connect won't ask on each upload.

## Content rights / other questions

- Third-party content: none. Fonts are Geist (SIL Open Font License, `src/assets/fonts/OFL.txt`).
- Uses the Advertising Identifier (IDFA): **No**.
- Sign in with Apple: not applicable (no accounts).
- Account deletion: not applicable (no accounts).

## Pro and purchases ⚠ decision needed before submission

The app contains Pro surfaces (an "Upgrade to Pro" screen, "Manage Subscription", "Restore Purchases", and locked
coach and custom-mode rows). Purchases are **not wired up** yet; "Upgrade to Pro" only shows an "isn't available yet" alert.
App Review rejects apps that advertise purchases that don't work (guidelines 2.1 and 3.1.1). Choose one:

1. **Ship 1.0 with RevenueCat live.** Needs the paid developer account and the IAP products. Nothing else changes.
2. **Ship 1.0 as fully free on iOS.** Hide the Pro surfaces on iOS (or unlock everything) and add billing in 1.1.

The description above makes no Pro or price claims, so it works with either.

## Screenshots

`docs/store/screenshots/6.9-inch/` has five 1320 × 2868 panels (the required 6.9" size; App Store Connect scales
them for smaller iPhones). Upload in this order:

1. Sit down. Stay put. (Welcome)
2. Pick a mode. Start the timer. (Home with tally)
3. The camera keeps watch. (session running)
4. Watch your streak grow. (Progress)
5. Two permissions. That's it. (Camera + Screen Time)

Rebuild with `python3 scripts/store/compose_screenshots.py`. The raw simulator captures are in `screenshots/raw/`.
Caveat: the simulator has no camera, so the preview circle on panel 3 is black. For the store, retake panel 3 on a real
iPhone (a face in the preview looks better) using the same status-bar override described in the script.
