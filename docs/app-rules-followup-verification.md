# App rules follow-up verification

Implemented on 18 October 2026 after `git pull` (already up to date), reading AGENTS.md / CLAUDE.md and Expo SDK 57 documentation, and passing the baseline checks.

## Picker findings and evidence

The confirmed code defect was over-broad runtime exclusion: `AppRulePackages` queried **every** HOME / Settings / DIAL / emergency handler and every installed input method. A third-party app merely advertising an intent could disappear from the picker. The replacement resolves the default home and system Settings handler, protects the actual default dialer, uses enabled input methods, and restricts emergency handlers to system apps. Non-default launcher/dialer package names were removed from the mirrored static lists so a role is determined at runtime.

The Samsung phone was not connected, so Snapchat's actual old role/intent result cannot be established here. The new **App picker diagnostics** button prints installed/excluded/selectable counts and reasons on screen for all flagged packages and five randomly sampled installed apps. A fresh APK is required for the new native reason method.

Fixture evidence from `scripts/app-rules-ui-check.ts`:

```text
Installed: 6
Selectable: 3
com.snapchat.android: installed yes; selectable
vendor.home: installed yes; runtime exclusion: default home
```

The complete selection is Snapchat, Instagram, and an app that merely handles tel links; the keyboard, default launcher, and own package are filtered. Snapchat passes the unchanged package regex and substring restrictions and is absent from the static denylist. The manifest already declares MAIN + LAUNCHER visibility. `AppPickerBridge` deduplicates by package and excludes only the own package; neither contains a Snapchat-specific exclusion. No manifest or picker-bridge change was necessary.

Picker errors now propagate, retain the last successful app list, and show the requested inline message and Retry. The app list reloads every time the picker opens. Both a thrown load and an empty result with a non-empty installed list are covered in browser checks.

## Behavior and interpretation

- Test controls and repository guards depend on the test-tools flag in debug and release. Coach seeding, sample actions, app-rule actions and diagnostics display on-screen results. Disabling the flag hides all tools and rejects fixture mutations.
- Native short-rule validation also follows the flag supplied by JS before every rules sync; it no longer depends on the APK debuggable bit. Normal user-rule validation retains its production minimums.
- Scheduled blocks and Daily limits have separate cards, add actions and creation presets. Both share the ten-rule cap. Existing-rule editors hide the type selector. Free users retain the single locked row.
- Rule rows show Edit using the Custom modes label token/weight, names, separate status details and unchanged usage feedback. Accessibility labels explicitly say Edit rule; missing app names use readable fallbacks.
- Name groups follow the concrete examples: one name; two names separated by a comma; three or more use the first name plus the number of additional apps, e.g. Instagram +2.
- The brief both protects the default dialer and says no third-party exclusions except launcher/keyboard. The implementation preserves the explicitly requested default-dialer protection even when the current default dialer is third-party; mere dial-intent handlers are selectable.
- Existing Geist 16/13/12 body/label/caption tokens are retained. No new font sizes, gradients or shadows were introduced.

## Checks

- `npx tsc --noEmit`: passed.
- `npx tsx scripts/app-rules-check.ts`: 18/18 groups passed, including native test-flag ordering, release fixture creation and disabled-flag refusal.
- `npx tsx scripts/app-rules-ui-check.ts`: 15/15 groups passed.
- `npx tsx scripts/test-tools-check.ts`: passed the flag/build-type matrix, Android-only controls, disabled repository guards and source audit against `__DEV__` gates.
- `npx tsx scripts/coach-check.ts`: 87 passed; release-mode sample load/remove and preview persistence are exercised.
- `npx tsx scripts/history-check.ts`: 16 passed.
- `npx tsx scripts/live-timer-check.ts`: 20/20 passed.
- `npx tsx scripts/typography-check.ts`: passed, including 36 component audits.
- Android `:app:testDebugUnitTest --offline`: passed; native compilation and 12 existing engine tests.
- `scripts/app-rules-ui-preview.cjs`: 22 browser captures, 741 assertions, zero failures at 360dp and fontScale 1 / 1.3. Checks include Edit alignment, both presets, permissions, cap, picker error/empty recovery, retained apps, downgrade and save/delete behavior. Enlarged-font screenshot inspected visually.

Preview HTML, results, logs and PNGs are in ignored `.artifacts/`; no preview PNG is tracked by this change.

Not device-verified: Snapchat's actual Samsung handler registration, native default-role/IME results on that phone, release APK tool interactions and enforcement, TalkBack, and Android text measurement. Browser checks approximate font scaling with the real Geist font files; they do not replace Android device checks.

## Files changed

- UI: `src/components/AppRulesSection.tsx`, `AppRuleEditorModal.tsx`, `AppRulePrimitives.tsx`, `AppPickerModal.tsx`, `DevAppRulesControls.tsx`, `DevCoachSampleControls.tsx`; `src/screens/SettingsScreen.tsx`.
- Domain: `src/domain/appRules.ts`, `appRulesModule.ts`, `appRulesPresentation.ts`; new `appPickerDiagnostics.ts`.
- Data: `src/data/appRulesRepository.ts`, `coachSampleRepository.ts`, `coachSeedRepository.ts`, `focusCoachRepository.ts`.
- Android: `AppRulePackages.kt`, `AppRuleDenylist.kt`, `AppRulesBridge.kt`, `RuleStore.kt` under `android/app/src/main/java/com/projectscaleup/app/`.
- Checks: `scripts/app-rules-check.ts`, `app-rules-ui-check.ts`, `app-rules-ui-preview.cjs`, `coach-check.ts`; new `test-tools-check.ts`.
- Docs/config: `docs/release-checklist.md`, this report, `.gitignore`.
