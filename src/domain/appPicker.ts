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

export async function getInstalledApps(): Promise<InstalledApp[]> {
  if (Platform.OS !== 'android' || !AppPickerBridge) {
    return [];
  }

  const apps = await AppPickerBridge.getInstalledApps();
  return apps.sort((a, b) => a.displayName.localeCompare(b.displayName));
}
