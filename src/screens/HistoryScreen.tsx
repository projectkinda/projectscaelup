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
import { useFonts } from 'expo-font';
import Svg, { Circle, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
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
import { lockedTeaserCopy } from '../domain/focusCoachCopyRules';
import { cleanTrendGeometry, durationInWords, experimentDaysDone, tileDuration, SHORT_EXPERIMENT_COPY } from '../components/focusCoachPresentation';
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
        accessible
        accessibilityLabel={`Distractions by session: ${points.map(point => point.distractionCount).join(', ')}`}
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

function FocusCoachCard({ coach, paidUser, onLockedSection }: {
  coach: FocusCoachResult;
  paidUser: boolean;
  onLockedSection: () => void;
}) {
  const [fontsLoaded, fontError] = useFonts({
    Geist: require('../assets/fonts/Geist-Regular.ttf'),
    GeistSemiBold: require('../assets/fonts/Geist-SemiBold.ttf'),
  });
  const { fontScale } = useWindowDimensions();
  const selection = selectCoachCardSections({
    isPaid: paidUser, result: coach, platform: Platform.OS,
  });
  const headline = coach.historyHeadline ?? (paidUser ? coach.historyCopy : coach.currentCleanSeconds !== null
    ? `Current clean length is ${formatDuration(coach.currentCleanSeconds)}.` : null);
  const bestCleanSeconds = getBestCleanSeconds(coach);
  const latestClean = coach.cleanTrend?.points.at(-1)?.cleanSeconds ?? coach.currentCleanSeconds;
  const tiles = selection.sections.filter(section => section.id !== 'experiment');
  const rows = [tiles.slice(0, 2), tiles.slice(2, 4)];
  const experiment = selection.sections.find(section => section.id === 'experiment');

  return (
    <View style={styles.coachCard}>
      {!fontsLoaded && !fontError ? <ActivityIndicator color={colors.muted} accessibilityLabel="Loading coach" /> : <>
        <Text numberOfLines={2} style={styles.coachEyebrow}>Focus coach</Text>
        {selection.state === 'baseline' ? (
          <>
            <Text numberOfLines={2} style={styles.coachTitle}>
              Your coach unlocks after {coach.baselineTarget} focus sessions
            </Text>
            <ProgressDots done={coach.validCount} total={coach.baselineTarget} label="Baseline sessions" />
            {coach.validCount >= 1 && bestCleanSeconds !== null ? (
              <Text numberOfLines={2} style={styles.coachMetricLine}>
                Best clean focus so far: {formatDuration(bestCleanSeconds)}
              </Text>
            ) : null}
            <Text numberOfLines={2} style={styles.coachFootnote}>
              Sessions shorter than {formatDuration(MIN_FOCUS_SECONDS)} don't count toward your coach.
            </Text>
          </>
        ) : (
          <>
            <View style={styles.coachHeader}>
              <View style={styles.coachHeaderMetric}>
                <Text numberOfLines={2} style={styles.coachBigNumber}>
                  {latestClean !== null ? formatDuration(latestClean) : '—'}
                </Text>
                <Text numberOfLines={2} style={styles.coachCaption}>clean focus</Text>
              </View>
              {coach.suggestionMinutes !== null ? (
                <View style={styles.coachNextChip}>
                  <Text numberOfLines={2} style={styles.coachNextText}>Next: {coach.suggestionMinutes} min</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.coachGrid}>
              {rows.filter(row => row.length > 0).map((row, index) => (
                <View key={index} style={styles.coachTileRow}>
                  {row.map(section => (
                    <View key={section.id} style={[styles.coachTileSlot, { minHeight: 168 * Math.max(1, fontScale) }]}>
                      {section.locked ? (
                        <LockedCoachSection id={section.id} coach={coach} onPress={onLockedSection} />
                      ) : <PaidCoachSection id={section.id} coach={coach} />}
                    </View>
                  ))}
                  {row.length === 1 ? <View style={styles.coachTileSlot} /> : null}
                </View>
              ))}
            </View>
            {experiment ? experiment.locked ? (
              <LockedCoachSection id="experiment" coach={coach} onPress={onLockedSection} />
            ) : coach.experiment ? (
              <View style={styles.coachExperiment}>
                <ProgressDots done={experimentDaysDone(coach.experiment)} total={7} label="Experiment days elapsed" />
                <Text numberOfLines={2} style={styles.coachExperimentText}>{SHORT_EXPERIMENT_COPY[coach.experiment.id]}</Text>
              </View>
            ) : null : null}
            {headline ? <Text numberOfLines={2} style={styles.coachHeadline}>{headline}</Text> : null}
          </>
        )}
      </>}
    </View>
  );
}

function getBestCleanSeconds(coach: FocusCoachResult) {
  return coach.cleanTrend?.points.length
    ? Math.max(...coach.cleanTrend.points.map(point => point.cleanSeconds))
    : coach.currentCleanSeconds;
}

function sectionTitle(id: FocusCoachCardSectionId) {
  return { clean_trend: 'Trend', last_session: 'Last session', away: 'Away',
    diagnosis: 'Best window', experiment: 'Experiment' }[id];
}

function ProgressDots({ done, total, label }: { done: number; total: number; label: string }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${Math.min(total, Math.max(0, done))} of ${total}`} style={styles.coachDots}>
      {Array.from({ length: total }, (_, index) => (
        <View key={index} style={[styles.coachDot, index < done && styles.coachDotFilled]} />
      ))}
    </View>
  );
}

function LockIcon() {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" accessibilityLabel="Locked">
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
    <Svg width={18} height={18} viewBox="0 0 24 24" accessibilityLabel="Included">
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

function LockedCoachSection({ id, coach, onPress }: {
  id: FocusCoachCardSectionId;
  coach: FocusCoachResult;
  onPress: () => void;
}) {
  const teaser = lockedTeaserCopy(id, coach);
  if (!teaser) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Unlock ${teaser}`}
      onPress={onPress} style={({ pressed }) => [
        styles.coachTile, id === 'experiment' && styles.coachLockedExperiment,
        pressed && styles.textActionPressed,
      ]}>
      {/* Static decoration only. Never mount a paid chart or value in a locked tile. */}
      <View accessible={false} style={styles.coachPlaceholder} />
      <View style={[styles.coachLockedForeground, id === 'experiment' && styles.coachLockedStripContent]}>
        <LockIcon />
        <Text numberOfLines={2} style={styles.coachLockedTeaser}>{teaser}</Text>
      </View>
    </Pressable>
  );
}

function PaidCoachSection({ id, coach }: { id: FocusCoachCardSectionId; coach: FocusCoachResult }) {
  let content;
  let title = sectionTitle(id);
  switch (id) {
    case 'clean_trend': {
      const delta = coach.cleanTrend?.deltaSeconds;
      content = <>
        <CleanFocusTrendChart coach={coach} />
        {delta !== null && delta !== undefined && delta !== 0 ? (
          <Text numberOfLines={2} style={[styles.coachTileValue, { color: delta > 0 ? colors.pine : colors.mutedRust }]}>
            {delta > 0 ? '+' : '−'}{formatDuration(Math.abs(delta))}
          </Text>
        ) : null}
      </>;
      break;
    }
    case 'last_session': {
      const last = coach.lastSession;
      if (!last) return null;
      const width = Math.min(148, Math.max(last.cleanSeconds > 0 ? 4 : 0,
        (last.cleanSeconds / Math.max(1, last.focusSeconds)) * 148));
      const marker = last.firstDistractionAtSeconds !== null
        ? 6 + Math.min(148, Math.max(0, (last.firstDistractionAtSeconds / Math.max(1, last.focusSeconds)) * 148)) : null;
      const ended = last.endedBy === 'camera_absence' ? 'Away' : last.endedBy === 'app_touched' ? 'App'
        : last.endedBy === 'pause_overrun' ? 'Pause' : 'Stopped';
      content = <>
        <Svg width="100%" height={40} viewBox="0 0 160 40" accessible
          accessibilityLabel={`Last session: ${durationInWords(last.cleanSeconds)} clean of ${durationInWords(last.focusSeconds)} focus${marker !== null ? `, first distraction at ${durationInWords(last.firstDistractionAtSeconds!)}` : ', no distraction'}`}>
          <Rect x={6} y={16} width={148} height={10} rx={3} fill={colors.panelTop} />
          <Rect x={6} y={16} width={width} height={10} rx={3} fill={colors.pine} />
          {marker !== null ? <Line x1={marker} x2={marker} y1={12} y2={30} strokeWidth={3} stroke={colors.mutedRust} /> : null}
        </Svg>
        <Text numberOfLines={2} style={styles.coachTileValue}>{tileDuration(last.cleanSeconds)} clean</Text>
        {last.endedEarly ? <View style={styles.coachEndChip}><Text numberOfLines={2} style={styles.coachEndText}>{ended}</Text></View> : null}
      </>;
      break;
    }
    case 'away': {
      const away = coach.away;
      if (!away || away.display === 'hidden' || away.sinceLastUseSeconds === null) return null;
      const qualifier = away.display === 'at_least' ? 'at least' : 'about';
      content = <>
        <Text numberOfLines={2} style={styles.coachCaption}>{qualifier}</Text>
        <Text numberOfLines={2} style={styles.coachAwayValue}>{formatAwayTime(away.sinceLastUseSeconds).replace(/ (h|min)/g, '$1').replace(/min/g, 'm')}</Text>
        <Text numberOfLines={2} style={styles.coachCaption}>since last use</Text>
      </>;
      break;
    }
    case 'diagnosis': {
      const detail = coach.diagnosisDetail;
      const kind = detail?.kind ?? coach.diagnosis;
      title = kind === 'best_window' ? 'Best window' : 'Pattern';
      const window = detail?.kind === 'best_window' ? detail.window : null;
      const label = window === 'morning' ? 'Mornings' : window === 'afternoon' ? 'Afternoons'
        : window === 'evening' ? 'Evenings' : kind === 'early_breaker' ? 'Early'
        : kind === 'late_breaker' ? 'Late' : kind === 'app_heavy' ? 'Apps' : kind === 'camera_heavy' ? 'Away' : 'Timing';
      const delta = detail?.kind === 'best_window'
        ? Math.max(0, detail.windowMedianCleanSeconds - detail.overallMedianCleanSeconds) : 0;
      const early = coach.weakEvidence || (detail?.kind === 'best_window' && detail.sessionsInWindow < 5);
      content = <>
        <View style={styles.coachPattern}>
          <PatternIcon kind={window ?? kind ?? 'best_window'} label={label} />
          <Text numberOfLines={2} style={[styles.coachTileValue, styles.coachPatternLabel]}>{label}</Text>
        </View>
        {delta > 0 ? <Text numberOfLines={2} style={styles.coachCaption}>+{tileDuration(delta)} cleaner</Text> : null}
        {early ? <Text numberOfLines={2} style={styles.coachEarlyTag}>Early</Text> : null}
      </>;
      break;
    }
    case 'experiment': return null;
  }
  return <View style={styles.coachTile}>
    <Text numberOfLines={2} style={styles.coachTileTitle}>{title}</Text>
    {content}
  </View>;
}

function PatternIcon({ kind, label }: { kind: string; label: string }) {
  const sun = kind === 'morning' || kind === 'afternoon' || kind === 'best_window';
  return <Svg width={24} height={24} viewBox="0 0 24 24" accessible accessibilityLabel={`${label} pattern`}>
    {sun ? <>
      <Circle cx={12} cy={12} r={4} fill="none" stroke={colors.pine} strokeWidth={1.8} />
      <Path d="M12 1v3 M12 20v3 M1 12h3 M20 12h3 M4 4l2 2 M18 18l2 2 M4 20l2-2 M18 6l2-2"
        stroke={colors.pine} strokeWidth={1.8} />
      {kind === 'afternoon' ? <Line x1={1} x2={23} y1={18} y2={18} stroke={colors.pine} strokeWidth={1.8} /> : null}
    </> : kind === 'evening' ? <Path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z" fill="none" stroke={colors.pine} strokeWidth={1.8} />
      : kind === 'app_heavy' ? <Rect x={6} y={2} width={12} height={20} rx={2} fill="none" stroke={colors.muted} strokeWidth={1.8} />
      : kind === 'camera_heavy' ? <Path d="M3 7h12v12H3Z M15 11l6-4v12l-6-4" fill="none" stroke={colors.muted} strokeWidth={1.8} />
      : <><Circle cx={12} cy={12} r={9} fill="none" stroke={colors.muted} strokeWidth={1.8} />
        <Path d={kind === 'early_breaker' ? 'M12 5v7l-4 3' : 'M12 5v7l5 3'} fill="none" stroke={colors.muted} strokeWidth={1.8} /></>}
  </Svg>;
}

function CleanFocusTrendChart({ coach }: { coach: FocusCoachResult }) {
  const values = coach.cleanTrend?.points.map(point => point.cleanSeconds) ?? [];
  if (!values.length) return null;
  const geometry = cleanTrendGeometry(values, coach.suggestionMinutes);
  const last = geometry.points.at(-1)!;
  return <Svg width="100%" height={56} viewBox="0 0 160 56" accessible
    accessibilityLabel={`Clean focus trend: ${values.map(durationInWords).join(', ')}${geometry.goalY !== null ? `; suggested goal ${coach.suggestionMinutes} minutes` : ''}`}>
    {geometry.goalY !== null ? <Line x1={6} x2={154} y1={geometry.goalY} y2={geometry.goalY} stroke={colors.muted} strokeDasharray="3 5" /> : null}
    <Polyline points={geometry.points.map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke={colors.pine} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
    <Circle cx={last.x} cy={last.y} r={3.5} fill={colors.pine} />
  </Svg>;
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
        accessibilityLabel="Example trend, no session data"
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
    borderRadius: 18, padding: 14, borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.panelTop, backgroundColor: colors.module,
  },
  coachEyebrow: { color: colors.muted, fontSize: 12, lineHeight: 17, fontFamily: 'Geist' },
  coachTitle: { marginTop: 6, color: colors.ink, fontSize: 20, lineHeight: 26, fontFamily: 'GeistSemiBold' },
  coachMetricLine: { marginTop: 10, color: colors.ink, fontSize: 14, lineHeight: 20, fontFamily: 'Geist' },
  coachFootnote: { marginTop: 8, color: colors.muted, fontSize: 12, lineHeight: 17, fontFamily: 'Geist' },
  coachHeader: { marginTop: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  coachHeaderMetric: { flex: 1, minWidth: 0 },
  coachBigNumber: { color: colors.ink, fontSize: 34, lineHeight: 40, fontFamily: 'GeistSemiBold' },
  coachCaption: { color: colors.muted, fontSize: 12, lineHeight: 17, fontFamily: 'Geist' },
  coachNextChip: { maxWidth: '47%', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 18, backgroundColor: colors.goalSurface },
  coachNextText: { color: colors.rewardAmber, fontSize: 12, lineHeight: 17, fontFamily: 'GeistSemiBold' },
  coachGrid: { marginTop: 16, gap: 10 },
  coachTileRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  coachTileSlot: { flex: 1, minWidth: 0 },
  coachTile: { flex: 1, borderRadius: 14, padding: 12, gap: 6, backgroundColor: colors.panelBottom },
  coachTileTitle: { color: colors.muted, fontSize: 12, lineHeight: 17, fontFamily: 'Geist' },
  coachTileValue: { color: colors.ink, fontSize: 19, lineHeight: 25, fontFamily: 'GeistSemiBold' },
  coachAwayValue: { color: colors.ink, fontSize: 28, lineHeight: 34, fontFamily: 'GeistSemiBold' },
  coachEndChip: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: colors.panelTop },
  coachEndText: { color: colors.mutedRust, fontSize: 10, lineHeight: 14, fontFamily: 'Geist' },
  coachPattern: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  coachPatternLabel: { flexShrink: 1, minWidth: 0, fontSize: 16, lineHeight: 22 },
  coachEarlyTag: { color: colors.muted, fontSize: 10, lineHeight: 14, fontFamily: 'Geist' },
  coachExperiment: { marginTop: 12, borderRadius: 14, padding: 12, gap: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', backgroundColor: colors.panelBottom },
  coachExperimentText: { flexBasis: 140, flexGrow: 1, flexShrink: 1, color: colors.ink, fontSize: 12, lineHeight: 17, fontFamily: 'GeistSemiBold' },
  coachDots: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginVertical: 6 },
  coachDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.panelTop },
  coachDotFilled: { backgroundColor: colors.pine },
  coachHeadline: { marginTop: 12, color: colors.muted, fontSize: 11, lineHeight: 16, fontFamily: 'Geist' },
  coachLockedExperiment: { marginTop: 12, minHeight: 64, flex: 0 },
  coachPlaceholder: { position: 'absolute', left: 12, right: 12, top: 30, height: 32, borderRadius: 4, backgroundColor: colors.panelTop },
  coachLockedForeground: { flex: 1, minHeight: 82, gap: 8, justifyContent: 'center', alignItems: 'center' },
  coachLockedStripContent: { minHeight: 32, flexDirection: 'row' },
  coachLockedTeaser: { color: colors.ink, fontSize: 14, lineHeight: 20, fontFamily: 'GeistSemiBold', textAlign: 'center' },
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
