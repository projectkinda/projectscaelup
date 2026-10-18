import { rulePackageExclusionReason } from './appRules';
import type { InstalledApp } from './appPicker';
/** Random sample without replacement; injected random makes fixture output deterministic. */
export function pickerDiagnosticPackages(flagged: readonly string[], installed: readonly InstalledApp[], random = Math.random): string[] {
  const pool = [...new Set(installed.map(app => app.packageName))];
  const sampled: string[] = [];
  while (pool.length && sampled.length < 5) sampled.push(...pool.splice(Math.floor(random() * pool.length), 1));
  return [...new Set([...flagged, ...sampled])];
}
export function formatPickerDiagnostics(installed: readonly InstalledApp[], excluded: readonly string[], selectable: readonly InstalledApp[], reasons: Record<string, string>, flagged: readonly string[], random = Math.random): string {
  const runtimeReasons = { ...Object.fromEntries(excluded.map(pkg => [pkg, 'unknown role (native reason missing)'])), ...reasons };
  const installedNames = new Set(installed.map(app => app.packageName));
  return ['Installed: ' + installed.length, 'Excluded: ' + excluded.length, 'Selectable: ' + selectable.length,
    ...pickerDiagnosticPackages(flagged, installed, random).map(pkg => {
      const reason = rulePackageExclusionReason(pkg, runtimeReasons);
      return pkg + ': installed ' + (installedNames.has(pkg) ? 'yes' : 'no') + '; ' + (reason ?? (installedNames.has(pkg) ? 'selectable' : 'not returned by installed-app query'));
    })].join('\n');
}
