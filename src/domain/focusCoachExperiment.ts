import {
  IMPROVE_MIN_SECONDS,
  IMPROVE_PCT,
  MIN_FOCUS_SECONDS,
  SLIP_PCT,
  type FocusCoachExperiment,
  type FocusCoachExperimentStatus,
  type FocusCoachSession,
  median,
} from './focusCoach';

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type ValidExperimentSession = FocusCoachSession & {
  cleanSeconds: number;
  focusSeconds: number;
};

function latestPlatformSessions(sessions: ValidExperimentSession[]) {
  const withPlatform = sessions.filter(session => session.platform);
  if (withPlatform.length === 0) {
    return sessions;
  }

  const latest = withPlatform.reduce((best, session) =>
    new Date(session.startedAt).getTime() > new Date(best.startedAt).getTime()
      ? session
      : best,
  );

  return sessions.filter(session => session.platform === latest.platform);
}

export function judgeExperimentResult({
  sessions,
  experiment,
  nowMs = Date.now(),
}: {
  sessions: FocusCoachSession[];
  experiment: FocusCoachExperiment;
  nowMs?: number;
}): FocusCoachExperimentStatus | null {
  const startedAtMs = new Date(experiment.startedAt).getTime();
  if (nowMs - startedAtMs < SEVEN_DAYS_MS) {
    return null;
  }

  const valid = latestPlatformSessions(
    sessions.filter(
      (session): session is ValidExperimentSession =>
        session.cleanSeconds !== null &&
        (session.focusSeconds ?? 0) >= MIN_FOCUS_SECONDS &&
        session.durationSeconds > 0,
    ),
  ).sort(
    (a, b) =>
      new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const since = valid.filter(
    session => new Date(session.startedAt).getTime() >= startedAtMs,
  );
  if (since.length < 3) {
    return 'unclear';
  }

  const before = valid
    .filter(session => new Date(session.startedAt).getTime() < startedAtMs)
    .slice(-5);
  const sinceMedian = median(since.map(session => session.cleanSeconds));
  const beforeMedian = median(before.map(session => session.cleanSeconds));

  if (sinceMedian === null || beforeMedian === null) {
    return 'unclear';
  }

  if (
    sinceMedian >= beforeMedian * (1 + IMPROVE_PCT) &&
    sinceMedian - beforeMedian >= IMPROVE_MIN_SECONDS
  ) {
    return 'worked';
  }

  if (sinceMedian <= beforeMedian * (1 - SLIP_PCT)) {
    return 'didnt_work';
  }

  return 'unclear';
}
