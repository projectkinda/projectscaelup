> Current implementation: all triggers now use the root-hosted table sheet documented in [Shared upgrade sheet](paywall.md). The compact apps-only variant described in the original work below has been removed.

﻿# Flagged-app upgrade prompt (Android Settings)

The free cap remains three flagged apps. The cap constant and pure selection helpers live in `src/domain/paywall.ts`; `settingsRepository.ts` re-exports the same constant for existing callers, including iOS. No iOS Screen Time picker code or behavior was changed.

## Paywall triggers

| Entry | Behavior |
| --- | --- |
| Android Settings + tile at or above three saved apps, free account | Shows `PaywallSheet feature="apps"`; muted amber border and + / PRO treatment are visible before tapping. There is no navigation to a nonexistent paywall screen. |
| Picker: first tap on an unselected app beyond the remaining free slots | Keeps selection intact and opens the apps sheet once per picker open. Further attempts flash the cap banner. |
| Picker: Get unlimited | Explicitly opens the apps sheet, including after an earlier dismissal. |
| Picker: All | Fills only remaining slots, then shows the banner; does not open the sheet automatically. |

The picker counter includes saved apps plus pending selections. At capacity it reads `3 of 3 free apps picked`, with Get unlimited above the bottom Add button. Below capacity it is a quiet counter. Removing an app updates the banner and + tile promotion immediately from state. Downgrading never removes saved apps; existing counts above three are simply full. A pending selection made before downgrade cannot be saved beyond the remaining allowance.

Dismissal through Not now, X, backdrop or Android back closes only the upgrade sheet; the picker remains open with its selections. Closing and reopening the picker resets the automatic-prompt allowance. Paid accounts have no free-cap banner or upgrade interception. The app-rules picker keeps its separate twenty-app behavior.

The apps sheet reuses the flat shared sheet surface, rounded container, hairline border, tokens, Geist typography and CheckMark SVG. It uses the requested title, explanation and three benefit rows instead of the comparison table. Non-Android rendering omits the schedule and daily-limit benefits.

## Purchase limitation and interim proposal

No purchase integration was added. With `DEV_FLAGS.tierSwitcher=true`, Upgrade to Pro is disabled and Purchases coming soon is shown. This also works in a release test APK with the flag enabled. With `DEV_FLAGS.tierSwitcher=false` (store configuration), **the sheet has no purchase action**, only Not now plus X/backdrop/back dismissal. The existing gating is unchanged.

Proposed interim behavior, not implemented: make the upgrade action open a read-only Pro overview explaining the features and upcoming availability, with a clear return action. It should not imply that payment or an upgrade is possible until RevenueCat is available.

## Verification

- `npx tsc --noEmit`: passed.
- `npx tsx scripts/flagged-app-cap-check.ts`: passed paid/free counts at 2/3/4, remaining slots, All clamping and deselection, preserved over-cap selections, once-per-open policy, platform benefits, and the actual Settings + handler and repository predicate.
- `npx tsx scripts/app-rules-ui-check.ts`: 15 groups passed.
- `npx tsx scripts/typography-check.ts`: passed.
- Browser harness `scripts/app-rules-ui-preview.cjs`: passes at 360dp, fontScale 1 / 1.3, including All, automatic prompt suppression/reset, banner flash, explicit Get unlimited, retained selection after Not now/X/backdrop, removal under cap, paid accounts, disabled purchase stub, store flag gating, and non-Android benefit filtering. Existing coach/app-rules sheets remain covered. Enlarged-font sheet and picker were inspected visually.

Generated HTML, logs and screenshots are under ignored `.artifacts/`; no screenshots are tracked.

Not verified on a device: Android native modal stacking/back dismissal and focus restoration, TalkBack, actual touch timing for the flash, Samsung rendering/font scaling, database-backed removal in an installed APK, or RevenueCat/purchase behavior (not implemented). The iOS Screen Time picker was intentionally left alone.

## Sheet and tile polish

All three sheet variants now use Upgrade to Pro for the disabled button and its accessibility label. They share a 28dp top radius, 24dp horizontal padding, 20dp top padding, a 36x4 handle, 36dp SVG close button, and 56dp primary button. Bottom padding is max(24, safe-area bottom + 16). The table uses a 120dp Pro column and an inset highlight; only excess content scrolls within the 90% height limit. Actions were checked after scrolling to the bottom at fontScale 1.3.

The apps title is Add more apps with Pro, on one line. At 360dp/fontScale 1.3 it ellipsizes, retaining the full accessibility label, the stat type token, and the close control. No font shrinking was introduced. The under-cap tile remains neutral; the full free tile uses the existing amber token at 35% opacity for its border, an amber plus and a plain PRO caption. When the two text lines cannot fit inside the 46dp tile (including at fontScale 1.3), only the centered amber plus is shown. The caption beneath the row is quiet while slots remain and opens the apps sheet at capacity. Paid users see neither promotional tag nor caption. Existing tokens were sufficient; tokens.ts did not need changes.

Polish verification: TypeScript, cap fixtures and typography checks pass. The browser harness renders apps/app-rules/coach sheets and actual Settings tile markup at both cap states at fontScale 1 and 1.3. All 1,211 assertions pass, including spacing, single-line apps title, matching tile dimensions, paid suppression, caption action and scroll reachability. Screenshots remain ignored. Native Android text measurement, modal scrolling with system insets, TalkBack and Samsung rendering still need device verification.
