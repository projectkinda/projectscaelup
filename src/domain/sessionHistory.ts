import { ensureSchema, getDatabase } from '../data/database';
import { LockdownModule } from './lockdownModule';
import {
  MAX_PAUSE_SECONDS,
  PAUSE_OVERRUN_TOLERANCE_SECONDS,
} from './pauseRules';

type FirstDistractionType = 'camera_absence' | 'app_touched' | 'pause_overrun';

type StreakRow = {
  current_streak: number;
  best_streak: number;
  last_completed_date: string | null;
  grace_days_used_this_week: number;
  total_sessions_completed: number;
};

type SessionStartInput = {
  modeId: string;
  durationSeconds: number;
  startedAt?: Date;
};

type SessionTimingInput = {
  focusSeconds: number;
  gracePeriodSeconds: number;
  platform: string;
};

type CompletedSessionResult = {
  distractionCount: number;
  events: DistractionEventSummary[];
  lockdownMinutes: number;
  sessionCount: number;
  showingUpDays: number;
  touchedApps: string[];
};

type SessionRow = {
  started_at: string;
};

type FirstDistractionRow = {
  type: Exclude<FirstDistractionType, 'pause_overrun'>;
  occurred_at: string;
};

type PauseRow = {
  paused_at: string;
  resumed_at: string | null;
  auto_resumed: number;
};

type SessionDerivedStats = {
  cleanSeconds: number;
  firstDistractionType: FirstDistractionType | null;
  pauseCount: number;
  pausedSeconds: number;
};

export type DistractionEventSummary = {
  type: 'camera_absence' | 'app_touched';
  appIdentifier: string | null;
  occurredAt: string;
  displayName: string | null;
  iconBase64: string | null;
  durationSeconds: number | null;
};

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function dayDifference(fromDateKey: string, toDateKey: string) {
  const from = new Date(`${fromDateKey}T00:00:00.000Z`).getTime();
  const to = new Date(`${toDateKey}T00:00:00.000Z`).getTime();
  return Math.round((to - from) / 86400000);
}

function nextStreakValues(streak: StreakRow | null, completedDate: string) {
  const currentStreak = streak?.current_streak ?? 0;
  const bestStreak = streak?.best_streak ?? 0;
  const graceDaysUsedThisWeek = streak?.grace_days_used_this_week ?? 0;
  const totalSessionsCompleted = streak?.total_sessions_completed ?? 0;
  const lastCompletedDate = streak?.last_completed_date ?? null;

  let nextCurrentStreak = currentStreak;
  let nextGraceDaysUsedThisWeek = graceDaysUsedThisWeek;

  if (!lastCompletedDate) {
    nextCurrentStreak = 1;
  } else {
    const daysSinceLastSession = dayDifference(lastCompletedDate, completedDate);

    if (daysSinceLastSession === 1) {
      nextCurrentStreak = currentStreak + 1;
    } else if (daysSinceLastSession === 2 && graceDaysUsedThisWeek < 1) {
      nextCurrentStreak = currentStreak + 1;
      nextGraceDaysUsedThisWeek = graceDaysUsedThisWeek + 1;
    } else if (daysSinceLastSession > 1) {
      nextCurrentStreak = 1;
      nextGraceDaysUsedThisWeek = 0;
    }
  }

  return {
    currentStreak: nextCurrentStreak,
    bestStreak: Math.max(bestStreak, nextCurrentStreak),
    graceDaysUsedThisWeek: nextGraceDaysUsedThisWeek,
    totalSessionsCompleted: totalSessionsCompleted + 1,
    lastCompletedDate:
      !lastCompletedDate || completedDate > lastCompletedDate
        ? completedDate
        : lastCompletedDate,
  };
}

async function getStreakRow(): Promise<StreakRow | null> {
  const database = await getDatabase();
  await ensureSchema(database);

  return database.getFirstAsync<StreakRow>(
    `
      SELECT current_streak,
             best_streak,
             last_completed_date,
             grace_days_used_this_week,
             total_sessions_completed
      FROM streaks
      WHERE id = 1;
    `,
  );
}

async function repairTotalSessionsFromRows() {
  const database = await getDatabase();
  await ensureSchema(database);

  const completedSessions = await database.getFirstAsync<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM sessions
      WHERE completed = 1;
    `,
  );

  const count = completedSessions?.count ?? 0;
  await database.runAsync(
    `
      UPDATE streaks
      SET total_sessions_completed = ?
      WHERE id = 1
        AND total_sessions_completed < ?;
    `,
    [count, count],
  );

  return count;
}

export async function getSessionCount(): Promise<number> {
  try {
    const streak = await getStreakRow();
    const repairedCount = await repairTotalSessionsFromRows();

    if ((streak?.total_sessions_completed ?? 0) > repairedCount) {
      return streak?.total_sessions_completed ?? 0;
    }

    return repairedCount;
  } catch (err) {
    console.warn('Could not getSessionCount from SQLite:', err);
    return 0;
  }
}

export async function getShowingUpDayCount(): Promise<number> {
  try {
    const database = await getDatabase();
    await ensureSchema(database);

    const result = await database.getFirstAsync<{ count: number }>(
      `
        SELECT COUNT(DISTINCT substr(started_at, 1, 10)) AS count
        FROM sessions
        WHERE completed = 1;
      `,
    );

    return result?.count ?? 0;
  } catch (err) {
    console.warn('Could not getShowingUpDayCount from SQLite:', err);
    return 0;
  }
}

export async function startSession({
  modeId,
  durationSeconds,
  startedAt = new Date(),
}: SessionStartInput): Promise<number> {
  try {
    const database = await getDatabase();
    await ensureSchema(database);

    const result = await database.runAsync(
      `
        INSERT INTO sessions (
          mode_id,
          started_at,
          duration_seconds,
          completed,
          distraction_count,
          lockdown_minutes
        )
        VALUES (?, ?, ?, 0, 0, 0);
      `,
      [modeId, startedAt.toISOString(), durationSeconds],
    );

    return result.lastInsertRowId;
  } catch (err) {
    console.warn('Could not record startSession in SQLite:', err);
    return Date.now();
  }
}

export async function recordSessionPauseStart(
  sessionId: number,
  pausedAt = new Date(),
): Promise<number | null> {
  try {
    const database = await getDatabase();
    await ensureSchema(database);
    const result = await database.runAsync(
      `
        INSERT INTO session_pauses (session_id, paused_at)
        VALUES (?, ?);
      `,
      [sessionId, pausedAt.toISOString()],
    );
    return result.lastInsertRowId;
  } catch (err) {
    console.warn('Could not record session pause in SQLite:', err);
    return null;
  }
}

export async function recordSessionPauseResume(
  pauseId: number,
  options: { resumedAt?: Date; autoResumed?: boolean } = {},
): Promise<void> {
  try {
    const database = await getDatabase();
    await ensureSchema(database);
    await database.runAsync(
      `
        UPDATE session_pauses
        SET resumed_at = ?,
            auto_resumed = ?
        WHERE id = ?;
      `,
      [
        (options.resumedAt ?? new Date()).toISOString(),
        options.autoResumed ? 1 : 0,
        pauseId,
      ],
    );
  } catch (err) {
    console.warn('Could not record session resume in SQLite:', err);
  }
}

function secondsBetween(startMs: number, endMs: number) {
  return Math.max(0, Math.round((endMs - startMs) / 1000));
}

async function deriveSessionStats(
  sessionId: number,
  timing: SessionTimingInput,
): Promise<SessionDerivedStats> {
  const database = await getDatabase();
  await ensureSchema(database);

  const session = await database.getFirstAsync<SessionRow>(
    `
      SELECT started_at
      FROM sessions
      WHERE id = ?;
    `,
    [sessionId],
  );
  const firstDistraction = await database.getFirstAsync<FirstDistractionRow>(
    `
      SELECT type, occurred_at
      FROM distraction_events
      WHERE session_id = ?
      ORDER BY occurred_at ASC
      LIMIT 1;
    `,
    [sessionId],
  );
  const pauses = await database.getAllAsync<PauseRow>(
    `
      SELECT paused_at, resumed_at, auto_resumed
      FROM session_pauses
      WHERE session_id = ?
      ORDER BY paused_at ASC;
    `,
    [sessionId],
  );

  const nowMs = Date.now();
  const pauseCount = pauses.length;
  const pausedSeconds = pauses.reduce((total, pause) => {
    const pausedAtMs = new Date(pause.paused_at).getTime();
    const resumedAtMs = pause.resumed_at
      ? new Date(pause.resumed_at).getTime()
      : nowMs;
    return total + secondsBetween(pausedAtMs, resumedAtMs);
  }, 0);

  if (!session) {
    return {
      cleanSeconds: timing.focusSeconds,
      firstDistractionType: null,
      pauseCount,
      pausedSeconds,
    };
  }

  const startedAtMs = new Date(session.started_at).getTime();
  const pauseOverrun = pauses.find(pause => {
    if (pause.auto_resumed !== 1) {
      return false;
    }

    const pausedAtMs = new Date(pause.paused_at).getTime();
    const resumedAtMs = pause.resumed_at
      ? new Date(pause.resumed_at).getTime()
      : nowMs;
    return (
      secondsBetween(pausedAtMs, resumedAtMs) >
      MAX_PAUSE_SECONDS + PAUSE_OVERRUN_TOLERANCE_SECONDS
    );
  });
  const pauseOverrunAtMs = pauseOverrun
    ? new Date(pauseOverrun.paused_at).getTime()
    : null;
  const eventOccurredAtMs = firstDistraction
    ? new Date(firstDistraction.occurred_at).getTime()
    : null;
  const usePauseOverrun =
    pauseOverrunAtMs !== null &&
    (eventOccurredAtMs === null || pauseOverrunAtMs < eventOccurredAtMs);
  const distractionAtMs = usePauseOverrun
    ? pauseOverrunAtMs
    : eventOccurredAtMs;

  if (distractionAtMs === null) {
    return {
      cleanSeconds: timing.focusSeconds,
      firstDistractionType: null,
      pauseCount,
      pausedSeconds,
    };
  }

  const pausedBeforeDistractionMs = pauses.reduce((total, pause) => {
    const pausedAtMs = new Date(pause.paused_at).getTime();
    if (pausedAtMs >= distractionAtMs) {
      return total;
    }

    const resumedAtMs = pause.resumed_at
      ? new Date(pause.resumed_at).getTime()
      : nowMs;
    return total + Math.max(0, Math.min(resumedAtMs, distractionAtMs) - pausedAtMs);
  }, 0);
  const graceAdjustmentSeconds =
    !usePauseOverrun && firstDistraction?.type === 'camera_absence'
      ? timing.gracePeriodSeconds
      : 0;
  const cleanSeconds = Math.min(
    timing.focusSeconds,
    Math.max(
      0,
      Math.round((distractionAtMs - startedAtMs - pausedBeforeDistractionMs) / 1000) -
        graceAdjustmentSeconds,
    ),
  );

  return {
    cleanSeconds,
    firstDistractionType: usePauseOverrun
      ? 'pause_overrun'
      : firstDistraction?.type ?? null,
    pauseCount,
    pausedSeconds,
  };
}

export async function voidSession(
  sessionId: number,
  timing?: SessionTimingInput,
): Promise<void> {
  try {
    const database = await getDatabase();
    await ensureSchema(database);
    const stats = timing ? await deriveSessionStats(sessionId, timing) : null;

    await database.runAsync(
      `
        UPDATE sessions
        SET completed = 0,
            distraction_count = 0,
            lockdown_minutes = 0,
            focus_seconds = COALESCE(?, focus_seconds),
            clean_seconds = COALESCE(?, clean_seconds),
            first_distraction_type = ?,
            pause_count = COALESCE(?, pause_count),
            paused_seconds = COALESCE(?, paused_seconds),
            ended_early = COALESCE(?, ended_early),
            platform = COALESCE(?, platform)
        WHERE id = ?;
      `,
      [
        timing?.focusSeconds ?? null,
        stats?.cleanSeconds ?? null,
        stats?.firstDistractionType ?? null,
        stats?.pauseCount ?? null,
        stats?.pausedSeconds ?? null,
        timing ? 1 : null,
        timing?.platform ?? null,
        sessionId,
      ],
    );
  } catch (err) {
    console.warn('Could not voidSession in SQLite:', err);
  }
}

export async function completeSession(
  sessionId: number,
  timing?: SessionTimingInput,
): Promise<CompletedSessionResult> {
  try {
    const database = await getDatabase();
    await ensureSchema(database);
    const stats = timing ? await deriveSessionStats(sessionId, timing) : null;

    const distractionCountRow = await database.getFirstAsync<{ count: number }>(
      `
        SELECT COUNT(*) AS count
        FROM distraction_events
        WHERE session_id = ?;
      `,
      [sessionId],
    );
    const touchedAppRows = await database.getAllAsync<{ app_identifier: string }>(
      `
        SELECT DISTINCT app_identifier
        FROM distraction_events
        WHERE session_id = ?
          AND type = 'app_touched'
          AND app_identifier IS NOT NULL;
      `,
      [sessionId],
    );
    const eventRows = await database.getAllAsync<{
      type: 'camera_absence' | 'app_touched';
      app_identifier: string | null;
      occurred_at: string;
      display_name: string | null;
      icon_base64: string | null;
      duration_seconds: number | null;
    }>(
      `
        SELECT de.type,
               de.app_identifier,
               de.occurred_at,
               de.duration_seconds,
               fa.display_name,
               fa.icon_base64
        FROM distraction_events de
        LEFT JOIN flagged_apps fa ON fa.app_identifier = de.app_identifier
        WHERE de.session_id = ?
        ORDER BY de.occurred_at ASC;
      `,
      [sessionId],
    );

    const distractionCount = distractionCountRow?.count ?? 0;
    const touchedApps = touchedAppRows.map(row => row.app_identifier);
    const events = eventRows.map(row => ({
      type: row.type,
      appIdentifier: row.app_identifier,
      occurredAt: row.occurred_at,
      displayName: row.display_name,
      iconBase64: row.icon_base64,
      durationSeconds: row.duration_seconds,
    }));
    const lockdownMinutes =
      touchedApps.length > 0 ? Math.min(10 + 2 * distractionCount, 60) : 0;
    if (touchedApps.length > 0) {
      const expiresAt = new Date(
        Date.now() + lockdownMinutes * 60_000,
      ).toISOString();
      try {
        await LockdownModule.applyLockdown(touchedApps, expiresAt);
      } catch (error) {
        console.warn('Could not apply native lockdown:', error);
      }
    }
    const completedAt = new Date();
    const completedDate = dateKey(completedAt);
    const currentStreak = await getStreakRow();
    const next = nextStreakValues(currentStreak, completedDate);

    await database.withTransactionAsync(async () => {
      await database.runAsync(
        `
          UPDATE sessions
          SET completed = 1,
              distraction_count = ?,
              lockdown_minutes = ?,
              focus_seconds = COALESCE(?, focus_seconds),
              clean_seconds = COALESCE(?, clean_seconds),
              first_distraction_type = ?,
              pause_count = COALESCE(?, pause_count),
              paused_seconds = COALESCE(?, paused_seconds),
              ended_early = COALESCE(?, ended_early),
              platform = COALESCE(?, platform)
          WHERE id = ?;
        `,
        [
          distractionCount,
          lockdownMinutes,
          timing?.focusSeconds ?? null,
          stats?.cleanSeconds ?? null,
          stats?.firstDistractionType ?? null,
          stats?.pauseCount ?? null,
          stats?.pausedSeconds ?? null,
          timing ? 0 : null,
          timing?.platform ?? null,
          sessionId,
        ],
      );

      await database.runAsync(
        `
          UPDATE streaks
          SET current_streak = ?,
              best_streak = ?,
              last_completed_date = ?,
              grace_days_used_this_week = ?,
              total_sessions_completed = ?
          WHERE id = 1;
        `,
        [
          next.currentStreak,
          next.bestStreak,
          next.lastCompletedDate,
          next.graceDaysUsedThisWeek,
          next.totalSessionsCompleted,
        ],
      );
    });

    const showingUpDayCountRow = await database.getFirstAsync<{ count: number }>(
      `
        SELECT COUNT(DISTINCT substr(started_at, 1, 10)) AS count
        FROM sessions
        WHERE completed = 1;
      `,
    );

    return {
      distractionCount,
      events,
      lockdownMinutes,
      sessionCount: next.totalSessionsCompleted,
      showingUpDays: showingUpDayCountRow?.count ?? 0,
      touchedApps,
    };
  } catch (err) {
    console.warn('Could not completeSession in SQLite:', err);
    return {
      distractionCount: 0,
      events: [],
      lockdownMinutes: 0,
      sessionCount: 1,
      showingUpDays: 1,
      touchedApps: [],
    };
  }
}

export function formatDuration(totalSeconds: number): string {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;

  if (hours > 0) {
    const parts = [`${hours}h`];
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);
    return parts.join(' ');
  }

  if (minutes > 0) {
    if (seconds > 0) {
      return `${minutes} min ${seconds} sec`;
    }
    return `${minutes} min`;
  }

  return `${seconds} sec`;
}

