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

function warnAwayTimeFailure(methodName: string, error: unknown) {
  console.warn(`Away-time native method ${methodName} failed:`, error);
}

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
    return (
      UsageTrackingBridge?.setFlaggedPackages?.(packages).catch(error => {
        warnAwayTimeFailure('setFlaggedPackages', error);
      }) ?? Promise.resolve()
    );
  },

  drainUseLog(): Promise<{ package: string; usedAtMs: number }[]> {
    return (
      UsageTrackingBridge?.drainUseLog?.().catch(error => {
        warnAwayTimeFailure('drainUseLog', error);
        return [];
      }) ?? Promise.resolve([])
    );
  },

  drainGaps(): Promise<{ startedMs: number; endedMs: number }[]> {
    return (
      UsageTrackingBridge?.drainGaps?.().catch(error => {
        warnAwayTimeFailure('drainGaps', error);
        return [];
      }) ?? Promise.resolve([])
    );
  },

  getLastUsedAt(): Promise<Record<string, number>> {
    return (
      UsageTrackingBridge?.getLastUsedAt?.().catch(error => {
        warnAwayTimeFailure('getLastUsedAt', error);
        return {};
      }) ?? Promise.resolve({})
    );
  },

  setAwayTrackingEnabled(enabled: boolean): Promise<void> {
    return (
      UsageTrackingBridge?.setAwayTrackingEnabled?.(enabled).catch(error => {
        warnAwayTimeFailure('setAwayTrackingEnabled', error);
      }) ?? Promise.resolve()
    );
  },

  getLastHeartbeatMs(): Promise<number | null> {
    return (
      UsageTrackingBridge?.getLastHeartbeatMs?.().catch(error => {
        warnAwayTimeFailure('getLastHeartbeatMs', error);
        return null;
      }) ?? Promise.resolve(null)
    );
  },

  getLastFailure(): Promise<{ message: string; failedAtMs: number } | null> {
    return (
      UsageTrackingBridge?.getLastFailure?.().catch(error => {
        warnAwayTimeFailure('getLastFailure', error);
        return null;
      }) ?? Promise.resolve(null)
    );
  },
};
