import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-worklets';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { tileArtwork } from '../assets';
import { CONTENT } from '../game/domain';
import { TileKind, type BoardAnimationEffect, type BoardAnimationFall, type BoardSnapshot, type CellPosition, type Tile } from '../game/types';
import { colors } from '../theme';
export type { CellPosition } from '../game/types';
export const BOARD_SWAP_MS = 210;
export const BOARD_CLEAR_MS = 240;
export const BOARD_FALL_MS = 280;
export const BOARD_CHAIN_DELAY_MS = 70;
export const BOARD_REJECT_MS = 260;
export type BoardVisualEffect = {
    id: number;
    kind: 'swap' | 'reject';
    first: CellPosition;
    second: CellPosition;
} | {
    id: number;
    kind: 'clear';
    cleared: number[];
    changed: number[];
    effects: BoardAnimationEffect[];
} | {
    id: number;
    kind: 'fall';
    falls: BoardAnimationFall[];
};
const effectColor = (kind?: string) => kind === 'fire' ? '#ffb063' : kind === 'lightning' ? '#c7a5ff' : kind === 'spirit' ? '#8efbd4' : '#ffeab0';
export function SpiritOrb({ size = 34 }: {
    size?: number;
}) {
    return <View style={[styles.orb, { width: size, height: size, borderRadius: size / 2 }]}><View style={[styles.orbCore, { width: size * .64, height: size * .64, borderRadius: size }]}/><View style={styles.orbSpark}/><Text style={{ color: '#d6fff1', fontSize: size * .45, fontWeight: '900' }}>氣</Text></View>;
}
export function Board({ snapshot, selected, targets = [], preview = [], targetingHint, onCellPress, onSwipe, locked = false, visualEffect = null, reduceMotion = false }: {
    snapshot: BoardSnapshot;
    selected: CellPosition | null;
    targets?: CellPosition[];
    preview?: number[];
    targetingHint?: string | null;
    onCellPress: (x: number, y: number) => void;
    onSwipe: (x1: number, y1: number, x2: number, y2: number) => void;
    locked?: boolean;
    visualEffect?: BoardVisualEffect | null;
    reduceMotion?: boolean;
}) {
    const [side, setSide] = useState(0);
    const gesture = useMemo(() => Gesture.Pan().enabled(!locked && !targetingHint).minDistance(10).onEnd(event => {
        if (!side)
            return;
        const cell = side / 7;
        const clamp = (n: number) => Math.max(0, Math.min(6, Math.floor(n / cell)));
        runOnJS(onSwipe)(clamp(event.x - event.translationX), 6 - clamp(event.y - event.translationY), clamp(event.x), 6 - clamp(event.y));
    }), [locked, targetingHint, side, onSwipe]);
    return <View style={styles.frame}><GestureDetector gesture={gesture}><View onLayout={event => setSide(event.nativeEvent.layout.width)} style={styles.grid}>
    {Array.from({ length: 7 }, (_, displayY) => <View key={displayY} style={styles.row}>{Array.from({ length: 7 }, (_, x) => {
                const y = 6 - displayY, index = y * 7 + x, tile = snapshot.tiles[index];
                return <Cell key={x} tile={tile} x={x} y={y} index={index} size={side / 7} selected={selected?.x === x && selected.y === y} targetNumber={targets.findIndex(p => p.x === x && p.y === y) + 1} preview={preview.includes(index)} effect={visualEffect} reduceMotion={reduceMotion} disabled={locked} onPress={() => onCellPress(x, y)}/>;
            })}</View>)}
  </View></GestureDetector>{targetingHint ? <Text style={styles.hint}>{targetingHint}</Text> : null}</View>;
}
function Cell({ tile, x, y, index, size, selected, targetNumber, preview, effect, reduceMotion, disabled, onPress }: {
    tile: Tile;
    x: number;
    y: number;
    index: number;
    size: number;
    selected: boolean;
    targetNumber: number;
    preview: boolean;
    effect: BoardVisualEffect | null;
    reduceMotion: boolean;
    disabled: boolean;
    onPress: () => void;
}) {
    const opacity = useSharedValue(1), scale = useSharedValue(1), tx = useSharedValue(0), ty = useSharedValue(0), flash = useSharedValue(0);
    const currentEffect = effect?.kind === 'clear' ? effect.effects.find(e => e.cells.includes(index) || e.source === index) : undefined;
    useEffect(() => {
        opacity.value = 1;
        scale.value = 1;
        tx.value = 0;
        ty.value = 0;
        flash.value = 0;
        if (!effect || reduceMotion)
            return;
        if (effect.kind === 'swap' || effect.kind === 'reject') {
            const first = effect.first.x === x && effect.first.y === y, second = effect.second.x === x && effect.second.y === y;
            if (!first && !second)
                return;
            const from = first ? effect.first : effect.second, to = first ? effect.second : effect.first;
            const dx = (to.x - from.x) * size, dy = (from.y - to.y) * size;
            tx.value = effect.kind === 'reject' ? withSequence(withTiming(dx * .38, { duration: 110 }), withTiming(0, { duration: 150 })) : withTiming(dx, { duration: BOARD_SWAP_MS });
            ty.value = effect.kind === 'reject' ? withSequence(withTiming(dy * .38, { duration: 110 }), withTiming(0, { duration: 150 })) : withTiming(dy, { duration: BOARD_SWAP_MS });
        }
        else if (effect.kind === 'clear') {
            if (effect.cleared.includes(index)) {
                opacity.value = withTiming(0, { duration: BOARD_CLEAR_MS });
                scale.value = withTiming(.5, { duration: BOARD_CLEAR_MS });
            }
            else if (effect.changed.includes(index))
                scale.value = withSequence(withTiming(1.12, { duration: 100 }), withTiming(1, { duration: 140 }));
            if (effect.effects.some(e => e.cells.includes(index) || e.source === index))
                flash.value = withSequence(withTiming(.85, { duration: 70 }), withTiming(0, { duration: BOARD_CLEAR_MS - 70 }));
        }
        else if (effect.kind === 'fall') {
            const fall = effect.falls.find(f => f.index === index);
            if (fall) {
                ty.value = (y - fall.fromY) * size;
                ty.value = withTiming(0, { duration: BOARD_FALL_MS });
            }
        }
    }, [effect?.id, index, reduceMotion, size, tile.kind, tile.chargeTier]);
    const motion = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }));
    const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
    const name = tile.kind === TileKind.Rock ? 'Đá chắn' : CONTENT.tiles[tile.kind].name;
    return <Pressable accessibilityRole="button" accessibilityLabel={`${name}${tile.chargeTier ? `, cường hóa ${tile.chargeTier}` : ''}${tile.locked ? ', phong ấn' : ''}, hàng ${y + 1}, cột ${x + 1}`} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={styles.cell}>
    <Animated.View style={[styles.tile, motion]}>
      {tile.kind === TileKind.SpiritOrb ? <SpiritOrb size={Math.max(16, size * .66)}/> : <Image source={tileArtwork(tile.kind)} contentFit="contain" style={styles.image}/>}
      {tile.chargeTier ? <View style={[styles.charge, tile.chargeTier === 5 && styles.chargeFive]}><Text style={styles.chargeText}>{tile.chargeTier === 5 ? '✦' : '✧'}{tile.chargeTier}</Text></View> : null}
      {tile.locked ? <View style={styles.seal}><Text style={styles.sealText}>封</Text></View> : null}
    </Animated.View>
    <Animated.View pointerEvents="none" style={[styles.flash, { backgroundColor: effectColor(currentEffect?.kind) }, flashStyle]}/>
    {selected || targetNumber || preview ? <View pointerEvents="none" style={[styles.selection, preview && styles.preview]}/> : null}
    {targetNumber ? <Text pointerEvents="none" style={styles.targetNumber}>{targetNumber}</Text> : null}
  </Pressable>;
}
const styles = StyleSheet.create({
    frame: { flex: 1, borderWidth: 2, borderColor: colors.gold, borderRadius: 10, padding: 3, backgroundColor: '#042f32', overflow: 'hidden' },
    grid: { flex: 1 }, row: { flex: 1, flexDirection: 'row' }, cell: { flex: 1, margin: 1, borderRadius: 5, backgroundColor: '#0b4144', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    tile: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center' }, image: { width: '88%', height: '88%' },
    charge: { position: 'absolute', right: 1, bottom: 1, backgroundColor: '#163a40', borderWidth: 1, borderColor: '#e0cb80', borderRadius: 6, paddingHorizontal: 2 }, chargeFive: { backgroundColor: '#6a4c22', borderColor: '#ffeba5' }, chargeText: { color: '#fff2c9', fontSize: 11, fontWeight: '900' },
    seal: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(9,35,49,.45)', borderWidth: 2, borderColor: '#ae97cd', alignItems: 'center', justifyContent: 'center' }, sealText: { color: '#eee0ff', fontSize: 27 },
    selection: { ...StyleSheet.absoluteFill, borderWidth: 2, borderColor: colors.goldBright, borderRadius: 5 }, preview: { backgroundColor: 'rgba(242,213,142,.16)' }, flash: { ...StyleSheet.absoluteFill, borderRadius: 5 },
    targetNumber: { position: 'absolute', top: 1, left: 2, color: '#fff8dd', fontSize: 13, fontWeight: '900', backgroundColor: '#6a4c22', borderRadius: 6, paddingHorizontal: 3 },
    hint: { position: 'absolute', top: 5, alignSelf: 'center', color: colors.inkDeep, backgroundColor: colors.goldBright, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, fontSize: 10, fontWeight: '800' },
    orb: { backgroundColor: '#167d75', borderWidth: 2, borderColor: '#b0ffe8', alignItems: 'center', justifyContent: 'center', shadowColor: '#5cffcd', shadowOpacity: .8, shadowRadius: 5, elevation: 3 }, orbCore: { position: 'absolute', backgroundColor: '#35b8a0', borderWidth: 1, borderColor: '#75f4d1' }, orbSpark: { position: 'absolute', top: '14%', left: '22%', width: 7, height: 4, borderRadius: 3, backgroundColor: '#ecfff8' },
});
