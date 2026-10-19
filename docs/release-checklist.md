# Android release checklist

There is one release configuration: test tools are always off. Read [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) before changing the build. iOS bypass/flags, RevenueCat and restore/manage-subscription behavior are unchanged.

Testing with tools uses the debug build: run `npx expo run:android --variant debug` from the repository root.

## Store AAB: Harsha supplies signing credentials

No new keystore was created. The existing `android/app/debug.keystore` is for local testing only. Harsha runs these commands himself, outside the repository, and stores the prompted passwords securely:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.android-keys"
keytool -genkeypair -v -keystore "$env:USERPROFILE\.android-keys\project-scaleup-upload.jks" -alias project-scaleup-upload -keyalg RSA -keysize 2048 -validity 10000
```

Put these four values in user `~/.gradle/gradle.properties` or inject the same environment variables. Gradle properties take precedence. Use an absolute keystore path, preferably forward slashes on Windows:

```properties
RELEASE_STORE_FILE=C:/Users/<user>/.android-keys/project-scaleup-upload.jks
RELEASE_STORE_PASSWORD=<private store password>
RELEASE_KEY_ALIAS=project-scaleup-upload
RELEASE_KEY_PASSWORD=<private key password>
```

With Java/Android SDK configured, from the repository root:

```powershell
$env:NODE_ENV = 'production'
cd android
.\gradlew.bat :app:bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`. Missing any signing credential fails bundleRelease clearly before packaging; invalid credentials/files fail normal signing validation. Verify the upload certificate before uploading to Play internal testing. Enroll in Play App Signing: your upload key authenticates uploads, while Google manages the distribution signing key. Back up your key/passwords outside Git and restrict access. See [Android app signing](https://developer.android.com/studio/publish/app-signing).

Keystores (except the existing debug key) and local/signing properties files are gitignored. Never put credentials in repository Gradle properties files. versionCode remains **1**, versionName **1.0.0**, matching app.json version **1.0.0** (its Android versionCode is implicitly 1). **Increase versionCode for every Play upload.** R8/minify remains off.

## Local release APK

From the repository root, with Java/Android SDK configured:

```powershell
$env:NODE_ENV = 'production'
cd android
.\gradlew.bat :app:assembleRelease
```

The only APK destination is `android/app/build/outputs/apk/release/app-release.apk`; each build replaces it. Do not copy APKs into extra artifact folders. All four signing credentials select the release key; otherwise assembleRelease uses the existing debug key and prints a loud **NOT STORE-UPLOADABLE** warning. Debug signing never enables test tools in a release APK.

## Flag safety and debug workflow

`DEV_FLAGS.tierSwitcher = typeof __DEV__ !== 'undefined' && __DEV__`. forcePaidUser, resetOnboarding and iosOnboardingPreview remain false constants. All existing test surfaces/actions gate on DEV_FLAGS.tierSwitcher. Release startup removes the exact `test_tier_override` app_state key and clears its in-memory value.

The normal debug variant is debuggable and the React Native Gradle plugin skips embedded JS bundling for it. Expo's debug workflow starts Metro and requests development JS, where __DEV__ is true; tools render there. `assembleDebug` alone builds the native debug APK and needs Metro to run this app. No embedded debug variant is configured. A manually embedded production JS bundle would have __DEV__ false and would hide tools even in a debug APK; this is not worked around.

The live-timer library generates TEST_TOOLS_ENABLED=true for debug and false for release. The release notification ignores both leftover style_override and session_style, uses custom by default, and retains the standard-row fallback when custom rendering fails. Both generated variant BuildConfig files were checked.

`scripts/verify-release-bundle.cjs` inspects the exact Metro release JS before Hermes compilation and fails the build unless all four DEV_FLAGS resolve to false. It rejects unresolved expressions and any true flag. Proof: `android/app/build/release-proof/release-flags.json`, including resolved flags and Metro JS SHA-256. Expected pass line:

```text
PASS verify-release-bundle: all DEV_FLAGS are false (test tools OFF)
```

The obsolete environment switch is no longer read by app/build code. A separate real Metro release bundling regression check confirmed an old shell setting cannot enable tools; the final APK is built once after clean. No release-with-tools path exists.

## Merged release permission audit

Evidence: `android/app/build/outputs/logs/manifest-merger-release-report.txt` and `android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml`. Final manifest has exactly these 12 uses-permission entries; names below omit android.permission except the app-specific signature permission.

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

App.tsx + src JS/TS audit: **74 console calls before**, now **3 direct console sites** and **72 warnings routed through releaseLog.warn**. The three sites are the logger's two branches and a static coach-copy validation warning. Tools-off warnings retain a static diagnostic message and omit error/native/SQL payloads, paths, session records, usage, package names and user text. Development JS retains detail arguments for debugging. Dependency/native error logging was not globally stripped; harmless error context remains. `scripts/release-logging-check.ts` checks source call sites and executes both logger modes.

## Remaining user-visible integration gaps

| File | Current release behavior with tools off |
| --- | --- |
| src/screens/SettingsScreen.tsx, handleRestore | Restore Purchases displays: "RevenueCat is not connected yet. This button is ready for the restore call when billing is added." No restore or entitlement API is called. |
| src/screens/SettingsScreen.tsx, openSubscriptionManagement | Opens the generic https://play.google.com/store/account/subscriptions page on Android using Linking. No account/package-specific billing integration. |
| src/components/PaywallScreen.tsx / src/domain/purchases.ts | Upgrade to Pro is always visible and opens the launch-information Alert through beginProPurchase. Purchases coming soon is dev-only. No working purchase flow yet. |
| src/domain/paywall.ts, isPaidUser | Real entitlement check is still a stub returning false. With tools off and forcePaidUser=false, users resolve to free. This preparation does not make subscriptions functional. |

Removed only "RevenueCat entitlement check pending." from Current tier. Source TODOs about iOS app rules are comments, not rendered text; iOS is out of scope. Coach pending/progress/Coming up copy represents real progress gates, not unfinished integrations. Ordinary TextInput placeholders are intentional form guidance. No other unfinished TODO/TEMP/stub/coming-soon UI was found with tools off.

- [ ] replace beginProPurchase stub; Restore/Manage placeholders

## Verification and remaining device work

Passed: tsc --noEmit and every scripts/*check.ts script. Tests cover actual Settings/paywall rendered trees for development/release flags, ignored obsolete environment settings, exact stored override removal, fixture guards, native style guards and all-false bundle validation. Both generated live-timer BuildConfig variants were inspected. App and live-timer Gradle clean removed old outputs and the previous extra APK copies/logs were deleted. Final build evidence and size are reported with the standard output path only.

No Android device/emulator was connected. Render tests mock React Native/bridges and do not prove hardware behavior. Before uploading:

- [ ] Install the release APK over a prior test installation: confirm every test surface is absent, the saved paid override is cleared, and stale notification preferences cannot change the custom row.
- [ ] Run the debug app with Metro development JS: confirm all testing tools appear and work.
- [ ] Test presence camera, private file/cache cleanup, local completion chime and haptics on supported Android versions.
- [ ] Test notification allow/deny (max two prompts), shade countdown, tap, pause/resume/overrun, early/normal end, extension, process kill, orphan cleanup, reboot and silent channel on API 33+. Check normal fallback and secret lock-screen visibility; check Android 16 / Samsung One UI 8 Live Update behavior where supported. Follow [android-live-timer.md](android-live-timer.md).
- [ ] Test app-rule schedules/daily limits and overlay allow/deny/revoke/regrant on Pixel and Samsung; follow [app-rules.md](app-rules.md). Verify specialUse service background/OEM behavior.
- [ ] Review backup/restore and complete privacy policy/Data safety based on observed SDK behavior.
- [ ] Supply real upload credentials, build/verify the signed AAB, complete Accessibility API and specialUse FGS declarations, then test Play-delivered splits. Actual release-key signing, AAB size and Play approval remain unverified. Existing purchase/restore integration gaps remain unchanged.

No screenshots, APKs, keystores or build outputs are committed.
