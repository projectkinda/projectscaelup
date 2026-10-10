export const MIN_BASELINE_SESSIONS = 5;
export const WINDOW = 5;
export const MIN_FOCUS_SECONDS = 120;
export const IMPROVE_PCT = 0.10;
export const IMPROVE_MIN_SECONDS = 120;
export const SLIP_PCT = 0.15;
export const STEP_UP_RATIO = 0.9;
export const STEP_DOWN_RATIO = 0.6;
export const STEP_MINUTES = 5;
export const MIN_SUGGEST_MIN = 10;
export const MAX_SUGGEST_MIN = 59;
export const DIAG_MIN_SESSIONS = 6;
export const AWAY_BREAK_SPLIT_SECONDS = 60 * 60;
export const AWAY_SIMILAR_THRESHOLD_PCT = 10;

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

export type FocusCoachResult = {
  latestPlatform: string | null;
  validCount: number;
  baselineTarget: number;
  state: FocusCoachState;
  currentCleanSeconds: number | null;
  beforeCleanSeconds: number | null;
  suggestionMinutes: number | null;
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
    .filter(bucket => bucket.length >= 3)
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
          detail.sessions.length >= 3 &&
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

  if (
    lastThreeRatios.length === 3 &&
    lastThreeRatios.every(ratio => ratio >= STEP_UP_RATIO)
  ) {
    return clampSuggestedMinutes(latestPlannedMinutes + STEP_MINUTES);
  }

  if (
    lastTwoRatios.length === 2 &&
    lastTwoRatios.every(ratio => ratio < STEP_DOWN_RATIO)
  ) {
    const current = medianCleanSeconds(valid.slice(-WINDOW));
    return clampSuggestedMinutes((current ?? latest.cleanSeconds) / 60);
  }

  return clampSuggestedMinutes(latestPlannedMinutes);
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

function buildAwayInsight(valid: ValidSession[]): FocusCoachAwayInsight | null {
  const verified = valid.filter(
    session =>
      session.afterSessionAwayVerified === true &&
      session.afterSessionAwaySeconds !== null &&
      session.afterSessionAwaySeconds !== undefined,
  );

  if (verified.length < 10) {
    return null;
  }

  const longBreaks = verified.filter(
    session => (session.afterSessionAwaySeconds ?? 0) >= AWAY_BREAK_SPLIT_SECONDS,
  );
  const shortBreaks = verified.filter(
    session => (session.afterSessionAwaySeconds ?? 0) < AWAY_BREAK_SPLIT_SECONDS,
  );

  if (longBreaks.length < 3 || shortBreaks.length < 3) {
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
  const suggestionMinutes = suggestMinutes(valid, state);
  const cleanTrend = buildCleanTrend(valid);

  return {
    latestPlatform: platformScoped.latestPlatform,
    validCount,
    baselineTarget: MIN_BASELINE_SESSIONS,
    state,
    currentCleanSeconds,
    beforeCleanSeconds,
    suggestionMinutes,
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
      suggestionMinutes !== null ? `Suggested: ${suggestionMinutes} min` : null,
  };
}
