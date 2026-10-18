import { BUILT_IN_MODES } from './sessionModes';
import {
  PENDING_NOTE_COPY, COACH_COPY, COACH_WINDOW_LABELS, readableCoachLabel, triggerNoteCopy, slipTimingCopy,
  bestWindowCopy, bestLengthCopy, bestModeCopy, restBeforeCopy, consistencyCopy,
  narrativeHeadlineCopy, nextStepCopy,
} from './focusCoachCopy';

export const MIN_BASELINE_SESSIONS = 5;
export const WINDOW = 5;
export const MIN_FOCUS_SECONDS = 120;
export const IMPROVE_PCT = 0.10;
export const IMPROVE_MIN_SECONDS = 120;
export const SLIP_PCT = 0.15;
export const STEP_UP_RATIO = 0.9;
export const STEP_DOWN_RATIO = 0.6;
export const STEP_MINUTES = 5;
export const MIN_SUGGEST_MIN = 5;
export const MAX_SUGGEST_MIN = 59;
export const DIAG_MIN_SESSIONS = 6;
export const AWAY_BREAK_SPLIT_SECONDS = 60 * 60;
export const AWAY_SIMILAR_THRESHOLD_PCT = 10;

// A twelve-session window keeps observations recent and comparable.
export const NOTE_SESSION_LIMIT = 12;
// Four observed slips avoid calling a lone event a recurring source.
export const TOP_TRIGGER_MIN_SLIPS = 4;
// Three matching slips establish repetition rather than isolated events.
export const TOP_TRIGGER_MIN_HITS = 3;
// A source must explain at least half the slips to be the leading trigger.
export const TOP_TRIGGER_MIN_SHARE = 0.5;
// Five slip times provide enough observations for a middle and spread.
export const SLIP_TIMING_MIN_SLIPS = 5;
// Three sessions per time bucket mirror the existing time-of-day gate.
export const BEST_WINDOW_MIN_SESSIONS = 3;
// Three sessions per length group avoid one-off comparisons.
export const BEST_LENGTH_MIN_GROUP = 3;
// Five minutes separate meaningfully different planned lengths.
export const BEST_LENGTH_MIN_DIFFERENCE_SECONDS = 5 * 60;
// Fifteen percentage points exclude small length-group fluctuations.
export const BEST_LENGTH_MIN_DIFFERENCE_POINTS = 15;
// Three sessions per mode avoid calling a one-off success a pattern.
export const BEST_MODE_MIN_GROUP = 3;
// Two eligible modes are necessary for a comparison.
export const BEST_MODE_MIN_MODES = 2;
// Fifteen percentage points exclude small mode fluctuations.
export const BEST_MODE_MIN_DIFFERENCE_POINTS = 15;
// Ten verified gaps mirror the existing away-insight gate.
export const REST_BEFORE_MIN_SESSIONS = 10;
// Three verified gaps per bucket mirror the existing away comparison.
export const REST_BEFORE_MIN_GROUP = 3;
// Two distinct days establish regular attendance; this remains a fact, never a weak inference.
export const CONSISTENCY_MIN_DAYS = 2;
export const CONSISTENCY_WINDOW_DAYS = 7;
export const MAX_COACH_NOTES = 3;

export type CoachNote = {
  id: 'top_trigger' | 'slip_timing' | 'best_window' | 'best_length' | 'best_mode' | 'rest_before' | 'consistency';
  icon: 'device-mobile' | 'clock' | 'sun' | 'ruler' | 'layout' | 'hourglass' | 'calendar';
  text: string;
  weak: boolean;
  visual:
    | { kind: 'slip_bar'; typicalSeconds: number; lowSeconds: number; highSeconds: number; maxSeconds: number }
    | { kind: 'dots'; hits: number; total: number }
    | { kind: 'bars'; items: { label: string; value: number; best: boolean }[]; unit: 'seconds' | 'percent' }
    | { kind: 'week_dots'; days: boolean[] };
};
export type PendingNote = {
  id: CoachNote['id']; icon: CoachNote['icon']; title: string; have: number; need: number; hint: string;
};
export type FocusCoachOptions = {
  isPaidUser?: boolean; now?: number; modeNames?: Record<string, string>;
  awayTrackingOptedIn?: boolean; platform?: string;
};

export type FocusCoachDistractionType =
  | 'camera_absence'
  | 'app_touched'
  | 'pause_overrun';

export type FocusCoachState =
  | 'building_baseline'
  | 'steady'
  | 'slipping'
  | 'improving'
  | 'plateau';

export type FocusCoachDiagnosis =
  | 'early_breaker'
  | 'late_breaker'
  | 'best_window'
  | 'app_heavy'
  | 'camera_heavy';

export type FocusCoachWindow = 'morning' | 'afternoon' | 'evening';

export type FocusCoachExperimentId =
  | 'morning_session'
  | 'shorter_sessions'
  | 'phone_out_of_reach'
  | 'five_minute_break';

export type FocusCoachExperimentStatus = 'worked' | 'didnt_work' | 'unclear';

export type FocusCoachSession = {
  id: number;
  startedAt: string;
  endedAt?: string | null;
  cleanSeconds: number | null;
  focusSeconds: number | null;
  firstDistractionType: FocusCoachDistractionType | null;
  firstDistractionApp?: string | null;
  pauseCount: number | null;
  pausedSeconds?: number | null;
  endedEarly: boolean;
  durationSeconds: number;
  modeId: string;
  platform: string | null;
  afterSessionAwaySeconds?: number | null;
  afterSessionAwayVerified?: boolean | null;
};

export type FocusCoachExperiment = {
  id: FocusCoachExperimentId;
  startedAt: string;
  result: FocusCoachExperimentStatus | null;
  lastResult?: FocusCoachExperimentStatus | null;
  lastResultAt?: string | null;
};

export type SuggestionReason = 'step_up' | 'ease_down' | 'repeat' | 'floor';

export type FocusCoachResult = {
  notes: CoachNote[];
  pending: PendingNote[];
  headline: string;
  evidenceCount: number;
  nextStep: { minutes: number; text: string } | null;
  tooEarlyRemaining: number;
  latestPlatform: string | null;
  validCount: number;
  baselineTarget: number;
  state: FocusCoachState;
  currentCleanSeconds: number | null;
  beforeCleanSeconds: number | null;
  suggestionMinutes: number | null;
  suggestionReason: SuggestionReason | null;
  cleanTrend: FocusCoachCleanTrend | null;
  lastSession: FocusCoachLastSession | null;
  away: FocusCoachAway | null;
  awayInsight: FocusCoachAwayInsight | null;
  diagnosis: FocusCoachDiagnosis | null;
  diagnosisDetail: FocusCoachDiagnosisDetail | null;
  weakEvidence: boolean;
  primaryBreak: Exclude<FocusCoachDistractionType, 'pause_overrun'> | null;
  experiment: FocusCoachExperiment | null;
  historyHeadline: string | null;
  historyCopy: string | null;
  suggestionCopy: string | null;
};

export type FocusCoachCleanTrend = {
  points: { sessionId: number; endedAt: string; cleanSeconds: number }[];
  deltaSeconds: number | null;
};

export type FocusCoachLastSession = {
  endedAt: string;
  plannedSeconds: number | null;
  focusSeconds: number;
  cleanSeconds: number;
  endedBy: FocusCoachDistractionType | null;
  firstDistractionType: 'camera_absence' | 'app_touched' | null;
  firstDistractionAtSeconds: number | null;
  pauseCount: number;
  pausedSeconds: number;
  endedEarly: boolean;
};

export type FocusCoachAway = {
  sinceLastUseSeconds: number | null;
  display: 'about' | 'at_least' | 'hidden';
  afterSessionSeconds: number | null;
  afterSessionVerified: boolean;
};

export type FocusCoachAwayInsightType =
  | 'longer_breaks_cleaner'
  | 'shorter_breaks_cleaner'
  | 'break_lengths_similar';

export type FocusCoachAwayInsight = {
  verifiedSessionCount: number;
  typeLine: FocusCoachAwayInsightType;
  longBreakMedianCleanSeconds: number;
  shortBreakMedianCleanSeconds: number;
  longBreakMedianCleanRatio: number;
  shortBreakMedianCleanRatio: number;
  differenceSeconds: number;
  differencePct: number;
};

export type FocusCoachDiagnosisDetail =
  | {
      kind: 'early_breaker';
      typicalFirstBreakSeconds: number;
      typicalPlannedSeconds: number;
      brokenCount: number;
    }
  | {
      kind: 'late_breaker';
      typicalFirstBreakSeconds: number;
      typicalPlannedSeconds: number;
      brokenCount: number;
    }
  | {
      kind: 'best_window';
      window: FocusCoachWindow;
      windowMedianCleanSeconds: number;
      overallMedianCleanSeconds: number;
      sessionsInWindow: number;
    }
  | {
      kind: 'app_heavy';
      sharePct: number;
      brokenCount: number;
    }
  | {
      kind: 'camera_heavy';
      sharePct: number;
      brokenCount: number;
    };

type ValidSession = FocusCoachSession & {
  cleanSeconds: number;
  focusSeconds: number;
};

type FocusSessionWithClean = FocusCoachSession & {
  cleanSeconds: number;
  focusSeconds: number;
};

type DiagnosisCandidate = {
  diagnosis: FocusCoachDiagnosis;
  evidenceCount: number;
};

function byStartedAtAscending(
  a: FocusCoachSession,
  b: FocusCoachSession,
) {
  return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
}

function latestPlatformSessions(sessions: FocusCoachSession[]) {
  const withPlatform = sessions.filter(session => session.platform);
  if (withPlatform.length === 0) {
    return {
      latestPlatform: null,
      sessions: [...sessions].sort(byStartedAtAscending),
    };
  }

  const latest = withPlatform.reduce((best, session) =>
    new Date(session.startedAt).getTime() > new Date(best.startedAt).getTime()
      ? session
      : best,
  );

  return {
    latestPlatform: latest.platform,
    sessions: sessions
      .filter(session => session.platform === latest.platform)
      .sort(byStartedAtAscending),
  };
}

export function median(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function roundMinutesToFive(minutes: number) {
  return Math.round(minutes / STEP_MINUTES) * STEP_MINUTES;
}

function clampSuggestedMinutes(minutes: number) {
  const rounded = roundMinutesToFive(minutes);
  const maxRounded = Math.floor(MAX_SUGGEST_MIN / STEP_MINUTES) * STEP_MINUTES;
  return Math.min(maxRounded, Math.max(MIN_SUGGEST_MIN, rounded));
}

function medianCleanSeconds(sessions: ValidSession[]) {
  return median(sessions.map(session => session.cleanSeconds));
}

function getLocalHour(startedAt: string) {
  return new Date(startedAt).getHours();
}

function getSessionWindow(startedAt: string): FocusCoachWindow {
  const hour = getLocalHour(startedAt);
  if (hour < 12) {
    return 'morning';
  }
  if (hour < 17) {
    return 'afternoon';
  }
  return 'evening';
}

function getBrokenSessions(valid: ValidSession[]) {
  return valid.filter(
    session =>
      session.firstDistractionType !== null &&
      session.firstDistractionType !== 'pause_overrun',
  );
}

function getTimeBuckets(valid: ValidSession[]) {
  const buckets: Record<FocusCoachWindow, ValidSession[]> = {
    morning: [],
    afternoon: [],
    evening: [],
  };

  for (const session of valid) {
    buckets[getSessionWindow(session.startedAt)].push(session);
  }

  return buckets;
}

function diagnose(valid: ValidSession[]): DiagnosisCandidate | null {
  const broken = getBrokenSessions(valid);

  if (broken.length >= DIAG_MIN_SESSIONS) {
    const earlyCount = broken.filter(
      session => session.cleanSeconds / session.durationSeconds < 0.25,
    ).length;
    if (earlyCount / broken.length >= 0.6) {
      return { diagnosis: 'early_breaker', evidenceCount: broken.length };
    }

    const lateCount = broken.filter(
      session => session.cleanSeconds / session.durationSeconds > 0.7,
    ).length;
    if (lateCount / broken.length >= 0.6) {
      return { diagnosis: 'late_breaker', evidenceCount: broken.length };
    }
  }

  const buckets = getTimeBuckets(valid);

  const overallMedian = medianCleanSeconds(valid);
  const bucketMedians = Object.values(buckets)
    .filter(bucket => bucket.length >= BEST_WINDOW_MIN_SESSIONS)
    .map(bucket => medianCleanSeconds(bucket))
    .filter((value): value is number => value !== null);
  if (bucketMedians.length >= 2 && overallMedian !== null) {
    const best = Math.max(...bucketMedians);
    if (
      best >= overallMedian * (1 + IMPROVE_PCT) &&
      best - overallMedian >= IMPROVE_MIN_SECONDS
    ) {
      return { diagnosis: 'best_window', evidenceCount: valid.length };
    }
  }

  if (broken.length < DIAG_MIN_SESSIONS) {
    return null;
  }

  const appBreaks = broken.filter(
    session => session.firstDistractionType === 'app_touched',
  ).length;
  if (appBreaks / broken.length >= 0.7) {
    return { diagnosis: 'app_heavy', evidenceCount: broken.length };
  }

  const cameraBreaks = broken.filter(
    session => session.firstDistractionType === 'camera_absence',
  ).length;
  if (cameraBreaks / broken.length >= 0.7) {
    return { diagnosis: 'camera_heavy', evidenceCount: broken.length };
  }

  return null;
}

function buildDiagnosisDetail(
  valid: ValidSession[],
  diagnosis: FocusCoachDiagnosis | null,
): FocusCoachDiagnosisDetail | null {
  if (diagnosis === null) {
    return null;
  }

  const broken = getBrokenSessions(valid);
  if (diagnosis === 'early_breaker' || diagnosis === 'late_breaker') {
    const typicalFirstBreakSeconds = median(
      broken.map(session => session.cleanSeconds),
    );
    const typicalPlannedSeconds = median(
      broken.map(session => session.durationSeconds),
    );
    if (
      typicalFirstBreakSeconds === null ||
      typicalPlannedSeconds === null
    ) {
      return null;
    }

    return {
      kind: diagnosis,
      typicalFirstBreakSeconds,
      typicalPlannedSeconds,
      brokenCount: broken.length,
    };
  }

  if (diagnosis === 'best_window') {
    const buckets = getTimeBuckets(valid);
    const overallMedianCleanSeconds = medianCleanSeconds(valid);
    const bucketDetails = (Object.keys(buckets) as FocusCoachWindow[])
      .map(window => ({
        window,
        sessions: buckets[window],
        medianCleanSeconds: medianCleanSeconds(buckets[window]),
      }))
      .filter(
        (
          detail,
        ): detail is {
          window: FocusCoachWindow;
          sessions: ValidSession[];
          medianCleanSeconds: number;
        } =>
          detail.sessions.length >= BEST_WINDOW_MIN_SESSIONS &&
          detail.medianCleanSeconds !== null,
      );

    if (overallMedianCleanSeconds === null || bucketDetails.length === 0) {
      return null;
    }

    const best = bucketDetails.reduce((currentBest, detail) =>
      detail.medianCleanSeconds > currentBest.medianCleanSeconds
        ? detail
        : currentBest,
    );

    return {
      kind: 'best_window',
      window: best.window,
      windowMedianCleanSeconds: best.medianCleanSeconds,
      overallMedianCleanSeconds,
      sessionsInWindow: best.sessions.length,
    };
  }

  if (diagnosis === 'app_heavy' || diagnosis === 'camera_heavy') {
    const target =
      diagnosis === 'app_heavy' ? 'app_touched' : 'camera_absence';
    const matching = broken.filter(
      session => session.firstDistractionType === target,
    ).length;
    return {
      kind: diagnosis,
      sharePct: broken.length > 0 ? (matching / broken.length) * 100 : 0,
      brokenCount: broken.length,
    };
  }

  return null;
}

function mostCommonBreak(valid: ValidSession[]) {
  const broken = valid.filter(
    session =>
      session.firstDistractionType === 'app_touched' ||
      session.firstDistractionType === 'camera_absence',
  );
  const app = broken.filter(
    session => session.firstDistractionType === 'app_touched',
  ).length;
  const camera = broken.filter(
    session => session.firstDistractionType === 'camera_absence',
  ).length;

  if (app === 0 && camera === 0) {
    return null;
  }

  return app >= camera ? 'app_touched' : 'camera_absence';
}

function suggestMinutes(valid: ValidSession[], state: FocusCoachState) {
  if (state === 'building_baseline') {
    return null;
  }

  const latest = valid[valid.length - 1];
  if (!latest) {
    return null;
  }

  const latestPlannedMinutes = latest.durationSeconds / 60;
  const lastThree = valid.slice(-3);
  const lastTwo = valid.slice(-2);
  const lastThreeRatios = lastThree.map(
    session => session.cleanSeconds / session.durationSeconds,
  );
  const lastTwoRatios = lastTwo.map(
    session => session.cleanSeconds / session.durationSeconds,
  );

  const suggestion = (minutes: number, reason: SuggestionReason) => ({
    minutes: clampSuggestedMinutes(minutes),
    reason: roundMinutesToFive(minutes) < MIN_SUGGEST_MIN ? 'floor' as const : reason,
  });

  if (
    lastThreeRatios.length === 3 &&
    lastThreeRatios.every(ratio => ratio >= STEP_UP_RATIO)
  ) {
    return suggestion(latestPlannedMinutes + STEP_MINUTES, 'step_up');
  }

  if (
    lastTwoRatios.length === 2 &&
    lastTwoRatios.every(ratio => ratio < STEP_DOWN_RATIO)
  ) {
    const current = medianCleanSeconds(valid.slice(-WINDOW));
    return suggestion((current ?? latest.cleanSeconds) / 60, 'ease_down');
  }

  return suggestion(latestPlannedMinutes, 'repeat');
}

function buildCleanTrend(valid: ValidSession[]): FocusCoachCleanTrend | null {
  const points = valid
    .filter(
      (session): session is ValidSession & { endedAt: string } =>
        typeof session.endedAt === 'string' && session.endedAt.length > 0,
    )
    .slice(-8)
    .map(session => ({
      sessionId: session.id,
      endedAt: session.endedAt,
      cleanSeconds: session.cleanSeconds,
    }));

  if (points.length < 2) {
    return null;
  }

  const deltaSeconds =
    valid.length >= 6
      ? (() => {
          const recent = median(
            valid.slice(-3).map(session => session.cleanSeconds),
          );
          const before = median(
            valid.slice(-6, -3).map(session => session.cleanSeconds),
          );
          return recent !== null && before !== null ? recent - before : null;
        })()
      : null;

  return { points, deltaSeconds };
}

function buildLastSession(
  sessions: FocusCoachSession[],
): FocusCoachLastSession | null {
  const latest = [...sessions]
    .filter(
      (session): session is FocusSessionWithClean & { endedAt: string } =>
        (session.focusSeconds ?? 0) >= MIN_FOCUS_SECONDS &&
        session.cleanSeconds !== null &&
        typeof session.endedAt === 'string' &&
        session.endedAt.length > 0,
    )
    .sort(
      (a, b) =>
        new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime(),
    )
    .at(-1);

  if (!latest) {
    return null;
  }

  const firstDistractionType =
    latest.firstDistractionType === 'camera_absence' ||
    latest.firstDistractionType === 'app_touched'
      ? latest.firstDistractionType
      : null;

  return {
    endedAt: latest.endedAt,
    plannedSeconds: latest.durationSeconds ?? null,
    focusSeconds: latest.focusSeconds,
    cleanSeconds: latest.cleanSeconds,
    endedBy: latest.firstDistractionType,
    firstDistractionType,
    firstDistractionAtSeconds: firstDistractionType ? latest.cleanSeconds : null,
    pauseCount: latest.pauseCount ?? 0,
    pausedSeconds: latest.pausedSeconds ?? 0,
    endedEarly: latest.endedEarly,
  };
}

function verifiedAwaySessions(valid: ValidSession[]) {
  return valid.filter(
    session =>
      session.afterSessionAwayVerified === true &&
      session.afterSessionAwaySeconds !== null &&
      session.afterSessionAwaySeconds !== undefined,
  );
}

function buildAwayInsight(valid: ValidSession[]): FocusCoachAwayInsight | null {
  const verified = verifiedAwaySessions(valid);

  if (verified.length < REST_BEFORE_MIN_SESSIONS) {
    return null;
  }

  const longBreaks = verified.filter(
    session => (session.afterSessionAwaySeconds ?? 0) >= AWAY_BREAK_SPLIT_SECONDS,
  );
  const shortBreaks = verified.filter(
    session => (session.afterSessionAwaySeconds ?? 0) < AWAY_BREAK_SPLIT_SECONDS,
  );

  if (longBreaks.length < REST_BEFORE_MIN_GROUP || shortBreaks.length < REST_BEFORE_MIN_GROUP) {
    return null;
  }

  const longMedian = medianCleanSeconds(longBreaks);
  const shortMedian = medianCleanSeconds(shortBreaks);
  if (longMedian === null || shortMedian === null) {
    return null;
  }
  const longMedianRatio = median(
    longBreaks.map(session => session.cleanSeconds / session.durationSeconds),
  );
  const shortMedianRatio = median(
    shortBreaks.map(session => session.cleanSeconds / session.durationSeconds),
  );
  if (longMedianRatio === null || shortMedianRatio === null) {
    return null;
  }

  const differenceSeconds = longMedian - shortMedian;
  const differencePct = (longMedianRatio - shortMedianRatio) * 100;
  const typeLine: FocusCoachAwayInsightType =
    Math.abs(differencePct) < AWAY_SIMILAR_THRESHOLD_PCT
      ? 'break_lengths_similar'
      : differencePct > 0
        ? 'longer_breaks_cleaner'
        : 'shorter_breaks_cleaner';

  return {
    verifiedSessionCount: verified.length,
    typeLine,
    longBreakMedianCleanSeconds: longMedian,
    shortBreakMedianCleanSeconds: shortMedian,
    longBreakMedianCleanRatio: longMedianRatio,
    shortBreakMedianCleanRatio: shortMedianRatio,
    differenceSeconds,
    differencePct,
  };
}

export function experimentForDiagnosis(
  diagnosis: FocusCoachDiagnosis | null,
): FocusCoachExperimentId {
  switch (diagnosis) {
    case 'best_window':
      return 'morning_session';
    case 'early_breaker':
    case 'camera_heavy':
      return 'shorter_sessions';
    case 'app_heavy':
      return 'phone_out_of_reach';
    case 'late_breaker':
    case null:
      return 'five_minute_break';
  }
}

export function evaluateFocusCoach(
  inputSessions: FocusCoachSession[],
  experiment: FocusCoachExperiment | null = null,
  away: FocusCoachAway | null = null,
  options: FocusCoachOptions = {},
): FocusCoachResult {
  const validInput = inputSessions.filter(
    (session): session is ValidSession =>
      (session.focusSeconds ?? 0) >= MIN_FOCUS_SECONDS &&
      session.cleanSeconds !== null &&
      session.durationSeconds > 0,
  );
  const platformScoped = latestPlatformSessions(validInput);
  const valid = platformScoped.sessions as ValidSession[];
  const platformSessions = platformScoped.latestPlatform
    ? inputSessions.filter(
        session => session.platform === platformScoped.latestPlatform,
      )
    : [...inputSessions].sort(byStartedAtAscending);
  const validCount = valid.length;
  const currentCleanSeconds = medianCleanSeconds(valid.slice(-WINDOW));
  const beforeCleanSeconds =
    validCount >= WINDOW * 2
      ? medianCleanSeconds(valid.slice(-WINDOW * 2, -WINDOW))
      : null;

  let state: FocusCoachState = 'building_baseline';
  if (validCount < MIN_BASELINE_SESSIONS) {
    state = 'building_baseline';
  } else if (validCount < WINDOW * 2 || beforeCleanSeconds === null) {
    state = 'steady';
  } else if (
    currentCleanSeconds !== null &&
    currentCleanSeconds <= beforeCleanSeconds * (1 - SLIP_PCT)
  ) {
    state = 'slipping';
  } else if (
    currentCleanSeconds !== null &&
    currentCleanSeconds >= beforeCleanSeconds * (1 + IMPROVE_PCT) &&
    currentCleanSeconds - beforeCleanSeconds >= IMPROVE_MIN_SECONDS
  ) {
    state = 'improving';
  } else {
    state = 'plateau';
  }

  const diagnosed = diagnose(valid);
  const diagnosis = diagnosed?.diagnosis ?? null;
  const suggestion = suggestMinutes(valid, state);
  const suggestionMinutes = suggestion?.minutes ?? null;
  const cleanTrend = buildCleanTrend(valid);

  const narrative = buildCoachNarrative(valid.slice(-NOTE_SESSION_LIMIT), {
    ...options, ready: validCount >= MIN_BASELINE_SESSIONS,
    remaining: Math.max(0, MIN_BASELINE_SESSIONS - validCount),
    current: currentCleanSeconds, suggestionMinutes, suggestionReason: suggestion?.reason ?? null,
  });
  return {
    ...narrative,
    latestPlatform: platformScoped.latestPlatform,
    validCount,
    baselineTarget: MIN_BASELINE_SESSIONS,
    state,
    currentCleanSeconds,
    beforeCleanSeconds,
    suggestionMinutes,
    suggestionReason: suggestion?.reason ?? null,
    cleanTrend,
    lastSession: buildLastSession(platformSessions),
    away,
    awayInsight: buildAwayInsight(valid),
    diagnosis,
    diagnosisDetail: buildDiagnosisDetail(valid, diagnosis),
    weakEvidence: diagnosed ? diagnosed.evidenceCount < 8 : false,
    primaryBreak: mostCommonBreak(valid),
    experiment,
    historyHeadline: null,
    historyCopy: null,
    suggestionCopy:
      suggestionMinutes !== null ? `Try ${suggestionMinutes} min` : null,
  };
}

// Linear interpolation defines quartiles for both odd and even sample sizes.
export function coachPercentile(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  return sorted.length ? sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower) : 0;
}
function localDayKey(date: Date) { return [date.getFullYear(), date.getMonth(), date.getDate()].join('-'); }

function buildCoachNarrative(valid: ValidSession[], options: FocusCoachOptions & {
  ready: boolean; remaining: number; current: number | null;
  suggestionMinutes: number | null; suggestionReason: SuggestionReason | null;
}): Pick<FocusCoachResult, 'notes' | 'pending' | 'headline' | 'evidenceCount' | 'nextStep' | 'tooEarlyRemaining'> {
  const evidenceCount = valid.length;
  const candidates: CoachNote[] = [];
  const broken = getBrokenSessions(valid);
  const sourceFor = (session: ValidSession) => {
    if (session.firstDistractionType === 'camera_absence') return 'camera';
    const app = session.platform === 'ios' ? null : readableCoachLabel(session.firstDistractionApp, 26);
    return app ? 'app:' + app : 'phone';
  };
  const counts = new Map<string, number>();
  broken.forEach(session => { const key = sourceFor(session); counts.set(key, (counts.get(key) ?? 0) + 1); });
  const top = [...counts].sort((a, b) => b[1] - a[1])[0];
  if (broken.length >= TOP_TRIGGER_MIN_SLIPS && top && top[1] >= TOP_TRIGGER_MIN_HITS && top[1] / broken.length >= TOP_TRIGGER_MIN_SHARE) {
    const recent = valid.slice(-8);
    const hits = recent.filter(session => getBrokenSessions([session]).length && sourceFor(session) === top[0]).length;
    candidates.push({ id: 'top_trigger', icon: 'device-mobile', text: triggerNoteCopy(top[0].startsWith('app:') ? top[0].slice(4) : null, top[0] === 'camera', hits, recent.length), weak: broken.length < TOP_TRIGGER_MIN_SLIPS * 2, visual: { kind: 'dots', hits, total: recent.length } });
  }
  const slips = broken.filter(session => session.cleanSeconds < session.focusSeconds);
  const typical = slips.length >= SLIP_TIMING_MIN_SLIPS ? medianCleanSeconds(slips) : null;
  if (typical !== null) candidates.push({ id: 'slip_timing', icon: 'clock', text: slipTimingCopy(typical), weak: slips.length < SLIP_TIMING_MIN_SLIPS * 2,
    visual: { kind: 'slip_bar', typicalSeconds: typical, lowSeconds: coachPercentile(slips.map(s => s.cleanSeconds), .25), highSeconds: coachPercentile(slips.map(s => s.cleanSeconds), .75), maxSeconds: median(valid.map(s => s.durationSeconds)) ?? 0 } });
  const diagnosis = diagnose(valid);
  const detail = buildDiagnosisDetail(valid, diagnosis?.diagnosis ?? null);
  let bestWindow: { window: FocusCoachWindow; weak: boolean } | null = null;
  if (detail?.kind === 'best_window') {
    const buckets = getTimeBuckets(valid);
    const values = (Object.keys(buckets) as FocusCoachWindow[]).filter(key => buckets[key].length > 0).map(key => ({ key, value: medianCleanSeconds(buckets[key])! }));
    const worst = values.reduce((a, b) => a.value <= b.value ? a : b);
    const labels = COACH_WINDOW_LABELS;
    const weak = (diagnosis?.evidenceCount ?? 0) < 8 || detail.sessionsInWindow < 5;
    bestWindow = { window: detail.window, weak };
    candidates.push({ id: 'best_window', icon: 'sun', text: bestWindowCopy(labels[detail.window], worst.key, detail.windowMedianCleanSeconds - worst.value), weak,
      visual: { kind: 'bars', unit: 'seconds', items: values.map(item => ({ label: COACH_COPY[item.key], value: item.value, best: item.key === detail.window })) } });
  }
  const middleDuration = median(valid.map(s => s.durationSeconds)) ?? 0;
  const shorter = valid.filter(s => s.durationSeconds <= middleDuration);
  const longer = valid.filter(s => s.durationSeconds > middleDuration);
  const cleanPercent = (group: ValidSession[]) => (median(group.map(s => s.cleanSeconds / s.durationSeconds)) ?? 0) * 100;
  if (shorter.length >= BEST_LENGTH_MIN_GROUP && longer.length >= BEST_LENGTH_MIN_GROUP) {
    const shortSeconds = median(shorter.map(s => s.durationSeconds))!;
    const longSeconds = median(longer.map(s => s.durationSeconds))!;
    const shortValue = cleanPercent(shorter), longValue = cleanPercent(longer);
    if (longSeconds - shortSeconds >= BEST_LENGTH_MIN_DIFFERENCE_SECONDS && Math.abs(shortValue - longValue) + 1e-9 >= BEST_LENGTH_MIN_DIFFERENCE_POINTS) {
      candidates.push({ id: 'best_length', icon: 'ruler', text: bestLengthCopy(Math.round(shortSeconds / 60), Math.round(longSeconds / 60), shortValue > longValue), weak: Math.min(shorter.length, longer.length) < BEST_LENGTH_MIN_GROUP * 2,
        visual: { kind: 'bars', unit: 'percent', items: [{ label: COACH_COPY.shorter, value: shortValue, best: shortValue > longValue }, { label: COACH_COPY.longer, value: longValue, best: longValue > shortValue }] } });
    }
  }
  const modeNames: Record<string, string> = { ...Object.fromEntries(BUILT_IN_MODES.map(mode => [mode.id, mode.name])), ...options.modeNames };
  const groups = new Map<string, ValidSession[]>();
  valid.forEach(session => groups.set(session.modeId, [...(groups.get(session.modeId) ?? []), session]));
  const modes = [...groups].filter(([, group]) => group.length >= BEST_MODE_MIN_GROUP).map(([id, group]) => ({ label: readableCoachLabel(modeNames[id], 30), value: cleanPercent(group), count: group.length })).sort((a, b) => b.value - a.value);
  if (modes.length >= BEST_MODE_MIN_MODES) {
    const best = modes[0], worst = modes.at(-1)!;
    if (best.label && worst.label && best.value - worst.value + 1e-9 >= BEST_MODE_MIN_DIFFERENCE_POINTS) {
      candidates.push({ id: 'best_mode', icon: 'layout', text: bestModeCopy(best.label, worst.label), weak: Math.min(best.count, worst.count) < BEST_MODE_MIN_GROUP * 2,
        visual: { kind: 'bars', unit: 'percent', items: [best, worst].map((mode, index) => ({ label: mode.label!, value: mode.value, best: index === 0 })) } });
    }
  }
  const rest = valid.at(-1)?.platform === 'android' ? buildAwayInsight(valid) : null;
  if (rest) candidates.push({ id: 'rest_before', icon: 'hourglass', text: restBeforeCopy(rest), weak: rest.verifiedSessionCount < REST_BEFORE_MIN_SESSIONS * 2,
    visual: { kind: 'bars', unit: 'percent', items: [{ label: COACH_COPY.shortBreak, value: rest.shortBreakMedianCleanRatio * 100, best: rest.shortBreakMedianCleanRatio > rest.longBreakMedianCleanRatio }, { label: COACH_COPY.longBreak, value: rest.longBreakMedianCleanRatio * 100, best: rest.longBreakMedianCleanRatio > rest.shortBreakMedianCleanRatio }] } });
  const now = new Date(options.now ?? Date.now());
  const activeDays = new Set(valid.map(s => localDayKey(new Date(s.startedAt))));
  const days = Array.from({ length: CONSISTENCY_WINDOW_DAYS }, (_, index) => {
    const day = new Date(now); day.setDate(day.getDate() - (CONSISTENCY_WINDOW_DAYS - 1 - index)); return activeDays.has(localDayKey(day));
  });
  const dayCount = days.filter(Boolean).length;
  if (dayCount >= CONSISTENCY_MIN_DAYS) candidates.push({ id: 'consistency', icon: 'calendar', text: consistencyCopy(dayCount), weak: false, visual: { kind: 'week_dots', days } });
  const unlocked = new Set(candidates.map(note => note.id));
  const bucketCounts = Object.values(getTimeBuckets(valid)).map(bucket => bucket.length).sort((a, b) => b - a);
  const modeCounts = [...groups.values()].map(group => group.length).sort((a, b) => b - a);
  const durationSpread = (median(longer.map(s => s.durationSeconds)) ?? 0) - (median(shorter.map(s => s.durationSeconds)) ?? 0);
  const progress: { id: CoachNote['id']; icon: CoachNote['icon']; have: number; need: number }[] = [
    { id: 'top_trigger', icon: 'device-mobile', have: broken.length, need: TOP_TRIGGER_MIN_SLIPS },
    { id: 'slip_timing', icon: 'clock', have: broken.length, need: SLIP_TIMING_MIN_SLIPS },
    { id: 'best_window', icon: 'sun', have: bucketCounts[1] ?? 0, need: BEST_WINDOW_MIN_SESSIONS },
    { id: 'best_length', icon: 'ruler', have: durationSpread >= BEST_LENGTH_MIN_DIFFERENCE_SECONDS ? Math.min(shorter.length, longer.length) : 0, need: BEST_LENGTH_MIN_GROUP },
    { id: 'best_mode', icon: 'layout', have: modeCounts[1] ?? 0, need: BEST_MODE_MIN_GROUP },
    { id: 'rest_before', icon: 'hourglass', have: verifiedAwaySessions(valid).length, need: REST_BEFORE_MIN_SESSIONS },
    { id: 'consistency', icon: 'calendar', have: dayCount, need: CONSISTENCY_MIN_DAYS },
  ];
  const pending = progress.filter(item => !unlocked.has(item.id) && (item.id !== 'rest_before' ||
    (options.awayTrackingOptedIn && (valid.at(-1)?.platform ?? options.platform) === 'android')))
    .map(item => ({ ...item, ...PENDING_NOTE_COPY[item.id] }))
    .sort((a, b) => (a.need - a.have) - (b.need - b.have) || progress.findIndex(item => item.id === a.id) - progress.findIndex(item => item.id === b.id));
  if (!options.ready) return { notes: [], pending, headline: COACH_COPY.tooEarly, evidenceCount, nextStep: null, tooEarlyRemaining: options.remaining };
  const trend = buildCleanTrend(valid);
  const delta = trend?.deltaSeconds ?? 0;
  const earlier = median(valid.slice(-6, -3).map(s => s.cleanSeconds)) ?? 0;
  const improveThreshold = Math.max(IMPROVE_MIN_SECONDS, earlier * IMPROVE_PCT);
  return {
    notes: candidates.slice(0, MAX_COACH_NOTES), pending, evidenceCount, tooEarlyRemaining: 0,
    headline: narrativeHeadlineCopy(typical, delta >= improveThreshold ? 'up' : delta <= -improveThreshold ? 'down' : null, options.current),
    nextStep: options.isPaidUser && options.suggestionMinutes !== null ? { minutes: options.suggestionMinutes,
      text: nextStepCopy(options.suggestionMinutes, options.suggestionReason, bestWindow && !bestWindow.weak ? bestWindow.window : null, options.suggestionMinutes === (valid.at(-1)?.durationSeconds ?? 0) / 60 + STEP_MINUTES) } : null,
  };
}
