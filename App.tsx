import React, { useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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
