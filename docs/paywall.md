# Shared upgrade sheet

All upgrade entry points call `usePaywall().show(feature)`. `PaywallProvider` is mounted once inside the app root's SafeAreaProvider and above the mounted tabs. It owns the only application JSX instance of PaywallSheet. Showing or closing it never changes the selected tab, unmounts a screen, resets a picker, or changes its selection. The obsolete full-screen route and screen were removed.

`src/domain/paywall.ts` supplies `PRO_FEATURES`, `PAYWALL_COPY` and `proFeaturesFor`. Every trigger uses exactly the same table and disabled button area. Its matching row is first and highlighted; all remaining rows preserve the canonical order. Only the title, subtitle and row order/highlight vary.

## Feature values and enforcement audit

| Row | Free | Pro | Code backing |
| --- | --- | --- | --- |
| Flagged apps | 3 | Unlimited | FREE_TIER_APP_CAP; Android Settings plus/picker cap and iOS Screen Time picker maximum. The shared repository canAdd predicate uses the same constant. |
| App rules | No | Schedules and daily limits | Android-only section and repository paid checks; downgrade sync removes native enforced rules. The row is omitted on iOS. |
| Focus coach | Basic | Trends, patterns, weekly experiment | selectCoachCardSections exposes the free unlocked note/basic progress and omits paid experiment/next-step content. |
| Full history | 14 days | Everything | FREE_HISTORY_DAYS is now used by the unchanged repository cutoff calculation, not just the table. Cutoff is local midnight fourteen calendar days before today, inclusive; it also includes the current day. Pro removes this cutoff. |
| Custom modes | No | More modes | Free Settings hides the custom-mode editor section; loadSettingsData and loadAvailableModes omit custom modes for free accounts. |

There is **no numeric custom-mode count cap** in the current code. The table therefore uses No, describing free availability, rather than inventing a count. saveCustomMode itself does not enforce entitlement or a count cap; those restrictions are currently enforced through the UI and loaders. Similarly, saveFlaggedApp does not itself authorize/count-limit writes; the existing picker/add guards enforce that cap. No new entitlement or purchase logic was introduced in this consolidation.

The nominal 14-day history value reflects the existing code's fourteen-day lookback. Because the cutoff starts at midnight fourteen days ago, it includes that boundary date plus today, rather than exactly 336 rolling hours. The boundary fixture verifies exclusion one millisecond before that cutoff, inclusion at the cutoff, and full Pro access.

## Entry points

- Settings flagged-app plus, cap caption, picker overflow/Get unlimited, and an over-allowance save after downgrade: apps.
- Android Settings locked schedules/daily-limits row: app-rules.
- History coach locked row: coach.
- History View more when older history is hidden: history.
- Home More modes: modes.

Repository-wide source audit found no other ad hoc premium modal or paywall navigation requiring conversion. The iOS Screen Time picker was left untouched. Android-only app-rules entries remain hidden there; if the app-rules trigger is forced in an iOS preview, its Android row is still omitted and no unsupported row is highlighted.

## Layout and behavior

The approved 28dp top radius, grab handle, SVG close control, 24dp horizontal/20dp top padding, inset highlight, approximately 120dp Pro column and 56dp primary button remain shared. Titles and subtitles are each one line with ellipsis at narrow widths; full copy remains in accessibility labels. The table scrolls only when needed within the 90% height limit. Feature changes reset the scroll so the highlighted first row is visible immediately.

Backdrop, X, Not now and the Modal's Android-back callback dismiss the host. The same mounted picker remains underneath. The automatic apps overflow prompt is still limited to once per picker open; explicit Get unlimited can reopen it.

Upgrade to Pro remains disabled with Purchases coming soon when DEV_FLAGS.tierSwitcher is enabled, including release test APKs. With the flag disabled, only dismissal controls are available. RevenueCat is not implemented; no purchase action or entitlement behavior was invented.

## Verification

- TypeScript and whitespace checks passed.
- `scripts/paywall-check.ts`: canonical values/order, both platform filters, copy, actual gate references, all five caller features, single root host and absence of old route/screen/ad hoc surface.
- `scripts/app-rules-ui-preview.cjs`: 54 captures, 1,856 assertions, zero failures at 360dp/fontScale 1 and 1.3. Renders all five triggers on Android and iOS through the real host; checks identical spacing, exact source copy, platform rows, highlighted-and-first visible row, action reachability, host reuse, scroll reset, backdrop/X/Not now dismissal in the browser, retained picker selection, cap behavior and existing rule/editor flows.
- History: 17 fixtures, including the real SQLite cutoff boundary. Coach: 87 checks. App rules: 18 groups. Live timer: 24 checks. Existing cap, typography and test-tool guard checks passed.
- Application-source grep returns exactly one sheet instance, in PaywallProvider, and no obsolete premium-message screen or paywall navigation call.

Not verified on a device: Android back and native modal stacking/focus restoration above the picker, iOS native sheet presentation, safe-area/text measurement, VoiceOver/TalkBack and Samsung rendering. The browser simulates mobile layout and backdrop/X/Not now; native back remains a manual check. No screenshots are committed; generated artifacts stay in ignored `.artifacts/`.
