import { warn } from './src/domain/releaseLog';
import { startAppRulesSync, syncRulesToNative } from './src/data/appRulesRepository';
import { useFonts } from 'expo-font';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Platform, StatusBar, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  getAppState,
  removeAppState,
  resetOnboardingProgress,
  setAppState,
} from './src/data/appStateRepository';
import { drainAwayLog, purgeOldAwayLog } from './src/domain/awayTime';
import { sweepPresencePhotoCacheQuietly } from './src/domain/frameCleanup';
import { reconcileScreenTime } from './src/domain/iosScreenTime';
import {
  getRequiredPermissionStatus,
  type RequiredPermissionStatus,
} from './src/domain/onboardingState';
import {
  DEV_FLAGS,
  TIER_SWITCHER_ENABLED,
  setTestTierOverride,
  type TestTierOverride,
} from './src/domain/paywall';
import { onLiveTimerOpen } from './src/domain/androidLiveTimer';
import { HomeScreen } from './src/screens/HomeScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { OnboardingFlow } from './src/screens/onboarding/OnboardingFlow';
import { PaywallProvider } from './src/components/PaywallProvider';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { colors } from './src/theme/tokens';

type AppScreen = 'home' | 'history' | 'settings';
type LaunchGate = 'loading' | 'onboarding' | 'permissions' | 'ready';

const ONBOARDING_COMPLETE_KEY = 'onboarding_complete';
const ONBOARDING_STEP_KEY = 'onboarding_step';
const TEST_TIER_OVERRIDE_KEY = 'test_tier_override';

function parseStoredTier(value: string | null): TestTierOverride {
  return value === 'free' || value === 'paid' ? value : null;
}

function App(): React.JSX.Element {
  const [fontsLoaded, fontError] = useFonts({
    Geist: require('./src/assets/fonts/Geist-Regular.ttf'),
    GeistSemiBold: require('./src/assets/fonts/Geist-SemiBold.ttf'),
  });
  const [activeScreen, setActiveScreen] = useState<AppScreen>('home');
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [gate, setGate] = useState<LaunchGate>('loading');
  const [tierReady, setTierReady] = useState(false);
  const [requiredPermissions, setRequiredPermissions] =
    useState<RequiredPermissionStatus | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const didApplyResetOnboardingRef = useRef(false);
  const launchGateRevision = useRef(0);
  const restartingOnboarding = useRef(false);

  useEffect(() => startAppRulesSync(), []);

  useEffect(() => onLiveTimerOpen(() => {
    setActiveScreen('home');
  }), []);

  useEffect(() => {
    sweepPresencePhotoCacheQuietly();
    purgeOldAwayLog().catch(error =>
      warn('Failed to purge old away-time rows:', error),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadTestTierOverride() {
      try {
        if (!TIER_SWITCHER_ENABLED) {
          setTestTierOverride(null);
          await removeAppState(TEST_TIER_OVERRIDE_KEY);
          return;
        }

        const stored = parseStoredTier(await getAppState(TEST_TIER_OVERRIDE_KEY));
        setTestTierOverride(stored);
      } catch (error) {
        warn('Failed to load test tier override:', error);
        setTestTierOverride(null);
      } finally {
        if (!cancelled) {
          setTierReady(true);
        }
      }
    }

    loadTestTierOverride();

    return () => {
      cancelled = true;
    };
  }, []);

  // iOS: a lock may have been due to change while the app was closed and the
  // system missed the wake-up, so check on launch and every return to the app.
  useEffect(() => {
    const reconcile = () =>
      reconcileScreenTime().catch(error =>
        warn('Failed to reconcile Screen Time locks:', error),
      );
    const checkGate = () => {
      evaluateLaunchGate(sessionActive).catch(error =>
        warn('Failed to evaluate onboarding gate:', error),
      );
    };
    const drainAway = () =>
      drainAwayLog().catch(error =>
        warn('Failed to drain away-time log:', error),
      );
    reconcile();
    checkGate();
    drainAway();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void syncRulesToNative();
        reconcile();
        checkGate();
        drainAway();
      }
    });
    return () => subscription.remove();
  }, [sessionActive]);

  useEffect(() => {
    if (!sessionActive) {
      evaluateLaunchGate(false).catch(error =>
        warn('Failed to evaluate onboarding gate:', error),
      );
    }
  }, [sessionActive]);

  const evaluateLaunchGate = async (hasActiveSession: boolean) => {
    const revision = ++launchGateRevision.current;
    if (
      Platform.OS !== 'android' &&
      !(Platform.OS === 'ios' && DEV_FLAGS.iosOnboardingPreview)
    ) {
      setGate('ready');
      return;
    }

    if (DEV_FLAGS.resetOnboarding && !didApplyResetOnboardingRef.current) {
      didApplyResetOnboardingRef.current = true;
      await setAppState(ONBOARDING_COMPLETE_KEY, 'false');
      await setAppState(ONBOARDING_STEP_KEY, 'welcome');
    }

    const [onboardingComplete, permissionStatus] = await Promise.all([
      getAppState(ONBOARDING_COMPLETE_KEY),
      getRequiredPermissionStatus(),
    ]);

    if (revision !== launchGateRevision.current) return;
    setRequiredPermissions(permissionStatus);

    if (onboardingComplete !== 'true') {
      setGate('onboarding');
      return;
    }

    if (!permissionStatus.all) {
      if (!hasActiveSession) {
        setGate('permissions');
      }
      return;
    }

    setGate('ready');
  };

  const restartOnboarding = async () => {
    if (!TIER_SWITCHER_ENABLED || Platform.OS !== 'android' || sessionActive || restartingOnboarding.current) return;
    restartingOnboarding.current = true;
    try {
      await resetOnboardingProgress();
      // Ignore a foreground permission check that began before the reset.
      launchGateRevision.current++;
      setActiveScreen('home');
      setSessionMessage(null);
      setGate('onboarding');
    } finally { restartingOnboarding.current = false; }
  };

  const completeOnboarding = async () => {
    await setAppState(ONBOARDING_STEP_KEY, 'done');
    await setAppState(ONBOARDING_COMPLETE_KEY, 'true');
    launchGateRevision.current++;
    setGate('ready');
  };

  const handleNavigate = (screen: string) => {
    if (screen === 'home' || screen === 'history' || screen === 'settings') {
      setActiveScreen(screen);
      return;
    }
  };

  if ((!fontsLoaded && !fontError) || gate === 'loading' || !tierReady) {
    return (
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <StatusBar
            barStyle="light-content"
            backgroundColor={colors.background}
          />
          <View style={styles.root} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (gate === 'onboarding') {
    return (
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <StatusBar
            barStyle="light-content"
            backgroundColor={colors.background}
          />
          <OnboardingFlow
            mode="onboarding"
            initialStatus={requiredPermissions}
            onComplete={completeOnboarding}
          />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <PaywallProvider>
          {/* Every tab stays mounted (hidden) so switching tabs never re-fetches
              from a blank state and flashes a loading spinner. */}
          <View style={[styles.root, activeScreen !== 'home' && styles.hidden]}>
            <HomeScreen
              isActive={activeScreen === 'home'}
              sessionMessage={sessionMessage}
              onNavigate={handleNavigate}
              onSessionActiveChange={setSessionActive}
              onStartSession={({ modeName, durationFormatted }) => {
                setSessionMessage(`${modeName} - ${durationFormatted}`);
              }}
            />
          </View>
          <View style={[styles.root, activeScreen !== 'history' && styles.hidden]}>
            <HistoryScreen
              isActive={activeScreen === 'history'}
              onNavigate={handleNavigate}
            />
          </View>
          <View style={[styles.root, activeScreen !== 'settings' && styles.hidden]}>
            <SettingsScreen
              isActive={activeScreen === 'settings'}
              onNavigate={handleNavigate}
              onRestartOnboarding={restartOnboarding}
              canRestartOnboarding={!sessionActive}
            />
          </View>
          {gate === 'permissions' ? (
            <View style={styles.gateOverlay}>
              <OnboardingFlow
                mode="gate"
                initialStatus={requiredPermissions}
                onPermissionsReady={() => setGate('ready')}
              />
            </View>
          ) : null}
        </PaywallProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  hidden: { display: 'none' },
  gateOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.background,
  },
});

export default App;
