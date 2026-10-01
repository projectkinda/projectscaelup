import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  type EmitterSubscription,
} from 'react-native';

type ForegroundAppChangedEvent = {
  packageName?: string;
};

type AppUsageTick = {
  appIdentifier: string;
};

type AppUsageCallback = (tick: AppUsageTick) => void;

type NativeUsageTrackingBridge = {
  isAccessibilityServiceEnabled: () => Promise<boolean>;
  openAccessibilitySettings: () => void;
  setFlaggedPackages: (packages: string[]) => Promise<void>;
  drainUseLog: () => Promise<{ package: string; usedAtMs: number }[]>;
  drainGaps: () => Promise<{ startedMs: number; endedMs: number }[]>;
  getLastUsedAt: () => Promise<Record<string, number>>;
  setAwayTrackingEnabled: (enabled: boolean) => Promise<void>;
  getLastHeartbeatMs: () => Promise<number | null>;
  getLastFailure: () => Promise<{ message: string; failedAtMs: number } | null>;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
};

const UsageTrackingBridge = NativeModules
  .UsageTrackingBridge as NativeUsageTrackingBridge | undefined;

const emitter =
  Platform.OS === 'android' && UsageTrackingBridge
    ? new NativeEventEmitter(UsageTrackingBridge)
    : null;

export const UsageTrackingModule = {
  onAppUsageTick(callback: AppUsageCallback): () => void {
    let subscription: EmitterSubscription | null = null;

    subscription =
      emitter?.addListener(
        'foregroundAppChanged',
        (event: ForegroundAppChangedEvent) => {
          if (event.packageName) {
            callback({ appIdentifier: event.packageName });
          }
        },
      ) ?? null;

    return () => subscription?.remove();
  },

  isEnabled(): Promise<boolean> {
    return UsageTrackingBridge?.isAccessibilityServiceEnabled() ??
      Promise.resolve(false);
  },

  openSettings(): void {
    UsageTrackingBridge?.openAccessibilitySettings();
  },

  setFlaggedPackages(packages: string[]): Promise<void> {
    return UsageTrackingBridge?.setFlaggedPackages(packages) ??
      Promise.resolve();
  },

  drainUseLog(): Promise<{ package: string; usedAtMs: number }[]> {
    return UsageTrackingBridge?.drainUseLog() ?? Promise.resolve([]);
  },

  drainGaps(): Promise<{ startedMs: number; endedMs: number }[]> {
    return UsageTrackingBridge?.drainGaps() ?? Promise.resolve([]);
  },

  getLastUsedAt(): Promise<Record<string, number>> {
    return UsageTrackingBridge?.getLastUsedAt() ?? Promise.resolve({});
  },

  setAwayTrackingEnabled(enabled: boolean): Promise<void> {
    return UsageTrackingBridge?.setAwayTrackingEnabled(enabled) ??
      Promise.resolve();
  },

  getLastHeartbeatMs(): Promise<number | null> {
    return UsageTrackingBridge?.getLastHeartbeatMs() ?? Promise.resolve(null);
  },

  getLastFailure(): Promise<{ message: string; failedAtMs: number } | null> {
    return UsageTrackingBridge?.getLastFailure() ?? Promise.resolve(null);
  },
};
