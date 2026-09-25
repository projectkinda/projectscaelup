import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'project-scaleup.db';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).catch(err => {
      databasePromise = null;
      throw err;
    });
  }
  return databasePromise;
}

export async function ensureSchema(database: SQLite.SQLiteDatabase) {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mode_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      completed INTEGER NOT NULL,
      distraction_count INTEGER NOT NULL,
      lockdown_minutes INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS distraction_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id),
      type TEXT NOT NULL,
      app_identifier TEXT,
      occurred_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS streaks (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      current_streak INTEGER NOT NULL DEFAULT 0,
      best_streak INTEGER NOT NULL DEFAULT 0,
      last_completed_date TEXT,
      grace_days_used_this_week INTEGER NOT NULL DEFAULT 0,
      total_sessions_completed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS custom_modes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      grace_period_seconds INTEGER NOT NULL,
      frame_width_min INTEGER NOT NULL DEFAULT 15,
      frame_width_max INTEGER NOT NULL DEFAULT 40
    );

    CREATE TABLE IF NOT EXISTS flagged_apps (
      app_identifier TEXT PRIMARY KEY,
      display_name TEXT NOT NULL
    );

    INSERT OR IGNORE INTO streaks (id, current_streak, best_streak)
    VALUES (1, 0, 0);
  `);

  const customModeColumns = await database.getAllAsync<{ name: string }>(
    'PRAGMA table_info(custom_modes);',
  );
  const customModeColumnNames = new Set(
    customModeColumns.map(column => column.name),
  );

  if (!customModeColumnNames.has('frame_width_min')) {
    await database.execAsync(
      'ALTER TABLE custom_modes ADD COLUMN frame_width_min INTEGER NOT NULL DEFAULT 15;',
    );
  }

  if (!customModeColumnNames.has('frame_width_max')) {
    await database.execAsync(
      'ALTER TABLE custom_modes ADD COLUMN frame_width_max INTEGER NOT NULL DEFAULT 40;',
    );
  }
}
