import { typography } from '../theme/typography';
import { Text } from './AppText';
﻿import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { TIER_SWITCHER_ENABLED } from '../domain/paywall';
import { COACH_SAMPLE_COPY } from '../domain/focusCoachCopy';
import { colors } from '../theme/tokens';

export function DevCoachSampleControls() {
  const [busy, setBusy] = useState(false);
  if (!__DEV__ || !TIER_SWITCHER_ENABLED) return null;
  const change = async (action: 'load' | 'remove') => {
    if (__DEV__ && TIER_SWITCHER_ENABLED) {
      if (busy) return;
      setBusy(true);
      try {
        const samples = await import('../data/coachSampleRepository');
        if (action === 'load') await samples.loadSampleSessions();
        else await samples.removeSampleSessions();
      } catch (error) {
        console.warn('Could not change sample sessions:', error);
        Alert.alert(COACH_SAMPLE_COPY.failed, COACH_SAMPLE_COPY.retry);
      } finally { setBusy(false); }
    }
  };
  return <View testID="coach-sample-controls" style={styles.controls}>
    {(['load', 'remove'] as const).map(action => <Pressable key={action}
      accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy}
      onPress={() => change(action)} style={({ pressed }) => [styles.button, (pressed || busy) && styles.pressed]}>
      <Text style={styles.text}>{COACH_SAMPLE_COPY[action]}</Text>
    </Pressable>)}
  </View>;
}
const styles = StyleSheet.create({
  controls: { padding: 12, gap: 8, backgroundColor: colors.panelBottom },
  button: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.panelTop },
  text: { color: colors.ink, fontFamily: 'Geist', ...typography.caption },
  pressed: { opacity: .7 },
});
