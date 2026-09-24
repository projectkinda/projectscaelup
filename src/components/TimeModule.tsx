import React, { useEffect, useMemo, useRef, useState } from 'react';
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

const BASE_MODULE_HEIGHT = 132;
const BASE_ROW_HEIGHT = 64;
const BASE_DIGIT_GAP = 8;
const WINDOW_RADIUS = 6;
const PERSPECTIVE = 420;

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
const MIN_RAW_STEPS_FOR_FLING = 0.03;

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
    (rawSteps > MIN_RAW_STEPS_FOR_FLING &&
      velocityY <= -SETTLE_VELOCITY_THRESHOLD)
  ) {
    return 1;
  }

  if (
    rawSteps <= -SETTLE_STEP_THRESHOLD ||
    (rawSteps < -MIN_RAW_STEPS_FOR_FLING &&
      velocityY >= SETTLE_VELOCITY_THRESHOLD)
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

  const [displayValue, setDisplayValue] = useState(value);
  const [isDragging, setIsDragging] = useState(false);
  const dragBase = useRef(value);
  const pendingValue = useRef<number | null>(null);
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (pendingValue.current !== null) {
      if (Object.is(value, pendingValue.current)) {
        pendingValue.current = null;
      }
      return;
    }

    if (!isDragging && !Object.is(displayValue, value)) {
      setDisplayValue(value);
    }
  }, [displayValue, isDragging, value]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(4)
        .runOnJS(true)
        .onBegin(() => {
          dragBase.current = displayValue;
          translateY.stopAnimation();
          translateY.setValue(0);
          setIsDragging(true);
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
          const finalValue = wrap(dragBase.current + nearest * step, max, step);

          translateY.stopAnimation();
          setDisplayValue(finalValue);
          setIsDragging(false);

          if (!Object.is(finalValue, value)) {
            pendingValue.current = finalValue;
            onChange(finalValue);
          }
        })
        .onFinalize(() => {
          translateY.stopAnimation();
          setIsDragging(false);
        }),
    [
      displayValue,
      max,
      maxTranslate,
      onChange,
      rowHeight,
      step,
      translateY,
      value,
    ],
  );

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    const direction = event.nativeEvent.actionName === 'increment' ? 1 : -1;
    const nextValue = wrap(displayValue + direction * step, max, step);
    setDisplayValue(nextValue);
    pendingValue.current = nextValue;
    onChange(nextValue);
  };

  const offsets = useMemo(() => {
    const list: number[] = [];
    for (let k = -WINDOW_RADIUS; k <= WINDOW_RADIUS; k += 1) {
      list.push(k);
    }
    return list;
  }, []);

  const rowAnimations = useMemo(
    () =>
      offsets.map(k => {
        const distance = Animated.add(
          Animated.multiply(translateY, 1 / rowHeight),
          k,
        );
        return {
          k,
          rotateX: distance.interpolate({
            inputRange: CURVE_RANGE,
            outputRange: ROTATE_OUTPUT,
            extrapolate: 'clamp',
          }),
          rowScale: distance.interpolate({
            inputRange: CURVE_RANGE,
            outputRange: SCALE_OUTPUT,
            extrapolate: 'clamp',
          }),
          opacity: distance.interpolate({
            inputRange: CURVE_RANGE,
            outputRange: OPACITY_OUTPUT,
            extrapolate: 'clamp',
          }),
        };
      }),
    [offsets, rowHeight, translateY],
  );

  const digits = displayValue.toString().padStart(2, '0').split('');

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
          pointerEvents={isDragging ? 'auto' : 'none'}
          style={[
            styles.reel,
            styles.reelLayer,
            {
              opacity: isDragging ? 1 : 0,
              transform: [{ translateY }],
            },
          ]}
        >
          {rowAnimations.map(({ k, rotateX, rowScale, opacity }) => {
            const rowValue = wrap(dragBase.current + k * step, max, step);
            const rowDigits = rowValue.toString().padStart(2, '0').split('');

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
                <SevenSegmentDigit
                  value={rowDigits[0]}
                  scale={scale}
                  glow={false}
                />
                <SevenSegmentDigit
                  value={rowDigits[1]}
                  scale={scale}
                  glow={false}
                />
              </Animated.View>
            );
          })}
        </Animated.View>

        {!isDragging ? (
          <View style={[styles.staticValue, { gap: digitGap }]}>
            <SevenSegmentDigit
              key={`${displayValue}-tens`}
              value={digits[0]}
              scale={scale}
            />
            <SevenSegmentDigit
              key={`${displayValue}-ones`}
              value={digits[1]}
              scale={scale}
            />
          </View>
        ) : null}
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
  reelLayer: {
    zIndex: 1,
  },
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  staticValue: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 2,
    backgroundColor: colors.module,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenValue: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
