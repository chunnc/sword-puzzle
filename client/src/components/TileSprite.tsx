import React from 'react';
import { Group, Image, type SkImage } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';
import { ART } from '../assets';
import { TileKind, type Tile } from '../game/types';
import { ChargedTileParticle } from './ChargedTileParticle';
import { chargedParticleStyle, type ParticleBounds } from './chargedTileParticles';
import { Fire5Tile, IdleAtlasTile } from './Fire5Tile';
import { TIER5_IDLE_ANIMATIONS } from './idleTileAnimation';

export const TIER5_IDLE_ART: Partial<Record<TileKind, number>> = {
  [TileKind.Sword]: ART.tileSword5Idle,
  [TileKind.Fire]: ART.tileFire5Idle,
  [TileKind.Lightning]: ART.tileLightning5Idle,
  [TileKind.SpiritOrb]: ART.tileSpiritOrb5Idle,
};

/** Shared artwork only: board geometry, seals and HUD layout belong to callers. */
export const TileSprite = React.memo(function TileSprite({ kind, chargeTier, bounds, image, idleImage,
  particlePhase, elapsedMs, reduced }: {
  kind: TileKind; chargeTier: Tile['chargeTier']; bounds: ParticleBounds;
  image: SkImage | null; idleImage?: SkImage | null;
  particlePhase: SharedValue<number>; elapsedMs: SharedValue<number>; reduced: boolean;
}) {
  const inset = kind === TileKind.Rock ? .06 : .03;
  const artworkBounds = { x: bounds.x + bounds.width * inset, y: bounds.y + bounds.height * inset,
    width: bounds.width * (1 - 2 * inset), height: bounds.height * (1 - 2 * inset) };
  const particle = chargeTier > 0 ? chargedParticleStyle(kind) : null;
  const animation = chargeTier === 5 ? TIER5_IDLE_ANIMATIONS[kind] : undefined;
  return <Group>
    {idleImage && animation
      ? kind === TileKind.Fire
        ? <Fire5Tile idle={{ image: idleImage, elapsedMs }} bounds={artworkBounds} reduced={reduced} />
        : <IdleAtlasTile image={idleImage} animation={animation} elapsedMs={elapsedMs} bounds={artworkBounds} reduced={reduced} />
      : <Image image={image} {...artworkBounds} fit="contain" />}
    {particle ? <ChargedTileParticle bounds={bounds} color={particle.color} elementPhase={particle.phase}
      phase={particlePhase} reduced={reduced} /> : null}
  </Group>;
});
