import {
  experimentForDiagnosis,
  evaluateFocusCoach,
  type FocusCoachDistractionType,
  type FocusCoachExperiment,
  type FocusCoachExperimentId,
  type FocusCoachResult,
  MIN_BASELINE_SESSIONS,
} from '../domain/focusCoach';
import { buildFocusCoachCopy } from '../domain/focusCoachCopy';
import { judgeExperimentResult } from '../domain/focusCoachExperiment';
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

function parseExperiment(value: string | null): FocusCoachExperiment | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as {
      id?: FocusCoachExperimentId;
      startedAt?: string;
      lastResult?: FocusCoachExperiment['lastResult'];
      lastResultAt?: string | null;
    };
    if (!parsed.id || !parsed.startedAt) {
      return null;
    }
    return {
      id: parsed.id,
      startedAt: parsed.startedAt,
      result: null,
      lastResult: parsed.lastResult ?? null,
      lastResultAt: parsed.lastResultAt ?? null,
    };
  } catch {
    return null;
  }
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
  validCount: number,
) {
  if (validCount < MIN_BASELINE_SESSIONS) {
    return null;
  }

  const stored = parseExperiment(await getAppState(COACH_EXPERIMENT_KEY));
  const now = new Date().toISOString();

  if (!stored) {
    const next = {
      id: experimentForDiagnosis(diagnosis),
      startedAt: now,
      result: null,
      lastResult: null,
      lastResultAt: null,
    };
    await setAppState(
      COACH_EXPERIMENT_KEY,
      JSON.stringify({
        id: next.id,
        startedAt: next.startedAt,
        lastResult: next.lastResult,
        lastResultAt: next.lastResultAt,
      }),
    );
    return next;
  }

  const result = judgeExperimentResult({ sessions: rows, experiment: stored });
  if (result === null) {
    return stored;
  }

  const next = {
    id: experimentForDiagnosis(diagnosis),
    startedAt: now,
    result: null,
    lastResult: result,
    lastResultAt: now,
  };
  await setAppState(
    COACH_EXPERIMENT_KEY,
    JSON.stringify({
      id: next.id,
      startedAt: next.startedAt,
      lastResult: next.lastResult,
      lastResultAt: next.lastResultAt,
    }),
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

  const experiment = await resolveExperiment(
    sessions,
    firstPass.diagnosis,
    firstPass.validCount,
  );
  const result = evaluateFocusCoach(sessions, experiment);
  const copy = await buildFocusCoachCopy(result);

  return { ...result, ...copy };
}
