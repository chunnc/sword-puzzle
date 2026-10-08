import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, Platform, StatusBar, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useGameStore } from '../src/state/gameStore';
import { ConnectionDialog } from '../src/components/ConnectionDialog';
import { colors } from '../src/theme';

export default function RootLayout() {
  const initialized = useGameStore(s => s.initialized);
  const bootstrapLoaded = useGameStore(s => s.bootstrapLoaded);
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
    let stopped = false;
    const run = () => { if (!stopped && AppState.currentState === 'active') void useGameStore.getState().checkConnection(); };
    const timer = setInterval(run, 5000);
    const subscription = AppState.addEventListener('change', state => {
      useGameStore.getState().setForeground(state === 'active');
      if (state === 'active') run();
    });
    return () => { stopped = true; clearInterval(timer); subscription.remove(); };
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
        }}>
          <Stack.Screen name="index" />
          <Stack.Protected guard={initialized}>
            <Stack.Screen name="map" />
            <Stack.Screen name="game/[levelId]" />
            <Stack.Screen name="character" />
            <Stack.Screen name="inventory" />
            <Stack.Screen name="shop" />
          </Stack.Protected>
          <Stack.Protected guard={bootstrapLoaded}>
            <Stack.Screen name="account" />
          </Stack.Protected>
        </Stack>
        <ConnectionDialog />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1, backgroundColor: colors.ink } });
