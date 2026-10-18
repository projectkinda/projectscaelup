# Release Checklist

- Set `DEV_FLAGS.tierSwitcher = false`; set `forcePaidUser = false`.

- [ ] Android live timer: merged manifest permissions reviewed (`POST_NOTIFICATIONS`,
  manifest-only `POST_PROMOTED_NOTIFICATIONS`); no new foreground service or exact-alarm permission.
- [ ] Android live timer tested on API 33+: allow/deny (maximum two attempts), shade
  countdown, notification tap, pause/resume/overrun, normal/early end, extension,
  background process kill, orphan cleanup on relaunch, reboot and silent channel.
- [ ] Android 16 / Samsung One UI 8 Live Update chip checked where supported/enabled;
  normal notification fallback and secret lock-screen visibility checked.
  Follow [android-live-timer.md](android-live-timer.md) and record any OEM limitation.

- [ ] Android app rules: dev test panel hidden in release (`__DEV__` false and `DEV_FLAGS.tierSwitcher=false`).
- [ ] Play accessibility declaration describes app blocking for schedules and shared daily limits; no window-content retrieval is enabled.
- [ ] App rules overlay permission allow/deny/revoke/regrant flow tested on Samsung and Pixel; run and record the device checklist in [app-rules.md](app-rules.md).

- DEV_FLAGS.tierSwitcher = false hides ALL test tools (tier switcher, coach sample data, coach seeding, app rule test buttons, picker diagnostics); confirm none appear in Settings in the release APK.
