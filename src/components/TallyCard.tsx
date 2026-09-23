import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { TALLY_GROUP_SIZE, TallyGroupMark } from './TallyGroupMark';
import { colors } from '../theme/tokens';

const MARK_WIDTH = 50.554;
const MARK_HEIGHT = 40;

export type TallyMarkPosition = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type TallyCardProps = {
  sessionCount: number;
  /** Index (0-based) of the group cell currently receiving a new stroke. */
  revealIndex?: number | null;
  /** How many strokes that cell should show once the reveal lands (1-5). */
  revealLitCount?: number;
  /** Plays the stroke-reveal once the popup has landed on this cell. */
  revealArmed?: boolean;
  onRevealLayout?: (position: TallyMarkPosition) => void;
};

export function TallyCard({
  sessionCount,
  revealIndex = null,
  revealLitCount = 0,
  revealArmed = false,
  onRevealLayout,
}: TallyCardProps) {
  const completeGroups = Math.floor(sessionCount / TALLY_GROUP_SIZE);
  const currentGroupProgress = sessionCount % TALLY_GROUP_SIZE;
  // Only render marks for sessions actually completed - no placeholder
  // outlines for groups that haven't been started yet.
  const visibleGroupCount = completeGroups + (currentGroupProgress > 0 ? 1 : 0);

  return (
    <View style={styles.section}>
      <View style={styles.cardShell}>
        <LinearGradient colors={['#333333', '#141414']} style={styles.card}>
          {visibleGroupCount === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                Finish your first session to start your tally
              </Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {Array.from({ length: visibleGroupCount }, (_, index) => {
                if (index === revealIndex) {
                  return (
                    <RevealableMark
                      key={index}
                      targetLitCount={revealLitCount}
                      armed={revealArmed}
                      onMeasured={onRevealLayout}
                    />
                  );
                }

                const litCount =
                  index < completeGroups
                    ? TALLY_GROUP_SIZE
                    : currentGroupProgress;

                return (
                  <TallyGroupMark
                    key={index}
                    litCount={litCount}
                    width={MARK_WIDTH}
                    height={MARK_HEIGHT}
                  />
                );
              })}
            </View>
          )}
        </LinearGradient>
      </View>
      <View style={styles.copy}>
        <Text testID="session-count" style={styles.sessionCount}>
          {sessionCount} sessions
        </Text>
        <Text style={styles.streak}>1 week of showing up</Text>
      </View>
    </View>
  );
}

function RevealableMark({
  targetLitCount,
  armed,
  onMeasured,
}: {
  targetLitCount: number;
  armed: boolean;
  onMeasured?: (position: TallyMarkPosition) => void;
}) {
  const pop = useRef(new Animated.Value(1)).current;
  const viewRef = useRef<View>(null);
  const hasMeasured = useRef(false);

  useEffect(() => {
    if (!armed) {
      return;
    }
    pop.setValue(0.55);
    Animated.spring(pop, {
      toValue: 1,
      useNativeDriver: false,
      friction: 7,
      tension: 90,
    }).start();
  }, [armed, pop]);

  const handleLayout = () => {
    if (hasMeasured.current || !onMeasured || !viewRef.current) {
      return;
    }
    hasMeasured.current = true;
    viewRef.current.measureInWindow((x, y, width, height) => {
      onMeasured({ x, y, width, height });
    });
  };

  const beforeLitCount = Math.max(0, targetLitCount - 1);

  return (
    <Animated.View
      ref={viewRef}
      onLayout={handleLayout}
      style={{ transform: [{ scale: pop }] }}
    >
      <TallyGroupMark
        litCount={armed ? targetLitCount : beforeLitCount}
        width={MARK_WIDTH}
        height={MARK_HEIGHT}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: { width: '100%', alignItems: 'center', gap: 8 },
  cardShell: {
    width: '100%',
    minHeight: 200,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
  },
  card: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 24,
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 20,
    columnGap: 24,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyStateText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  copy: { alignItems: 'center', gap: 4 },
  sessionCount: {
    color: colors.ink,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '700',
  },
  streak: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
});
