import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
      <Text style={styles.backButtonText}>{'<'}</Text>
    </Pressable>
  );
}

const CARD_BORDER = 'rgba(255, 255, 255, 0.12)';

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
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.module,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  backButtonText: {
    color: colors.ink,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.82,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    color: colors.ink,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800',
  },
  body: {
    marginTop: 16,
    color: colors.muted,
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '600',
  },
});
