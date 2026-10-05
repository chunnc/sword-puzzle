import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenFrame } from '../src/components/Art';
import { colors, type } from '../src/theme';
import { useGameStore } from '../src/state/gameStore';

export default function BootScreen() {
  const router = useRouter();
  const initialize = useGameStore((state) => state.initialize);

  useEffect(() => {
    let active = true;
    void initialize().then((route) => {
      if (active) router.replace(route as never);
    });
    return () => { active = false; };
  }, [initialize, router]);

  return (
    <ScreenFrame background="bgMap" tint="rgba(2, 26, 32, 0.3)">
      <View style={styles.content}>
        <Text style={styles.title}>KIẾM KHAI TIÊN LỘ</Text>
        <Text style={styles.subtitle}>Đang mở tiên lộ…</Text>
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { ...type.title, color: colors.ivory, fontSize: 27, textAlign: 'center' },
  subtitle: { ...type.body, color: colors.goldBright, marginTop: 12 },
});
