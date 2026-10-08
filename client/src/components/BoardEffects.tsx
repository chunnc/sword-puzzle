import React, { useMemo } from 'react';
import {
  Atlas, Group, Skia, useColorBuffer, useRectBuffer, useRSXformBuffer,
  type SkImage, type SkColor, type SkHostRect, type SkRSXform,
} from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';
import type { BoardEffectCue, BoardGeometry } from './boardVisuals';
import { createFireParticleSpecs, buildLightningSpriteSpecs, particleAlpha } from './boardFx';

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
  fireBurstImage,
  fireParticleImage,
  lightningImage,
}: {
  cues: BoardEffectCue[];
  geometry: BoardGeometry;
  side: number;
  progress: SharedValue<number>;
  fireBurstImage: SkImage | null;
  fireParticleImage: SkImage | null;
  lightningImage: SkImage | null;
}) {
  const pitch = side / geometry.width;
  const burstCellWidth = (fireBurstImage?.width() ?? FALLBACK_ATLAS_WIDTH) / ATLAS_COLUMNS;
  const burstCellHeight = (fireBurstImage?.height() ?? FALLBACK_ATLAS_HEIGHT) / ATLAS_ROWS;
  const fireCellWidth = (fireParticleImage?.width() ?? FALLBACK_ATLAS_WIDTH) / ATLAS_COLUMNS;
  const fireCellHeight = (fireParticleImage?.height() ?? FALLBACK_ATLAS_HEIGHT) / ATLAS_ROWS;
  const lightningCellWidth = (lightningImage?.width() ?? FALLBACK_ATLAS_WIDTH) / ATLAS_COLUMNS;
  const lightningCellHeight = (lightningImage?.height() ?? FALLBACK_ATLAS_HEIGHT) / ATLAS_ROWS;

  const fireCues = useMemo(() => cues.filter(cue => cue.kind === 'fire'), [cues]);
  const fireParticles = useMemo(() => fireCues.flatMap(cue =>
    createFireParticleSpecs(cue).map(particle => ({ cue, particle }))), [fireCues]);
  const lightningSprites = useMemo(() => buildLightningSpriteSpecs(cues), [cues]);
  const fireSpriteRects = useMemo(() => fireParticles.map(({ particle }) => cellRect(fireParticleImage, particle.spriteIndex)), [fireParticleImage, fireParticles]);
  const lightningSpriteRects = useMemo(() => lightningSprites.map(sprite => cellRect(lightningImage, sprite.spriteIndex)), [lightningImage, lightningSprites]);

  const burstRects = useRectBuffer(fireCues.length, (rect: SkHostRect, index) => {
    'worklet';
    const cue = fireCues[index];
    if (!cue) {
      rect.setXYWH(0, 0, 0, 0);
      return;
    }
    const local = clamp01((progress.value - cue.startAt) / .62);
    const frame = Math.min(7, Math.floor(local * 8));
    rect.setXYWH(frame % 4 * burstCellWidth, Math.floor(frame / 4) * burstCellHeight, burstCellWidth, burstCellHeight);
  });
  const burstTransforms = useRSXformBuffer(fireCues.length, (output: SkRSXform, index) => {
    'worklet';
    const cue = fireCues[index];
    if (!cue) {
      output.set(0, 0, 0, 0);
      return;
    }
    const local = clamp01((progress.value - cue.startAt) / .62);
    const grow = clamp01(local / .48);
    const shrink = local < .68 ? 1 : 1 - .32 * clamp01((local - .68) / .32);
    const cellsWide = (.35 + 1.55 * (1 - (1 - grow) * (1 - grow))) * shrink;
    const seedAngle = ((cue.seed % 997) / 997 - .5) * .12;
    const scale = pitch * cellsWide / burstCellWidth;
    setCenteredTransform(output, cue.sourceX * pitch, cue.sourceY * pitch, seedAngle, scale, burstCellWidth, burstCellHeight);
  });
  const burstColors = useColorBuffer(fireCues.length, (color, index) => {
    'worklet';
    const cue = fireCues[index];
    const local = cue ? clamp01((progress.value - cue.startAt) / .62) : 1;
    setWhiteAlpha(color, local < .76 ? 1 : 1 - (local - .76) / .24);
  });

  const fireParticleTransforms = useRSXformBuffer(fireParticles.length, (output, index) => {
    'worklet';
    const item = fireParticles[index];
    if (!item) {
      output.set(0, 0, 0, 0);
      return;
    }
    const age = progress.value - item.particle.startAt;
    const t = clamp01(age / item.particle.lifetime);
    const distance = item.particle.speed * t;
    const x = item.cue.sourceX + Math.cos(item.particle.angle) * distance;
    const y = item.cue.sourceY + Math.sin(item.particle.angle) * distance - .2 * t + .16 * t * t;
    const scale = pitch * item.particle.size * (1 - .48 * t) / fireCellWidth;
    setCenteredTransform(
      output, x * pitch, y * pitch, item.particle.angle + item.particle.spin * t,
      scale, fireCellWidth, fireCellHeight,
    );
  });
  const fireParticleColors = useColorBuffer(fireParticles.length, (color, index) => {
    'worklet';
    const item = fireParticles[index];
    const alpha = item ? particleAlpha(progress.value - item.particle.startAt, item.particle.lifetime) : 0;
    setWhiteAlpha(color, alpha);
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
    const drift = sprite.kind === 'spark' ? t : 0;
    const size = sprite.kind === 'spark' ? sprite.size * (1 - .68 * t)
      : sprite.kind === 'impact' ? sprite.size * (.72 + .32 * Math.sin(Math.PI * t))
        : sprite.size;
    const scale = pitch * size / lightningCellWidth;
    setCenteredTransform(
      output,
      (sprite.x + sprite.driftX * drift) * pitch,
      (sprite.y + sprite.driftY * drift) * pitch,
      sprite.angle + sprite.spin * t,
      scale,
      lightningCellWidth,
      lightningCellHeight,
    );
  });
  const lightningColors = useColorBuffer(lightningSprites.length, (color, index) => {
    'worklet';
    const sprite = lightningSprites[index];
    const alpha = sprite ? particleAlpha(progress.value - sprite.startAt, sprite.lifetime) : 0;
    setWhiteAlpha(color, alpha);
  });

  return <Group>
    {fireCues.length ? <>
      <Atlas image={fireBurstImage} sprites={burstRects} transforms={burstTransforms} colors={burstColors} colorBlendMode="modulate" />
      <Atlas image={fireParticleImage} sprites={fireSpriteRects} transforms={fireParticleTransforms} colors={fireParticleColors} colorBlendMode="modulate" />
    </> : null}
    {lightningSprites.length ? <Atlas image={lightningImage} sprites={lightningSpriteRects} transforms={lightningTransforms} colors={lightningColors} colorBlendMode="modulate" /> : null}
  </Group>;
}
