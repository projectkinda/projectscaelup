# Security and privacy review

**Date:** 2026-09-27 · **Scope:** the app on `main` at `041ab64` (iOS in depth; Android findings noted for its owner) · **Reviewer:** iOS

**Result:** no data leaves the device, no secrets are in the repo, and the iOS build is ready for App Store privacy review. One high-priority Android issue was found: every presence photo is saved to disk and never deleted.

## Findings

| # | Severity | Platform | Finding | Status |
|---|---|---|---|---|
| 1 | **High** | Android | Presence photos are written to disk and never deleted. `takePictureAsync` saves each shot as a JPEG in the app's cache before returning base64, and nothing removes it. At one photo per 1.5 s, an hour-long session leaves ~2,400 photos of the user's face on the phone. | **Open (Android owner)** |
| 2 | Medium | Android | `presenceModule.ts` `reportFrame` logs `[presence-debug]` on every frame, including in release builds. | Open (Android owner) |
| 3 | Low | iOS | App Store export-compliance flag missing, so App Store Connect would ask the encryption question on every upload. | **Fixed:** `ITSAppUsesNonExemptEncryption = NO` (the only crypto is a SHA-256 hash to label apps, which is exempt) |
| 4 | Low | Build tooling | High advisory in `@xmldom/xmldom` 0.7.13, pulled in by `@bacons/apple-targets` → `@bacons/xcode` → `@expo/plist` 0.0.18. Build-time only, and it only parses our own files. | **Fixed:** pinned to 0.8.15 with a scoped `overrides` entry. The generated iOS project is byte-identical before and after. |
| 5 | Info | Build tooling | 12 moderate advisories, all in Expo's build tools (`@expo/cli`, `xcode` → `uuid`). None ships in the app. | Accepted; resolves with Expo updates (SDK 58) |
| 6 | Info | Both | expo-camera's barcode scanner (ZXing on iOS, ML Kit on Android) ships but is never used. | Optional joint change: `barcodeScannerEnabled: false` on the expo-camera plugin (affects both platforms) |
| 7 | Info | iOS | `NSAllowsLocalNetworking = YES` in Info.plist (Expo default, needed for development). The app makes no network requests, so there's no exposure. | Accepted |

**Suggested fix for #1 (Android):** delete each photo right after `reportFrame` (`new File(photo.uri).delete()`; install it with `npx expo install expo-file-system`, since it's currently only a transitive dependency), or better, analyse CameraX preview frames in Kotlin so no photo is ever taken. That's what iOS does: live frames with Apple Vision, nothing saved.

## What was checked

| Area | Result |
|---|---|
| Secrets in the (public) repo | None. `android/app/debug.keystore` is Android's standard public debug key. **Never commit a release keystore, `.p8`, `.p12` or provisioning profile.** |
| Network | No requests at all. The only outbound links open the App Store or Play Store subscription pages. |
| Deep links | The URL scheme `com.projectscaleup.app` has no handlers, so a link can't trigger any action. |
| Camera (iOS) | Live frames analysed on device with Vision; no photos, nothing written, no shutter. The camera runs only while the preview is on screen and the session isn't paused. |
| Screen Time (iOS) | App tokens never reach JavaScript or leave the device. App Group files use `completeFileProtectionUntilFirstUserAuthentication` and are written under `NSFileCoordinator`. |
| Data at rest | SQLite (sessions, distractions, modes, `app_use_log`) and App Group JSON, under iOS's default data protection. Android also stores the away-time heartbeat and native buffer in SharedPreferences. Raw `app_use_log` rows are retained for 30 days; derived session away-time metrics remain on the session row. Nothing leaves the device. |
| Permissions | One usage string (camera), requested in context. No microphone. Screen Time access is requested only from Settings. |
| Entitlements | Family Controls + App Group on the app and all three extensions; nothing else. |
| Privacy manifest | `NSPrivacyTracking = false`, no collected data types. Required-reason APIs (UserDefaults, file timestamp, boot time) come from bundled Expo/React Native libraries and are declared. Our own code adds none, and the extensions use none. |
| Native logging | Only file names are logged publicly; error details are redacted by default. |
| Release build | No dev launcher or network inspector in the Release app. |

## App Store privacy answers (current build)

- **Data collection:** *Data Not Collected.* Everything stays on the device. This changes when RevenueCat billing is added (purchase history, identifiers).
- **Tracking:** No.
- **Camera:** used on device to confirm presence; no images are stored or sent.
- **Screen Time (Family Controls):** used on device to track and lock the user's own flagged apps; nothing leaves the device. Apple's approval request asks for this description.

## Still needed before submission

- [ ] A **privacy policy URL**. The App Store and the Family Controls approval request both require one.
- [ ] Android owner: fix #1 and #2 (also relevant to Google Play's Data safety form).
- [ ] Re-run this review when billing (RevenueCat) or any network feature is added.
