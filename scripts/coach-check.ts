import {
  evaluateFocusCoach,
  type FocusCoachDistractionType,
  type FocusCoachExperiment,
  type FocusCoachSession,
} from '../src/domain/focusCoach';
import {
  safeCopyLine,
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

test('best_window can trigger from clean sessions', () => {
  const result = evaluateFocusCoach([
    ...many(3, () => 30 * 60, index => ({
      startedAt: new Date(Date.UTC(2026, 9, index + 1, 8)).toISOString(),
    })),
    ...many(3, () => 15 * 60, index => ({
      id: 10 + index,
      startedAt: new Date(Date.UTC(2026, 9, index + 1, 14)).toISOString(),
    })),
    ...many(3, () => 15 * 60, index => ({
      id: 20 + index,
      startedAt: new Date(Date.UTC(2026, 9, index + 1, 20)).toISOString(),
    })),
  ]);
  assert(result.diagnosis === 'best_window', `got ${result.diagnosis}`);
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
