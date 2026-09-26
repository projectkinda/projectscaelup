import { NativeModules, Platform } from 'react-native';

import { applyLockdown as applyIosLockdown } from './iosScreenTime';

type NativeLockdownBridge = {
  applyLockdown: (appIdentifiers: string[], expiresAt: string) => Promise<void>;
  canDrawOverlays: () => Promise<boolean>;
  openOverlaySettings: () => void;
};

const LockdownBridge = NativeModules.LockdownBridge as
  | NativeLockdownBridge
  | undefined;

export const LockdownModule = {
  applyLockdown(appIdentifiers: string[], expiresAt: string): Promise<void> {
    if (Platform.OS === 'ios') {
      return applyIosLockdown(expiresAt);
    }

    if (Platform.OS !== 'android' || !LockdownBridge) {
      return Promise.resolve();
    }

    return LockdownBridge.applyLockdown(appIdentifiers, expiresAt);
  },

  canDrawOverlays(): Promise<boolean> {
    if (Platform.OS !== 'android' || !LockdownBridge) {
      return Promise.resolve(false);
    }

    return LockdownBridge.canDrawOverlays();
  },

  openSettings(): void {
    LockdownBridge?.openOverlaySettings();
  },
};
