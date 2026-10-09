import type { Transforms3d } from '@shopify/react-native-skia';
import { BOARD_SWORD_SWEEP_MS, BOARD_SWORD_AFTERIMAGE_MS, BOARD_SWORD_SHARDS_MS, type BoardEffectCue, type SwordCutAxis } from './boardVisuals';

export const SWORD_SLASH_LENGTH_CELLS = 7;
export const SWORD_SLASH_THICKNESS_SCALE = 2.6;

export function swordSweepFrame(elapsedMs: number, startAtMs: number, length: number, pitch: number) {
  'worklet';
  const age = elapsedMs - startAtMs;
  const progress = Math.max(0, Math.min(1, age / BOARD_SWORD_SWEEP_MS));
  const tail = pitch * SWORD_SLASH_LENGTH_CELLS;
  return {
    head: -pitch * .1 + (length + tail + pitch * .1) * progress,
    opacity: age < 0 || age >= BOARD_SWORD_SWEEP_MS ? 0 : Math.min(1, (BOARD_SWORD_SWEEP_MS - age) / 24),
  };
}

export function swordAfterimageOpacity(elapsedMs: number, startAtMs: number) {
  'worklet';
  const age = elapsedMs - startAtMs - BOARD_SWORD_SWEEP_MS;
  return age < 0 || age >= BOARD_SWORD_AFTERIMAGE_MS ? 0 : .35 * (1 - age / BOARD_SWORD_AFTERIMAGE_MS);
}

export function swordShardFrame(elapsedMs: number, splitAtMs: number, axis: SwordCutAxis, half: 0 | 1, pitch: number) {
  'worklet';
  const age = elapsedMs - splitAtMs;
  const progress = Math.max(0, Math.min(1, age / BOARD_SWORD_SHARDS_MS));
  const direction = half === 0 ? -1 : 1;
  // A quick separation followed by accelerating gravity; all distances scale with the board.
  const separation = pitch * .18 * (1 - Math.pow(1 - progress, 3));
  return {
    tx: (axis === 'vertical' ? direction * separation : direction * pitch * .09 * progress) || 0,
    ty: pitch * 1.6 * progress * progress + (axis === 'horizontal' ? direction * separation : 0),
    rotation: direction * Math.PI / 12 * progress || 0,
    opacity: age < 0 || age >= BOARD_SWORD_SHARDS_MS ? 0 : Math.min(1, (1 - progress) / .65),
  };
}

export const LIGHTNING_FRAME_MS = 120;
export const LIGHTNING_ATLAS_COLUMNS = 5;
export const LIGHTNING_ATLAS_ROWS = 3;
export const LIGHTNING_ATLAS_WIDTH = 960;
export const LIGHTNING_ATLAS_HEIGHT = 576;
// The impact core is at (96, 160) in a 192px frame, above its transparent footer.
const LIGHTNING_IMPACT_HEIGHT_RATIO = 160 / 192;

export interface LightningBranch {
  key: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  startAt: number;
}

export function buildLightningBranches(cues: BoardEffectCue[]): LightningBranch[] {
  // One complete source-to-target sprite per branch; coincident endpoints are omitted.
  return cues.flatMap((cue, cueIndex) => cue.kind !== 'lightning' ? [] : cue.targets
    .filter(target => target.x !== cue.sourceX || target.y !== cue.sourceY)
    .map(target => ({
      key: `${cueIndex}:${target.index}`,
      sourceX: cue.sourceX, sourceY: cue.sourceY,
      targetX: target.x, targetY: target.y,
      startAt: cue.startAt,
    })));
}

export function lightningSpriteTransform(branch: LightningBranch, pitch: number, frameWidth: number, frameHeight: number): Transforms3d {
  const dx = branch.targetX - branch.sourceX, dy = branch.targetY - branch.sourceY;
  // Map the top center to the source and the impact core to the target.
  const impactHeight = frameHeight * LIGHTNING_IMPACT_HEIGHT_RATIO;
  return [
    { translateX: branch.sourceX * pitch }, { translateY: branch.sourceY * pitch },
    { rotate: Math.atan2(dy, dx) - Math.PI / 2 },
    { scaleX: pitch * 2 / frameWidth }, { scaleY: Math.hypot(dx, dy) * pitch / impactHeight },
    { translateX: -frameWidth / 2 },
  ];
}

export function lightningPlaybackFrame(elapsedMs: number, startAtMs: number, durationMs: number) {
  'worklet';
  const age = elapsedMs - startAtMs;
  if (age < 0 || elapsedMs >= durationMs) return { spriteIndex: 0, opacity: 0 };
  const tick = Math.floor(age / LIGHTNING_FRAME_MS);
  // 1,2,3,4 once, then 3,2,3,4 repeatedly (zero-based sprite indices).
  const spriteIndex = tick < 4 ? tick : [2, 1, 2, 3][(tick - 4) % 4];
  return { spriteIndex, opacity: 1 };
}
