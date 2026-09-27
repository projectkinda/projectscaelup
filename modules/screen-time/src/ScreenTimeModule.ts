import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { ScreenTimeDistraction, ScreenTimeStatus } from './ScreenTime.types';

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
};
