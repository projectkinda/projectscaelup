import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PlayIcon from '../assets/icons/play.svg';
import { BottomNavigation } from '../components/BottomNavigation';
import { LivePresenceCamera } from '../components/LivePresenceCamera';
import { RunningTimerDisplay } from '../components/RunningTimerDisplay';
import { SessionEndChoiceModal } from '../components/SessionEndChoiceModal';
import { TallyCard } from '../components/TallyCard';
import { TALLY_GROUP_SIZE } from '../components/TallyGroupMark';
import { TimerSelector } from '../components/TimerSelector';
import { getAppState, setAppState } from '../data/appStateRepository';
import { ensureSchema, getDatabase } from '../data/database';
import { loadFocusCoachData } from '../data/focusCoachRepository';
import { loadAvailableModes } from '../data/modesRepository';
import { loadSettingsData } from '../data/settingsRepository';
import type { FocusCoachResult } from '../domain/focusCoach';
import {
  getAwayDisplay,
  getPreviousSessionAwayDisplay,
  setAwayTrackingEnabled,
  type AwayDisplay,
} from '../domain/awayTime';
import {
  deletePresencePhotoQuietly,
  sweepPresencePhotoCacheQuietly,
} from '../domain/frameCleanup';
import {
  MAX_PAUSE_SECONDS,
  MAX_PAUSES_PER_SESSION,
} from '../domain/pauseRules';
import { PresenceModule } from '../domain/presenceModule';
import { startSessionMonitor } from '../domain/sessionMonitor';
import { startUsageMonitor } from '../domain/usageMonitor';
import {
  finishFocusLock,
  pauseFocusLock,
  resumeFocusLock,
  startFocusLock,
} from '../domain/iosScreenTime';
import { getHomeModes } from '../domain/sessionModes';
import {
  completeSession,
  type DistractionEventSummary,
  formatDuration,
  getSessionCount,
  getShowingUpDayCount,
  recordSessionPauseResume,
  recordSessionPauseStart,
  startSession,
  voidSession,
} from '../domain/sessionHistory';
import { useIsPaidUser } from '../domain/useIsPaidUser';
import { PreSessionReadinessScreen } from './PreSessionReadinessScreen';
import { PostSessionSummaryScreen } from './PostSessionSummaryScreen';
import { colors, layout } from '../theme/tokens';

const TALLY_GRID_SIZE = 20;

type CompletionSummary = {
  previousSessionCount: number;
  sessionCount: number;
  distractionCount: number;
  distractionEvents: DistractionEventSummary[];
  modeGracePeriodSeconds: number;
  lockdownMinutes: number;
  touchedApps: string[];
  afterSessionAwayText: string | null;
};

const AWAY_TRACKING_PROMPTED_KEY = 'away_tracking_prompted';

async function loadFlaggedAppIdentifiersDirectly() {
  const database = await getDatabase();
  await ensureSchema(database);
  const rows = await database.getAllAsync<{ app_identifier: string }>(
    'SELECT app_identifier FROM flagged_apps ORDER BY app_identifier ASC;',
  );
  return rows.map(row => row.app_identifier);
}

function ActiveSessionCameraPreview({
  samplingActive,
}: {
  samplingActive: boolean;
}) {
  const [hasPermission, setHasPermission] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const captureInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setIsCameraReady(false);

    Camera.getCameraPermissionsAsync().then(permission => {
      if (!cancelled) {
        setHasPermission(permission.status === 'granted');
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      !PresenceModule.analyzesStillFrames ||
      !hasPermission ||
      !isCameraReady ||
      !samplingActive
    ) {
      return;
    }

    const capturePresenceFrame = async () => {
      if (captureInFlight.current) {
        return;
      }

      captureInFlight.current = true;
      let photoUri: string | undefined;
      try {
        const photo = await cameraRef.current?.takePictureAsync({
          base64: true,
          quality: 0.3,
          shutterSound: false,
        });
        photoUri = photo?.uri;

        if (photo?.base64) {
          await PresenceModule.reportFrame(photo.base64);
        }
      } catch (error) {
        console.warn('Failed to capture active presence frame:', error);
      } finally {
        await deletePresencePhotoQuietly(photoUri);
        captureInFlight.current = false;
      }
    };

    capturePresenceFrame();
    const intervalId = setInterval(capturePresenceFrame, 1500);

    return () => clearInterval(intervalId);
  }, [hasPermission, isCameraReady, samplingActive]);

  return (
    <View style={styles.cameraPreview}>
      {hasPermission && Platform.OS === 'ios' ? (
        <LivePresenceCamera
          active={samplingActive}
          analysisIntervalMs={1000}
          onCameraReady={() => setIsCameraReady(true)}
          style={[
            styles.cameraPreviewFeed,
            !isCameraReady && styles.cameraPreviewFeedHidden,
          ]}
        />
      ) : null}
      {hasPermission && Platform.OS !== 'ios' ? (
        <CameraView
          ref={cameraRef}
          active
          animateShutter={false}
          facing="front"
          mirror
          onCameraReady={() => setIsCameraReady(true)}
          style={[
            styles.cameraPreviewFeed,
            !isCameraReady && styles.cameraPreviewFeedHidden,
          ]}
        />
      ) : null}
    </View>
  );
}

type HomeScreenProps = {
  /** False while another tab is shown; Home stays mounted so a running session survives. */
  isActive: boolean;
  sessionMessage?: string | null;
  onNavigate: (screen: string) => void;
  onSessionActiveChange?: (active: boolean) => void;
  onStartSession: (details: {
    modeId: string;
    modeName: string;
    durationMinutes: number;
    durationSeconds: number;
    durationFormatted: string;
  }) => void;
};

export function HomeScreen({
  isActive,
  sessionMessage,
  onNavigate,
  onSessionActiveChange,
  onStartSession,
}: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const paidUser = useIsPaidUser();
  const fallbackModes = useMemo(() => getHomeModes(paidUser), [paidUser]);
  const [homeModes, setHomeModes] = useState(fallbackModes);
  const [activeModeId, setActiveModeId] = useState(fallbackModes[0].id);
  const [minutes, setMinutes] = useState(10);
  const [seconds, setSeconds] = useState(0);
  const [pendingDurationSeconds, setPendingDurationSeconds] = useState<
    number | null
  >(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseCountUsed, setPauseCountUsed] = useState(0);
  const [awaitingEndChoice, setAwaitingEndChoice] = useState(false);
  const [isPreparingPresence, setIsPreparingPresence] = useState(false);
  const [preparedModeName, setPreparedModeName] = useState<string | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [showingUpDays, setShowingUpDays] = useState(0);
  const [revealIndex, setRevealIndex] = useState<number | null>(null);
  const [revealLitCount, setRevealLitCount] = useState(0);
  const [revealArmed, setRevealArmed] = useState(false);
  const [completionSummary, setCompletionSummary] =
    useState<CompletionSummary | null>(null);
  const [awayDisplay, setAwayDisplay] = useState<AwayDisplay>({
    kind: 'hidden',
  });
  const [focusCoach, setFocusCoach] = useState<FocusCoachResult | null>(null);
  const contentProgress = useRef(new Animated.Value(1)).current;
  const sessionEndTimeMs = useRef<number | null>(null);
  const sessionMonitorUnsubscribe = useRef<(() => Promise<void>) | null>(null);
  const usageMonitorUnsubscribe = useRef<(() => void) | null>(null);
  const activeFlaggedAppIdentifiers = useRef<string[]>([]);
  const activeSegmentStartMs = useRef<number | null>(null);
  const focusMsAccumulated = useRef(0);
  const activePauseId = useRef<number | null>(null);
  const activePauseStartedAtMs = useRef<number | null>(null);
  const resumeInFlight = useRef(false);
  const pauseInFlight = useRef(false);
  const hasActiveSession = remainingSeconds !== null;

  useEffect(() => {
    getSessionCount().then(setSessionCount);
    getShowingUpDayCount().then(setShowingUpDays);
  }, []);

  const refreshAwayDisplay = useCallback(() => {
    getAwayDisplay()
      .then(setAwayDisplay)
      .catch(error => {
        console.warn('Failed to load away-time display:', error);
        setAwayDisplay({ kind: 'hidden' });
      });
  }, []);

  useEffect(() => {
    if (!isActive || hasActiveSession) {
      return;
    }

    refreshAwayDisplay();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refreshAwayDisplay();
      }
    });

    return () => subscription.remove();
  }, [hasActiveSession, isActive, refreshAwayDisplay]);

  useEffect(() => {
    if (!isActive || hasActiveSession) {
      return;
    }

    let cancelled = false;

    loadFocusCoachData()
      .then(data => {
        if (!cancelled) {
          setFocusCoach(data);
        }
      })
      .catch(error => {
        console.warn('Failed to load focus coach:', error);
        if (!cancelled) {
          setFocusCoach(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasActiveSession, isActive, paidUser]);

  // Reload whenever Home comes back into view so modes edited in Settings show up.
  useEffect(() => {
    if (!isActive) {
      return;
    }

    let cancelled = false;

    loadAvailableModes(paidUser).then(modes => {
      if (!cancelled) {
        setHomeModes(modes.length > 0 ? modes : fallbackModes);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fallbackModes, isActive, paidUser]);

  useEffect(() => {
    if (!homeModes.some(mode => mode.id === activeModeId)) {
      setActiveModeId(homeModes[0].id);
    }
  }, [activeModeId, homeModes]);

  const activeMode =
    homeModes.find(mode => mode.id === activeModeId) ?? homeModes[0];
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
  const pausesRemaining = Math.max(
    0,
    MAX_PAUSES_PER_SESSION - pauseCountUsed,
  );
  const pauseDisabled =
    !isPaused && !awaitingEndChoice && pausesRemaining <= 0;
  const pauseButtonLabel = isPaused
    ? 'Resume'
    : pausesRemaining <= 0
      ? 'No pauses left'
      : `Pause (${pausesRemaining} left)`;

  const closeActiveSegment = useCallback((nowMs = Date.now()) => {
    if (activeSegmentStartMs.current === null) {
      return;
    }

    focusMsAccumulated.current += Math.max(
      0,
      nowMs - activeSegmentStartMs.current,
    );
    activeSegmentStartMs.current = null;
  }, []);

  const buildSessionTiming = useCallback(() => {
    closeActiveSegment();
    return {
      focusSeconds: Math.max(0, Math.round(focusMsAccumulated.current / 1000)),
      gracePeriodSeconds: activeMode.gracePeriodSeconds,
      platform: Platform.OS,
    };
  }, [activeMode.gracePeriodSeconds, closeActiveSegment]);

  useEffect(() => {
    onSessionActiveChange?.(hasActiveSession);
  }, [hasActiveSession, onSessionActiveChange]);

  useEffect(() => {
    contentProgress.setValue(0);
    Animated.timing(contentProgress, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [activeMode.id, contentProgress]);

  useEffect(() => {
    if (!hasActiveSession || isPaused || awaitingEndChoice) {
      return;
    }

    const syncRemainingTime = () => {
      const endTime = sessionEndTimeMs.current;
      if (endTime === null) {
        return;
      }

      const nextRemainingSeconds = Math.max(
        0,
        Math.ceil((endTime - Date.now()) / 1000),
      );

      setRemainingSeconds(current =>
        current === nextRemainingSeconds ? current : nextRemainingSeconds,
      );

      if (nextRemainingSeconds <= 0) {
        closeActiveSegment();
        setAwaitingEndChoice(true);
        setIsPaused(true);
      }
    };

    syncRemainingTime();
    const intervalId = setInterval(syncRemainingTime, 250);

    return () => clearInterval(intervalId);
  }, [awaitingEndChoice, closeActiveSegment, hasActiveSession, isPaused]);

  // The end-of-session choice lives on Home, so bring the user back if the
  // timer runs out while they are on another tab.
  useEffect(() => {
    if (awaitingEndChoice && !isActive) {
      onNavigate('home');
    }
  }, [awaitingEndChoice, isActive, onNavigate]);

  const beginActiveSession = (durationSeconds: number) => {
    const startedAt = new Date();
    const mode = activeMode;
    const sessionEndTime = Date.now() + durationSeconds * 1000;

    sessionEndTimeMs.current = sessionEndTime;
    activeSegmentStartMs.current = Date.now();
    focusMsAccumulated.current = 0;
    activePauseId.current = null;
    activePauseStartedAtMs.current = null;
    resumeInFlight.current = false;
    pauseInFlight.current = false;
    setPauseCountUsed(0);
    setRemainingSeconds(durationSeconds);
    setIsPaused(false);
    setPendingDurationSeconds(null);

    void (async () => {
      let sessionId: number;
      try {
        sessionId = await startSession({
          modeId: mode.id,
          durationSeconds,
          startedAt,
        });
      } catch (error) {
        console.warn('Failed to start session in database:', error);
        sessionId = Date.now();
      }

      try {
        onStartSession({
          modeId: mode.id,
          modeName: mode.name,
          durationMinutes: Math.ceil(durationSeconds / 60),
          durationSeconds,
          durationFormatted: formatDuration(durationSeconds),
        });
      } catch (error) {
        console.warn('onStartSession handler error:', error);
      }

      setActiveSessionId(sessionId);
      void sessionMonitorUnsubscribe.current?.();
      sessionMonitorUnsubscribe.current = startSessionMonitor(sessionId, mode);
      usageMonitorUnsubscribe.current?.();
      try {
        const settingsData = await loadSettingsData({ isPaidUser: paidUser });
        activeFlaggedAppIdentifiers.current = settingsData.flaggedApps.map(
          app => app.appIdentifier,
        );
      } catch (error) {
        console.warn('Failed to load flagged apps for usage monitor:', error);
        try {
          activeFlaggedAppIdentifiers.current =
            await loadFlaggedAppIdentifiersDirectly();
        } catch (fallbackError) {
          console.warn(
            'Failed to load flagged apps directly for usage monitor:',
            fallbackError,
          );
          activeFlaggedAppIdentifiers.current = [];
        }
      }
      usageMonitorUnsubscribe.current = startUsageMonitor(
        sessionId,
        activeFlaggedAppIdentifiers.current,
      );
      startFocusLock(sessionId, mode.name, sessionEndTime).catch(
        error => console.warn('Failed to lock flagged apps:', error),
      );
    })();
  };

  const handleStart = async () => {
    const durationSeconds = minutes * 60 + seconds;
    if (durationSeconds === 0) {
      Alert.alert(
        'Set a focus time',
        'Swipe either timer module before starting.',
      );
      return;
    }

    setIsPreparingPresence(true);
    try {
      await PresenceModule.start(activeMode);
      setPreparedModeName(activeMode.tabLabel);
    } catch (error) {
      console.warn('Failed to start presence module:', error);
      Alert.alert(
        'Camera setup failed',
        'Unable to prepare the camera detector for this session.',
      );
      return;
    } finally {
      setIsPreparingPresence(false);
    }

    setPendingDurationSeconds(durationSeconds);
  };

  const handleAddTime = () => {
    setAwaitingEndChoice(false);
    if (activeSessionId !== null) {
      const nextEndMs = Date.now() + ((remainingSeconds ?? 0) + 5 * 60) * 1000;
      startFocusLock(activeSessionId, activeMode.name, nextEndMs).catch(error =>
        console.warn('Failed to extend the flagged-app lock:', error),
      );
    }
    setRemainingSeconds(current => {
      const nextRemainingSeconds = (current ?? 0) + 5 * 60;
      sessionEndTimeMs.current = Date.now() + nextRemainingSeconds * 1000;
      return nextRemainingSeconds;
    });
    activeSegmentStartMs.current = Date.now();
    setIsPaused(false);
  };

  const resumePausedSession = useCallback(
    async (autoResumed = false) => {
      if (
        remainingSeconds === null ||
        !isPaused ||
        awaitingEndChoice ||
        resumeInFlight.current
      ) {
        return;
      }

      resumeInFlight.current = true;
      const resumedAt = new Date();
      const pauseId = activePauseId.current;

      try {
        if (pauseId !== null) {
          await recordSessionPauseResume(pauseId, {
            resumedAt,
            autoResumed,
          });
          activePauseId.current = null;
          activePauseStartedAtMs.current = null;
        }

        if (activeSessionId !== null) {
          await sessionMonitorUnsubscribe.current?.();
          sessionMonitorUnsubscribe.current = startSessionMonitor(
            activeSessionId,
            activeMode,
          );
          usageMonitorUnsubscribe.current?.();
          usageMonitorUnsubscribe.current = startUsageMonitor(
            activeSessionId,
            activeFlaggedAppIdentifiers.current,
          );
        }

        sessionEndTimeMs.current = Date.now() + remainingSeconds * 1000;
        resumeFocusLock(sessionEndTimeMs.current).catch(error =>
          console.warn('Failed to re-lock flagged apps:', error),
        );
        activeSegmentStartMs.current = Date.now();
        setIsPaused(false);
      } finally {
        resumeInFlight.current = false;
      }
    },
    [
      activeMode,
      activeSessionId,
      awaitingEndChoice,
      isPaused,
      remainingSeconds,
    ],
  );

  useEffect(() => {
    if (
      !hasActiveSession ||
      !isPaused ||
      awaitingEndChoice ||
      activePauseStartedAtMs.current === null
    ) {
      return;
    }

    const autoResumeIfNeeded = () => {
      const pausedAtMs = activePauseStartedAtMs.current;
      if (
        pausedAtMs !== null &&
        Date.now() - pausedAtMs >= MAX_PAUSE_SECONDS * 1000
      ) {
        void resumePausedSession(true);
      }
    };

    autoResumeIfNeeded();
    const intervalId = setInterval(autoResumeIfNeeded, 1000);
    const subscription = AppState.addEventListener('change', autoResumeIfNeeded);

    return () => {
      clearInterval(intervalId);
      subscription.remove();
    };
  }, [awaitingEndChoice, hasActiveSession, isPaused, resumePausedSession]);

  const handlePauseToggle = async () => {
    if (remainingSeconds === null) {
      return;
    }

    if (isPaused) {
      await resumePausedSession(false);
      return;
    }

    if (pauseInFlight.current) {
      return;
    }

    pauseInFlight.current = true;
    try {
      if (pauseCountUsed >= MAX_PAUSES_PER_SESSION) {
        return;
      }

      const pausedAt = new Date();
      closeActiveSegment(pausedAt.getTime());
      if (activeSessionId !== null) {
        activePauseId.current = await recordSessionPauseStart(
          activeSessionId,
          pausedAt,
        );
        activePauseStartedAtMs.current = pausedAt.getTime();
        setPauseCountUsed(current =>
          Math.min(MAX_PAUSES_PER_SESSION, current + 1),
        );
      }
      await sessionMonitorUnsubscribe.current?.();
      sessionMonitorUnsubscribe.current = null;
      usageMonitorUnsubscribe.current?.();
      usageMonitorUnsubscribe.current = null;
      pauseFocusLock().catch(error =>
        console.warn('Failed to unlock flagged apps for the pause:', error),
      );
      setIsPaused(true);
    } finally {
      pauseInFlight.current = false;
    }
  };

  const handleEndFromAlarm = () => {
    setAwaitingEndChoice(false);
    handleCompleteSession();
  };

  const resetActiveSessionState = async () => {
    await sessionMonitorUnsubscribe.current?.();
    sessionMonitorUnsubscribe.current = null;
    usageMonitorUnsubscribe.current?.();
    usageMonitorUnsubscribe.current = null;
    activeFlaggedAppIdentifiers.current = [];
    await PresenceModule.stop();
    sweepPresencePhotoCacheQuietly();
    setRemainingSeconds(null);
    sessionEndTimeMs.current = null;
    activeSegmentStartMs.current = null;
    focusMsAccumulated.current = 0;
    activePauseId.current = null;
    activePauseStartedAtMs.current = null;
    resumeInFlight.current = false;
    pauseInFlight.current = false;
    setActiveSessionId(null);
    setIsPaused(false);
    setPauseCountUsed(0);
    setAwaitingEndChoice(false);
    setPreparedModeName(null);
  };

  const handleCancelSession = async () => {
    const sessionId = activeSessionId;
    const timing = sessionId !== null ? buildSessionTiming() : null;
    if (activePauseId.current !== null) {
      await recordSessionPauseResume(activePauseId.current, {
        resumedAt: new Date(),
        autoResumed: false,
      });
    }
    await resetActiveSessionState();

    if (sessionId !== null) {
      try {
        await finishFocusLock(sessionId, { keepDistractions: false });
      } catch (error) {
        console.warn('Failed to unlock flagged apps:', error);
      }
      try {
        await voidSession(sessionId, timing ?? undefined);
      } catch (error) {
        console.warn('Failed to void session in database:', error);
      }
    }
  };

  const handleEndEarly = () => {
    Alert.alert(
      'End this session?',
      "It won't be counted toward your streak or tally.",
      [
        { text: 'Keep going', style: 'cancel' },
        {
          text: 'End Early',
          style: 'destructive',
          onPress: async () => {
            await handleCancelSession();
          },
        },
      ],
    );
  };

  const handleCompleteSession = async () => {
    const sessionId = activeSessionId;

    if (sessionId === null) {
      await resetActiveSessionState();
      return;
    }

    const timing = buildSessionTiming();
    await resetActiveSessionState();

    try {
      await finishFocusLock(sessionId, { keepDistractions: true });
    } catch (error) {
      console.warn('Failed to collect iOS distractions:', error);
    }

    const previousCount = sessionCount;
    let nextCount = previousCount + 1;
    let distractionCount = 0;
    let distractionEvents: DistractionEventSummary[] = [];
    let lockdownMinutes = 0;
    let touchedApps: string[] = [];
    let nextShowingUpDays = showingUpDays || 1;
    let afterSessionAwayText: string | null = null;
    try {
      const completed = await completeSession(sessionId, timing);
      nextCount = completed.sessionCount;
      distractionCount = completed.distractionCount;
      distractionEvents = completed.events;
      lockdownMinutes = completed.lockdownMinutes;
      touchedApps = completed.touchedApps;
      nextShowingUpDays = completed.showingUpDays;
      afterSessionAwayText = await getPreviousSessionAwayDisplay(
        completed.sessionId,
      );
    } catch (error) {
      console.warn('Failed to complete session in database:', error);
    }
    setSessionCount(nextCount);
    setShowingUpDays(nextShowingUpDays);
    setCompletionSummary({
      previousSessionCount: previousCount,
      sessionCount: nextCount,
      distractionCount,
      distractionEvents,
      modeGracePeriodSeconds: activeMode.gracePeriodSeconds,
      lockdownMinutes,
      touchedApps,
      afterSessionAwayText,
    });

    getAppState(AWAY_TRACKING_PROMPTED_KEY)
      .then(prompted => {
        if (
          Platform.OS !== 'android' ||
          prompted === 'true' ||
          nextCount !== 1
        ) {
          return;
        }

        Alert.alert(
          'Track time away from flagged apps?',
          'Project ScaleUp can record when flagged apps are used on this device so it can show how long you stay away after sessions. Nothing leaves your phone.',
          [
            {
              text: 'Not now',
              style: 'cancel',
              onPress: () => {
                void setAppState(AWAY_TRACKING_PROMPTED_KEY, 'true');
              },
            },
            {
              text: 'Enable',
              onPress: () => {
                void setAppState(AWAY_TRACKING_PROMPTED_KEY, 'true');
                void setAwayTrackingEnabled(true).then(refreshAwayDisplay);
              },
            },
          ],
        );
      })
      .catch(error => console.warn('Failed to show away-time prompt:', error));

    const groupIndex = Math.floor(previousCount / TALLY_GROUP_SIZE);
    if (groupIndex < TALLY_GRID_SIZE) {
      const litCount = nextCount - groupIndex * TALLY_GROUP_SIZE;
      setRevealArmed(false);
      setRevealLitCount(litCount);
      setRevealIndex(groupIndex);
    }
  };

  const handleMoreModes = () => {
    onNavigate('paywall');
  };

  const suggestionMinutes = paidUser
    ? focusCoach?.suggestionMinutes ?? null
    : null;
  const handleSuggestionPress = () => {
    if (suggestionMinutes === null) {
      return;
    }

    setMinutes(suggestionMinutes);
    setSeconds(0);
  };

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

  if (completionSummary) {
    return (
      <PostSessionSummaryScreen
        previousSessionCount={completionSummary.previousSessionCount}
        sessionCount={completionSummary.sessionCount}
        distractionCount={completionSummary.distractionCount}
        distractionEvents={completionSummary.distractionEvents}
        modeGracePeriodSeconds={completionSummary.modeGracePeriodSeconds}
        lockdownMinutes={completionSummary.lockdownMinutes}
        touchedApps={completionSummary.touchedApps}
        afterSessionAwayText={completionSummary.afterSessionAwayText}
        onContinue={() => {
          setCompletionSummary(null);
          setRevealArmed(false);
          setRevealIndex(null);
        }}
      />
    );
  }

  if (pendingDurationSeconds !== null && remainingSeconds === null) {
    return (
      <PreSessionReadinessScreen
        durationSeconds={pendingDurationSeconds}
        modeName={preparedModeName ?? activeMode.tabLabel}
        onCancel={async () => {
          await PresenceModule.stop();
          sweepPresencePhotoCacheQuietly();
          setPreparedModeName(null);
          setPendingDurationSeconds(null);
        }}
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
            <ActiveSessionCameraPreview
              samplingActive={!isPaused && !awaitingEndChoice}
            />
          </View>

          <View style={styles.runningTimerWrap}>
            <RunningTimerDisplay remainingSeconds={remainingSeconds} />
          </View>

          <View style={styles.runningActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isPaused ? 'Resume session' : pauseButtonLabel
              }
              onPress={handlePauseToggle}
              disabled={pauseDisabled}
              style={({ pressed }) => [
                styles.pauseShell,
                pressed && !pauseDisabled && styles.pressed,
                pauseDisabled && styles.disabled,
              ]}
            >
              <View style={styles.pauseButton}>
                {isPaused ? <PlayIcon width={13} height={13} /> : <PauseGlyph />}
                <Text style={styles.pauseLabel}>
                  {pauseButtonLabel}
                </Text>
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="End session early"
              onPress={handleEndEarly}
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
                <Text style={styles.startLabel}>End Early</Text>
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
          <View accessibilityRole="tablist" style={styles.modeBar}>
            {!paidUser ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="More modes available"
                onPress={handleMoreModes}
                style={({ pressed }) => [
                  styles.moreModesButton,
                  pressed && styles.textPressed,
                ]}
              >
                <Text style={styles.moreModesIcon}>+</Text>
              </Pressable>
            ) : null}
            <ScrollView
              horizontal
              bounces={false}
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsContent}
              style={styles.tabsScroller}
            >
              {homeModes.map(mode => {
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
                      style={[
                        styles.tabLabel,
                        active && styles.activeTabLabel,
                      ]}
                    >
                      {mode.tabLabel}
                    </Text>
                    {active ? <View style={styles.activeIndicator} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <Animated.View
            style={[
              styles.adaptiveContent,
              modeContentStyle,
              { marginTop: timerGap },
            ]}
          >
            {suggestionMinutes !== null ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Use suggested ${suggestionMinutes} minute session`}
                onPress={handleSuggestionPress}
                style={({ pressed }) => [
                  styles.suggestionChip,
                  pressed && styles.textPressed,
                ]}
              >
                <Text style={styles.suggestionText}>
                  Suggested: {suggestionMinutes} min
                </Text>
              </Pressable>
            ) : null}
            <TimerSelector
              minutes={minutes}
              seconds={seconds}
              onMinutesChange={setMinutes}
              onSecondsChange={setSeconds}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Start ${activeMode.name} session`}
              onPress={handleStart}
              disabled={isPreparingPresence}
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
                <Text style={styles.startLabel}>
                  {isPreparingPresence ? 'Preparing...' : 'Start'}
                </Text>
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
            {awayDisplay.kind !== 'hidden' ? (
              <Text style={styles.awayLine}>
                Away from your flagged apps: {awayDisplay.text}
              </Text>
            ) : null}
          </Animated.View>

          <View style={[styles.tallySection, { marginTop: tallyGap }]}>
            <TallyCard
              sessionCount={sessionCount}
              showingUpDays={showingUpDays}
              revealIndex={revealIndex}
              revealLitCount={revealLitCount}
              revealArmed={revealArmed}
            />
          </View>
        </View>
      </ScrollView>
      <BottomNavigation bottomInset={insets.bottom} onSelect={onNavigate} />
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
    ...StyleSheet.absoluteFill,
  },
  cameraPreviewFeedHidden: {
    opacity: 0,
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
  modeBar: {
    width: '100%',
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
  },
  moreModesButton: {
    width: 40,
    height: 44,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  moreModesIcon: {
    color: colors.ink,
    fontSize: 29,
    lineHeight: 32,
    fontWeight: '500',
  },
  tabsScroller: {
    flex: 1,
    minWidth: 0,
  },
  tabsContent: {
    minHeight: 52,
    alignItems: 'center',
    paddingRight: 8,
  },
  tab: {
    minWidth: 108,
    height: 52,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabLabel: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '500',
  },
  activeTabLabel: { color: colors.ink, fontWeight: '700' },
  activeIndicator: {
    position: 'absolute',
    bottom: 5,
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
  disabled: { opacity: 0.55 },
  textPressed: { opacity: 0.55 },
  sessionMessage: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  awayLine: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  suggestionChip: {
    minHeight: 38,
    borderRadius: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: colors.module,
  },
  suggestionText: {
    color: colors.rewardAmber,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
});

function PauseGlyph() {
  return (
    <View style={styles.pauseGlyph} accessibilityElementsHidden>
      <View style={styles.pauseGlyphBar} />
      <View style={styles.pauseGlyphBar} />
    </View>
  );
}
