import {
  evaluateFocusCoach,
  type FocusCoachResult,
  type FocusCoachDistractionType,
  type FocusCoachExperiment,
  type FocusCoachSession,
} from '../src/domain/focusCoach';
import { selectCoachCardSections } from '../src/domain/focusCoachCardSections';
import {
  formatDiagnosisDetail,
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
  assert(minutes >= 10 && minutes <= 59, 'suggestion should be within 10..59');
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
    latestPlatform: 'android',
    validCount: 5,
    baselineTarget: 5,
    state: 'steady',
    currentCleanSeconds: 20 * 60,
    beforeCleanSeconds: null,
    suggestionMinutes: 25,
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
  assert(headline?.includes('down'), `got ${headline}`);
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

test('suggestion always within 10..59 and a multiple of 5', () => {
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

test('formatDiagnosisDetail includes evidence count and weak signal copy only when weak', () => {
  const details = [
    {
      detail: {
        kind: 'early_breaker' as const,
        typicalFirstBreakSeconds: 6 * 60,
        typicalPlannedSeconds: 25 * 60,
        brokenCount: 6,
      },
      count: 6,
    },
    {
      detail: {
        kind: 'late_breaker' as const,
        typicalFirstBreakSeconds: 21 * 60,
        typicalPlannedSeconds: 25 * 60,
        brokenCount: 7,
      },
      count: 7,
    },
    {
      detail: {
        kind: 'best_window' as const,
        window: 'morning' as const,
        windowMedianCleanSeconds: 30 * 60,
        overallMedianCleanSeconds: 21 * 60,
        sessionsInWindow: 3,
      },
      count: 3,
    },
    {
      detail: {
        kind: 'app_heavy' as const,
        sharePct: 70,
        brokenCount: 10,
      },
      count: 10,
    },
    {
      detail: {
        kind: 'camera_heavy' as const,
        sharePct: 70,
        brokenCount: 10,
      },
      count: 10,
    },
  ];

  for (const item of details) {
    const strong = formatDiagnosisDetail(item.detail, false);
    const weak = formatDiagnosisDetail(item.detail, true);
    assert(strong.includes(`Based on ${item.count} sessions.`), strong);
    assert(!strong.includes('Early signal'), strong);
    assert(weak.includes(`Based on ${item.count} sessions.`), weak);
    assert(weak.includes('Early signal'), weak);
  }
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

test('coach card selector: baseline 0/5 has no locked sections', () => {
  const selected = selectCoachCardSections({
    isPaid: false,
    result: coachResult({
      validCount: 0,
      state: 'building_baseline',
      currentCleanSeconds: null,
      cleanTrend: null,
      lastSession: null,
      away: null,
      awayInsight: null,
      diagnosis: null,
      experiment: null,
    }),
    platform: 'android',
  });
  assert(selected.state === 'baseline', `got ${selected.state}`);
  assert(selected.sections.length === 0, 'expected no sections');
  assert(selected.lockedSections.length === 0, 'expected no locks');
});

test('coach card selector: baseline 3/5 free and paid are identical', () => {
  const result = coachResult({
    validCount: 3,
    state: 'building_baseline',
    suggestionMinutes: null,
    experiment: null,
  });
  const free = selectCoachCardSections({ isPaid: false, result, platform: 'android' });
  const paid = selectCoachCardSections({ isPaid: true, result, platform: 'android' });
  assert(JSON.stringify(free) === JSON.stringify(paid), 'expected identical baseline state');
});

test('coach card selector: 5/5 free locks available sections', () => {
  const selected = selectCoachCardSections({
    isPaid: false,
    result: coachResult(),
    platform: 'android',
  });
  assert(selected.state === 'ready_free', `got ${selected.state}`);
  assert(selected.lockedSections.length === 5, `got ${selected.lockedSections.length}`);
});

test('coach card selector: 5/5 paid unlocks available sections', () => {
  const selected = selectCoachCardSections({
    isPaid: true,
    result: coachResult(),
    platform: 'android',
  });
  assert(selected.state === 'ready_paid', `got ${selected.state}`);
  assert(selected.sections.length === 5, `got ${selected.sections.length}`);
  assert(selected.lockedSections.length === 0, 'expected no locks');
});

test('coach card selector: paid with away null hides away', () => {
  const selected = selectCoachCardSections({
    isPaid: true,
    result: coachResult({ away: null }),
    platform: 'android',
  });
  assert(!selected.sections.some(section => section.id === 'away'), 'away should be hidden');
});

test('coach card selector: paid on iOS hides away', () => {
  const selected = selectCoachCardSections({
    isPaid: true,
    result: coachResult(),
    platform: 'ios',
  });
  assert(!selected.sections.some(section => section.id === 'away'), 'away should be hidden');
});

test('coach card selector: free on iOS has no away locked row', () => {
  const selected = selectCoachCardSections({
    isPaid: false,
    result: coachResult(),
    platform: 'ios',
  });
  assert(!selected.lockedSections.includes('away'), 'away should not lock on iOS');
});

test('coach card selector: pause_overrun lastSession keeps last session section', () => {
  const selected = selectCoachCardSections({
    isPaid: true,
    result: coachResult({
      lastSession: {
        endedAt: '2026-10-20T10:30:00.000Z',
        plannedSeconds: 30 * 60,
        focusSeconds: 30 * 60,
        cleanSeconds: 12 * 60,
        endedBy: 'pause_overrun',
        firstDistractionType: null,
        firstDistractionAtSeconds: null,
        pauseCount: 1,
        pausedSeconds: 420,
        endedEarly: false,
      },
    }),
    platform: 'android',
  });
  assert(selected.sections.some(section => section.id === 'last_session'), 'expected last session');
});

test('coach card selector: no lastSession hides last session section', () => {
  const selected = selectCoachCardSections({
    isPaid: true,
    result: coachResult({ lastSession: null }),
    platform: 'android',
  });
  assert(!selected.sections.some(section => section.id === 'last_session'), 'last session should be hidden');
});

test('locked teasers do not leak diagnosis paid content', () => {
  const result = coachResult();
  const teaser = lockedTeaserCopy('diagnosis', result);
  const paidText = result.diagnosisDetail
    ? formatDiagnosisDetail(result.diagnosisDetail, result.weakEvidence)
    : null;
  assert(teaser !== null, 'expected teaser');
  assert(!/\d/.test(teaser ?? ''), `got ${teaser}`);
  assert(teaser !== paidText, 'teaser matched paid text');
});

test('locked teasers do not leak experiment paid content', () => {
  const result = coachResult();
  const teaser = lockedTeaserCopy('experiment', result);
  const paidText = 'put your phone out of reach';
  assert(teaser !== null, 'expected teaser');
  assert(!/\d/.test(teaser ?? ''), `got ${teaser}`);
  assert(teaser !== paidText, 'teaser matched paid text');
});

test('locked teasers do not leak away paid content', () => {
  const result = coachResult();
  const teaser = lockedTeaserCopy('away', result);
  const paidText = 'Away since your last use: about 1 h 30 min';
  assert(teaser !== null, 'expected teaser');
  assert(!/\d/.test(teaser ?? ''), `got ${teaser}`);
  assert(teaser !== paidText, 'teaser matched paid text');
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
