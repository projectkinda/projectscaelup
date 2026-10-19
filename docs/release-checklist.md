# Android release checklist

Android-only preparation, checked 2026-10-19. Read [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) before changing the build. iOS bypass/onboarding flags were left unchanged.

## Build configurations

From the repository root in PowerShell, with Java/Android SDK configured:

```powershell
$env:NODE_ENV = 'production'
Remove-Item Env:EXPO_PUBLIC_TEST_TOOLS -ErrorAction SilentlyContinue
cd android
.\gradlew.bat :app:assembleRelease
```

This is the store **configuration**, not necessarily a store-signed artifact. With no signing credentials, assembleRelease prints `NOT STORE-UPLOADABLE` and uses the existing debug key. With all four credentials it uses release signing. APK: `android/app/build/outputs/apk/release/app-release.apk`.

For a test APK, explicitly opt in before running the same command:

```powershell
$env:EXPO_PUBLIC_TEST_TOOLS = '1'
.\gradlew.bat :app:assembleRelease
```

Remove that variable before a store build. Do not set it to 1 in shared `.env` files. Public Expo variables are plaintext build configuration, never secrets. Expo's [environment variable documentation](https://docs.expo.dev/guides/environment-variables/) describes inlining. Both actual Gradle release bundling runs verified it here; no source-constant fallback was needed.

`scripts/verify-release-bundle.cjs` inspects the actual Metro JS before Hermes compiles it. It fails bundling if the resolved flag disagrees with the initial shell value, including a conflicting dotenv value. It also requires forcePaidUser/resetOnboarding/iosOnboardingPreview to remain false. Proof: `android/app/build/release-proof/test-tools.json`. Gradle tracks the switch as a bundle input so changing it invalidates the cached bundle. Both the app and live-timer native BuildConfig receive the same shell switch.

All test surfaces/actions use DEV_FLAGS.tierSwitcher, independently of debug/release: tier overrides, coach seeding/sample controls, app-rules fixtures, picker diagnostics, notification style toggle, and paywall disabled purchase block. Tools-on release JS retains the loud RELEASE WARNING. Tools-off startup removes the exact `test_tier_override` app_state key and clears the in-memory override. Native tools-off notification posting ignores both leftover style_override and session_style preferences and selects custom (with the existing standard-row fallback if custom rendering fails).

## Signing: Harsha runs these steps

No new keystore was created. No signing password or private key was added to the repository. Existing `android/app/debug.keystore` remains for local builds only.

1. Create a private directory outside the repository and generate an upload key yourself, keeping the prompted passwords in a password manager:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.android-keys"
keytool -genkeypair -v -keystore "$env:USERPROFILE\.android-keys\project-scaleup-upload.jks" -alias project-scaleup-upload -keyalg RSA -keysize 2048 -validity 10000
```

2. Put these values in your user `~/.gradle/gradle.properties` (or inject the same four environment variables in the build environment). Gradle properties take precedence. Use an absolute path, preferably forward slashes on Windows:

```properties
RELEASE_STORE_FILE=C:/Users/<user>/.android-keys/project-scaleup-upload.jks
RELEASE_STORE_PASSWORD=<private store password>
RELEASE_KEY_ALIAS=project-scaleup-upload
RELEASE_KEY_PASSWORD=<private key password>
```

3. Unset EXPO_PUBLIC_TEST_TOOLS, run `:app:bundleRelease`, verify the upload certificate, and upload `android/app/build/outputs/bundle/release/app-release.aab` to Play's internal testing track. Missing any credential fails bundleRelease before app packaging with the missing variable names. Invalid credentials/files fail normal Gradle signing validation.
4. Enroll in Play App Signing when setting up the app. The upload key authenticates uploads; Google manages the distribution signing key. Back up the upload key/passwords outside Git and restrict access. See [Android app signing](https://developer.android.com/studio/publish/app-signing).
5. Complete the declarations below and test the Play-delivered build before production rollout. Never upload the test-tools build or a debug-signed APK.

`*.jks`, `*.keystore` except the existing debug key, `local.properties`, `*.local.properties`, `local-*.properties`, key.properties, keystore.properties and signing.properties are ignored. Verified with git check-ignore; the debug keystore is the only tracked signing/local-properties file. Do not place secrets in other repository Gradle properties files.

Native versionCode remains **1**, versionName **1.0.0**, matching app.json's **1.0.0** (Expo's implicit Android versionCode is 1; app.json has no explicit android.versionCode). **Increase versionCode on every Play upload** and keep Expo/native versions aligned. R8/minify remains off; no size optimization was enabled.

## Build results and local artifacts

Both universal release APKs include all four configured ABIs and passed apksigner verification:

| Configuration | APK size | Compiled JS/native test flag | Signing |
| --- | ---: | --- | --- |
| Environment unset | 181,723,152 bytes (173.30 MiB) | false / false | Existing Android Debug certificate |
| EXPO_PUBLIC_TEST_TOOLS=1 | 181,723,156 bytes (173.30 MiB) | true / true | Existing Android Debug certificate |

Preserved, ignored local files: `.artifacts/release-builds/store-config.apk`, `test-tools.apk`, matching `*.flags.json` and native `*.BuildConfig.java` records, plus the store merged manifest. Build logs are `.artifacts/release-store.log` and `.artifacts/release-test-tools.log`. Standard Gradle output currently contains the last build (test tools ON); choose the explicitly named preserved APK for testing.

AAB size: **not available**. The attempted bundleRelease failed as required because all four signing credentials were absent; no AAB was produced by this work. Both APKs are **NOT STORE-UPLOADABLE**. No screenshots were committed.

## Merged release permission audit

Evidence: `android/app/build/outputs/logs/manifest-merger-release-report.txt` and the preserved store merged manifest. Final manifest has exactly these 12 uses-permission entries; names below omit android.permission except the app-specific signature permission.

| Permission | Manifest contributor(s) | App use / retention reason | Play / user action |
| --- | --- | --- | --- |
| CAMERA | App; expo-camera 57.0.5 | Foreground presence checks using LivePresenceCamera | Runtime permission, privacy policy and accurate Data safety disclosures |
| FOREGROUND_SERVICE | App | LockdownOverlayService calls startForeground for app blocking | FGS declaration with specialUse |
| FOREGROUND_SERVICE_SPECIAL_USE | App | Actual specialUse overlay service for focus blocks, schedules and daily limits | FGS specialUse review/declaration; subtype property now describes that work |
| INTERNET | App; expo-file-system 57.0.7; Google transport-backend-cct 3.1.0 | No direct app fetch/backend found. Dependency networking is present, so not proven unused and retained | Audit SDK collection/network behavior for Data safety; not a separate dangerous-permission prompt |
| MODIFY_AUDIO_SETTINGS | App; expo-audio 57.0.5 | No direct app routing call; SessionEndChoiceModal uses expo-audio for local completion chime. Retained conservatively for dependency audio/focus behavior | No dedicated restricted-permission form identified |
| SYSTEM_ALERT_WINDOW | App | LockdownOverlayService blocks selected apps with an overlay | Special-access settings grant; explain blocking/overlay use and complete applicable Console disclosures |
| VIBRATE | App; expo-haptics 57.0.3 | SessionEndChoiceModal calls Haptics.notificationAsync | No dedicated restricted-permission form identified |
| POST_NOTIFICATIONS | Local live-timer module | Session countdown notifications | Android 13+ runtime grant; existing maximum-two-attempt flow |
| POST_PROMOTED_NOTIFICATIONS | Local live-timer module | Existing promoted standard-notification path/test style and fallback | Manifest normal/appops permission, not a runtime request; verify OS/OEM support |
| ACCESS_NETWORK_STATE | Media3 exoplayer/common 1.9.0; Google transport backend/runtime 3.1.0 | Dependency connectivity checks, no direct app call | Include dependency behavior in Data safety review |
| WAKE_LOCK | Media3 exoplayer 1.9.0 | Dependency playback; no direct app wake-lock acquisition | No separate restricted-permission form identified |
| com.projectscaleup.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION | AndroidX core 1.18.0 | Generated signature permission protecting non-exported receivers | No user permission prompt / separate declaration |

Removed using tools:node="remove": READ_EXTERNAL_STORAGE and WRITE_EXTERNAL_STORAGE (previously maxSdkVersion 32). App file access uses bundled assets/private files and cache; no shared-storage/media-library access was found. Removed FOREGROUND_SERVICE_MEDIA_PLAYBACK and the unused expo-audio AudioControlsService: the app plays a local chime via useAudioPlayer, never activates lock-screen media controls or background playback. No mediaPlayback FGS is used. Keep chime and private-file smoke tests below outstanding until tested on hardware.

Retained FOREGROUND_SERVICE_SPECIAL_USE because the app actually starts that service. Added its required android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE description. The live timer itself is an ordinary notification, not an FGS; the camera is foreground UI. No camera FGS or exact-alarm permission was introduced.

`BIND_ACCESSIBILITY_SERVICE` is a permission on UsageTrackingAccessibilityService, not another uses-permission entry. App rules use AccessibilityService for foreground-app tracking/blocking; canRetrieveWindowContent remains false. This focus product is not declared an accessibility tool. Complete Play's Accessibility API declaration, prominent disclosure/consent, listing explanation and supporting demonstration as requested in Console. Complete the FGS declaration for specialUse with an accurate use case and demonstration; eligibility is subject to Play review. See [Accessibility API policy](https://support.google.com/googleplay/android-developer/answer/10964491?hl=en), [FGS declarations](https://support.google.com/googleplay/android-developer/answer/13392821?hl=en), and [specialUse service requirements](https://developer.android.com/develop/background-work/services/fgs/service-types#special-use).

## Backup and logging

allowBackup remains **true**. There are no custom fullBackupContent/dataExtractionRules exclusions in the app manifest. Subject to Android backup/transfer rules, private databases, ordinary files and preferences can include session/history/usage records, custom modes, flagged-app selections, app_state/settings, AsyncStorage values and native rule/timer preferences. Cache/code-cache/no-backup directories are excluded by Android defaults; cached camera frames should not be ordinary backup data. This pass did not change backup policy. See [Android Auto Backup](https://developer.android.com/identity/data/autobackup).

App.tsx + src JS/TS audit: **74 console calls before**, now **4 direct console sites** and **72 warnings routed through releaseLog.warn**. The four sites are the logger's two branches, the tools-on release warning, and a static coach-copy validation warning. Tools-off warnings retain a static diagnostic message and omit error/native/SQL payloads, paths, session records, usage, package names and user text. Tools-on builds retain detail arguments for debugging. Dependency/native error logging was not globally stripped; harmless error context remains. `scripts/release-logging-check.ts` checks source call sites and executes both logger modes.

## Remaining user-visible integration gaps (unchanged by request)

| File | Current release behavior with tools off |
| --- | --- |
| src/screens/SettingsScreen.tsx, handleRestore | Restore Purchases displays: "RevenueCat is not connected yet. This button is ready for the restore call when billing is added." No restore or entitlement API is called. |
| src/screens/SettingsScreen.tsx, openSubscriptionManagement | Opens the generic https://play.google.com/store/account/subscriptions page on Android using Linking. No account/package-specific billing integration. |
| src/components/PaywallScreen.tsx | Upgrade to Pro / Purchases coming soon block is absent when tools are off; Not now and close remain. No working purchase flow. |
| src/domain/paywall.ts, isPaidUser | Real entitlement check is still a stub returning false. With tools off and forcePaidUser=false, users resolve to free. This preparation does not make subscriptions functional. |

Removed only "RevenueCat entitlement check pending." from Current tier. Source TODOs about iOS app rules are comments, not rendered text; iOS is out of scope. Coach pending/progress/Coming up copy represents real progress gates, not unfinished integrations. Ordinary TextInput placeholders are intentional form guidance. No other unfinished TODO/TEMP/stub/coming-soon UI was found with tools off.

## Verification and remaining device work

Passed: tsc --noEmit; scripts/test-tools-check.ts (actual Settings/paywall rendered trees for flag off/on in debug/release, exact stored override removal, fixture guards and native style guards); scripts/release-logging-check.ts; custom-modes-check.ts; mode-durations-check.ts; app-rules-check.ts; coach-check.ts; history-check.ts; live-timer-check.ts. Actual release Metro proof records and generated native BuildConfig values agree for both APKs. Missing-credentials bundleRelease fails clearly. Keystore ignore rules and debug signatures verified.

No Android device/emulator was connected (`adb devices` empty). Render tests use mocked React Native/bridges; they do not establish on-device behavior. Before uploading:

- [ ] Install the store-config APK over a tools-on installation: confirm every test surface is absent, saved paid test override is cleared, and stale style_override/session_style cannot change the custom notification row.
- [ ] Install the test-tools APK: confirm all tools still appear and work; capture RELEASE WARNING in logs.
- [ ] Test presence camera, private file/cache cleanup, local completion chime and haptics after removal of storage/media-FGS permissions on supported Android versions.
- [ ] Test notification allow/deny (max two prompts), shade countdown, tap, pause/resume/overrun, early/normal end, extension, process kill, orphan cleanup, reboot and silent channel on API 33+. Check normal fallback and secret lock-screen visibility; check Android 16 / Samsung One UI 8 Live Update behavior where supported. Follow [android-live-timer.md](android-live-timer.md).
- [ ] Test app-rule schedules/daily limits and overlay allow/deny/revoke/regrant on Pixel and Samsung; follow [app-rules.md](app-rules.md). Verify the specialUse service stays healthy under background/OEM restrictions.
- [ ] Review backup/restore on the intended devices and complete privacy policy/Data safety from observed SDK behavior.
- [ ] Supply the real upload credentials, build and verify the signed AAB, complete Play declarations, then test Play-delivered splits. Actual release-key signing, AAB size, Play review and purchase/restore flows remain unverified/unimplemented as described above.
