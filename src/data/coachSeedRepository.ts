import { ensureSchema, getDatabase } from './database';

export type CoachSeedPattern = 'rising' | 'plateau' | 'slipping' | 'early_breaker';

const SEED_MODE_PREFIX = '__coach_seed__';

function cleanSecondsFor(pattern: CoachSeedPattern, index: number) {
  switch (pattern) {
    case 'rising':
      return 20 * 60 + index * 40;
    case 'plateau':
      return 22 * 60 + (index % 3) * 15;
    case 'slipping':
      return 30 * 60 - index * 45;
    case 'early_breaker':
      return 4 * 60 + (index % 2) * 20;
  }
}

export async function seedCoachSessions(pattern: CoachSeedPattern) {
  const database = await getDatabase();
  await ensureSchema(database);
  const now = Date.now();
  const durationSeconds = pattern === 'early_breaker' ? 25 * 60 : 30 * 60;

  await database.withTransactionAsync(async () => {
    for (let index = 0; index < 15; index += 1) {
      const startedAt = new Date(now - (15 - index) * 86400000).toISOString();
      const cleanSeconds = cleanSecondsFor(pattern, index);
      const firstDistractionType =
        pattern === 'early_breaker' ? 'app_touched' : index % 4 === 0 ? 'camera_absence' : null;

      await database.runAsync(
        `
          INSERT INTO sessions (
            mode_id,
            started_at,
            duration_seconds,
            completed,
            distraction_count,
            lockdown_minutes,
            focus_seconds,
            clean_seconds,
            first_distraction_type,
            pause_count,
            paused_seconds,
            ended_early,
            platform,
            ended_at
          )
          VALUES (?, ?, ?, 1, ?, 0, ?, ?, ?, 0, 0, 0, ?, ?);
        `,
        [
          `${SEED_MODE_PREFIX}${pattern}`,
          startedAt,
          durationSeconds,
          firstDistractionType ? 1 : 0,
          durationSeconds,
          cleanSeconds,
          firstDistractionType,
          'android',
          new Date(new Date(startedAt).getTime() + durationSeconds * 1000)
            .toISOString(),
        ],
      );
    }
  });
}

export async function clearSeededCoachSessions() {
  const database = await getDatabase();
  await ensureSchema(database);

  await database.runAsync(
    `
      DELETE FROM sessions
      WHERE mode_id LIKE ?;
    `,
    [`${SEED_MODE_PREFIX}%`],
  );
}
