# Android live focus timer

A free Android-only mirror of Home's existing session timer. No paid entitlement,
foreground service, per-second JS updates, push service, or new dependency.
Rebuild/install the Android app: this local Expo module is not available in Expo Go
or through a JS-only OTA update. iOS registration and files are unchanged.

## What appears

- Default style **custom / One-line row**: the active mode's display name on the
  left and a native countdown on the right, both in one horizontal row. The
  weighted name ellipsizes before taking space from the timer. Names preserve
  their display case (Deep Work, including custom modes), trim whitespace, use
  at most 40 characters, and fall back to Focus if blank. Tapping opens Home's
  timer screen; there are no action buttons.
- Paused custom row: the same name and frozen **12:34 paused** text on the right,
  with the Chronometer hidden and stopped. No promotion is requested.
- The session name is also the notification content title for accessibility and
  standard fallback; the row description is **{name}, focus session**. Expanded
  content uses the same row. The system retains its header and app icon.
- End, cancel, early end, or the end-choice modal: notification removed. Adding
  five minutes mirrors the new deadline. Pause-overrun auto-resume mirrors the
  deadline only when the existing JS timer actually resumes.
- Channel **Focus timer** (`focus_timer_v1`): low importance, silent, no vibration,
  no badge, secret lock-screen visibility. User channel settings take precedence.
- Comparison style **standard / Status-bar chip**, running on Android 16/API 36+:
  requests promotion, with the normal ongoing notification as fallback. Chip/Now
  Bar eligibility and rendering depend on OS/OEM settings;
  promotion is not guaranteed. Secret visibility intentionally hides it on the
  lock screen, so do not expect a lock-screen Now Bar while locked.

## Style comparison (test builds)

The custom row is **not eligible** for the Android 16 status-bar chip / Now Bar.
The standard running style is promotion-eligible; chip rendering is not guaranteed.
This is an Android platform restriction on custom RemoteViews, documented in the
[Live Updates FAQ](https://developer.android.com/develop/ui/views/notifications/live-update#faq).
Both styles remain secret on the lock screen.

With DEV_FLAGS.tierSwitcher enabled, Settings' existing test-tools area shows
**Live timer style: One-line row / Status-bar chip**. Tap to switch; the selected
value is displayed and success/failure appears on screen. The flag, not __DEV__,
gates the Android-only UI and JS setter, so release test APKs can use it. The native
setter also refuses a false test-tools flag or an unknown style. Unsupported/old
APKs report that a rebuild is needed instead of crashing.

The override is persisted in the module's SharedPreferences (custom by default).
Each native newSession copies it to session_style. Changes take effect on the
**next session start**, including after restart; pause, resume, permission results
and extension retain the current session's style and original mode name. Switching
modes before the next start uses the new display name. Disabling the test-tools
flag hides the control and prevents override changes; it does not erase a saved
comparison preference.

## API decisions verified against current docs (2026-10-18)

- [RemoteViews reference](https://developer.android.com/reference/android/widget/RemoteViews#setChronometerCountDown(int,%20boolean)):
  setChronometer is API 1; setChronometerCountDown is API 24. The custom running
  row sets its base to SystemClock.elapsedRealtime() + remainingMs, countDown true,
  started true. It ticks without JS, with no polling or per-second bridge updates.
- [DecoratedCustomViewStyle](https://developer.android.com/reference/android/app/Notification.DecoratedCustomViewStyle)
  and custom collapsed/expanded content are API 24, matching the merged app and
  module minSdk 24. The custom branch is guarded at API 24; lower APIs use a plain
  notification (static remaining time if no countdown API exists). Synchronous
  custom-view construction/post failures retry with the standard path. The system
  title also remains available when a host cannot use the custom presentation;
  asynchronous SystemUI rendering failures cannot be detected by this module.
- The custom row disables setUsesChronometer and setShowWhen on the Builder so
  the standard header never duplicates the timer. Framework notification title
  text appearance supplies theme/OEM colors, with no hardcoded colors. Both right
  views use 20sp monospace digits and medium weight on API 28+ (regular monospace
  fallback on API 24-27); the row's minimum height is 40dp.
- [Builder reference](https://developer.android.com/reference/android/app/Notification.Builder):
  The standard running style retains `setUsesChronometer(true)`,
  `setChronometerCountDown(true)` (capital D), and `setWhen(endsAtMs)` to use the
  exact source deadline. `setTimeoutAfter` takes a
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
Also run `gradlew.bat :app:processDebugResources :live-timer:testDebugUnitTest`
to link the notification layout and run module tests when present.
Host verification passed: TypeScript, 24/24 live timer checks (including labels,
mode changes, transitions and override guards), Expo Android autolinking, Kotlin
compilation, resource linking, and the app manifest merge. The module unit-test
task has no test sources. The merged manifest contains both notification permissions and the private cleanup receiver.
No device behavior has been verified by the implementation agent. In particular,
the 30-second background tick, One UI layout/colors, long-name truncation at
fontScale 1.3, TalkBack, paused layout and chip promotion require a rebuilt APK
on the target phone. No screenshots are committed.

- [ ] API 33+ clean install, free user: start, read explanation, allow; background
  the app and watch the shade countdown for at least 30 seconds. Check silence,
  title, no actions, and tap back to the timer from another tab/background.
- [ ] Custom running row: mode name on the left and countdown end-aligned on the
  right, one line in collapsed and expanded shade; watch it tick for 30+ seconds
  with JS backgrounded. Repeat in light/dark themes, with a 40-character custom
  mode name and fontScale 1.3; the name truncates without hiding the timer.
- [ ] Pause/resume: frozen value + Paused, then countdown from the source's new
  deadline. Custom row reads **12:34 paused**, remains frozen and shows no second
  header timer. Overrun a five-minute pause; repeat with the app backgrounded and
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

## Samsung style comparison record

Start a fresh session after each toggle. Check both modes under identical One UI
Live notifications settings. Record the observed result rather than assuming
that promotion eligibility means a chip will appear.

| Style | Model / Android / One UI / Live notifications setting | Shade ticks 30+ s | Unlocked status-bar chip / Now Bar |
| --- | --- | --- | --- |
| One-line row (custom) | Not tested on a device | Not verified | Not eligible; device observation pending |
| Status-bar chip (standard) | Not tested on a device | Not verified | Eligible; actual result not verified |

- [ ] Toggle while running, pause/resume and extend by 5 min: current style stays
  the same; end/cancel removes it; the next session uses the newly selected style.
- [ ] Start Deep Work, end, select a custom mode, start: both the visible name and
  TalkBack title change to the new display name; blank names fall back to Focus.
- [ ] Toggle both styles on the Samsung and fill in the record above, including
  which actually shows a chip. Verify lock-screen details stay hidden in both.
