import { Platform } from 'react-native';

import { ScreenTime } from '../../modules/screen-time';
import { IOS_APP_PREFIX } from './iosScreenTime';
import { DEV_FLAGS } from './paywall';
import { UsageTrackingModule } from './usageTrackingModule';

// Away time is shared logic (awayTime.ts); only how uses are collected differs.
// Each platform's native side buffers uses while the app is closed and hands
// them over here in one shape.

export type AwayNativeUse = {
  /** `app_use_log.app_identifier`: a package name on Android, `ios.app.<key>` on iOS. */
  identifier: string;
  usedAtMs: number;
};

export type AwayNativeGap = { startedMs: number; endedMs: number };

export type AwayBackend = {
  platform: 'android' | 'ios';
  setEnabled: (enabled: boolean) => Promise<void>;
  drainUses: () => Promise<AwayNativeUse[]>;
  drainGaps: () => Promise<AwayNativeGap[]>;
  /** `enabled` means tracking is on and able to run (service connected, access granted). */
  getStatus: () => Promise<{ enabled: boolean; lastHeartbeatMs: number | null }>;
};

const androidBackend: AwayBackend = {
  platform: 'android',
  setEnabled: enabled => UsageTrackingModule.setAwayTrackingEnabled(enabled),
  drainUses: async () =>
    (await UsageTrackingModule.drainUseLog()).map(row => ({
      identifier: row.package,
      usedAtMs: row.usedAtMs,
    })),
  drainGaps: () => UsageTrackingModule.drainGaps(),
  getStatus: async () => {
    const [enabled, lastHeartbeatMs] = await Promise.all([
      UsageTrackingModule.isEnabled(),
      UsageTrackingModule.getLastHeartbeatMs(),
    ]);
    return { enabled, lastHeartbeatMs };
  },
};

const iosBackend: AwayBackend = {
  platform: 'ios',
  setEnabled: enabled => ScreenTime.setAwayTrackingEnabled(enabled),
  drainUses: async () =>
    (await ScreenTime.drainAwayUses()).map(row => ({
      identifier: `${IOS_APP_PREFIX}${row.appKey}`,
      usedAtMs: row.usedAtMs,
    })),
  drainGaps: () => ScreenTime.drainAwayGaps(),
  getStatus: async () => {
    const status = ScreenTime.getAwayStatus();
    return {
      enabled: Boolean(status?.enabled && status.authorized),
      lastHeartbeatMs: status?.lastHeartbeatMs ?? null,
    };
  },
};

/**
 * The collector for this platform, or null where away time isn't available.
 * iOS stays off until `DEV_FLAGS.iosAwayTrackingPreview` is on: it needs a
 * real-device reliability test (docs/away-time-ios-spec.md) first.
 */
export function getAwayBackend(): AwayBackend | null {
  if (Platform.OS === 'android') {
    return androidBackend;
  }
  if (Platform.OS === 'ios' && DEV_FLAGS.iosAwayTrackingPreview && ScreenTime.isAvailable) {
    return iosBackend;
  }
  return null;
}

export function isAwayTrackingSupported(): boolean {
  return getAwayBackend() !== null;
}
