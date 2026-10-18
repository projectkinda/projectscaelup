import { NativeModules, Platform } from 'react-native';
import { getInstalledApps, type InstalledApp } from './appPicker';
import { isRulePackageAllowed, type EnforcedRuleVersion } from './appRules';

type Bridge = {
  setRules: (json: string) => Promise<void>;
  getTodayUsage: (packages: string[]) => Promise<Record<string, number>>;
  getExcludedPackages: () => Promise<string[]>;
};
const bridge = () => Platform.OS === 'android' ? NativeModules.AppRulesBridge as Bridge | undefined : undefined;
export const AppRulesModule = {
  async setRules(versions: EnforcedRuleVersion[]): Promise<void> {
    try { await bridge()?.setRules(JSON.stringify(versions)); }
    catch (error) { console.warn('Could not sync app rules:', error); }
  },
  async getTodayUsage(packages: string[]): Promise<Record<string, number>> {
    try { return await bridge()?.getTodayUsage(packages) ?? {}; }
    catch (error) { console.warn('Could not read rule usage:', error); return {}; }
  },
  async getExcludedPackages(): Promise<string[]> {
    try { return await bridge()?.getExcludedPackages() ?? []; }
    catch (error) { console.warn('Could not resolve protected apps:', error); return []; }
  },
};
/** All installed launchable apps, independent of flagged apps and their free cap. */
export async function getSelectableRuleApps(): Promise<InstalledApp[]> {
  if (Platform.OS !== 'android' || !bridge()) return [];
  try {
    // Fail closed on resolver failure: do not offer potentially protected apps.
    const excluded = await bridge()!.getExcludedPackages();
    return (await getInstalledApps()).filter(app => isRulePackageAllowed(app.packageName, excluded));
  } catch (error) { console.warn('Could not load rule apps:', error); return []; }
}
