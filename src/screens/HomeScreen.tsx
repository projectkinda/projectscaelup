import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { CameraView } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PlayIcon from '../assets/icons/play.svg';
import { BottomNavigation } from '../components/BottomNavigation';
import { RunningTimerDisplay } from '../components/RunningTimerDisplay';
import { SessionCompletePopup } from '../components/SessionCompletePopup';
import { SessionEndChoiceModal } from '../components/SessionEndChoiceModal';
import { TallyCard, type TallyMarkPosition } from '../components/TallyCard';
import { TALLY_GROUP_SIZE } from '../components/TallyGroupMark';
import { TimerSelector } from '../components/TimerSelector';
import { HOME_MODES } from '../domain/sessionModes';
import {
  completeSession,
  getSessionCount,
  startSession,
  voidSession,
} from '../domain/sessionHistory';
import { PreSessionReadinessScreen } from './PreSessionReadinessScreen';
import { colors, layout } from '../theme/tokens';

const TALLY_GRID_SIZE = 20;

type HomeScreenProps = {
  sessionMessage?: string | null;
  onNavigate: (screen: string) => void;
  onStartSession: (details: {
    modeId: string;
    modeName: string;
    durationMinutes: number;
  }) => void;
};

export function HomeScreen({
  sessionMessage,
  onNavigate,
  onStartSession,
}: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [activeModeId, setActiveModeId] = useState(HOME_MODES[0].id);
  const [tabWidth, setTabWidth] = useState(0);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(10);
  const [pendingDurationSeconds, setPendingDurationSeconds] = useState<
    number | null
  >(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [currentSessionDurationSeconds, setCurrentSessionDurationSeconds] =
    useState(0);
  const [currentSessionStartedAt, setCurrentSessionStartedAt] =
    useState<Date | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [awaitingEndChoice, setAwaitingEndChoice] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [revealIndex, setRevealIndex] = useState<number | null>(null);
  const [revealLitCount, setRevealLitCount] = useState(0);
  const [revealArmed, setRevealArmed] = useState(false);
  const [popupTarget, setPopupTarget] = useState<TallyMarkPosition | null>(null);
  const tabProgress = useRef(new Animated.Value(0)).current;
  const contentProgress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    getSessionCount().then(setSessionCount);
  }, []);

  const activeMode =
    HOME_MODES.find(mode => mode.id === activeModeId) ?? HOME_MODES[0];
  const activeModeIndex = Math.max(
    0,
    HOME_MODES.findIndex(mode => mode.id === activeMode.id),
  );
  const topInsetPadding = insets.top + 27;
  const bottomInsetPadding = layout.bottomNavHeight + insets.bottom + 24;
  const availableContentHeight = Math.max(
    0,
    windowHeight - topInsetPadding - bottomInsetPadding,
  );
  const timerGap = Math.max(
    40,
    Math.min(68, Math.round(availableContentHeight * 0.075)),
  );
  const tallyGap = Math.max(
    34,
    Math.min(58, Math.round(availableContentHeight * 0.07)),
  );

  useEffect(() => {
    Animated.spring(tabProgress, {
      toValue: activeModeIndex,
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
      mass: 0.7,
    }).start();

    contentProgress.setValue(0);
    Animated.timing(contentProgress, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [activeModeIndex, contentProgress, tabProgress]);

  useEffect(() => {
    if (remainingSeconds === null || isPaused || awaitingEndChoice) {
      return;
    }

    if (remainingSeconds <= 0) {
      setAwaitingEndChoice(true);
      setIsPaused(true);
      return;
    }

    const intervalId = setInterval(() => {
      setRemainingSeconds(current => {
        if (current === null) {
          return current;
        }

        return Math.max(0, current - 1);
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [awaitingEndChoice, isPaused, remainingSeconds]);

  const beginActiveSession = async (durationSeconds: number) => {
    const startedAt = new Date();
    const sessionId = await startSession({
      modeId: activeMode.id,
      durationSeconds,
      startedAt,
    });

    onStartSession({
      modeId: activeMode.id,
      modeName: activeMode.name,
      durationMinutes: Math.ceil(durationSeconds / 60),
    });
    setActiveSessionId(sessionId);
    setRemainingSeconds(durationSeconds);
    setCurrentSessionDurationSeconds(durationSeconds);
    setCurrentSessionStartedAt(startedAt);
    setIsPaused(false);
    setPendingDurationSeconds(null);
  };

  const handleStart = () => {
    const durationSeconds = hours * 60 + minutes;
    if (durationSeconds === 0) {
      Alert.alert(
        'Set a focus time',
        'Swipe either timer module before starting.',
      );
      return;
    }

    setPendingDurationSeconds(durationSeconds);
  };

  const handleAddTime = () => {
    setAwaitingEndChoice(false);
    setRemainingSeconds(current => (current ?? 0) + 5 * 60);
    setCurrentSessionDurationSeconds(current => current + 5 * 60);
    setIsPaused(false);
  };

  const handleEndFromAlarm = () => {
    setAwaitingEndChoice(false);
    handleCompleteSession();
  };

  const resetActiveSessionState = () => {
    setRemainingSeconds(null);
    setActiveSessionId(null);
    setCurrentSessionDurationSeconds(0);
    setCurrentSessionStartedAt(null);
    setIsPaused(false);
    setAwaitingEndChoice(false);
  };

  const handleCancelSession = async () => {
    const sessionId = activeSessionId;
    resetActiveSessionState();

    if (sessionId !== null) {
      await voidSession(sessionId);
    }
  };

  const handleCompleteSession = async () => {
    const sessionId = activeSessionId;

    if (sessionId === null) {
      resetActiveSessionState();
      return;
    }

    resetActiveSessionState();

    const previousCount = sessionCount;
    const completed = await completeSession(sessionId);
    setSessionCount(completed.sessionCount);

    const groupIndex = Math.floor(previousCount / TALLY_GROUP_SIZE);
    if (groupIndex < TALLY_GRID_SIZE) {
      const litCount = completed.sessionCount - groupIndex * TALLY_GROUP_SIZE;
      setPopupTarget(null);
      setRevealArmed(false);
      setRevealLitCount(litCount);
      setRevealIndex(groupIndex);
    }
  };

  const handleTabsLayout = (event: LayoutChangeEvent) => {
    setTabWidth(event.nativeEvent.layout.width / HOME_MODES.length);
  };

  const tabTranslateX = Animated.multiply(tabProgress, tabWidth);
  const modeContentStyle = {
    opacity: contentProgress,
    transform: [
      {
        translateY: contentProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [8, 0],
        }),
      },
    ],
  };

  if (pendingDurationSeconds !== null && remainingSeconds === null) {
    return (
      <PreSessionReadinessScreen
        durationSeconds={pendingDurationSeconds}
        modeName={activeMode.tabLabel}
        onCancel={() => setPendingDurationSeconds(null)}
        onReady={() => beginActiveSession(pendingDurationSeconds)}
      />
    );
  }

  if (remainingSeconds !== null) {
    return (
      <View style={styles.screen}>
        <View
          style={[
            styles.runningContent,
            {
              paddingTop: insets.top + 37,
              paddingBottom: layout.bottomNavHeight + insets.bottom + 24,
            },
          ]}
        >
          <View style={styles.runningHeader}>
            <Text style={styles.runningTitle}>{activeMode.tabLabel}</Text>
            <View style={styles.cameraPreview}>
              <CameraView
                active
                facing="front"
                mirror
                style={styles.cameraPreviewFeed}
              />
            </View>
          </View>

          <View style={styles.runningTimerWrap}>
            <RunningTimerDisplay remainingSeconds={remainingSeconds} />
          </View>

          <View style={styles.runningActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isPaused ? 'Resume session' : 'Pause session'}
              onPress={() => setIsPaused(current => !current)}
              style={({ pressed }) => [
                styles.pauseShell,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.pauseButton}>
                <PauseGlyph />
                <Text style={styles.pauseLabel}>
                  {isPaused ? 'Resume' : 'Pause'}
                </Text>
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Finish session"
              onPress={handleCancelSession}
              style={({ pressed }) => [
                styles.startShell,
                pressed && styles.pressed,
              ]}
            >
              <LinearGradient
                colors={['#333333', '#141414']}
                pointerEvents="none"
                style={styles.startButton}
              >
                <Text style={styles.startLabel}>Finish</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
        <BottomNavigation bottomInset={insets.bottom} onSelect={onNavigate} />
        {awaitingEndChoice ? (
          <SessionEndChoiceModal
            onAddTime={handleAddTime}
            onEndSession={handleEndFromAlarm}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        bounces={false}
        disableScrollViewPanResponder
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: topInsetPadding,
            paddingBottom: bottomInsetPadding,
          },
        ]}
      >
        <View
          style={[styles.content, { minHeight: availableContentHeight }]}
        >
          <View
            accessibilityRole="tablist"
            onLayout={handleTabsLayout}
            style={styles.tabs}
          >
            {HOME_MODES.map(mode => {
              const active = mode.id === activeModeId;
              return (
                <Pressable
                  key={mode.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => setActiveModeId(mode.id)}
                  style={styles.tab}
                >
                  <Text
                    style={[styles.tabLabel, active && styles.activeTabLabel]}
                  >
                    {mode.tabLabel}
                  </Text>
                </Pressable>
              );
            })}
            {tabWidth > 0 ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.activeIndicatorTrack,
                  {
                    width: tabWidth,
                    transform: [{ translateX: tabTranslateX }],
                  },
                ]}
              >
                <View style={styles.activeIndicator} />
              </Animated.View>
            ) : null}
          </View>

          <Animated.View
            style={[
              styles.adaptiveContent,
              modeContentStyle,
              { marginTop: timerGap },
            ]}
          >
            <TimerSelector
              hours={hours}
              minutes={minutes}
              onHoursChange={setHours}
              onMinutesChange={setMinutes}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Start ${activeMode.name} session`}
              onPress={handleStart}
              style={({ pressed }) => [
                styles.startShell,
                pressed && styles.pressed,
              ]}
            >
              <LinearGradient
                colors={['#333333', '#141414']}
                pointerEvents="none"
                style={styles.startButton}
              >
                <PlayIcon width={16} height={16} />
                <Text style={styles.startLabel}>Start</Text>
              </LinearGradient>
            </Pressable>
            {sessionMessage ? (
              <Text
                accessibilityLiveRegion="polite"
                style={styles.sessionMessage}
              >
                Ready: {sessionMessage}
              </Text>
            ) : null}
          </Animated.View>

          <View style={[styles.tallySection, { marginTop: tallyGap }]}>
            <TallyCard
              sessionCount={sessionCount}
              revealIndex={revealIndex}
              revealLitCount={revealLitCount}
              revealArmed={revealArmed}
              onRevealLayout={setPopupTarget}
            />
          </View>
        </View>
      </ScrollView>
      <BottomNavigation bottomInset={insets.bottom} onSelect={onNavigate} />
      {popupTarget && !revealArmed ? (
        <SessionCompletePopup
          target={popupTarget}
          litCount={revealLitCount}
          onLanded={() => setRevealArmed(true)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1, alignItems: 'center' },
  content: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    paddingHorizontal: layout.horizontalPadding,
  },
  runningContent: {
    flex: 1,
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.horizontalPadding,
  },
  runningHeader: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  runningTitle: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  cameraPreview: {
    width: 63,
    height: 63,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: colors.module,
  },
  cameraPreviewFeed: {
    width: '100%',
    height: '100%',
  },
  runningTimerWrap: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
  },
  runningActions: {
    width: '100%',
    gap: 16,
    marginBottom: 4,
  },
  tabs: {
    width: '100%',
    height: 44,
    flexDirection: 'row',
    position: 'relative',
  },
  tab: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '500',
  },
  activeTabLabel: { color: colors.ink, fontWeight: '700' },
  activeIndicatorTrack: {
    position: 'absolute',
    left: 0,
    bottom: 1,
    alignItems: 'center',
  },
  activeIndicator: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.ink,
  },
  adaptiveContent: {
    width: '100%',
    gap: 24,
    alignItems: 'center',
  },
  tallySection: { width: '100%' },
  startShell: {
    width: '100%',
    height: 53,
    borderRadius: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  startButton: {
    flex: 1,
    borderRadius: 12,
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
  pauseShell: {
    width: '100%',
    height: 53,
    borderRadius: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  pauseButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: colors.module,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pauseLabel: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
  pauseGlyph: {
    width: 13,
    height: 13,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 3,
  },
  pauseGlyphBar: {
    width: 4,
    height: 13,
    borderRadius: 1,
    backgroundColor: colors.ink,
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.995 }] },
  sessionMessage: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});

function PauseGlyph() {
  return (
    <View style={styles.pauseGlyph} accessibilityElementsHidden>
      <View style={styles.pauseGlyphBar} />
      <View style={styles.pauseGlyphBar} />
    </View>
  );
}
