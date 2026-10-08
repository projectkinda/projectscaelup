# Focus Coach: Android Notes

The coach rules engine, copy, History card, and Home suggestion chip are shared TypeScript. They are gated by the existing paid-user stub, `DEV_FLAGS.forcePaidUser`; no Android-specific engine or native coach code is required.

## Data Read By The Coach

The coach reads only fields already present on `main`:

- `clean_seconds`
- `focus_seconds`
- `first_distraction_type`
- `pause_count`
- `ended_early`
- `duration_seconds`
- `mode_id`
- `platform`

The shared engine filters to eligible sessions with `focus_seconds >= 120`, then uses only the latest platform's sessions so iOS and Android histories are never mixed.

## Android Differences

- Android app-touch timing is more precise because the session usage monitor waits for a 30 second flagged-app visit and the accessibility service sees window changes.
- Package names are known on Android, but the current coach intentionally keeps copy platform-neutral.
- Add-time sessions can produce `clean_seconds / duration_seconds` ratios above `1`. The engine treats `0.9` or higher as clean and steps the suggestion up.

## Real-Phone Release Checks

- Pause, background for 6+ minutes, return: auto-resumed, `auto_resumed = 1`, monitors and lock back.
- Fast double-tap Pause: one `session_pauses` row and "1 left."
- Timer runs out, then End: no pause row.
- Third pause attempt is blocked with visible feedback.
- Long backgrounded pause records `first_distraction_type = 'pause_overrun'` and clean time ends at pause start. Check once with Doze or battery saver enabled.
- Five minute session with a flagged app for 60 seconds about 2 minutes in should record `clean_seconds` near 2 minutes plus 30 seconds. Camera absence should be within the mode grace.
- End Early keeps `ended_early = 1`, fills `clean_seconds`, and counts for coach if `focus_seconds >= 120`.
- History card and "Suggested: 25 min" chip fit on small and large Android screens with gesture and 3-button navigation.
- The chip only sets minutes when tapped. It must not start or mutate an active session.
