import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BlurMask, Canvas, Path, Skia } from '@shopify/react-native-skia';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { ART, type Artwork } from '../src/assets';
import { BottomNav, TopHud } from '../src/components/Chrome';
import { ArtPanel, ScreenFrame } from '../src/components/Art';
import { Notice } from '../src/components/Notice';
import { CONTENT, type ChapterDefinition, type MapSummary } from '../src/game/domain';
import { navigateTab, type BottomNavId } from '../src/components/Navigation';
import { getHighestUnlocked, getLevelStars, getLevelCompleted, useGameStore } from '../src/state/gameStore';
import { useSfxPress } from '../src/audio/useSfxPress';
import { colors } from '../src/theme';

const mapKey = (map: MapSummary) => String(map.id);
const LEVEL_STAGE_WIDTH = 84;
const LEVEL_ROW_HEIGHT = 124;
const LEVEL_STAGE_TOP = (LEVEL_ROW_HEIGHT - LEVEL_STAGE_WIDTH) / 2;
const LEVEL_TARGET_CENTER = 0.3;

function chapterLevelTarget(chapter: ChapterDefinition, highestUnlocked: number) {
  return Math.max(chapter.firstLevelId, Math.min(chapter.lastLevelId, highestUnlocked));
}

const MapLevelItem = React.memo(function MapLevelItem({ levelId, difficulty, stars, completed, locked, index, itemCount, mapWidth, onOpen }: {
  levelId: number;
  difficulty: MapSummary['difficulty'];
  stars: number;
  completed: boolean;
  locked: boolean;
  index: number;
  itemCount: number;
  mapWidth: number;
  onOpen: (levelId: number) => Promise<void>;
}) {
  const sfxPress = useSfxPress();
  const current = !locked && !completed;
  const difficultyName = difficulty ? { easy: 'Dễ', medium: 'Vừa', hard: 'Khó', 'very-hard': 'Rất khó' }[difficulty] : '';
  const art: Artwork = completed ? 'stageDone' : locked ? 'stageLocked' : 'stageCurrent';
  const offset = Math.min(36, Math.max(0, (mapWidth - LEVEL_STAGE_WIDTH - 16) / 2));
  const shift = levelId % 2 === 0 ? offset : -offset;
  const x = mapWidth / 2 + shift;
  const connector = useMemo(() => {
    if (!mapWidth || itemCount < 2 || index >= itemCount) return null;
    const path = Skia.Path.Make();
    const previousX = mapWidth / 2 + ((levelId + 1) % 2 === 0 ? offset : -offset);
    const nextX = mapWidth / 2 + ((levelId - 1) % 2 === 0 ? offset : -offset);
    if (index > 0) {
      const boundaryX = (previousX + x) / 2;
      path.moveTo(boundaryX, 0);
      path.cubicTo(boundaryX, 21, x, 41, x, LEVEL_ROW_HEIGHT / 2);
    } else {
      path.moveTo(x, LEVEL_ROW_HEIGHT / 2);
    }
    if (index < itemCount - 1) {
      const boundaryX = (x + nextX) / 2;
      path.cubicTo(x, 83, boundaryX, 103, boundaryX, LEVEL_ROW_HEIGHT);
    }
    return path;
  }, [index, itemCount, levelId, mapWidth, offset, x]);
  return (
    <View style={styles.levelItem}>
      {connector ? <Canvas pointerEvents="none" accessible={false} accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
        <Path path={connector} style="stroke" strokeWidth={10} color="#f2d58e" opacity={0.45}>
          <BlurMask blur={7} style="normal" />
        </Path>
        <Path path={connector} style="stroke" strokeWidth={3} color="#f2d58e" />
      </Canvas> : null}
      {completed ? <View pointerEvents="none" style={[styles.starArc, { transform: [{ translateX: shift }] }]}>
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
      </View> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Màn ${levelId}${difficultyName ? `, ${difficultyName}` : ''}${completed ? `, đã hoàn thành, ${stars} sao` : current ? ', màn hiện tại' : ', đã khóa'}`}
        accessibilityState={{ disabled: locked }}
        disabled={locked}
        onPress={sfxPress(() => void onOpen(levelId), !locked)}
        style={[styles.stage, { transform: [{ translateX: shift }] }]}
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
  const orderedMaps = useMemo(() => [...chapterMaps].reverse(), [chapterMaps]);
  const save = useGameStore((state) => state.save);
  const notice = useGameStore((state) => state.notice);
  const setNotice = useGameStore((state) => state.setNotice);
  const startLevel = useGameStore((state) => state.startLevel);
  const unlocked = getHighestUnlocked(save);
  const totalStars = save.profile.levels.filter(level => !chapter || level.levelId >= chapter.firstLevelId && level.levelId <= chapter.lastLevelId).reduce((sum, level) => sum + level.stars, 0);
  const [chapterPickerOpen, setChapterPickerOpen] = useState(false);
  const [scrollTarget, setScrollTarget] = useState<{ chapterId: string; levelId: number } | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [contentHeight, setContentHeight] = useState(0);
  const listRef = useRef<FlatList<MapSummary>>(null);
  const edgePadding = {
    top: Math.max(0, viewportSize.height * LEVEL_TARGET_CENTER - LEVEL_ROW_HEIGHT / 2),
    bottom: Math.max(0, viewportSize.height * (1 - LEVEL_TARGET_CENTER) - LEVEL_ROW_HEIGHT / 2),
  };
  const expectedContentHeight = Math.max(viewportSize.height,
    edgePadding.top + orderedMaps.length * LEVEL_ROW_HEIGHT + edgePadding.bottom);
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
  const focusCurrentProgress = useCallback(() => {
    const state = useGameStore.getState();
    const targetLevel = getHighestUnlocked(state.save);
    const targetChapter = chapters.find(item => targetLevel >= item.firstLevelId && targetLevel <= item.lastLevelId) ?? chapters[0];
    if (!targetChapter) return;
    setScrollTarget({ chapterId: targetChapter.id, levelId: targetLevel });
    void state.selectChapter(targetChapter.id).catch(() => undefined);
  }, [chapters]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    focusCurrentProgress();
    return () => { focused.current=false;pendingNavigation.current=null; };
  }, [focusCurrentProgress]));

  const chooseChapter = useCallback((selected: ChapterDefinition) => {
    const targetLevel = chapterLevelTarget(selected, unlocked);
    setChapterPickerOpen(false);
    setScrollTarget({ chapterId: selected.id, levelId: targetLevel });
    void selectChapter(selected.id).catch(() => undefined);
  }, [selectChapter, unlocked]);

  const attemptProgressScroll = useCallback(() => {
    if (!focused.current || !scrollTarget || chapterId !== scrollTarget.chapterId || loading || viewportSize.height <= 0
      || Math.abs(contentHeight - expectedContentHeight) > 1) return;
    const index = orderedMaps.findIndex(map => map.id === scrollTarget.levelId);
    if (index < 0 || !listRef.current) return;
    const nodeCenter = edgePadding.top + index * LEVEL_ROW_HEIGHT + LEVEL_STAGE_TOP + LEVEL_STAGE_WIDTH / 2;
    const targetOffset = nodeCenter - viewportSize.height * LEVEL_TARGET_CENTER;
    const maxOffset = Math.max(0, contentHeight - viewportSize.height);
    listRef.current.scrollToOffset({ offset: Math.max(0, Math.min(targetOffset, maxOffset)), animated: false });
    setScrollTarget(null);
  }, [chapterId, loading, orderedMaps, scrollTarget, viewportSize.height, contentHeight, expectedContentHeight, edgePadding.top]);
  useEffect(() => { attemptProgressScroll(); }, [attemptProgressScroll]);
  const getItemLayout = useCallback((_data: ArrayLike<MapSummary> | null | undefined, index: number) => ({
    length: LEVEL_ROW_HEIGHT,
    offset: edgePadding.top + LEVEL_ROW_HEIGHT * index,
    index,
  }), [edgePadding.top]);

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
  const renderLevel = useCallback(({ item, index }: { item: MapSummary; index: number }) => (
    <MapLevelItem levelId={item.id} difficulty={item.difficulty} stars={getLevelStars(save, item.id)}
      completed={getLevelCompleted(save, item.id)} locked={item.id > unlocked} index={index}
      itemCount={orderedMaps.length} mapWidth={viewportSize.width} onOpen={openLevel} />
  ), [save, unlocked, openLevel, orderedMaps.length, viewportSize.width]);
  const nav = (id: BottomNavId) => navigateTab(router, id);
  const chapterLevelCount = chapter ? chapter.lastLevelId - chapter.firstLevelId + 1 : maps.length;

  return (
    <ScreenFrame background="bgMap">
      <TopHud onAccount={() => router.push('/account')} />
      <View testID="map-area" style={styles.mapArea}>
        <FlatList
          testID="map-level-list"
          ref={listRef}
          data={orderedMaps}
          keyExtractor={mapKey}
          getItemLayout={getItemLayout}
          onLayout={event => setViewportSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
          onContentSizeChange={(_width, height) => setContentHeight(height)}
          style={StyleSheet.absoluteFill}
          contentContainerStyle={[styles.levelListContent, { paddingTop: edgePadding.top, paddingBottom: edgePadding.bottom }]}
          showsVerticalScrollIndicator={false}
          renderItem={renderLevel}
        />
        {loading ? <Text accessibilityLiveRegion="polite" style={styles.status}>Đang tải chương…</Text> : null}
        {chapterError ? <Pressable accessibilityRole="button" accessibilityLabel={`${chapterError}, thử lại`}
          onPress={sfxPress(() => void selectChapter(chapterId, { force: true }).catch(() => undefined))}>
          <Text style={styles.status}>{chapterError} · Thử lại</Text>
        </Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={`Chọn chương, ${chapter?.name ?? 'Vân Hải Tiên Sơn'}`}
          accessibilityState={{ expanded: chapterPickerOpen }} onPress={sfxPress(() => setChapterPickerOpen(true))}
          style={styles.chapterTap}>
          <ArtPanel art="chapterCard" style={styles.chapter}>
            <Text numberOfLines={2} adjustsFontSizeToFit style={styles.chapterName}>{(chapter?.name ?? 'Vân Hải Tiên Sơn').toUpperCase()}</Text>
            <Text style={styles.chapterStars}>{totalStars}/{chapterLevelCount * 3} ★</Text>
          </ArtPanel>
        </Pressable>
      </View>
      <BottomNav active="map" onSelect={nav} onReselect={focusCurrentProgress} />
      <Notice message={notice} onDismiss={() => setNotice('')} />
      <Modal visible={chapterPickerOpen} transparent animationType="fade" onRequestClose={() => setChapterPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="Đóng danh sách chương" onPress={() => setChapterPickerOpen(false)} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={styles.chapterDialog}>
            <Image source={ART.inventoryDialog} contentFit="fill" accessible={false} style={StyleSheet.absoluteFill} />
            <Text accessibilityRole="header" style={styles.dialogTitle}>CHỌN CHƯƠNG</Text>
            <ScrollView contentContainerStyle={styles.chapterOptions} showsVerticalScrollIndicator={false}>
              {chapters.map(item => {
                const locked = item.firstLevelId > unlocked;
                const selected = item.id === chapterId;
                return <Pressable key={item.id} accessibilityRole="button"
                  accessibilityLabel={`Chương ${item.order}, ${item.name}${locked ? ', đã khóa' : ''}`}
                  accessibilityState={{ selected, disabled: locked }} disabled={locked}
                  onPress={sfxPress(() => chooseChapter(item), !locked)}
                  style={[styles.chapterOption, selected && styles.chapterOptionSelected, locked && styles.chapterOptionLocked]}>
                  <View style={styles.chapterOptionCopy}>
                    <Text style={styles.chapterOptionOrder}>CHƯƠNG {item.order}</Text>
                    <Text numberOfLines={2} style={styles.chapterOptionName}>{item.name}</Text>
                  </View>
                  {locked ? <Image source={ART.iconSlotLocked} contentFit="contain" accessible={false} style={styles.chapterLockIcon} /> : selected ? <Text style={styles.chapterSelected}>ĐANG XEM</Text> : null}
                </Pressable>;
              })}
            </ScrollView>
            <Pressable accessibilityRole="button" accessibilityLabel="Đóng danh sách chương" onPress={() => setChapterPickerOpen(false)} style={styles.dialogClose}>
              <Text style={styles.dialogCloseText}>ĐÓNG</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  mapArea: { flex: 1, minHeight: 0, position: 'relative' },
  levelListContent: { flexGrow: 1, alignItems: 'stretch' },
  levelItem: { width: '100%', height: LEVEL_ROW_HEIGHT, alignItems: 'center', position: 'relative', overflow: 'visible' },
  starArc: { width: 68, height: 36, position: 'absolute', top: LEVEL_STAGE_TOP, left: '50%', marginLeft: -34, zIndex: 2 },
  starIcon: { position: 'absolute', width: 24, height: 24 },
  starLeft: { left: 0, top: 8, transform: [{ rotate: '-16deg' }] },
  starTop: { left: 22, top: 0 },
  starRight: { right: 0, top: 8, transform: [{ rotate: '16deg' }] },
  status: { color: '#fff2c9', padding: 16, textAlign: 'center' },
  chapterTap: {
    position: 'absolute',
    top: 8,
    right: 0,
    zIndex: 2,
    width: 112,
    height: 154,
  },
  chapter: {
    width: '100%',
    height: '100%',
    paddingHorizontal: 12,
  },
  chapterName: { color: '#392b1d', textAlign: 'center', fontSize: 15, lineHeight: 18, fontWeight: '900' },
  chapterStars: { color: '#98702e', fontSize: 12, fontWeight: '800', marginTop: 8 },
  stage: { position: 'absolute', top: LEVEL_STAGE_TOP, left: '50%', marginLeft: -42, width: 84, height: 84, justifyContent: 'center', alignItems: 'center' },
  lockedStageArt: { tintColor: '#8f9699' },
  stageNumber: { color: colors.ivory, fontSize: 26, fontWeight: '900', textShadowColor: '#102f2d', textShadowRadius: 5 },
  lockedStageNumber: { color: '#c0c4c6' },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(1,18,23,0.78)', padding: 24 },
  chapterDialog: { width: '100%', maxWidth: 340, maxHeight: '82%', minHeight: 220, padding: 18, gap: 12 },
  dialogTitle: { color: colors.ivory, fontSize: 20, lineHeight: 26, fontWeight: '900', textAlign: 'center' },
  chapterOptions: { gap: 8, paddingVertical: 2 },
  chapterOption: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(215,183,110,0.32)', backgroundColor: 'rgba(11,80,81,0.62)' },
  chapterOptionSelected: { borderColor: colors.goldBright, backgroundColor: 'rgba(26,119,114,0.54)' },
  chapterOptionLocked: { opacity: 0.55 },
  chapterOptionCopy: { flex: 1, minWidth: 0, gap: 3 },
  chapterOptionOrder: { color: colors.goldBright, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  chapterOptionName: { color: colors.ivory, fontSize: 14, lineHeight: 18, fontWeight: '800' },
  chapterLockIcon: { width: 22, height: 22 },
  chapterSelected: { color: colors.goldBright, fontSize: 9, fontWeight: '900' },
  dialogClose: { alignSelf: 'center', minWidth: 96, minHeight: 40, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.gold, borderRadius: 10, backgroundColor: 'rgba(6,47,50,0.75)' },
  dialogCloseText: { color: colors.ivory, fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
});
