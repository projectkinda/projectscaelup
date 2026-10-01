import { Platform } from 'react-native';

import { getAppState, setAppState } from '../data/appStateRepository';
import { ensureSchema, getDatabase } from '../data/database';
import { UsageTrackingModule } from './usageTrackingModule';

export type AwayDisplay =
  | { kind: 'about' | 'at_least'; seconds: number; text: string }
  | { kind: 'hidden' };

type NativeAwayLogRow = {
  package: string;
  usedAtMs: number;
};

type NativeAwayGapRow = {
  startedMs: number;
  endedMs: number;
};

type LastUseRow = {
  used_at: string;
};

type EndedSessionRow = {
  id: number;
  ended_at: string;
};

type HeartbeatStatus = {
  lastHeartbeatMs: number | null;
  enabled: boolean;
};

const AWAY_TRACKING_OPT_IN_KEY = 'away_tracking_opted_in';
const AWAY_TRACKING_STARTED_AT_KEY = 'away_tracking_started_at';
const APP_USE_LOG_RETENTION_DAYS = 30;
const IOS_STALE_THRESHOLD_MS = 6.5 * 60 * 60 * 1000;

function subtractDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - days);
  return copy.toISOString();
}

async function getHeartbeatStatus(): Promise<HeartbeatStatus> {
  if (Platform.OS !== 'android') {
    return { lastHeartbeatMs: null, enabled: false };
  }

  const [enabled, lastHeartbeatMs] = await Promise.all([
    UsageTrackingModule.isEnabled(),
    UsageTrackingModule.getLastHeartbeatMs(),
  ]);

  return { enabled, lastHeartbeatMs };
}

async function getTrackingStartedAtMs(): Promise<number | null> {
  const raw = await getAppState(AWAY_TRACKING_STARTED_AT_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function fillAfterSessionAwayMetrics() {
  const database = await getDatabase();
  await ensureSchema(database);
  const trackingStartedAtMs = await getTrackingStartedAtMs();
  if (trackingStartedAtMs === null) {
    return;
  }
  const trackingStartedAt = new Date(trackingStartedAtMs).toISOString();
  const sessions = await database.getAllAsync<EndedSessionRow>(
    `
      SELECT id, ended_at
      FROM sessions
      WHERE ended_at IS NOT NULL
        AND after_session_away_seconds IS NULL
        AND ended_at >= ?
      ORDER BY ended_at ASC;
    `,
    [trackingStartedAt],
  );

  for (const session of sessions) {
    const nextUse = await database.getFirstAsync<LastUseRow>(
      `
        SELECT used_at
        FROM (
          SELECT used_at
          FROM app_use_log
          WHERE used_at > ?
          UNION ALL
          SELECT occurred_at AS used_at
          FROM distraction_events
          WHERE type = 'app_touched'
            AND occurred_at > ?
        )
        ORDER BY used_at ASC
        LIMIT 1;
      `,
      [session.ended_at, session.ended_at],
    );

    if (!nextUse) {
      continue;
    }

    const endedAtMs = new Date(session.ended_at).getTime();
    const usedAtMs = new Date(nextUse.used_at).getTime();
    const overlappingGap = await database.getFirstAsync<{ id: number }>(
      `
        SELECT id
        FROM away_tracking_gaps
        WHERE started_at <= ?
          AND ended_at >= ?
        LIMIT 1;
      `,
      [nextUse.used_at, session.ended_at],
    );
    const verified = !overlappingGap;

    await database.runAsync(
      `
        UPDATE sessions
        SET after_session_away_seconds = ?,
            after_session_away_verified = ?
        WHERE id = ?;
      `,
      [Math.max(0, Math.round((usedAtMs - endedAtMs) / 1000)), verified ? 1 : 0, session.id],
    );
  }
}

export async function setAwayTrackingEnabled(enabled: boolean) {
  const database = await getDatabase();
  await ensureSchema(database);
  await setAppState(AWAY_TRACKING_OPT_IN_KEY, enabled ? 'true' : 'false');
  if (enabled) {
    await setAppState(AWAY_TRACKING_STARTED_AT_KEY, `${Date.now()}`);
  } else {
    await setAppState(AWAY_TRACKING_STARTED_AT_KEY, '');
    await database.withTransactionAsync(async () => {
      await database.runAsync('DELETE FROM app_use_log;');
      await database.runAsync(
        `
          UPDATE sessions
          SET after_session_away_seconds = NULL,
              after_session_away_verified = NULL;
        `,
      );
    });
  }
  await UsageTrackingModule.setAwayTrackingEnabled(enabled);
}

export async function isAwayTrackingOptedIn() {
  return (await getAppState(AWAY_TRACKING_OPT_IN_KEY)) === 'true';
}

export async function purgeOldAwayLog(now = new Date()) {
  const database = await getDatabase();
  await ensureSchema(database);
  await database.runAsync('DELETE FROM app_use_log WHERE used_at < ?;', [
    subtractDays(now, APP_USE_LOG_RETENTION_DAYS),
  ]);
}

export async function drainAwayLog() {
  const database = await getDatabase();
  await ensureSchema(database);
  await purgeOldAwayLog();

  const rows: NativeAwayLogRow[] =
    Platform.OS === 'android' ? await UsageTrackingModule.drainUseLog() : [];
  const gaps: NativeAwayGapRow[] =
    Platform.OS === 'android' ? await UsageTrackingModule.drainGaps() : [];

  if (rows.length > 0 || gaps.length > 0) {
    await database.withTransactionAsync(async () => {
      for (const row of rows) {
        await database.runAsync(
          `
            INSERT OR IGNORE INTO app_use_log (app_identifier, used_at, platform)
            VALUES (?, ?, ?);
          `,
          [row.package, new Date(row.usedAtMs).toISOString(), 'android'],
        );
      }
      for (const gap of gaps) {
        await database.runAsync(
          `
            INSERT OR IGNORE INTO away_tracking_gaps (started_at, ended_at)
            VALUES (?, ?);
          `,
          [
            new Date(gap.startedMs).toISOString(),
            new Date(gap.endedMs).toISOString(),
          ],
        );
      }
    });
  }

  await fillAfterSessionAwayMetrics();
}

export async function getAwaySince(): Promise<Date | null> {
  const database = await getDatabase();
  await ensureSchema(database);
  const row = await database.getFirstAsync<LastUseRow>(
    `
      SELECT used_at
      FROM (
        SELECT used_at
        FROM app_use_log
        UNION ALL
        SELECT occurred_at AS used_at
        FROM distraction_events
        WHERE type = 'app_touched'
      )
      ORDER BY used_at DESC
      LIMIT 1;
    `,
  );

  return row ? new Date(row.used_at) : null;
}

export function formatAwayTime(seconds: number) {
  const minutes = Math.max(0, Math.round(seconds / 60));

  if (minutes < 60) {
    return `${Math.max(5, Math.round(minutes / 5) * 5)} min`;
  }

  if (minutes <= 24 * 60) {
    const rounded = Math.round(minutes / 15) * 15;
    const hours = Math.floor(rounded / 60);
    const remainingMinutes = rounded % 60;
    return remainingMinutes > 0
      ? `${hours} h ${remainingMinutes} min`
      : `${hours} h`;
  }

  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.round((minutes % (24 * 60)) / 60);
  const dayText = `${days} ${days === 1 ? 'day' : 'days'}`;
  return hours > 0 ? `${dayText} ${hours} h` : dayText;
}

export async function getAwayDisplay(): Promise<AwayDisplay> {
  const optedIn = await isAwayTrackingOptedIn();
  if (!optedIn) {
    return { kind: 'hidden' };
  }

  await drainAwayLog();

  const lastUse = await getAwaySince();
  const { enabled, lastHeartbeatMs } = await getHeartbeatStatus();

  if (!enabled || lastHeartbeatMs === null) {
    return { kind: 'hidden' };
  }

  const database = await getDatabase();
  await ensureSchema(database);
  const latestGap = await database.getFirstAsync<{ ended_at: string }>(
    `
      SELECT ended_at
      FROM away_tracking_gaps
      ORDER BY ended_at DESC
      LIMIT 1;
    `,
  );
  const trackingStartedAtMs = await getTrackingStartedAtMs();
  if (trackingStartedAtMs === null) {
    return { kind: 'hidden' };
  }
  const baselineMs = Math.max(
    lastUse?.getTime() ?? 0,
    trackingStartedAtMs,
    latestGap ? new Date(latestGap.ended_at).getTime() : 0,
  );
  const nowMs = Date.now();
  const heartbeatAgeMs = nowMs - lastHeartbeatMs;
  const isFresh =
    Platform.OS === 'android' || heartbeatAgeMs <= IOS_STALE_THRESHOLD_MS;
  const endMs = isFresh ? nowMs : lastHeartbeatMs;
  const seconds = Math.max(0, Math.round((endMs - baselineMs) / 1000));
  const kind = isFresh ? 'about' : 'at_least';

  return {
    kind,
    seconds,
    text: `${kind === 'about' ? 'about' : 'at least'} ${formatAwayTime(seconds)}`,
  };
}

export async function getAfterSessionAwayDisplay(sessionId: number) {
  const database = await getDatabase();
  await ensureSchema(database);
  await fillAfterSessionAwayMetrics();
  const row = await database.getFirstAsync<{
    after_session_away_seconds: number | null;
    after_session_away_verified: number | null;
  }>(
    `
      SELECT after_session_away_seconds, after_session_away_verified
      FROM sessions
      WHERE id = ?;
    `,
    [sessionId],
  );

  if (row?.after_session_away_seconds == null) {
    return null;
  }

  const prefix = row.after_session_away_verified === 1 ? 'about' : 'at least';
  return `${prefix} ${formatAwayTime(row.after_session_away_seconds)}`;
}

export async function getPreviousSessionAwayDisplay(sessionId: number) {
  const database = await getDatabase();
  await ensureSchema(database);
  await drainAwayLog();
  const current = await database.getFirstAsync<{ ended_at: string | null }>(
    'SELECT ended_at FROM sessions WHERE id = ?;',
    [sessionId],
  );

  if (!current?.ended_at) {
    return null;
  }

  const row = await database.getFirstAsync<{
    after_session_away_seconds: number | null;
    after_session_away_verified: number | null;
  }>(
    `
      SELECT after_session_away_seconds, after_session_away_verified
      FROM sessions
      WHERE ended_at IS NOT NULL
        AND ended_at < ?
      ORDER BY ended_at DESC
      LIMIT 1;
    `,
    [current.ended_at],
  );

  if (row?.after_session_away_seconds == null) {
    return null;
  }

  const prefix = row.after_session_away_verified === 1 ? 'about' : 'at least';
  return `${prefix} ${formatAwayTime(row.after_session_away_seconds)}`;
}
