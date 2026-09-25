import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { TallyGroupMark, TallyGroupMarkTransition } from './TallyGroupMark';
import type { TallyMarkPosition } from './TallyCard';
import { colors } from '../theme/tokens';

const MARK_ASPECT = 40 / 50.554;
const POPUP_WIDTH = 120;
const POPUP_HEIGHT = POPUP_WIDTH * MARK_ASPECT;
const CARD_BORDER = 'rgba(255, 255, 255, 0.12)';

// Slowed down so the drawn stroke actually reads before the mark falls away.
const STROKE_DELAY_MS = 260;
const STROKE_DRAW_MS = 480;
const FALL_MS = 850;

type Phase = 'drawing' | 'confirming' | 'falling';

export function SessionCompletePopup({
  target,
  litCount,
  onLanded,
}: {
  target: TallyMarkPosition;
  /** How many strokes the group should show once this stroke is drawn (1-5). */
  litCount: number;
  onLanded: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('drawing');
  const strokeOpacity = useRef(new Animated.Value(0)).current;
  const fall = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const strokeTimer = setTimeout(() => {
      Animated.timing(strokeOpacity, {
        toValue: 1,
        duration: STROKE_DRAW_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) {
          setPhase('confirming');
        }
      });
    }, STROKE_DELAY_MS);

    return () => clearTimeout(strokeTimer);
  }, [strokeOpacity]);

  useEffect(() => {
    if (phase !== 'falling') {
      return;
    }
    Animated.timing(fall, {
      toValue: 1,
      duration: FALL_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        onLanded();
      }
    });
  }, [phase, fall, onLanded]);

  if (phase !== 'falling') {
    return (
      <Modal transparent animationType="fade" statusBarTranslucent>
        <View style={styles.backdrop}>
          <LinearGradient colors={['#333333', '#141414']} style={styles.card}>
            <TallyGroupMarkTransition
              fromLitCount={Math.max(0, litCount - 1)}
              toLitCount={litCount}
              progress={strokeOpacity}
              width={POPUP_WIDTH}
              height={POPUP_HEIGHT}
            />
            {phase === 'confirming' ? (
              <>
                <Text style={styles.title}>
                  Well done - that was a kick-ass session.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Confirm"
                  onPress={() => setPhase('falling')}
                  style={({ pressed }) => [
                    styles.okButton,
                    pressed && styles.okButtonPressed,
                  ]}
                >
                  <Text style={styles.okButtonLabel}>OK</Text>
                </Pressable>
              </>
            ) : null}
          </LinearGradient>
        </View>
      </Modal>
    );
  }

  const screen = Dimensions.get('window');
  const startX = screen.width / 2 - POPUP_WIDTH / 2;
  const startY = screen.height / 2 - POPUP_HEIGHT / 2;
  const endX = target.x + target.width / 2 - POPUP_WIDTH / 2;
  const endY = target.y + target.height / 2 - POPUP_HEIGHT / 2;

  const translateX = fall.interpolate({
    inputRange: [0, 1],
    outputRange: [startX, endX],
  });
  const translateY = fall.interpolate({
    inputRange: [0, 1],
    outputRange: [startY, endY],
  });
  const scale = fall.interpolate({
    inputRange: [0, 1],
    outputRange: [1, target.width / POPUP_WIDTH],
  });
  const opacity = fall.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [1, 1, 0],
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View
        style={[
          styles.mark,
          { transform: [{ translateX }, { translateY }, { scale }], opacity },
        ]}
      >
        <TallyGroupMark litCount={litCount} width={POPUP_WIDTH} height={POPUP_HEIGHT} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    position: 'absolute',
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  title: {
    color: colors.warmWhite,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 22,
  },
  okButton: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(237, 237, 237, 0.12)',
    borderWidth: 1,
    borderColor: CARD_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  okButtonPressed: { opacity: 0.85 },
  okButtonLabel: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
});
