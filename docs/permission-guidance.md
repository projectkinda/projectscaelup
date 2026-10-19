# Permission guidance (onboarding)

How onboarding gets someone to turn on each permission without help.

## The pattern

Permissions that need a trip to Settings use `SettingsGuide`
([src/components/settingsGuide/SettingsGuide.tsx](../src/components/settingsGuide/SettingsGuide.tsx)):

1. **Disclosure** first. Plain words, "Agree and continue" / "Not now". Agreeing is stored on the phone
   with a time (`app_state`, via [permissionConsent.ts](../src/domain/permissionConsent.ts)). Settings is
   never opened before it. Changing a disclosure's wording? Bump `DISCLOSURE_VERSION` in
   [consentRecord.ts](../src/domain/consentRecord.ts) so people agree to the new wording.
2. **One step per screen**: "Step N of M" dots, a 20px+ instruction, a drawing of the real Settings page
   with the target ringed in amber, one 56px pill, back chevron.
3. **Auto-detect**: checks when the app returns to the front and once a second. "I've turned it on" is a
   small fallback that says "It still looks off. Check step 3." if it is still off.
4. **Can't find it?** sheet: greyed-out switch (Restricted setting), app missing from the list, skip.

The flow is a pure state machine ([settingsGuideMachine.ts](../src/domain/settingsGuideMachine.ts)).
All wording and drawings are data in [settingsGuideConfig.ts](../src/domain/settingsGuideConfig.ts).

The drawings are **drawings, not screenshots**. They are Views and vectors built from a `SceneSpec`.

## Add a phone

In `settingsGuideConfig.ts`, add its lowercase `Platform.constants.Manufacturer` or `Brand` to a variant's
`manufacturers`. Anything unlisted gets `generic` ("Installed apps (or Downloaded apps)").
To change a variant's wording or rows, edit its entry in `VARIANTS`.

## Add a permission

Add a builder like `overlayGuide` in `settingsGuideConfig.ts` (disclosure, steps, help), add its id to
`PermissionGuideConfig['id']`, then render it with `GuidedPermissionStep`.

## Audit: every permission in `PermissionsHub`

| Permission | Platform | Hub copy | Needs Settings? | Treatment |
| --- | --- | --- | --- | --- |
| Camera | both | "Checks you're at your desk." | No, system pop-up (Settings only after a hard No) | One-line pre-prompt: "ScaleUp checks you're at your desk. Frames stay on your phone." |
| Accessibility | Android | "Notices when you open the apps you picked." | Yes | Disclosure + 3 guided steps + help sheet |
| Display over other apps | Android | "Shows the lock screen on top of locked apps." | Yes (opens the app's own page directly) | Disclosure + 2 guided steps + help sheet (no restricted-settings section) |
| Screen Time | iPhone | "Notices the apps you pick and locks them afterwards." | No, Apple pop-up (Settings only after a No) | One-line pre-prompt: "Lets ScaleUp notice and lock the apps you pick. Apple keeps your picks private." |

There is no notifications permission in the hub today, so nothing to add there.

## Checks

- `npx tsc --noEmit`
- `npx tsx scripts/settings-guide-check.ts`: phone to variant mapping, the state machine (disclosure,
  steps, detected, done, plus decline, back, skip, retry and the restricted-settings path), consent record.
- `node scripts/settings-guide-ui-preview.cjs`: renders disclosure, every step, the help sheet and the
  success screen for samsung, google and generic at font scale 1 and 1.3 on 360x640 in headless Chrome.
  It also checks tap sizes, labels, sideways scroll, auto-detect, and reduced motion. Output goes to
  `.artifacts/` (not committed). `--build` writes the page without running it.

## Not verified on a device

- The drawings are from how One UI, Pixel and stock Android word and lay out Settings, not from a
  capture of each. Exact row names differ by OS version.
- Whether the Settings deep links land where the steps say on each phone, and what happens to our app
  when the person goes to Settings and comes back (auto-detect covers the return).
- The "Allow restricted settings" menu on Android 13+ for a sideloaded build.
- The real accessibility dialog wording; the drawn one is approximate.
- Font scale 1.3 and 360x640 were checked in a browser, not on a phone.
