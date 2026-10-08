import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { GameButton, ScreenFrame } from '../src/components/Art';
import { colors, type } from '../src/theme';
import { useGameStore } from '../src/state/gameStore';

export default function BootScreen() {
  const router = useRouter();
  const initialized = useGameStore(state => state.initialized);
  const error = useGameStore(state => state.bootError);
  const authRequired = useGameStore(state => state.authRequired);
  const checking = useGameStore(state => state.checkingConnection);
  const initialize = useGameStore(state => state.initialize);

  useEffect(() => {
    void initialize().catch(() => undefined);
  }, [initialize]);

  useEffect(() => {
    if (initialized) router.replace('/map');
  }, [initialized, router]);

  return (
    <ScreenFrame background="bgMap" tint="rgba(2, 26, 32, 0.3)">
      <View style={styles.content}>
        <Text style={styles.title}>KIẾM KHAI TIÊN LỘ</Text>
        <Text accessibilityRole={error ? 'alert' : undefined} style={styles.subtitle}>
          {error || 'Đang mở tiên lộ…'}
        </Text>
        {error ? <GameButton title={checking ? 'ĐANG KẾT NỐI…' : 'THỬ LẠI'} disabled={checking} onPress={() => void initialize().catch(() => undefined)} /> : null}
        {authRequired ? <GameButton title="KHÔI PHỤC HỒ SƠ" onPress={() => router.push('/account')} /> : null}
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  title: { ...type.title, color: colors.ivory, fontSize: 27, textAlign: 'center' },
  subtitle: { ...type.body, color: colors.goldBright, marginTop: 12 },
});
