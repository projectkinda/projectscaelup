import { typography } from '../theme/typography';
import { Text } from '../components/AppText';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout } from '../theme/tokens';

type PaywallStubScreenProps = {
  onDismiss: () => void;
};

export function PaywallStubScreen({
  onDismiss,
}: PaywallStubScreenProps): React.JSX.Element {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: insets.top + 30,
          paddingBottom: insets.bottom + 30,
        },
      ]}
    >
      <LinearGradient colors={['#333333', '#141414']} style={styles.card}>
        <Text style={styles.title}>This is a premium feature.</Text>
        <Text style={styles.copy}>
          Upgrade to unlock full history, more modes, and more.
        </Text>

        <View style={styles.actions}>
          <View
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            style={styles.upgradeButton}
          >
            <Text style={styles.upgradeText}>Upgrade</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Not now"
            onPress={onDismiss}
            style={({ pressed }) => [
              styles.dismissButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.dismissText}>Not now</Text>
          </Pressable>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.horizontalPadding,
    backgroundColor: colors.background,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 22,
  },
  title: {
    color: colors.ink,
    ...typography.stat,
    fontWeight: '700',
    textAlign: 'center',
  },
  copy: {
    marginTop: 10,
    color: colors.muted,
    ...typography.body,
    textAlign: 'center',
  },
  actions: {
    marginTop: 24,
    gap: 10,
  },
  upgradeButton: {
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(237, 237, 237, 0.20)',
  },
  upgradeText: {
    color: 'rgba(237, 237, 237, 0.42)',
    ...typography.body,
    fontWeight: '700',
  },
  dismissButton: {
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: {
    color: colors.ink,
    ...typography.body,
    fontWeight: '700',
  },
  pressed: { opacity: 0.55 },
});
