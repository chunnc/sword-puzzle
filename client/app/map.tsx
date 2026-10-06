import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { ART, Artwork } from '../src/assets';
import { BottomNav, TopHud } from '../src/components/Chrome';
import { ArtPanel, ScreenFrame } from '../src/components/Art';
import { Notice } from '../src/components/Notice';
import { LEVEL_COUNT, getLevel } from '../src/game/levels';
import { navigateTab, type BottomNavId } from '../src/components/Navigation';
import { getHighestUnlocked, getLevelStars, getLevelCompleted, useGameStore } from '../src/state/gameStore';
import { colors, type } from '../src/theme';

const levelIds = Array.from({ length: LEVEL_COUNT }, (_, index) => index + 1);

export default function MapScreen() {
  const router = useRouter();
  const save = useGameStore((state) => state.save);
  const notice = useGameStore((state) => state.notice);
  const setNotice = useGameStore((state) => state.setNotice);
  const startLevel = useGameStore((state) => state.startLevel);
  const unlocked = getHighestUnlocked(save);
  const totalStars = save.profile.levels.reduce((sum, level) => sum + level.stars, 0);

  const openLevel = async (levelId: number) => {
    if (await startLevel(levelId)) router.push(`/game/${levelId}` as never);
  };
  const nav = (id: BottomNavId) => navigateTab(router, id);

  return (
    <ScreenFrame background="bgMap">
      <TopHud onAccount={() => router.push('/account')} />
      <View style={styles.mapArea}>
        <FlatList
          data={levelIds}
          inverted
          keyExtractor={(levelId) => String(levelId)}
          style={StyleSheet.absoluteFill}
          contentContainerStyle={styles.levelListContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: levelId }) => {
            const stars = getLevelStars(save, levelId);
            const locked = levelId > unlocked;
            const completed = getLevelCompleted(save, levelId);
            const current = !locked && !completed;
            const art: Artwork = completed ? 'stageDone' : locked ? 'stageLocked' : 'stageCurrent';

            return (
              <View style={styles.levelItem}>
                <View pointerEvents="none" style={styles.starArc}>
                  {[0, 1, 2].map((starIndex) => (
                    <Image
                      key={starIndex}
                      source={starIndex < stars ? ART.starBright : ART.starGray}
                      contentFit="contain"
                      style={[
                        styles.starIcon,
                        starIndex === 0 && styles.starLeft,
                        starIndex === 1 && styles.starTop,
                        starIndex === 2 && styles.starRight,
                      ]}
                    />
                  ))}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Màn ${levelId}${completed ? `, đã hoàn thành, ${stars} sao` : current ? ', màn hiện tại' : ', đã khóa'}`}
                  accessibilityState={{ disabled: locked }}
                  disabled={locked}
                  onPress={() => void openLevel(levelId)}
                  style={styles.stage}
                >
                  <Image
                    source={ART[art]}
                    contentFit="contain"
                    style={[StyleSheet.absoluteFill, locked && styles.lockedStageArt]}
                  />
                  <Text style={[styles.stageNumber, locked && styles.lockedStageNumber]}>{levelId}</Text>
                  {completed && stars === 0 ? <Text style={{ color: '#fff2c9', position: 'absolute', bottom: 7, fontSize: 11 }}>✓ VƯỢT ẢI</Text> : null}
                </Pressable>
              </View>
            );
          }}
        />
        <ArtPanel art="chapterCard" style={styles.chapter}>
          <Text style={styles.chapterEyebrow}>TIÊN LỘ · 40 MÀN</Text>
          <Text style={styles.chapterName}>{getLevel(unlocked).chapter.toUpperCase()}</Text>
          <Text style={styles.chapterStars}>{totalStars}/120 ★</Text>
        </ArtPanel>
      </View>
      <BottomNav active="map" onSelect={nav} />
      <Notice message={notice} onDismiss={() => setNotice('')} />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  mapArea: { flex: 1, minHeight: 0, position: 'relative' },
  levelListContent: { flexGrow: 1, alignItems: 'center', paddingTop: 12, paddingBottom: 174 },
  levelItem: { width: 100, height: 112, alignItems: 'center', marginVertical: 6 },
  starArc: { width: 84, height: 28, position: 'relative' },
  starIcon: { position: 'absolute', width: 24, height: 24 },
  starLeft: { left: 0, bottom: 0, transform: [{ rotate: '-16deg' }] },
  starTop: { left: 30, top: 0 },
  starRight: { right: 0, bottom: 0, transform: [{ rotate: '16deg' }] },
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
  stage: { width: 84, height: 84, justifyContent: 'center', alignItems: 'center' },
  lockedStageArt: { tintColor: '#8f9699' },
  stageNumber: { color: colors.ivory, fontSize: 26, fontWeight: '900', textShadowColor: '#102f2d', textShadowRadius: 5 },
  lockedStageNumber: { color: '#c0c4c6' },
});
