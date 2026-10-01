# Away time: iOS spec and prototype plan (v5)

For Ragesh. Checked against `origin/main` at `3a2ef8d` and `docs/ios-screen-time-design.md`.
v5 adds the fourth review: keepers must not restart ambient during a session, the extension owns resuming ambient after a session, the heartbeat log and censored values come from the shared layer, and "off" clears derived data. (v4: heartbeat only after arming is confirmed, honest stale threshold, derived metrics for the coach, debug hook, one canonical shared layer. v3: heartbeat, four keepers, identifier format, retention, opt-in gap. v2: extension routing, design B first, the keeper, opt-in, Test 0.)
Status: **prototype first.** We don't build the feature until a real-iPhone test shows the approach is reliable enough.

## The idea in one paragraph

Today the Screen Time monitor only watches flagged apps during a session. The idea is to keep watching after the session ends, so we know roughly when the user last really used a flagged app. Then the app can say "you've been away from your flagged apps for about 3 hours," and it can work out what happens after a session: session ends 2:34 pm, next real use 3:47 pm, so about 1 h 15 min away. That number feeds break quality and the focus coach. The system already wakes our monitor extension with the app closed and the extension already saves to the shared app-group store, so this is a longer watch, not a new kind of access.

**What it is not:** it measures time away from the user's *flagged apps*, not time away from the phone. All copy says "flagged apps."

## Shared definition (what both platforms aim for)

Android has its own spec (`away-time-android-spec.md`) and is **not built**. Nothing in the repo records Android use outside a session today. This iOS plan doesn't depend on Android except for the shared pieces below.

- **Real use:** a flagged app used for about **60 seconds or more**. iOS reports cumulative use inside a window; Android's monitor counts a visit. These differ at the edges (two 30 s visits in one window count on iOS), which is fine for hour-scale numbers. Don't try to make them identical.
- **Use log:** a timestamped row each time a real use is reported, including with our app closed and outside sessions.
- **Away time:** time since the last real use, shown rounded ("about 3 h 15 min"), never to the second.
- **After-session away time:** time from session end to the next real use. Because nothing under about a minute is seen and event cadence is coarse, this is an **hour-scale metric**. Gaps under about 15 minutes can't be told apart from a short glance, so don't present them as precise.
- **Honest display:** away time is only claimed for periods when tracking was provably alive (see Heartbeat). A dead chain must never show up as "away for 9 hours."
- **Accuracy:** each timestamp is accurate to about a minute (the event fires when the 60 s threshold is reached). How *often* we get timestamps during long use depends on the design below.

## Shared layer (canonical file)

The tables (`app_use_log`, `tracking_events`), `sessions.ended_at` and the after-session columns (`after_session_away_seconds`, `_censored`, `_verified`), `awayTime.ts`, the display rule, retention, the censored "still away" values, what "off" clears, and the heartbeat contract are defined once in **`away-time-shared-layer.md`**. If this spec disagrees with it, that file wins. Build it first. Two iOS-specific notes: export `IOS_APP_PREFIX` and `IOS_ANY_FLAGGED_APP` from `src/domain/iosScreenTime.ts` (they're private today) and reuse them, and don't introduce a second identifier format.

## What we know from the code and the design doc

- **The extension doesn't look at which activity fired.** `eventDidReachThreshold` calls `ScreenTimeEngine.live.recordUsage(fromEvent:)` for any event, whatever the activity. Ambient events would be counted as session distractions. **Required change:** route on the activity name. Ambient activity events go to a separate handler that only appends to the ambient list. Session events keep the current path.
- The existing usage monitor stops every activity with the prefix `com.projectscaleup.usage.` (`LiveServices.swift`). The ambient activity needs a different prefix, for example `com.projectscaleup.ambient.`, so it is not stopped by session start or end.
- Usage events fire once per app per window on cumulative use. Restarting monitoring resets iOS's usage counts (comment in `LiveServices.swift`).
- Schedules have a 15 minute minimum, worked around today with `warningTime` for lockdowns.
- **L3:** usage-time events are unreliable (late, early, or immediately; iOS 26 regressions). Forum reports suggest thresholds of 5 to 15 minutes are safer than 1 minute. Ours is 1 minute, the risky end.
- **L5:** schedules more than about 45 minutes out can fire late, and `startMonitoring` can trigger a spurious `intervalDidEnd`. The existing wake scheduler already needs a guard against restart loops, and the ambient chain needs the same.
- The app identity is sometimes unknown (`ios.flagged-apps`). Away time works on "any flagged app"; per-app values only exist where `appKey` is known.

## Heartbeat on iOS

Why: a dead chain would look like a long "away" stretch. The meaning, the display rule, the `tracking_events` log and the stale threshold (6.5 hours) are in the shared layer. iOS specifics:

- The extension appends a heartbeat to the shared-store buffer on every wake (threshold, window end, keeper), **but only after confirming the ambient activity is actually running** (`center.activities` contains it). A keeper wake alone proves only that the extension ran.
- If a keeper's restart of the ambient activity fails (`startMonitoring` throws, the activity limit is hit), append a **failure** with a timestamp and **no heartbeat.** The app drains both into `tracking_events`.
- On foreground the app also checks Screen Time authorization status.
- Copy says "about," because during a quiet period the app can't tell "nothing used" from "tracker died" until the next keeper is due (see the shared layer's known limit).

## Session pause and resume of the ambient activity

Ambient is paused while a session runs, so the same use isn't recorded twice (session silent tracking already counts it). That creates two rules:

- **Keepers must not restart a paused ambient activity.** Before restarting, a keeper reads the session state from the shared store. If a session is active (including paused, since the session owns the usage plan then), the keeper writes a heartbeat only if ambient is running, does **not** restart it, and does **not** log a failure. A keeper that restarted ambient mid-session would double-record and break the no-double-counting rule.
- **The extension, not only JS, resumes ambient when the session ends.** If the app is killed during a session, JS never runs the end. The session-end transition (the existing wake schedule that calls `reconcile()`) must also start ambient once the session has ended or expired. The next keeper repeats the check as a backstop: if no session is active and ambient isn't running, restart it. After a session's end time has passed, treat it as ended even if no `endSession` call ever ran.

## Two designs

**B (try first): one window, restart on each event.** One monitoring window with a usage event per flagged app selection. When `eventDidReachThreshold` fires, the extension appends a timestamp, then restarts monitoring so counts reset and the next event can fire after another minute of use. The extension wakes only when flagged apps are really used, not on a timer, so continuous use leaves a record about every minute or two. Cost: restarting resets cumulative counts for the other apps in that window, and restarting from inside the extension is something to verify works reliably.

**A (fallback): chained 15 minute windows.** Each window has one event per app. `intervalDidEnd` schedules the next window. At most one record per app per window, so "last use" can be up to 15 minutes stale during a long scroll, and the extension wakes about 96 times a day.

**Keepers for both:** a chain of one-shot windows dies if one `intervalDidEnd` is missed (phone off, spurious callback), and a keeper that runs once a day could leave it dead for up to 24 hours. Use **four repeating keeper windows** (for example 00:00, 06:00, 12:00, 18:00). Each checks the session state (see above), writes a heartbeat if ambient is armed, and restarts ambient if it isn't and no session is active. That caps an undetected outage at about six hours. Guard against restart loops. Four keepers plus the session and ambient activities raises the concurrent-activity count, which is an open question below. **Unverified:** whether a repeating schedule's start callback fires after a reboot. Test it.

## Prototype

**Test 0 (before anything else): do 1-minute events fire reliably at all?** This answers L3 for the *session* tracking that already ships, not just this feature. Run a flagged app for a known 90 seconds, repeatedly, across a day, and record when events arrive. If they don't fire reliably, silent tracking in sessions is affected too, and the whole plan changes.

**Build:**
1. After `endSession`, start the ambient activity (own name and prefix) using design B, then try A.
2. Route ambient events by activity name (see above). Ambient events append `{appKey | 'ios.flagged-apps', usedAt}` to a separate list in the shared store.
3. Pause the ambient activity when a session starts and resume it when the session ends, owned by the extension as described above. Verify the extension never records an ambient event as a session distraction even if the pause is missed.
4. On app foreground, read and clear the ambient list, heartbeats and failures into `app_use_log` and `tracking_events` (`INSERT OR IGNORE`, platform `'ios'`).
5. Add the four keepers (session-aware) and the heartbeat.
6. **Debug hooks, gated behind `__DEV__` so they cannot ship:** stop the ambient activity, simulate a failed keeper restart, and clear the heartbeat. The dead-tracking test below needs them.
7. **Must verify:** in design B, restarting monitoring from the extension can trigger a spurious `intervalDidEnd`, and the extension's `intervalDidEnd` and `intervalWillEndWarning` handlers currently run the session `reconcile()` for any activity. Route ambient window ends by activity name so they never run the session reconcile.

**Test protocol (full day on a real iPhone, app killed, not attached to Xcode):** use a script with known times. For example: Instagram for 90 s at 10:05; 20 s at 11:00 (should not count); 3 min at 13:40; a 30 minute scroll at 16:00; nothing after 18:00 overnight. Also run once each with Low Power Mode on, the phone locked and idle for hours, and a reboot in the middle.

**Measure:**
- Recall of 60 s+ uses.
- Timestamp error against the *expected threshold time* (use start + 60 s), not the window size.
- False positives (uses under 30 s that got recorded).
- During the 30 minute scroll, how stale "last use" gets (B should stay within a few minutes, A up to 15).
- Extension wake-ups per day and any visible battery effect.
- Any ambient event that ended up in `distraction_events`.
- Missed stretches: overnight, after reboot, after Low Power Mode.
- **Dead-tracking test:** deliberately kill the chain with the `__DEV__` hooks (stop the ambient activity, force a failed keeper restart), revoke Screen Time access, and reboot without opening the app. A failed restart must write a failure and no heartbeat. The UI must show "at least X" or nothing, never a long "about X" that includes the dead period.
- **Keeper during a session:** start a session that spans a keeper time (or move the keeper for the test). Ambient must stay stopped, no use may be recorded twice, and no failure may be logged.
- **App killed during a session:** force-quit the app mid-session, let the session's end time pass. Ambient must resume without opening the app, via the extension's end-of-session transition or, at the latest, the next keeper.
- Whether a repeating keeper fires after a reboot with the app never opened.

**Pass:** at least 90% of 60 s+ uses recorded; median timestamp error within about 2 minutes of the expected time; no records for uses under 30 s; zero ambient events counted as session distractions; the chain recovers overnight and after a reboot through the keepers without opening our app; **no false "away" claim while monitoring was dead** (the dead-tracking test shows "at least" or hides, and the failed-restart case writes no heartbeat); a keeper never restarts ambient mid-session; and ambient resumes after a session ended while the app was killed.

**If it fails:** fall back to the break-window version. Flagged apps are shielded during a user-started break and an "Open anyway" tap counts as breaking it (the tap-based path from the design doc, which is reliable). We lose the all-day counter on iPhone. Android would still get it only if its separate spec is built.

**Blocker to confirm:** this needs a real iPhone with Family Controls available, which depends on the paid Apple developer account. Until then this stays on paper.

## If the prototype passes: build

1. Ambient activity, routing, session-aware keepers and chain scheduling as prototyped, with the reconcile-on-foreground pattern from section 3 of the design doc so a missed callback is corrected when the user opens the app.
2. JS side (`awayTime.ts`, shared): drain on foreground, `getAwaySince`, `getAwayDisplay`, `formatAwayTime`, `clearAwayData`.
3. UI, same on both platforms: one line on Home ("Away from your flagged apps: about 3 h"), one line on the session summary.
4. **Opt-in, not default on.** All-day tracking of flagged-app use is a much bigger privacy step than session-only tracking, and Screen Time data gets close scrutiny in App Store review. Offer it once, after the user's first completed session ("See how long you stay away from these apps after a session?"), with a toggle in Settings.
5. **Off means off.** Turning it off stops the ambient activity and all keepers, deletes `app_use_log` and `tracking_events`, and **clears `after_session_away_seconds`, `_censored` and `_verified` on every session** (`clearAwayData()`). `ended_at` stays.

## Privacy and App Store

- Uses the same Screen Time permission the app already asks for. No new system prompt.
- Data stays on the device (shared app group and local database). Nothing uploaded.
- Update the privacy copy: the app records when flagged apps are used, including outside sessions, only if the user turns it on; the raw log is kept 30 days; per-session away numbers stay with the session until the feature is turned off, which deletes them.

## Acceptance criteria (after a passing prototype)

1. A 90 s use with the app killed appears in `app_use_log` after opening our app.
2. A 20 s use does not appear.
3. Away time and after-session away time match the script within the measured accuracy, never include a stretch when the heartbeat was stale, and `after_session_away_verified` is 0 for any session that had a gap.
4. No use is recorded twice across a session start and end, and no ambient event shows up as a session distraction.
5. The chain resumes after a reboot and after Low Power Mode without opening our app.
6. Session lockdown, strict mode and existing tests still pass (separate activity name and prefix).
7. Toggle off: ambient activity and keepers stopped, `app_use_log` and `tracking_events` emptied, and the derived `after_session_away_*` columns NULL on every session.
8. A keeper that fires during a session does not restart ambient and logs no failure.
9. After a session that ended while the app was killed, ambient is running again without the app being opened.
10. A session followed by no flagged-app use ends up with a "still away" value (censored 1, verified 1) once the next session starts or 24 hours pass, and a session with a tracking gap gets verified 0.

## Open questions

- Does restarting monitoring from inside the extension work reliably (decides B vs A)?
- The limit on concurrently monitored activities, and whether the ambient activity plus four keepers is safe next to the session activity.
- Whether the extension's time and memory limits allow writing to the store and rescheduling inside one callback.
- Can the session-end wake (which already calls `reconcile()`) start the ambient activity inside the same callback within the extension's limits, or does that need a separate wake?
