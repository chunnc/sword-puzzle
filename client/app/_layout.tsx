import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, Platform, StatusBar, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useGameStore } from '../src/state/gameStore';
import { colors } from '../src/theme';

export default function RootLayout() {
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    let active = true;
    let preferenceChanged = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      preferenceChanged = true;
      setReduceMotion(enabled);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active && !preferenceChanged) setReduceMotion(enabled);
    }).catch(() => {
      // Keep transitions disabled if the accessibility preference cannot be read.
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

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
        <Stack screenOptions={{
          headerShown: false,
          animation: reduceMotion ? 'none' : 'fade',
          animationTypeForReplace: 'push',
          animationDuration: Platform.OS === 'ios' ? 150 : undefined,
          contentStyle: { backgroundColor: colors.ink },
          gestureEnabled: false,
        }} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1, backgroundColor: colors.ink } });
