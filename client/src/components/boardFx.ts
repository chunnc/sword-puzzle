import type { Transforms3d } from '@shopify/react-native-skia';
import type { BoardEffectCue } from './boardVisuals';

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
