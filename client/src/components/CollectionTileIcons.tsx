import React, { useMemo } from 'react';
import { StyleSheet, type LayoutRectangle } from 'react-native';
import { Canvas, Group } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { tileArtwork } from '../assets';
import type { TileKind } from '../game/types';
import { useChargedParticleClock } from './ChargedTileParticle';
import { useIdleTileClock } from './Fire5Tile';
import { TileSprite, TIER5_IDLE_ART } from './TileSprite';
import { useCollectionIconScale } from './useCollectionIconScale';
import { useGameTileImage, useGameTileImages, type GameTileImages } from './GameTileImages';

const ICON_SIZE = 28;
const CANVAS_BLEED = 6;
// Four points on either side reserve space for the 1.28x collection pulse.
export const CHARGED_GOAL_ICON_WIDTH = ICON_SIZE + 8;
export type CollectionTileIcon = {
  id: string; kind: TileKind; chargeTier: 4 | 5; progress: number; layout?: LayoutRectangle;
};

/** One surface and two UI-thread clocks for the entire row, independent of icon count. */
export function CollectionTileIcons({ icons, reduced }: { icons: CollectionTileIcon[]; reduced: boolean }) {
  const images = useGameTileImages();
  const hasVisible = icons.some(icon => icon.layout && icon.layout.width > 0 && icon.layout.height > 0);
  const hasIdle = icons.some(icon => icon.layout && icon.chargeTier === 5);
  const visible = useDerivedValue(() => hasVisible, [hasVisible]);
  const idleVisible = useDerivedValue(() => hasVisible && hasIdle, [hasVisible, hasIdle]);
  const particlePhase = useChargedParticleClock(visible, reduced);
  const elapsedMs = useIdleTileClock(idleVisible, reduced);
  return <Canvas testID="collection-tile-canvas" pointerEvents="none" accessible={false}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.canvas}>
    {icons.map(icon => <CollectionTileIconVisual key={icon.id} {...icon} images={images} particlePhase={particlePhase} elapsedMs={elapsedMs} reduced={reduced} />)}
  </Canvas>;
}

const CollectionTileIconVisual = React.memo(function CollectionTileIconVisual({ kind, chargeTier, progress,
  layout, images, particlePhase, elapsedMs, reduced }: CollectionTileIcon & {
  images: GameTileImages | null; particlePhase: SharedValue<number>; elapsedMs: SharedValue<number>; reduced: boolean;
}) {
  // Load only assets used by this objective, never all board tiers/sprite sheets.
  const image = useGameTileImage(tileArtwork(kind, chargeTier), images);
  const idleImage = useGameTileImage(chargeTier === 5 ? TIER5_IDLE_ART[kind] : null, images);
  const scale = useCollectionIconScale(progress, reduced);
  const transform = useDerivedValue(() => [{ scale: scale.value }]);
  const bounds = useMemo(() => ({ x: (layout?.x ?? 0) + 4 + CANVAS_BLEED,
    y: (layout?.y ?? 0) + ((layout?.height ?? ICON_SIZE) - ICON_SIZE) / 2 + CANVAS_BLEED,
    width: ICON_SIZE, height: ICON_SIZE }), [layout]);
  if (!layout || layout.width <= 0 || layout.height <= 0) return null;
  return <Group origin={{ x: bounds.x + ICON_SIZE / 2, y: bounds.y + ICON_SIZE / 2 }} transform={transform}>
    <TileSprite kind={kind} chargeTier={chargeTier} bounds={bounds} image={image} idleImage={idleImage}
      particlePhase={particlePhase} elapsedMs={elapsedMs} reduced={reduced} />
  </Group>;
});

const styles = StyleSheet.create({
  canvas: { position: 'absolute', left: -CANVAS_BLEED, top: -CANVAS_BLEED, right: -CANVAS_BLEED, bottom: -CANVAS_BLEED },
});
