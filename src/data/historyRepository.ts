import { BUILT_IN_MODES } from '../domain/sessionModes';
import { ensureSchema, getDatabase } from './database';

export type HistorySession = {
  id: number;
  startedAt: string;
  modeId: string;
  modeName: string;
  durationSeconds: number;
  distractionCount: number;
  lockdownMinutes: number;
  flaggedApps: string[];
};

export type HistoryTrendPoint = {
  id: number;
  startedAt: string;
  modeId: string;
  durationSeconds: number;
  distractionCount: number;
};

export type HistoryModeBreakdown = {
  modeId: string;
  modeName: string;
  sessionCount: number;
};

export type HistoryData = {
  sessions: HistorySession[];
  trend: HistoryTrendPoint[];
  modeBreakdown: HistoryModeBreakdown[];
  currentStreak: number;
  bestStreak: number;
  totalSessionsCompleted: number;
  hasHiddenHistory: boolean;
  completedSessionCount: number;
};

type SessionRow = {
  id: number;
  started_at: string;
  mode_id: string;
  duration_seconds: number;
  distraction_count: number;
  lockdown_minutes: number;
  flagged_apps: string | null;
};

type TrendRow = {
  id: number;
  started_at: string;
  mode_id: string;
  duration_seconds: number;
  distraction_count: number;
};

type ModeBreakdownRow = {
  mode_id: string;
  session_count: number;
};

type CustomModeNameRow = {
  id: string;
  name: string;
};

const builtInModeNameById = new Map(
  BUILT_IN_MODES.map(mode => [mode.id, mode.name]),
);

function subtractDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - days);
  return copy.toISOString();
}

function mapSession(
  row: SessionRow,
  modeNameById: Map<string, string>,
): HistorySession {
  const flaggedApps = row.flagged_apps
    ? row.flagged_apps.split(',').filter(Boolean)
    : [];

  return {
    id: row.id,
    startedAt: row.started_at,
    modeId: row.mode_id,
    modeName: modeNameById.get(row.mode_id) ?? row.mode_id,
    durationSeconds: row.duration_seconds,
    distractionCount: row.distraction_count,
    lockdownMinutes: flaggedApps.length > 0 ? row.lockdown_minutes : 0,
    flaggedApps,
  };
}

export async function loadHistoryData({
  isPaidUser = false,
  today = new Date(),
}: {
  isPaidUser?: boolean;
  today?: Date;
} = {}): Promise<HistoryData> {
  const database = await getDatabase();
  await ensureSchema(database);

  const cutoffDate = isPaidUser ? null : subtractDays(today, 14);
  const cutoffWhere = cutoffDate ? 'AND started_at >= ?' : '';
  const cutoffParams = cutoffDate ? [cutoffDate] : [];

  const trendRows = await database.getAllAsync<TrendRow>(
    `
      SELECT id, started_at, mode_id, duration_seconds, distraction_count
      FROM sessions
      WHERE completed = 1
        ${cutoffWhere}
      ORDER BY started_at ASC;
    `,
    cutoffParams,
  );

  const modeBreakdownRows = await database.getAllAsync<ModeBreakdownRow>(
    `
      SELECT mode_id, COUNT(*) as session_count
      FROM sessions
      WHERE completed = 1
        ${cutoffWhere}
      GROUP BY mode_id
      ORDER BY session_count DESC;
    `,
    cutoffParams,
  );

  const customModeRows = isPaidUser
    ? await database.getAllAsync<CustomModeNameRow>(
        `
          SELECT id, name
          FROM custom_modes
          ORDER BY name ASC;
        `,
      )
    : [];

  const allModes = [
    ...BUILT_IN_MODES,
    ...customModeRows.map(row => ({
      id: row.id,
      name: row.name,
    })),
  ];
  const modeNameById = new Map<string, string>([
    ...builtInModeNameById,
    ...customModeRows.map(row => [row.id, row.name] as [string, string]),
  ]);

  const sessionRows = await database.getAllAsync<SessionRow>(
    `
      SELECT s.id,
             s.started_at,
             s.mode_id,
             s.duration_seconds,
             s.distraction_count,
             s.lockdown_minutes,
             GROUP_CONCAT(DISTINCT COALESCE(fa.display_name, de.app_identifier)) AS flagged_apps
      FROM sessions s
      LEFT JOIN distraction_events de
        ON de.session_id = s.id AND de.type = 'app_touched'
      LEFT JOIN flagged_apps fa
        ON fa.app_identifier = de.app_identifier
      WHERE s.completed = 1
        ${cutoffDate ? 'AND s.started_at >= ?' : ''}
      GROUP BY s.id
      ORDER BY s.started_at DESC;
    `,
    cutoffParams,
  );

  const streak = await database.getFirstAsync<{
    current_streak: number;
    best_streak: number;
    total_sessions_completed: number;
  }>(
    `
      SELECT current_streak, best_streak, total_sessions_completed
      FROM streaks
      WHERE id = 1;
    `,
  );

  const completedSessions = await database.getFirstAsync<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM sessions
      WHERE completed = 1;
    `,
  );

  const hiddenHistory = cutoffDate
    ? await database.getFirstAsync<{ count: number }>(
        `
          SELECT COUNT(*) AS count
          FROM sessions
          WHERE completed = 1
            AND started_at < ?;
        `,
        [cutoffDate],
      )
    : null;

  return {
    trend: trendRows.map(row => ({
      id: row.id,
      startedAt: row.started_at,
      modeId: row.mode_id,
      durationSeconds: row.duration_seconds,
      distractionCount: row.distraction_count,
    })),
    sessions: sessionRows.map(row => mapSession(row, modeNameById)),
    modeBreakdown: allModes.map(mode => ({
      modeId: mode.id,
      modeName: mode.name,
      sessionCount:
        modeBreakdownRows.find(row => row.mode_id === mode.id)
          ?.session_count ?? 0,
    })),
    currentStreak: streak?.current_streak ?? 0,
    bestStreak: streak?.best_streak ?? 0,
    totalSessionsCompleted:
      streak?.total_sessions_completed ?? completedSessions?.count ?? 0,
    hasHiddenHistory: (hiddenHistory?.count ?? 0) > 0,
    completedSessionCount: completedSessions?.count ?? 0,
  };
}
