import React, { useMemo } from 'react';
import {
  Atlas, Group, Image, useColorBuffer, useRectBuffer, useRSXformBuffer,
  type SkImage, type SkColor, type SkHostRect, type SkRSXform,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { BOARD_FIRE_MS, type BoardEffectCue, type BoardGeometry } from './boardVisuals';
import {
  buildLightningBranches, lightningPlaybackFrame, lightningSpriteTransform, type LightningBranch,
  LIGHTNING_ATLAS_COLUMNS, LIGHTNING_ATLAS_ROWS, LIGHTNING_ATLAS_WIDTH, LIGHTNING_ATLAS_HEIGHT,
} from './boardFx';

const FIRE_ATLAS_COLUMNS = 5;
const FIRE_ATLAS_ROWS = 3;
const FIRE_FRAME_COUNT = 12;
const FIRE_ATLAS_WIDTH = 960;
const FIRE_ATLAS_HEIGHT = 576;
const FIRE_BURST_MS = BOARD_FIRE_MS * .72;

function setWhiteAlpha(color: SkColor, alpha: number) {
  'worklet';
  color[0] = 1;
  color[1] = 1;
  color[2] = 1;
  color[3] = Math.max(0, Math.min(1, alpha));
}

function setCenteredTransform(
  output: SkRSXform,
  x: number,
  y: number,
  angle: number,
  scale: number,
  sourceWidth: number,
  sourceHeight: number,
) {
  'worklet';
  const ssin = Math.sin(angle) * scale;
  const scos = Math.cos(angle) * scale;
  output.set(
    scos,
    ssin,
    x - scos * sourceWidth / 2 + ssin * sourceHeight / 2,
    y - ssin * sourceWidth / 2 - scos * sourceHeight / 2,
  );
}

function clamp01(value: number) {
  'worklet';
  return Math.max(0, Math.min(1, value));
}

export function BoardEffects({
  cues,
  geometry,
  side,
  progress,
  elapsedMs,
  durationMs,
  fireBurstImage,
  lightningImage,
}: {
  cues: BoardEffectCue[];
  geometry: BoardGeometry;
  side: number;
  progress: SharedValue<number>;
  elapsedMs: SharedValue<number>;
  durationMs: number;
  fireBurstImage: SkImage | null;
  lightningImage: SkImage | null;
}) {
  const pitch = side / geometry.width;
  const burstCellWidth = (fireBurstImage?.width() ?? FIRE_ATLAS_WIDTH) / FIRE_ATLAS_COLUMNS;
  const burstCellHeight = (fireBurstImage?.height() ?? FIRE_ATLAS_HEIGHT) / FIRE_ATLAS_ROWS;
  // Keep the fire playback budget consistent across standalone and mixed phases.
  const burstDuration = FIRE_BURST_MS / durationMs;
  const fireCues = useMemo(() => cues.filter(cue => cue.kind === 'fire'), [cues]);
  const lightningBranches = useMemo(() => buildLightningBranches(cues), [cues]);

  const burstRects = useRectBuffer(fireCues.length, (rect: SkHostRect, index) => {
    'worklet';
    const cue = fireCues[index];
    if (!cue) {
      rect.setXYWH(0, 0, 0, 0);
      return;
    }
    const local = clamp01((progress.value - cue.startAt) / burstDuration);
    const frame = Math.min(FIRE_FRAME_COUNT - 1, Math.floor(local * FIRE_FRAME_COUNT));
    rect.setXYWH(frame % FIRE_ATLAS_COLUMNS * burstCellWidth, Math.floor(frame / FIRE_ATLAS_COLUMNS) * burstCellHeight, burstCellWidth, burstCellHeight);
  });
  const burstTransforms = useRSXformBuffer(fireCues.length, (output: SkRSXform, index) => {
    'worklet';
    const cue = fireCues[index];
    if (!cue) {
      output.set(0, 0, 0, 0);
      return;
    }
    const scale = pitch * 4.5 / burstCellWidth;
    setCenteredTransform(output, cue.sourceX * pitch, cue.sourceY * pitch, 0, scale, burstCellWidth, burstCellHeight);
  });
  const burstColors = useColorBuffer(fireCues.length, (color, index) => {
    'worklet';
    const cue = fireCues[index];
    const active = cue && progress.value >= cue.startAt && progress.value < cue.startAt + burstDuration;
    setWhiteAlpha(color, active ? 1 : 0);
  });

  return <Group>
    {fireCues.length ?
      <Atlas image={fireBurstImage} sprites={burstRects} transforms={burstTransforms} colors={burstColors} colorBlendMode="modulate" />
      : null}
    {lightningBranches.map(branch => <LightningSprite key={branch.key} branch={branch} image={lightningImage}
      pitch={pitch} elapsedMs={elapsedMs} progress={progress} durationMs={durationMs} />)}
  </Group>;
}

function LightningSprite({ branch, image, pitch, elapsedMs, progress, durationMs }: {
  branch: LightningBranch;
  image: SkImage | null;
  pitch: number;
  elapsedMs: SharedValue<number>;
  progress: SharedValue<number>;
  durationMs: number;
}) {
  const imageWidth = image?.width() ?? LIGHTNING_ATLAS_WIDTH;
  const imageHeight = image?.height() ?? LIGHTNING_ATLAS_HEIGHT;
  const frameWidth = imageWidth / LIGHTNING_ATLAS_COLUMNS;
  const frameHeight = imageHeight / LIGHTNING_ATLAS_ROWS;
  const startAtMs = branch.startAt * durationMs;
  const transform = useMemo(() => lightningSpriteTransform(branch, pitch, frameWidth, frameHeight),
    [branch, pitch, frameWidth, frameHeight]);
  const x = useDerivedValue(() => -lightningPlaybackFrame(elapsedMs.value, startAtMs, durationMs).spriteIndex * frameWidth);
  // Phase completion/cleanup also hides sprites if it wins the clock's last frame.
  const opacity = useDerivedValue(() => progress.value < 1
    ? lightningPlaybackFrame(elapsedMs.value, startAtMs, durationMs).opacity : 0);
  return <Group transform={transform} opacity={opacity}>
    <Group clip={{ x: 0, y: 0, width: frameWidth, height: frameHeight }}>
      <Image image={image} x={x} y={0} width={imageWidth} height={imageHeight} fit="fill" />
    </Group>
  </Group>;
}
