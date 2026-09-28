import { LinearGradient } from 'expo-linear-gradient';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout } from '../../theme/tokens';

type WelcomeStepProps = {
  onContinue: () => void;
};

export function WelcomeStep({ onContinue }: WelcomeStepProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 40,
            paddingBottom: insets.bottom + 112,
          },
        ]}
      >
        <View style={styles.content}>
          <View style={styles.animationSlot} />
          <Text style={styles.title}>Sit down. Stay put.</Text>
          <Text style={styles.body}>
            Start a timer. The camera checks you're still at your desk, and the
            app notices when you open apps that pull you away. Get distracted,
            and those apps are locked afterwards.
          </Text>
        </View>
      </ScrollView>
      <PrimaryBar label="Get started" onPress={onContinue} bottomInset={insets.bottom} />
    </View>
  );
}

export function PrimaryBar({
  label,
  disabled = false,
  onPress,
  bottomInset,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  bottomInset: number;
}) {
  return (
    <View style={[styles.bottomBar, { paddingBottom: bottomInset + 18 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.primaryShell,
          pressed && styles.pressed,
          disabled && styles.disabledShell,
        ]}
      >
        <LinearGradient
          colors={['#333333', '#141414']}
          pointerEvents="none"
          style={styles.primaryButton}
        >
          <Text style={[styles.primaryLabel, disabled && styles.disabledLabel]}>
            {label}
          </Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  content: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    paddingHorizontal: layout.horizontalPadding,
  },
  animationSlot: {
    height: 220,
  },
  title: {
    color: colors.ink,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800',
  },
  body: {
    marginTop: 18,
    color: colors.muted,
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '600',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: layout.horizontalPadding,
    paddingTop: 14,
    backgroundColor: colors.background,
  },
  primaryShell: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    height: 53,
    borderRadius: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    color: colors.warmWhite,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
  disabledShell: {
    opacity: 0.44,
  },
  disabledLabel: {
    color: 'rgba(253, 251, 246, 0.6)',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.995 }],
  },
});
