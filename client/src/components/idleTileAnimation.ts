import { TileKind } from '../game/types';
import fire5Metadata from '../../app-assets/ui/tile_fire_5_idle.json';
import lightning5Metadata from '../../app-assets/ui/tile_lightning_5_idle.json';
import sword5Metadata from '../../app-assets/ui/tile_sword_5_idle.json';
import spiritOrb5Metadata from '../../app-assets/ui/tile_spirit_orb_5_idle.json';

export type IdleSpriteAnimationMetadata = {
  durationMs: number;
  frameSize: { width: number; height: number };
  frames: Array<{
    index: number;
    rect: { x: number; y: number; width: number; height: number };
    durationMs: number;
  }>;
};

export const TIER5_IDLE_ANIMATIONS: Partial<Record<TileKind, IdleSpriteAnimationMetadata>> = {
  [TileKind.Fire]: fire5Metadata,
  [TileKind.Lightning]: lightning5Metadata,
  [TileKind.Sword]: sword5Metadata,
  [TileKind.SpiritOrb]: spiritOrb5Metadata,
};

export function idleFrameAt(animation: IdleSpriteAnimationMetadata, elapsedMs: number, reduced = false) {
  'worklet';
  const time = reduced ? 0 : ((elapsedMs % animation.durationMs) + animation.durationMs) % animation.durationMs;
  let end = 0;
  for (const frame of animation.frames) {
    end += frame.durationMs;
    if (time < end) return frame;
  }
  return animation.frames[0];
}
