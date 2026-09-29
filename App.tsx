import React, { useEffect, useRef, useState } from 'react';
import { AppState, Platform, StatusBar, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getAppState, setAppState } from './src/data/appStateRepository';
import { sweepPresencePhotoCacheQuietly } from './src/domain/frameCleanup';
import { reconcileScreenTime } from './src/domain/iosScreenTime';
import {
  getRequiredPermissionStatus,
  type RequiredPermissionStatus,
} from './src/domain/onboardingState';
import { DEV_FLAGS } from './src/domain/paywall';
import { HomeScreen } from './src/screens/HomeScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { OnboardingFlow } from './src/screens/onboarding/OnboardingFlow';
import { PaywallStubScreen } from './src/screens/PaywallStubScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { colors } from './src/theme/tokens';

type AppScreen = 'home' | 'history' | 'settings' | 'paywall';
type MainScreen = Exclude<AppScreen, 'paywall'>;
type LaunchGate = 'loading' | 'onboarding' | 'permissions' | 'ready';

const ONBOARDING_COMPLETE_KEY = 'onboarding_complete';
const ONBOARDING_STEP_KEY = 'onboarding_step';

function App(): React.JSX.Element {
  const [activeScreen, setActiveScreen] = useState<AppScreen>('home');
  const [paywallReturnScreen, setPaywallReturnScreen] =
    useState<MainScreen>('home');
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [gate, setGate] = useState<LaunchGate>('loading');
  const [requiredPermissions, setRequiredPermissions] =
    useState<RequiredPermissionStatus | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const didApplyResetOnboardingRef = useRef(false);

  useEffect(() => {
    sweepPresencePhotoCacheQuietly();
  }, []);

  // iOS: a lock may have been due to change while the app was closed and the
  // system missed the wake-up, so check on launch and every return to the app.
  useEffect(() => {
    const reconcile = () =>
      reconcileScreenTime().catch(error =>
        console.warn('Failed to reconcile Screen Time locks:', error),
      );
    const checkGate = () => {
      evaluateLaunchGate(sessionActive).catch(error =>
        console.warn('Failed to evaluate onboarding gate:', error),
      );
    };
    reconcile();
    checkGate();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        reconcile();
        checkGate();
      }
    });
    return () => subscription.remove();
  }, [sessionActive]);

  useEffect(() => {
    if (!sessionActive) {
      evaluateLaunchGate(false).catch(error =>
        console.warn('Failed to evaluate onboarding gate:', error),
      );
    }
  }, [sessionActive]);

  const evaluateLaunchGate = async (hasActiveSession: boolean) => {
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

  const completeOnboarding = async () => {
    await setAppState(ONBOARDING_STEP_KEY, 'done');
    await setAppState(ONBOARDING_COMPLETE_KEY, 'true');
    setGate('ready');
  };

  const handleNavigate = (screen: string) => {
    if (screen === 'home' || screen === 'history' || screen === 'settings') {
      setActiveScreen(screen);
      setPaywallReturnScreen(screen);
      return;
    }

    if (screen === 'paywall') {
      if (activeScreen !== 'paywall') {
        setPaywallReturnScreen(activeScreen);
      }
      setActiveScreen('paywall');
    }
  };

  if (gate === 'loading') {
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
          />
        </View>
        {activeScreen === 'paywall' ? (
          <PaywallStubScreen
            onDismiss={() => setActiveScreen(paywallReturnScreen)}
          />
        ) : null}
        {gate === 'permissions' ? (
          <View style={styles.gateOverlay}>
            <OnboardingFlow
              mode="gate"
              initialStatus={requiredPermissions}
              onPermissionsReady={() => setGate('ready')}
            />
          </View>
        ) : null}
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
