# Focus coach copy and layout review

Changed the suggestion floor to 5 minutes and exposed the reason without changing the branch thresholds or rounding. History uses the typical stretch, labels its comparisons, and lays out every available tile in pairs with a full-width final tile. The weekly test now belongs to the grid.

## Files changed

- `src/domain/focusCoach.ts`
- `src/domain/focusCoachCopy.ts`
- `src/domain/focusCoachCopyRules.ts`
- `src/domain/focusCoachCardSections.ts`
- `src/screens/HistoryScreen.tsx`
- `src/screens/HomeScreen.tsx`
- `src/components/focusCoachPresentation.ts`
- `scripts/coach-check.ts`
- This report: `docs/focus-coach-copy-changes.md`

Existing live-timer edits in HomeScreen, App.tsx, and other files were preserved.

## Verification

- Read AGENTS.md, CLAUDE.md, and the Expo SDK v57 documentation before editing. Git pull: already up to date.
- `npx tsc --noEmit`: PASS.
- `npx --yes tsx scripts/coach-check.ts`: all fixtures PASS, including suggestion reasons, 40-character caption limits, every state-template ? experiment pair, generated copy, forbidden wording/placeholders, and 3/4/5-tile row composition. The deliberate error-handling fixtures emit expected warnings.
- Browser review: rendered the actual coach component and styles using React Native Web at 360 CSS pixels with text sizes and line heights multiplied by 1.3, real Geist fonts, Android section selection, and both paid and free variants for 3, 4, and 5 tiles. Used stubbed font loading and SVG wrappers. Checked overflow; inspected the screenshot. Found and fixed the time-away value clipping.
- Native Android font scaling and touch/accessibility behavior were not verified on a device or emulator. No Android device was connected. The browser review is a layout approximation, not a native Android run.

## Changed user-facing strings

Placeholders below describe runtime substitutions; rendered app copy contains no raw placeholders. Duplicate occurrences share a row. Tests use corresponding updated example text.

| Location | Old | New |
| --- | --- | --- |
| Footer ? building_baseline 1 | {n} of 5 sessions to find your baseline. | {n} of 5 sessions to find your typical clean stretch. |
| Footer ? building_baseline 3 | {n} of 5 sessions logged for your baseline. | {n} of 5 sessions logged for your typical clean stretch. |
| Footer ? steady 1 | Your baseline is forming around {now}. Try to {experiment} this week. | This week: {experiment}. |
| Footer ? steady 2 | You are holding near {now}. Suggested next length: {suggested}. | Your typical clean stretch is {now}. Next: {suggested}. |
| Footer ? steady 3 | Current clean length is {now}. Keep the next session simple: {experiment}. | Next: {experiment}. |
| Footer ? slipping 1 | This looks like a rougher stretch: {now}, down from {before}. Try to {experiment}. | Clean stretches dipped lately. Next: {suggested}. |
| Footer ? slipping 2 | Clean time is softer right now at {now}. Suggested length: {suggested}. | Your typical clean stretch is {now}. Next: {suggested}. |
| Footer ? slipping 3 | A rougher stretch so far: {now} now, {before} before. Try to {experiment}. | This week: {experiment}. |
| Footer ? improving 1 | Clean time is moving up: {now}, from {before}. Suggested length: {suggested}. | Clean stretches are up lately. Next: {suggested}. |
| Footer ? improving 2 | You are trending upward so far. Current clean length: {now}. | Your typical clean stretch is {now}. Next: {suggested}. |
| Footer ? improving 3 | Nice upward pattern: {now} now, {before} before. Try to {experiment} next. | Next: {experiment}. |
| Footer ? plateau 1 | Clean time is steady at {now}. A small experiment: {experiment}. | This week: {experiment}. |
| Footer ? plateau 2 | You are around {now}. Suggested next length: {suggested}. | Your typical clean stretch is {now}. Next: {suggested}. |
| Footer ? plateau 3 | This looks stable so far. Current clean length: {now}; try to {experiment}. | Next: {experiment}. |
| Headline ? up 1 | Your clean focus is up {delta} compared to your 3 sessions before. | Clean stretches are up {delta} from earlier. |
| Headline ? up 2 | Clean focus is up {delta} lately. | Clean stretches are up {delta} lately. |
| Headline ? down 1 | Your clean focus is down {delta} compared to your 3 sessions before. | Clean stretches dipped {delta} lately. A shorter session may help. |
| Headline ? down 2 | Clean focus is down {delta} lately. | Clean stretches are down {delta} from earlier. |
| Headline ? steady 1 | Your clean focus is steady compared to your 3 sessions before. | Clean stretches are steady. Keep the next session simple. |
| Headline ? steady 2 | Clean focus is holding steady lately. | Clean stretches are holding steady lately. |
| Footer experiment | take a 5 minute break between sessions | take a 5 min break between sessions |
| Home reason ? step_up | ? | Your last 3 stayed clean. Add 5 min. |
| Home reason ? repeat | ? | Same as last time. Build on it. |
| Home reason ? ease_down | ? | Last 2 slipped. Shorter is fine. |
| Home reason ? floor | ? | A short start is fine. Build from here. |
| Home reason ? clamped step-up | ? | Your last 3 stayed clean. |
| Home chip / suggestionCopy | Suggested: {N} min | Try {N} min |
| Home accessibility | Use suggested {N} minute session | Use suggested {N} minute session. {reason caption} |
| History chip | Next: {N} min | Try next: {N} min |
| History metric caption | clean focus | typical clean stretch |
| History comparison | {signed duration} in Trend tile | {signed approximate duration} ? vs earlier, beside the header metric |
| Fallback footer | Current clean length is {now}. | Your typical clean stretch is {now}. |
| Suggestion fallback slot | after baseline | after 5 sessions |
| Building state accessibility | Baseline sessions | Sessions toward your typical stretch |
| Building state record | Best clean focus so far: {duration} | Longest clean stretch so far: {duration} |
| Trend title | Trend | Clean stretch per session |
| Trend endpoints | ? | {first duration} / {last duration} |
| Trend caption | ? | Last {n} sessions |
| Trend accessibility | Clean focus trend: {durations}; suggested goal {N} minutes | Clean stretch per session: {durations} |
| Last-session value | {compact duration} clean | {formatted duration} clean |
| Last-session caption | ? | of {focus duration} |
| Last-session slip | ? | Slipped at {m:ss} |
| Last-session slip type | ? | ? phone / ? looked away |
| Last-session no distraction | ? | No slips |
| Last-session end badge | Away / App / Pause / Stopped | Removed; slip line explains the first distraction |
| Last-session accessibility | Last session: {clean} clean of {focus} focus, first distraction at {time} / no distraction | Last session: {clean} clean of {focus} focus. {slip line} |
| Away title | Away | Time away |
| Away value qualifier | about / at least (separate line) | ~{duration} / {duration}+ (inside value) |
| Away caption | since last use | from your flagged apps |
| Diagnosis title | Best window / Pattern | Best time of day / First slip / What breaks it |
| Diagnosis value | Apps / Away / Timing | Phone apps / Looking away (Mornings, Afternoons, Evenings, Early and Late retained) |
| Diagnosis caption | +{compact duration} cleaner | +{approximate duration} cleaner |
| Diagnosis caption ? slip timing | ? | at {approximate first-slip duration} |
| Diagnosis caption ? source | ? | {share}% of first slips |
| Diagnosis caption ? fallback | ? | Common first slip |
| Diagnosis evidence tag | Early | Early signal |
| Experiment title | Experiment (standalone strip) | This week?s test (grid tile) |
| Experiment day accessibility | Experiment days elapsed | Test days elapsed |
| Experiment day caption | ? | Day {d} of 7 |
| Experiment ? morning | One morning session | One morning session / to test your timing |
| Experiment ? shorter | Slightly shorter sessions | Shorter sessions / to protect your focus |
| Experiment ? phone | Phone out of reach | Phone out of reach / during sessions |
| Experiment ? break | 5 min breaks between sessions | 5 min breaks / between sessions |
| Locked trend hint | Trend | A session pattern |
| Locked session hint | Session | A session breakdown |
| Locked away hint | Away | Time away |
| Locked diagnosis hint | Pattern | A time-of-day pattern |
| Locked experiment hint | Experiment | A weekly test |
| Locked tile titles | ? | Same section titles as the grid; no real values |
| Removed footer suffix | The first break tends to arrive early, so shorter sessions may be easier to protect. | Removed; diagnosis details live in the tile |
| Removed footer suffix | The first break tends to come late, so you are close to finishing most sessions clean. | Removed; diagnosis details live in the tile |
| Removed footer suffix | Some times of day are cleaner than others, so timing may matter. | Removed; diagnosis details live in the tile |
| Removed footer suffix | Flagged apps are the most common first break, so distance from the phone may help. | Removed; diagnosis details live in the tile |
| Removed footer suffix | Camera absence is the most common first break, so a shorter target may fit better. | Removed; diagnosis details live in the tile |
| Removed footer suffix | Last week's experiment helped. | Removed to keep the footer within 90 characters |
| Removed footer suffix | Last week's experiment did not clearly help. | Removed to keep the footer within 90 characters |
| Removed footer suffix | Last week's experiment needs more sessions before it says much. | Removed to keep the footer within 90 characters |
| Removed footer prefix | So far,  | Removed with the diagnosis suffix |
| Away-insight footer suffix | {away insight sentence} | Removed from footer; insight formatter and data retained |
