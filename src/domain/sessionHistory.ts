import { ensureSchema, getDatabase } from '../data/database';

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

type CompletedSessionResult = {
  distractionCount: number;
  lockdownMinutes: number;
  sessionCount: number;
  touchedApps: string[];
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
  const streak = await getStreakRow();
  const repairedCount = await repairTotalSessionsFromRows();

  if ((streak?.total_sessions_completed ?? 0) > repairedCount) {
    return streak?.total_sessions_completed ?? 0;
  }

  return repairedCount;
}

export async function startSession({
  modeId,
  durationSeconds,
  startedAt = new Date(),
}: SessionStartInput): Promise<number> {
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
}

export async function voidSession(sessionId: number): Promise<void> {
  const database = await getDatabase();
  await ensureSchema(database);

  await database.runAsync(
    `
      UPDATE sessions
      SET completed = 0,
          distraction_count = 0,
          lockdown_minutes = 0
      WHERE id = ?;
    `,
    [sessionId],
  );
}

export async function completeSession(
  sessionId: number,
): Promise<CompletedSessionResult> {
  const database = await getDatabase();
  await ensureSchema(database);

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

  const distractionCount = distractionCountRow?.count ?? 0;
  const lockdownMinutes = Math.min(10 + 2 * distractionCount, 60);
  const touchedApps = touchedAppRows.map(row => row.app_identifier);
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
            lockdown_minutes = ?
        WHERE id = ?;
      `,
      [distractionCount, lockdownMinutes, sessionId],
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

  return {
    distractionCount,
    lockdownMinutes,
    sessionCount: next.totalSessionsCompleted,
    touchedApps,
  };
}
