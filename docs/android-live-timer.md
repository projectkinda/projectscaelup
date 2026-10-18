# Android live focus timer

A free Android-only mirror of Home's existing session timer. No paid entitlement,
foreground service, per-second JS updates, push service, or new dependency.
Rebuild/install the Android app: this local Expo module is not available in Expo Go
or through a JS-only OTA update. iOS registration and files are unchanged.

## What appears

- Running: an ongoing **Focus** notification with Android's native countdown.
  Tapping opens Home's timer screen; there are no action buttons.
- Paused: frozen remaining time and **Paused**, without requesting promotion.
- End, cancel, early end, or the end-choice modal: notification removed. Adding
  five minutes mirrors the new deadline. Pause-overrun auto-resume mirrors the
  deadline only when the existing JS timer actually resumes.
- Channel **Focus timer** (`focus_timer_v1`): low importance, silent, no vibration,
  no badge, secret lock-screen visibility. User channel settings take precedence.
- Android 16/API 36+: requests promotion, with the normal ongoing notification
  as fallback. Chip/Now Bar eligibility and rendering depend on OS/OEM settings;
  promotion is not guaranteed. Secret visibility intentionally hides it on the
  lock screen, so do not expect a lock-screen Now Bar while locked.

## API decisions verified against current docs (2026-10-17)

- [Builder reference](https://developer.android.com/reference/android/app/Notification.Builder):
  `setUsesChronometer(true)`, `setChronometerCountDown(true)` (capital D), and
  `setWhen(endsAtMs)` use the exact source deadline. `setTimeoutAfter` takes a
  **relative duration in milliseconds**, not an end timestamp (API 26+).
- [Live Updates](https://developer.android.com/develop/ui/views/notifications/live-update):
  standard style is eligible; `Notification.ProgressStyle` (API 36) is optional.
  No static progress bar is used because it would stop progressing without JS.
  Eligibility requires an ongoing titled notification, supported standard style,
  promotion request and manifest permission; no custom views, group summary,
  colorization, or minimum-importance channel. OEMs can apply additional criteria.
- The current reference lists `Builder.setRequestPromotedOngoing` and
  `Notification.EXTRA_REQUEST_PROMOTED_ONGOING` under **36.1**. This project
  compiles against 36, so it uses the documented extra key
  `android.requestPromotedOngoing` on API 36+, understood by supporting OEM builds
  and safely ignored otherwise. This also avoids invoking a missing 36.1 method.
- [Permissions](https://developer.android.com/reference/android/Manifest.permission#POST_PROMOTED_NOTIFICATIONS):
  `POST_PROMOTED_NOTIFICATIONS` is normal/appops, manifest-only: no runtime prompt.
  `POST_NOTIFICATIONS` is requested on API 33+, after the one-line explanation.
  The explanation is counted before showing it; at most two attempts survive
  restarts. Declining/skipping never blocks a session. No settings redirect.
- [Expo SDK 57 notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/)
  doesn't expose these chronometer/promotion controls, so `modules/live-timer`
  uses Kotlin `Notification.Builder` directly through the local Expo module API.

## Background, process death, and cleanup

The OS chronometer ticks without JS. On API 26+ the OS notification timeout is the
remaining duration, recalculated on each source transition. For paused mirrors it
is frozen remaining time plus the existing maximum pause duration; it never
starts a new timer or auto-resumes the session. If JS is suspended beyond that
lifetime, the paused mirror can disappear until the app's source timer resumes.
API 24/25 use an inexact system cleanup alarm instead (may be delayed in Doze).
No reboot receiver is installed; notifications need not survive reboot.

Ordinary process death leaves a running countdown for the OS to expire. Android
force-stop can remove it immediately. The app currently does not restore active
sessions after process death: a fresh React context clears the old notification,
then shows Home, without inventing a resumed session. User dismissal is respected
until a new session starts. Permission-grant races cannot resurrect an ended timer.

## Checks and manual test checklist

Run `npx tsc --noEmit` and `npx --yes tsx scripts/live-timer-check.ts`.
Native compile/manifest check: from `android`, run
`gradlew.bat :live-timer:compileDebugKotlin :app:processDebugMainManifest`.
Host verification passed: TypeScript, 20/20 live timer checks, Expo Android
autolinking, Kotlin compilation, and the app manifest merge. The merged manifest
contains both notification permissions and the private cleanup receiver.
No device behavior has been verified by the implementation agent.

- [ ] API 33+ clean install, free user: start, read explanation, allow; background
  the app and watch the shade countdown for at least 30 seconds. Check silence,
  title, no actions, and tap back to the timer from another tab/background.
- [ ] Pause/resume: frozen value + Paused, then countdown from the source's new
  deadline. Overrun a five-minute pause; repeat with the app backgrounded and
  foreground it to exercise existing JS auto-resume.
- [ ] End normally, end early, cancel, and extend by five minutes: no stale or
  duplicate notification, extension uses the new deadline.
- [ ] Background then kill the process (e.g. `adb shell am kill com.projectscaleup.app`):
  if retained by Android, countdown expires at its deadline. Relaunch before expiry:
  orphan removed, no session restored. Also kill while paused; cleanup is finite.
- [ ] Deny permission twice across separate starts, then start again: session still
  works, no third explanation/prompt. Try Not now, already-granted permission,
  and granting while paused or ending the session while permission UI is open.
- [ ] Samsung Android 16 / One UI 8: check an **unlocked** status-bar chip/Now Bar
  where supported and enabled; compare its countdown to the shade and app.
  Record model, OS, Live notifications settings, and any OEM restriction if absent.
- [ ] Other phones / older Android / promotion disabled: normal silent ongoing
  notification works. Confirm no lock-screen timer details; no notification after
  reboot. Dismiss an ongoing update where permitted: it stays dismissed until a
  new session. Repeat core flows with paid and free accounts.
