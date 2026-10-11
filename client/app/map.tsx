import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { ART, type Artwork } from '../src/assets';
import { BottomNav, TopHud } from '../src/components/Chrome';
import { ArtPanel, ScreenFrame } from '../src/components/Art';
import { Notice } from '../src/components/Notice';
import { CONTENT, type MapSummary } from '../src/game/domain';
import { navigateTab, type BottomNavId } from '../src/components/Navigation';
import { getHighestUnlocked, getLevelStars, getLevelCompleted, useGameStore } from '../src/state/gameStore';
import { useSfxPress } from '../src/audio/useSfxPress';
import { colors } from '../src/theme';

const mapKey = (map: MapSummary) => String(map.id);

const MapLevelItem = React.memo(function MapLevelItem({ levelId, difficulty, stars, completed, locked, onOpen }: {
  levelId: number;
  difficulty: MapSummary['difficulty'];
  stars: number;
  completed: boolean;
  locked: boolean;
  onOpen: (levelId: number) => Promise<void>;
}) {
  const sfxPress = useSfxPress();
  const current = !locked && !completed;
  const difficultyName = difficulty ? { easy: 'Dễ', medium: 'Vừa', hard: 'Khó', 'very-hard': 'Rất khó' }[difficulty] : '';
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
        accessibilityLabel={`Màn ${levelId}${difficultyName ? `, ${difficultyName}` : ''}${completed ? `, đã hoàn thành, ${stars} sao` : current ? ', màn hiện tại' : ', đã khóa'}`}
        accessibilityState={{ disabled: locked }}
        disabled={locked}
        onPress={sfxPress(() => void onOpen(levelId), !locked)}
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
      {difficultyName ? <Text style={styles.difficulty}>{difficultyName}</Text> : null}
    </View>
  );
});

export default function MapScreen() {
  const sfxPress = useSfxPress();
  const router = useRouter();
  const chapterId = useGameStore(state => state.chapterId);
  const maps = useGameStore(state => state.chapterMaps);
  const loading = useGameStore(state => state.chapterLoading);
  const chapterError = useGameStore(state => state.chapterError);
  const selectChapter = useGameStore(state => state.selectChapter);
  const chapters = CONTENT.chapters ?? [];
  const chapter = chapters.find(ch => ch.id === chapterId);
  const chapterMaps = useMemo(() => maps.filter(map => map.chapterId === chapterId), [maps, chapterId]);
  const save = useGameStore((state) => state.save);
  const notice = useGameStore((state) => state.notice);
  const setNotice = useGameStore((state) => state.setNotice);
  const startLevel = useGameStore((state) => state.startLevel);
  const unlocked = getHighestUnlocked(save);
  const totalStars = save.profile.levels.filter(level => !chapter || level.levelId >= chapter.firstLevelId && level.levelId <= chapter.lastLevelId).reduce((sum, level) => sum + level.stars, 0);
  const opening = useRef(false);
  const focused = useRef(false);
  const pendingNavigation = useRef<number | null>(null);
  const foreground = useGameStore(state => state.foreground);
  useEffect(() => {
    if (foreground && pendingNavigation.current !== null) {
      const id=pendingNavigation.current;pendingNavigation.current=null;
      router.push(`/game/${id}` as never);
    }
  }, [foreground, router]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    const state = useGameStore.getState();
    if (state.chapterId) void state.selectChapter(state.chapterId).catch(() => undefined);
    return () => { focused.current=false;pendingNavigation.current=null; };
  }, []));

  const openLevel = useCallback(async (levelId: number) => {
    if (opening.current) return;
    opening.current = true;
    try {
      if (await startLevel(levelId)) {
        if (!focused.current) return;
        if (useGameStore.getState().foreground) router.push(`/game/${levelId}` as never);
        else pendingNavigation.current=levelId;
      }
    } finally { opening.current = false; }
  }, [startLevel, router]);
  const renderLevel = useCallback(({ item }: { item: MapSummary }) => (
    <MapLevelItem levelId={item.id} difficulty={item.difficulty} stars={getLevelStars(save, item.id)}
      completed={getLevelCompleted(save, item.id)} locked={item.id > unlocked} onOpen={openLevel} />
  ), [save, unlocked, openLevel]);
  const nav = (id: BottomNavId) => navigateTab(router, id);

  return (
    <ScreenFrame background="bgMap">
      <TopHud onAccount={() => router.push('/account')} />
      {chapters.length ? <View style={styles.chapterTabs}>
        {chapters.map(ch => <Pressable key={ch.id} accessibilityRole="button" accessibilityLabel={ch.name}
          accessibilityState={{ selected: ch.id === chapterId, disabled: loading || ch.firstLevelId > unlocked }}
          disabled={loading || ch.firstLevelId > unlocked} onPress={sfxPress(() => void selectChapter(ch.id).catch(() => undefined), !loading && ch.firstLevelId <= unlocked)}
          style={[styles.chapterTab, ch.id === chapterId && styles.chapterTabActive, ch.firstLevelId > unlocked && { opacity: .4 }]}>
          <Text style={styles.chapterTabText}>Chương {ch.order}</Text>
        </Pressable>)}
      </View> : null}
      <View style={styles.mapArea}>
        {loading ? <Text accessibilityLiveRegion="polite" style={styles.status}>Đang tải chương…</Text> : null}
        {chapterError ? <Pressable accessibilityRole="button" onPress={sfxPress(() => void selectChapter(chapterId, { force: true }).catch(() => undefined))}><Text style={styles.status}>{chapterError} · Thử lại</Text></Pressable> : null}
        <FlatList
          data={chapterMaps}
          inverted
          keyExtractor={mapKey}
          style={StyleSheet.absoluteFill}
          contentContainerStyle={styles.levelListContent}
          showsVerticalScrollIndicator={false}
          renderItem={renderLevel}
        />
        <ArtPanel art="chapterCard" style={styles.chapter}>
          <Text style={styles.chapterEyebrow}>TIÊN LỘ · {chapter ? chapter.lastLevelId-chapter.firstLevelId+1 : maps.length} MÀN</Text>
          <Text style={styles.chapterName}>{(chapter?.name ?? 'Vân Hải Tiên Sơn').toUpperCase()}</Text>
          <Text style={styles.chapterStars}>{totalStars}/{(chapter ? chapter.lastLevelId-chapter.firstLevelId+1 : maps.length) * 3} ★</Text>
        </ArtPanel>
      </View>
      <BottomNav active="map" onSelect={nav} />
      <Notice message={notice} onDismiss={() => setNotice('')} />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  chapterTabs: { flexDirection: 'row', justifyContent: 'center', padding: 8, gap: 6 },
  chapterTab: { padding: 8, borderWidth: 1, borderColor: '#98702e', borderRadius: 8, backgroundColor: '#163c38' },
  chapterTabActive: { backgroundColor: '#72512d' },
  chapterTabText: { color: '#fff2c9', fontSize: 12, fontWeight: '700' },
  status: { color: '#fff2c9', padding: 16, textAlign: 'center' },
  difficulty: { color: '#fff2c9', fontSize: 11, fontWeight: '700' },
  mapArea: { flex: 1, minHeight: 0, position: 'relative' },
  levelListContent: { flexGrow: 1, alignItems: 'center', paddingTop: 12, paddingBottom: 174 },
  levelItem: { width: 100, height: 128, alignItems: 'center', marginVertical: 6 },
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
