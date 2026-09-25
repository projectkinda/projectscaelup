import { ensureSchema, getDatabase } from '../data/database';
import { PresenceModule, type PresenceResult } from './presenceModule';
import type { SessionMode } from './sessionModes';

type PresenceState = 'PRESENT' | 'ABSENT_TIMING';

export function startSessionMonitor(sessionId: number, mode: SessionMode) {
  let presenceState: PresenceState = 'PRESENT';
  let absenceStartedAt: number | null = null;

  const unsubscribe = PresenceModule.onTick(async (result: PresenceResult) => {
    if (presenceState === 'PRESENT') {
      if (!result.presenceDetected) {
        absenceStartedAt = Date.now();
        presenceState = 'ABSENT_TIMING';
      }
      return;
    }

    if (result.presenceDetected) {
      absenceStartedAt = null;
      presenceState = 'PRESENT';
      return;
    }

    const elapsed = Date.now() - (absenceStartedAt ?? Date.now());
    if (elapsed >= mode.gracePeriodSeconds * 1000) {
      const database = await getDatabase();
      await ensureSchema(database);
      await database.runAsync(
        `
          INSERT INTO distraction_events (session_id, type, occurred_at)
          VALUES (?, 'camera_absence', ?);
        `,
        [sessionId, new Date().toISOString()],
      );
      absenceStartedAt = Date.now();
    }
  });

  return unsubscribe;
}
