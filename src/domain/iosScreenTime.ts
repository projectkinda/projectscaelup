import { Platform } from 'react-native';

import { ScreenTime } from '../../modules/screen-time';
import { ensureSchema, getDatabase } from '../data/database';

// iOS Screen Time (see docs/ios-screen-time-design.md). By default iOS tracks
// flagged-app use silently, like Android; strict mode locks the apps during a
// session instead. Every function here is a no-op elsewhere, so screens can
// call them unconditionally next to the Android equivalents.

const isActive = Platform.OS === 'ios' && ScreenTime.isAvailable;

// Distractions are stored with these `app_identifier`s. A tracked app has a
// stable, opaque key (iOS never reveals which app it is); strict mode's
// "Open anyway" can't say which flagged app was opened at all.
export const IOS_APP_PREFIX = 'ios.app.';
export const IOS_ANY_FLAGGED_APP = 'ios.flagged-apps';

/**
 * The Screen Time key of a tracked iOS app, for `FlaggedAppLabel` to draw its
 * name and icon; null for Android apps, unknown iOS apps and other platforms.
 */
export function iosAppKey(appIdentifier: string | null): string | null {
  return isActive && appIdentifier?.startsWith(IOS_APP_PREFIX)
    ? appIdentifier.slice(IOS_APP_PREFIX.length)
    : null;
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
 * Ends the session natively. When it counts, its distractions are stored as
 * `app_touched` rows so `completeSession` scores them exactly like Android's;
 * when it's cancelled they're discarded.
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
    for (const { occurredAt, appKey } of distractions) {
      await database.runAsync(
        `
          INSERT INTO distraction_events (session_id, type, app_identifier, occurred_at)
          VALUES (?, 'app_touched', ?, ?);
        `,
        [sessionId, appKey ? `${IOS_APP_PREFIX}${appKey}` : IOS_ANY_FLAGGED_APP, occurredAt.toISOString()],
      );
    }
  });
}

/** Locks the touched apps, or every flagged app when one of them is unknown. */
export async function applyLockdown(appIdentifiers: string[], expiresAt: string) {
  if (!isActive) {
    return;
  }
  const appKeys = appIdentifiers.includes(IOS_ANY_FLAGGED_APP)
    ? null
    : appIdentifiers.filter(id => id.startsWith(IOS_APP_PREFIX)).map(id => id.slice(IOS_APP_PREFIX.length));
  await ScreenTime.lockDown(new Date(expiresAt), appKeys);
}

/** Corrects the shields if a timed change was missed while the app was closed. */
export async function reconcileScreenTime() {
  if (!isActive) {
    return;
  }
  await ScreenTime.reconcile();
}
