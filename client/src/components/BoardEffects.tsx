import React, { useMemo } from 'react';
import {
  Atlas, Group, Skia, useColorBuffer, useRectBuffer, useRSXformBuffer,
  type SkImage, type SkColor, type SkHostRect, type SkRSXform,
} from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';
import { BOARD_FIRE_MS, type BoardEffectCue, type BoardGeometry } from './boardVisuals';
import { buildLightningSpriteSpecs, lightningBoltFrame, particleAlpha } from './boardFx';

const FIRE_ATLAS_COLUMNS = 5;
const FIRE_ATLAS_ROWS = 3;
const FIRE_FRAME_COUNT = 12;
const FIRE_ATLAS_WIDTH = 960;
const FIRE_ATLAS_HEIGHT = 576;
const FIRE_BURST_MS = BOARD_FIRE_MS * .72;

const ATLAS_COLUMNS = 4;
const ATLAS_ROWS = 2;
const FALLBACK_ATLAS_WIDTH = 1024;
const FALLBACK_ATLAS_HEIGHT = 512;

function cellRect(image: SkImage | null, spriteIndex: number) {
  const width = image?.width() ?? FALLBACK_ATLAS_WIDTH;
  const height = image?.height() ?? FALLBACK_ATLAS_HEIGHT;
  const cellWidth = width / ATLAS_COLUMNS, cellHeight = height / ATLAS_ROWS;
  const inset = Math.min(4, cellWidth * .01, cellHeight * .01);
  return Skia.XYWHRect(
    spriteIndex % ATLAS_COLUMNS * cellWidth + inset,
    Math.floor(spriteIndex / ATLAS_COLUMNS) * cellHeight + inset,
    cellWidth - inset * 2,
    cellHeight - inset * 2,
  );
}

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
  durationMs,
  fireBurstImage,
  lightningImage,
}: {
  cues: BoardEffectCue[];
  geometry: BoardGeometry;
  side: number;
  progress: SharedValue<number>;
  durationMs: number;
  fireBurstImage: SkImage | null;
  lightningImage: SkImage | null;
}) {
  const pitch = side / geometry.width;
  const burstCellWidth = (fireBurstImage?.width() ?? FIRE_ATLAS_WIDTH) / FIRE_ATLAS_COLUMNS;
  const burstCellHeight = (fireBurstImage?.height() ?? FIRE_ATLAS_HEIGHT) / FIRE_ATLAS_ROWS;
  // Keep the fire playback budget consistent across standalone and mixed phases.
  const burstDuration = FIRE_BURST_MS / durationMs;
  const lightningCellWidth = (lightningImage?.width() ?? FALLBACK_ATLAS_WIDTH) / ATLAS_COLUMNS;
  const lightningCellHeight = (lightningImage?.height() ?? FALLBACK_ATLAS_HEIGHT) / ATLAS_ROWS;

  const fireCues = useMemo(() => cues.filter(cue => cue.kind === 'fire'), [cues]);
  const lightningSprites = useMemo(() => buildLightningSpriteSpecs(cues), [cues]);
  const lightningSpriteRects = useMemo(() => lightningSprites.map(sprite => cellRect(lightningImage, sprite.spriteIndex)), [lightningImage, lightningSprites]);

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

  const lightningTransforms = useRSXformBuffer(lightningSprites.length, (output, index) => {
    'worklet';
    const sprite = lightningSprites[index];
    if (!sprite) {
      output.set(0, 0, 0, 0);
      return;
    }
    const age = progress.value - sprite.startAt;
    const t = clamp01(age / sprite.lifetime);
    const boltFrame = sprite.kind === 'bolt' ? lightningBoltFrame(sprite, progress.value) : null;
    const drift = sprite.kind === 'spark' ? t : 0;
    const size = sprite.kind === 'spark' ? sprite.size * (1 - .68 * t)
      : sprite.kind === 'impact' ? sprite.size * (.72 + .32 * Math.sin(Math.PI * t))
        : sprite.size;
    const scale = pitch * size / lightningCellWidth;
    setCenteredTransform(
      output,
      (sprite.x + sprite.driftX * drift + (boltFrame?.offsetX ?? 0)) * pitch,
      (sprite.y + sprite.driftY * drift + (boltFrame?.offsetY ?? 0)) * pitch,
      sprite.angle + sprite.spin * t + (boltFrame?.rotation ?? 0),
      scale,
      lightningCellWidth,
      lightningCellHeight,
    );
  });
  const lightningColors = useColorBuffer(lightningSprites.length, (color, index) => {
    'worklet';
    const sprite = lightningSprites[index];
    const alpha = !sprite ? 0 : sprite.kind === 'bolt'
      ? lightningBoltFrame(sprite, progress.value).alpha
      : particleAlpha(progress.value - sprite.startAt, sprite.lifetime);
    setWhiteAlpha(color, alpha);
  });

  return <Group>
    {fireCues.length ?
      <Atlas image={fireBurstImage} sprites={burstRects} transforms={burstTransforms} colors={burstColors} colorBlendMode="modulate" />
      : null}
    {lightningSprites.length ? <Atlas image={lightningImage} sprites={lightningSpriteRects} transforms={lightningTransforms} colors={lightningColors} colorBlendMode="modulate" /> : null}
  </Group>;
}
