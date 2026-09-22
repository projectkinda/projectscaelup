import React, { useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { BottomNavigation } from './src/components/BottomNavigation';
import { HomeScreen } from './src/screens/HomeScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { colors, layout } from './src/theme/tokens';

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

function SettingsScreen({
  onNavigate,
}: {
  onNavigate: (screen: string) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.placeholderScreen}>
      <View style={styles.placeholderContent}>
        <Text style={styles.placeholderTitle}>Settings</Text>
      </View>
      <BottomNavigation
        activeItem="settings"
        bottomInset={insets.bottom}
        onSelect={onNavigate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  placeholderScreen: { flex: 1, backgroundColor: colors.background },
  placeholderContent: {
    flex: 1,
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.horizontalPadding,
    paddingTop: 74,
  },
  placeholderTitle: {
    color: colors.ink,
    fontSize: 31,
    lineHeight: 38,
    fontWeight: '700',
  },
});

export default App;
