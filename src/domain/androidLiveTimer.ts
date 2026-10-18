import { TIER_SWITCHER_ENABLED } from './paywall';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Alert, PermissionsAndroid, Platform } from 'react-native';

import { createLiveTimerController, type LiveTimerNative } from './liveTimerController';

declare class LiveTimerModule extends NativeModule<{ onOpenTimer: () => void }> {
  startLiveTimer(endsAtMs: number, label: string): void;
  pauseLiveTimer(remainingMs: number, timeoutMs: number): void;
  resumeLiveTimer(endsAtMs: number): void;
  stopLiveTimer(): void;
  consumeOpenRequest(): boolean;
  getStyleOverride(): LiveTimerStyle;
  setStyleOverride(style: LiveTimerStyle, testToolsEnabled: boolean): boolean;
}

export type LiveTimerStyle = 'custom' | 'standard';

function getNative() {
  try {
    return Platform.OS === 'android' ? requireOptionalNativeModule<LiveTimerModule>('LiveTimer') : null;
  } catch { return null; }
}

const ATTEMPTS_KEY = 'android_live_timer_notification_permission_attempts';
let permissionInFlight: Promise<boolean> | null = null;

async function requestNotificationPermission(stillActive: () => boolean): Promise<boolean> {
  try {
    if (Platform.OS !== 'android' || !getNative()) return false;
    if (Number(Platform.Version) < 33) return true;
    const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    if (await PermissionsAndroid.check(permission)) return true;
    if (permissionInFlight) return permissionInFlight;
    permissionInFlight = (async () => {
      const raw = Number(await AsyncStorage.getItem(ATTEMPTS_KEY));
      const attempts = Number.isFinite(raw) ? Math.max(0, raw) : 2;
      if (attempts >= 2 || !stillActive()) return false;
      // Count before showing UI, including a skipped explanation or process death.
      await AsyncStorage.setItem(ATTEMPTS_KEY, String(attempts + 1));
      const accepted = await new Promise<boolean>(resolve => {
        Alert.alert('Focus timer', "Shows your timer in the notification bar while you're in other apps", [
          { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Continue', onPress: () => resolve(true) },
        ], { cancelable: true, onDismiss: () => resolve(false) });
      });
      if (!accepted || !stillActive()) return false;
      const result = await PermissionsAndroid.request(permission);
      return result === PermissionsAndroid.RESULTS.GRANTED;
    })();
    try { return await permissionInFlight; } finally { permissionInFlight = null; }
  } catch { return false; }
}

// Lookup is deferred and every native call remains optional, including Expo Go.
const native: LiveTimerNative = {
  startLiveTimer: (end, label) => getNative()?.startLiveTimer(end, label),
  pauseLiveTimer: (remaining, timeout) => getNative()?.pauseLiveTimer(remaining, timeout),
  resumeLiveTimer: end => getNative()?.resumeLiveTimer(end),
  stopLiveTimer: () => getNative()?.stopLiveTimer(),
};
const controller = createLiveTimerController({ native, requestPermission: requestNotificationPermission });

export const { startLiveTimer, pauseLiveTimer, resumeLiveTimer, stopLiveTimer } = controller;

/** Test-build comparison only; native persists the choice for the next start. */
export function getLiveTimerStyleOverride(): LiveTimerStyle | null {
  if (!TIER_SWITCHER_ENABLED || Platform.OS !== 'android') return null;
  try {
    const style = getNative()?.getStyleOverride?.();
    return style === 'custom' || style === 'standard' ? style : null;
  } catch { return null; }
}
export function setLiveTimerStyleOverride(style: LiveTimerStyle): boolean {
  if (!TIER_SWITCHER_ENABLED || Platform.OS !== 'android' || !['custom', 'standard'].includes(style)) return false;
  try { return getNative()?.setStyleOverride?.(style, TIER_SWITCHER_ENABLED) === true; }
  catch { return false; }
}

export function onLiveTimerOpen(onOpen: () => void): () => void {
  try {
    const module = getNative();
    if (!module) return () => {};
    const subscription = module.addListener('onOpenTimer', () => {
      try { module.consumeOpenRequest(); onOpen(); } catch { /* Optional navigation. */ }
    });
    if (module.consumeOpenRequest()) onOpen();
    return () => { try { subscription.remove(); } catch { /* Optional module. */ } };
  } catch { return () => {}; }
}
