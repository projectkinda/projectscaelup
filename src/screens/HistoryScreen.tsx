import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomNavigation } from '../components/BottomNavigation';
import {
  type HistoryData,
  type HistoryTrendPoint,
  loadHistoryData,
} from '../data/historyRepository';
import { colors, layout } from '../theme/tokens';

type HistoryScreenProps = {
  onNavigate: (screen: string) => void;
};

const CHART_HEIGHT = 178;
const CHART_WIDTH = 340;
const CHART_PADDING = { top: 18, right: 10, bottom: 34, left: 30 };

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function buildPath(points: Array<{ x: number; y: number }>) {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
}

function DistractionTrendChart({ points }: { points: HistoryTrendPoint[] }) {
  const maxValue = Math.max(1, ...points.map(point => point.distractionCount));
  const plotWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

  const plotted = points.map((point, index) => {
    const x =
      points.length === 1
        ? CHART_PADDING.left + plotWidth / 2
        : CHART_PADDING.left + (plotWidth * index) / (points.length - 1);
    const y =
      CHART_PADDING.top +
      plotHeight -
      (plotHeight * point.distractionCount) / maxValue;

    return { x, y, source: point };
  });

  return (
    <View style={styles.chartWrap}>
      <Svg
        width="100%"
        height={CHART_HEIGHT}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      >
        <Line
          x1={CHART_PADDING.left}
          y1={CHART_PADDING.top}
          x2={CHART_PADDING.left}
          y2={CHART_PADDING.top + plotHeight}
          stroke={colors.divider}
          strokeWidth={1}
        />
        <Line
          x1={CHART_PADDING.left}
          y1={CHART_PADDING.top + plotHeight}
          x2={CHART_PADDING.left + plotWidth}
          y2={CHART_PADDING.top + plotHeight}
          stroke={colors.divider}
          strokeWidth={1}
        />
        {[0, 0.5, 1].map(step => {
          const y = CHART_PADDING.top + plotHeight - plotHeight * step;
          return (
            <Line
              key={step}
              x1={CHART_PADDING.left}
              y1={y}
              x2={CHART_PADDING.left + plotWidth}
              y2={y}
              stroke={colors.divider}
              strokeDasharray="3 7"
              strokeWidth={1}
            />
          );
        })}
        {plotted.length > 1 ? (
          <Path
            d={buildPath(plotted)}
            fill="none"
            stroke={colors.ink}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
          />
        ) : null}
        {plotted.map(({ x, y, source }) => (
          <Rect
            key={source.id}
            x={x - 4}
            y={y - 4}
            width={8}
            height={8}
            rx={2}
            fill={colors.ink}
          />
        ))}
        <SvgText
          x={CHART_PADDING.left - 10}
          y={CHART_PADDING.top + 5}
          fill={colors.muted}
          fontSize={10}
          textAnchor="end"
        >
          {maxValue}
        </SvgText>
        <SvgText
          x={CHART_PADDING.left - 10}
          y={CHART_PADDING.top + plotHeight + 4}
          fill={colors.muted}
          fontSize={10}
          textAnchor="end"
        >
          0
        </SvgText>
        {points.length > 0 ? (
          <>
            <SvgText
              x={CHART_PADDING.left}
              y={CHART_HEIGHT - 8}
              fill={colors.muted}
              fontSize={10}
            >
              {formatDate(points[0].startedAt)}
            </SvgText>
            <SvgText
              x={CHART_PADDING.left + plotWidth}
              y={CHART_HEIGHT - 8}
              fill={colors.muted}
              fontSize={10}
              textAnchor="end"
            >
              {formatDate(points[points.length - 1].startedAt)}
            </SvgText>
          </>
        ) : null}
      </Svg>
    </View>
  );
}

export function HistoryScreen({ onNavigate }: HistoryScreenProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const data = await loadHistoryData({ isPaidUser: false });
        if (!cancelled) {
          setHistory(data);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Unable to load history.',
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const hasSessions = (history?.sessions.length ?? 0) > 0;
  const contentMinHeight = useMemo(
    () =>
      Math.max(
        0,
        windowHeight -
          (insets.top + 30) -
          (layout.bottomNavHeight + insets.bottom + 24),
      ),
    [insets.bottom, insets.top, windowHeight],
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            minHeight: contentMinHeight,
            paddingTop: insets.top + 30,
            paddingBottom: layout.bottomNavHeight + insets.bottom + 26,
          },
        ]}
      >
        <View style={styles.content}>
          <Text style={styles.title}>History</Text>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Distraction trend</Text>
            {isLoading ? (
              <View style={styles.emptyChart}>
                <ActivityIndicator color={colors.ink} />
              </View>
            ) : errorMessage ? (
              <View style={styles.emptyChart}>
                <Text style={styles.emptyText}>{errorMessage}</Text>
              </View>
            ) : hasSessions && history ? (
              <DistractionTrendChart points={history.trend} />
            ) : (
              <View style={styles.emptyChart}>
                <Text style={styles.emptyText}>
                  Your trend shows up after your first few sessions.
                </Text>
              </View>
            )}
          </View>

          {hasSessions && history ? (
            <>
              <View style={styles.streakLine}>
                <Text style={styles.streakLabel}>Best streak:</Text>
                <Text style={styles.streakValue}>
                  {history.bestStreak} {history.bestStreak === 1 ? 'day' : 'days'}
                </Text>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Sessions</Text>
                <View style={styles.sessionList}>
                  {history.sessions.map(session => (
                    <View key={session.id} style={styles.sessionRow}>
                      <View style={styles.sessionHeader}>
                        <View style={styles.sessionTitleWrap}>
                          <Text style={styles.sessionDate}>
                            {formatLongDate(session.startedAt)}
                          </Text>
                          <Text style={styles.sessionMode}>
                            {session.modeName}
                          </Text>
                        </View>
                        <Text style={styles.distractionCount}>
                          {session.distractionCount}
                        </Text>
                      </View>
                      <View style={styles.sessionMeta}>
                        <Text style={styles.metaText}>
                          {formatDuration(session.durationSeconds)}
                        </Text>
                        <Text style={styles.metaText}>
                          {session.distractionCount === 1
                            ? '1 distraction'
                            : `${session.distractionCount} distractions`}
                        </Text>
                        {session.lockdownMinutes > 0 ? (
                          <Text style={styles.lockdownText}>
                            {session.lockdownMinutes} min lockdown
                          </Text>
                        ) : null}
                      </View>
                      {session.flaggedApps.length > 0 ? (
                        <Text style={styles.flaggedApps} numberOfLines={2}>
                          {session.flaggedApps.join(', ')}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                  {history.hasHiddenHistory ? (
                    <Text style={styles.upgradeLine}>
                      Upgrade to see your full history
                    </Text>
                  ) : null}
                </View>
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
      <BottomNavigation
        activeItem="history"
        bottomInset={insets.bottom}
        backgroundColor={colors.warmWhite}
        onSelect={onNavigate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.warmWhite },
  scrollContent: { alignItems: 'center' },
  content: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    paddingHorizontal: layout.horizontalPadding,
  },
  title: {
    color: colors.ink,
    fontSize: 31,
    lineHeight: 38,
    fontWeight: '700',
  },
  section: { marginTop: 30 },
  sectionLabel: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  chartWrap: {
    width: '100%',
    height: CHART_HEIGHT,
    marginTop: 14,
    justifyContent: 'center',
  },
  emptyChart: {
    minHeight: CHART_HEIGHT,
    marginTop: 14,
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  streakLine: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  streakLabel: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '400',
  },
  streakValue: {
    color: colors.rewardAmber,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  sessionList: { marginTop: 8 },
  sessionRow: {
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },
  sessionTitleWrap: { flex: 1, minWidth: 0 },
  sessionDate: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  sessionMode: {
    marginTop: 1,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  distractionCount: {
    color: colors.ink,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '700',
  },
  sessionMeta: {
    marginTop: 9,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metaText: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
  },
  lockdownText: {
    color: colors.mutedRust,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  flaggedApps: {
    marginTop: 7,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  upgradeLine: {
    paddingVertical: 18,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
