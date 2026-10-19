import { Pressable, StyleSheet } from 'react-native';

import { Text } from '../AppText';
import { colors } from '../../theme/tokens';
import { typography } from '../../theme/typography';

type PillButtonProps = {
  label: string;
  onPress: () => void;
  /** Filled pill, or a plain text button. */
  kind?: 'primary' | 'text';
  disabled?: boolean;
  accessibilityHint?: string;
};

// Flat on purpose: no gradient, no shadow. The filled pill is 56 high; the
// text button is at least 44.
export function PillButton({
  label,
  onPress,
  kind = 'primary',
  disabled = false,
  accessibilityHint,
}: PillButtonProps) {
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        primary ? styles.pill : styles.text,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={primary ? styles.pillLabel : styles.textLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 56,
    borderRadius: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
  },
  pillLabel: {
    color: colors.background,
    textAlign: 'center',
    ...typography.subheading,
    fontWeight: '600',
  },
  text: {
    minHeight: 44,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textLabel: {
    color: colors.ink,
    textAlign: 'center',
    ...typography.body,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
});
