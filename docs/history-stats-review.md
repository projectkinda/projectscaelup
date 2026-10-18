# History weekly stat card

Replaced the three gradient stat tiles with one flat card: local Monday-Sunday strip, three icon-led integer stats, and one short coaching line. Its surface matches the focus coach: colors.module, colors.panelTop hairline border, 18px radius, 16px padding, and Geist. Other History cards and the LinearGradient import remain unchanged.

## Files changed

- `src/screens/HistoryScreen.tsx`: only StatRows, its imports, and its styles; removed the old day-unit formatter and tile-only gradient/shadow styles.
- `src/data/historyRepository.ts`: thisWeek and focusedToday; a completed-session completion-time query independent of the paid history cutoff.
- `src/domain/weekStrip.ts`: pure local-calendar week construction with optional explicit local day boundaries.
- `src/domain/historyStatCopy.ts`: pure bottom-line selector, labels, accessibility copy, and safe plain-integer formatting.
- `src/components/StatIcon.tsx`: decorative 18px outline flame, check-list, and trophy SVGs; only the flame uses amber.
- `scripts/history-check.ts`: week, copy, repository, zero-state, and sample fixtures.
- `docs/history-stats-preview.png`: preview at 360px with simulated font scale 1.3.
- `docs/history-stats-review.md`: this report.

## Verification

- Read AGENTS.md/CLAUDE.md and the exact Expo v57 documentation before editing. Git pull: already up to date.
- `npx tsc --noEmit`: PASS.
- `npx --yes tsx scripts/history-check.ts`: all 16 checks PASS.
- `npx --yes tsx scripts/coach-check.ts`: all 87 existing checks PASS.
- Week fixtures cover Monday, Sunday, month/year boundaries, no sessions, duplicates, exact day edges, future timestamps, and DST spring/autumn weeks. America/New_York boundaries produce 167-hour and 169-hour weeks while preserving seven local days.
- All five bottom-line rules pass, including singular/plural days and sessions. Zero-state data has seven empty day slots and three explicit zero stats.
- Repository fixtures run against the real schema with in-memory SQLite. They verify completed-only status, no minimum duration, completion-date attribution across midnight, legacy fallback, both paid/free paths, and zero state.
- Existing sample loading lights Monday, Tuesday, Thursday, and Saturday in the fixture week without stat-specific sample logic; removal returns the strip to empty. Streak counters remain untouched by samples.
- Browser review renders the actual StatRows, StatIcon, theme and Geist fonts through React Native Web at 360 CSS pixels and font scales 1 and 1.3. All 12 cases pass overflow/clipping, three-column alignment, icon-color and zero/large-number checks. Font sizes/line heights were explicitly scaled; SVG and font loading used browser test wrappers.
- Compared all unrelated History functions with the pre-edit snapshot: unchanged. Other card styles are untouched, and LinearGradient remains imported for them.
- Native device rendering and TalkBack/VoiceOver were not verified. Expected test warnings come from deliberate error fixtures and Node's experimental SQLite implementation.

## Focused-day definition and remaining mismatches

The shared session predicate is completed = 1, with no minimum duration or focus/clean-time threshold. Voided/incomplete sessions do not light a day. The real completion writer records completedAt as ended_at, so the strip uses ended_at rather than the session start. Dev samples use the same completed columns and therefore appear automatically.

The current streak writer uses UTC date keys (sessionHistory.dateKey uses toISOString), while this strip is explicitly local time. A completion near local midnight can therefore be assigned to different dates. The writer also allows one grace-day gap and only updates the stored streak on completion; the strip shows actual completed local days and does not invent a filled day for grace. These cannot be fully unified without changing the existing streak writer/counter behavior, which is outside this StatRows-and-data scope. Stored streak numbers and the requested coaching-line rules were preserved.

Legacy completed rows may have no ended_at. Their started_at is the only available timestamp and is used as a fallback; their true completion date cannot be recovered. The week query does not filter out short completions, modes, or dev samples.

Dev sample actions intentionally do not update streaks, per their existing contract. Consequently the strip can show sample-focused days while Current streak, Best streak, and the persisted total continue to reflect real counters. No new sample-specific code or counter repair was added.

## Layout and mockup

The header uses the requested focused-day count, and the three new outline icons sit above plain white numbers. Today has a light ring, future circles are dimmed, and filled circles have checks. Only the flame is amber. Column labels reserve room for two lines so values stay aligned at larger text sizes. There are no deliberate deviations from the requested layout.

The coaching line follows the requested order:

| Condition | Copy |
| --- | --- |
| No completed sessions | Your first focus session starts your streak. |
| Focused today, at or above best | You're on your best streak. Keep it going. |
| Focused today, below best | {n} more day/days to tie your best. |
| Not focused today, current streak positive | Focus today to keep your {n}-day streak. |
| Not focused today, current streak zero | Focus today to start a new streak. |
