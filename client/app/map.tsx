import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { ART, Artwork } from '../src/assets';
import { BottomNav, TopHud } from '../src/components/Chrome';
import { ArtPanel, ScreenFrame } from '../src/components/Art';
import { Notice } from '../src/components/Notice';
import { getHighestUnlocked, getLevelStars, useGameStore } from '../src/state/gameStore';
import { colors, type } from '../src/theme';

export default function MapScreen() {
  const router = useRouter();
  const save = useGameStore((state) => state.save);
  const notice = useGameStore((state) => state.notice);
  const setNotice = useGameStore((state) => state.setNotice);
  const startLevel = useGameStore((state) => state.startLevel);
  const unlocked = getHighestUnlocked(save);
  const totalStars = save.levels.reduce((sum, level) => sum + level.stars, 0);

  const openLevel = async (levelId: number) => {
    if (await startLevel(levelId)) router.push(`/game/${levelId}` as never);
  };
  const nav = (id: string) => {
    if (id !== 'map') {
      setNotice('Sắp ra mắt');
      return;
    }
  };

  return (
    <ScreenFrame background="bgMap">
      <TopHud onAccount={() => router.push('/account')} />
      <View style={styles.mapArea}>
        <ArtPanel art="chapterCard" style={styles.chapter}>
          <Text style={styles.chapterEyebrow}>CHƯƠNG THỬ NGHIỆM</Text>
          <Text style={styles.chapterName}>VÂN HẢI{ '\n' }TIÊN SƠN</Text>
          <Text style={styles.chapterStars}>{totalStars}/9 ★</Text>
        </ArtPanel>
        {[1, 2, 3].map((levelId) => {
          const stars = getLevelStars(save, levelId);
          const current = stars === 0 && levelId === unlocked;
          const art: Artwork = stars > 0 ? 'stageDone' : current ? 'stageCurrent' : 'stageLocked';
          const position = levelId === 1 ? styles.stageOne : levelId === 2 ? styles.stageTwo : styles.stageThree;
          return (
            <Pressable
              key={levelId}
              accessibilityRole="button"
              accessibilityLabel={`Màn ${levelId}${stars > 0 ? `, ${stars} sao` : current ? ', màn hiện tại' : ', đã khóa'}`}
              accessibilityState={{ disabled: levelId > unlocked }}
              disabled={levelId > unlocked}
              onPress={() => void openLevel(levelId)}
              style={[styles.stage, position]}
            >
              <Image source={ART[art]} contentFit="contain" style={StyleSheet.absoluteFill} />
              <Text style={styles.stageNumber}>{levelId}</Text>
              {stars > 0 ? <Text style={styles.stageStars}>{'★'.repeat(stars)}</Text> : null}
            </Pressable>
          );
        })}
      </View>
      <BottomNav active="map" onSelect={nav} />
      <Notice message={notice} onDismiss={() => setNotice('')} />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  mapArea: { flex: 1, minHeight: 0, position: 'relative' },
  chapter: {
    position: 'absolute',
    top: 8,
    right: 0,
    zIndex: 2,
    width: 112,
    height: 154,
    paddingHorizontal: 12,
  },
  chapterEyebrow: { color: '#72512d', textAlign: 'center', fontSize: 9, fontWeight: '700' },
  chapterName: { color: '#392b1d', textAlign: 'center', fontSize: 15, fontWeight: '900', marginTop: 7 },
  chapterStars: { color: '#98702e', fontSize: 12, fontWeight: '800', marginTop: 7 },
  stage: { position: 'absolute', width: 62, height: 74, justifyContent: 'center', alignItems: 'center' },
  stageOne: { left: '43%', bottom: '7%' },
  stageTwo: { left: '28%', bottom: '38%' },
  stageThree: { left: '50%', bottom: '67%' },
  stageNumber: { color: colors.ivory, fontSize: 26, fontWeight: '900', textShadowColor: '#102f2d', textShadowRadius: 5 },
  stageStars: { position: 'absolute', bottom: -3, color: colors.goldBright, fontSize: 10, letterSpacing: -1 },
});
