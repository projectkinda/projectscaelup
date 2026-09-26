import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { ScreenTimeStatus } from './ScreenTime.types';

declare class ScreenTimeNativeModule extends NativeModule {
  getStatus(): ScreenTimeStatus;
  requestAuthorization(): Promise<ScreenTimeStatus>;
  presentFlaggedAppsPicker(maxApps: number | null): Promise<ScreenTimeStatus>;
  startSession(id: number, modeName: string, endsAtMs: number): Promise<void>;
  pauseSession(): Promise<void>;
  resumeSession(endsAtMs: number): Promise<void>;
  endSession(id: number): Promise<number[]>;
  lockDown(untilMs: number): Promise<void>;
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

  async startSession(id: number, modeName: string, endsAt: Date): Promise<void> {
    await native?.startSession(id, modeName, endsAt.getTime());
  },

  async pauseSession(): Promise<void> {
    await native?.pauseSession();
  },

  async resumeSession(endsAt: Date): Promise<void> {
    await native?.resumeSession(endsAt.getTime());
  },

  /** Ends the session natively and returns when each "Open anyway" distraction happened. */
  async endSession(id: number): Promise<Date[]> {
    const timestamps = (await native?.endSession(id)) ?? [];
    return timestamps.map(ms => new Date(ms));
  },

  async lockDown(until: Date): Promise<void> {
    await native?.lockDown(until.getTime());
  },

  /** Brings the shields in line with the current time. Call when the app becomes active. */
  async reconcile(): Promise<void> {
    await native?.reconcile();
  },
};
