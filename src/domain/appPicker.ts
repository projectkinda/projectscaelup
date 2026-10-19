import { debug } from './releaseLog';
import { NativeModules, Platform } from 'react-native';

export type InstalledApp = {
  packageName: string;
  displayName: string;
  iconBase64: string;
};

type NativeAppPickerBridge = {
  getInstalledApps: () => Promise<InstalledApp[]>;
};

const AppPickerBridge = NativeModules.AppPickerBridge as
  | NativeAppPickerBridge
  | undefined;

// iOS can't list installed apps; flagged apps there will come from Apple's
// Screen Time picker once the Family Controls integration exists.
export const isAppPickerSupported =
  Platform.OS === 'android' && AppPickerBridge !== undefined;

export async function getInstalledApps(): Promise<InstalledApp[]> {
  debug('App picker bridge status:', { platform: Platform.OS, defined: AppPickerBridge !== undefined && AppPickerBridge !== null });
  if (!isAppPickerSupported || !AppPickerBridge) {
    return [];
  }

  const apps = await AppPickerBridge.getInstalledApps();
  debug('App picker returned apps:', { count: apps.length });
  return apps.sort((a, b) => a.displayName.localeCompare(b.displayName));
}
