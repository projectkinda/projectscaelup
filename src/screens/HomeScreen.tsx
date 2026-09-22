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
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PlayIcon from '../assets/icons/play.svg';
import { BottomNavigation } from '../components/BottomNavigation';
import { RunningTimerDisplay } from '../components/RunningTimerDisplay';
import { TallyCard } from '../components/TallyCard';
import { TimerSelector } from '../components/TimerSelector';
import { HOME_MODES } from '../domain/sessionModes';
import { colors, layout } from '../theme/tokens';

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
  const [hours, setHours] = useState(1);
  const [minutes, setMinutes] = useState(25);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const tabProgress = useRef(new Animated.Value(0)).current;
  const contentProgress = useRef(new Animated.Value(1)).current;

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
    if (remainingSeconds === null || isPaused || remainingSeconds <= 0) {
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
  }, [isPaused, remainingSeconds]);

  const handleStart = () => {
    const durationSeconds = hours * 60 + minutes;
    if (durationSeconds === 0) {
      Alert.alert(
        'Set a focus time',
        'Swipe either timer module before starting.',
      );
      return;
    }

    onStartSession({
      modeId: activeMode.id,
      modeName: activeMode.name,
      durationMinutes: Math.ceil(durationSeconds / 60),
    });
    setRemainingSeconds(durationSeconds);
    setIsPaused(false);
  };

  const handleFinish = () => {
    setRemainingSeconds(null);
    setIsPaused(false);
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
              <Text style={styles.cameraPreviewText}>Camera preview</Text>
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
              onPress={handleFinish}
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
            <TallyCard sessionCount={7} />
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
    backgroundColor: '#E1E1E1',
  },
  cameraPreviewText: {
    width: 50,
    color: '#000000',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '500',
    textAlign: 'center',
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#333333',
    backgroundColor: '#EAEDF1',
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
