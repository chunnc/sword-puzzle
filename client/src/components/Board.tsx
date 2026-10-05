import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-worklets';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ART, specialArtwork, tileArtwork } from '../assets';
import { BOARD_HEIGHT, BOARD_WIDTH } from '../game/BoardEngine';
import { SpecialKind, TileKind } from '../game/types';
import type { BoardAnimationEffect, BoardAnimationFall, BoardSnapshot } from '../game/types';
import { colors } from '../theme';

export interface CellPosition {
  x: number;
  y: number;
}

export const BOARD_SWAP_MS = 180;
export const BOARD_CLEAR_MS = 250;
export const BOARD_FALL_MS = 300;
export const BOARD_CHAIN_DELAY_MS = 100;
export const SWORD_SWEEP_MS = 450;
export const BOARD_REJECT_MS = 260;

export type BoardVisualEffect =
  | { id: number; kind: 'swap' | 'reject'; first: CellPosition; second: CellPosition }
  | { id: number; kind: 'clear'; cleared: number[]; changed: number[]; effects: BoardAnimationEffect[] }
  | { id: number; kind: 'fall'; falls: BoardAnimationFall[] }
  | { id: number; kind: 'sword'; row: number };

export function Board({
  snapshot,
  selected,
  swordTargeting,
  onCellPress,
  onSwipe,
  locked = false,
  visualEffect = null,
  reduceMotion = false,
}: {
  snapshot: BoardSnapshot;
  selected: CellPosition | null;
  swordTargeting: boolean;
  onCellPress: (x: number, y: number) => void;
  onSwipe: (x1: number, y1: number, x2: number, y2: number) => void;
  locked?: boolean;
  visualEffect?: BoardVisualEffect | null;
  reduceMotion?: boolean;
}) {
  const [boardSize, setBoardSize] = useState(0);
  const logicalRow = (displayRow: number) => BOARD_HEIGHT - 1 - displayRow;
  const gesture = useMemo(() => Gesture.Pan()
    .enabled(!locked)
    .minDistance(10)
    .onEnd((event) => {
      if (boardSize <= 0) return;
      const cellSize = boardSize / BOARD_WIDTH;
      const startX = Math.max(0, Math.min(BOARD_WIDTH - 1, Math.floor((event.x - event.translationX) / cellSize)));
      const startDisplayY = Math.max(0, Math.min(BOARD_HEIGHT - 1, Math.floor((event.y - event.translationY) / cellSize)));
      const endX = Math.max(0, Math.min(BOARD_WIDTH - 1, Math.floor(event.x / cellSize)));
      const endDisplayY = Math.max(0, Math.min(BOARD_HEIGHT - 1, Math.floor(event.y / cellSize)));
      if (swordTargeting) {
        runOnJS(onCellPress)(endX, BOARD_HEIGHT - 1 - endDisplayY);
      } else {
        runOnJS(onSwipe)(startX, BOARD_HEIGHT - 1 - startDisplayY, endX, BOARD_HEIGHT - 1 - endDisplayY);
      }
    }), [boardSize, locked, onCellPress, onSwipe, swordTargeting]);

  const sweep = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion || visualEffect?.kind !== 'sword' || boardSize <= 0) {
      sweep.value = 0;
      return;
    }
    sweep.value = 0;
    sweep.value = withTiming(1, { duration: SWORD_SWEEP_MS, easing: Easing.out(Easing.cubic) });
  }, [boardSize, reduceMotion, sweep, visualEffect?.id, visualEffect?.kind]);
  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -(boardSize / 3) + sweep.value * (boardSize + boardSize / 3) }],
  }));

  return (
    <View style={styles.frame}>
      <GestureDetector gesture={gesture}>
        <View
          onLayout={(event) => setBoardSize(Math.min(event.nativeEvent.layout.width, event.nativeEvent.layout.height))}
          style={styles.grid}
        >
          {Array.from({ length: BOARD_HEIGHT }, (_, displayY) => {
            const y = logicalRow(displayY);
            return (
              <View key={displayY} style={styles.row}>
                {Array.from({ length: BOARD_WIDTH }, (_, x) => {
                  const index = y * BOARD_WIDTH + x;
                  const tile = snapshot.tiles[index];
                  const isSelected = selected?.x === x && selected.y === y;
                  const isTargetRow = swordTargeting && selected?.y === y;
                  const special = specialArtwork(tile.special);
                  const label = tile.kind === TileKind.Sword ? 'kiếm' :
                    tile.kind === TileKind.Fire ? 'hỏa phù' :
                      tile.kind === TileKind.Lightning ? 'lôi ấn' :
                        tile.kind === TileKind.Stone ? 'linh thạch' :
                          tile.kind === TileKind.Herb ? 'linh dược' : 'đá chắn';
                  return (
                    <AnimatedCell
                      key={`${x}-${y}`}
                      x={x}
                      y={y}
                      index={index}
                      cellSize={boardSize / BOARD_WIDTH}
                      tileKind={tile.kind}
                      lockedTile={tile.locked}
                      special={special}
                      label={`${label}${tile.locked ? ', phong ấn' : ''}${special ? tile.special === SpecialKind.Slash ? ', Kiếm Trảm' : ', Vạn Kiếm Ấn' : ''}, cột ${x + 1}, hàng ${y + 1}`}
                      hint={swordTargeting ? 'Chọn hàng này để thi triển Kiếm Trảm.' : 'Chọn ô, sau đó chọn ô liền kề để đổi chỗ.'}
                      selected={isSelected}
                      targetRow={isTargetRow}
                      effect={visualEffect}
                      effects={visualEffect?.kind === 'clear' ? visualEffect.effects : []}
                      changed={visualEffect?.kind === 'clear' ? visualEffect.changed : []}
                      reduceMotion={reduceMotion}
                      disabled={locked}
                      onPress={() => onCellPress(x, y)}
                    />
                  );
                })}
              </View>
            );
          })}
          {visualEffect?.kind === 'sword' && !reduceMotion ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.swordSweep,
                { top: `${((BOARD_HEIGHT - 1 - visualEffect.row) / BOARD_HEIGHT) * 100}%`, height: `${100 / BOARD_HEIGHT}%` },
                { width: boardSize / 3 },
                sweepStyle,
              ]}
            >
              <Image source={ART.overlaySlash} contentFit="contain" style={styles.swordSweepArt} />
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>
      {swordTargeting ? <Text style={styles.targetHint}>CHỌN HÀNG CẦN CHÉM</Text> : null}
    </View>
  );
}

function AnimatedCell({
  x,
  y,
  index,
  cellSize,
  tileKind,
  lockedTile,
  special,
  label,
  hint,
  selected,
  targetRow,
  effect,
  effects,
  changed,
  reduceMotion,
  disabled,
  onPress,
}: {
  x: number;
  y: number;
  index: number;
  cellSize: number;
  tileKind: TileKind;
  lockedTile: boolean;
  special: ReturnType<typeof specialArtwork>;
  label: string;
  hint: string;
  selected: boolean;
  targetRow: boolean;
  effect: BoardVisualEffect | null;
  effects: BoardAnimationEffect[];
  changed: number[];
  reduceMotion: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    translateX.value = 0;
    translateY.value = 0;
    scale.value = 1;
    opacity.value = 1;
    if (reduceMotion || !effect || cellSize <= 0) {
      scale.value = selected ? 1.06 : 1;
      return;
    }

    if (effect.kind === 'swap' || effect.kind === 'reject') {
      const isFirst = effect.first.x === x && effect.first.y === y;
      const isSecond = effect.second.x === x && effect.second.y === y;
      if (!isFirst && !isSecond) return;
      const destination = isFirst ? effect.second : effect.first;
      const dx = (destination.x - x) * cellSize;
      const dy = (y - destination.y) * cellSize;
      if (effect.kind === 'swap') {
        translateX.value = withTiming(dx, { duration: BOARD_SWAP_MS, easing: Easing.out(Easing.cubic) });
        translateY.value = withTiming(dy, { duration: BOARD_SWAP_MS, easing: Easing.out(Easing.cubic) });
      } else {
        translateX.value = withSequence(
          withTiming(dx * 0.4, { duration: 75 }),
          withTiming(-dx * 0.18, { duration: 65 }),
          withTiming(0, { duration: 120, easing: Easing.out(Easing.cubic) }),
        );
        translateY.value = withSequence(
          withTiming(dy * 0.4, { duration: 75 }),
          withTiming(-dy * 0.18, { duration: 65 }),
          withTiming(0, { duration: 120, easing: Easing.out(Easing.cubic) }),
        );
      }
      return;
    }

    if (effect.kind === 'clear' && effect.cleared.includes(index)) {
      scale.value = withSequence(
        withTiming(1.15, { duration: 95, easing: Easing.out(Easing.cubic) }),
        withTiming(0.08, { duration: 155, easing: Easing.in(Easing.cubic) }),
      );
      opacity.value = withTiming(0, { duration: BOARD_CLEAR_MS, easing: Easing.in(Easing.cubic) });
      return;
    }

    if (effect.kind === 'clear' && effect.changed.includes(index)) {
      scale.value = withSequence(
        withTiming(1.12, { duration: 100, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) }),
      );
      return;
    }

    if (effect.kind === 'fall') {
      const falling = effect.falls.find((item) => item.index === index);
      if (falling) {
        translateY.value = (y - falling.fromY) * cellSize;
        opacity.value = falling.fromY >= BOARD_HEIGHT ? 0.72 : 1;
        translateY.value = withTiming(0, { duration: BOARD_FALL_MS, easing: Easing.out(Easing.cubic) });
        opacity.value = withTiming(1, { duration: BOARD_FALL_MS, easing: Easing.out(Easing.cubic) });
      }
    }
  }, [cellSize, effect?.id, effect?.kind, index, reduceMotion, selected, x, y]);

  useEffect(() => {
    if (reduceMotion) {
      scale.value = 1;
      return;
    }
    scale.value = selected ? withSpring(1.07, { damping: 13, stiffness: 240 }) : withSpring(1, { damping: 13, stiffness: 240 });
  }, [reduceMotion, selected, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));
  const isMoving = (effect?.kind === 'swap' || effect?.kind === 'reject') &&
    ((effect.first.x === x && effect.first.y === y) || (effect.second.x === x && effect.second.y === y));
  const isEffectCell = effects.some((item) => item.cells.includes(index));

  return (
    <Animated.View style={[styles.animatedCell, animatedStyle, isMoving && styles.movingCell]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}
        onPress={onPress}
        disabled={disabled}
        style={styles.cell}
      >
        <Image source={tileArtwork(tileKind)} contentFit="contain" style={StyleSheet.absoluteFill} />
        {special ? <Image source={special} contentFit="contain" style={styles.overlay} /> : null}
        {lockedTile ? <Image source={ART.overlaySeal} contentFit="contain" style={styles.overlay} /> : null}
        {isEffectCell ? <View pointerEvents="none" style={styles.effectCell} /> : null}
        {targetRow ? <View pointerEvents="none" style={styles.targetRow} /> : null}
        {selected ? <View pointerEvents="none" style={styles.selection} /> : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 1,
    padding: 5,
    borderWidth: 3,
    borderColor: colors.gold,
    borderRadius: 12,
    backgroundColor: colors.inkDeep,
    overflow: 'visible',
  },
  grid: { flex: 1, overflow: 'visible' },
  row: { flex: 1, flexDirection: 'row', overflow: 'visible' },
  animatedCell: { flex: 1, aspectRatio: 1, overflow: 'visible' },
  movingCell: { zIndex: 3 },
  cell: { flex: 1, position: 'relative', padding: 0 },
  overlay: { ...StyleSheet.absoluteFill, width: undefined, height: undefined },
  selection: { ...StyleSheet.absoluteFill, borderWidth: 2, borderColor: colors.goldBright, borderRadius: 5 },
  effectCell: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(91, 219, 255, 0.30)', borderRadius: 5 },
  targetRow: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(242, 213, 142, 0.19)', borderWidth: 1, borderColor: colors.goldBright },
  swordSweep: { position: 'absolute', left: 0, overflow: 'visible', zIndex: 5, backgroundColor: 'rgba(93, 216, 255, 0.30)' },
  swordSweepArt: { width: '100%', height: '100%' },
  targetHint: { position: 'absolute', top: 7, alignSelf: 'center', color: colors.inkDeep, backgroundColor: colors.goldBright, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },
});
