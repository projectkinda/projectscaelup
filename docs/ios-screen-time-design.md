# iOS Screen Time design (flagged apps, distractions, lockdown)

**Status:** v3, decided. Implementation in progress on branch `ios/screen-time`. **Owner:** iOS (Ragesh). **Date:** 2026-09-26
**Scope decision (2026-09-26):** Android stays exactly as it is. iOS gets its own approach built around Apple's limits, so the two platforms don't have to behave identically.

---

## 0. Decisions log (v3, 2026-09-26)

Partner feedback on v1 was reviewed against the research in section 3. Where it conflicts with an Apple limit, the Apple limit wins.

| # | Feedback | Decision | Why |
|---|---|---|---|
| F1 | "If iPhone can't go below 15 min, make the lockdown minimum 15 everywhere." | **Keep 10 min on both platforms. Android unchanged.** | iOS can do it: Apple's own `intervalTooShort` recovery text says to use `warningTime` for callbacks finer than 15 min. Lockdowns under 15 min schedule 15 min with `warningTime = 15 − N`. If device tests show the warning callback is unreliable, the app-foreground reconcile (section 3, pattern) still clears the lock on time whenever the user opens ScaleUp. Only if both fail do we revisit a 15-min floor. |
| F2 | "Keep one distraction per visit, not one per minute." | **Agreed. iOS counts one per visit.** v2 already dropped per-minute counting. A distraction on iOS is a deliberate **Open anyway** tap. To keep a long scroll to one distraction: when the grace period re-locks an app the user is still in, tapping **Open anyway** again within 60 s of the re-lock continues the **same visit**, so it isn't counted again. | Matches Android's harshness: one long Instagram scroll = 1 distraction ≈ 12 min lockdown, not 60. |
| F3 | "Try 30 s, fall back to 1 min." | **Doesn't apply on iOS.** No usage timer is involved. | Short usage thresholds are the least reliable part of the API (section 3, L3). The tap-based design avoids them. One honest difference: Android ignores glances under 30 s, while on iOS even a quick "Open anyway" counts, because it's an explicit choice made on the lock screen. |
| F4 | "If Screen Time access is revoked, pause and warn. Don't wipe the list." | **Agreed.** Locks are paused, the flagged list is kept, and a banner explains it. When access is restored, the picker opens pre-filled so the user can confirm. | Apple voids tokens on revocation, so old tokens may no longer resolve. Keeping the saved selection and asking the user to confirm is the least-effort recovery. We never delete their data. |

**Architecture decisions:**
- **Own module:** a typed Expo module (`modules/screen-time`) plus three extensions, not `react-native-device-activity`. That library is capable, but it's a generic action engine configured with untyped JSON in UserDefaults (a 1,900-line `Shared.swift`), and it pins an alpha Xcode-editing dependency. Our flows are specific, and typed code is easier to test and reason about.
- **Extension targets via [`@bacons/apple-targets`](https://github.com/EvanBacon/expo-apple-targets)** (v5, July 2026). It supports the `device-activity-monitor`, `shield-action` and `shield-config` target types, and it's the standard way to add Apple extensions to Expo apps.
- **Scene lifecycle as a config plugin:** the iOS 27 fix (`9eb1a33`) moves into a local config plugin, so `expo prebuild --clean` reproduces the native project. That removes the "never clean-prebuild on SDK 57" trap. Delete the plugin once SDK 58, which includes the fix, is adopted.

## 1. Summary

On Android, the app **watches** which app is open, counts time spent in flagged apps, and blocks them after the session. iOS can't do that reliably (section 3). Shipped iPhone blockers (Opal, one sec, ScreenZen, Habit Doom, Freedom) instead **put flagged apps behind a lock screen** and let the user decide what to do when they hit it.

**Proposed iOS behavior:**

1. **During a focus session, flagged apps are locked.** Opening Instagram shows our branded screen: *"You're in a Deep Work session · 12 min left"* with **Back to focus** and **Open anyway**.
2. **"Open anyway" counts as one distraction per visit.** It unlocks the flagged apps for a 2-minute grace period, then they lock again automatically. Re-opening straight away (within 60 s) continues the same visit and doesn't count again (F2).
3. **When the session ends, the session lock is lifted.** If any distraction happened, the post-session lockdown applies (same `min(10 + 2 × distractions, 60)` minutes as Android), using the same lock screen with *"Locked for N more minutes"*.

This design doesn't rely on Apple's usage-time events, which developers report as unreliable (section 3). Everything is triggered either by our app or by the user tapping a button, and iOS handles both reliably.

## 2. What Android does (unchanged)

| Feature | Android | Files |
|---|---|---|
| Pick apps | Installed-app list with icons, multi-select, free cap 3 | `src/domain/appPicker.ts`, `SettingsScreen` |
| Distractions | AccessibilityService → JS counts 30 s in a flagged app → `app_touched` row | `src/domain/usageMonitor.ts` |
| Lockdown | Overlay over touched apps for `min(10 + 2n, 60)` min | `src/domain/lockdownModule.ts`, `sessionHistory.ts` |

None of these files change for Android. iOS gets its own module, selected by `Platform.OS`.

## 3. Research: iOS limits and how shipped apps work around them

| # | Limit | Evidence | Consequence for us |
|---|---|---|---|
| L1 | Apps can't list installed apps or see which app is open. Selection is only possible through Apple's picker, which returns opaque tokens. | Apple docs: `FamilyActivityPicker` "without revealing their choices to the app" | No Android-style picker. Flagged-app names and icons are drawn by native SwiftUI `Label(token)`. |
| L2 | Our JS is suspended while the user is in another app. | iOS app lifecycle | All logic that runs while the user is elsewhere must live in app extensions. |
| L3 | **Usage-time events are unreliable**: they fire late, early, or immediately, and there are iOS 26 regressions. Developers recommend thresholds of 5–15 min or more. | Apple forums [811305](https://developer.apple.com/forums/thread/811305), [808470](https://developer.apple.com/forums/thread/808470), [737741](https://developer.apple.com/forums/thread/737741) | Don't build distraction counting on `eventDidReachThreshold`. Drop the 30 s / per-minute approach on iOS. |
| L4 | **Schedules must be at least 15 minutes long** (`intervalTooShort`). Apple's own recovery suggestion points to `warningTime`. | Apple docs; [Yamada: limitations](https://medium.com/@yosshi4486/limitations-of-screen-time-related-apis-3ebf7c371962) | For N < 15 min: schedule 15 min with `warningTime = 15 − N` and act in `intervalWillEndWarning`. |
| L5 | Schedules more than about 45 minutes out can fire late. `startMonitoring` can trigger a spurious `intervalDidEnd`. | [Habit Doom: Screen Time API guide](https://habitdoom.com/blog/apple-screen-time-api-guide) | Session and lockdown are at most 60 min: use chained checks for anything over 44 min. Guard every re-lock or unlock with a stored expiry timestamp, never a bare flag. |
| L6 | Lock screen (shield) buttons can only **close**, **defer** or do nothing. They can't open our app. | [riedel.wtf](https://riedel.wtf/state-of-the-screen-time-api-2024/), FB15079668 | "Open anyway" is handled inside the ShieldAction extension. There's no deep link into ScaleUp from the lock screen. |
| L7 | Tokens seen in shield extensions can differ from the stored ones (FB14082790). | riedel.wtf | Don't rely on matching the exact app in the ShieldAction extension. Treat "Open anyway" as unlocking **all flagged apps** for the grace period. |
| L8 | Extensions and the app share state only through **App Group UserDefaults**, not SQLite or Core Data. | Habit Doom guide | Extensions write small records. The app imports them into SQLite. |
| L9 | Users can revoke Screen Time access with a toggle, and there's no passcode protection for third-party apps (FB18794535). Revoking voids all tokens. | riedel.wtf; Apple docs | Detect on app open and show a banner. Accept that it's bypassable, as every iOS blocker is. |
| L10 | Up to 50 app tokens per shield. | one sec docs | Fine: the free cap is 3, and paid users won't approach 50. |
| L11 | The Simulator doesn't behave like a device. Test on a real iPhone, disconnected from Xcode, with the app backgrounded or killed. | Habit Doom guide | Section 8 test plan. |
| L12 | Family Controls **distribution** approval is needed for **every bundle ID**: the app plus each extension. | react-native-device-activity README | Request 4 approvals at once (section 6). |

**Pattern every shipped app uses (Habit Doom calls it "three independent systems"):**
1. The **ShieldConfiguration extension** decides what the lock screen shows, and reads state from the App Group.
2. The **DeviceActivityMonitor extension** handles timed transitions (session end, grace end, lockdown end).
3. **The main app, whenever it comes to the foreground**, checks the stored expiry timestamps and fixes the lock state before anything else loads.

Any one of them can fail. Having all three check the same timestamps keeps the locks correct.

## 4. iOS flows

State lives in App Group UserDefaults (`group.com.projectscaleup.app`):
`flaggedSelection` (encoded tokens), `session {id, endsAt, graceUntil?}`, `lockdown {until}`, `distractions [{sessionId, at}]`.

### 4.1 Authorize and pick apps
- **Screen Time permission:** Settings' Screen Time row calls `requestAuthorization(for: .individual)`, which prompts with Face ID or Touch ID.
- **Picking apps:** tapping **+** presents Apple's `FamilyActivityPicker`, pre-filled with the current selection.
  - The selection is stored in the App Group. JS stores only the count, plus opaque IDs for display.
  - Settings renders a native `FlaggedAppsStrip` (SwiftUI `Label(token)`) on iOS.
- **Free cap:** if a free user picks more than 3 apps, keep 3 and say so. The picker can't enforce a limit itself.
- **Categories and websites:** v1 ignores them, with a note in the sheet.

### 4.2 Session start
Called from JS `startSession`:
1. Write `session {id, endsAt}` to the App Group.
2. Lock the flagged apps: `ManagedSettingsStore(named: .session).shield.applications = flaggedTokens`. This is immediate and doesn't depend on any extension.
3. Start a schedule `session-<id>` that ends at `endsAt`. Sessions under 15 minutes use the `warningTime` trick (L4), and sessions over 44 minutes use chained checks (L5).

### 4.3 Opening a flagged app mid-session
- **ShieldConfiguration** shows: *"{App} is paused · Deep Work · 12 min left"*, with the buttons **Back to focus** and **Open anyway**. `Application.localizedDisplayName` is available inside the extension.
- **Back to focus:** `.close`.
- **Open anyway** (ShieldAction extension):
  1. If `now − lastRelockAt ≤ 60 s`, it's the same visit: don't count. Otherwise append `{sessionId, at}` to `distractions`.
  2. Set `session.graceUntil = now + 2 min` and clear the session shield.
  3. Start schedule `grace-<id>` (15 min long with `warningTime` 13, per L4) to lock again at `graceUntil`.
  4. Return `.defer`, so iOS checks the shield again and lets the user in.
- **Re-locking** happens in `intervalWillEndWarning`, or when the main app comes to the foreground. Either way, it only re-locks if `now ≥ graceUntil` and the session hasn't ended (L5 guard).

### 4.4 Session end
Whichever comes first: the JS timer (app in foreground), the app coming to the foreground after `endsAt`, or the `session-<id>` schedule ending:
- Clear the session shield and grace.
- JS imports `distractions` for the session into `distraction_events` as `type = 'app_touched'`, with `app_identifier = 'ios-flagged'` (the exact app is unknown, per L7).
- `completeSession` then runs **unchanged**. It already counts `distraction_events` and computes lockdown minutes.
- `voidSession` ("Finish") also clears the shields.

### 4.5 Lockdown
`completeSession` calls `LockdownModule.applyLockdown(apps, expiresAt)`, the existing signature. On iOS:
1. Write `lockdown.until`.
2. Set `ManagedSettingsStore(named: .lockdown).shield.applications = flaggedTokens`.
3. Schedule `lockdown`, using `warningTime` if under 15 min and chained checks if over 44 min.
4. The extension and the app on foreground clear it at `until`.
5. ShieldConfiguration shows *"Locked · N min left"* with only **OK**. There's no way to open the app during a lockdown.

**Resulting semantics on iOS:**
- A distraction is choosing "Open anyway".
- The lockdown covers all flagged apps, not only the ones opened.
- **The 10–60 minute formula stays the same.** The 15-minute schedule minimum is handled by `warningTime`, so no product change is needed.

## 5. What changes in the codebase

| Area | Change | Android affected? |
|---|---|---|
| `src/domain/lockdownModule.ts` | Add an iOS branch calling `ScreenTimeModule.applyLockdown` | No: the Android branch is untouched |
| `src/domain/appPicker.ts` / `SettingsScreen` | Settings renders a native picker and strip on iOS. `isAppPickerSupported` stays Android-only. Add `isScreenTimeSupported` for iOS. | No |
| `HomeScreen` | On iOS, call `ScreenTimeModule.startSession / pause / resume / end` where the Android usage monitor starts and stops. Import distractions before `completeSession`. | No: the calls are wrapped in `Platform.OS === 'ios'` |
| New `src/domain/screenTime.ts` | JS wrapper for the iOS native module | iOS only |
| New native module + 3 extensions | Section 6 | iOS only |
| App foreground hook | On iOS, `ScreenTimeModule.reconcile()` when the app becomes active | iOS only |

## 6. Native implementation

Decided in section 0: our own module plus `@bacons/apple-targets`.

```
modules/screen-time/            Expo module (Swift + TS), autolinked
  ios/ScreenTimeModule.swift    JS API: authorization, session, lockdown, reconcile, import
  ios/FlaggedAppsView.swift     native strip + picker sheet (Label(token), FamilyActivityPicker)
  ios/Shared/                   ONE copy of the domain code, compiled into the app and all extensions
    ScreenTimeStore.swift       typed App Group state (Codable), timestamp-guarded
    ShieldController.swift      named ManagedSettingsStores: .session, .lockdown
    ScheduleFactory.swift       15-min minimum, warningTime, chained checks
    ScreenTimePolicy.swift      pure rules: grace, same-visit merge, expiry (unit-tested)
  src/                          typed TS wrapper; iOS-only, no-op elsewhere
targets/                        @bacons/apple-targets
  ActivityMonitor/              DeviceActivityMonitor: transitions only
  ShieldConfiguration/          lock screen text
  ShieldAction/                 Back to focus / Open anyway
  _shared -> ../modules/screen-time/ios/Shared
plugins/withIosSceneLifecycle.js  iOS 27 scene fix, reproducible by prebuild
```

**Rules that keep it clean:**
- **No duplicated logic.** The app and all three extensions compile the same `Shared/` sources.
- **Pure policy, thin I/O.** All decisions (is it the same visit, has the grace ended, should we re-lock) live in `ScreenTimePolicy`: pure functions of `(state, now)`, unit-testable without a device. The extensions and the module only read state, call the policy and apply the result.
- **Timestamps, never bare flags** (L5). Every transition is idempotent, so running reconcile twice is harmless.
- **JS never sees tokens.** It gets counts, authorization status and distraction records. Tokens stay in native code and the App Group.

**Entitlements and bundle IDs to request together (L12):**
- `com.projectscaleup.app`
- `com.projectscaleup.app.ActivityMonitor`
- `com.projectscaleup.app.ShieldConfiguration`
- `com.projectscaleup.app.ShieldAction`

Each needs `com.apple.developer.family-controls` and the App Group.

## 7. Open product questions

| # | Question | Proposal |
|---|---|---|
| Q1 | Should iOS lock flagged apps **during** the session, not only after? | **Decided: yes.** It's the only reliable way to detect a distraction on iOS. |
| Q2 | Grace period after "Open anyway" | **Decided:** 2 min, with the 60 s same-visit rule |
| Q3 | Should "Open anyway" be available at all, or strict mode? | **Decided:** available; strict mode is a later option |
| Q4 | Categories and websites in the picker | **Decided:** not in v1 |
| Q5 | What to do when Screen Time access is revoked | **Decided (F4):** pause, warn, keep the list, confirm on re-grant |

## 8. Build plan

**Done (branch `ios/screen-time`, no paid account needed):**
1. ✅ Decisions (section 0) and product questions (section 7).
2. ✅ Scene-lifecycle config plugin, so `expo prebuild --clean` is safe (`8fe1bbe`).
3. ✅ ScreenTimeCore rules, engine and platform services, with 34 unit tests (`910c611`).
4. ✅ Expo module, the three extensions and entitlements (`82e392e`).
5. ✅ iOS call sites in Home, lockdown and Settings, plus reconcile on foreground. Android is unchanged (`c18bc6e`).
6. ✅ Verified in the iOS 27 Simulator: build clean, authorization prompt and decline path, start/pause/cancel update the shared state.

**After enrolling ($99):**
7. Set `ios.appleTeamId` in app.json (apple-targets needs it for device builds) and the signing team.
8. Request Family Controls **distribution** approval for all 4 bundle IDs the same day. Register the App Group `group.com.projectscaleup.app`.
9. Real-device tests: authorize → pick apps → session lock → Open anyway → grace re-lock → one distraction per long scroll → session end → lockdown → unlock. Run with the app killed and disconnected from Xcode. Include a session under 15 min, one over 44 min, and a 10-min lockdown (F1).
10. Fill in the App Store privacy details for Screen Time.

## 9. Sources

- Apple: [FamilyActivityPicker](https://developer.apple.com/documentation/familycontrols/familyactivitypicker), [DeviceActivityCenter.MonitoringError](https://developer.apple.com/documentation/deviceactivity/deviceactivitycenter/monitoringerror), [DeviceActivityEvent init (iOS 17.4)](https://developer.apple.com/documentation/deviceactivity/deviceactivityevent)
- [Limitations of Screen Time-Related APIs (Yamada)](https://medium.com/@yosshi4486/limitations-of-screen-time-related-apis-3ebf7c371962): 15-min minimum and the `warningTime` workaround
- [Apple's Screen Time API: How It Broke Me (Habit Doom)](https://habitdoom.com/blog/apple-screen-time-api-guide): three-system pattern, 45-min drift, timestamp guards
- [State of the Screen Time API (riedel.wtf, one sec)](https://riedel.wtf/state-of-the-screen-time-api-2024/): shield button limits, token randomization
- [one sec: Screen Time API issues](https://tutorials.one-sec.app/screen-time-api-issues): 50-token limit, picker crash
- Apple forums: [811305](https://developer.apple.com/forums/thread/811305), [808470](https://developer.apple.com/forums/thread/808470), [820956](https://developer.apple.com/forums/thread/820956): threshold and interval regressions on iOS 26
- [react-native-device-activity](https://github.com/kingstinct/react-native-device-activity)
