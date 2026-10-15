import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { GameButton, ScreenFrame } from '../src/components/Art';
import { colors, type } from '../src/theme';
import { useGameStore } from '../src/state/gameStore';

export default function BootScreen() {
  const router = useRouter();
  const initialized = useGameStore(state => state.initialized);
  const bootstrapLoaded = useGameStore(state => state.bootstrapLoaded);
  const online = useGameStore(state => state.online);
  const foreground = useGameStore(state => state.foreground);
  const error = useGameStore(state => state.bootError);
  const authRequired = useGameStore(state => state.authRequired);
  const checking = useGameStore(state => state.checkingConnection);
  const initialize = useGameStore(state => state.initialize);
  const navigating = useRef(false);
  const ready = initialized && online && foreground && !checking && !authRequired;
  useFocusEffect(useCallback(() => { navigating.current = false; }, []));

  useEffect(() => {
    // Finish startup if iOS briefly became inactive while opening the app.
    // Once initialized (or showing an error), resume never starts a health check.
    if (foreground && !initialized && !error && !checking) void initialize().catch(() => undefined);
  }, [foreground, initialized, error, checking, initialize]);

  const play = () => {
    if (!ready || navigating.current) return;
    navigating.current = true;
    router.replace('/map');
  };
  const saveProgress = () => {
    if (!bootstrapLoaded || !foreground || checking || navigating.current) return;
    navigating.current = true;
    router.push({ pathname: '/account', params: { source: 'welcome' } });
  };
  useEffect(() => {
    const bridge = (globalThis as any).__swordAcceptance;
    if (!__DEV__ || !bridge) return;
    bridge.welcome = { play, saveProgress };
    return () => { delete bridge.welcome; };
  });

  return (
    <ScreenFrame background="bgWelcome">
      <View style={styles.content}>
        <View accessible accessibilityRole="header" accessibilityLabel="Kiếm Khai Tiên Lộ" style={styles.artTitle} />
        <View style={styles.actions}>
          <Text accessibilityRole={error ? 'alert' : undefined} style={styles.subtitle}>
            {error || (!ready ? 'Đang mở tiên lộ…' : ' ')}
          </Text>
          <GameButton title="CHƠI" disabled={!ready} onPress={play} style={styles.action} />
          <GameButton title="LƯU TIẾN TRÌNH" art="buttonSecondary" textStyle={bootstrapLoaded && foreground && !checking ? styles.secondaryText : undefined} disabled={!bootstrapLoaded || !foreground || checking} onPress={saveProgress} style={styles.action} />
          {error && !authRequired ? <GameButton title={checking ? 'ĐANG KẾT NỐI…' : 'THỬ LẠI'} art="buttonSecondary" textStyle={styles.secondaryText} disabled={checking || !foreground} onPress={() => void initialize().catch(() => undefined)} style={styles.action} /> : null}
        </View>
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 24 },
  artTitle: { position: 'absolute', top: '10%', width: '100%', height: '18%' },
  actions: { width: '100%', maxWidth: 320, gap: 12, alignItems: 'center' },
  action: { width: '100%', minHeight: 52 },
  secondaryText: { color: colors.ivory },
  subtitle: { ...type.caption, color: colors.ivory, textAlign: 'center', textShadowColor: colors.inkDeep, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
});
