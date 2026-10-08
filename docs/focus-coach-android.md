# Focus Coach: Android Notes

The coach rules engine, copy, History card, and Home suggestion chip are shared TypeScript. Paid coach surfaces stay behind `isPaidUser()` / `DEV_FLAGS.forcePaidUser`; no Android-specific coach engine or native code is required.

## Data Read By The Coach

The shared repository uses one coach query and reads only:

- `clean_seconds`
- `focus_seconds`
- `first_distraction_type`
- `pause_count`
- `ended_early`
- `duration_seconds`
- `mode_id`
- `platform`

A valid session has `clean_seconds IS NOT NULL` and `focus_seconds >= 120`. The engine filters to the latest platform before computing state, suggestions, and diagnosis, so Android and iOS histories are never mixed.

## Engine Behavior

- Current clean length is the median `clean_seconds` from the last 5 valid sessions.
- Previous clean length is the median of the 5 valid sessions before that.
- State is `building_baseline`, `steady`, `slipping`, `improving`, or `plateau`.
- Suggestions are based on the last 3 clean/planned ratios and are rounded to 5 minutes, clamped to the timer range of 10..59 minutes.
- `pause_overrun` counts toward clean length but is excluded from diagnosis and most-common-break tallies.
- Diagnosis can identify early breaks, late breaks, better time windows, flagged-app-heavy breaks, or camera-heavy breaks. Weak evidence is softened in copy.
- Weekly experiments are stored in `app_state` under `coach_experiment`; after 7 days the coach compares sessions since the experiment to the 5 before it.

## Android Differences

- Android app-touch timing is more precise because the usage monitor waits for a 30 second flagged-app visit and the accessibility service sees window changes.
- Android knows package names, but coach copy remains platform-neutral and never names an app.
- Add-time sessions can produce `clean_seconds / duration_seconds` above `1`; the engine accepts that.

## UI Behavior

- The coach is hidden when there are no valid sessions.
- Free users see baseline progress and, once ready, current clean length, plus a locked row that opens the paywall.
- Paid users see coach copy, state details, diagnosis, experiment copy, and the Home suggestion chip.
- The suggestion chip only sets the timer minutes on tap. It must not start or mutate an active session.
- Dev-only Settings seeding can insert and clear marked fake coach sessions for rising, plateau, slipping, and early-breaker patterns.

## Real-Phone Release Checks

- Pause, background for 6+ minutes, return: auto-resumed, `auto_resumed = 1`, monitors and lock back.
- Fast double-tap Pause: one `session_pauses` row and "1 left."
- Timer runs out, then End: no pause row.
- Third pause attempt is blocked with visible feedback.
- Long backgrounded pause records `first_distraction_type = 'pause_overrun'` and clean time ends at pause start. Check once with Doze or battery saver enabled.
- Five minute session with a flagged app for 60 seconds about 2 minutes in should record `clean_seconds` near 2 minutes plus 30 seconds. Camera absence should be within the mode grace.
- End Early keeps `ended_early = 1`, fills `clean_seconds`, and counts for coach if `focus_seconds >= 120`.
- History card and suggestion chip fit on small and large Android screens with gesture and 3-button navigation.
