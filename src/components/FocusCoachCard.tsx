import { typography } from '../theme/typography';
import { Text } from './AppText';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useFonts } from 'expo-font';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { CoachNote, PendingNote, FocusCoachResult } from '../domain/focusCoach';
import { MIN_FOCUS_SECONDS } from '../domain/focusCoach';
import { selectCoachCardSections } from '../domain/focusCoachCardSections';
import {
  lockedTeaserCopy, COMING_UP_COPY, pendingProgressCopy, pendingAccessibilityCopy, weeklyTestTitle, experimentDayCopy,
  COACH_COPY, MORE_PATTERNS_COPY, WEEKDAY_INITIALS, barsVisualCopy, coachFootnote,
  dotsVisualCopy, evidenceLabel, percentValueCopy, progressVisualCopy, remainingSessionsCopy, slipVisualCopy, weeklyTestCopy, weekVisualCopy,
} from '../domain/focusCoachCopy';
import { formatApproxDuration } from '../domain/durationFormat';
import { experimentDaysDone } from './focusCoachPresentation';
import { colors } from '../theme/tokens';

export function FocusCoachCard({ coach, paidUser, onLockedSection }: {
  coach: FocusCoachResult; paidUser: boolean; onLockedSection: () => void;
}) {
  const [fontsLoaded, fontError] = useFonts({
    Geist: require('../assets/fonts/Geist-Regular.ttf'),
    GeistSemiBold: require('../assets/fonts/Geist-SemiBold.ttf'),
  });
  const selection = selectCoachCardSections({ isPaid: paidUser, result: coach, platform: Platform.OS });
  const experiment = selection.experiment;
  return <View testID="coach-card" style={styles.card}>
    {!fontsLoaded && !fontError ? <ActivityIndicator color={colors.muted} accessibilityLabel={COACH_COPY.loading} /> : <>
      <View style={styles.eyebrow}>
        <Text style={styles.muted}>{COACH_COPY.title}</Text>
        {selection.evidenceCount > 0 ? <Text style={styles.muted}>{evidenceLabel(selection.evidenceCount)}</Text> : null}
      </View>
      <Text style={styles.headline}>{selection.headline}</Text>
      {selection.state === 'too_early' ? <>
        <CoachDots days={Array.from({ length: selection.progress.total }, (_, index) => index < selection.progress.done)}
          label={progressVisualCopy(selection.progress.done, selection.progress.total)} />
        <Text style={styles.body}>{remainingSessionsCopy(selection.tooEarlyRemaining)}</Text>
        <Text style={styles.muted}>{coachFootnote(MIN_FOCUS_SECONDS)}</Text>
      </> : <>
        {selection.notes.length === 0 && selection.pending.length === 0 ? <Text style={styles.muted}>{MORE_PATTERNS_COPY}</Text> : null}
        {selection.notes.map(note => <View testID={`coach-note-${note.id}`} key={note.id} style={styles.note}>
          <View style={styles.noteRow}>
            <CoachIcon icon={note.icon} />
            <View style={styles.sentence}>
              <Text style={styles.body}>{note.text}</Text>
              {note.weak && note.id !== 'consistency' ? <Text style={styles.early}>{COACH_COPY.earlyRead}</Text> : null}
            </View>
          </View>
          <View style={styles.proof}><CoachVisual visual={note.visual} /></View>
        </View>)}
        {selection.pending.length > 0 && selection.notes.length > 0 ? <Text style={styles.muted}>{COMING_UP_COPY}</Text> : null}
        {selection.pending.map(row => <PendingCoachRow key={row.id} row={row} />)}
        {selection.lockedRow ? <Pressable accessibilityRole="button" accessibilityLabel={lockedTeaserCopy(selection.lockedRow)}
          onPress={onLockedSection} style={({ pressed }) => [styles.locked, pressed && styles.pressed]}>
          <CoachIcon icon="lock" />
          <Text style={[styles.body, styles.lockText]}>{lockedTeaserCopy(selection.lockedRow)}</Text>
          <View style={styles.lockIcons} accessible={false} importantForAccessibility="no-hide-descendants">
            {selection.lockedRow.icons.map((icon, index) => <CoachIcon key={index} icon={icon} />)}
          </View>
        </Pressable> : null}
        {experiment ? <View testID="coach-experiment" style={styles.experiment}>
          <Text style={styles.body}>{weeklyTestTitle(experiment.id)}</Text>
          <View style={styles.experimentProgress}>
            <CoachDots days={Array.from({ length: 7 }, (_, index) => index < experimentDaysDone(experiment))}
              label={weeklyTestCopy(experiment.id, Math.min(7, experimentDaysDone(experiment) + 1))} />
            <Text style={styles.muted}>{experimentDayCopy(Math.min(7, experimentDaysDone(experiment) + 1))}</Text>
          </View>
        </View> : null}
        {selection.nextStep ? <View testID="coach-next-step" style={styles.nextStep}>
          <Text style={styles.nextText}>{selection.nextStep.text}</Text>
        </View> : null}
      </>}
    </>}
  </View>;
}

function PendingCoachRow({ row }: { row: PendingNote }) {
  const progress = pendingProgressCopy(row.id, row.have, row.need);
  return <View testID={`coach-pending-${row.id}`} accessible accessibilityLabel={pendingAccessibilityCopy(row)} style={styles.pending}>
    <View style={styles.noteRow}>
      <View style={styles.dimmed}><CoachIcon icon={row.icon} /></View>
      <View style={styles.sentence}>
        <View style={styles.pendingHeader}>
          <Text style={styles.pendingTitle}>{row.title}</Text>
          {progress ? <Text style={styles.muted}>{progress}</Text> : <View style={styles.dots}>
            {Array.from({ length: Math.min(6, row.need) }, (_, index) => <View key={index} style={[styles.pendingDot, index < row.have && styles.pendingDotFilled]} />)}
          </View>}
        </View>
        <Text style={styles.pendingHint}>{row.hint}</Text>
      </View>
    </View>
  </View>;
}

function CoachIcon({ icon }: { icon: CoachNote['icon'] | 'lock' }) {
  return <Svg width={20} height={22} viewBox="0 0 24 24" accessible={false} fill="none" stroke={colors.muted} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    {icon === 'device-mobile' ? <><Rect x={6} y={2} width={12} height={20} rx={2} /><Circle cx={12} cy={18} r={.7} /></>
      : icon === 'clock' ? <><Circle cx={12} cy={12} r={9} /><Path d="M12 5v7l4 3" /></>
      : icon === 'sun' ? <><Circle cx={12} cy={12} r={4} /><Path d="M12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2" /></>
      : icon === 'ruler' ? <><Rect x={3} y={7} width={18} height={10} rx={1} /><Path d="M7 7v5M11 7v3M15 7v5M19 7v3" /></>
      : icon === 'layout' ? <><Rect x={3} y={3} width={18} height={18} rx={2} /><Path d="M3 10h18M10 10v11" /></>
      : icon === 'hourglass' ? <Path d="M5 3h14M5 21h14M7 3v4l10 10v4M17 3v4L7 17v4" />
      : icon === 'calendar' ? <><Rect x={3} y={5} width={18} height={16} rx={2} /><Path d="M7 2v6M17 2v6M3 11h18M7 15h2M13 15h2" /></>
      : <><Rect x={5} y={10} width={14} height={11} rx={2} /><Path d="M8 10V7a4 4 0 0 1 8 0v3" /></>}
  </Svg>;
}

function CoachDots({ days, label, today = false }: { days: boolean[]; label: string; today?: boolean }) {
  const firstDay = new Date(); firstDay.setDate(firstDay.getDate() - 6);
  return <View accessible accessibilityLabel={label} style={styles.dots}>
    {days.map((filled, index) => <View key={index} style={styles.day}>
      <View style={[styles.dot, filled && styles.filled, today && index === 6 && styles.today]} />
      {today ? <Text style={styles.initial}>{WEEKDAY_INITIALS[(firstDay.getDay() + index) % 7]}</Text> : null}
    </View>)}
  </View>;
}

function CoachVisual({ visual }: { visual: CoachNote['visual'] }) {
  switch (visual.kind) {
    case 'slip_bar': {
      const maximum = Math.max(1, visual.maxSeconds);
      const percent = (seconds: number) => Math.max(0, Math.min(100, seconds / maximum * 100));
      return <View accessible accessibilityLabel={slipVisualCopy(visual.typicalSeconds, visual.maxSeconds)} style={styles.visual}>
        <View style={styles.track}>
          <View style={[styles.cleanFill, { width: `${percent(visual.typicalSeconds)}%` }]} />
          <View style={[styles.spread, { left: `${percent(visual.lowSeconds)}%`, width: `${Math.max(0, percent(visual.highSeconds) - percent(visual.lowSeconds))}%` }]} />
        </View>
        <View style={styles.ends}><Text style={styles.muted}>{COACH_COPY.zero}</Text><Text style={styles.muted}>{formatApproxDuration(visual.maxSeconds)}</Text></View>
      </View>;
    }
    case 'dots': return <View accessible accessibilityLabel={dotsVisualCopy(visual.hits, visual.total)} style={styles.dots}>
      {Array.from({ length: visual.total }, (_, index) => <View key={index} style={[styles.dot, index < visual.hits && styles.hit]} />)}
    </View>;
    case 'bars': {
      const maximum = Math.max(1, ...visual.items.map(item => item.value));
      return <View accessible accessibilityLabel={barsVisualCopy(visual.items, visual.unit)} style={styles.bars}>
        {visual.items.map(item => <View key={item.label} style={styles.barItem}>
          <View style={styles.barSpace}>
            {visual.unit === 'percent' ? <Text style={styles.muted}>{percentValueCopy(item.value)}</Text> : null}
            <View style={[styles.bar, { height: Math.max(4, item.value / maximum * 36), opacity: item.best ? 1 : .4 }]} />
          </View>
          <Text style={styles.barLabel}>{item.label}</Text>
        </View>)}
      </View>;
    }
    case 'week_dots': return <CoachDots days={visual.days} label={weekVisualCopy(visual.days)} today />;
  }
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.module, borderRadius: 18, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.panelTop, gap: 12 },
  eyebrow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 },
  muted: { color: colors.muted, fontFamily: 'Geist', ...typography.caption },
  headline: { color: colors.ink, fontFamily: 'GeistSemiBold', ...typography.heading },
  note: { backgroundColor: colors.panelBottom, padding: 12, borderRadius: 14, gap: 12 },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  sentence: { flex: 1, minWidth: 0, gap: 4 },
  body: { color: colors.ink, fontFamily: 'Geist', ...typography.body },
  early: { color: colors.muted, fontFamily: 'Geist', ...typography.caption },
  proof: { marginLeft: 30, minWidth: 0 },
  visual: { gap: 5 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.panelTop, overflow: 'hidden' },
  cleanFill: { height: 8, backgroundColor: colors.pine },
  spread: { position: 'absolute', top: 0, bottom: 0, backgroundColor: colors.mutedRust, opacity: .6 },
  ends: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  dots: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.panelTop },
  filled: { backgroundColor: colors.pine }, hit: { backgroundColor: colors.mutedRust },
  today: { borderWidth: 1.5, borderColor: colors.ink },
  day: { alignItems: 'center', gap: 4 },
  initial: { color: colors.muted, fontFamily: 'Geist', ...typography.caption },
  bars: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  barItem: { flex: 1, minWidth: 0, gap: 4 },
  barSpace: { minHeight: 62, justifyContent: 'flex-end', gap: 3 },
  bar: { borderRadius: 4, backgroundColor: colors.pine },
  barLabel: { color: colors.muted, fontFamily: 'Geist', ...typography.caption },
  experiment: { backgroundColor: colors.panelBottom, borderRadius: 14, padding: 12, gap: 12 },
  experimentProgress: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  pending: { padding: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.panelTop },
  pendingHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  pendingTitle: { flexGrow: 1, flexShrink: 1, minWidth: 80, color: colors.muted, opacity: .8, fontFamily: 'Geist', ...typography.label },
  pendingHint: { color: colors.muted, fontFamily: 'Geist', ...typography.caption },
  pendingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.panelBottom, borderWidth: 1, borderColor: colors.muted },
  pendingDotFilled: { backgroundColor: colors.muted },
  dimmed: { opacity: .6 },
  nextStep: { borderRadius: 14, padding: 12, backgroundColor: colors.goalSurface },
  nextText: { color: colors.rewardAmber, fontFamily: 'GeistSemiBold', ...typography.label },
  locked: { borderRadius: 14, backgroundColor: colors.panelBottom, padding: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  lockText: { flex: 1, minWidth: 90 }, lockIcons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pressed: { opacity: .7 },
});
