import {
  evaluateFocusCoach,
  type FocusCoachDistractionType,
  type FocusCoachResult,
} from '../domain/focusCoach';
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

  return evaluateFocusCoach(
    rows.map(row => ({
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
    })),
  );
}
