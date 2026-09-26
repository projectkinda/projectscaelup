import { Platform } from 'react-native';

import { ScreenTime } from '../../modules/screen-time';
import { ensureSchema, getDatabase } from '../data/database';

// iOS locks flagged apps during a session instead of watching them (see
// docs/ios-screen-time-design.md). Every function here is a no-op elsewhere,
// so screens can call them unconditionally next to the Android equivalents.

const isActive = Platform.OS === 'ios' && ScreenTime.isAvailable;

/**
 * iOS can't tell which flagged app was opened (tokens are opaque and differ
 * between processes), so distractions record this identifier instead.
 */
export const IOS_FLAGGED_APPS_IDENTIFIER = 'ios.flagged-apps';

export function describeTouchedApp(appIdentifier: string): string {
  return appIdentifier === IOS_FLAGGED_APPS_IDENTIFIER ? 'Your flagged apps' : appIdentifier;
}

export async function startFocusLock(sessionId: number, modeName: string, endsAtMs: number) {
  if (!isActive) {
    return;
  }
  await ScreenTime.startSession(sessionId, modeName, new Date(endsAtMs));
}

export async function pauseFocusLock() {
  if (!isActive) {
    return;
  }
  await ScreenTime.pauseSession();
}

export async function resumeFocusLock(endsAtMs: number) {
  if (!isActive) {
    return;
  }
  await ScreenTime.resumeSession(new Date(endsAtMs));
}

/**
 * Lifts the session lock. When the session counts, its "Open anyway" taps are
 * stored as `app_touched` distractions so `completeSession` scores them exactly
 * like Android's; when it's cancelled they're discarded.
 */
export async function finishFocusLock(sessionId: number, { keepDistractions }: { keepDistractions: boolean }) {
  if (!isActive) {
    return;
  }
  const distractions = await ScreenTime.endSession(sessionId);
  if (!keepDistractions || distractions.length === 0) {
    return;
  }

  const database = await getDatabase();
  await ensureSchema(database);
  await database.withTransactionAsync(async () => {
    for (const occurredAt of distractions) {
      await database.runAsync(
        `
          INSERT INTO distraction_events (session_id, type, app_identifier, occurred_at)
          VALUES (?, 'app_touched', ?, ?);
        `,
        [sessionId, IOS_FLAGGED_APPS_IDENTIFIER, occurredAt.toISOString()],
      );
    }
  });
}

export async function applyLockdown(expiresAt: string) {
  if (!isActive) {
    return;
  }
  await ScreenTime.lockDown(new Date(expiresAt));
}

/** Corrects the shields if a timed change was missed while the app was closed. */
export async function reconcileScreenTime() {
  if (!isActive) {
    return;
  }
  await ScreenTime.reconcile();
}
