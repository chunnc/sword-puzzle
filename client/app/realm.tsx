import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ART } from '../src/assets';
import { BottomNav, TopHud } from '../src/components/Chrome';
import { GameButton, ProgressBar, ScreenFrame, TitleBanner } from '../src/components/Art';
import { colors, type } from '../src/theme';
import { useGameStore } from '../src/state/gameStore';

export default function RealmScreen() {
  const router = useRouter();
  const setNotice = useGameStore((state) => state.setNotice);

  return (
    <ScreenFrame background="bgRealm">
      <TopHud onAccount={() => router.push('/account')} />
      <TitleBanner title="ĐỘT PHÁ" />
      <View style={styles.realmLabels}>
        <Text style={styles.realmName}>LUYỆN KHÍ</Text>
        <Text style={styles.arrow}>»</Text>
        <Text style={styles.realmName}>TRÚC CƠ</Text>
      </View>
      <View style={styles.heroSpace}>
        <Image source={ART.cultivator} contentFit="contain" style={styles.hero} />
      </View>
      <View style={styles.realmBottom}>
        <ProgressBar portion={1} color="blue" />
        <Text style={styles.gauge}>3/3 · Linh khí viên mãn</Text>
        <Text style={styles.body}>Một vùng đất mới đang chờ phía trước</Text>
        <GameButton title="ĐỘT PHÁ" onPress={() => router.replace('/map')} style={styles.action} />
      </View>
      <BottomNav active="cultivation" onSelect={(id) => id === 'map' ? router.replace('/map') : setNotice('Sắp ra mắt')} />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  realmLabels: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  realmName: { ...type.heading, color: colors.ivory, fontSize: 14, backgroundColor: 'rgba(5, 43, 47, 0.72)', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  arrow: { color: colors.goldBright, fontSize: 31, fontWeight: '800' },
  heroSpace: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  hero: { width: '100%', height: '100%' },
  realmBottom: { minHeight: 145, alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: 'rgba(4, 43, 47, 0.77)', borderColor: colors.gold, borderWidth: 1, borderRadius: 18 },
  gauge: { color: colors.ivory, fontSize: 12 },
  body: { ...type.caption, color: colors.textMuted, textAlign: 'center' },
  action: { width: 200, height: 52 },
});
