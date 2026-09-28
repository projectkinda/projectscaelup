import { ensureSchema, getDatabase } from '../data/database';
import { PresenceModule, type PresenceResult } from './presenceModule';
import type { SessionMode } from './sessionModes';

type PresenceState = 'PRESENT' | 'ABSENT_TIMING';

export function startSessionMonitor(sessionId: number, mode: SessionMode) {
  let presenceState: PresenceState = 'PRESENT';
  let absenceStartedAt: number | null = null;
  let currentAbsenceEventId: number | null = null;
  let absenceInsertPromise: Promise<void> | null = null;

  const finishCurrentAbsence = async () => {
    await absenceInsertPromise;

    if (currentAbsenceEventId === null) {
      return;
    }

    const durationSeconds = Math.round(
      (Date.now() - (absenceStartedAt ?? Date.now())) / 1000,
    );
    const database = await getDatabase();
    await ensureSchema(database);
    await database.runAsync(
      `
        UPDATE distraction_events
        SET duration_seconds = ?
        WHERE id = ?;
      `,
      [durationSeconds, currentAbsenceEventId],
    );
    currentAbsenceEventId = null;
  };

  const unsubscribe = PresenceModule.onTick(async (result: PresenceResult) => {
    if (presenceState === 'PRESENT') {
      if (!result.presenceDetected) {
        absenceStartedAt = Date.now();
        console.log('[presence-debug]', {
          event: 'absence_timer_started',
          sessionId,
          time: new Date(absenceStartedAt).toISOString(),
        });
        presenceState = 'ABSENT_TIMING';
      }
      return;
    }

    if (result.presenceDetected) {
      console.log('[presence-debug]', {
        event: 'presence_returned',
        sessionId,
        time: new Date().toISOString(),
      });
      await finishCurrentAbsence();
      absenceStartedAt = null;
      presenceState = 'PRESENT';
      return;
    }

    const elapsed = Date.now() - (absenceStartedAt ?? Date.now());
    if (
      elapsed >= mode.gracePeriodSeconds * 1000 &&
      currentAbsenceEventId === null &&
      absenceInsertPromise === null
    ) {
      absenceInsertPromise = (async () => {
        const database = await getDatabase();
        await ensureSchema(database);
        const result = await database.runAsync(
          `
            INSERT INTO distraction_events (session_id, type, occurred_at)
            VALUES (?, 'camera_absence', ?);
          `,
          [sessionId, new Date().toISOString()],
        );
        currentAbsenceEventId = result.lastInsertRowId;
        console.log('[presence-debug]', {
          event: 'camera_absence_inserted',
          sessionId,
          distractionEventId: currentAbsenceEventId,
          time: new Date().toISOString(),
        });
      })().finally(() => {
        absenceInsertPromise = null;
      });

      await absenceInsertPromise;
    }
  });

  return async () => {
    unsubscribe();
    await finishCurrentAbsence();
  };
}
