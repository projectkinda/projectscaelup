import React, { useEffect, useState } from 'react';
import { AppState, StatusBar, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { reconcileScreenTime } from './src/domain/iosScreenTime';
import { HomeScreen } from './src/screens/HomeScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { PaywallStubScreen } from './src/screens/PaywallStubScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { colors } from './src/theme/tokens';

type AppScreen = 'home' | 'history' | 'settings' | 'paywall';
type MainScreen = Exclude<AppScreen, 'paywall'>;

function App(): React.JSX.Element {
  const [activeScreen, setActiveScreen] = useState<AppScreen>('home');
  const [paywallReturnScreen, setPaywallReturnScreen] =
    useState<MainScreen>('home');
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  // iOS: a lock may have been due to change while the app was closed and the
  // system missed the wake-up, so check on launch and every return to the app.
  useEffect(() => {
    const reconcile = () =>
      reconcileScreenTime().catch(error =>
        console.warn('Failed to reconcile Screen Time locks:', error),
      );
    reconcile();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        reconcile();
      }
    });
    return () => subscription.remove();
  }, []);

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

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        {/* Home stays mounted (hidden) so an active session keeps running across tabs. */}
        <View style={[styles.root, activeScreen !== 'home' && styles.hidden]}>
          <HomeScreen
            isActive={activeScreen === 'home'}
            sessionMessage={sessionMessage}
            onNavigate={handleNavigate}
            onStartSession={({ modeName, durationFormatted }) => {
              setSessionMessage(`${modeName} - ${durationFormatted}`);
            }}
          />
        </View>
        {activeScreen === 'paywall' ? (
          <PaywallStubScreen
            onDismiss={() => setActiveScreen(paywallReturnScreen)}
          />
        ) : activeScreen === 'history' ? (
          <HistoryScreen onNavigate={handleNavigate} />
        ) : activeScreen === 'settings' ? (
          <SettingsScreen onNavigate={handleNavigate} />
        ) : null}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  hidden: { display: 'none' },
});

export default App;
