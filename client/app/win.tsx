import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BottomNav, TopHud } from '../src/components/Chrome';
import { ArtPanel, GameButton, ScreenFrame, TitleBanner } from '../src/components/Art';
import { useGameStore } from '../src/state/gameStore';
import { colors, type } from '../src/theme';

export default function WinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ levelId?: string; stars?: string }>();
  const levelId = Number(params.levelId) || 1;
  const stars = Math.max(1, Math.min(3, Number(params.stars) || 1));
  const startLevel = useGameStore((state) => state.startLevel);
  const setNotice = useGameStore((state) => state.setNotice);

  const continueGame = async () => {
    if (await startLevel(levelId + 1)) router.replace(`/game/${levelId + 1}` as never);
  };

  return (
    <ScreenFrame background="bgGame">
      <TopHud onAccount={() => router.push('/account')} />
      <TitleBanner title="VƯỢT ẢI" />
      <View style={styles.center}>
        <ArtPanel art="dialogPanel" style={styles.card}>
          <Text style={styles.subtitle}>VƯỢT ẢI THÀNH CÔNG</Text>
          <Text style={styles.stars}>{'★'.repeat(stars)}</Text>
          <Text style={styles.body}>Màn {levelId} đã hoàn thành</Text>
          <GameButton title="MÀN TIẾP THEO" onPress={() => void continueGame()} style={styles.button} />
          <GameButton title="VỀ TIÊN LỘ" onPress={() => router.replace('/map')} art="buttonSecondary" style={styles.button} />
        </ArtPanel>
      </View>
      <BottomNav active="map" onSelect={(id) => id === 'map' ? router.replace('/map') : setNotice('Sắp ra mắt')} />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 0, justifyContent: 'center', alignItems: 'center' },
  card: { width: '100%', maxWidth: 360, minHeight: 355, padding: 34, gap: 10 },
  subtitle: { ...type.heading, color: colors.ivory, textAlign: 'center' },
  stars: { color: colors.goldBright, fontSize: 55, textAlign: 'center', letterSpacing: -5 },
  body: { ...type.body, color: colors.ivory, textAlign: 'center' },
  button: { width: '100%', marginTop: 6 },
});
