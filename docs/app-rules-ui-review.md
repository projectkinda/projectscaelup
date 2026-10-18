# App rules UI and custom-mode copy review

Implemented Android Settings > App rules on the existing engine. All prerequisites were present and `git pull` was already up to date. No native dependency, engine enforcement formula, session formula, or database field was changed for this UI task.

## Files changed in this task

| File | Change |
| --- | --- |
| `src/screens/SettingsScreen.tsx` | Android-only App rules section between Flagged apps and Custom modes; updated custom-mode wording, scroll container, and slider accessibility label/actions; imports the extracted picker. Other Settings sections retain their styling. |
| `src/screens/HistoryScreen.tsx` | Uses the extracted PaywallSheet; removes the local sheet, its check-mark helper, and extracted styles. |
| `src/components/AppRulesSection.tsx` | Free/Pro gating, list/status/progress, permission notices, active-screen usage refresh, and repository + sync callbacks. |
| `src/components/AppRuleEditorModal.tsx` | Schedule/limit form, app selection, weekday chips, time/budget controls, enabled checkbox, inline validation/errors, and delete confirmation dialog. |
| `src/components/AppRulePrimitives.tsx` | Decorative outline SVGs, app icons, flat surface styles, and scrolling modal shell. |
| `src/components/RuleTimePicker.tsx` | JS hour/minute/am-pm picker; minute choices are 0, 5, ... 55. |
| `src/components/AppPickerModal.tsx` | Extracted existing picker with unchanged flagged-app default behavior and a rule variant. Uses the existing AppPickerList; rule selection has 20 slots, no flagged-app/free cap. |
| `src/components/PaywallSheet.tsx` | Extracted comparison sheet with optional feature highlight; adds Android App rules: Free No / Pro Schedules and daily limits. Preserves existing coach feature availability and purchase gating. |
| `src/domain/appRulesPresentation.ts` | Pure titles, all weekday summaries, duration/time formatting, usage/status summaries, budget stepping, default draft, and copy-only isLooserChange. |
| `src/domain/customModeCopy.ts` | Pure look-away descriptions, camera-distance labels, and introductory/list copy. |
| `scripts/app-rules-ui-check.ts` | Pure presentation and integration fixtures. |
| `scripts/app-rules-ui-preview.cjs` | Browser interaction/layout harness using real components and mocked native/repository boundaries. |
| `docs/app-rules-ui-review.md` | This report. |
| `docs/app-rules-list-preview.png`, `docs/app-rules-editor-preview.png`, `docs/custom-mode-copy-preview.png` | Browser captures at 360dp and 1.3 text scale. |

## Resulting behavior

- Free users see only the section introduction, lock/Pro tag, and locked Schedules and daily limits row. The paid subtree never mounts, so it does not list rules, fetch installed rule apps, read usage, or expose an editor. Downgrading unmounts an open editor and stops its polling. iOS renders no section and has TODO comments for Screen Time support.
- Paid users see up to three app icons per rule plus the remainder count, scheduled times/days or shared daily usage, and right-side statuses. Progress is capped at 100%; an exhausted daily budget uses the rust status. New rule is replaced by Rule limit reached at ten listed rules.
- Focus/return to foreground refreshes rules, eligible app icons, permissions, and usage. A 30-second timer refreshes usage/rules only while Settings is active and the app is foreground; cleanup cancels it when hidden/backgrounded/unmounted. Async result guards prevent stale results after downgrade/unmount. Installed icon data is not fetched every 30 seconds.
- Missing permissions produce one notice per missing permission at the top of the card. Allow opens the existing accessibility/overlay helper. Neither notice blocks editing or saving. App selection uses the engine's getSelectableRuleApps, including its shared denylist and runtime keyboard/launcher/Settings/dialer/emergency exclusions.
- Existing rule type is fixed and muted. New rules default to weekday 9 am-5 pm schedules; choosing Daily limit starts at one hour. Limits step by five minutes below an hour and fifteen above, clamped to 5 minutes-24 hours. The editor validates via the existing engine. Selected app icons can be tapped to remove an app; the plus tile opens the reused picker.
- Save/create/update/delete call the repository and then syncRulesToNative explicitly, followed by a list refresh. A rejected repository result or thrown callback produces Couldn't save. Try again. inline. Native sync retains the engine's existing defensive/best-effort error handling. No validation alert was added. Delete uses a separate flat confirmation dialog with the requested midnight warning.
- isLooserChange only controls explanatory copy. Enforcement remains the repository's retained-version union. A checkbox in Edit rule allows the disabled case; it uses the same retirement path as every other edit.
- Custom-mode fields/data retain gracePeriodSeconds/grace_period_seconds and the existing frame-range threshold. Only visible wording changes, with scrolling to accommodate longer copy and existing slider behavior plus accessible increment/decrement actions.
- The shared paywall retains X/backdrop/Not now dismissal and the disabled Continue/Purchases coming soon pair only when DEV_FLAGS.tierSwitcher is enabled. The App rules row highlights when opened from Settings. The Android-only row is not advertised on iOS.

## Reference differences

Only the custom-mode reference image was present in this turn. The App rules section/editor follow the written layout requirements. New rule pieces use the coach's module/panel tokens, hairline borders, 18px card radius, 16px padding, Geist Regular/Semibold, 12px captions, 13px labels, and 16px body. Chips use 8-12px radii; new rule pieces have no gradients/shadows.

The custom-mode editor retains its existing gradient shell and button styling because that part of the task explicitly requested copy-only changes. Its new scroll container can move the actions below the fold at 360dp/1.3 text scale; they remain reachable by scrolling. The rule editor uses the same centered modal proportions with a flat surface and scrolls at small heights. The paywall plan columns are wider than the former 54px columns so Schedules and daily limits can wrap legibly. Existing paywall colors/controls remain.

## Validation

- `npx tsc --noEmit`: passed.
- `npx tsx scripts/app-rules-ui-check.ts`: 12 grouped fixture checks, including all 128 weekday masks, 12 am/pm, duration/title formatting, each looser/tighter case, overnight changes, budget steps/bounds, usage/status, all look-away ranges, camera distance, section placement, and removal of old visible grace/frame copy.
- Browser harness: 20 captured states at 360dp, font scales 1 and 1.3; 531 assertions, zero failures. Exercises paid list, missing permissions and Allow actions, invalid/valid form save, app picker selection, inline save failure, create/update/delete + explicit sync, fixed existing rule type, presets, looser hint, actual delete confirmation modal, overnight rules with 20 apps, time picker, custom-mode copy, free privacy, iOS hiding, ten-rule cap, 30-second refresh, downgrade with an open editor, and release paywall controls.
- Large 20-app editor verified actually scrollable; Save reaches the visible scroll viewport after scrolling. Text bounds/font checks found no horizontal overflow or clipped text. Native/system APIs and modal hosting are mocked in these browser checks; captures are not phone screenshots.
- Existing app rule engine (17 groups), History (16), coach (87), live timer (20), and typography (36 component audits) checks passed. `git diff --check` passed.

Reproduce the browser preview with `node scripts/app-rules-ui-preview.cjs` (optionally pass an output directory). Open the printed review.html in a browser; the final result JSON must have an empty failures array. Add `?case=1.3-new`, `?case=1.3-paid`, or `?case=1.3-custom` to show an individual capture after the checks finish.

## Not verified on a device

No phone/emulator was used. Still needs Android verification: nested modal/hardware Back behavior, keyboard resizing and scrolling, touch scrolling/selection in the time/app pickers, TalkBack focus and slider actions, real installed app icons/protected-package discovery, opening/granting/revoking permissions and returning to Settings, real 30-second foreground usage updates, native sync failure/recovery, and actual schedule/limit enforcement after saving/editing/deleting. Use an Android build containing the prior native engine; Expo Go cannot provide its custom bridge. The existing engine's documented screen-on undercount and lifecycle limits remain unchanged.
