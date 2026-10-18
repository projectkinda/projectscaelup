# Focus coach notes rebuild

The coach now explains its recent observations with one headline, up to three ranked notes, a small proof visual under each note, an active weekly test, and a paid next step. Free users see one note and a single hint-only upgrade row. Users with fewer than five valid sessions see progress and the remaining-session count.

## Files changed in this rebuild

- `src/domain/focusCoach.ts`: note types, named evidence gates, last-12 analysis, ranking, headline, remaining count, and paid next step.
- `src/domain/focusCoachCopy.ts`: all narrative and visual copy; database access deferred until legacy persisted copy is requested.
- `src/domain/focusCoachCopyRules.ts`: hint-only locked-row copy; obsolete tile formatter removed.
- `src/domain/focusCoachCardSections.ts`: too-early, paid, and free selection; no old tile exports.
- `src/data/focusCoachRepository.ts`: earliest Android app-event label through the existing flagged-app join, custom mode names, defensive fallbacks, and entitlement passed to the engine.
- `src/components/FocusCoachCard.tsx`: new standalone card, note icons, all four proof visuals, experiment and next-step rows.
- `src/components/focusCoachPresentation.ts`: retains the used experiment-day helper; removes unused sparkline and tile helpers.
- `src/screens/HistoryScreen.tsx`: mounts the new card and passes the existing paid gate; removes the tile UI. The screen's existing top chart and paywall sheet remain.
- `scripts/coach-check.ts`: preserves applicable engine/copy regressions and replaces obsolete tile tests with note and repository fixtures.
- `docs/focus-coach-notes-review.md`: this report.
- `docs/focus-coach-notes-preview.png`: browser preview at 360px and simulated font scale 1.3, with illustrative fixture data.

HomeScreen and the subscription gate were not edited in this rebuild. Earlier timer work and earlier coach edits outside this request were preserved.

## Verification

- Starting point: read AGENTS.md and CLAUDE.md, reviewed the exact Expo v57 reference (including SVG), git pull already up to date, TypeScript and existing coach checks passed.
- `npx tsc --noEmit`: PASS after the rebuild.
- `npx --yes tsx scripts/coach-check.ts`: all 78 applicable checks PASS. New fixtures cover every note below/at/above its gate, source/share boundaries, weak flags, custom and built-in mode labels, package/iOS fallbacks, quartiles, last-12/latest-platform scope, ranking/cap, headline precedence, early progress, paid next steps, free payload privacy, experiment activity, and copy lint.
- An in-memory SQLite fixture executes the real repository SQL and verifies earliest-app ordering, custom mode labels, and graceful label-query failures.
- Compared every existing result field with the pre-rebuild engine across 104 input scenarios: identical. Existing focus, improvement, suggestion, and away thresholds were preserved.
- Browser review: 16 rendered cases at 360 CSS pixels, covering font scales 1 and 1.3, paid/free/too-early/empty states and every proof visual. No measured overflow, clipped text, or overlapping notes. Clicking the free hint row called the paywall action. Used the real card, engine, copy, theme and Geist fonts with React Native Web; font sizes/line heights were scaled explicitly, font loading was stubbed, and SVG icons used browser wrappers.
- Expected warnings come from deliberate error-handling fixtures and Node's experimental SQLite implementation.

## Deviations and limits

- The next-step row has no Set timer button. Current navigation accepts screen names, while timer selection lives inside HomeScreen. Passing a selected duration needs new navigation/state plumbing; this was explicitly optional and Home's suggestion behavior remains intact.
- Normal-size headlines and note sentences have a three-line cap. At enlarged font scales the cap is removed and text/next steps wrap, preserving the full sentence at 360dp.
- Notes retain the required ranking, so a trigger note comes before a timing note even though the mockup puts timing first. Actual counts and durations replace the mockup's illustrative values.
- Best-window evidence uses the existing diagnosis algorithm within the recent 12-session sample and compares the winning bucket with the worst populated bucket. Its existing weak rule is preserved. Improvement headlines require both existing improvement thresholds (absolute duration and percentage), using the earlier trend window.
- Observed slips exclude pause-overrun endings, consistent with the existing break-source analysis; a pause is not described as a phone or camera distraction.
- Unreadable, opaque, over-budget, or unsafe labels fall back to your phone for apps and suppress the mode note for modes. iOS always uses generic app wording.
- Rest notes remain an Early read within a 12-session sample because their requested minimum gate is 10 sessions and stronger evidence requires twice that gate.
- Native Android/iOS rendering, native font scaling, and VoiceOver/TalkBack were not verified on a device. Browser checks approximate layout and interactions; SQL checks use in-memory SQLite, not a device database.

## User-facing string templates: old to new

Braced values below describe substitutions in this report. Runtime copy contains no raw placeholders. Duplicate uses share a row. Unchanged legacy copy fields remain available but are no longer rendered as the History card footer.

| Context | Old | New |
| --- | --- | --- |
| Eyebrow | Focus coach | Focus coach (retained) |
| Evidence | Last {n} sessions under the trend tile | Last {evidenceCount} sessions in the eyebrow; Last 1 session when singular |
| Early headline | Your coach unlocks after {target} focus sessions | Too early to spot a pattern. |
| Early record | Longest clean stretch so far: {duration} | Removed from the early state |
| Early progress accessibility | Sessions toward your typical stretch: {done} of {total} | {done} of {total} focus sessions completed. |
| Remaining count | No separate line | {n} more sessions / 1 more session |
| Minimum-length footnote | Sessions shorter than {duration} don't count toward your coach. | Sessions shorter than {duration} don't count. |
| Header metric | {duration} / typical clean stretch | Your typical clean stretch is {approx current}. |
| Header comparison | {signed duration} / vs earlier | Removed; the headline explains a significant change |
| Timing headline | No equivalent | You hold focus for about {approx typical}, then something pulls you out. |
| Improving headline | Clean stretches are up {delta} from earlier. / Clean stretches are up {delta} lately. | Your clean stretches are getting longer. |
| Declining headline | Clean stretches dipped {delta} lately. A shorter session may help. / Clean stretches are down {delta} from earlier. | Your clean stretches have been shorter lately. That happens. |
| Steady headline | Clean stretches are steady. Keep the next session simple. / Clean stretches are holding steady lately. | Your typical clean stretch is {approx current}. |
| Empty-pattern hint | No equivalent | More patterns show up after a few more sessions. |
| Trigger note, readable app | What breaks it / Phone apps / {share}% of first slips | {Source} pulled you out in {hits} of your last {total} sessions. |
| Trigger note, generic phone | What breaks it / Phone apps | Your phone pulled you out in {hits} of your last {total} sessions. |
| Trigger note, camera | What breaks it / Looking away | You looked away from the screen in {hits} of your last {total} sessions. |
| Timing note, under one minute | First slip / Early / at {duration} | Your slips usually start within the first minute. |
| Timing note, one minute or more | First slip / Early or Late / at {duration} | Your slips usually start around minute {minute}. |
| Best-window note | Best time of day / {Mornings, Afternoons, Evenings} / +{duration} cleaner | {Mornings, Afternoons, Evenings} are your best. You stay clean about {difference} longer than in the {morning, afternoon, evening}. |
| Shorter-length note | No equivalent | Your ~{shortMin}-minute sessions stay clean more often than your ~{longMin}-minute ones. |
| Longer-length note | No equivalent | Your longer sessions (~{longMin} min) hold up better than your ~{shortMin}-minute ones. |
| Mode note | No equivalent | {Mode} sessions run cleaner than {Mode}. |
| Longer-rest note | Away-insight text was outside the compact card | After a longer break you stayed clean for about {diff}% more of the session. |
| Shorter-rest note | Away-insight text was outside the compact card | After a shorter break you stayed clean for about {diff}% more of the session. |
| Similar-rest note | Break-length commentary outside the compact card | You stayed clean about as often after shorter and longer breaks. |
| Consistency note | No equivalent | You focused on {k} of the last 7 days. |
| Seven-day consistency | No equivalent | You focused every day this week. |
| Weak evidence | Early signal | Early read |
| Window next step | Try next: {N} min | Try {N} min in the {morning, afternoon, evening}. |
| Repeat next step | Try next: {N} min | Try {N} min. Same as last time. Build on it. |
| Step-up next step | Try next: {N} min | Try {N} min. Your last 3 stayed clean. Add 5 min. |
| Capped/rounded step-up next step | Try next: {N} min | Try {N} min. Your last 3 stayed clean. |
| Shorter next step | Try next: {N} min | Try {N} min. Last 2 slipped. Shorter is fine. |
| Floor next step | Try next: {N} min | Try {N} min. A short start is fine. Build from here. |
| Weekly test, breaks | This week's test / 5 min breaks / between sessions / Day {d} of 7 | This week's test: 5 min breaks. Day {d} of 7. |
| Weekly test, morning | This week's test / One morning session / to test your timing / Day {d} of 7 | This week's test: one morning session. Day {d} of 7. |
| Weekly test, shorter | This week's test / Shorter sessions / to protect your focus / Day {d} of 7 | This week's test: shorter sessions. Day {d} of 7. |
| Weekly test, phone | This week's test / Phone out of reach / during sessions / Day {d} of 7 | This week's test: phone out of reach. Day {d} of 7. |
| Test-dot accessibility | Test days elapsed: {done} of 7 | This week's test: {short experiment}. Day {d} of 7. |
| Hidden notes | Separate locked tiles with A session pattern, A session breakdown, Time away, A time-of-day pattern | {k} more notes / 1 more note, with only the remaining note icons |
| Hidden weekly test | A weekly test in its own locked tile | A weekly test inside the same locked row |
| Combined locked row | Unlock {tile hint} | {k} more notes followed by a middle dot and A weekly test (omit absent parts) |
| Slip-bar accessibility | Last-session clean/focus and first-distraction summary | Slips usually start after {typical} of a {maximum} session. |
| Trigger-dot accessibility | No equivalent | {hits} of your last {total} sessions had this first distraction. |
| Time-bar accessibility | Clean stretch per session: {durations} | {label}: {duration} clean, separated by semicolons for each bucket |
| Percent-bar accessibility | No equivalent | {label}: {percent}% clean, separated by semicolons for each group |
| Weekly-dot accessibility | No equivalent | {k} focus days in the last 7 days; the last dot is today. |
| Slip-bar axis | No equivalent | 0 and {approx planned duration} |
| Time-bar labels | Mornings / Afternoons / Evenings | Morning / Afternoon / Evening |
| Length-bar labels | No equivalent | Shorter / Longer |
| Rest-bar labels | No equivalent | Short break / Long break |
| Mode-bar labels | No equivalent | Resolved built-in or custom display names |
| Percent labels | No equivalent | {rounded value}% |
| Weekly initials | No equivalent | S / M / T / W / T / F / S, rotated to the last seven local days |
| Old trend tile | Clean stretch per session / {first duration} / {last duration} / Last {n} sessions | Removed; note-specific proof replaces the sparkline |
| Old last-session tile | Last session / {duration} clean / of {focus} / Slipped at {m:ss} / phone / looked away / No slips | Removed; timing and trigger notes describe recurring observations |
| Old away tile | Time away / ~{duration} or {duration}+ / from your flagged apps | Removed; verified rest comparisons become rest notes |
| Legacy footer variants | This week: {experiment}. / Next: {experiment}. / Your typical clean stretch is {now}. Next: {suggested}. / Clean stretches dipped lately. Next: {suggested}. / Clean stretches are up lately. Next: {suggested}. | Retained in legacy result fields; not shown in the new card |
| Legacy building-copy variants | {n} of 5 sessions to find your typical clean stretch. / {n} of 5 sessions in. A few more will make this useful. / {n} of 5 sessions logged for your typical clean stretch. | Retained in legacy result fields; the early card uses its headline and remaining count |
| Legacy fallback footer | Your typical clean stretch is {now}. | Retained in legacy result fields; the new headline uses the approximate duration |
| Home suggestion label and captions | Try {N} min, with the existing reason caption and accessibility label | Unchanged |
| Loading label | Loading coach | Loading coach (retained) |
