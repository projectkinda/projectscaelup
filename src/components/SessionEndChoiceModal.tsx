import { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '../theme/tokens';

const CHIME_SOURCE = require('../assets/sounds/session-complete.wav');
const ALARM_DURATION_MS = 5000;
const CARD_BORDER = 'rgba(255, 255, 255, 0.12)';

function ignoreRejectedAudioCall(result: unknown) {
  if (
    result &&
    typeof result === 'object' &&
    'catch' in result &&
    typeof result.catch === 'function'
  ) {
    result.catch(() => {});
  }
}

function stopAudioSafely(player: { pause: () => void }) {
  try {
    ignoreRejectedAudioCall(player.pause());
  } catch {
    // Expo can release the native audio object before a queued stop runs.
  }
}

export function SessionEndChoiceModal({
  onAddTime,
  onEndSession,
}: {
  onAddTime: () => void;
  onEndSession: () => void;
}) {
  const player = useAudioPlayer(CHIME_SOURCE);
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const stoppedRef = useRef(false);

  const safePause = () => {
    if (stoppedRef.current) {
      return;
    }

    stoppedRef.current = true;
    stopAudioSafely(player);
  };

  useEffect(() => {
    let cancelled = false;
    stoppedRef.current = false;

    async function startAudio() {
      try {
        player.loop = true;
        await player.seekTo(0);
        if (!cancelled) {
          player.play();
        }
      } catch {
        // Keep the modal usable even if the chime cannot be started.
      }
    }

    startAudio();

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );

    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: false,
        friction: 8,
        tension: 120,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: false,
      }),
    ]).start();

    const stopTimer = setTimeout(() => {
      safePause();
    }, ALARM_DURATION_MS);

    return () => {
      cancelled = true;
      clearTimeout(stopTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddTime = () => {
    safePause();
    onAddTime();
  };

  const handleEndSession = () => {
    safePause();
    onEndSession();
  };

  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <Animated.View
          style={[styles.card, { opacity, transform: [{ scale }] }]}
        >
          <LinearGradient colors={['#333333', '#141414']} style={styles.cardFill}>
            <Text style={styles.title}>Session complete</Text>
            <Text style={styles.body}>
              Time's up. Want to keep going, or end the session here?
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add 5 more minutes"
              onPress={handleAddTime}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryButtonLabel}>+ 5 more minutes</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="End session"
              onPress={handleEndSession}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonLabel}>End session</Text>
            </Pressable>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    overflow: 'hidden',
  },
  cardFill: {
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 12,
    alignItems: 'center',
  },
  title: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 8,
  },
  primaryButton: {
    width: '100%',
    height: 52,
    borderRadius: 12,
    backgroundColor: 'rgba(237, 237, 237, 0.12)',
    borderWidth: 1,
    borderColor: CARD_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonLabel: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    width: '100%',
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonLabel: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: { opacity: 0.85 },
});
