# Away time on iPhone: prototype

Status: **built behind `DEV_FLAGS.iosAwayTrackingPreview` (off).** Verified by unit tests and a simulator build only. The simulator can't fire DeviceActivity events, so nothing here has run against real Screen Time. The reliability test below needs a real iPhone, which needs the paid Apple Developer account. Spec: `away-time-ios-spec.md` and `away-time-shared-layer.md` (on `origin/docs/away-time-spec`).

## What is built

| Piece | Where |
| --- | --- |
| Rules (opt-in, session pause, heartbeat, gaps, failures, settling) as pure functions | `modules/screen-time/core/Sources/ScreenTimeCore/Away/AwayState.swift` |
| Tracker (single entry point for the app and the extension) | `.../Away/AwayTracker.swift` |
| Ambient activity, four keepers, App Group store | `.../Platform/LiveAway.swift` |
| Engine tells the tracker about every session change, so ambient pauses for a session and resumes when it ends, even with the app killed | `.../Rules/ScreenTimeEngine.swift` (`away:` collaborator) |
| Extension routes by activity name; away activities never reach the session engine | `targets/ActivityMonitor/DeviceActivityMonitorExtension.swift` |
| Bridge | `modules/screen-time/ios/ScreenTimeModule.swift`, `modules/screen-time/src/*` |
| JS: one backend per platform, so `awayTime.ts` stays shared | `src/domain/awayPlatform.ts` |
| Debug hooks (`#if DEBUG` natively, `DEV_FLAGS.tierSwitcher` in JS) | `src/components/DevAwayControls.tsx` (Settings, dev builds) |

Tests: `swift test` in `modules/screen-time/core` (policy, tracker, engine integration) and `npx tsx scripts/away-ios-check.ts`.

## Design choices

- **Design B**, with one daily repeating window (00:00 to 23:59) instead of a chain of one-shot windows. It rolls over without anything to miss. When a threshold event fires, the extension records it and restarts the activity so counts reset. Design A (chained 15 minute windows) is **not** built; build it only if B fails the test.
- **Keepers** at 00:00, 06:00, 12:00, 18:00 (15 minute repeating windows). Each checks the session state, restarts ambient if it died, and writes a heartbeat only after confirming ambient is running.
- **No double counting.** A session owns usage tracking, so ambient is stopped for the session (paused sessions included) and a use reported during one is dropped. A keeper during a session does not restart ambient and logs no failure.
- **Honest gaps.** A failed restart writes a failure and no heartbeat and opens a gap that the next confirmed heartbeat closes. A heartbeat more than 6.5 h after the previous one is also a gap. The app imports gaps into `away_tracking_gaps`, the same table Android uses.
- **Settling guard.** A report within 10 s of (re)starting monitoring is ignored (iOS 26 has fired events immediately).
- Identifiers are `ios.app.<key>` (the existing format). Away time is opt-in, and turning it off deletes the native file's contents.

## Differences from the shared-layer spec

Android shipped before this, with `away_tracking_gaps` and a single last-heartbeat value instead of a `tracking_events` table, and no `after_session_away_censored` column. iOS follows Android as built so the shared JS stays one code path. If the spec's `tracking_events` and censored values are wanted, that is a joint change.

## Not done

- The real-iPhone test (below).
- Asking for Screen Time access from the opt-in toggle. Without access nothing is armed, so nothing is claimed.
- Coach and Home away copy beyond the existing Android-only coach input (`focusCoachAway.ts` stays Android-only).
- Design A.

## Real-iPhone test protocol

Use `docs/away-time-ios-spec.md` (Test 0, the day-long script, the dead-tracking test, keeper-during-session and app-killed-during-session cases). Turn the flag on, run a Debug build, and use **Settings > Away time (testing only)** for the hooks:

1. Stop ambient tracking, wait for a keeper (or move one), and confirm it restarts and records a gap.
2. Simulate a failed restart, then confirm the display shows "at least" or nothing, never a long "about".
3. Start a session across a keeper time; ambient must stay stopped and no use may appear twice.
4. Force-quit mid-session, let it expire, and confirm ambient resumes without opening the app.
