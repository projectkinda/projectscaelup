import { transpileModule, ModuleKind } from 'typescript';
import {
  evaluateFocusCoach,
  type FocusCoachResult,
  type FocusCoachDistractionType,
  type FocusCoachExperiment,
  type FocusCoachSession,
} from '../src/domain/focusCoach';
import { experimentDaysDone } from '../src/components/focusCoachPresentation';
import * as narrativeCopy from '../src/domain/focusCoachCopy';
import { formatApproxDuration } from '../src/domain/durationFormat';
import { selectCoachCardSections } from '../src/domain/focusCoachCardSections';
import {
  HEADLINE_VARIANTS,
  lockedTeaserCopy,
  safeCopyLine,
  selectHistoryHeadlineCopy,
  selectCoachVariantIndex,
} from '../src/domain/focusCoachCopyRules';
import {
  buildFocusCoachAway,
  safeLoadFocusCoachAway,
} from '../src/domain/focusCoachAway';
import { judgeExperimentResult } from '../src/domain/focusCoachExperiment';

function session(
  index: number,
  override: Partial<FocusCoachSession> = {},
): FocusCoachSession {
  return {
    id: index + 1,
    startedAt: new Date(Date.UTC(2026, 9, index + 1, 10)).toISOString(),
    endedAt: new Date(Date.UTC(2026, 9, index + 1, 10, 30)).toISOString(),
    cleanSeconds: 20 * 60,
    focusSeconds: 30 * 60,
    firstDistractionType: null,
    pauseCount: 0,
    pausedSeconds: 0,
    endedEarly: false,
    durationSeconds: 30 * 60,
    modeId: 'deep-work',
    platform: 'android',
    afterSessionAwaySeconds: null,
    afterSessionAwayVerified: null,
    ...override,
  };
}

function many(
  count: number,
  clean: (index: number) => number,
  extra: (index: number) => Partial<FocusCoachSession> = () => ({}),
) {
  return Array.from({ length: count }, (_, index) =>
    session(index, { cleanSeconds: clean(index), ...extra(index) }),
  );
}

const cases: Array<{ name: string; run: () => void | Promise<void> }> = [];

function test(name: string, run: () => void | Promise<void>) {
  cases.push({ name, run });
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertSuggestionShape(value: number | null) {
  assert(value !== null, 'suggestion should exist');
  const minutes = value ?? 0;
  assert(minutes >= 5 && minutes <= 59, 'suggestion should be within 5..59');
  assert(minutes % 5 === 0, 'suggestion should be a multiple of 5');
}

function headlineFor(deltaSeconds: number | null | undefined, validCount: number) {
  return selectHistoryHeadlineCopy({
    deltaSeconds,
    stored: null,
    validCount,
    formatDelta: seconds => `${Math.round(seconds / 60)} min`,
  })?.text ?? null;
}

function coachResult(
  override: Partial<FocusCoachResult> = {},
): FocusCoachResult {
  return {
    notes: [], pending: [], headline: 'Your typical clean stretch is 20 min.', evidenceCount: 5, nextStep: null, tooEarlyRemaining: 0,
    latestPlatform: 'android',
    validCount: 5,
    baselineTarget: 5,
    state: 'steady',
    currentCleanSeconds: 20 * 60,
    beforeCleanSeconds: null,
    suggestionMinutes: 25,
    suggestionReason: 'repeat',
    cleanTrend: {
      points: many(5, index => (18 + index) * 60).map(item => ({
        sessionId: item.id,
        endedAt: item.endedAt ?? item.startedAt,
        cleanSeconds: item.cleanSeconds ?? 0,
      })),
      deltaSeconds: null,
    },
    lastSession: {
      endedAt: '2026-10-20T10:30:00.000Z',
      plannedSeconds: 30 * 60,
      focusSeconds: 30 * 60,
      cleanSeconds: 20 * 60,
      endedBy: 'app_touched',
      firstDistractionType: 'app_touched',
      firstDistractionAtSeconds: 20 * 60,
      pauseCount: 1,
      pausedSeconds: 60,
      endedEarly: false,
    },
    away: {
      sinceLastUseSeconds: 90 * 60,
      display: 'about',
      afterSessionSeconds: 45 * 60,
      afterSessionVerified: true,
    },
    awayInsight: {
      verifiedSessionCount: 10,
      typeLine: 'longer_breaks_cleaner',
      longBreakMedianCleanSeconds: 25 * 60,
      shortBreakMedianCleanSeconds: 20 * 60,
      longBreakMedianCleanRatio: 0.8,
      shortBreakMedianCleanRatio: 0.65,
      differenceSeconds: 5 * 60,
      differencePct: 15,
    },
    diagnosis: 'app_heavy',
    diagnosisDetail: {
      kind: 'app_heavy',
      sharePct: 70,
      brokenCount: 10,
    },
    weakEvidence: false,
    primaryBreak: 'app_touched',
    experiment: {
      id: 'phone_out_of_reach',
      startedAt: '2026-10-20T10:00:00.000Z',
      result: null,
    },
    historyHeadline: 'Clean focus is up 5 min lately.',
    historyCopy: 'Current clean length is 20 min.',
    suggestionCopy: 'Suggested: 25 min',
    ...override,
  };
}

test('3 valid sessions -> building_baseline, suggestion null', () => {
  const result = evaluateFocusCoach(many(3, () => 20 * 60));
  assert(result.state === 'building_baseline', `got ${result.state}`);
  assert(result.suggestionMinutes === null, 'suggestion should be null');
});

test('0 valid sessions expose no trend or last session', () => {
  const result = evaluateFocusCoach([]);
  assert(result.validCount === 0, `got ${result.validCount}`);
  assert(result.cleanTrend === null, 'cleanTrend should be null');
  assert(result.lastSession === null, 'lastSession should be null');
});

test('5 valid sessions expose trend without delta', () => {
  const result = evaluateFocusCoach(many(5, () => 20 * 60));
  assert(result.validCount === 5, `got ${result.validCount}`);
  assert(result.cleanTrend?.points.length === 5, 'expected 5 trend points');
  assert(result.cleanTrend?.deltaSeconds === null, 'delta should be null');
});

test('8 valid sessions expose last up to 8 trend points', () => {
  const result = evaluateFocusCoach(many(8, index => (20 + index) * 60));
  assert(result.cleanTrend?.points.length === 8, 'expected 8 trend points');
});

test('12 valid sessions expose last 8 trend points only', () => {
  const result = evaluateFocusCoach(many(12, index => (20 + index) * 60));
  assert(result.cleanTrend?.points.length === 8, 'expected 8 trend points');
  assert(result.cleanTrend?.points[0].sessionId === 5, 'expected point 5 first');
});

test('7 valid sessions -> steady', () => {
  const result = evaluateFocusCoach(many(7, () => 20 * 60));
  assert(result.state === 'steady', `got ${result.state}`);
});

test('20 sessions steady at 22 min -> plateau', () => {
  const result = evaluateFocusCoach(many(20, () => 22 * 60));
  assert(result.state === 'plateau', `got ${result.state}`);
});

test('10 sessions rising 20 -> 26 min -> improving', () => {
  const result = evaluateFocusCoach(
    many(10, index => (index < 5 ? 20 * 60 : 26 * 60)),
  );
  assert(result.state === 'improving', `got ${result.state}`);
});

test('10 sessions falling 30 -> 22 min -> slipping', () => {
  const result = evaluateFocusCoach(
    many(10, index => (index < 5 ? 30 * 60 : 22 * 60)),
  );
  assert(result.state === 'slipping', `got ${result.state}`);
});

test('improving trend delta uses recent 3 minus previous 3', () => {
  const result = evaluateFocusCoach(
    many(6, index => (index < 3 ? 20 * 60 : 26 * 60)),
  );
  assert(result.cleanTrend?.deltaSeconds === 6 * 60, `got ${result.cleanTrend?.deltaSeconds}`);
});

test('declining trend delta uses recent 3 minus previous 3', () => {
  const result = evaluateFocusCoach(
    many(6, index => (index < 3 ? 26 * 60 : 20 * 60)),
  );
  assert(result.cleanTrend?.deltaSeconds === -6 * 60, `got ${result.cleanTrend?.deltaSeconds}`);
});

test('steady trend delta can be zero', () => {
  const result = evaluateFocusCoach(many(6, () => 22 * 60));
  assert(result.cleanTrend?.deltaSeconds === 0, `got ${result.cleanTrend?.deltaSeconds}`);
});

test('fewer than 6 valid sessions have no trend delta', () => {
  const result = evaluateFocusCoach(many(5, () => 22 * 60));
  assert(result.cleanTrend?.deltaSeconds === null, 'delta should be null');
});

test('historyHeadline is null with fewer than 6 valid sessions', () => {
  const result = evaluateFocusCoach(many(5, () => 22 * 60));
  const headline = headlineFor(result.cleanTrend?.deltaSeconds, result.validCount);
  assert(headline === null, `got ${headline}`);
});

test('historyHeadline is stable on two loads with the same validCount', () => {
  const result = evaluateFocusCoach(
    many(6, index => (index < 3 ? 20 * 60 : 26 * 60)),
  );
  const first = selectHistoryHeadlineCopy({
    deltaSeconds: result.cleanTrend?.deltaSeconds,
    stored: null,
    validCount: result.validCount,
    formatDelta: seconds => `${Math.round(seconds / 60)} min`,
  });
  const second = selectHistoryHeadlineCopy({
    deltaSeconds: result.cleanTrend?.deltaSeconds,
    stored: first ? { index: first.index, validCount: result.validCount } : null,
    validCount: result.validCount,
    formatDelta: seconds => `${Math.round(seconds / 60)} min`,
  });
  assert(first?.text === second?.text, `${first?.text} !== ${second?.text}`);
});

test('historyHeadline says up for rising fixtures', () => {
  const result = evaluateFocusCoach(
    many(6, index => (index < 3 ? 20 * 60 : 26 * 60)),
  );
  const headline = headlineFor(result.cleanTrend?.deltaSeconds, result.validCount);
  assert(headline?.includes('up'), `got ${headline}`);
});

test('historyHeadline says down for falling fixtures', () => {
  const result = evaluateFocusCoach(
    many(6, index => (index < 3 ? 26 * 60 : 20 * 60)),
  );
  const headline = headlineFor(result.cleanTrend?.deltaSeconds, result.validCount);
  assert(/down|dipped/.test(headline ?? ''), `got ${headline}`);
});

test('historyHeadline says steady for flat fixtures', () => {
  const result = evaluateFocusCoach(many(6, () => 22 * 60));
  const headline = headlineFor(result.cleanTrend?.deltaSeconds, result.validCount);
  assert(headline?.includes('steady'), `got ${headline}`);
});

test('8 broken sessions under 25% planned -> early_breaker', () => {
  const result = evaluateFocusCoach(
    many(8, () => 5 * 60, () => ({
      firstDistractionType: 'app_touched',
      durationSeconds: 30 * 60,
    })),
  );
  assert(result.diagnosis === 'early_breaker', `got ${result.diagnosis}`);
});

test('sessions with null clean_seconds ignored', () => {
  const result = evaluateFocusCoach([
    ...many(5, () => 20 * 60),
    session(6, { cleanSeconds: null, focusSeconds: 30 * 60 }),
  ]);
  assert(result.validCount === 5, `got ${result.validCount}`);
});

test('pause_overrun counts for clean length, excluded from diagnosis', () => {
  const result = evaluateFocusCoach(
    many(6, () => 16 * 60, () => ({
      firstDistractionType: 'pause_overrun' as FocusCoachDistractionType,
    })),
  );
  assert(result.validCount === 6, `got ${result.validCount}`);
  assert(result.currentCleanSeconds === 16 * 60, 'clean median should count');
  assert(result.diagnosis === null, `got ${result.diagnosis}`);
});

test('one great session after 4 poor ones does not jump suggestion by more than 5 min', () => {
  const result = evaluateFocusCoach([
    ...many(4, () => 8 * 60),
    session(4, { cleanSeconds: 30 * 60 }),
  ]);
  assert(result.suggestionMinutes !== null, 'suggestion should exist');
  const suggestion = result.suggestionMinutes ?? 0;
  assert(suggestion <= 35, `got ${suggestion}`);
});

test('suggestion always within 5..59 and a multiple of 5', () => {
  const high = evaluateFocusCoach(
    many(6, () => 90 * 60, () => ({
      durationSeconds: 90 * 60,
      focusSeconds: 90 * 60,
    })),
  );
  const low = evaluateFocusCoach(many(6, () => 60));
  assertSuggestionShape(high.suggestionMinutes);
  assertSuggestionShape(low.suggestionMinutes);
});

test('mixed platforms use only the latest platform', () => {
  const result = evaluateFocusCoach([
    ...many(5, () => 25 * 60, () => ({ platform: 'ios' })),
    session(8, {
      startedAt: '2026-10-20T10:00:00.000Z',
      cleanSeconds: 15 * 60,
      platform: 'android',
    }),
  ]);
  assert(result.latestPlatform === 'android', `got ${result.latestPlatform}`);
  assert(result.validCount === 1, `got ${result.validCount}`);
  assert(result.cleanTrend === null, 'single latest-platform session has no trend');
});

test('end early counts when focus_seconds is at least 120', () => {
  const result = evaluateFocusCoach([
    session(0, {
      cleanSeconds: 140,
      focusSeconds: 140,
      durationSeconds: 900,
      endedEarly: true,
    }),
  ]);
  assert(result.validCount === 1, `got ${result.validCount}`);
});

test('ended-early latest session is exposed as lastSession', () => {
  const result = evaluateFocusCoach([
    ...many(5, () => 20 * 60),
    session(8, {
      cleanSeconds: 180,
      focusSeconds: 180,
      durationSeconds: 900,
      endedEarly: true,
      firstDistractionType: 'app_touched',
      pauseCount: 2,
      pausedSeconds: 60,
      endedAt: '2026-10-20T10:03:00.000Z',
    }),
  ]);
  assert(result.lastSession?.endedEarly === true, 'expected endedEarly');
  assert(result.lastSession?.firstDistractionAtSeconds === 180, 'expected distraction time');
  assert(result.lastSession?.pauseCount === 2, 'expected pause count');
});

test('lastSession ignores a latest session with focus_seconds under 120', () => {
  const result = evaluateFocusCoach([
    ...many(5, () => 20 * 60),
    session(8, {
      startedAt: '2026-10-20T10:00:00.000Z',
      endedAt: '2026-10-20T10:01:00.000Z',
      cleanSeconds: 60,
      focusSeconds: 60,
      durationSeconds: 900,
    }),
  ]);
  assert(result.lastSession?.cleanSeconds === 20 * 60, `got ${result.lastSession?.cleanSeconds}`);
});

test("lastSession endedBy distinguishes pause_overrun", () => {
  const result = evaluateFocusCoach([
    ...many(5, () => 20 * 60),
    session(8, {
      cleanSeconds: 180,
      focusSeconds: 180,
      durationSeconds: 900,
      firstDistractionType: 'pause_overrun',
      endedAt: '2026-10-20T10:03:00.000Z',
    }),
  ]);
  assert(result.lastSession?.endedBy === 'pause_overrun', `got ${result.lastSession?.endedBy}`);
  assert(result.lastSession?.firstDistractionType === null, `got ${result.lastSession?.firstDistractionType}`);
});

test('best_window can trigger from clean sessions', () => {
  const result = evaluateFocusCoach([
    ...many(3, () => 30 * 60, index => ({
      startedAt: new Date(Date.UTC(2026, 9, index + 1, 2)).toISOString(),
    })),
    ...many(3, () => 15 * 60, index => ({
      id: 10 + index,
      startedAt: new Date(Date.UTC(2026, 9, index + 1, 8)).toISOString(),
    })),
    ...many(3, () => 15 * 60, index => ({
      id: 20 + index,
      startedAt: new Date(Date.UTC(2026, 9, index + 1, 15)).toISOString(),
    })),
  ]);
  assert(result.diagnosis === 'best_window', `got ${result.diagnosis}`);
});

test('diagnosisDetail is null when diagnosis is null', () => {
  const result = evaluateFocusCoach(many(6, () => 20 * 60));
  assert(result.diagnosis === null, `got ${result.diagnosis}`);
  assert(result.diagnosisDetail === null, 'expected null detail');
});

test('early_breaker diagnosisDetail medians match fixture', () => {
  const result = evaluateFocusCoach(
    many(6, index => [4, 6, 8, 4, 6, 8][index] * 60, index => ({
      firstDistractionType: 'app_touched',
      durationSeconds: [20, 30, 40, 20, 30, 40][index] * 60,
      focusSeconds: [20, 30, 40, 20, 30, 40][index] * 60,
    })),
  );
  assert(result.diagnosis === 'early_breaker', `got ${result.diagnosis}`);
  assert(result.diagnosisDetail?.kind === 'early_breaker', `got ${result.diagnosisDetail?.kind}`);
  if (result.diagnosisDetail?.kind !== 'early_breaker') return;
  assert(result.diagnosisDetail.typicalFirstBreakSeconds === 6 * 60, `got ${result.diagnosisDetail.typicalFirstBreakSeconds}`);
  assert(result.diagnosisDetail.typicalPlannedSeconds === 30 * 60, `got ${result.diagnosisDetail.typicalPlannedSeconds}`);
  assert(result.diagnosisDetail.brokenCount === 6, `got ${result.diagnosisDetail.brokenCount}`);
});

test('late_breaker diagnosisDetail medians match fixture', () => {
  const result = evaluateFocusCoach(
    many(6, index => [18, 20, 22, 18, 20, 22][index] * 60, () => ({
      firstDistractionType: 'camera_absence',
      durationSeconds: 25 * 60,
      focusSeconds: 25 * 60,
    })),
  );
  assert(result.diagnosis === 'late_breaker', `got ${result.diagnosis}`);
  assert(result.diagnosisDetail?.kind === 'late_breaker', `got ${result.diagnosisDetail?.kind}`);
  if (result.diagnosisDetail?.kind !== 'late_breaker') return;
  assert(result.diagnosisDetail.typicalFirstBreakSeconds === 20 * 60, `got ${result.diagnosisDetail.typicalFirstBreakSeconds}`);
  assert(result.diagnosisDetail.typicalPlannedSeconds === 25 * 60, `got ${result.diagnosisDetail.typicalPlannedSeconds}`);
  assert(result.diagnosisDetail.brokenCount === 6, `got ${result.diagnosisDetail.brokenCount}`);
});

test('best_window diagnosisDetail names the right window and medians', () => {
  const result = evaluateFocusCoach([
    ...many(3, () => 30 * 60, index => ({
      startedAt: new Date(Date.UTC(2026, 9, index + 1, 2)).toISOString(),
    })),
    ...many(3, () => 15 * 60, index => ({
      id: 10 + index,
      startedAt: new Date(Date.UTC(2026, 9, index + 1, 8)).toISOString(),
    })),
    ...many(3, () => 15 * 60, index => ({
      id: 20 + index,
      startedAt: new Date(Date.UTC(2026, 9, index + 1, 15)).toISOString(),
    })),
  ]);
  assert(result.diagnosisDetail?.kind === 'best_window', `got ${result.diagnosisDetail?.kind}`);
  if (result.diagnosisDetail?.kind !== 'best_window') return;
  assert(result.diagnosisDetail.window === 'morning', `got ${result.diagnosisDetail.window}`);
  assert(result.diagnosisDetail.windowMedianCleanSeconds === 30 * 60, `got ${result.diagnosisDetail.windowMedianCleanSeconds}`);
  assert(result.diagnosisDetail.overallMedianCleanSeconds === 15 * 60, `got ${result.diagnosisDetail.overallMedianCleanSeconds}`);
  assert(result.diagnosisDetail.sessionsInWindow === 3, `got ${result.diagnosisDetail.sessionsInWindow}`);
});

test('app_heavy diagnosisDetail sharePct matches fixture', () => {
  const result = evaluateFocusCoach(
    many(10, () => 15 * 60, index => ({
      firstDistractionType: index < 7 ? 'app_touched' : 'camera_absence',
      durationSeconds: 30 * 60,
    })),
  );
  assert(result.diagnosis === 'app_heavy', `got ${result.diagnosis}`);
  assert(result.diagnosisDetail?.kind === 'app_heavy', `got ${result.diagnosisDetail?.kind}`);
  if (result.diagnosisDetail?.kind !== 'app_heavy') return;
  assert(result.diagnosisDetail.sharePct === 70, `got ${result.diagnosisDetail.sharePct}`);
  assert(result.diagnosisDetail.brokenCount === 10, `got ${result.diagnosisDetail.brokenCount}`);
});

test('camera_heavy diagnosisDetail sharePct matches fixture', () => {
  const result = evaluateFocusCoach(
    many(10, () => 15 * 60, index => ({
      firstDistractionType: index < 7 ? 'camera_absence' : 'app_touched',
      durationSeconds: 30 * 60,
    })),
  );
  assert(result.diagnosis === 'camera_heavy', `got ${result.diagnosis}`);
  assert(result.diagnosisDetail?.kind === 'camera_heavy', `got ${result.diagnosisDetail?.kind}`);
  if (result.diagnosisDetail?.kind !== 'camera_heavy') return;
  assert(result.diagnosisDetail.sharePct === 70, `got ${result.diagnosisDetail.sharePct}`);
  assert(result.diagnosisDetail.brokenCount === 10, `got ${result.diagnosisDetail.brokenCount}`);
});

test('formatApproxDuration rounds to approximate copy', () => {
  assert(formatApproxDuration(42) === '42 sec', formatApproxDuration(42));
  assert(formatApproxDuration(9 * 60 + 20) === '9 min', formatApproxDuration(9 * 60 + 20));
  assert(formatApproxDuration(65 * 60 + 20) === '1h 5m', formatApproxDuration(65 * 60 + 20));
});

test('historyHeadline delta uses approximate duration', () => {
  const headline = selectHistoryHeadlineCopy({
    deltaSeconds: 9 * 60 + 20,
    stored: null,
    validCount: 6,
    formatDelta: formatApproxDuration,
  })?.text;
  assert(headline?.includes('9 min'), `got ${headline}`);
  assert(!headline?.includes('sec'), `got ${headline}`);
});

test('away hidden maps to null', () => {
  const away = buildFocusCoachAway({
    display: { kind: 'hidden' },
    latestSession: session(1),
    platform: 'android',
  });
  assert(away === null, 'expected null');
});

test('away at_least maps through with verified after-session value', () => {
  const away = buildFocusCoachAway({
    display: { kind: 'at_least', seconds: 3600, text: 'at least 1 h' },
    latestSession: session(1, {
      afterSessionAwaySeconds: 7200,
      afterSessionAwayVerified: true,
    }),
    platform: 'android',
  });
  assert(away?.display === 'at_least', `got ${away?.display}`);
  assert(away?.afterSessionSeconds === 7200, 'expected verified after seconds');
});

test('away about maps through', () => {
  const away = buildFocusCoachAway({
    display: { kind: 'about', seconds: 1800, text: 'about 30 min' },
    latestSession: session(1),
    platform: 'android',
  });
  assert(away?.display === 'about', `got ${away?.display}`);
  assert(away?.sinceLastUseSeconds === 1800, 'expected since seconds');
});

test('iOS away maps to null', () => {
  const away = buildFocusCoachAway({
    display: { kind: 'about', seconds: 1800, text: 'about 30 min' },
    latestSession: session(1, { platform: 'ios' }),
    platform: 'ios',
  });
  assert(away === null, 'expected null');
});

test('9 verified away sessions produce no awayInsight', () => {
  const result = evaluateFocusCoach(
    many(9, () => 20 * 60, index => ({
      afterSessionAwaySeconds: index % 2 === 0 ? 90 * 60 : 20 * 60,
      afterSessionAwayVerified: true,
    })),
  );
  assert(result.awayInsight === null, 'expected null');
});

test('10 verified away sessions produce awayInsight', () => {
  const result = evaluateFocusCoach(
    many(10, index => (index < 5 ? 25 * 60 : 18 * 60), index => ({
      afterSessionAwaySeconds: index < 5 ? 90 * 60 : 20 * 60,
      afterSessionAwayVerified: true,
    })),
  );
  assert(result.awayInsight?.verifiedSessionCount === 10, 'expected 10 verified');
  assert(result.awayInsight?.typeLine === 'longer_breaks_cleaner', `got ${result.awayInsight?.typeLine}`);
  assert(result.awayInsight?.differencePct !== undefined, 'expected differencePct');
});

test('awayInsight is null when either bucket has fewer than 3 sessions', () => {
  const result = evaluateFocusCoach(
    many(10, () => 20 * 60, index => ({
      afterSessionAwaySeconds: index < 8 ? 90 * 60 : 20 * 60,
      afterSessionAwayVerified: true,
    })),
  );
  assert(result.awayInsight === null, 'expected null');
});

test('awayInsight uses clean ratio, not raw clean seconds', () => {
  const result = evaluateFocusCoach(
    many(10, index => (index < 5 ? 30 * 60 : 15 * 60), index => ({
      durationSeconds: index < 5 ? 60 * 60 : 30 * 60,
      focusSeconds: index < 5 ? 60 * 60 : 30 * 60,
      afterSessionAwaySeconds: index < 5 ? 90 * 60 : 20 * 60,
      afterSessionAwayVerified: true,
    })),
  );
  assert(result.awayInsight?.typeLine === 'break_lengths_similar', `got ${result.awayInsight?.typeLine}`);
  assert(Math.abs(result.awayInsight?.differencePct ?? 999) < 1, `got ${result.awayInsight?.differencePct}`);
});

test('away insight copy uses rounded ratio differences for both variants', () => {
  const { readFileSync } = require('node:fs');
  const { runInNewContext } = require('node:vm');
  // Isolate the copy module from its native database dependency for these fixtures.
  const copyModule = { exports: {} as typeof import('../src/domain/focusCoachCopy') };
  const source = readFileSync('src/domain/focusCoachCopy.ts', 'utf8');
  runInNewContext(transpileModule(source, {
    compilerOptions: { module: ModuleKind.CommonJS },
  }).outputText, { exports: copyModule.exports, require: () => ({}) });
  const insight = coachResult().awayInsight!;
  const fixtures = [
    ['longer_breaks_cleaner', 10, 15.4, 'Sessions after a longer break stayed clean for about 15% more of the session.'],
    ['longer_breaks_cleaner', 11, 15.6, 'After longer breaks, about 16% more of the session stayed clean.'],
    ['shorter_breaks_cleaner', 10, -15.4, 'Sessions after shorter breaks stayed clean for about 15% more of the session.'],
    ['shorter_breaks_cleaner', 11, -15.6, 'After shorter breaks, about 16% more of the session stayed clean.'],
    ['break_lengths_similar', 10, 0, 'Clean focus looks similar after shorter and longer breaks.'],
    ['break_lengths_similar', 11, 0, 'Break length is not showing a clear clean-focus difference yet.'],
  ] as const;
  for (const [typeLine, verifiedSessionCount, differencePct, expected] of fixtures) {
    const actual = copyModule.exports.formatAwayInsightCopy({
      ...insight, typeLine, verifiedSessionCount, differencePct,
    });
    assert(actual === expected, actual);
  }
});

test('away code throwing returns null', async () => {
  const away = await safeLoadFocusCoachAway({
    loadDisplay: async () => {
      throw new Error('boom');
    },
    latestSession: session(1),
    platform: 'android',
  });
  assert(away === null, 'expected null');
});

function experimentSession(
  index: number,
  cleanSeconds: number,
  startedAt: string,
) {
  return session(index, {
    cleanSeconds,
    focusSeconds: 30 * 60,
    durationSeconds: 30 * 60,
    startedAt,
  });
}

function experimentCase(sinceClean: number[], nowDay = 20) {
  const experiment: FocusCoachExperiment = {
    id: 'five_minute_break',
    startedAt: '2026-10-10T10:00:00.000Z',
    result: null,
  };
  const before = Array.from({ length: 5 }, (_, index) =>
    experimentSession(
      index,
      20 * 60,
      new Date(Date.UTC(2026, 9, index + 1, 10)).toISOString(),
    ),
  );
  const since = sinceClean.map((cleanSeconds, index) =>
    experimentSession(
      index + 10,
      cleanSeconds,
      new Date(Date.UTC(2026, 9, 10 + index, 10)).toISOString(),
    ),
  );

  return judgeExperimentResult({
    sessions: [...before, ...since],
    experiment,
    nowMs: Date.UTC(2026, 9, nowDay, 10),
  });
}

test('experiment judging: +15% and +150 s -> worked', () => {
  assert(
    experimentCase([23 * 60, 23 * 60, 23 * 60]) === 'worked',
    'expected worked',
  );
});

test('experiment judging: -20% -> didnt_work', () => {
  assert(
    experimentCase([16 * 60, 16 * 60, 16 * 60]) === 'didnt_work',
    'expected didnt_work',
  );
});

test('experiment judging: +5% -> unclear', () => {
  assert(
    experimentCase([21 * 60, 21 * 60, 21 * 60]) === 'unclear',
    'expected unclear',
  );
});

test('experiment judging: fewer than 3 sessions since -> unclear', () => {
  assert(experimentCase([25 * 60, 25 * 60]) === 'unclear', 'expected unclear');
});

test('copy line containing a disallowed word falls back without throwing', () => {
  const copy = safeCopyLine('This failed badly.', 'Current clean length is 20 min.');
  assert(copy === 'Current clean length is 20 min.', `got ${copy}`);
});

test('same state and validCount returns the same variant twice in a row', () => {
  const first = selectCoachVariantIndex({
    stored: { index: 1, validCount: 8 },
    validCount: 8,
    variantCount: 3,
    stateChanged: false,
  });
  const second = selectCoachVariantIndex({
    stored: { index: first, validCount: 8 },
    validCount: 8,
    variantCount: 3,
    stateChanged: false,
  });
  assert(first === second, `${first} !== ${second}`);
});

// Load the real templates while keeping native database imports out of Node.
function loadCopyTemplates() {
  const { readFileSync } = require('node:fs');
  const { runInNewContext } = require('node:vm');
  const copyModule = { exports: {} as typeof import('../src/domain/focusCoachCopy') };
  runInNewContext(transpileModule(readFileSync('src/domain/focusCoachCopy.ts', 'utf8'), {
    compilerOptions: { module: ModuleKind.CommonJS },
  }).outputText, { exports: copyModule.exports, require: (id: string) => id === '../data/appStateRepository'
    ? { getAppState: async () => null, setAppState: async () => {} }
    : require('../src/domain/' + id.replace('./', '')) });
  return copyModule.exports;
}

for (const [key, experiment] of Object.entries(loadCopyTemplates().EXPERIMENT_COPY)) {
  test(`all copy templates read correctly with experiment ${key}`, () => {
    const { STATE_VARIANTS, fillTemplate } = loadCopyTemplates();
    for (const template of Object.values(STATE_VARIANTS).flat()) {
      const rendered = fillTemplate(template, {
        now: '20 min', before: '15 min', suggested: '25 min', experiment, n: '5',
      });
      assert(!/\btry to\b| {2}|\{|\bbaseline\b/i.test(rendered), rendered);
      assert((rendered.match(/this week/gi) ?? []).length <= 1, rendered);
      assert(rendered.length <= 90, rendered);
      assert(!template.includes('{now}') || template.includes('typical clean stretch'), template);
    }
  });
}

test('experiment dots show this week elapsed days, never last week result', () => {
  const startedAt = '2026-10-10T10:00:00.000Z';
  const experiment = { ...coachResult().experiment!, startedAt, result: null, lastResult: 'worked' as const };
  assert(experimentDaysDone(experiment, Date.parse(startedAt) + 3 * 86400000) === 3, 'expected three elapsed days');
  assert(experimentDaysDone(experiment, Date.parse(startedAt) - 86400000) === 0, 'future dates should show zero');
  assert(experimentDaysDone(experiment, Date.parse(startedAt) + 20 * 86400000) === 7, 'dots should cap at seven');
  assert(experimentDaysDone({ ...experiment, result: 'unclear' }) === 7, 'judged experiment should be complete');
});
test('suggestion reasons cover every branch and preserve rounding and limits', () => {
  const fixtures = [
    { clean: 28 * 60, planned: 30 * 60, reason: 'step_up', minutes: 35 },
    { clean: 10 * 60, planned: 30 * 60, reason: 'ease_down', minutes: 10 },
    { clean: 20 * 60, planned: 30 * 60, reason: 'repeat', minutes: 30 },
    { clean: 28, planned: 120, reason: 'floor', minutes: 5 },
    { clean: 90, planned: 120, reason: 'floor', minutes: 5 },
    { clean: 120, planned: 120, reason: 'step_up', minutes: 5 },
    { clean: 55 * 60, planned: 55 * 60, reason: 'step_up', minutes: 55 },
  ];
  for (const fixture of fixtures) {
    const result = evaluateFocusCoach(many(6, () => fixture.clean, () => ({
      durationSeconds: fixture.planned, focusSeconds: Math.max(120, fixture.planned),
    })));
    assert(result.suggestionReason === fixture.reason, JSON.stringify(result));
    assert(result.suggestionMinutes === fixture.minutes, JSON.stringify(result));
  }
  assert(evaluateFocusCoach([]).suggestionReason === null, 'no suggestion before enough sessions');
});

test('suggestion captions are pure, match reasons, and stay within 40 characters', () => {
  const { suggestionCaption } = loadCopyTemplates();
  const fixtures = {
    step_up: 'Your last 3 stayed clean. Add 5 min.',
    repeat: 'Same as last time. Build on it.',
    ease_down: 'Last 2 slipped. Shorter is fine.',
    floor: 'A short start is fine. Build from here.',
  } as const;
  for (const reason of Object.keys(fixtures) as Array<keyof typeof fixtures>) {
    const copy = suggestionCaption(reason);
    assert(copy === fixtures[reason] && copy.length <= 40 && !/baseline|\{/.test(copy), copy);
  }
  assert(suggestionCaption('step_up', false) === 'Your last 3 stayed clean.', 'clamped step-up must not promise 5 min');
});

test('all headline variants describe changes without jargon or placeholders', () => {
  for (const template of Object.values(HEADLINE_VARIANTS).flat()) {
    for (const delta of ['15 sec', '9 min', '1h 5m']) {
      const copy = template.replace('{delta}', delta);
      assert(copy.length <= 90 && !/baseline|\{| {2}|try to/i.test(copy), copy);
    }
  }
  assert(selectHistoryHeadlineCopy({ deltaSeconds: 15, stored: null, validCount: 6, formatDelta: formatApproxDuration })?.direction === 'up', 'small positive changes should be visible');
});

test('generated history copy and headlines stay short and avoid jargon', async () => {
  const { buildFocusCoachCopy } = loadCopyTemplates();
  for (const state of ['building_baseline', 'steady', 'slipping', 'improving', 'plateau'] as const) {
    for (const id of ['morning_session', 'shorter_sessions', 'phone_out_of_reach', 'five_minute_break'] as const) {
      for (const deltaSeconds of [null, 0, 15, -15, 540]) {
        const result = coachResult({ state, cleanTrend: { points: [], deltaSeconds }, experiment: { ...coachResult().experiment!, id } });
        const copy = await buildFocusCoachCopy(result);
        for (const text of [copy.historyCopy, copy.historyHeadline, copy.suggestionCopy].filter(Boolean) as string[]) {
          assert(text.length <= 90 && !/\bbaseline\b|\{| {2}|try to/i.test(text), text);
        }
      }
    }
  }
});

const NOTE_NOW = new Date(2026, 9, 18, 12).getTime();
function noteResult(rows: FocusCoachSession[], isPaidUser = true, modeNames: Record<string, string> = {}) {
  return evaluateFocusCoach(rows, null, null, { isPaidUser, now: NOTE_NOW, modeNames });
}
function noteOf(rows: FocusCoachSession[], id: FocusCoachResult['notes'][number]['id']) {
  return noteResult(rows).notes.find(note => note.id === id);
}
function slips(count: number, overrides: Partial<FocusCoachSession> = {}) {
  return many(Math.max(5, count), index => index < count ? 12 * 60 : 30 * 60, index => ({
    firstDistractionType: index < count ? 'app_touched' : null,
    firstDistractionApp: 'Instagram', ...overrides,
  }));
}
function windowSessions(perBucket: number) {
  return many(perBucket * 2, index => index < perBucket ? 30 * 60 : 18 * 60, index => ({
    startedAt: new Date(2026, 9, index + 1, index < perBucket ? 9 : 19).toISOString(),
  }));
}
function lengthSessions(perGroup: number, shortPercent = 1, longPercent = .5, shortMinutes = 20, longMinutes = 30) {
  return many(perGroup * 2, index => (index < perGroup ? shortMinutes * shortPercent : longMinutes * longPercent) * 60, index => ({
    durationSeconds: (index < perGroup ? shortMinutes : longMinutes) * 60,
    focusSeconds: (index < perGroup ? shortMinutes : longMinutes) * 60,
  }));
}
function modeSessions(perMode: number, best = .9, worst = .5) {
  return many(perMode * 2, index => (index < perMode ? best : worst) * 30 * 60, index => ({
    modeId: index < perMode ? 'study' : 'deep-work',
  }));
}
function restSessions(count: number) {
  return many(count, index => (index < 5 ? 25 : 15) * 60, index => ({
    afterSessionAwayVerified: true, afterSessionAwaySeconds: (index < 5 ? 90 : 20) * 60,
  }));
}
function daySessions(days: number) {
  return many(Math.max(5, days), () => 20 * 60, index => ({
    startedAt: new Date(2026, 9, index < days ? 18 - index : 1, 10).toISOString(),
  }));
}

test('top trigger below, at, and above its slip gate and weak threshold', () => {
  assert(!noteOf(slips(3), 'top_trigger'), 'three slips must not produce a trigger');
  assert(noteOf(slips(4), 'top_trigger')?.weak === true, 'four slips are an early read');
  assert(noteOf(slips(8), 'top_trigger')?.weak === false, 'eight slips establish stronger evidence');
  const mixed = slips(4).map((s, index) => ({ ...s, firstDistractionApp: index < 2 ? 'Instagram' : 'YouTube' }));
  assert(!noteOf(mixed, 'top_trigger'), 'two matching sources are below the hit gate');
  const half = slips(6).map((s, index) => ({ ...s, firstDistractionApp: index < 3 ? 'Instagram' : index < 5 ? 'YouTube' : 'Messages' }));
  assert(noteOf(half, 'top_trigger')?.text.startsWith('Instagram'), 'three hits at 50% should pass');
  assert(!noteOf([...half, session(7, { firstDistractionType: 'app_touched', firstDistractionApp: 'Other' })], 'top_trigger'), 'three of seven slips is below 50%');
});

test('top trigger labels are readable and iOS always uses generic copy', () => {
  assert(noteOf(slips(6), 'top_trigger')?.text.startsWith('Instagram'), 'resolved app label missing');
  assert(noteOf(slips(6, { firstDistractionApp: 'camera' }), 'top_trigger')?.text.startsWith('camera pulled'), 'app names must not collide with source types');
  for (const label of [null, 'com.instagram.android', 'ios:opaque', 'median', '{app}', 'A'.repeat(60)]) {
    assert(noteOf(slips(6, { firstDistractionApp: label }), 'top_trigger')?.text.startsWith('Your phone'), 'unsafe label reached the note: ' + label);
  }
  assert(noteOf(slips(6, { platform: 'ios' }), 'top_trigger')?.text.startsWith('Your phone'), 'iOS leaked an app name');
  assert(noteOf(slips(6, { firstDistractionType: 'camera_absence' }), 'top_trigger')?.text.startsWith('You looked away'), 'camera copy missing');
  const result = noteOf(slips(12), 'top_trigger');
  assert(result?.visual.kind === 'dots' && result.visual.total === 8 && result.visual.hits === 8, 'trigger proof must use the latest eight valid sessions');
});

test('slip timing below, exactly at, and above its gate includes quartiles', () => {
  assert(!noteOf(slips(4), 'slip_timing'), 'four timings are too few');
  const at = noteOf(slips(5), 'slip_timing');
  assert(at?.weak && at.visual.kind === 'slip_bar' && at.visual.typicalSeconds === 720, 'five-slip timing missing');
  assert(noteOf(slips(10), 'slip_timing')?.weak === false, 'ten slips should be stronger');
  const early = slips(5).map(s => ({ ...s, cleanSeconds: 28 }));
  assert(noteOf(early, 'slip_timing')?.text.includes('first minute'), 'seconds should use first-minute wording');
  const varying = slips(5).map((s, i) => ({ ...s, cleanSeconds: (i + 1) * 60 }));
  const visual = noteOf(varying, 'slip_timing')?.visual;
  assert(visual?.kind === 'slip_bar' && visual.lowSeconds === 120 && visual.highSeconds === 240 && visual.maxSeconds === 1800, 'quartile or planned-duration calculation wrong');
  assert(!noteOf(slips(6, { firstDistractionType: 'pause_overrun' }), 'slip_timing'), 'pause endings are not observed app/camera slips');
});

test('best window respects existing bucket gate, math, and weak rule', () => {
  const below = windowSessions(3).filter((_, index) => index !== 0);
  assert(!noteOf(below, 'best_window'), 'two morning sessions cannot establish a window');
  const at = noteOf(windowSessions(3), 'best_window');
  assert(at?.weak && at.text.includes('12 min longer than in the evening'), 'comparison must use the worst bucket, not overall');
  assert(noteOf(windowSessions(6), 'best_window')?.weak === false, 'six per bucket should be strong');
  assert(!noteOf(windowSessions(3).map(s => ({ ...s, cleanSeconds: 20 * 60 })), 'best_window'), 'equal windows should not generate a claim');
});

test('best length below, exactly at, and above each group and difference gate', () => {
  assert(!noteOf(lengthSessions(3).filter((_, index) => index !== 0), 'best_length'), 'two in a group is too few');
  assert(noteOf(lengthSessions(3), 'best_length')?.weak === true, 'three per group is early');
  assert(noteOf(lengthSessions(6), 'best_length')?.weak === false, 'six per group should be strong');
  assert(noteOf(lengthSessions(3, .85, .70, 20, 25), 'best_length'), 'exactly five min and fifteen points must pass');
  assert(!noteOf(lengthSessions(3, .85, .71, 20, 25), 'best_length'), 'fourteen points must fail');
  assert(!noteOf(lengthSessions(3, 1, .5, 20, 24), 'best_length'), 'four minutes must fail');
  assert(noteOf(lengthSessions(3, .5, 1), 'best_length')?.text.startsWith('Your longer sessions'), 'longer-group win must swap the sentence');
});

test('best mode below, exactly at, and above gates resolves built-in and custom names', () => {
  assert(!noteOf(modeSessions(3).filter((_, index) => index !== 0), 'best_mode'), 'two in a mode is too few');
  assert(noteOf(modeSessions(3), 'best_mode')?.weak === true, 'three per mode is early');
  assert(noteOf(modeSessions(6), 'best_mode')?.weak === false, 'six per mode should be strong');
  assert(noteOf(modeSessions(3, .85, .70), 'best_mode'), 'fifteen points should pass');
  assert(!noteOf(modeSessions(3, .85, .71), 'best_mode'), 'fourteen points should fail');
  const custom = modeSessions(3).map(s => ({ ...s, modeId: s.modeId === 'study' ? 'custom-one' : 'custom-two' }));
  assert(!noteOf(custom, 'best_mode'), 'unresolved custom mode must be skipped');
  const note = noteResult(custom, true, { 'custom-one': 'Reading', 'custom-two': 'Writing' }).notes.find(n => n.id === 'best_mode');
  assert(note?.text === 'Reading sessions run cleaner than Writing.', 'custom display names were not resolved');
});

test('rest before below, exactly at, and above its own verification gates', () => {
  assert(!noteOf(restSessions(9), 'rest_before'), 'nine verified gaps are too few');
  assert(noteOf(restSessions(10), 'rest_before')?.weak === true, 'ten verified gaps should be an early read');
  assert(noteOf(restSessions(12), 'rest_before'), 'twelve verified gaps should pass');
  assert(!noteOf(restSessions(10).map((s, i) => ({ ...s, afterSessionAwaySeconds: i < 8 ? 7200 : 1200 })), 'rest_before'), 'two verified gaps in a bucket is too few');
  assert(!noteOf(restSessions(12).map(s => ({ ...s, platform: 'ios' })), 'rest_before'), 'iOS must not receive Android rest insights');
  assert(!noteOf(restSessions(12).map(s => ({ ...s, afterSessionAwayVerified: false })), 'rest_before'), 'unverified gaps must not create a note');
});

test('consistency below, exactly at, and above the active-day gate uses local days', () => {
  assert(!noteOf(daySessions(0), 'consistency'), 'no focus this week means no attendance note');
  assert(!noteOf(daySessions(1), 'consistency'), 'one active day is pending');
  assert(noteOf(daySessions(2), 'consistency')?.weak === false, 'two active days should be factual');
  const every = noteOf(daySessions(7), 'consistency');
  assert(every?.text === 'You focused every day this week.' && every.visual.kind === 'week_dots' && every.visual.days.length === 7, 'seven-day copy or visual wrong');
  assert(!noteOf(daySessions(1).slice(0, 4), 'consistency'), 'attendance cannot bypass the initial session gate');
});

test('notes use only the latest twelve valid sessions of the latest platform', () => {
  const old = many(12, () => 720, () => ({ startedAt: '2020-01-01T10:00:00Z', firstDistractionType: 'app_touched', firstDistractionApp: 'Instagram' }));
  const recent = many(12, () => 1200);
  const result = noteResult([...old, ...recent, session(99, { startedAt: '2030-01-01T10:00:00Z', focusSeconds: 60, firstDistractionType: 'app_touched' })]);
  assert(result.evidenceCount === 12 && !result.notes.some(n => n.id === 'top_trigger'), 'old or invalid sessions affected notes');
  const ios = noteResult([...slips(6), ...slips(6, { platform: 'ios', startedAt: '2026-11-01T10:00:00Z' })]);
  assert(ios.evidenceCount === 6 && ios.notes[0]?.text.startsWith('Your phone'), 'mixed-platform note evidence leaked');
});

test('priority order and three-note cap are fixed', () => {
  const rows = windowSessions(6).map(s => ({ ...s, firstDistractionType: 'app_touched' as const, firstDistractionApp: 'Instagram', cleanSeconds: s.cleanSeconds! - 60 }));
  const result = noteResult(rows);
  assert(result.notes.map(n => n.id).join(',') === 'top_trigger,slip_timing,best_window', JSON.stringify(result.notes));
});

test('headlines follow timing, improvement, decline, then typical stretch precedence', () => {
  assert(noteResult(slips(5)).headline === 'You hold focus for about 12 min, then something pulls you out.', 'timing headline missing');
  assert(noteResult(many(6, i => (i < 3 ? 1200 : 1500))).headline === narrativeCopy.COACH_COPY.gettingLonger, 'up headline missing');
  assert(noteResult(many(6, i => (i < 3 ? 1500 : 1200))).headline === narrativeCopy.COACH_COPY.gettingShorter, 'down headline missing');
  assert(noteResult(many(6, () => 1200)).headline === 'Your typical clean stretch is 20 min.', 'typical headline missing');
  assert(noteResult(slips(5).map(s => ({ ...s, cleanSeconds: 28 }))).headline === 'Your typical clean stretch is 28 sec.', 'sub-minute timing should use typical fallback');
});

test('too early selection contains only progress and remaining sessions', () => {
  for (const count of [0, 3, 4]) {
    const result = noteResult(many(count, () => 1200));
    assert(result.headline === narrativeCopy.COACH_COPY.tooEarly && result.tooEarlyRemaining === 5 - count, 'early result wrong');
    const free = selectCoachCardSections({ isPaid: false, result, platform: 'android' });
    const paid = selectCoachCardSections({ isPaid: true, result, platform: 'android' });
    assert(free.state === 'too_early' && free.notes.length === 0 && free.nextStep === null && free.experiment === null, 'early payload leaked content');
    assert(JSON.stringify(free) === JSON.stringify(paid), 'early states differ by entitlement');
  }
  assert(narrativeCopy.remainingSessionsCopy(1) === '1 more session', 'singular remaining session wrong');
});

test('next step is paid-only and uses strong time-of-day evidence', () => {
  assert(noteResult(slips(6), false).nextStep === null, 'free result has a next step');
  assert(noteResult(slips(3).slice(0, 3)).nextStep === null, 'null suggestion must have no next step');
  assert(noteResult(windowSessions(6)).nextStep?.text.includes('in the morning.'), 'strong morning window not used');
  assert(!noteResult(windowSessions(3)).nextStep?.text.includes('in the morning.'), 'weak morning window should use reason copy');
  const repeat = noteResult(many(6, () => 1200));
  assert(repeat.nextStep?.text === 'Try 30 min. Same as last time. Build on it.', 'suggestion reason not reused');
});

test('free selection unlocks just one note and locked payload contains only count, icons, weekly hint', () => {
  const rows = windowSessions(6).map(s => ({ ...s, firstDistractionType: 'app_touched' as const, cleanSeconds: s.cleanSeconds! - 60 }));
  const result = { ...noteResult(rows), experiment: coachResult().experiment };
  const free = selectCoachCardSections({ isPaid: false, result, platform: 'android' });
  assert(free.state === 'ready_free' && free.notes.length === 1 && free.experiment === null && free.nextStep === null, 'free content gate wrong');
  assert(JSON.stringify(free.lockedRow) === JSON.stringify({ count: 2, icons: ['clock', 'sun'], weeklyTest: true }), 'locked payload leaked data');
  for (const note of result.notes.slice(1)) assert(!JSON.stringify(free).includes(note.text), 'locked sentence leaked');
  assert(lockedTeaserCopy(free.lockedRow!) === '2 more notes \u00b7 A weekly test', 'locked hint wrong');
  const paid = selectCoachCardSections({ isPaid: true, result, platform: 'android' });
  assert(paid.notes.length === 3 && paid.lockedRow === null && paid.nextStep !== null && paid.experiment !== null, 'paid content missing');
  const inactive = selectCoachCardSections({ isPaid: true, result: { ...result, experiment: { ...result.experiment!, result: 'worked' } }, platform: 'android' });
  assert(inactive.experiment === null, 'completed experiment still shown');
});

test('all generated narrative and visual copy is short, safe, and grammatically complete', () => {
  const fixtures = [[], slips(4), slips(5), slips(10), slips(6, { platform: 'ios' }), slips(6, { firstDistractionType: 'camera_absence' }), slips(6).map(row => ({ ...row, cleanSeconds: 28 })), slips(6, { firstDistractionApp: 'com.instagram.android' }),
    windowSessions(3), windowSessions(6), windowSessions(3).map((row, index) => ({ ...row, startedAt: new Date(2026, 9, index + 1, index < 3 ? 14 : 19).toISOString() })), lengthSessions(3), lengthSessions(6), lengthSessions(3, .5, 1), modeSessions(3), modeSessions(6), restSessions(10), restSessions(12), daySessions(0), daySessions(1), daySessions(7)];
  const texts = [narrativeCopy.progressVisualCopy(0, 5), narrativeCopy.progressVisualCopy(4, 5), narrativeCopy.COACH_COPY.loading, narrativeCopy.MORE_PATTERNS_COPY, narrativeCopy.COACH_COPY.earlyRead, narrativeCopy.coachFootnote(120), narrativeCopy.remainingSessionsCopy(1), narrativeCopy.remainingSessionsCopy(2), narrativeCopy.evidenceLabel(1), narrativeCopy.evidenceLabel(12), lockedTeaserCopy({ count: 1, icons: ['clock'], weeklyTest: false }), lockedTeaserCopy({ count: 0, icons: [], weeklyTest: true })];
  for (const rows of fixtures) for (const paid of [true, false]) {
    const result = noteResult(rows, paid); texts.push(result.headline);
    if (result.nextStep) texts.push(result.nextStep.text);
    for (const note of result.notes) {
      texts.push(note.text);
      const v = note.visual;
      texts.push(v.kind === 'slip_bar' ? narrativeCopy.slipVisualCopy(v.typicalSeconds, v.maxSeconds)
        : v.kind === 'dots' ? narrativeCopy.dotsVisualCopy(v.hits, v.total)
        : v.kind === 'bars' ? narrativeCopy.barsVisualCopy(v.items, v.unit) : narrativeCopy.weekVisualCopy(v.days));
    }
  }
  for (const id of ['morning_session', 'shorter_sessions', 'phone_out_of_reach', 'five_minute_break'] as const) for (const day of [1, 7]) texts.push(narrativeCopy.weeklyTestCopy(id, day));
  for (const reason of ['step_up', 'repeat', 'ease_down', 'floor'] as const) {
    texts.push(narrativeCopy.nextStepCopy(55, reason, null, true));
    texts.push(narrativeCopy.nextStepCopy(55, reason, null, false));
  }
  const customNames = { reading: 'A'.repeat(30), writing: 'B'.repeat(30) };
  const custom = noteResult(modeSessions(3).map(row => ({ ...row, modeId: row.modeId === 'study' ? 'reading' : 'writing' })), true, customNames);
  texts.push(...custom.notes.map(note => note.text));
  for (const text of texts) assert(text.length <= 90 && !/\b(baseline|median|ratio|diagnosis|failed|lazy|bad)\b|\{| {2}|(?:[a-z_-]+\.){2}[a-z_-]+/i.test(text), text);
  assert(narrativeCopy.triggerNoteCopy(null, false, 1, 6).includes('1 of your last 6 sessions'), 'singular hit grammar wrong');
  assert(narrativeCopy.lockedNotesCopy(1) === '1 more note', 'singular locked note wrong');
});

test('repository resolves the earliest app label, custom modes, and defensive fallbacks', async () => {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE sessions (id INTEGER, started_at TEXT, clean_seconds INTEGER, focus_seconds INTEGER,
    first_distraction_type TEXT, pause_count INTEGER, paused_seconds INTEGER, ended_early INTEGER,
    duration_seconds INTEGER, mode_id TEXT, platform TEXT, ended_at TEXT, after_session_away_seconds INTEGER, after_session_away_verified INTEGER);
    CREATE TABLE distraction_events (id INTEGER, session_id INTEGER, type TEXT, app_identifier TEXT, occurred_at TEXT);
    CREATE TABLE flagged_apps (app_identifier TEXT, display_name TEXT);
    CREATE TABLE custom_modes (id TEXT, name TEXT);
    INSERT INTO flagged_apps VALUES ('com.instagram.android','Instagram'),('com.youtube.app','YouTube');
    INSERT INTO custom_modes VALUES ('custom-one','Reading'),('custom-two','Writing');`);
  const insert = db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for (let index = 1; index <= 6; index++) {
    insert.run(index, new Date(2026, 9, index, 10).toISOString(), 720, 1800, 'app_touched', 0, 0, 0, 1800, 'deep-work', 'android', new Date(2026, 9, index, 11).toISOString(), null, 0);
    db.prepare('INSERT INTO distraction_events VALUES (?,?,?,?,?)').run(index * 2, index, 'app_touched', 'com.youtube.app', '2026-10-01T10:20:00Z');
    db.prepare('INSERT INTO distraction_events VALUES (?,?,?,?,?)').run(index * 2 + 1, index, 'app_touched', 'com.instagram.android', '2026-10-01T10:10:00Z');
  }
  let failLabels = false;
  const database = { getAllAsync: async (sql: string) => { if (failLabels && /FROM distraction_events|FROM custom_modes/.test(sql)) throw new Error('fixture label failure'); return db.prepare(sql).all(); } };
  const module = { exports: {} as typeof import('../src/data/focusCoachRepository') };
  const source = require('node:fs').readFileSync('src/data/focusCoachRepository.ts', 'utf8');
  require('node:vm').runInNewContext(transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText, {
    exports: module.exports, console: { warn: () => {} }, require: (id: string) => {
      if (id === 'react-native') return { Platform: { OS: 'android' } };
      if (id === './coachDataEvents') return require('../src/data/coachDataEvents');
      if (id === './database') return { getDatabase: async () => database, ensureSchema: async () => {} };
      if (id === './appStateRepository') return { getAppState: async () => null, setAppState: async () => {} };
      if (id === '../domain/awayTime') return { getAwayDisplay: async () => null };
      if (id === '../domain/focusCoachAway') return { safeLoadFocusCoachAway: async () => null };
      if (id === '../domain/focusCoachCopy') return { ...narrativeCopy, buildFocusCoachCopy: async () => ({}) };
      return require('../src/domain/' + id.replace('../domain/', ''));
    },
  });
  const result = await module.exports.loadFocusCoachData({ isPaidUser: true });
  assert(result.notes[0]?.text.startsWith('Instagram'), 'repository did not select the earliest app event');
  assert(result.nextStep !== null, 'paid flag did not reach the engine');
  db.exec("UPDATE sessions SET first_distraction_type = NULL, mode_id = CASE WHEN id <= 3 THEN 'custom-one' ELSE 'custom-two' END, clean_seconds = CASE WHEN id <= 3 THEN 1620 ELSE 900 END;");
  const custom = await module.exports.loadFocusCoachData({ isPaidUser: true });
  assert(custom.notes.some(note => note.text === 'Reading sessions run cleaner than Writing.'), 'custom mode names did not reach note analysis');
  db.exec("UPDATE sessions SET first_distraction_type = 'app_touched', mode_id = 'deep-work', clean_seconds = 720;");
  failLabels = true;
  const fallback = await module.exports.loadFocusCoachData();
  assert(fallback.notes[0]?.text.startsWith('Your phone') && fallback.nextStep === null, 'defensive fallback or free next step is wrong');
  db.close();
});

function pendingOf(rows: FocusCoachSession[], id: FocusCoachResult['pending'][number]['id'], awayTrackingOptedIn = false) {
  return evaluateFocusCoach(rows, null, null, { now: NOTE_NOW, awayTrackingOptedIn }).pending.find(row => row.id === id);
}

test('pending progress uses each note gate below and at its boundary', () => {
  const check = (rows: FocusCoachSession[], id: FocusCoachResult['pending'][number]['id'], have: number, need: number, optedIn = false) => {
    const row = pendingOf(rows, id, optedIn);
    assert(row?.have === have && row.need === need, id + ': ' + JSON.stringify(row));
  };
  check(slips(3), 'top_trigger', 3, 4);
  assert(!pendingOf(slips(4), 'top_trigger'), 'unlocked trigger remains pending');
  check(slips(4), 'slip_timing', 4, 5);
  assert(!pendingOf(slips(5), 'slip_timing'), 'unlocked timing remains pending');
  check(windowSessions(3).filter((_, index) => index !== 0), 'best_window', 2, 3);
  assert(!pendingOf(windowSessions(3), 'best_window'), 'unlocked window remains pending');
  check(lengthSessions(3).slice(0, -1), 'best_length', 2, 3);
  assert(!pendingOf(lengthSessions(3), 'best_length'), 'unlocked length remains pending');
  check(many(6, () => 1200), 'best_length', 0, 3);
  check(modeSessions(3).slice(0, -1), 'best_mode', 2, 3);
  assert(!pendingOf(modeSessions(3), 'best_mode'), 'unlocked mode remains pending');
  check(many(6, () => 1200), 'best_mode', 0, 3);
  check(restSessions(9), 'rest_before', 9, 10, true);
  assert(!pendingOf(restSessions(10), 'rest_before', true), 'unlocked rest remains pending');
  check(daySessions(1), 'consistency', 1, 2);
  assert(!pendingOf(daySessions(2), 'consistency'), 'unlocked attendance remains pending');
});

test('pending remains pending when counts pass but pattern evidence does not', () => {
  const varied = slips(4).map((s, i) => ({ ...s, firstDistractionApp: 'App ' + i }));
  assert(pendingOf(varied, 'top_trigger')?.have === 4, 'source recurrence is still required');
  assert(pendingOf(windowSessions(3).map(s => ({ ...s, cleanSeconds: 1200 })), 'best_window')?.have === 3, 'window advantage is still required');
  assert(pendingOf(modeSessions(3, .8, .8), 'best_mode')?.have === 3, 'mode advantage is still required');
  assert(pendingOf(lengthSessions(3, .8, .8), 'best_length')?.have === 3, 'length advantage is still required');
});

test('pending ordering is distance to gate then fixed note priority', () => {
  const result = noteResult(daySessions(0));
  assert(result.pending.map(row => row.id).join(',') === 'consistency,best_window,best_length,best_mode,top_trigger,slip_timing', JSON.stringify(result.pending));
  for (const row of result.pending) assert(!result.notes.some(note => note.id === row.id), 'unlocked note repeated in pending');
});

test('rest pending needs Android and explicit away opt-in', () => {
  assert(!pendingOf(restSessions(9), 'rest_before'), 'off-by-default rest pending leaked');
  assert(pendingOf(restSessions(9), 'rest_before', true), 'opted-in rest progress missing');
  assert(!pendingOf(restSessions(9).map(s => ({ ...s, platform: 'ios' })), 'rest_before', true), 'iOS rest pending leaked');
  const rows = restSessions(9).map((s, index) => ({ ...s, afterSessionAwayVerified: index < 4, afterSessionAwaySeconds: index === 3 ? null : s.afterSessionAwaySeconds }));
  assert(pendingOf(rows, 'rest_before', true)?.have === 3, 'pending counted unverified or missing away values');
});

test('selection fills three total rows with pending and respects free rules', () => {
  const rich = noteResult(windowSessions(6).map(s => ({ ...s, firstDistractionType: 'app_touched' as const, cleanSeconds: s.cleanSeconds! - 60 })));
  const pending = noteResult(daySessions(0)).pending.filter(row => !rich.notes.some(note => note.id === row.id));
  for (const count of [0, 1, 2, 3]) {
    const result = { ...rich, notes: rich.notes.slice(0, count), pending };
    const paid = selectCoachCardSections({ isPaid: true, result, platform: 'android' });
    assert(paid.notes.length + paid.pending.length === 3 && paid.pending.length === 3 - count, 'paid rows wrong for ' + count);
    const free = selectCoachCardSections({ isPaid: false, result, platform: 'android' });
    assert(free.notes.length === Math.min(1, count) && free.pending.length === (count === 0 ? 3 : 0), 'free pending gate wrong for ' + count);
    if (count > 1) assert(free.lockedRow?.count === count - 1, 'locked note count changed');
  }
  const early = selectCoachCardSections({ isPaid: true, result: noteResult(daySessions(1).slice(0, 3)), platform: 'android' });
  assert(early.state === 'too_early' && early.pending.length === 0, 'early progress card changed');
});

test('consistency is factual at two days and never weak', () => {
  assert(!noteOf(daySessions(1), 'consistency'), 'one day must not unlock regular attendance');
  for (const days of [2, 3, 7]) assert(noteOf(daySessions(days), 'consistency')?.weak === false, 'attendance must never be weak');
});

test('all new pending and dev strings meet the copy rules', () => {
  for (const [id, value] of Object.entries(narrativeCopy.PENDING_NOTE_COPY)) {
    assert(value.title.length <= 40 && value.hint.length <= 60, id + ' copy too long');
    const accessibility = narrativeCopy.pendingAccessibilityCopy({ ...value, have: 1, need: 3 });
    assert(!accessibility.includes('..'), accessibility);
    for (const text of [value.title, value.hint, accessibility]) assert(!/\b(baseline|median|ratio|diagnosis|failed|lazy|bad)\b|\{| {2}/i.test(text), text);
  }
  assert(narrativeCopy.pendingProgressCopy('best_window', 2, 3) === null, 'group progress must use dots');
  assert(narrativeCopy.pendingProgressCopy('top_trigger', 3, 4) === '3 of 4 breaks seen', 'break unit missing');
  assert(narrativeCopy.pendingProgressCopy('rest_before', 9, 10) === '9 of 10 sessions', 'session unit missing');
  assert(narrativeCopy.pendingProgressCopy('consistency', 1, 2) === '1 of 2 days', 'day unit missing');
  for (const text of [narrativeCopy.COMING_UP_COPY, ...Object.values(narrativeCopy.COACH_SAMPLE_COPY), narrativeCopy.weeklyTestTitle('five_minute_break'), narrativeCopy.experimentDayCopy(3)]) {
    assert(text.length <= 90 && !/\b(baseline|median|ratio|diagnosis|failed|lazy|bad)\b|\{| {2}/i.test(text), text);
  }
});

test('dev sample load/remove uses the real schema, lights all gates, and restores real data', async () => {
  const { DatabaseSync } = require('node:sqlite');
  const { readFileSync } = require('node:fs');
  const { runInNewContext } = require('node:vm');
  const db = new DatabaseSync(':memory:');
  let failInsert = false;
  const adapter = {
    execAsync: async (sql: string) => db.exec(sql),
    getAllAsync: async (sql: string, params: unknown[] = []) => db.prepare(sql).all(...params),
    getFirstAsync: async (sql: string, params: unknown[] = []) => db.prepare(sql).get(...params) ?? null,
    runAsync: async (sql: string, params: unknown[] = []) => {
      if (failInsert && /INSERT INTO sessions/.test(sql)) throw new Error('fixture insert failure');
      const result = db.prepare(sql).run(...params);
      return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
    },
    withTransactionAsync: async (work: () => Promise<void>) => {
      db.exec('BEGIN');
      try { await work(); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
  const fixedDate = class extends Date {
    constructor(value: any = NOTE_NOW) { super(value); }
    static now() { return NOTE_NOW; }
  };
  const loadModule = (file: string, dependencies: (id: string) => unknown, dev = true) => {
    const module = { exports: {} as any };
    runInNewContext(transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText,
      { exports: module.exports, require: dependencies, __DEV__: dev, Date: fixedDate, console });
    return module.exports;
  };
  const schema = loadModule('src/data/database.ts', () => ({ openDatabaseAsync: async () => adapter }));
  await schema.ensureSchema(adapter);
  db.exec(`INSERT INTO flagged_apps VALUES ('com.real.app','Real flagged app',NULL);
    INSERT INTO custom_modes VALUES ('real-mode','Real custom mode',5,15,40);
    INSERT INTO sessions (mode_id,started_at,duration_seconds,completed,distraction_count,lockdown_minutes,
      focus_seconds,clean_seconds,first_distraction_type,pause_count,paused_seconds,ended_early,platform,ended_at)
      VALUES ('deep-work','2020-01-01T10:00:00Z',1800,1,1,0,1800,1200,'app_touched',1,30,0,'android','2020-01-01T10:30:30Z');
    INSERT INTO distraction_events (session_id,type,app_identifier,occurred_at) VALUES (1,'app_touched','com.real.app','2020-01-01T10:20:30Z');
    INSERT INTO session_pauses (session_id,paused_at,resumed_at) VALUES (1,'2020-01-01T10:02:00Z','2020-01-01T10:02:30Z');
    UPDATE streaks SET current_streak=3,best_streak=9,total_sessions_completed=17;`);
  const originalExperiment = JSON.stringify({ id: 'phone_out_of_reach', startedAt: '2020-01-01T10:00:00Z' });
  await adapter.runAsync('INSERT OR REPLACE INTO app_state VALUES (?,?);', ['coach_experiment', originalExperiment]);
  await adapter.runAsync('INSERT OR REPLACE INTO app_state VALUES (?,?);', ['coach_variant_steady', '{"index":1,"validCount":12}']);
  const tables = ['sessions', 'session_pauses', 'distraction_events', 'streaks', 'flagged_apps', 'custom_modes', 'app_state'];
  const snapshot = () => JSON.stringify(Object.fromEntries(tables.map(table => [table, db.prepare('SELECT * FROM ' + table + ' ORDER BY 1;').all()])));
  const before = snapshot();
  const events = require('../src/data/coachDataEvents');
  let notifications = 0;
  const unsubscribe = events.subscribeCoachDataChanges(() => notifications++);
  const platform = { OS: 'android' };
  let tierEnabled = true;
  const dependencies = (id: string): unknown => {
    if (id === 'react-native') return { Platform: platform };
    if (id === '../domain/paywall') return { TIER_SWITCHER_ENABLED: tierEnabled };
    if (id === './database') return { getDatabase: async () => adapter, ensureSchema: schema.ensureSchema };
    if (id === './coachDataEvents') return events;
    return require('../src/domain/' + id.replace('../domain/', ''));
  };
  const samples = loadModule('src/data/coachSampleRepository.ts', dependencies) as typeof import('../src/data/coachSampleRepository');
  try {
    await samples.loadSampleSessions();
    const ids = JSON.parse(db.prepare('SELECT value FROM app_state WHERE key=?').get(events.DEV_SAMPLE_SESSION_IDS_KEY).value);
    assert(ids.length === 16 && db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n === 17, 'sample ownership or row count wrong');
    assert(db.prepare('SELECT COUNT(*) AS n FROM session_pauses WHERE session_id<>1').get().n === 16, 'sample pauses missing');
    const rows = db.prepare('SELECT * FROM sessions WHERE id<>1 ORDER BY started_at').all();
    const sessions = rows.map((row: any) => {
      const pause = db.prepare('SELECT * FROM session_pauses WHERE session_id=?').get(row.id);
      const event = db.prepare('SELECT * FROM distraction_events WHERE session_id=? ORDER BY occurred_at LIMIT 1').get(row.id);
      const grace = row.mode_id === 'study' ? 12 : 5;
      const measuredClean = event ? Math.min(row.focus_seconds, (Date.parse(event.occurred_at) - Date.parse(row.started_at)) / 1000 - row.paused_seconds - (event.type === 'camera_absence' ? grace : 0)) : row.focus_seconds;
      assert(row.clean_seconds === measuredClean && row.pause_count === 1 && row.paused_seconds === 30, 'sample differs from the session-end writer');
      assert(Date.parse(row.ended_at) - Date.parse(row.started_at) === (row.focus_seconds + row.paused_seconds) * 1000, 'focus/pause/end time mismatch');
      assert(Date.parse(pause.resumed_at) - Date.parse(pause.paused_at) === 30000, 'pause duration mismatch');
      if (event) assert(Date.parse(event.occurred_at) <= Date.parse(row.ended_at), 'event is after the session ended');
      return session(row.id, { startedAt: row.started_at, endedAt: row.ended_at, modeId: row.mode_id,
        cleanSeconds: row.clean_seconds, focusSeconds: row.focus_seconds, durationSeconds: row.duration_seconds,
        firstDistractionType: row.first_distraction_type, firstDistractionApp: event?.app_identifier ? 'Real flagged app' : null,
        pauseCount: row.pause_count, pausedSeconds: row.paused_seconds,
        afterSessionAwaySeconds: row.after_session_away_seconds, afterSessionAwayVerified: row.after_session_away_verified === 1 });
    });
    const result = evaluateFocusCoach(sessions, null, null, { now: NOTE_NOW, isPaidUser: true, awayTrackingOptedIn: true });
    assert(result.notes.map(note => note.id).join(',') === 'top_trigger,slip_timing,best_window', JSON.stringify(result.notes));
    assert(result.pending.length === 0, 'sample did not pass all seven note gates: ' + JSON.stringify(result.pending));
    assert(result.notes[0].text.includes('Real flagged app'), 'sample did not reuse the real flagged app');
    const recentSix = sessions.slice(-6);
    assert(recentSix.filter((s: FocusCoachSession) => s.firstDistractionType === 'app_touched').length === 4, 'sample needs four primary-app slips in the last six');
    let copyWrites = 0;
    const repository = loadModule('src/data/focusCoachRepository.ts', id => {
      if (id === './appStateRepository') return {
        getAppState: async (key: string) => db.prepare('SELECT value FROM app_state WHERE key=?').get(key)?.value ?? null,
        setAppState: async (key: string, value: string) => { copyWrites++; await adapter.runAsync('INSERT OR REPLACE INTO app_state VALUES (?,?);', [key, value]); },
      };
      if (id === '../domain/awayTime') return { getAwayDisplay: async () => null, isAwayTrackingOptedIn: async () => true };
      if (id === '../domain/focusCoachAway') return { safeLoadFocusCoachAway: async () => null };
      if (id === '../domain/focusCoachCopy') return { ...narrativeCopy, buildFocusCoachCopy: async () => { copyWrites++; return {}; } };
      return dependencies(id);
    });
    await repository.loadFocusCoachData({ isPaidUser: true });
    assert(copyWrites === 0 && db.prepare('SELECT value FROM app_state WHERE key=?').get('coach_experiment').value === originalExperiment, 'sample preview changed persisted coaching state');
    const loaded = snapshot();
    failInsert = true;
    let failed = false; try { await samples.loadSampleSessions(); } catch { failed = true; }
    failInsert = false;
    assert(failed && snapshot() === loaded, 'failed reload was not atomic');
    await Promise.all([samples.loadSampleSessions(), samples.loadSampleSessions()]);
    assert(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n === 17, 'loading twice duplicated samples');
    await samples.removeSampleSessions();
    assert(snapshot() === before, 'removal did not restore real sessions, children, settings, streaks and app state');
    await samples.removeSampleSessions();
    assert(snapshot() === before, 'second removal changed real data');
    assert(notifications === 5, 'committed changes did not refresh coach/history');
    platform.OS = 'ios';
    await samples.loadSampleSessions();
    assert(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE platform=?').get('ios').n === 16, 'sample platform is wrong');
    assert(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE platform=? AND after_session_away_verified IS NOT NULL').get('ios').n === 0, 'iOS samples fabricated verified away time');
    await samples.removeSampleSessions();
    assert(snapshot() === before, 'iOS sample removal changed original state');
    db.exec('DELETE FROM flagged_apps;');
    const withoutFlaggedApps = snapshot();
    platform.OS = 'android';
    await samples.loadSampleSessions();
    const fallbackApps = db.prepare('SELECT DISTINCT app_identifier FROM distraction_events WHERE session_id <> 1 AND app_identifier IS NOT NULL').all().map((row: any) => row.app_identifier);
    assert(fallbackApps.includes('com.instagram.android') && fallbackApps.includes('com.google.android.youtube'), 'fallback apps were not used');
    await samples.removeSampleSessions();
    assert(snapshot() === withoutFlaggedApps, 'fallback sampling added settings or left rows behind');
    db.exec("INSERT INTO flagged_apps VALUES ('com.real.app','Real flagged app',NULL);");
    for (const dev of [false, true]) {
      tierEnabled = dev ? false : true;
      const guarded = loadModule('src/data/coachSampleRepository.ts', dependencies, dev);
      let refused = false; try { await guarded.loadSampleSessions(); } catch { refused = true; }
      assert(refused && snapshot() === before, 'sample action is reachable outside the dev guard');
    }
  } finally { unsubscribe(); db.close(); }
});

test('release compilation removes sample actions and dynamic repository import', async () => {
  const { build } = require('esbuild');
  const output = await build({ entryPoints: ['src/components/DevCoachSampleControls.tsx'], bundle: true,
    packages: 'external', write: false, minify: true, define: { __DEV__: 'false' } });
  const code = output.outputFiles[0].text;
  assert(!/coachSampleRepository|dev_sample_session_ids|INSERT INTO sessions/.test(code), 'sample implementation leaked into release controls');
});

async function main() {
  let failed = 0;
  for (const item of cases) {
    try {
      await item.run();
      console.log(`PASS ${item.name}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`FAIL ${item.name}: ${message}`);
    }
  }

  if (failed > 0) {
    process.exit(1);
  }
}

void main();
