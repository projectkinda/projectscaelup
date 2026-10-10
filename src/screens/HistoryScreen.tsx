import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
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
import { loadFocusCoachData } from '../data/focusCoachRepository';
import { FlaggedAppLabel } from '../../modules/screen-time';
import {
  MIN_FOCUS_SECONDS,
  type FocusCoachResult,
} from '../domain/focusCoach';
import {
  type FocusCoachCardSectionId,
  selectCoachCardSections,
} from '../domain/focusCoachCardSections';
import {
  experimentLabel,
  formatAwayInsightCopy,
} from '../domain/focusCoachCopy';
import { formatAwayTime } from '../domain/awayTime';
import { iosAppKey } from '../domain/iosScreenTime';
import { DEV_FLAGS } from '../domain/paywall';
import { formatDuration } from '../domain/sessionHistory';
import { useIsPaidUser } from '../domain/useIsPaidUser';
import { colors, layout } from '../theme/tokens';

type HistoryScreenProps = {
  isActive: boolean;
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

function FocusCoachCard({
  coach,
  paidUser,
  onLockedSection,
}: {
  coach: FocusCoachResult;
  paidUser: boolean;
  onLockedSection: () => void;
}) {
  const selection = selectCoachCardSections({
    isPaid: paidUser,
    result: coach,
    platform: Platform.OS,
  });
  const headline = coach.historyHeadline ?? coach.historyCopy;
  const bestCleanSeconds = getBestCleanSeconds(coach);

  return (
    <View style={styles.coachCard}>
      <Text style={styles.coachEyebrow}>Focus coach</Text>
      {selection.state === 'baseline' ? (
        <>
          <Text style={styles.coachTitle}>
            Your coach unlocks after {coach.baselineTarget} focus sessions
          </Text>
          <View style={styles.coachProgressTrack}>
            <View
              style={[
                styles.coachProgressFill,
                {
                  width: `${Math.min(
                    100,
                    (coach.validCount / coach.baselineTarget) * 100,
                  )}%`,
                },
              ]}
            />
          </View>
          <Text style={styles.coachCopy}>
            {coach.validCount} of {coach.baselineTarget} done
          </Text>
          {coach.validCount >= 1 && bestCleanSeconds !== null ? (
            <Text style={styles.coachMetricLine}>
              Best clean focus so far: {formatDuration(bestCleanSeconds)}
            </Text>
          ) : null}
          <Text style={styles.coachFootnote}>
            Sessions shorter than {formatDuration(MIN_FOCUS_SECONDS)} don't
            count toward your coach.
          </Text>
        </>
      ) : (
        <>
          {headline ? <Text style={styles.coachHeadline}>{headline}</Text> : null}
          {coach.currentCleanSeconds !== null ? (
            <Text style={styles.coachBigNumber}>
              {formatDuration(coach.currentCleanSeconds)}
            </Text>
          ) : null}
          {coach.suggestionCopy ? (
            <Text style={styles.coachSuggestion}>{coach.suggestionCopy}</Text>
          ) : null}
          <View style={styles.coachSectionStack}>
            {selection.sections.map(section =>
              paidUser ? (
                <PaidCoachSection
                  key={section.id}
                  id={section.id}
                  coach={coach}
                />
              ) : (
                <LockedCoachSection
                  key={section.id}
                  id={section.id}
                  coach={coach}
                  onPress={onLockedSection}
                />
              ),
            )}
          </View>
        </>
      )}
    </View>
  );
}

function getBestCleanSeconds(coach: FocusCoachResult) {
  const trendBest = coach.cleanTrend?.points.length
    ? Math.max(...coach.cleanTrend.points.map(point => point.cleanSeconds))
    : null;
  return trendBest ?? coach.currentCleanSeconds;
}

function sectionTitle(id: FocusCoachCardSectionId) {
  switch (id) {
    case 'clean_trend':
      return 'Clean-focus trend';
    case 'last_session':
      return 'Last session';
    case 'away':
      return 'Away from flagged apps';
    case 'diagnosis':
      return 'Your pattern';
    case 'experiment':
      return "This week's experiment";
  }
}

function diagnosisLine(coach: FocusCoachResult) {
  switch (coach.diagnosis) {
    case 'early_breaker':
      return 'The first break tends to arrive early.';
    case 'late_breaker':
      return 'The first break tends to come late.';
    case 'best_window':
      return 'Some times of day are cleaner than others.';
    case 'app_heavy':
      return 'Flagged apps are the most common first break.';
    case 'camera_heavy':
      return 'Camera absence is the most common first break.';
    case null:
      return null;
  }
}

function endedByLine(coach: FocusCoachResult) {
  switch (coach.lastSession?.endedBy) {
    case 'camera_absence':
      return 'You stepped away from the camera';
    case 'app_touched':
      return 'You opened a flagged app';
    case 'pause_overrun':
      return 'A pause ran over';
    case null:
    case undefined:
      return 'No distractions';
  }
}

function experimentStatusLine(coach: FocusCoachResult) {
  const status = coach.experiment?.result ?? coach.experiment?.lastResult;
  switch (status) {
    case 'worked':
      return "Last week's experiment helped.";
    case 'didnt_work':
      return "Last week's experiment did not clearly help.";
    case 'unclear':
      return "Last week's experiment needs more sessions.";
    case null:
    case undefined:
      return 'In progress this week.';
  }
}

function awayLine(coach: FocusCoachResult) {
  if (!coach.away || coach.away.sinceLastUseSeconds === null) {
    return null;
  }

  return `Away since your last use: ${
    coach.away.display === 'at_least' ? 'at least' : 'about'
  } ${formatAwayTime(coach.away.sinceLastUseSeconds)}`;
}

function lockedTeaser(id: FocusCoachCardSectionId, coach: FocusCoachResult) {
  switch (id) {
    case 'clean_trend':
      return coach.cleanTrend
        ? `Last ${coach.cleanTrend.points.length} sessions`
        : null;
    case 'last_session':
      return coach.lastSession
        ? `${formatDuration(coach.lastSession.cleanSeconds)} clean`
        : null;
    case 'away':
      return awayLine(coach);
    case 'diagnosis':
      return diagnosisLine(coach);
    case 'experiment':
      return coach.experiment ? experimentLabel(coach.experiment.id) : null;
  }
}

function LockIcon() {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Rect
        x={5}
        y={10}
        width={14}
        height={10}
        rx={2}
        fill="none"
        stroke={colors.ink}
        strokeWidth={2}
      />
      <Path
        d="M8 10 V7 C8 4.8 9.8 3 12 3 C14.2 3 16 4.8 16 7 V10"
        fill="none"
        stroke={colors.ink}
        strokeLinecap="round"
        strokeWidth={2}
      />
    </Svg>
  );
}

function CheckMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d="M5 12.5 L10 17 L19 7"
        fill="none"
        stroke={colors.ink}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={3}
      />
    </Svg>
  );
}

function LockedCoachSection({
  id,
  coach,
  onPress,
}: {
  id: FocusCoachCardSectionId;
  coach: FocusCoachResult;
  onPress: () => void;
}) {
  const teaser = lockedTeaser(id, coach);
  if (!teaser) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Unlock ${sectionTitle(id)}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.coachLockedRow,
        pressed && styles.textActionPressed,
      ]}
    >
      {id === 'clean_trend' && coach.cleanTrend ? (
        <View style={styles.coachLockedChartBackground}>
          <CleanFocusTrendChart coach={coach} compact dimmed />
        </View>
      ) : null}
      <View style={styles.coachLockedContent}>
        <View style={styles.coachLockedTitleRow}>
          <Text style={styles.coachLockedTitle}>{sectionTitle(id)}</Text>
          <LockIcon />
        </View>
        <Text style={styles.coachLockedTeaser}>{teaser}</Text>
      </View>
    </Pressable>
  );
}

function PaidCoachSection({
  id,
  coach,
}: {
  id: FocusCoachCardSectionId;
  coach: FocusCoachResult;
}) {
  switch (id) {
    case 'clean_trend':
      if (!coach.cleanTrend) return null;
      return (
        <View style={styles.coachDetailCard}>
          <Text style={styles.coachDetailTitle}>Clean-focus trend</Text>
          <CleanFocusTrendChart coach={coach} />
        </View>
      );
    case 'last_session':
      if (!coach.lastSession) return null;
      return (
        <View style={styles.coachDetailCard}>
          <Text style={styles.coachDetailTitle}>Last session</Text>
          <View style={styles.coachDetailGrid}>
            <CoachFact
              label="Focus"
              value={formatDuration(coach.lastSession.focusSeconds)}
            />
            <CoachFact
              label="Clean"
              value={formatDuration(coach.lastSession.cleanSeconds)}
            />
          </View>
          <Text style={styles.coachDetailText}>{endedByLine(coach)}</Text>
          {coach.lastSession.endedBy ? (
            <Text style={styles.coachDetailSubtext}>
              First break at {formatDuration(coach.lastSession.cleanSeconds)}
            </Text>
          ) : null}
          <Text style={styles.coachDetailSubtext}>
            {coach.lastSession.pauseCount}{' '}
            {coach.lastSession.pauseCount === 1 ? 'pause' : 'pauses'} used
            {coach.lastSession.endedEarly ? '; ended early' : ''}
          </Text>
        </View>
      );
    case 'away': {
      const line = awayLine(coach);
      if (!line || !coach.away) return null;
      return (
        <View style={styles.coachDetailCard}>
          <Text style={styles.coachDetailTitle}>Away from flagged apps</Text>
          <Text style={styles.coachDetailText}>{line}</Text>
          {coach.away.afterSessionVerified &&
          coach.away.afterSessionSeconds !== null ? (
            <Text style={styles.coachDetailSubtext}>
              After your last session you stayed away about{' '}
              {formatAwayTime(coach.away.afterSessionSeconds)}
            </Text>
          ) : null}
          {coach.awayInsight ? (
            <Text style={styles.coachDetailSubtext}>
              {formatAwayInsightCopy(coach.awayInsight)}
            </Text>
          ) : null}
        </View>
      );
    }
    case 'diagnosis': {
      const line = diagnosisLine(coach);
      if (!line) return null;
      return (
        <View style={styles.coachDetailCard}>
          <Text style={styles.coachDetailTitle}>Your pattern</Text>
          <Text style={styles.coachDetailText}>{line}</Text>
        </View>
      );
    }
    case 'experiment':
      if (!coach.experiment) return null;
      return (
        <View style={styles.coachDetailCard}>
          <Text style={styles.coachDetailTitle}>This week's experiment</Text>
          <Text style={styles.coachDetailText}>
            {experimentLabel(coach.experiment.id)}
          </Text>
          <Text style={styles.coachDetailSubtext}>
            {experimentStatusLine(coach)}
          </Text>
        </View>
      );
  }
}

function CoachFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.coachFact}>
      <Text style={styles.coachFactValue}>{value}</Text>
      <Text style={styles.coachFactLabel}>{label}</Text>
    </View>
  );
}

function CleanFocusTrendChart({
  coach,
  compact = false,
  dimmed = false,
}: {
  coach: FocusCoachResult;
  compact?: boolean;
  dimmed?: boolean;
}) {
  const points = coach.cleanTrend?.points ?? [];
  if (points.length === 0) {
    return null;
  }

  const height = compact ? 64 : 150;
  const width = CHART_WIDTH;
  const padding = compact
    ? { top: 8, right: 10, bottom: 8, left: 10 }
    : { top: 18, right: 14, bottom: 28, left: 28 };
  const goalSeconds =
    coach.suggestionMinutes !== null ? coach.suggestionMinutes * 60 : null;
  const maxValue = Math.max(
    60,
    goalSeconds ?? 0,
    ...points.map(point => point.cleanSeconds),
  );
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const barGap = points.length > 1 ? 8 : 0;
  const barWidth = Math.max(
    12,
    (plotWidth - barGap * (points.length - 1)) / points.length,
  );
  const goalY =
    goalSeconds !== null
      ? padding.top + plotHeight - (plotHeight * goalSeconds) / maxValue
      : null;

  return (
    <View
      style={[
        styles.cleanTrendChart,
        compact && styles.cleanTrendChartCompact,
      ]}
    >
      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        opacity={dimmed ? 0.34 : 1}
      >
        {!compact ? (
          <>
            {[0, 0.5, 1].map(step => {
              const y = padding.top + plotHeight - plotHeight * step;
              return (
                <Line
                  key={step}
                  x1={padding.left}
                  y1={y}
                  x2={padding.left + plotWidth}
                  y2={y}
                  stroke="rgba(246, 249, 253, 0.13)"
                  strokeDasharray="3 7"
                  strokeWidth={1}
                />
              );
            })}
            {goalY !== null ? (
              <>
                <Line
                  x1={padding.left}
                  y1={goalY}
                  x2={padding.left + plotWidth}
                  y2={goalY}
                  stroke={colors.rewardAmber}
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                />
                <SvgText
                  x={padding.left + plotWidth}
                  y={Math.max(10, goalY - 5)}
                  fill={colors.rewardAmber}
                  fontSize={10}
                  fontWeight="700"
                  textAnchor="end"
                >
                  Suggested
                </SvgText>
              </>
            ) : null}
          </>
        ) : null}
        {points.map((point, index) => {
          const x = padding.left + index * (barWidth + barGap);
          const barHeight = Math.max(
            4,
            (plotHeight * point.cleanSeconds) / maxValue,
          );
          const y = padding.top + plotHeight - barHeight;
          return (
            <Rect
              key={point.sessionId}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={compact ? 4 : 6}
              fill={colors.white}
            />
          );
        })}
      </Svg>
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
  // iOS apps are drawn natively from their keys; mixed or unknown apps aren't.
  const appKeys = session.flaggedApps.map(app => iosAppKey(app.appIdentifier));
  const iosKeys =
    appKeys.length > 0 && appKeys.every(key => key !== null)
      ? (appKeys as string[])
      : null;
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
      {iosKeys ? (
        <View style={styles.flaggedAppsRow}>
          <FlaggedAppLabel
            appKeys={iosKeys.slice(0, 3)}
            display="icons"
            size={24}
            style={[
              styles.flaggedAppNativeIcons,
              { width: 24 + 18 * (Math.min(iosKeys.length, 3) - 1) },
            ]}
          />
          <FlaggedAppLabel
            appKeys={iosKeys}
            display="names"
            size={13}
            color={colors.muted}
            style={styles.flaggedAppsNative}
          />
        </View>
      ) : session.flaggedApps.length > 0 ? (
        <View style={styles.flaggedAppsRow}>
          <View style={styles.flaggedAppIcons}>
            {session.flaggedApps.slice(0, 3).map((app, index) =>
              app.iconBase64 ? (
                <Image
                  key={`${app.displayName}-${index}`}
                  source={{ uri: `data:image/png;base64,${app.iconBase64}` }}
                  style={styles.flaggedAppIcon}
                />
              ) : (
                <View
                  key={`${app.displayName}-${index}`}
                  style={styles.flaggedAppIconPlaceholder}
                />
              ),
            )}
          </View>
          <Text style={styles.flaggedApps} numberOfLines={2}>
            {session.flaggedApps.map(app => app.displayName).join(', ')}
          </Text>
        </View>
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

function CoachPaywallSheet({
  visible,
  onClose,
  bottomInset,
}: {
  visible: boolean;
  onClose: () => void;
  bottomInset: number;
}) {
  const rows = [
    'Clean-focus trend',
    'Last session breakdown',
    ...(Platform.OS === 'android' ? ['Away from flagged apps'] : []),
    'Your pattern',
    'Weekly experiment',
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.paywallOverlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close focus coach upgrade"
          onPress={onClose}
          style={styles.paywallBackdrop}
        />
        <View
          style={[
            styles.paywallSheet,
            { paddingBottom: Math.max(20, bottomInset + 14) },
          ]}
        >
          <View style={styles.paywallHeader}>
            <Text style={styles.paywallTitle}>Get your full focus coach</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={({ pressed }) => [
                styles.paywallClose,
                pressed && styles.textActionPressed,
              ]}
            >
              <Text style={styles.paywallCloseText}>X</Text>
            </Pressable>
          </View>
          <View style={styles.paywallTable}>
            <View style={styles.paywallTableHeader}>
              <Text style={styles.paywallFeatureHeader}>Feature</Text>
              <Text style={styles.paywallPlanHeader}>Free</Text>
              <Text style={styles.paywallPlanHeader}>Pro</Text>
            </View>
            {rows.map(row => (
              <View key={row} style={styles.paywallTableRow}>
                <Text style={styles.paywallFeature}>{row}</Text>
                <Text style={styles.paywallDash}>-</Text>
                <View style={styles.paywallCheck}>
                  <CheckMark />
                </View>
              </View>
            ))}
          </View>
          {DEV_FLAGS.tierSwitcher ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: true }}
                disabled
                style={styles.paywallContinueDisabled}
              >
                <Text style={styles.paywallContinueText}>Continue</Text>
              </Pressable>
              <Text style={styles.paywallComingSoon}>Purchases coming soon</Text>
            </>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Not now"
            onPress={onClose}
            style={({ pressed }) => [
              styles.paywallNotNow,
              pressed && styles.textActionPressed,
            ]}
          >
            <Text style={styles.paywallNotNowText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function HistoryScreen({ isActive, onNavigate }: HistoryScreenProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [focusCoach, setFocusCoach] = useState<FocusCoachResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [visibleSessionCount, setVisibleSessionCount] = useState(
    INITIAL_VISIBLE_SESSIONS,
  );
  const [coachPaywallVisible, setCoachPaywallVisible] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  const paidUser = useIsPaidUser();

  // Loads on mount, then silently revalidates whenever the tab comes back
  // into view -- never re-blanks the screen to a spinner on a revisit, since
  // the screen stays mounted (hidden) rather than remounting per tab switch.
  useEffect(() => {
    if (!isActive) {
      return;
    }

    let cancelled = false;

    async function load() {
      if (!hasLoadedOnceRef.current) {
        setIsLoading(true);
      }
      setErrorMessage(null);

      try {
        const data = await loadHistoryData({ isPaidUser: paidUser });
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
          hasLoadedOnceRef.current = true;
          setIsLoading(false);
        }
      }

      try {
        const coach = await loadFocusCoachData();
        if (!cancelled) {
          setFocusCoach(coach);
        }
      } catch (error) {
        console.warn('Failed to load focus coach:', error);
        if (!cancelled) {
          setFocusCoach(null);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [isActive, paidUser]);

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

    if (!paidUser && history.hasHiddenHistory) {
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

          {focusCoach ? (
            <View style={styles.section}>
              <FocusCoachCard
                coach={focusCoach}
                paidUser={paidUser}
                onLockedSection={() => setCoachPaywallVisible(true)}
              />
            </View>
          ) : null}

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
      <CoachPaywallSheet
        visible={coachPaywallVisible}
        onClose={() => setCoachPaywallVisible(false)}
        bottomInset={insets.bottom}
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
  coachCard: {
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: colors.module,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.13,
    shadowRadius: 10,
    elevation: 7,
  },
  coachEyebrow: {
    color: colors.rewardAmber,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  coachTitle: {
    marginTop: 3,
    color: colors.white,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  coachCopy: {
    marginTop: 6,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  coachProgressTrack: {
    height: 8,
    marginTop: 14,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  coachProgressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.rewardAmber,
  },
  coachMetricLine: {
    marginTop: 10,
    color: colors.white,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  coachFootnote: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  coachHeadline: {
    marginTop: 7,
    color: colors.white,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
  coachBigNumber: {
    marginTop: 13,
    color: colors.white,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
  },
  coachSuggestion: {
    marginTop: 2,
    color: colors.rewardAmber,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  coachSectionStack: {
    marginTop: 14,
    gap: 10,
  },
  coachLockedRow: {
    minHeight: 68,
    overflow: 'hidden',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(13, 13, 13, 0.72)',
  },
  coachLockedChartBackground: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.72,
  },
  coachLockedContent: {
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 11,
    justifyContent: 'center',
    backgroundColor: 'rgba(13, 13, 13, 0.72)',
  },
  coachLockedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  coachLockedTitle: {
    flex: 1,
    minWidth: 0,
    color: colors.white,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
  },
  coachLockedTeaser: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  coachDetailCard: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(13, 13, 13, 0.72)',
  },
  coachDetailTitle: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
  },
  coachDetailText: {
    marginTop: 8,
    color: colors.white,
    fontSize: 13,
    lineHeight: 19,
  },
  coachDetailSubtext: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  coachDetailGrid: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  coachFact: {
    flex: 1,
    minHeight: 54,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'center',
    backgroundColor: colors.module,
  },
  coachFactValue: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  coachFactLabel: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  cleanTrendChart: {
    marginTop: 12,
    justifyContent: 'center',
  },
  cleanTrendChartCompact: {
    marginTop: 0,
  },
  paywallOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  paywallBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  paywallSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 18,
    backgroundColor: colors.module,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  paywallHeader: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  paywallTitle: {
    flex: 1,
    minWidth: 0,
    color: colors.white,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  paywallClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  paywallCloseText: {
    color: colors.ink,
    fontSize: 21,
    lineHeight: 24,
    fontWeight: '700',
  },
  paywallTable: {
    marginTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  paywallTableHeader: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  paywallFeatureHeader: {
    flex: 1,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  paywallPlanHeader: {
    width: 54,
    color: colors.ink,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  paywallTableRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  paywallFeature: {
    flex: 1,
    minWidth: 0,
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  paywallDash: {
    width: 54,
    color: colors.muted,
    fontSize: 18,
    lineHeight: 22,
    textAlign: 'center',
  },
  paywallCheck: {
    width: 54,
    alignItems: 'center',
  },
  paywallContinueDisabled: {
    minHeight: 48,
    marginTop: 18,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  paywallContinueText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  paywallComingSoon: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  paywallNotNow: {
    minHeight: 42,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paywallNotNowText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
  },
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
  flaggedAppsRow: {
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flaggedAppIcons: {
    flexDirection: 'row',
  },
  flaggedAppIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    marginRight: -6,
  },
  flaggedAppIconPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 6,
    marginRight: -6,
    backgroundColor: '#2A2A2A',
  },
  flaggedAppNativeIcons: {
    height: 24,
  },
  flaggedAppsNative: {
    flex: 1,
    minWidth: 0,
    height: 18,
  },
  flaggedApps: {
    flex: 1,
    minWidth: 0,
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
