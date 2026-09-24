import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import {
  TALLY_GROUP_SIZE,
  TallyGroupMark,
  TallyGroupMarkTransition,
} from '../components/TallyGroupMark';
import {
  TALLY_STROKE_PATHS,
  TALLY_STROKE_VIEWBOX,
} from '../components/tallyStrokePaths';
import { colors, layout } from '../theme/tokens';

const GROUP_MARK_WIDTH = 50.554;
const GROUP_MARK_HEIGHT = 39.654;
const STRIP_GROUP_COUNT = 6;

type PostSessionSummaryScreenProps = {
  previousSessionCount: number;
  sessionCount: number;
  distractionCount: number;
  onContinue: () => void;
};

export function PostSessionSummaryScreen({
  previousSessionCount,
  sessionCount,
  distractionCount,
  onContinue,
}: PostSessionSummaryScreenProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const revealProgress = useRef(new Animated.Value(0)).current;
  const introProgress = useRef(new Animated.Value(0)).current;

  const currentGroupIndex = Math.floor(previousSessionCount / TALLY_GROUP_SIZE);
  const fromLitCount = previousSessionCount % TALLY_GROUP_SIZE;
  const toLitCount =
    sessionCount % TALLY_GROUP_SIZE === 0
      ? TALLY_GROUP_SIZE
      : sessionCount % TALLY_GROUP_SIZE;
  const completedSet = toLitCount === TALLY_GROUP_SIZE;
  const contentTop = Math.max(insets.top + 52, Math.round(windowHeight * 0.12));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(introProgress, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(revealProgress, {
        toValue: 1,
        duration: 760,
        delay: 180,
        useNativeDriver: false,
      }),
    ]).start();
  }, [introProgress, revealProgress]);

  const stripGroups = useMemo(() => {
    const firstGroup = Math.max(
      0,
      currentGroupIndex - Math.floor(STRIP_GROUP_COUNT / 2),
    );

    return Array.from({ length: STRIP_GROUP_COUNT }, (_, index) => {
      const groupIndex = firstGroup + index;
      const startCount = groupIndex * TALLY_GROUP_SIZE;
      const previousProgress = Math.max(
        0,
        Math.min(TALLY_GROUP_SIZE, previousSessionCount - startCount),
      );
      const currentProgress = Math.max(
        0,
        Math.min(TALLY_GROUP_SIZE, sessionCount - startCount),
      );

      return {
        key: `${groupIndex}-${index}`,
        groupIndex,
        previousProgress,
        currentProgress,
      };
    });
  }, [currentGroupIndex, previousSessionCount, sessionCount]);

  const introStyle = {
    opacity: introProgress,
    transform: [
      {
        translateY: introProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [10, 0],
        }),
      },
    ],
  };

  return (
    <View style={styles.screen}>
      <Animated.View
        style={[
          styles.content,
          introStyle,
          {
            paddingTop: contentTop,
            paddingBottom: insets.bottom + 36,
          },
        ]}
      >
        <View style={styles.centerStack}>
          <View style={styles.heroMark}>
            <HeroRevealMark
              revealProgress={revealProgress}
              fromLitCount={fromLitCount}
              toLitCount={toLitCount}
            />
          </View>

          <View style={styles.copy}>
            <Text style={styles.summaryLine}>
              {completedSet ? 'Five sessions, marked.' : 'Session marked.'}
            </Text>
            <Text style={styles.summaryLine}>
              {completedSet
                ? "This week's set is complete."
                : `${sessionCount} sessions total.`}
            </Text>
          </View>
        </View>

        <View style={styles.panelStack}>
          <LinearGradient
            colors={['#333333', '#141414']}
            style={styles.tallyStrip}
          >
            {stripGroups.map(group =>
              group.groupIndex === currentGroupIndex ? (
                <TallyGroupMarkTransition
                  key={group.key}
                  fromLitCount={group.previousProgress}
                  toLitCount={group.currentProgress}
                  progress={revealProgress}
                  width={GROUP_MARK_WIDTH}
                  height={GROUP_MARK_HEIGHT}
                  litColor={colors.white}
                  unlitColor="rgba(0, 0, 0, 0.62)"
                />
              ) : (
                <TallyGroupMark
                  key={group.key}
                  litCount={group.currentProgress}
                  width={GROUP_MARK_WIDTH}
                  height={GROUP_MARK_HEIGHT}
                  litColor={colors.white}
                  unlitColor="rgba(0, 0, 0, 0.62)"
                />
              ),
            )}
          </LinearGradient>

          <LinearGradient
            colors={['#333333', '#141414']}
            style={styles.distractionPanel}
          >
            <Text style={styles.distractionText}>
              {distractionCount === 0
                ? 'No distractions logged'
                : `${distractionCount} distractions logged`}
            </Text>
          </LinearGradient>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Continue"
          onPress={onContinue}
          style={({ pressed }) => [styles.continueShell, pressed && styles.pressed]}
        >
          <LinearGradient
            colors={['#333333', '#141414']}
            pointerEvents="none"
            style={styles.continueButton}
          >
            <Text style={styles.continueLabel}>Continue</Text>
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function HeroRevealMark({
  revealProgress,
  fromLitCount,
  toLitCount,
}: {
  revealProgress: Animated.Value;
  fromLitCount: number;
  toLitCount: number;
}) {
  const strokeIndex = Math.max(0, toLitCount - 1);
  const revealHeight = revealProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 148],
  });

  return (
    <View style={styles.heroMark}>
      <Svg width={192} height={148} viewBox={TALLY_STROKE_VIEWBOX}>
        {TALLY_STROKE_PATHS.map((d, index) => (
          <Path
            key={index}
            d={d}
            fill="rgba(255, 255, 255, 0.06)"
          />
        ))}
      </Svg>
      <View style={styles.heroReveal}>
        <Svg width={192} height={148} viewBox={TALLY_STROKE_VIEWBOX}>
          {TALLY_STROKE_PATHS.slice(0, fromLitCount).map((d, index) => (
            <Path key={index} d={d} fill={colors.white} />
          ))}
        </Svg>
      </View>
      <Animated.View style={[styles.heroDrawMask, { height: revealHeight }]}>
        <View style={styles.heroDrawCanvas}>
          <Svg width={192} height={148} viewBox={TALLY_STROKE_VIEWBOX}>
            <Path
              d={TALLY_STROKE_PATHS[strokeIndex]}
              fill={colors.rewardAmber}
            />
          </Svg>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.horizontalPadding,
    justifyContent: 'space-between',
  },
  centerStack: {
    alignItems: 'center',
    gap: 40,
  },
  heroMark: {
    width: 192,
    height: 148,
  },
  heroReveal: {
    ...StyleSheet.absoluteFill,
  },
  heroDrawMask: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 192,
    overflow: 'hidden',
  },
  heroDrawCanvas: {
    width: 192,
    height: 148,
  },
  copy: {
    alignItems: 'center',
    gap: 4,
  },
  summaryLine: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
    textAlign: 'center',
  },
  panelStack: {
    width: '100%',
    gap: 16,
  },
  tallyStrip: {
    width: '100%',
    minHeight: 88,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  distractionPanel: {
    width: '100%',
    height: 200,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  distractionText: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
    textAlign: 'center',
  },
  continueShell: {
    width: '100%',
    height: 53,
    borderRadius: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  continueButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueLabel: {
    color: colors.warmWhite,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.995 }],
  },
});
