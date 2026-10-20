import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ScreenTime } from '../../modules/screen-time';
import { Text } from './AppText';
import { drainAwayLog } from '../domain/awayTime';
import { isAwayTrackingSupported } from '../domain/awayPlatform';
import { DEV_FLAGS } from '../domain/paywall';
import { colors } from '../theme/tokens';
import { typography } from '../theme/typography';

// Hooks for the away-time dead-tracking test (docs/away-time-ios-spec.md). Like
// the other test tools they follow DEV_FLAGS.tierSwitcher, and the native hooks
// are compiled out of release builds (`#if DEBUG`), so they can't ship.
export function DevAwayControls() {
  const [output, setOutput] = useState('');
  if (!DEV_FLAGS.tierSwitcher || Platform.OS !== 'ios' || !isAwayTrackingSupported()) return null;

  const run = async (action: 'status' | 'drain' | 'stop' | 'fail' | 'clear') => {
    try {
      if (action === 'stop') await ScreenTime.debug.stopAwayTracking();
      if (action === 'fail') await ScreenTime.debug.simulateAwayFailure();
      if (action === 'clear') await ScreenTime.debug.clearAwayHeartbeat();
      if (action === 'drain') await drainAwayLog();
      const status = ScreenTime.getAwayStatus();
      const iso = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : 'none');
      setOutput(
        `enabled: ${status?.enabled}\nauthorized: ${status?.authorized}\n` +
          `heartbeat: ${iso(status?.lastHeartbeatMs)}\nfailure: ${iso(status?.lastFailureMs)}`,
      );
    } catch (error) {
      setOutput(error instanceof Error ? error.message : 'Away-time debug action failed.');
    }
  };

  const buttons = [
    ['status', 'Show away-time status'],
    ['drain', 'Import buffered uses now'],
    ['stop', 'Stop ambient tracking (keepers stay)'],
    ['fail', 'Simulate a failed restart'],
    ['clear', 'Clear the heartbeat'],
  ] as const;

  return (
    <View testID="dev-away" style={styles.panel}>
      <Text style={styles.title}>Away time (testing only)</Text>
      {buttons.map(([action, label]) => (
        <Pressable
          key={action}
          accessibilityRole="button"
          onPress={() => run(action)}
          style={({ pressed }) => [styles.button, pressed && styles.dim]}
        >
          <Text style={styles.label}>{label}</Text>
        </Pressable>
      ))}
      {output ? <Text selectable style={styles.output}>{output}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 8, padding: 12, backgroundColor: colors.panelBottom },
  title: { ...typography.body, color: colors.ink, fontWeight: '600' },
  button: { padding: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.panelTop },
  label: { ...typography.label, color: colors.ink },
  output: { ...typography.caption, color: colors.muted },
  dim: { opacity: 0.6 },
});
