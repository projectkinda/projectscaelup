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

export type FocusCoachExperimentId =
  | 'morning_session'
  | 'shorter_sessions'
  | 'phone_out_of_reach'
  | 'five_minute_break';

export type FocusCoachExperimentStatus = 'worked' | 'didnt_work' | 'unclear';

export type FocusCoachSession = {
  id: number;
  startedAt: string;
  cleanSeconds: number | null;
  focusSeconds: number | null;
  firstDistractionType: FocusCoachDistractionType | null;
  pauseCount: number | null;
  endedEarly: boolean;
  durationSeconds: number;
  modeId: string;
  platform: string | null;
};

export type FocusCoachExperiment = {
  id: FocusCoachExperimentId;
  startedAt: string;
  result: FocusCoachExperimentStatus | null;
};

export type FocusCoachResult = {
  latestPlatform: string | null;
  validCount: number;
  baselineTarget: number;
  state: FocusCoachState;
  currentCleanSeconds: number | null;
  beforeCleanSeconds: number | null;
  suggestionMinutes: number | null;
  diagnosis: FocusCoachDiagnosis | null;
  weakEvidence: boolean;
  primaryBreak: Exclude<FocusCoachDistractionType, 'pause_overrun'> | null;
  experiment: FocusCoachExperiment | null;
  historyCopy: string | null;
  suggestionCopy: string | null;
};

type ValidSession = FocusCoachSession & {
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

function diagnose(valid: ValidSession[]): DiagnosisCandidate | null {
  const broken = valid.filter(
    session =>
      session.firstDistractionType !== null &&
      session.firstDistractionType !== 'pause_overrun',
  );

  if (broken.length < DIAG_MIN_SESSIONS) {
    return null;
  }

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

  const buckets = {
    morning: [] as ValidSession[],
    afternoon: [] as ValidSession[],
    evening: [] as ValidSession[],
  };
  for (const session of broken) {
    const hour = getLocalHour(session.startedAt);
    if (hour < 12) {
      buckets.morning.push(session);
    } else if (hour < 17) {
      buckets.afternoon.push(session);
    } else {
      buckets.evening.push(session);
    }
  }

  const bucketMedians = Object.values(buckets)
    .filter(bucket => bucket.length >= 3)
    .map(bucket => medianCleanSeconds(bucket))
    .filter((value): value is number => value !== null);
  if (bucketMedians.length >= 2) {
    const best = Math.max(...bucketMedians);
    const worst = Math.min(...bucketMedians);
    if (worst > 0 && best >= worst * 1.3) {
      return { diagnosis: 'best_window', evidenceCount: broken.length };
    }
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
): FocusCoachResult {
  const validInput = inputSessions.filter(
    (session): session is ValidSession =>
      (session.focusSeconds ?? 0) >= MIN_FOCUS_SECONDS &&
      session.cleanSeconds !== null &&
      session.durationSeconds > 0,
  );
  const platformScoped = latestPlatformSessions(validInput);
  const valid = platformScoped.sessions as ValidSession[];
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
  const suggestionMinutes = suggestMinutes(valid, state);

  return {
    latestPlatform: platformScoped.latestPlatform,
    validCount,
    baselineTarget: MIN_BASELINE_SESSIONS,
    state,
    currentCleanSeconds,
    beforeCleanSeconds,
    suggestionMinutes,
    diagnosis: diagnosed?.diagnosis ?? null,
    weakEvidence: diagnosed ? diagnosed.evidenceCount < 8 : false,
    primaryBreak: mostCommonBreak(valid),
    experiment,
    historyCopy: null,
    suggestionCopy:
      suggestionMinutes !== null ? `Suggested: ${suggestionMinutes} min` : null,
  };
}
