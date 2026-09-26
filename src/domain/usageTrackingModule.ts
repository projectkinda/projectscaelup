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
};
