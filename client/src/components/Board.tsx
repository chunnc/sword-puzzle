import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-worklets';
import { ART, specialArtwork, tileArtwork } from '../assets';
import { BOARD_HEIGHT, BOARD_WIDTH } from '../game/BoardEngine';
import { BoardSnapshot, SpecialKind, TileKind } from '../game/types';
import { colors } from '../theme';

export interface CellPosition {
  x: number;
  y: number;
}

export function Board({
  snapshot,
  selected,
  swordTargeting,
  onCellPress,
  onSwipe,
}: {
  snapshot: BoardSnapshot;
  selected: CellPosition | null;
  swordTargeting: boolean;
  onCellPress: (x: number, y: number) => void;
  onSwipe: (x1: number, y1: number, x2: number, y2: number) => void;
}) {
  const [boardSize, setBoardSize] = useState(0);
  const logicalRow = (displayRow: number) => BOARD_HEIGHT - 1 - displayRow;

  const gesture = useMemo(() => Gesture.Pan()
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
    }), [boardSize, onCellPress, onSwipe, swordTargeting]);

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
                  const tile = snapshot.tiles[y * BOARD_WIDTH + x];
                  const isSelected = selected?.x === x && selected.y === y;
                  const isTargetRow = swordTargeting && selected?.y === y;
                  const special = specialArtwork(tile.special);
                  const label = tile.kind === TileKind.Sword ? 'kiếm' :
                    tile.kind === TileKind.Fire ? 'hỏa phù' :
                      tile.kind === TileKind.Lightning ? 'lôi ấn' :
                        tile.kind === TileKind.Stone ? 'linh thạch' :
                          tile.kind === TileKind.Herb ? 'linh dược' : 'đá chắn';
                  return (
                    <Pressable
                      key={`${x}-${y}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${label}${tile.locked ? ', phong ấn' : ''}${special ? tile.special === SpecialKind.Slash ? ', Kiếm Trảm' : ', Vạn Kiếm Ấn' : ''}, cột ${x + 1}, hàng ${y + 1}`}
                      accessibilityHint={swordTargeting ? 'Chọn hàng này để thi triển Kiếm Trảm.' : 'Chọn ô, sau đó chọn ô liền kề để đổi chỗ.'}
                      onPress={() => onCellPress(x, y)}
                      style={styles.cell}
                    >
                      <Image source={tileArtwork(tile.kind)} contentFit="contain" style={StyleSheet.absoluteFill} />
                      {special ? <Image source={special} contentFit="contain" style={styles.overlay} /> : null}
                      {tile.locked ? <Image source={ART.overlaySeal} contentFit="contain" style={styles.overlay} /> : null}
                      {isTargetRow ? <View pointerEvents="none" style={styles.targetRow} /> : null}
                      {isSelected ? <View pointerEvents="none" style={styles.selection} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </View>
      </GestureDetector>
      {swordTargeting ? <Text style={styles.targetHint}>CHỌN HÀNG CẦN CHÉM</Text> : null}
    </View>
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
  },
  grid: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  cell: { flex: 1, aspectRatio: 1, position: 'relative', padding: 0 },
  overlay: { ...StyleSheet.absoluteFill, width: undefined, height: undefined },
  selection: { ...StyleSheet.absoluteFill, borderWidth: 2, borderColor: colors.goldBright, borderRadius: 5 },
  targetRow: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(242, 213, 142, 0.19)', borderWidth: 1, borderColor: colors.goldBright },
  targetHint: { position: 'absolute', top: 7, alignSelf: 'center', color: colors.inkDeep, backgroundColor: colors.goldBright, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },
});
