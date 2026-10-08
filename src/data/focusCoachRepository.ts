import {
  experimentForDiagnosis,
  evaluateFocusCoach,
  type FocusCoachDistractionType,
  type FocusCoachExperiment,
  type FocusCoachExperimentId,
  type FocusCoachExperimentStatus,
  type FocusCoachResult,
  median,
} from '../domain/focusCoach';
import { buildFocusCoachCopy } from '../domain/focusCoachCopy';
import { getAppState, setAppState } from './appStateRepository';
import { ensureSchema, getDatabase } from './database';

type FocusCoachRow = {
  id: number;
  started_at: string;
  clean_seconds: number | null;
  focus_seconds: number | null;
  first_distraction_type: FocusCoachDistractionType | null;
  pause_count: number | null;
  ended_early: number | null;
  duration_seconds: number;
  mode_id: string;
  platform: string | null;
};

const COACH_EXPERIMENT_KEY = 'coach_experiment';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function parseExperiment(value: string | null): FocusCoachExperiment | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as {
      id?: FocusCoachExperimentId;
      startedAt?: string;
    };
    if (!parsed.id || !parsed.startedAt) {
      return null;
    }
    return { id: parsed.id, startedAt: parsed.startedAt, result: null };
  } catch {
    return null;
  }
}

function compareExperiment(
  sessions: ReturnType<typeof mapRows>,
  experiment: FocusCoachExperiment,
): FocusCoachExperimentStatus | null {
  const startedAtMs = new Date(experiment.startedAt).getTime();
  if (Date.now() - startedAtMs < SEVEN_DAYS_MS) {
    return null;
  }

  const since = sessions.filter(
    session => new Date(session.startedAt).getTime() >= startedAtMs,
  );
  if (since.length < 3) {
    return 'unclear';
  }

  const before = sessions
    .filter(session => new Date(session.startedAt).getTime() < startedAtMs)
    .slice(-5);
  const sinceMedian = median(
    since
      .map(session => session.cleanSeconds)
      .filter((value): value is number => value !== null),
  );
  const beforeMedian = median(
    before
      .map(session => session.cleanSeconds)
      .filter((value): value is number => value !== null),
  );

  if (sinceMedian === null || beforeMedian === null) {
    return 'unclear';
  }

  return sinceMedian > beforeMedian ? 'worked' : 'didnt_work';
}

function mapRows(rows: FocusCoachRow[]) {
  return rows.map(row => ({
    id: row.id,
    startedAt: row.started_at,
    cleanSeconds: row.clean_seconds,
    focusSeconds: row.focus_seconds,
    firstDistractionType: row.first_distraction_type,
    pauseCount: row.pause_count,
    endedEarly: row.ended_early === 1,
    durationSeconds: row.duration_seconds,
    modeId: row.mode_id,
    platform: row.platform,
  }));
}

async function resolveExperiment(
  rows: ReturnType<typeof mapRows>,
  diagnosis: FocusCoachResult['diagnosis'],
) {
  const stored = parseExperiment(await getAppState(COACH_EXPERIMENT_KEY));
  const now = new Date().toISOString();

  if (!stored) {
    const next = {
      id: experimentForDiagnosis(diagnosis),
      startedAt: now,
      result: null,
    };
    await setAppState(
      COACH_EXPERIMENT_KEY,
      JSON.stringify({ id: next.id, startedAt: next.startedAt }),
    );
    return next;
  }

  const result = compareExperiment(rows, stored);
  if (result === null) {
    return stored;
  }

  const next = {
    id: experimentForDiagnosis(diagnosis),
    startedAt: now,
    result,
  };
  await setAppState(
    COACH_EXPERIMENT_KEY,
    JSON.stringify({ id: next.id, startedAt: next.startedAt }),
  );
  return next;
}

export async function loadFocusCoachData(): Promise<FocusCoachResult> {
  const database = await getDatabase();
  await ensureSchema(database);

  const rows = await database.getAllAsync<FocusCoachRow>(
    `
      SELECT id,
             started_at,
             clean_seconds,
             focus_seconds,
             first_distraction_type,
             pause_count,
             ended_early,
             duration_seconds,
             mode_id,
             platform
      FROM sessions
      WHERE focus_seconds >= 120
        AND clean_seconds IS NOT NULL
      ORDER BY started_at ASC;
    `,
  );

  const sessions = mapRows(rows);
  const firstPass = evaluateFocusCoach(sessions);
  if (firstPass.validCount === 0) {
    return firstPass;
  }

  const experiment = await resolveExperiment(sessions, firstPass.diagnosis);
  const result = evaluateFocusCoach(sessions, experiment);
  const copy = await buildFocusCoachCopy(result);

  return { ...result, ...copy };
}
