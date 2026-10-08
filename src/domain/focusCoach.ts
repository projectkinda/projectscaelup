export type FocusCoachDistractionType =
  | 'camera_absence'
  | 'app_touched'
  | 'pause_overrun';

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

export type FocusCoachBaseline = {
  latestPlatform: string | null;
  eligibleSessionCount: number;
  currentCleanSeconds: number | null;
  currentCleanRatio: number | null;
};

export type FocusCoachPaid = FocusCoachBaseline & {
  bestCleanSeconds: number | null;
  cleanSessionCount: number;
  averageCleanRatio: number | null;
  primaryPattern: FocusCoachDistractionType | 'none';
  historyCopy: string;
  suggestionMinutes: number | null;
  suggestionCopy: string | null;
};

export type FocusCoachResult = {
  baseline: FocusCoachBaseline;
  paid: FocusCoachPaid;
};

const MIN_ELIGIBLE_FOCUS_SECONDS = 120;
const CLEAN_RATIO_THRESHOLD = 0.9;
const DEFAULT_SUGGESTION_MINUTES = 25;
const MIN_SUGGESTION_MINUTES = 5;
const MAX_SUGGESTION_MINUTES = 120;

function clampSuggestion(minutes: number) {
  return Math.min(
    MAX_SUGGESTION_MINUTES,
    Math.max(MIN_SUGGESTION_MINUTES, minutes),
  );
}

function roundToFiveMinutes(seconds: number) {
  return clampSuggestion(Math.max(5, Math.round(seconds / 300) * 5));
}

function formatCoachDuration(totalSeconds: number) {
  const rounded = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;

  if (minutes <= 0) {
    return `${seconds}s`;
  }

  if (seconds === 0) {
    return `${minutes} min`;
  }

  return `${minutes} min ${seconds}s`;
}

function distractionLabel(type: FocusCoachDistractionType | 'none') {
  switch (type) {
    case 'app_touched':
      return 'flagged-app touch';
    case 'camera_absence':
      return 'camera absence';
    case 'pause_overrun':
      return 'long pause';
    case 'none':
      return 'clean finish';
  }
}

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

export function evaluateFocusCoach(
  inputSessions: FocusCoachSession[],
): FocusCoachResult {
  const eligible = inputSessions.filter(
    session =>
      (session.focusSeconds ?? 0) >= MIN_ELIGIBLE_FOCUS_SECONDS &&
      session.cleanSeconds !== null &&
      session.durationSeconds > 0,
  );
  const platformScoped = latestPlatformSessions(eligible);
  const sessions = platformScoped.sessions;
  const latest = sessions[sessions.length - 1] ?? null;
  const currentCleanSeconds = latest?.cleanSeconds ?? null;
  const currentCleanRatio =
    latest && latest.cleanSeconds !== null
      ? latest.cleanSeconds / latest.durationSeconds
      : null;
  const ratios = sessions.map(session => {
    const clean = session.cleanSeconds ?? 0;
    return clean / session.durationSeconds;
  });
  const recentRatios = ratios.slice(-5);
  const averageCleanRatio =
    recentRatios.length > 0
      ? recentRatios.reduce((total, ratio) => total + ratio, 0) /
        recentRatios.length
      : null;
  const cleanSessionCount = ratios.filter(
    ratio => ratio >= CLEAN_RATIO_THRESHOLD,
  ).length;
  const bestCleanSeconds =
    sessions.length > 0
      ? Math.max(...sessions.map(session => session.cleanSeconds ?? 0))
      : null;
  const patternCounts = sessions.reduce(
    (counts, session) => {
      const type = session.firstDistractionType ?? 'none';
      counts[type] = (counts[type] ?? 0) + 1;
      return counts;
    },
    {} as Record<FocusCoachDistractionType | 'none', number>,
  );
  const primaryPattern = (
    Object.entries(patternCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none'
  ) as FocusCoachDistractionType | 'none';
  const historyCopy =
    latest && currentCleanSeconds !== null
      ? `Latest clean stretch: ${formatCoachDuration(currentCleanSeconds)}. Most common first break: ${distractionLabel(primaryPattern)}.`
      : 'Finish a 2 min session to unlock clean-stretch coaching.';

  let suggestionMinutes: number | null = null;
  if (latest && currentCleanRatio !== null) {
    const plannedMinutes = roundToFiveMinutes(latest.durationSeconds);
    suggestionMinutes =
      currentCleanRatio >= CLEAN_RATIO_THRESHOLD
        ? clampSuggestion(plannedMinutes + 5)
        : roundToFiveMinutes(Math.max(currentCleanSeconds ?? 0, 300));
  } else {
    suggestionMinutes = DEFAULT_SUGGESTION_MINUTES;
  }

  const suggestionCopy =
    suggestionMinutes !== null ? `Suggested: ${suggestionMinutes} min` : null;

  const baseline: FocusCoachBaseline = {
    latestPlatform: platformScoped.latestPlatform,
    eligibleSessionCount: sessions.length,
    currentCleanSeconds,
    currentCleanRatio,
  };

  return {
    baseline,
    paid: {
      ...baseline,
      bestCleanSeconds,
      cleanSessionCount,
      averageCleanRatio,
      primaryPattern,
      historyCopy,
      suggestionMinutes,
      suggestionCopy,
    },
  };
}
