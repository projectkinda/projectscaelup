# Per-mode Home timer

Built-in defaults are Deep Work 50, Study 45, Creative Work 60, Meditation 10, Exam Prep 60, Online Class 60 and Exercise 30 minutes. The timer's previous minute maximum was 59, so the shared maximum is now 60 to support the requested hour-long defaults; seconds remain 0-59. The custom editor accepts whole minutes in the same 0-60 minute range. The existing zero-duration Start validation remains.

Custom modes persist defaultMinutes in custom_modes.default_minutes. Both fresh schema creation and the existing addColumnIfMissing migration use INTEGER NOT NULL DEFAULT 25. Existing rows are backfilled by SQLite without rebuilding the table, losing data or changing rowid/newest-first order. Re-running setup preserves configured defaults.

The shared create/edit editor adds Default session length between Name and Look-away allowance, with the requested helper copy. Name/allowance behavior is unchanged. Repository validation also rejects fractional or out-of-range defaults.

Timer resolution is explicit in src/domain/modeDurations.ts: current in-memory user edit, otherwise remembered last-started duration, otherwise the mode default. Values are stored as whole seconds, so remembered seconds survive. Merely visiting a mode does not write its default into memory. Therefore editing a custom default takes effect after reload/switch when there is no remembered or unsaved override. Existing user overrides retain priority as requested.

Home derives the value during the same render as the selected mode. It resets the timer wheels' internal display state with a key on mode/default/hydration changes, preventing stale digits from the previous mode without animating through intermediate numbers. The existing 220ms contentProgress transition remains. Initial timer content stays hidden until remembered settings are loaded. Unsaved tweaks and coach taps update only the current mode's in-memory value; they never persist by themselves.

Remembered values use the existing app_state table under modeDurationSeconds:<mode-id>. Only beginActiveSession writes them, after camera readiness completes; opening or canceling readiness does not save a new length. Deleting a custom mode deletes its remembered setting in the same transaction. Corrupt values are ignored; values above the selector maximum are clamped to 60:59. Free users use the same resolver and persistence for their available built-ins.

Verification:

- TypeScript clean.
- scripts/mode-durations-check.ts: pure remembered/default resolution, clamping, missing/deleted mode, per-mode memory and default-edit priority; real old-schema SQLite migration/backfill/idempotency; custom-default save/load/edit; last-started seconds; transactional preference deletion; actual-start-only wiring.
- scripts/custom-modes-check.ts: ordering and free-filter checks still pass against the updated schema/repositories.
- scripts/custom-modes-ui-preview.cjs: 14 browser cases / 150 checks pass at font scales 1/1.3, using production Home state/handlers, the real TimerSelector/TimeModule renderers, shared editor, and paywall host. Covers 10 -> 50 switching, unsaved A -> B -> A, starting at 25 and restoring 25 after remount, remembered seconds, other defaults, 60-minute defaults, coach tap semantics, configured/edited custom defaults, field validation, free behavior, first-render digits and slow initial settings loads. Gesture detection and repositories are fixtures; the actual-start persistence callback is invoked directly rather than running camera readiness or a full focus session.
- The updated app-rules integration browser preview passes 54 cases / 1,508 assertions with the new editor field. Existing paywall/gate, app-cap, typography, history and app-rules checks pass.

No device was connected. Native wheel gestures, camera/readiness-to-running transitions, keyboard behavior, content animation and on-device app relaunch/storage were not verified. Persistence/migration ran against real SQLite in memory and the UI checks ran in a browser. No screenshots are committed; generated previews stay in ignored .artifacts/.
