import { Platform } from 'react-native';

import {
  experimentForDiagnosis,
  evaluateFocusCoach,
  type FocusCoachDistractionType,
  type FocusCoachExperiment,
  type FocusCoachExperimentId,
  type FocusCoachResult,
  MIN_BASELINE_SESSIONS,
} from '../domain/focusCoach';
import { getAwayDisplay } from '../domain/awayTime';
import { safeLoadFocusCoachAway } from '../domain/focusCoachAway';
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
  paused_seconds: number | null;
  ended_early: number | null;
  duration_seconds: number;
  mode_id: string;
  platform: string | null;
  ended_at: string | null;
  after_session_away_seconds: number | null;
  after_session_away_verified: number | null;
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
    endedAt: row.ended_at,
    cleanSeconds: row.clean_seconds,
    focusSeconds: row.focus_seconds,
    firstDistractionType: row.first_distraction_type,
    pauseCount: row.pause_count,
    pausedSeconds: row.paused_seconds,
    endedEarly: row.ended_early === 1,
    durationSeconds: row.duration_seconds,
    modeId: row.mode_id,
    platform: row.platform,
    afterSessionAwaySeconds: row.after_session_away_seconds,
    afterSessionAwayVerified: row.after_session_away_verified === 1,
  }));
}

function latestSessionForAway(
  rows: ReturnType<typeof mapRows>,
  latestPlatform: string | null,
) {
  return rows
    .filter(row => !latestPlatform || row.platform === latestPlatform)
    .filter(row => row.endedAt)
    .sort(
      (a, b) =>
        new Date(a.endedAt ?? '').getTime() -
        new Date(b.endedAt ?? '').getTime(),
    )
    .at(-1);
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
             paused_seconds,
             ended_early,
             duration_seconds,
             mode_id,
             platform,
             ended_at,
             after_session_away_seconds,
             after_session_away_verified
      FROM sessions
      WHERE focus_seconds IS NOT NULL
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
  const away = await safeLoadFocusCoachAway({
    loadDisplay: getAwayDisplay,
    latestSession: latestSessionForAway(sessions, firstPass.latestPlatform) ?? null,
    platform: Platform.OS,
  });
  const result = evaluateFocusCoach(sessions, experiment, away);
  const copy = await buildFocusCoachCopy(result);

  return { ...result, ...copy };
}
