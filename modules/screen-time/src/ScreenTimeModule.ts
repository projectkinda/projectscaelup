import { NativeModule, requireOptionalNativeModule } from 'expo';

import type {
  AwayGapRecord,
  AwayStatus,
  AwayUseRecord,
  ScreenTimeDistraction,
  ScreenTimeStatus,
} from './ScreenTime.types';

declare class ScreenTimeNativeModule extends NativeModule {
  getStatus(): ScreenTimeStatus;
  requestAuthorization(): Promise<ScreenTimeStatus>;
  presentFlaggedAppsPicker(maxApps: number | null): Promise<ScreenTimeStatus>;
  setStrictMode(enabled: boolean): Promise<ScreenTimeStatus>;
  startSession(id: number, modeName: string, endsAtMs: number): Promise<void>;
  pauseSession(): Promise<void>;
  resumeSession(endsAtMs: number): Promise<void>;
  endSession(id: number): Promise<{ occurredAtMs: number; appKey: string | null }[]>;
  lockDown(untilMs: number, appKeys: string[] | null): Promise<void>;
  reconcile(): Promise<void>;
  setAwayTrackingEnabled(enabled: boolean): Promise<void>;
  drainAwayUses(): Promise<AwayUseRecord[]>;
  drainAwayGaps(): Promise<AwayGapRecord[]>;
  getAwayStatus(): AwayStatus;
  // Debug builds only; absent from release builds.
  debugStopAwayTracking?(): Promise<void>;
  debugSimulateAwayFailure?(): Promise<void>;
  debugClearAwayHeartbeat?(): Promise<void>;
}

// iOS only. Elsewhere (and in builds without the module) every call is a no-op.
const native = requireOptionalNativeModule<ScreenTimeNativeModule>('ScreenTime');

export const ScreenTime = {
  isAvailable: native !== null,

  getStatus(): ScreenTimeStatus | null {
    return native?.getStatus() ?? null;
  },

  async requestAuthorization(): Promise<ScreenTimeStatus | null> {
    return native ? native.requestAuthorization() : null;
  },

  /** Opens Apple's app picker. `maxApps` is the free-plan cap; `null` means unlimited. */
  async presentFlaggedAppsPicker(maxApps: number | null): Promise<ScreenTimeStatus | null> {
    return native ? native.presentFlaggedAppsPicker(maxApps) : null;
  },

  /** Strict mode locks flagged apps during sessions; off, their use is tracked silently. */
  async setStrictMode(enabled: boolean): Promise<ScreenTimeStatus | null> {
    return native ? native.setStrictMode(enabled) : null;
  },

  async startSession(id: number, modeName: string, endsAt: Date): Promise<void> {
    await native?.startSession(id, modeName, endsAt.getTime());
  },

  async pauseSession(): Promise<void> {
    await native?.pauseSession();
  },

  async resumeSession(endsAt: Date): Promise<void> {
    await native?.resumeSession(endsAt.getTime());
  },

  /** Ends the session natively and returns its distractions. */
  async endSession(id: number): Promise<ScreenTimeDistraction[]> {
    const records = (await native?.endSession(id)) ?? [];
    return records.map(record => ({ occurredAt: new Date(record.occurredAtMs), appKey: record.appKey }));
  },

  /** Locks `appKeys` until `until`; `null` locks every flagged app. */
  async lockDown(until: Date, appKeys: string[] | null): Promise<void> {
    await native?.lockDown(until.getTime(), appKeys);
  },

  /** Brings the shields in line with the current time. Call when the app becomes active. */
  async reconcile(): Promise<void> {
    await native?.reconcile();
  },

  /**
   * Away time (opt-in): watches flagged apps outside sessions so the app can
   * say how long the user has stayed away. Turning it off deletes native data.
   */
  async setAwayTrackingEnabled(enabled: boolean): Promise<void> {
    await native?.setAwayTrackingEnabled(enabled);
  },

  /** Uses the extension buffered while the app was closed; returns and clears them. */
  async drainAwayUses(): Promise<AwayUseRecord[]> {
    return (await native?.drainAwayUses()) ?? [];
  },

  /** Stretches when tracking wasn't provably alive; returns and clears them. */
  async drainAwayGaps(): Promise<AwayGapRecord[]> {
    return (await native?.drainAwayGaps()) ?? [];
  },

  getAwayStatus(): AwayStatus | null {
    return native?.getAwayStatus() ?? null;
  },

  /** Dev-only hooks for the dead-tracking test. They don't exist in release builds. */
  debug: {
    stopAwayTracking: async () => native?.debugStopAwayTracking?.(),
    simulateAwayFailure: async () => native?.debugSimulateAwayFailure?.(),
    clearAwayHeartbeat: async () => native?.debugClearAwayHeartbeat?.(),
  },
};
