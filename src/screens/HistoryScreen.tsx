import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PlayIcon from '../assets/icons/play.svg';
import { BottomNavigation } from '../components/BottomNavigation';
import {
  type HistoryData,
  type HistoryModeBreakdown,
  type HistorySession,
  type HistoryTrendPoint,
  loadHistoryData,
} from '../data/historyRepository';
import { isPaidUser } from '../domain/paywall';
import { formatDuration } from '../domain/sessionHistory';
import { colors, layout } from '../theme/tokens';

type HistoryScreenProps = {
  onNavigate: (screen: string) => void;
};

const CHART_HEIGHT = 178;
const CHART_WIDTH = 340;
const CHART_PADDING = { top: 18, right: 10, bottom: 34, left: 30 };
const INITIAL_VISIBLE_SESSIONS = 8;
const SESSION_PAGE_SIZE = 8;
const HISTORY_BACKGROUND = colors.background;
const MODE_ACCENTS: Record<string, string> = {
  'deep-work': colors.white,
  study: colors.rewardAmber,
  'creative-work': colors.muted,
  meditation: colors.mutedRust,
  'exam-prep': colors.white,
  'online-class': colors.rewardAmber,
  exercise: colors.mutedRust,
};
const CUSTOM_MODE_ACCENTS = [
  colors.white,
  colors.rewardAmber,
  colors.mutedRust,
  colors.muted,
];

function getModeAccent(modeId: string, index = 0) {
  return MODE_ACCENTS[modeId] ?? CUSTOM_MODE_ACCENTS[index % CUSTOM_MODE_ACCENTS.length];
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
  const bestPoint = points.reduce<HistoryTrendPoint | null>((best, point) => {
    if (!best || point.distractionCount < best.distractionCount) {
      return point;
    }

    return best;
  }, null);

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
  const bestPlotted = plotted.find(point => point.source.id === bestPoint?.id);
  const calloutX = bestPlotted
    ? Math.min(CHART_WIDTH - 104, Math.max(34, bestPlotted.x - 52))
    : 0;
  const calloutY = bestPlotted ? Math.max(6, bestPlotted.y - 36) : 0;
  const bestLabel = bestPoint
    ? `Best - ${bestPoint.distractionCount} ${
        bestPoint.distractionCount === 1 ? 'distraction' : 'distractions'
      }`
    : '';

  return (
    <LinearGradient colors={['#333333', '#141414']} style={styles.chartPanel}>
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
          stroke="rgba(246, 249, 253, 0.13)"
          strokeWidth={1}
        />
        <Line
          x1={CHART_PADDING.left}
          y1={CHART_PADDING.top + plotHeight}
          x2={CHART_PADDING.left + plotWidth}
          y2={CHART_PADDING.top + plotHeight}
          stroke="rgba(246, 249, 253, 0.13)"
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
              stroke="rgba(246, 249, 253, 0.13)"
              strokeDasharray="3 7"
              strokeWidth={1}
            />
          );
        })}
        {plotted.length > 1 ? (
          <Path
            d={buildPath(plotted)}
            fill="none"
            stroke={colors.white}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
          />
        ) : null}
        {plotted.map(({ x, y, source }) => {
          const isBest = source.id === bestPoint?.id;
          return (
            <Rect
              key={source.id}
              x={x - 4}
              y={y - 4}
              width={isBest ? 10 : 8}
              height={isBest ? 10 : 8}
              rx={2}
              fill={isBest ? colors.rewardAmber : colors.white}
            />
          );
        })}
        {bestPlotted ? (
          <>
            <Rect
              x={calloutX}
              y={calloutY}
              width={104}
              height={24}
              rx={6}
              fill={colors.rewardAmber}
            />
            <SvgText
              x={calloutX + 52}
              y={calloutY + 16}
              fill={colors.warmWhite}
              fontSize={10}
              fontWeight="700"
              textAnchor="middle"
            >
              {bestLabel}
            </SvgText>
          </>
        ) : null}
        <SvgText
          x={CHART_PADDING.left - 10}
          y={CHART_PADDING.top + 5}
          fill="rgba(246, 249, 253, 0.58)"
          fontSize={10}
          textAnchor="end"
        >
          {maxValue}
        </SvgText>
        <SvgText
          x={CHART_PADDING.left - 10}
          y={CHART_PADDING.top + plotHeight + 4}
          fill="rgba(246, 249, 253, 0.58)"
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
              fill="rgba(246, 249, 253, 0.58)"
              fontSize={10}
            >
              {formatDate(points[0].startedAt)}
            </SvgText>
            <SvgText
              x={CHART_PADDING.left + plotWidth}
              y={CHART_HEIGHT - 8}
              fill="rgba(246, 249, 253, 0.58)"
              fontSize={10}
              textAnchor="end"
            >
              {formatDate(points[points.length - 1].startedAt)}
            </SvgText>
          </>
        ) : null}
      </Svg>
    </LinearGradient>
  );
}

function formatStatDays(value: number) {
  return `${value} ${value === 1 ? 'day' : 'days'}`;
}

function StatRows({ history }: { history: HistoryData }) {
  return (
    <View style={styles.statRows}>
      <LinearGradient colors={['#333333', '#141414']} style={styles.statCard}>
        <Text style={[styles.statValue, styles.rewardValue]}>
          {formatStatDays(history.currentStreak)}
        </Text>
        <Text style={styles.statLabel}>Current streak</Text>
      </LinearGradient>
      <LinearGradient colors={['#333333', '#141414']} style={styles.statCard}>
        <Text style={styles.statValue}>{history.totalSessionsCompleted}</Text>
        <Text style={styles.statLabel}>Total sessions</Text>
      </LinearGradient>
      <LinearGradient colors={['#333333', '#141414']} style={styles.statCard}>
        <Text style={[styles.statValue, styles.rewardValue]}>
          {formatStatDays(history.bestStreak)}
        </Text>
        <Text style={styles.statLabel}>Best streak</Text>
      </LinearGradient>
    </View>
  );
}

function ModeBreakdown({
  breakdown,
}: {
  breakdown: HistoryModeBreakdown[];
}) {
  return (
    <View style={styles.modeBreakdown}>
      {breakdown.map((item, index) => (
        <View key={item.modeId} style={styles.modePill}>
          <View
            style={[
              styles.modeDot,
              { backgroundColor: getModeAccent(item.modeId, index) },
            ]}
          />
          <Text style={styles.modePillText}>
            {item.modeName} - {item.sessionCount > 0 ? item.sessionCount : 'No data'}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SessionCard({ session }: { session: HistorySession }) {
  const hasLockdown = session.lockdownMinutes > 0;
  const distractionLabel =
    session.distractionCount === 1
      ? '1 distraction'
      : `${session.distractionCount} distractions`;

  return (
    <LinearGradient colors={['#333333', '#141414']} style={styles.sessionCard}>
      <View style={styles.sessionCardMain}>
        <View style={styles.sessionTitleWrap}>
          <Text style={styles.sessionDate}>
            {formatLongDate(session.startedAt)}
          </Text>
          <Text
            style={[
              styles.sessionMode,
              { color: getModeAccent(session.modeId) },
            ]}
          >
            {session.modeName}
          </Text>
          <Text style={styles.metaText}>{formatDuration(session.durationSeconds)}</Text>
        </View>
        <Text
          style={[
            styles.distractionCount,
            hasLockdown && styles.lockdownDistractionCount,
          ]}
        >
          {session.distractionCount}
        </Text>
      </View>
      <View style={styles.sessionMeta}>
        <Text style={styles.metaText}>{distractionLabel}</Text>
        {hasLockdown ? (
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
    </LinearGradient>
  );
}

function GhostTrendPreview() {
  return (
    <LinearGradient
      colors={['#333333', '#141414']}
      style={styles.ghostChartWrap}
      accessibilityElementsHidden
    >
      <Svg
        width="100%"
        height={CHART_HEIGHT}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      >
        <Path
          d="M 28 118 C 78 114, 104 106, 146 108 S 222 92, 268 96 S 316 82, 334 84"
          fill="none"
          stroke="rgba(246, 249, 253, 0.24)"
          strokeLinecap="round"
          strokeWidth={4}
        />
      </Svg>
    </LinearGradient>
  );
}

function HistoryFirstRunState({
  onStartSession,
}: {
  onStartSession: () => void;
}) {
  return (
    <View style={styles.firstRunState}>
      <GhostTrendPreview />
      <View style={styles.firstRunCopy}>
        <Text style={styles.emptyText}>
          Your trend shows up after your first few sessions.
        </Text>
        <Text style={styles.emptySubtext}>
          Complete a session to get started.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start a session"
        onPress={onStartSession}
        style={({ pressed }) => [
          styles.startShell,
          pressed && styles.startPressed,
        ]}
      >
        <LinearGradient
          colors={['#333333', '#141414']}
          pointerEvents="none"
          style={styles.startButton}
        >
          <PlayIcon width={16} height={16} />
          <Text style={styles.startLabel}>Start a session</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

export function HistoryScreen({ onNavigate }: HistoryScreenProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [visibleSessionCount, setVisibleSessionCount] = useState(
    INITIAL_VISIBLE_SESSIONS,
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const data = await loadHistoryData({ isPaidUser: isPaidUser() });
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
  const isFirstRunHistory =
    !isLoading && !errorMessage && (history?.completedSessionCount ?? 0) === 0;
  const visibleSessions = history?.sessions.slice(0, visibleSessionCount) ?? [];
  const hasMoreVisibleSessions =
    history !== null && visibleSessionCount < history.sessions.length;
  const showViewMore =
    history !== null && (hasMoreVisibleSessions || history.hasHiddenHistory);
  const handleViewMore = () => {
    if (!history) {
      return;
    }

    if (!isPaidUser() && history.hasHiddenHistory) {
      onNavigate('paywall');
      return;
    }

    if (hasMoreVisibleSessions) {
      setVisibleSessionCount(current => current + SESSION_PAGE_SIZE);
    }
  };
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

          {isFirstRunHistory ? (
            <HistoryFirstRunState onStartSession={() => onNavigate('home')} />
          ) : (
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
          )}

          {hasSessions && history ? (
            <>
              <StatRows history={history} />

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Most-used modes</Text>
                <ModeBreakdown breakdown={history.modeBreakdown} />
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Sessions</Text>
                <View style={styles.sessionList}>
                  {visibleSessions.map(session => (
                    <SessionCard key={session.id} session={session} />
                  ))}
                  {showViewMore ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        history.hasHiddenHistory
                          ? 'Upgrade to see your full history'
                          : 'View more sessions'
                      }
                      onPress={handleViewMore}
                      style={({ pressed }) => [
                        styles.viewMoreAction,
                        pressed && styles.textActionPressed,
                      ]}
                    >
                      <Text style={styles.viewMoreText}>
                        {history.hasHiddenHistory
                          ? 'Upgrade to see your full history'
                          : 'View more sessions'}
                      </Text>
                    </Pressable>
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
        backgroundColor={HISTORY_BACKGROUND}
        onSelect={onNavigate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: HISTORY_BACKGROUND },
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
  section: { marginTop: 28 },
  sectionLabel: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  chartPanel: {
    width: '100%',
    height: CHART_HEIGHT,
    marginTop: 14,
    justifyContent: 'center',
    borderRadius: 24,
    paddingHorizontal: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 12,
  },
  firstRunState: {
    marginTop: 82,
    alignItems: 'center',
  },
  ghostChartWrap: {
    width: '100%',
    height: CHART_HEIGHT,
    justifyContent: 'center',
    borderRadius: 24,
    paddingHorizontal: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 12,
  },
  firstRunCopy: {
    marginTop: 22,
    gap: 7,
    alignItems: 'center',
  },
  emptyChart: {
    minHeight: CHART_HEIGHT,
    marginTop: 14,
    justifyContent: 'center',
    borderRadius: 24,
    paddingHorizontal: 22,
    backgroundColor: colors.module,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  emptySubtext: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  textAction: {
    marginTop: 18,
    paddingVertical: 8,
    paddingRight: 8,
  },
  textActionPressed: { opacity: 0.55 },
  textActionLabel: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  startShell: {
    width: 236,
    height: 56,
    marginTop: 18,
    borderRadius: 28,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  startButton: {
    flex: 1,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  startLabel: {
    color: colors.warmWhite,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
  startPressed: { opacity: 0.82, transform: [{ scale: 0.995 }] },
  statRows: {
    marginTop: 24,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    flex: 1,
    minWidth: 110,
    minHeight: 82,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 7,
  },
  statLabel: {
    color: colors.muted,
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  statValue: {
    color: colors.white,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '700',
    textAlign: 'center',
  },
  rewardValue: { color: colors.rewardAmber },
  modeBreakdown: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  modePill: {
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: colors.module,
  },
  modeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  modePillText: {
    color: colors.white,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  sessionList: {
    marginTop: 12,
    gap: 10,
  },
  sessionCard: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.13,
    shadowRadius: 10,
    elevation: 7,
  },
  sessionCardMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  sessionTitleWrap: { flex: 1, minWidth: 0 },
  sessionDate: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  sessionMode: {
    marginTop: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  distractionCount: {
    color: colors.white,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '700',
  },
  lockdownDistractionCount: { color: colors.mutedRust },
  sessionMeta: {
    marginTop: 9,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metaText: {
    color: colors.muted,
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
  viewMoreAction: {
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  viewMoreText: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
});
