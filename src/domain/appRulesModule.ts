import { warn } from './releaseLog';
﻿import { NativeModules, Platform } from 'react-native';
import { getInstalledApps, type InstalledApp } from './appPicker';
import { isRulePackageAllowed, type EnforcedRuleVersion } from './appRules';
import { TIER_SWITCHER_ENABLED } from './paywall';
type Bridge = {
  setRules: (json: string) => Promise<void>;
  setTestToolsEnabled?: (enabled: boolean) => Promise<void>;
  getTodayUsage: (packages: string[]) => Promise<Record<string, number>>;
  getExcludedPackages: () => Promise<string[]>;
  getExcludedPackageReasons: () => Promise<Record<string, string>>;
};
const bridge = () => Platform.OS === 'android' ? NativeModules.AppRulesBridge as Bridge | undefined : undefined;
export const AppRulesModule = {
  async setRules(versions: EnforcedRuleVersion[]): Promise<void> {
    try {
      const native = bridge();
      await native?.setTestToolsEnabled?.(TIER_SWITCHER_ENABLED);
      await native?.setRules(JSON.stringify(versions));
    } catch (error) { warn('Could not sync app rules:', error); }
  },
  async getTodayUsage(packages: string[]): Promise<Record<string, number>> {
    try { return await bridge()?.getTodayUsage(packages) ?? {}; }
    catch (error) { warn('Could not read rule usage:', error); return {}; }
  },
  async getExcludedPackages(): Promise<string[]> {
    try { return await bridge()?.getExcludedPackages() ?? []; }
    catch (error) { warn('Could not resolve protected apps:', error); return []; }
  },
  async getExcludedPackageReasons(): Promise<Record<string, string>> {
    const native = bridge();
    if (!native?.getExcludedPackageReasons) throw new Error('Picker diagnostics need the updated Android APK.');
    return native.getExcludedPackageReasons();
  },
};
/** Errors propagate to the picker so it can retain its last successful list. */
export async function getSelectableRuleApps(installed?: InstalledApp[]): Promise<InstalledApp[]> {
  if (Platform.OS !== 'android') return [];
  const native = bridge();
  if (!native) throw new Error('App rules need the updated Android APK.');
  const excluded = await native.getExcludedPackages();
  const all = installed ?? await getInstalledApps();
  const selectable = all.filter(app => isRulePackageAllowed(app.packageName, excluded));
  if (all.length && !selectable.length) throw new Error('No selectable apps returned for installed apps.');
  return selectable;
}
