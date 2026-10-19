import Svg, { Path } from 'react-native-svg';
import { typography } from '../../theme/typography';
import { Text } from '../../components/AppText';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout } from '../../theme/tokens';
import { PrimaryBar } from './WelcomeStep';

type DoneStepProps = {
  onBack: () => void;
  onComplete: () => void;
};

export function DoneStep({ onBack, onComplete }: DoneStepProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 26,
            paddingBottom: insets.bottom + 112,
          },
        ]}
      >
        <View style={styles.content}>
          <BackButton onPress={onBack} />
          <View style={styles.center}>
            <Text style={styles.title}>All set.</Text>
            <Text style={styles.body}>
              Start your first session whenever you're ready.
            </Text>
          </View>
        </View>
      </ScrollView>
      <PrimaryBar label="Start" onPress={onComplete} bottomInset={insets.bottom} />
    </View>
  );
}

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onPress}
      style={({ pressed }) => [
        styles.backButton,
        pressed && styles.pressed,
      ]}
    >
      <Svg testID="back-chevron" width={24} height={24} viewBox="0 0 24 24" accessible={false}>
        <Path d="M15 5l-7 7 7 7" fill="none" stroke={colors.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
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
    minHeight: 520,
    paddingHorizontal: layout.horizontalPadding,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  pressed: {
    opacity: 0.6,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    color: colors.ink,
    ...typography.display,
    fontWeight: '800',
  },
  body: {
    marginTop: 16,
    color: colors.muted,
    ...typography.subheading,
    fontWeight: '600',
  },
});
