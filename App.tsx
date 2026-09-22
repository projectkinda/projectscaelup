import React, { useState } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HomeScreen } from './src/screens/HomeScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

type AppScreen = 'home' | 'history' | 'settings';

function App(): React.JSX.Element {
  const [activeScreen, setActiveScreen] = useState<AppScreen>('home');
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const handleNavigate = (screen: string) => {
    if (screen === 'home' || screen === 'history' || screen === 'settings') {
      setActiveScreen(screen);
    }
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        {activeScreen === 'history' ? (
          <HistoryScreen onNavigate={handleNavigate} />
        ) : activeScreen === 'settings' ? (
          <SettingsScreen onNavigate={handleNavigate} />
        ) : (
          <HomeScreen
            sessionMessage={sessionMessage}
            onNavigate={handleNavigate}
            onStartSession={({ modeName, durationMinutes }) => {
              setSessionMessage(`${modeName} - ${durationMinutes} min`);
            }}
          />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

export default App;
