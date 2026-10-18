import { Platform } from 'react-native';
import { TIER_SWITCHER_ENABLED } from '../domain/paywall';
import { BUILT_IN_MODES } from '../domain/sessionModes';
import { ensureSchema, getDatabase } from './database';
import { DEV_SAMPLE_SESSION_IDS_KEY, notifyCoachDataChanged } from './coachDataEvents';

type Database = Awaited<ReturnType<typeof getDatabase>>;
let mutationTail: Promise<unknown> = Promise.resolve();

function requireTestTools() {
  if (!TIER_SWITCHER_ENABLED) {
    throw new Error('Sample sessions require the test-tools flag.');
  }
}
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = mutationTail.then(work);
  mutationTail = next.catch(() => {});
  return next;
}
async function removeTracked(database: Database) {
  const stored = await database.getFirstAsync<{ value: string }>('SELECT value FROM app_state WHERE key = ?;', [DEV_SAMPLE_SESSION_IDS_KEY]);
  if (!stored) return;
  const ids: unknown = JSON.parse(stored.value);
  if (!Array.isArray(ids) || !ids.every(id => Number.isSafeInteger(id) && id > 0)) throw new Error('Invalid sample-session ownership record.');
  for (const id of new Set<number>(ids)) {
    await database.runAsync('DELETE FROM distraction_events WHERE session_id = ?;', [id]);
    await database.runAsync('DELETE FROM session_pauses WHERE session_id = ?;', [id]);
    await database.runAsync('DELETE FROM sessions WHERE id = ?;', [id]);
  }
  await database.runAsync('DELETE FROM app_state WHERE key = ?;', [DEV_SAMPLE_SESSION_IDS_KEY]);
}

export async function removeSampleSessions() {
  requireTestTools();
  return serialize(async () => {
    const database = await getDatabase();
    await ensureSchema(database);
    await database.withTransactionAsync(() => removeTracked(database));
    notifyCoachDataChanged();
  });
}

export async function loadSampleSessions() {
  requireTestTools();
  return serialize(async () => {
    const database = await getDatabase();
    await ensureSchema(database);
    // Read the user's app identifiers without adding or changing flagged apps.
    const flagged = await database.getAllAsync<{ app_identifier: string }>('SELECT app_identifier FROM flagged_apps ORDER BY display_name ASC;');
    const apps = flagged.length ? flagged.map(app => app.app_identifier) : ['com.instagram.android', 'com.google.android.youtube'];
    const shortMode = BUILT_IN_MODES.find(mode => mode.id === 'study')!;
    const longMode = BUILT_IN_MODES.find(mode => mode.id === 'deep-work')!;
    const now = new Date();
    // The last twelve span four recent days, with three morning and evening
    // attempts and six afternoon attempts. All timestamps precede today.
    const plan: { days: number; hour: number; short: boolean; clean?: number; camera?: boolean; secondary?: boolean }[] = [
      { days: 13, hour: 13, short: true },
      { days: 11, hour: 19, short: false, clean: 8 * 60, secondary: true },
      { days: 9, hour: 13, short: true },
      { days: 8, hour: 9, short: false, clean: 18 * 60 },
      { days: 6, hour: 9, short: false, clean: 16 * 60 },
      { days: 6, hour: 13, short: true },
      { days: 6, hour: 15, short: true },
      { days: 5, hour: 13, short: true },
      { days: 5, hour: 15, short: true },
      { days: 5, hour: 19, short: false, clean: 8 * 60, camera: true },
      { days: 3, hour: 9, short: false, clean: 17 * 60 },
      { days: 3, hour: 13, short: true, camera: true },
      { days: 3, hour: 19, short: false, clean: 9 * 60 },
      { days: 1, hour: 9, short: false, clean: 18 * 60 },
      { days: 1, hour: 13, short: true, camera: true },
      { days: 1, hour: 19, short: false, clean: 7 * 60 },
    ];
    await database.withTransactionAsync(async () => {
      await removeTracked(database);
      const ids: number[] = [];
      for (const entry of plan) {
        const mode = entry.short ? shortMode : longMode;
        const focusSeconds = (entry.short ? 10 : 25) * 60;
        const pauseSeconds = 30;
        const started = new Date(now); started.setDate(started.getDate() - entry.days); started.setHours(entry.hour, 0, 0, 0);
        const startedMs = started.getTime();
        const ended = new Date(startedMs + (focusSeconds + pauseSeconds) * 1000);
        const broken = !entry.short || entry.camera;
        // deriveSessionStats subtracts the camera grace and all paused time.
        const cleanSeconds = entry.camera && entry.short ? focusSeconds - mode.gracePeriodSeconds : entry.clean ?? focusSeconds;
        const type = broken ? entry.camera ? 'camera_absence' : 'app_touched' : null;
        const android = Platform.OS === 'android';
        const inserted = await database.runAsync(
          `INSERT INTO sessions (mode_id, started_at, duration_seconds, completed, distraction_count, lockdown_minutes,
             focus_seconds, clean_seconds, first_distraction_type, pause_count, paused_seconds, ended_early, platform, ended_at,
             after_session_away_seconds, after_session_away_verified)
           VALUES (?, ?, ?, 1, ?, 0, ?, ?, ?, 1, ?, 0, ?, ?, ?, ?);`,
          [mode.id, started.toISOString(), focusSeconds, broken ? 1 : 0, focusSeconds, cleanSeconds, type,
            pauseSeconds, Platform.OS, ended.toISOString(), android ? (entry.short ? 90 : 20) * 60 : null, android ? 1 : null],
        );
        const id = inserted.lastInsertRowId; ids.push(id);
        await database.runAsync('INSERT INTO session_pauses (session_id, paused_at, resumed_at, auto_resumed) VALUES (?, ?, ?, 0);',
          [id, new Date(startedMs + 120000).toISOString(), new Date(startedMs + (120 + pauseSeconds) * 1000).toISOString()]);
        if (type) {
          const occurredAt = new Date(startedMs + (cleanSeconds + pauseSeconds + (entry.camera ? mode.gracePeriodSeconds : 0)) * 1000);
          await database.runAsync('INSERT INTO distraction_events (session_id, type, app_identifier, occurred_at) VALUES (?, ?, ?, ?);',
            [id, type, type === 'app_touched' ? apps[entry.secondary ? Math.min(1, apps.length - 1) : 0] : null, occurredAt.toISOString()]);
        }
      }
      await database.runAsync('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?);', [DEV_SAMPLE_SESSION_IDS_KEY, JSON.stringify(ids)]);
    });
    notifyCoachDataChanged();
  });
}
