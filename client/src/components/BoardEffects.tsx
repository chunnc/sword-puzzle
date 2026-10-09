import React, { useMemo } from 'react';
import {
  Atlas, BlurMask, Group, Image, LinearGradient, Paint, Path, RoundedRect, Skia, useColorBuffer, useRectBuffer, useRSXformBuffer,
  type SkImage, type SkColor, type SkHostRect, type SkRSXform,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { BOARD_FIRE_MS, cellBounds, type BoardEffectCue, type BoardGeometry, type SwordBoardEffectCue, type SwordStroke } from './boardVisuals';
import {
  buildLightningBranches, lightningPlaybackFrame, lightningSpriteTransform, type LightningBranch,
  LIGHTNING_ATLAS_COLUMNS, LIGHTNING_ATLAS_ROWS, LIGHTNING_ATLAS_WIDTH, LIGHTNING_ATLAS_HEIGHT,
  swordSweepFrame, swordShardFrame, swordAfterimageOpacity, SWORD_SLASH_LENGTH_CELLS, SWORD_SLASH_THICKNESS_SCALE,
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
  renderTile,
}: {
  cues: BoardEffectCue[];
  geometry: BoardGeometry;
  side: number;
  progress: SharedValue<number>;
  elapsedMs: SharedValue<number>;
  durationMs: number;
  fireBurstImage: SkImage | null;
  lightningImage: SkImage | null;
  renderTile?: (index: number) => React.ReactNode;
}) {
  const pitch = side / geometry.width;
  const burstCellWidth = (fireBurstImage?.width() ?? FIRE_ATLAS_WIDTH) / FIRE_ATLAS_COLUMNS;
  const burstCellHeight = (fireBurstImage?.height() ?? FIRE_ATLAS_HEIGHT) / FIRE_ATLAS_ROWS;
  // Keep the fire playback budget consistent across standalone and mixed phases.
  const burstDuration = FIRE_BURST_MS / durationMs;
  const fireCues = useMemo(() => cues.filter(cue => cue.kind === 'fire'), [cues]);
  const lightningBranches = useMemo(() => buildLightningBranches(cues), [cues]);
  const swordCues = useMemo(() => cues.filter((cue): cue is SwordBoardEffectCue => cue.kind === 'slash' || cue.kind === 'cross'), [cues]);
  // Sword phases use a linear progress clock, shared with the whole-tile visibility.
  // Converting that same clock to ms prevents a frame with both the original and its fragments.
  const swordElapsedMs = useDerivedValue(() => progress.value * durationMs);

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
    {swordCues.map((cue, cueIndex) => <Group key={`sword-${cueIndex}`}>
      {renderTile ? cue.targets.map(target => <Group key={`fragments-${target.index}`}>
        <SwordFragment cue={cue} target={target} half={0} geometry={geometry} side={side}
          elapsedMs={swordElapsedMs} progress={progress}>{renderTile(target.index)}</SwordFragment>
        <SwordFragment cue={cue} target={target} half={1} geometry={geometry} side={side}
          elapsedMs={swordElapsedMs} progress={progress}>{renderTile(target.index)}</SwordFragment>
      </Group>) : null}
      {cue.strokes.map(stroke => <SwordSlash key={stroke.axis} stroke={stroke} pitch={pitch}
        elapsedMs={swordElapsedMs} progress={progress} />)}
    </Group>)}
    {fireCues.length ?
      <Atlas image={fireBurstImage} sprites={burstRects} transforms={burstTransforms} colors={burstColors} colorBlendMode="modulate" />
      : null}
    {lightningBranches.map(branch => <LightningSprite key={branch.key} branch={branch} image={lightningImage}
      pitch={pitch} elapsedMs={elapsedMs} progress={progress} durationMs={durationMs} />)}
  </Group>;
}

function SwordSlash({ stroke, pitch, elapsedMs, progress }: {
  stroke: SwordStroke; pitch: number; elapsedMs: SharedValue<number>; progress: SharedValue<number>;
}) {
  const length = Math.hypot(stroke.endX - stroke.startX, stroke.endY - stroke.startY) * pitch;
  const tail = pitch * SWORD_SLASH_LENGTH_CELLS;
  const thickness = pitch * SWORD_SLASH_THICKNESS_SCALE;
  const path = useMemo(() => Skia.Path.Make().moveTo(-tail, 0)
    .lineTo(-tail * .22, -thickness * .065).lineTo(0, 0)
    .lineTo(-tail * .22, thickness * .065).close(), [thickness, tail]);
  const core = useMemo(() => Skia.Path.Make().moveTo(-tail * .85, 0)
    .lineTo(-tail * .16, -thickness * .018).lineTo(0, 0)
    .lineTo(-tail * .16, thickness * .018).close(), [thickness, tail]);
  const transform = useDerivedValue(() => {
    const { head } = swordSweepFrame(elapsedMs.value, stroke.startAtMs, length, pitch);
    return [{ translateX: head }];
  });
  const opacity = useDerivedValue(() => progress.value < 1
    ? swordSweepFrame(elapsedMs.value, stroke.startAtMs, length, pitch).opacity : 0);
  const afterimageOpacity = useDerivedValue(() => progress.value < 1
    ? swordAfterimageOpacity(elapsedMs.value, stroke.startAtMs) : 0);
  return <Group transform={[
    { translateX: stroke.startX * pitch }, { translateY: stroke.startY * pitch },
    { rotate: stroke.axis === 'vertical' ? Math.PI / 2 : 0 },
  ]}>
    <RoundedRect x={0} y={-pitch * .02} width={length} height={pitch * .04} r={pitch * .02}
      color="#ffffff" opacity={afterimageOpacity} />
    <Group transform={transform} opacity={opacity}>
      <Path path={path} color="#ffc454" opacity={.6}><BlurMask blur={thickness * .07} style="normal" /></Path>
      <Path path={path}><LinearGradient start={{ x: -tail, y: 0 }} end={{ x: 0, y: 0 }}
        colors={['rgba(255,205,92,0)', '#ffd775', '#fff1bc']} positions={[0, .7, 1]} /></Path>
      <Path path={core}><LinearGradient start={{ x: -tail * .85, y: 0 }} end={{ x: 0, y: 0 }}
        colors={['rgba(255,255,255,0)', '#fff4d5', '#ffffff']} positions={[0, .5, 1]} /></Path>
    </Group>
  </Group>;
}

function SwordFragment({ cue, target, half, geometry, side, elapsedMs, progress, children }: {
  cue: SwordBoardEffectCue;
  target: SwordBoardEffectCue['targets'][number];
  half: 0 | 1;
  geometry: BoardGeometry;
  side: number;
  elapsedMs: SharedValue<number>;
  progress: SharedValue<number>;
  children: React.ReactNode;
}) {
  const bounds = cellBounds(target.index, side, geometry);
  const pitch = side / geometry.width;
  const clip = target.axis === 'horizontal'
    ? { ...bounds, y: bounds.y + half * bounds.height / 2, height: bounds.height / 2 }
    : { ...bounds, x: bounds.x + half * bounds.width / 2, width: bounds.width / 2 };
  const transform = useDerivedValue(() => {
    const frame = swordShardFrame(elapsedMs.value, cue.splitAtMs, target.axis, half, pitch);
    return [{ translateX: frame.tx }, { translateY: frame.ty }, { rotate: frame.rotation }];
  });
  const opacity = useDerivedValue(() => progress.value < 1
    ? swordShardFrame(elapsedMs.value, cue.splitAtMs, target.axis, half, pitch).opacity : 0);
  return <Group origin={{ x: clip.x + clip.width / 2, y: clip.y + clip.height / 2 }} transform={transform}
    layer={<Paint opacity={opacity} />}>
    <Group clip={clip}>{children}</Group>
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
