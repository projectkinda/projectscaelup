import { evaluateFocusCoach, type FocusCoachSession } from '../src/domain/focusCoach';

function session(
  override: Partial<FocusCoachSession> & { id: number; startedAt: string },
): FocusCoachSession {
  return {
    cleanSeconds: 0,
    focusSeconds: 300,
    firstDistractionType: null,
    pauseCount: 0,
    endedEarly: false,
    durationSeconds: 300,
    modeId: 'deep-work',
    platform: 'android',
    ...override,
  };
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const mixedPlatforms = evaluateFocusCoach([
  session({
    id: 1,
    startedAt: '2026-10-01T10:00:00.000Z',
    cleanSeconds: 600,
    durationSeconds: 600,
    platform: 'ios',
  }),
  session({
    id: 2,
    startedAt: '2026-10-02T10:00:00.000Z',
    cleanSeconds: 180,
    durationSeconds: 300,
    platform: 'android',
    firstDistractionType: 'app_touched',
  }),
]);

assert(
  mixedPlatforms.baseline.latestPlatform === 'android',
  'Coach should use only the latest platform history.',
);
assert(
  mixedPlatforms.baseline.eligibleSessionCount === 1,
  'Older platform sessions should be ignored.',
);
assert(
  mixedPlatforms.paid.suggestionMinutes === 5,
  'A below-threshold clean ratio should suggest the current clean length rounded to 5 minutes.',
);

const addedTime = evaluateFocusCoach([
  session({
    id: 3,
    startedAt: '2026-10-03T10:00:00.000Z',
    cleanSeconds: 1620,
    focusSeconds: 1620,
    durationSeconds: 1500,
  }),
]);

assert(
  addedTime.baseline.currentCleanRatio !== null &&
    addedTime.baseline.currentCleanRatio > 1,
  'Add-time sessions may have clean ratios above 1.',
);
assert(
  addedTime.paid.suggestionMinutes === 30,
  'A clean 25 minute session should step up to 30 minutes.',
);

const earlyEnd = evaluateFocusCoach([
  session({
    id: 4,
    startedAt: '2026-10-04T10:00:00.000Z',
    cleanSeconds: 140,
    focusSeconds: 140,
    durationSeconds: 900,
    endedEarly: true,
  }),
]);

assert(
  earlyEnd.baseline.eligibleSessionCount === 1,
  'End Early should count when focus_seconds is at least 120.',
);

const pauseOverrun = evaluateFocusCoach([
  session({
    id: 5,
    startedAt: '2026-10-05T10:00:00.000Z',
    cleanSeconds: 240,
    durationSeconds: 600,
    firstDistractionType: 'pause_overrun',
  }),
  session({
    id: 6,
    startedAt: '2026-10-06T10:00:00.000Z',
    cleanSeconds: 240,
    durationSeconds: 600,
    firstDistractionType: 'pause_overrun',
  }),
]);

assert(
  pauseOverrun.paid.primaryPattern === 'pause_overrun',
  'Pause overruns should be available as first-break patterns.',
);

console.log('Focus coach fixtures passed.');
