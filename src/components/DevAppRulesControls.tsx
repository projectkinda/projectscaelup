import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { DEV_FLAGS } from '../domain/paywall';
import { colors } from '../theme/tokens';
import { typography } from '../theme/typography';

export function DevAppRulesControls({ flaggedPackages }: { flaggedPackages: string[] }) {
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState('');
  if (!DEV_FLAGS.tierSwitcher || Platform.OS !== 'android') return null;
  const run = async (action: 'schedule' | 'schedule-later' | 'limit' | 'usage' | 'clear' | 'diagnostics') => {
    if (!DEV_FLAGS.tierSwitcher || busy) return;
    setBusy(true);
    try {
      if (action === 'diagnostics') {
        const [{ getInstalledApps }, { AppRulesModule, getSelectableRuleApps }, { formatPickerDiagnostics }] = await Promise.all([
          import('../domain/appPicker'), import('../domain/appRulesModule'), import('../domain/appPickerDiagnostics'),
        ]);
        const installed = await getInstalledApps();
        const [excluded, reasons] = await Promise.all([AppRulesModule.getExcludedPackages(), AppRulesModule.getExcludedPackageReasons()]);
        try {
          const selectable = await getSelectableRuleApps(installed);
          setOutput(formatPickerDiagnostics(installed, excluded, selectable, reasons, flaggedPackages));
        } catch (error) {
          setOutput(formatPickerDiagnostics(installed, excluded, [], reasons, flaggedPackages) + '\nPicker error: ' + String(error));
        }
        return;
      }
      const rules = await import('../data/appRulesRepository');
      if (action === 'clear') { await rules.clearDevAppRules(); setOutput('All test rules cleared. Today usage is retained.'); }
      else if (action === 'usage') {
        const { AppRulesModule } = await import('../domain/appRulesModule');
        const versions = await rules.getEnforcedVersions();
        const usage = await AppRulesModule.getTodayUsage([...new Set(versions.flatMap(version => version.apps))]);
        setOutput(JSON.stringify(usage, null, 2));
      } else {
        const pkg = flaggedPackages[0];
        if (!pkg) { setOutput('Choose a flagged app first.'); return; }
        const kind = action === 'schedule-later' ? 'schedule' : action;
        const result = await rules.createDevTestRule(pkg, kind, new Date(), action === 'schedule-later' ? 1 : 0);
        setOutput(result.ok ? 'Added ' + action + ' rule for ' + pkg + '. Requires Pro, accessibility, and overlay permission.' : result.error);
      }
    } catch (error) { setOutput(error instanceof Error ? error.message : 'Could not run app rule test.'); }
    finally { setBusy(false); }
  };
  const buttons = [
    ['schedule', 'Add 3-min schedule block for my first flagged app (starts now)'],
    ['schedule-later', 'Add 3-min schedule starting in 1 min (mid-use test)'],
    ['limit', 'Add 1-min daily limit for my first flagged app'],
    ['usage', "Show today's usage for rule apps"],
    ['clear', 'Clear all rules'],
    ['diagnostics', 'App picker diagnostics'],
  ] as const;
  return <View testID="dev-app-rules" style={styles.panel}>
    <Text style={styles.title}>App rules (testing only)</Text>
    {buttons.map(([action, label]) => <Pressable key={action} accessibilityRole="button" disabled={busy}
      accessibilityState={{ disabled: busy }} onPress={() => run(action)}
      style={({ pressed }) => [styles.button, (busy || pressed) && styles.dim]}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>)}
    {output ? <Text selectable accessibilityLiveRegion="polite" style={styles.output}>{output}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  panel: { gap: 8, padding: 12, backgroundColor: colors.panelBottom },
  title: { ...typography.body, color: colors.ink, fontWeight: '600' },
  button: { padding: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.panelTop },
  label: { ...typography.label, color: colors.ink },
  output: { ...typography.caption, color: colors.muted },
  dim: { opacity: .6 },
});
