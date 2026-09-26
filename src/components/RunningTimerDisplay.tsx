import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { SevenSegmentDigit } from './SevenSegmentDigit';
import { colors, useScale } from '../theme/tokens';

type RunningTimerDisplayProps = {
  remainingSeconds: number;
};

const BASE_CHASSIS_HEIGHT = 204;
const BASE_GAP = 16;
const BASE_COLON_WIDTH = 40;
const BASE_COLON_HEIGHT = 76;
const BASE_COLON_DOT = { width: 8, height: 9, gap: 13 };
const BASE_MODULE_HEIGHT = 132;
const BASE_DIGIT_GAP = 8;
const FLIP_DURATION_MS = 520;

function formatRemaining(totalSeconds: number) {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.min(99, Math.floor(clamped / 60));
  const seconds = clamped % 60;

  return {
    minutes: minutes.toString().padStart(2, '0'),
    seconds: seconds.toString().padStart(2, '0'),
  };
}

function ModuleValue({
  value,
  scale,
  glow = true,
}: {
  value: string;
  scale: number;
  glow?: boolean;
}) {
  return (
    <View style={[styles.valueRow, { gap: BASE_DIGIT_GAP * scale }]}>
      {value.split('').map((digit, index) => (
        <SevenSegmentDigit
          key={`${value}-${index}`}
          value={digit}
          scale={scale}
          glow={glow}
        />
      ))}
    </View>
  );
}

function ModuleHalf({
  value,
  scale,
  half,
  width,
  height,
  glow = true,
}: {
  value: string;
  scale: number;
  half: 'top' | 'bottom';
  width: number;
  height: number;
  glow?: boolean;
}) {
  const halfHeight = height / 2;
  const isTop = half === 'top';

  return (
    <View
      style={[
        styles.moduleHalf,
        {
          width,
          height: halfHeight,
          top: isTop ? 0 : halfHeight,
        },
      ]}
    >
      <View
        style={[
          styles.moduleHalfSurface,
          {
            width,
            height: halfHeight,
            borderTopLeftRadius: isTop ? 14 : 1,
            borderTopRightRadius: isTop ? 14 : 1,
            borderBottomLeftRadius: isTop ? 1 : 14,
            borderBottomRightRadius: isTop ? 1 : 14,
          },
        ]}
      >
        <View
          style={[
            styles.moduleHalfValueClip,
            {
              width,
              height: halfHeight,
              transform: [{ translateY: isTop ? 0 : -halfHeight }],
            },
          ]}
        >
          <View style={[styles.moduleValueFull, { width, height }]}>
            <ModuleValue value={value} scale={scale} glow={glow} />
          </View>
        </View>
      </View>
    </View>
  );
}

function FlippingValueModule({
  value,
  scale,
}: {
  value: string;
  scale: number;
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const [nextValue, setNextValue] = useState(value);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const progress = useRef(new Animated.Value(1)).current;
  const displayValueRef = useRef(value);
  const animationRunId = useRef(0);
  const activeAnimation = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (value === displayValueRef.current) {
      return;
    }

    const runId = animationRunId.current + 1;
    animationRunId.current = runId;
    activeAnimation.current?.stop();
    setNextValue(value);
    setIsPreparing(true);
    progress.setValue(0);
    const frameId = requestAnimationFrame(() => {
      setIsFlipping(true);
      const animation = Animated.timing(progress, {
        toValue: 1,
        duration: FLIP_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
      activeAnimation.current = animation;
      animation.start(({ finished }) => {
        if (finished && runId === animationRunId.current) {
          displayValueRef.current = value;
          setDisplayValue(value);
          setIsFlipping(false);
          setIsPreparing(false);
        }
      });
    });

    return () => {
      cancelAnimationFrame(frameId);
      if (runId === animationRunId.current) {
        activeAnimation.current?.stop();
        activeAnimation.current = null;
      }
    };
  }, [progress, value]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayout({ width, height });
  };

  const canFlip = layout.width > 0 && layout.height > 0;
  const halfHeight = layout.height / 2;
  const oldTopFlipStyle = {
    opacity: progress.interpolate({
      inputRange: [0, 0.68, 0.82, 1],
      outputRange: [1, 1, 0, 0],
    }),
    transform: [
      { perspective: 520 },
      { translateY: halfHeight / 2 },
      {
        rotateX: progress.interpolate({
          inputRange: [0, 0.82, 1],
          outputRange: ['0deg', '92deg', '92deg'],
        }),
      },
      {
        scaleY: progress.interpolate({
          inputRange: [0, 0.36, 0.68, 1],
          outputRange: [1, 0.88, 0.72, 0.72],
        }),
      },
      { translateY: -halfHeight / 2 },
    ],
  };
  const oldBottomStyle = {
    opacity: progress.interpolate({
      inputRange: [0, 0.16, 0.34, 1],
      outputRange: [1, 0.42, 0, 0],
    }),
  };
  const topShadeOpacity = progress.interpolate({
    inputRange: [0, 0.28, 0.72, 1],
    outputRange: [0, 0.16, 0.3, 0],
  });
  const hingeShadowOpacity = progress.interpolate({
    inputRange: [0, 0.22, 0.62, 1],
    outputRange: [0, 0.24, 0.42, 0],
  });
  const hingeHighlightOpacity = progress.interpolate({
    inputRange: [0, 0.34, 0.72, 1],
    outputRange: [0.1, 0.26, 0.12, 0.1],
  });

  return (
    <View
      onLayout={handleLayout}
      style={[styles.module, { height: BASE_MODULE_HEIGHT * scale }]}
    >
      {(isPreparing || isFlipping) && canFlip ? (
        <>
          <View style={styles.moduleValueFull}>
            <ModuleValue value={nextValue} scale={scale} glow={false} />
          </View>
          <Animated.View style={[styles.flipLayer, oldBottomStyle]}>
            <ModuleHalf
              value={displayValue}
              scale={scale}
              half="bottom"
              width={layout.width}
              height={layout.height}
              glow={false}
            />
          </Animated.View>
          <Animated.View style={[styles.flipLayer, oldTopFlipStyle]}>
            <ModuleHalf
              value={displayValue}
              scale={scale}
              half="top"
              width={layout.width}
              height={layout.height}
              glow={false}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.flapShade,
                {
                  width: layout.width,
                  height: halfHeight,
                  opacity: topShadeOpacity,
                },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.bendShadow,
                {
                  top: halfHeight - 14,
                  width: layout.width,
                  opacity: hingeShadowOpacity,
                },
              ]}
            />
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.hingeLine,
              {
                top: halfHeight - StyleSheet.hairlineWidth,
                width: layout.width,
                opacity: hingeHighlightOpacity,
              },
            ]}
          />
        </>
      ) : (
        <View style={styles.moduleValueFull}>
          <ModuleValue value={displayValue} scale={scale} />
        </View>
      )}
    </View>
  );
}

export function RunningTimerDisplay({
  remainingSeconds,
}: RunningTimerDisplayProps) {
  const scale = useScale();
  const { minutes, seconds } = formatRemaining(remainingSeconds);

  return (
    <LinearGradient
      colors={[colors.panelTop, colors.panelBottom]}
      style={[
        styles.chassis,
        {
          height: BASE_CHASSIS_HEIGHT * scale,
          gap: BASE_GAP * scale,
          paddingHorizontal: BASE_GAP * scale,
        },
      ]}
    >
      <FlippingValueModule value={minutes} scale={scale} />
      <View
        style={[
          styles.colon,
          {
            width: BASE_COLON_WIDTH * scale,
            height: BASE_COLON_HEIGHT * scale,
            gap: BASE_COLON_DOT.gap * scale,
          },
        ]}
      >
        <View
          style={[
            styles.colonDot,
            {
              width: BASE_COLON_DOT.width * scale,
              height: BASE_COLON_DOT.height * scale,
            },
          ]}
        />
        <View
          style={[
            styles.colonDot,
            {
              width: BASE_COLON_DOT.width * scale,
              height: BASE_COLON_DOT.height * scale,
            },
          ]}
        />
      </View>
      <FlippingValueModule value={seconds} scale={scale} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  chassis: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 12,
  },
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
  moduleValueFull: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flipLayer: {
    position: 'absolute',
    inset: 0,
  },
  moduleHalf: {
    position: 'absolute',
    left: 0,
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
  },
  moduleHalfSurface: {
    overflow: 'hidden',
    backgroundColor: colors.module,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(246, 249, 253, 0.035)',
  },
  moduleHalfValueClip: {
    overflow: 'hidden',
  },
  flapShade: {
    position: 'absolute',
    left: 0,
    top: 0,
    backgroundColor: '#000000',
  },
  bendShadow: {
    position: 'absolute',
    left: 0,
    height: 28,
    backgroundColor: '#000000',
    borderRadius: 14,
  },
  hingeLine: {
    position: 'absolute',
    left: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(246, 249, 253, 0.12)',
    shadowColor: '#F6F9FD',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
  },
  colon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  colonDot: {
    borderRadius: 1,
    backgroundColor: colors.white,
    shadowColor: colors.white,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 7,
    elevation: 4,
  },
});
