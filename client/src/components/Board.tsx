import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Canvas, FontWeight, Group, Image, Paint, Paragraph, RoundedRect, Skia, useImage,
  type SkImage, type SkParagraph,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, runOnUI } from 'react-native-worklets';
import {
  useAnimatedReaction, withSequence, withTiming,
} from 'react-native-reanimated';
import { ART } from '../assets';
import { getContentVersion } from '../game/domain';
import { TileKind, type BoardSnapshot, type CellPosition, type Tile } from '../game/types';
import { colors } from '../theme';
import {
  BOARD_SWAP_MS, BOARD_CLEAR_MS, BOARD_FALL_MS,
  BOARD_REJECT_OUT_MS, BOARD_REJECT_BACK_MS, BOARD_FLASH_IN_MS, BOARD_PULSE_IN_MS,
  boardClearDurationMs, displayIndices, buildBoardEffectCues, buildCellVisuals, cellBounds, pointToCell,
  type BoardVisualEffect, type CellVisual,
} from './boardVisuals';
import { createBoardMotionSession, createBoardMotionFrame, updateBoardMotionFrame, finishBoardMotionSession, type CellMotionValues } from './boardMotion';
import { BoardEffects } from './BoardEffects';

export type { CellPosition } from '../game/types';
export {
  BOARD_SWAP_MS, BOARD_CLEAR_MS, BOARD_FIRE_MS, BOARD_LIGHTNING_MS, BOARD_FALL_MS, BOARD_CHAIN_DELAY_MS, BOARD_REJECT_MS,
  boardClearDurationMs,
  type BoardVisualEffect,
} from './boardVisuals';

interface Label {
  paragraph: SkParagraph;
  width: number;
  height: number;
}

function makeLabel(text: string, fontSize: number, color: string, shadow = false): Label {
  // Paragraph uses the native font manager's fallback for CJK and star glyphs.
  const paragraph = Skia.ParagraphBuilder.Make({
    maxLines: 1,
    textStyle: {
      fontSize, fontStyle: { weight: FontWeight.Black }, color: Skia.Color(color),
      ...(shadow ? { shadows: [{ color: Skia.Color('#042f32'), offset: { x: 0, y: 1 }, blurRadius: 2 }] } : {}),
    },
  }).addText(text).build();
  paragraph.layout(1000);
  const width = Math.ceil(paragraph.getLongestLine());
  paragraph.layout(Math.max(1, width));
  return { paragraph, width: Math.max(1, width), height: paragraph.getHeight() };
}

function useBoardLabels(cellWidth: number, targetCount: number) {
  return useMemo(() => ({
    orb: makeLabel('氣', Math.max(16, cellWidth * .66) * .45, '#d6fff1', true),
    seal: makeLabel('封', Math.min(27, cellWidth * .65), '#eee0ff'),
    charge4: makeLabel('✧4', 11, '#fff2c9'),
    charge5: makeLabel('✦5', 11, '#fff2c9'),
    targets: Array.from({ length: targetCount }, (_, i) => makeLabel(String(i + 1), 13, '#fff8dd')),
  }), [cellWidth, targetCount]);
}

type BoardLabels = ReturnType<typeof useBoardLabels>;

// Retain this exported helper for callers outside the board; the board itself
// draws every sprite into its one shared Canvas.
export function SpiritOrb({ size = 34 }: { size?: number }) {
  const image = useImage(ART.tileSpiritOrb);
  const label = useMemo(() => makeLabel('氣', size * .45, '#d6fff1', true), [size]);
  return <Canvas style={{ width: size, height: size }}>
    <Image image={image} x={0} y={0} width={size} height={size} fit="contain" />
    <Paragraph paragraph={label.paragraph} x={(size - label.width) / 2} y={(size - label.height) / 2} width={label.width} />
  </Canvas>;
}

export function Board({ snapshot, selected, targets = [], preview = [], targetingHint, showTargetingHint = true, onCellPress, onSwipe, locked = false, visualEffect = null, reduceMotion = false }: {
  snapshot: BoardSnapshot;
  selected: CellPosition | null;
  targets?: CellPosition[];
  preview?: number[];
  targetingHint?: string | null;
  showTargetingHint?: boolean;
  onCellPress: (x: number, y: number) => void;
  onSwipe: (x1: number, y1: number, x2: number, y2: number) => void;
  locked?: boolean;
  visualEffect?: BoardVisualEffect | null;
  reduceMotion?: boolean;
}) {
  const geometry = snapshot.level.board;
  const content = getContentVersion(snapshot.contentVersion);
  const indices = useMemo(() => displayIndices(geometry), [geometry]);
  const [side, setSide] = useState(0);
  const sword = useImage(ART.tileSword), fire = useImage(ART.tileFire);
  const lightning = useImage(ART.tileLightning), orb = useImage(ART.tileSpiritOrb), rock = useImage(ART.tileRock);
  const fxFireBurst = useImage(ART.fxFireBurst), fxLightning = useImage(ART.fxLightningAtlas);
  const images = [sword, fire, lightning, orb, rock];
  const previousEffect = useRef<{ runId: string; effect: BoardVisualEffect | null; before: BoardVisualEffect | null } | null>(null);
  const id = visualEffect?.id ?? 0;
  const kind = reduceMotion ? undefined : visualEffect?.kind;
  const prior = previousEffect.current?.runId === snapshot.runId ? previousEffect.current : null;
  const before = prior?.effect?.id === id ? prior.before : prior?.effect ?? null;
  const effectCues = useMemo(() => reduceMotion ? [] : buildBoardEffectCues(visualEffect, geometry, snapshot.runId),
    [snapshot.runId, id, kind, reduceMotion, geometry]);
  const clearDurationMs = visualEffect?.kind === 'clear'
    ? boardClearDurationMs(visualEffect.effects.map(item => item.kind))
    : BOARD_CLEAR_MS;
  // An effect ID identifies an immutable phase within a run. HUD updates and
  // equivalent effect objects must not replace that phase's clocks or outputs.
  const visuals = useMemo(() => buildCellVisuals(visualEffect, before,
    reduceMotion, geometry, effectCues), [snapshot.runId, id, kind, reduceMotion, geometry, effectCues]);
  const motion = useMemo(() => createBoardMotionSession(kind), [snapshot.runId, id, kind, reduceMotion]);
  const frame = useMemo(() => createBoardMotionFrame(visuals, side / geometry.width), [visuals, side, geometry.width]);
  const frameRef = useRef(frame);
  useLayoutEffect(() => { frameRef.current = frame; }, [frame]);
  useAnimatedReaction(
    () => ({ progress: motion.progress.value, pulse: motion.pulse.value }),
    value => { updateBoardMotionFrame(frame, value.progress, value.pulse); },
    [motion, frame],
  );
  const labels = useBoardLabels(Math.max(0, side / geometry.width - 2), targets.length);
  const drawOrder = useMemo(() => [...indices].sort((a, b) => {
    const moving = (index: number) => Number(visuals[index].falling || !!visuals[index].dx || !!visuals[index].dy);
    return moving(a) - moving(b);
  }), [visuals, indices]);

  useLayoutEffect(() => {
    previousEffect.current = { runId: snapshot.runId, effect: visualEffect, before };
    const { progress, pulse, flash } = motion;
    runOnUI(() => {
      // Also support React's effect setup/cleanup replay in development. These
      // values belong only to this phase, never to a retired or future phase.
      progress.value = 0;
      pulse.value = 1;
      flash.value = 0;
      if (!kind) return;
      if (kind === 'reject') {
        progress.value = withSequence(
          withTiming(.38, { duration: BOARD_REJECT_OUT_MS }),
          withTiming(0, { duration: BOARD_REJECT_BACK_MS }),
        );
      } else if (kind === 'swap' || kind === 'fall') {
        progress.value = withTiming(1, { duration: kind === 'swap' ? BOARD_SWAP_MS : BOARD_FALL_MS });
      } else if (kind === 'clear') {
        progress.value = withTiming(1, { duration: clearDurationMs });
        pulse.value = withSequence(
          withTiming(1.12, { duration: BOARD_PULSE_IN_MS }),
          withTiming(1, { duration: clearDurationMs - BOARD_PULSE_IN_MS }),
        );
        flash.value = withSequence(
          withTiming(.85, { duration: BOARD_FLASH_IN_MS }),
          withTiming(0, { duration: clearDurationMs - BOARD_FLASH_IN_MS }),
        );
      }
    })();
    return () => {
      const completedFrame = frameRef.current;
      runOnUI(() => { finishBoardMotionSession(motion, completedFrame); })();
    };
  }, [motion, clearDurationMs]);

  const gesture = useMemo(() => Gesture.Pan().enabled(!locked && !targetingHint).minDistance(10).onEnd(event => {
    const first = pointToCell(event.x - event.translationX, event.y - event.translationY, side, geometry);
    const second = pointToCell(event.x, event.y, side, geometry);
    if (first && second) runOnJS(onSwipe)(first.x, first.y, second.x, second.y);
  }), [locked, targetingHint, side, onSwipe, geometry]);

  return <View style={styles.frame}>
    <GestureDetector gesture={gesture}>
      <View collapsable={false} onLayout={event => setSide(event.nativeEvent.layout.width)} style={styles.grid}>
        {side > geometry.width * 2 ? <Canvas pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
          <Group clip={{ x: 0, y: 0, width: side, height: side * geometry.height / geometry.width }}>
            {indices.map(index => <RoundedRect key={`background-${index}`} {...cellBounds(index, side, geometry)} r={5} color="#0b4144" />)}
            {drawOrder.map(index => <TileVisual key={index} tile={snapshot.tiles[index]!} bounds={cellBounds(index, side, geometry)} image={images[snapshot.tiles[index]!.kind]} visual={visuals[index]} motion={frame.cells[index]} labels={labels} />)}
            {effectCues.length ? <BoardEffects key={`${snapshot.runId}:${id}`} cues={effectCues} geometry={geometry} side={side}
              progress={motion.progress} durationMs={clearDurationMs} fireBurstImage={fxFireBurst} lightningImage={fxLightning} /> : null}
            {indices.map(index => {
              const bounds = cellBounds(index, side, geometry), x = index % geometry.width, y = Math.floor(index / geometry.width);
              const targetNumber = targets.findIndex(p => p.x === x && p.y === y) + 1;
              const highlighted = selected?.x === x && selected.y === y || targetNumber > 0 || preview.includes(index);
              const targetLabel = targetNumber ? labels.targets[targetNumber - 1] : null;
              const cellMotion = frame.cells[index];
              return <Group key={`overlay-${index}`}>
                {visuals[index].flashing ? <RoundedRect {...bounds} r={5} color={visuals[index].flashColor}
                  opacity={visuals[index].flashAt === null ? motion.flash : cellMotion?.flashOpacity ?? 0} /> : null}
                {preview.includes(index) ? <RoundedRect {...bounds} r={5} color="rgba(242,213,142,.16)" /> : null}
                {highlighted ? <RoundedRect x={bounds.x + 1} y={bounds.y + 1} width={bounds.width - 2} height={bounds.height - 2} r={4} color={colors.goldBright} style="stroke" strokeWidth={2} /> : null}
                {targetLabel ? <Group>
                  <RoundedRect x={bounds.x + 2} y={bounds.y + 1} width={targetLabel.width + 6} height={targetLabel.height} r={6} color="#6a4c22" />
                  <Paragraph paragraph={targetLabel.paragraph} x={bounds.x + 5} y={bounds.y + 1} width={targetLabel.width} />
                </Group> : null}
              </Group>;
            })}
          </Group>
        </Canvas> : null}
        {side > geometry.width * 2 ? indices.map(index => {
          const tile = snapshot.tiles[index]!, x = index % geometry.width, y = Math.floor(index / geometry.width);
          const bounds = cellBounds(index, side, geometry);
          const name = tile.kind === TileKind.Rock ? 'Đá chắn' : content.tiles[tile.kind].name;
          return <Pressable key={index} accessibilityRole="button" accessibilityLabel={`${name}${tile.chargeTier ? `, cường hóa ${tile.chargeTier}` : ''}${tile.locked ? ', phong ấn' : ''}, hàng ${y + 1}, cột ${x + 1}`} accessibilityState={{ disabled: locked }} disabled={locked} onPress={() => onCellPress(x, y)} style={[styles.touchCell, { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }]} />;
        }) : null}
      </View>
    </GestureDetector>
    {showTargetingHint && targetingHint ? <Text style={styles.hint}>{targetingHint}</Text> : null}
  </View>;
}

function TileVisual({ tile, bounds, image, visual, motion, labels }: {
  tile: Tile;
  bounds: ReturnType<typeof cellBounds>;
  image: SkImage | null;
  visual: CellVisual;
  motion: CellMotionValues | null;
  labels: BoardLabels;
}) {
  const charge = tile.chargeTier === 5 ? labels.charge5 : labels.charge4;
  const chargeWidth = charge.width + 6, chargeHeight = charge.height + 2;
  const chargeX = bounds.x + bounds.width - 1 - chargeWidth, chargeY = bounds.y + bounds.height - 1 - chargeHeight;
  if (visual.hidden) return null;
  // Paragraph paints its own colors, so fade the complete tile as a layer.
  // Allocate that layer only during clears, not during swaps/falls or idle.
  return <Group origin={{ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }} transform={motion?.transform} layer={visual.clearing ? <Paint opacity={motion!.opacity} /> : undefined}>
    <Image image={image} x={bounds.x + bounds.width * .06} y={bounds.y + bounds.height * .06} width={bounds.width * .88} height={bounds.height * .88} fit="contain" />
    {tile.kind === TileKind.SpiritOrb ? <Paragraph paragraph={labels.orb.paragraph} x={bounds.x + (bounds.width - labels.orb.width) / 2} y={bounds.y + (bounds.height - labels.orb.height) / 2} width={labels.orb.width} /> : null}
    {tile.chargeTier ? <Group>
      <RoundedRect x={chargeX} y={chargeY} width={chargeWidth} height={chargeHeight} r={6} color={tile.chargeTier === 5 ? '#6a4c22' : '#163a40'} />
      <RoundedRect x={chargeX + .5} y={chargeY + .5} width={chargeWidth - 1} height={chargeHeight - 1} r={5.5} style="stroke" strokeWidth={1} color={tile.chargeTier === 5 ? '#ffeba5' : '#e0cb80'} />
      <Paragraph paragraph={charge.paragraph} x={chargeX + 3} y={chargeY + 1} width={charge.width} />
    </Group> : null}
    {tile.locked ? <Group>
      <RoundedRect {...bounds} r={5} color="rgba(9,35,49,.45)" />
      <RoundedRect x={bounds.x + 1} y={bounds.y + 1} width={bounds.width - 2} height={bounds.height - 2} r={4} style="stroke" strokeWidth={2} color="#ae97cd" />
      <Paragraph paragraph={labels.seal.paragraph} x={bounds.x + (bounds.width - labels.seal.width) / 2} y={bounds.y + (bounds.height - labels.seal.height) / 2} width={labels.seal.width} />
    </Group> : null}
  </Group>;
}

const styles = StyleSheet.create({
  frame: { flex: 1, borderWidth: 2, borderColor: colors.gold, borderRadius: 10, padding: 3, backgroundColor: '#042f32', overflow: 'hidden' },
  grid: { flex: 1 },
  touchCell: { position: 'absolute', borderRadius: 5 },
  hint: { position: 'absolute', top: 5, alignSelf: 'center', color: colors.inkDeep, backgroundColor: colors.goldBright, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, fontSize: 10, fontWeight: '800' },
});
