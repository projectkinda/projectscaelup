import React, { useState } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HomeScreen } from './src/screens/HomeScreen';

function App(): React.JSX.Element {
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        <HomeScreen
          sessionMessage={sessionMessage}
          onStartSession={({ modeName, durationMinutes }) => {
            setSessionMessage(`${modeName} - ${durationMinutes} min`);
          }}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

export default App;
