import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, useWindowDimensions, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { ART } from '../../src/assets';
import {
  Board,
  BoardVisualEffect,
  BOARD_CHAIN_DELAY_MS,
  BOARD_CLEAR_MS,
  BOARD_FALL_MS,
  BOARD_REJECT_MS,
  BOARD_SWAP_MS,
  CellPosition,
  SWORD_SWEEP_MS,
} from '../../src/components/Board';
import { BottomNav, TopHud } from '../../src/components/Chrome';
import { ArtPanel, GameButton, ProgressBar, ScreenFrame, TitleBanner } from '../../src/components/Art';
import { getLevel } from '../../src/game/levels';
import { GoalKind } from '../../src/game/types';
import type { BoardSnapshot } from '../../src/game/types';
import { hasRewardedAdUnit } from '../../src/services/ads';
import { useGameStore } from '../../src/state/gameStore';
import type { BoardActionResult } from '../../src/state/gameStore';
import { colors, type } from '../../src/theme';
import { Notice } from '../../src/components/Notice';

export default function GameScreen() {
  const params = useLocalSearchParams<{ levelId: string }>();
  const levelId = Number(params.levelId);
  const level = useMemo(() => {
    try { return getLevel(levelId); } catch { return null; }
  }, [levelId]);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const save = useGameStore((state) => state.save);
  const online = useGameStore((state) => state.online);
  const adsEnabled = useGameStore((state) => state.adsEnabled);
  const session = useGameStore((state) => state.session);
  const adsLoading = useGameStore((state) => state.adsLoading);
  const notice = useGameStore((state) => state.notice);
  const setNotice = useGameStore((state) => state.setNotice);
  const swap = useGameStore((state) => state.swap);
  const useSwordQi = useGameStore((state) => state.useSwordQi);
  const startLevel = useGameStore((state) => state.startLevel);
  const requestExtraMoves = useGameStore((state) => state.requestExtraMoves);
  const [selected, setSelected] = useState<CellPosition | null>(null);
  const [swordTargeting, setSwordTargeting] = useState(false);
  const [boardSpaceHeight, setBoardSpaceHeight] = useState(0);
  const persistedBoard = save.active?.levelId === levelId ? save.active : null;
  const [board, setBoard] = useState<BoardSnapshot | null>(persistedBoard);
  const [animationPlaying, setAnimationPlaying] = useState(false);
  const [visualEffect, setVisualEffect] = useState<BoardVisualEffect | null>(null);
  const [enemyImpact, setEnemyImpact] = useState(0);
  const busyRef = useRef(false);
  const aliveRef = useRef(true);
  const effectIdRef = useRef(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);
  useEffect(() => {
    if (!busyRef.current && persistedBoard) setBoard(persistedBoard);
  }, [persistedBoard]);

  if (!level || !board) {
    return (
      <ScreenFrame background="bgGame">
        <View style={styles.missing}>
          <Text style={styles.bodyText}>Không tìm thấy bàn chơi.</Text>
          <GameButton title="VỀ TIÊN LỘ" onPress={() => router.replace('/map')} style={styles.dialogButton} />
        </View>
      </ScreenFrame>
    );
  }

  const isBoss = level.goal === GoalKind.Boss;
  const isBattle = level.goal === GoalKind.Battle || isBoss;
  const title = isBoss ? 'YÊU VƯƠNG' : isBattle ? 'YÊU THÚ' : 'BÍ CẢNH';
  const goalLabel = isBattle ? 'MÁU YÊU THÚ' : 'MỤC TIÊU';
  const goalValue = isBattle ? `${board.remaining} HP` : `${board.remaining}/6`;
  const boardSide = Math.max(0, Math.min(width - 28, boardSpaceHeight - 6));
  const lost = board.moves <= 0 && board.remaining > 0;
  const canRequestAds = lost && !board.extraMovesUsed && online && adsEnabled && session !== null && hasRewardedAdUnit();

  const nextEffectId = () => ++effectIdRef.current;
  const wait = (duration: number) => new Promise<void>((resolve) => setTimeout(resolve, duration));

  const playAnimation = async (result: BoardActionResult) => {
    const animation = result.animation;
    if (!animation) {
      const latest = useGameStore.getState().save.active;
      if (aliveRef.current && latest?.levelId === levelId) setBoard(latest);
      return;
    }
    if (reduceMotion) {
      if (aliveRef.current) {
        setBoard(animation.finalBoard);
        setVisualEffect(null);
        if (animation.steps.some((step) => step.damage > 0)) setEnemyImpact((value) => value + 1);
      }
      return;
    }

    if (animation.kind === 'swap' && animation.swap) {
      setVisualEffect({ id: nextEffectId(), kind: 'swap', first: { x: animation.swap.x1, y: animation.swap.y1 }, second: { x: animation.swap.x2, y: animation.swap.y2 } });
      await wait(BOARD_SWAP_MS);
      if (!aliveRef.current) return;
      setBoard(animation.swappedBoard);
      setVisualEffect(null);
    } else if (animation.kind === 'sword' && animation.swordRow !== undefined) {
      setBoard(animation.swappedBoard);
      setVisualEffect({ id: nextEffectId(), kind: 'sword', row: animation.swordRow });
      await wait(SWORD_SWEEP_MS);
      if (!aliveRef.current) return;
      setVisualEffect(null);
    }

    for (let index = 0; index < animation.steps.length; index += 1) {
      const step = animation.steps[index];
      setBoard({
        ...step.before,
        remaining: step.after.remaining,
        swordQi: step.after.swordQi,
        score: step.after.score,
      });
      setVisualEffect({ id: nextEffectId(), kind: 'clear', cleared: step.cleared, changed: step.changed, effects: step.effects });
      if (step.damage > 0) setEnemyImpact((value) => value + 1);
      await wait(BOARD_CLEAR_MS);
      if (!aliveRef.current) return;
      setBoard(step.after);
      setVisualEffect({ id: nextEffectId(), kind: 'fall', falls: step.falls });
      await wait(BOARD_FALL_MS);
      if (!aliveRef.current) return;
      if (index < animation.steps.length - 1) await wait(BOARD_CHAIN_DELAY_MS);
    }
    if (aliveRef.current) {
      setBoard(animation.finalBoard);
      setVisualEffect(null);
    }
  };

  const processResult = (result: BoardActionResult) => {
    if (!result.changed || !result.won || !aliveRef.current) return;
    if (result.levelId === 3) router.replace('/realm');
    else router.replace({ pathname: '/win', params: { levelId: String(result.levelId), stars: String(result.stars) } });
  };

  const performSwap = async (x1: number, y1: number, x2: number, y2: number) => {
    if (swordTargeting) {
      await castSword(y2);
      return;
    }
    if (busyRef.current || Math.abs(x1 - x2) + Math.abs(y1 - y2) !== 1) return;
    busyRef.current = true;
    setAnimationPlaying(true);
    setSelected(null);
    try {
      const result = await swap(x1, y1, x2, y2);
      if (!aliveRef.current) return;
      if (!result.changed) {
        if (!reduceMotion) {
          setVisualEffect({ id: nextEffectId(), kind: 'reject', first: { x: x1, y: y1 }, second: { x: x2, y: y2 } });
          await wait(BOARD_REJECT_MS);
        }
        return;
      }
      await playAnimation(result);
      processResult(result);
    } catch {
      if (aliveRef.current) setNotice('Không thể hoàn tất lượt chơi. Vui lòng thử lại.');
    } finally {
      busyRef.current = false;
      if (aliveRef.current) {
        setAnimationPlaying(false);
        setVisualEffect(null);
      }
    }
  };

  const castSword = async (row: number) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setAnimationPlaying(true);
    setSwordTargeting(false);
    setSelected(null);
    try {
      const result = await useSwordQi(row);
      if (!aliveRef.current) return;
      if (!result.changed) {
        setNotice('Kiếm khí chưa sẵn sàng.');
        return;
      }
      await playAnimation(result);
      processResult(result);
    } catch {
      if (aliveRef.current) setNotice('Không thể hoàn tất lượt chơi. Vui lòng thử lại.');
    } finally {
      busyRef.current = false;
      if (aliveRef.current) {
        setAnimationPlaying(false);
        setVisualEffect(null);
      }
    }
  };

  const tapCell = (x: number, y: number) => {
    if (busyRef.current) return;
    if (swordTargeting) {
      void castSword(y);
      return;
    }
    if (selected && selected.x === x && selected.y === y) {
      setSelected(null);
      return;
    }
    if (selected && Math.abs(selected.x - x) + Math.abs(selected.y - y) === 1) {
      void performSwap(selected.x, selected.y, x, y);
      return;
    }
    setSelected({ x, y });
  };

  const nav = (id: string) => {
    if (id === 'map') router.replace('/map');
    else setNotice('Sắp ra mắt');
  };

  const restart = async () => {
    if (busyRef.current) return;
    setSwordTargeting(false);
    setSelected(null);
    if (await startLevel(levelId, true)) {
      const latest = useGameStore.getState().save.active;
      if (latest?.levelId === levelId) setBoard(latest);
    }
  };

  const background = isBoss ? 'bgBoss' : 'bgGame';
  return (
    <ScreenFrame background={background}>
      <TopHud onAccount={() => router.push('/account')} />
      <TitleBanner title={title} />
      <View style={styles.stats}>
        <StatCard label="TẦNG" value={`1-${levelId}`} style={styles.stageStat} />
        <StatCard label={goalLabel} value={goalValue} style={styles.objectiveStat} icon={isBattle ? 'iconSkill' : 'iconHerb'} />
        <StatCard label="LƯỢT" value={String(board.moves)} style={styles.movesStat} />
      </View>
      <View style={styles.gameMain}>
        {isBattle ? (
          <View style={styles.enemyArea}>
            <AnimatedEnemy impactId={enemyImpact} reduceMotion={reduceMotion} isBoss={isBoss} />
            <ProgressBar portion={board.remaining / level.target} color="red" animated={!reduceMotion} duration={BOARD_CLEAR_MS} />
          </View>
        ) : null}
        <View style={styles.boardSpace} onLayout={(event) => setBoardSpaceHeight(event.nativeEvent.layout.height)}>
          <View style={{ width: boardSide, height: boardSide, maxWidth: '100%' }}>
            <Board
              snapshot={board}
              selected={selected}
              swordTargeting={swordTargeting}
              locked={animationPlaying}
              visualEffect={visualEffect}
              reduceMotion={reduceMotion}
              onCellPress={tapCell}
              onSwipe={(x1, y1, x2, y2) => void performSwap(x1, y1, x2, y2)}
            />
          </View>
        </View>
      </View>
      <ArtPanel art="hudTray" style={styles.skillArea}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={board.swordQi >= 100 ? 'Kiếm Trảm sẵn sàng' : `Kiếm khí ${board.swordQi} trên 100`}
          accessibilityState={{ disabled: board.swordQi < 100 || lost || animationPlaying }}
          disabled={board.swordQi < 100 || lost || animationPlaying}
          onPress={() => { setSwordTargeting(true); setSelected(null); }}
          style={styles.skillButton}
        >
          <Image source={ART[board.swordQi >= 100 ? 'skillReady' : 'skillIdle']} contentFit="contain" style={StyleSheet.absoluteFill} />
          <Image source={ART.iconSkill} contentFit="contain" style={styles.skillIcon} />
        </Pressable>
        <View style={styles.gauge}>
          <Text style={styles.gaugeTitle}>{board.swordQi >= 100 ? 'KIẾM TRẢM SẴN SÀNG' : 'KIẾM KHÍ'}</Text>
          <ProgressBar portion={board.swordQi / 100} color="blue" />
          <Text style={styles.gaugeValue}>{board.swordQi}/100</Text>
        </View>
      </ArtPanel>
      <BottomNav active="map" onSelect={nav} />
      <Notice message={notice} onDismiss={() => setNotice('')} />
      {lost && !animationPlaying ? (
        <View style={styles.dialogOverlay}>
          <ArtPanel art="dialogPanel" style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>HẾT LƯỢT</Text>
            <Text style={styles.bodyText}>Hãy thử lại bí cảnh này.</Text>
            <GameButton title="CHƠI LẠI" onPress={() => void restart()} style={styles.dialogButton} />
            {canRequestAds ? (
              <GameButton
                title={adsLoading ? 'ĐANG TẢI QUẢNG CÁO…' : 'XEM QUẢNG CÁO · +3 LƯỢT'}
                onPress={() => void requestExtraMoves()}
                art="buttonSecondary"
                disabled={adsLoading}
                style={styles.dialogButton}
              />
            ) : null}
            <GameButton title="VỀ TIÊN LỘ" onPress={() => router.replace('/map')} art="buttonSecondary" style={styles.dialogButton} />
          </ArtPanel>
        </View>
      ) : null}
    </ScreenFrame>
  );
}

function AnimatedEnemy({ impactId, reduceMotion, isBoss }: { impactId: number; reduceMotion: boolean; isBoss: boolean }) {
  const shake = useSharedValue(0);
  const flash = useSharedValue(0);
  useEffect(() => {
    if (impactId <= 0 || reduceMotion) return;
    shake.value = withSequence(
      withTiming(-7, { duration: 70 }),
      withTiming(7, { duration: 80 }),
      withTiming(-5, { duration: 80 }),
      withTiming(4, { duration: 70 }),
      withTiming(0, { duration: 100 }),
    );
    flash.value = withSequence(
      withTiming(0.78, { duration: 80 }),
      withTiming(0, { duration: 320 }),
    );
  }, [flash, impactId, reduceMotion, shake]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  return (
    <Animated.View style={[styles.enemy, isBoss && styles.boss, shakeStyle]}>
      <Image source={ART.beast} contentFit="contain" style={StyleSheet.absoluteFill} />
      <Animated.View pointerEvents="none" style={[styles.enemyFlash, flashStyle]} />
    </Animated.View>
  );
}

function StatCard({
  label,
  value,
  icon,
  style,
}: {
  label: string;
  value: string;
  icon?: 'iconSkill' | 'iconHerb';
  style: StyleProp<ViewStyle>;
}) {
  return (
    <ArtPanel art="hudChip" style={[styles.statCard, style]}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValueRow}>
        {icon ? <Image source={ART[icon]} contentFit="contain" style={styles.statIcon} /> : null}
        <Text numberOfLines={1} adjustsFontSizeToFit style={styles.statValue}>{value}</Text>
      </View>
    </ArtPanel>
  );
}

const styles = StyleSheet.create({
  missing: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20 },
  stats: { flexDirection: 'row', justifyContent: 'space-between', gap: 5, height: 62, marginTop: 3, marginBottom: 4 },
  statCard: { height: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  stageStat: { width: '22%' },
  objectiveStat: { width: '50%' },
  movesStat: { width: '22%' },
  statLabel: { ...type.caption, color: colors.goldBright, fontSize: 10 },
  statValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  statIcon: { width: 21, height: 21 },
  statValue: { ...type.number, color: colors.ivory, fontSize: 21 },
  gameMain: { flex: 1, minHeight: 0, alignItems: 'center' },
  enemyArea: { width: '100%', height: 92, alignItems: 'center', justifyContent: 'flex-end', gap: 1 },
  enemy: { width: 156, height: 74, position: 'relative' },
  boss: { width: 180, height: 88 },
  enemyFlash: { ...StyleSheet.absoluteFill, backgroundColor: '#ffe79a', borderRadius: 50 },
  boardSpace: { flex: 1, minHeight: 0, width: '100%', alignItems: 'center', justifyContent: 'center' },
  skillArea: { height: 64, flexShrink: 0, marginTop: 3, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  skillButton: { width: 49, height: 49, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  skillIcon: { width: 32, height: 32 },
  gauge: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  gaugeTitle: { ...type.caption, color: colors.goldBright, fontSize: 9 },
  gaugeValue: { color: colors.ivory, fontSize: 10 },
  dialogOverlay: { ...StyleSheet.absoluteFill, zIndex: 20, backgroundColor: colors.veil, alignItems: 'center', justifyContent: 'center', padding: 20 },
  dialogCard: { width: '100%', maxWidth: 370, minHeight: 300, padding: 35, gap: 8 },
  dialogTitle: { ...type.title, color: colors.ivory, fontSize: 22, textAlign: 'center', marginBottom: 4 },
  bodyText: { ...type.body, color: colors.ivory, textAlign: 'center' },
  dialogButton: { width: '92%', minHeight: 44, marginTop: 2 },
});
