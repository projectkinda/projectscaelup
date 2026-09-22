import React, { useMemo, useReducer, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { SevenSegmentDigit } from './SevenSegmentDigit';
import { colors } from '../theme/tokens';

type TimeModuleProps = {
  label: string;
  value: number;
  max: number;
  step?: number;
  scale?: number;
  onChange: (value: number) => void;
};

// Base (unscaled) dimensions the digit reel geometry was tuned against.
const BASE_MODULE_HEIGHT = 132;
const BASE_ROW_HEIGHT = 64;
const BASE_DIGIT_GAP = 8;
const WINDOW_RADIUS = 6;
const PERSPECTIVE = 420;

// Rows are fully hidden at rest (|distance| >= 1) and only curl into view,
// like the surface of a barrel, as they approach the centre while dragging.
// The opacity/scale curves fall off steeply near the centre so only one
// row ever reads as "in focus" at a time, instead of two overlapping
// equally-visible digits mid-drag.
const CURVE_RANGE = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
const ROTATE_OUTPUT = [
  '68deg',
  '58deg',
  '44deg',
  '24deg',
  '0deg',
  '-24deg',
  '-44deg',
  '-58deg',
  '-68deg',
];
const SCALE_OUTPUT = [0.5, 0.58, 0.68, 0.85, 1, 0.85, 0.68, 0.58, 0.5];
const OPACITY_OUTPUT = [0, 0.03, 0.14, 0.5, 1, 0.5, 0.14, 0.03, 0];
const SETTLE_STEP_THRESHOLD = 0.18;
const SETTLE_VELOCITY_THRESHOLD = 220;

function wrap(value: number, max: number, step: number) {
  const optionCount = Math.floor(max / step) + 1;
  const option = Math.round(value / step);
  return (((option % optionCount) + optionCount) % optionCount) * step;
}

function getSettledSteps(rawSteps: number, velocityY: number) {
  if (Math.abs(rawSteps) >= 1) {
    return Math.round(rawSteps);
  }

  if (
    rawSteps >= SETTLE_STEP_THRESHOLD ||
    velocityY <= -SETTLE_VELOCITY_THRESHOLD
  ) {
    return 1;
  }

  if (
    rawSteps <= -SETTLE_STEP_THRESHOLD ||
    velocityY >= SETTLE_VELOCITY_THRESHOLD
  ) {
    return -1;
  }

  return 0;
}

export function TimeModule({
  label,
  value,
  max,
  step = 1,
  scale = 1,
  onChange,
}: TimeModuleProps) {
  const moduleHeight = BASE_MODULE_HEIGHT * scale;
  const rowHeight = BASE_ROW_HEIGHT * scale;
  const digitGap = BASE_DIGIT_GAP * scale;
  const centerOffset = (moduleHeight - rowHeight) / 2;
  const maxTranslate = WINDOW_RADIUS * rowHeight;

  const reelBase = useRef(value);
  const settling = useRef(false);
  const pendingValue = useRef<number | null>(null);
  const settleRunId = useRef(0);
  const translateY = useRef(new Animated.Value(0)).current;
  const [, forceRender] = useReducer(n => n + 1, 0);

  // Keep the reel's rest state in sync with externally driven value changes
  // (e.g. accessibility increment/decrement), but not while a release
  // animation is settling the reel onto its own final value.
  if (!settling.current) {
    if (pendingValue.current !== null) {
      if (Object.is(value, pendingValue.current)) {
        pendingValue.current = null;
      }
    } else if (!Object.is(reelBase.current, value)) {
      reelBase.current = value;
      translateY.setValue(0);
    }
  }

  const adjust = (direction: number) => {
    const nextValue = wrap(value + direction * step, max, step);
    settleRunId.current += 1;
    settling.current = false;
    pendingValue.current = nextValue;
    reelBase.current = nextValue;
    translateY.stopAnimation();
    translateY.setValue(0);
    forceRender();
    onChange(nextValue);
  };

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(4)
        .runOnJS(true)
        .onBegin(() => {
          settleRunId.current += 1;
          settling.current = false;
          pendingValue.current = null;
          translateY.stopAnimation();
          translateY.setValue(0);
        })
        .onUpdate(event => {
          const clamped = Math.max(
            -maxTranslate,
            Math.min(maxTranslate, event.translationY),
          );
          translateY.setValue(clamped);
        })
        .onEnd(event => {
          const clamped = Math.max(
            -maxTranslate,
            Math.min(maxTranslate, event.translationY),
          );
          const nearest = getSettledSteps(-clamped / rowHeight, event.velocityY);
          const finalValue = wrap(
            reelBase.current + nearest * step,
            max,
            step,
          );
          const runId = settleRunId.current + 1;
          settleRunId.current = runId;
          pendingValue.current = nearest === 0 ? null : finalValue;

          if (nearest !== 0) {
            settling.current = false;
            reelBase.current = finalValue;
            translateY.stopAnimation();
            translateY.setValue(0);
            forceRender();
            onChange(finalValue);
            return;
          }

          settling.current = true;
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            friction: 10,
            tension: 120,
          }).start(() => {
            if (runId !== settleRunId.current) {
              return;
            }
            translateY.setValue(0);
            settling.current = false;
            forceRender();
          });

          if (nearest === 0) {
            onChange(finalValue);
          }
        }),
    [max, maxTranslate, onChange, rowHeight, step],
  );

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    adjust(event.nativeEvent.actionName === 'increment' ? 1 : -1);
  };

  const offsets = useMemo(() => {
    const list: number[] = [];
    for (let k = -WINDOW_RADIUS; k <= WINDOW_RADIUS; k += 1) {
      list.push(k);
    }
    return list;
  }, []);

  const digits = value.toString().padStart(2, '0').split('');

  return (
    <GestureDetector gesture={panGesture}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: digits.join('') }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={handleAccessibilityAction}
        style={[styles.module, { height: moduleHeight }]}
      >
        <Animated.View
          style={[styles.reel, { transform: [{ translateY }] }]}
        >
          {offsets.map(k => {
            const rowValue = wrap(reelBase.current + k * step, max, step);
            const rowDigits = rowValue.toString().padStart(2, '0').split('');
            const distance = Animated.add(
              Animated.multiply(translateY, 1 / rowHeight),
              k,
            );
            const rotateX = distance.interpolate({
              inputRange: CURVE_RANGE,
              outputRange: ROTATE_OUTPUT,
              extrapolate: 'clamp',
            });
            const rowScale = distance.interpolate({
              inputRange: CURVE_RANGE,
              outputRange: SCALE_OUTPUT,
              extrapolate: 'clamp',
            });
            const opacity = distance.interpolate({
              inputRange: CURVE_RANGE,
              outputRange: OPACITY_OUTPUT,
              extrapolate: 'clamp',
            });

            return (
              <Animated.View
                key={k}
                style={[
                  styles.row,
                  {
                    height: rowHeight,
                    top: centerOffset + k * rowHeight,
                    gap: digitGap,
                    opacity,
                    transform: [
                      { perspective: PERSPECTIVE },
                      { rotateX },
                      { scale: rowScale },
                    ],
                  },
                ]}
              >
                <SevenSegmentDigit value={rowDigits[0]} scale={scale} />
                <SevenSegmentDigit value={rowDigits[1]} scale={scale} />
              </Animated.View>
            );
          })}
        </Animated.View>
        <Text style={styles.hiddenValue}>{digits.join('')}</Text>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  module: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: colors.module,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 5,
  },
  reel: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenValue: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
