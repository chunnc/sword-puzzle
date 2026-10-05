import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { useEffect } from 'react';
import { AppState, StatusBar, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useGameStore } from '../src/state/gameStore';

export default function RootLayout() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delaySeconds = 5;
    let stopped = false;

    const scheduleSync = (delay: number) => {
      if (timer) clearTimeout(timer);
      if (!stopped) timer = setTimeout(runSync, delay * 1000);
    };
    const runSync = async () => {
      await useGameStore.getState().syncProgress();
      delaySeconds = useGameStore.getState().online ? 30 : Math.min(delaySeconds * 2, 300);
      scheduleSync(delaySeconds);
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        delaySeconds = 5;
        scheduleSync(0);
      }
    });
    scheduleSync(5);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <StatusBar hidden />
        <Stack screenOptions={{ headerShown: false, animation: 'none', gestureEnabled: false }} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
