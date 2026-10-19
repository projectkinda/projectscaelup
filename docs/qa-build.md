# Standalone Android QA build

QA is a release-style, non-debuggable Android APK with embedded production JavaScript/Hermes. It needs no Metro connection. All test surfaces use the same tierSwitcher flag and are ON: tier override, Coach seeding/sample controls, App rules controls, picker diagnostics, live-timer style switching and dev-only paywall text. Force-paid and onboarding reset/preview remain false; choose the tier in Settings.

**Never upload this build to a store.** It is signed with the repository's debug keystore, has package id **com.projectscaleup.app.qa**, version suffix **-qa**, and launcher label **ScaleUp QA**. It installs alongside the regular com.projectscaleup.app app and has separate app data, settings, permissions and notification channels.

With Node, Java and the Android SDK configured, run from the repository root:

```sh
npm run build:qa
```

Windows also supports `scripts/build-qa-apk.ps1`; macOS/Linux supports `sh scripts/build-qa-apk.sh`. Both use the same helper. It sets EXPO_PUBLIC_TEST_TOOLS=1 only in the Gradle child process, runs :app:assembleQa, never runs clean, and never copies/deletes the regular release/debug outputs. QA inherits release minify/shrink configuration and uses release fallbacks for dependencies. The helper scopes a 4 GiB Java heap and two Gradle workers to QA to accommodate first-time dex merging; it does not change Gradle properties or release settings.

The standard intermediate APK is `android/app/build/outputs/apk/qa/app-qa.apk`. The helper copies it to **artifacts/qa/ScaleUp-qa-<versionName>-<yyyyMMdd-HHmm>.apk**, prints the full path and size, and keeps the newest three QA APKs. APKs and build reports under artifacts/ are gitignored.

Install the printed path (USB debugging / adb required):

```sh
adb install -r "artifacts/qa/<printed-apk-name>.apk"
```

In **Settings ? Testing ? Restart onboarding**, replay setup from the welcome screen. This keeps saved apps, modes, history and existing OS permission grants. Finish any running session first. The action is available in Android QA/debug only.

Launch **ScaleUp QA** from the phone. No USB, Wi-Fi or development server is needed after installation. Accessibility, overlay, notification and camera grants are separate from the real app; enable them for QA as needed. To uninstall only QA: `adb uninstall com.projectscaleup.app.qa`.

Run **npm run verify:qa** after a build. It checks resolved QA flags/test surfaces in the exact Metro bundle saved before Hermes, native QA flags, non-debuggable status, package/label/version with aapt, the embedded bundle, release flags and rendered controls in QA/release. The build helper records release/debug output timestamps and SHA-256 before and after QA in `artifacts/qa/build-report.json` and fails if they change. A release bundle still fails unless every DEV_FLAGS value is false; its existing `release-proof/release-flags.json` path and pass line are unchanged.

Native identity audit: own-app rule denylist now uses BuildConfig.APPLICATION_ID. Accessibility components, overlay settings URIs, launcher intents, picker self-filtering and live-timer RemoteViews already use context.packageName / explicit component classes. Notification channels, preferences and pending intents are package-scoped and retain their existing IDs. Android has no app-specific deep-link scheme to update; merged FileProvider authorities and generated receiver permissions use applicationId. Kotlin package declarations stay in the original namespace. The app's new native TEST_TOOLS_ENABLED flag enables picker logs for QA while remaining false in release.

The release build type, package id, signing guards and normal release output paths are unchanged. Gated test code/strings can remain in a release bundle; controls are absent at runtime, verified by the resolved false flag and rendered-surface regression checks.
