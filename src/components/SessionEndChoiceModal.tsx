import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

import { colors } from '../theme/tokens';

const CHIME_SOURCE = require('../assets/sounds/session-complete.wav');
const ALARM_DURATION_MS = 5000;

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

  useEffect(() => {
    player.loop = true;
    player.seekTo(0);
    player.play();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

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
      player.pause();
    }, ALARM_DURATION_MS);

    return () => {
      clearTimeout(stopTimer);
      player.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddTime = () => {
    player.pause();
    onAddTime();
  };

  const handleEndSession = () => {
    player.pause();
    onEndSession();
  };

  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <Animated.View
          style={[styles.card, { opacity, transform: [{ scale }] }]}
        >
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
    backgroundColor: colors.warmWhite,
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
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonLabel: {
    color: colors.warmWhite,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    width: '100%',
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.divider,
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
