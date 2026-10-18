# Coach pending notes and dev samples

Added dimmed pending rows with progress and a next action, capped the card at three note/pending rows, corrected factual attendance, and placed the paid experiment in its own surface block. Added development-only sample actions inside the existing tier-switcher panel.

## Files changed in this follow-up

- `src/domain/focusCoach.ts`: PendingNote, pending progress/order, shared verified-away measurement, and the requested two-day consistency gate with weak always false.
- `src/domain/focusCoachCopy.ts`: pending titles/hints, progress/accessibility copy, experiment title/day copy, sample-control labels.
- `src/domain/focusCoachCardSections.ts`: fills paid note slots with pending rows; shows pending to free users only when no notes exist.
- `src/data/focusCoachRepository.ts`: reads away opt-in defensively; sample previews avoid persisting experiment/copy changes.
- `src/components/FocusCoachCard.tsx`: outlined pending rows, conditional Coming up, no generic empty hint alongside pending, factual consistency without Early read, and the experiment surface.
- `src/data/coachSampleRepository.ts`: dev-only serialized transactional sample load/remove with owned-ID cleanup.
- `src/data/coachDataEvents.ts`: shared sample ownership key and data-refresh subscription.
- `src/components/DevCoachSampleControls.tsx`: guarded Load/Remove buttons with busy/error handling.
- `src/screens/SettingsScreen.tsx`: places the new controls in the dev tier-switcher panel.
- `src/screens/HistoryScreen.tsx`: refreshes coach and history after sample changes, including while the tab is hidden.
- `scripts/coach-check.ts`: retained applicable checks and added pending, sample lifecycle, and release-guard fixtures.
- `docs/focus-coach-pending-preview.png`: 360px preview at simulated font scale 1.3.
- `docs/focus-coach-pending-review.md`: this report.

Home timer behavior, the isPaidUser gate, real sessions, settings, and streak-writing behavior were preserved. The only existing gate changed was the explicitly requested consistency correction from one day to two days. All other thresholds/constants remain unchanged.

## Behavior details

Pending progress uses the existing note measurements and gate constants. Time-window progress is the smaller of the two largest time-bucket counts; length progress is the smaller length group, or zero when planned durations lack the existing minimum separation; mode progress is the second-largest mode count. Verified-away progress shares the same helper as away insights. Rest pending is omitted unless the platform is Android and away tracking is opted in.

A count can meet its minimum while another condition, such as a clear advantage or a recurring source, still fails. Such a row remains pending. Group comparisons show dots; breaks, verified-away sessions, and days show their units. Sorting uses need minus have, then the fixed note priority. Notes that passed their gates but were ranked below the top three are not misleadingly marked pending.

Paid users get notes first and enough pending rows to reach three content rows. Free users get pending rows only with zero real notes. Coming up appears only when both real and pending notes are visible. The too-early progress card stays unchanged.

The sample loader inserts sixteen sessions across thirteen elapsed days, including four of the last seven days, using Study and Deep Work. Ten-minute afternoon sessions are cleaner; twenty-five-minute morning sessions reach 16-18 clean minutes and evening sessions reach 7-9 clean minutes. The latest six include four primary-app distractions and two camera events. Timing settles near minute ten. Android samples include verified long/short away gaps; iOS samples leave away values null. App identifiers come from the user's flagged apps, or the requested Instagram/YouTube fallback identifiers. Settings are never seeded or changed.

Pauses, focus time, camera grace, clean time, end times, and child event rows match the real session-end derivation. Removal uses only IDs stored under dev_sample_session_ids and explicitly deletes their event/pause children before their sessions. Loading twice replaces the prior sample transactionally. Failed loads roll back; concurrent actions serialize. No legacy seed-clearing function is called.

Sample sessions participate in the normal chronological latest-platform window. Existing recent real sessions can affect the resulting ranking; samples never replace, modify, or hide real history.

## Verification

- Read AGENTS.md/CLAUDE.md and the Expo v57 SQLite documentation; git pull was already up to date.
- `npx tsc --noEmit`: PASS.
- `npx --yes tsx scripts/coach-check.ts`: all 87 checks PASS.
- Pending tests cover below/at-gate progress for all seven note types, non-count conditions, ordering/ties, zero/one/two/three note selection, free selection, Android/opt-in filtering, one versus two attendance days, and consistency never being weak.
- Copy checks enforce title <=40 characters, hint <=60 characters, forbidden-word/placeholder rules, progress units, and every new string.
- Sample tests use the actual schema/migrations and real sample repository against in-memory SQLite. They verify writer-consistent times/events, ownership, repeated/concurrent loads, rollback on failure, real flagged apps, fallback identifiers, iOS fields, release/tier guards, and exact restoration of all original application rows in sessions, pauses, distraction events, streaks, flagged apps, custom modes, and app_state.
- Browser review: 18 card cases at 360 CSS pixels with text scales 1 and 1.3; no measured overflow, clipped text, overlapping notes, incorrect Coming up labels, or extra note/pending rows. Used the real card, copy, engine, theme, and Geist fonts through React Native Web with explicit font scaling and SVG/font-loading test wrappers.
- Clicked both actual dev-control buttons in the browser. A local test bridge connected those actions to the real repository and real SQLite schema in an isolated in-memory database. Load returned top_trigger, slip_timing, and best_window; pending was empty with Android away opt-in enabled, confirming all seven gates passed. The three-note cap intentionally keeps lower-priority qualifying patterns off the card. Remove returned the original database snapshot exactly.
- Release compilation with __DEV__ false removes the dynamic sample-repository import and SQL implementation from the controls. Repository entry points also reject release builds and a disabled tier switcher. The existing release warning for the dev flag remains unchanged.
- Expected console warnings come from deliberate failure fixtures and Node's experimental SQLite implementation. The local test bridge was shut down after review.

## Deferred and unverified

Set timer is still omitted as permitted. Navigation currently accepts a screen name, while Home owns setMinutes/setSeconds locally. A selected-duration navigation payload or a callback/shared state would be new plumbing; the existing chip behavior remains intact.

Native Android/iOS UI, native font scaling, TalkBack/VoiceOver, and sample actions against a device database were not tested. Browser menu actions and the isolated SQLite lifecycle were tested; no user's live database was modified during verification.

## New user-facing strings

| Context | New string/template |
| --- | --- |
| Pending trigger title | What pulls you out most |
| Pending trigger hint | Shows up once it has seen a few breaks. |
| Pending timing title | When your focus usually breaks |
| Pending timing hint | Shows up once it has seen a few breaks. |
| Pending time-window title | Your best time of day |
| Pending time-window hint | Try sessions at different times of day. |
| Pending length title | Your best session length |
| Pending length hint | Mix short and long sessions, a few of each. |
| Pending mode title | Your best mode |
| Pending mode hint | Use a second mode a few times. |
| Pending rest title | Whether rest helps |
| Pending rest hint | Needs a few more sessions with away time tracked. |
| Pending attendance title | How regularly you focus |
| Pending attendance hint | Focus on another day this week. |
| Pending section label | Coming up |
| Break progress | {have} of {need} breaks seen |
| Verified-away progress | {have} of {need} sessions |
| Attendance progress | {have} of {need} days |
| Pending accessibility | {title}. Not available yet. {hint} Progress: {have} of {need}. |
| Experiment title | This week's test: {short experiment} |
| Experiment progress | Day {d} of 7 |
| Dev load action | Load sample sessions |
| Dev remove action | Remove sample sessions |
| Dev action error | Could not update sample sessions |
| Dev error guidance | Try again in a moment. |

Hint strings already end in a period, so accessibility copy adds no extra period. Existing short experiment labels, unlocked-note text, and next-step wording are reused.
