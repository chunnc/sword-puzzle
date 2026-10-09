import { mapPoint3d, processTransform3d } from '@shopify/react-native-skia/lib/commonjs/skia/types/Matrix4';
import { buildBoardEffectCues } from '../boardVisuals';
import { buildLightningBranches, lightningPlaybackFrame, lightningSpriteTransform, swordSweepFrame, swordShardFrame, swordAfterimageOpacity } from '../boardFx';

const geometry = { width: 7, height: 7, activeCells: Array(49).fill(true) };
function cueFor(cells: number[], source = 24) {
  return buildBoardEffectCues({
    id: 2, kind: 'clear', cleared: cells, changed: [],
    effects: [{ kind: 'lightning', cells, source, damage: 1, qi: 0 }],
  }, geometry)[0];
}

it('creates one deterministic branch per distinct target, omitting a zero-length branch', () => {
  const cue = cueFor([24, 10, 38, 26, 10]);
  const branches = buildLightningBranches([cue]);
  expect(branches).toHaveLength(3);
  expect(branches).toEqual(buildLightningBranches([cue]));
  expect(new Set(branches.map(branch => branch.key)).size).toBe(3);
  expect(branches.every(branch => branch.sourceX === cue.sourceX && branch.sourceY === cue.sourceY && branch.startAt === 0)).toBe(true);
  expect(buildLightningBranches([{ ...cue, kind: 'fire' }])).toHaveLength(0);
  expect(buildLightningBranches([cueFor([24])])).toHaveLength(0);
});

it('plays 1,2,3,4 once and then repeats 3,2,3,4 at exactly 120ms per frame', () => {
  const expected = [0, 1, 2, 3, 2, 1, 2, 3, 2, 1, 2, 3, 2, 1];
  expected.forEach((spriteIndex, tick) => {
    expect(lightningPlaybackFrame(tick * 120, 0, 1600)).toEqual({ spriteIndex, opacity: 1 });
    const lastMs = Math.min(tick * 120 + 119, 1599);
    expect(lightningPlaybackFrame(lastMs, 0, 1600)).toEqual({ spriteIndex, opacity: 1 });
  });
  expect(lightningPlaybackFrame(-1, 0, 1600).opacity).toBe(0);
  expect(lightningPlaybackFrame(1600, 0, 1600).opacity).toBe(0);
  expect(lightningPlaybackFrame(2000, 0, 1600).opacity).toBe(0);
});

it('starts each cue at its own elapsed time and hides it at phase completion', () => {
  expect(lightningPlaybackFrame(79, 80, 1600).opacity).toBe(0);
  expect(lightningPlaybackFrame(80, 80, 1600)).toEqual({ spriteIndex: 0, opacity: 1 });
  expect(lightningPlaybackFrame(200, 80, 1600)).toEqual({ spriteIndex: 1, opacity: 1 });
  expect(lightningPlaybackFrame(1599, 80, 1600).opacity).toBe(1);
  expect(lightningPlaybackFrame(1600, 80, 1600).opacity).toBe(0);
});

it.each([17, 31, 23, 25, 0, 6, 42, 48])('anchors the impact core at the target and keeps a two-cell width for cell %s', target => {
  const branch = buildLightningBranches([cueFor([target])])[0];
  for (const pitch of [25, 50]) {
    const matrix = processTransform3d(lightningSpriteTransform(branch, pitch, 192, 192));
    const top = mapPoint3d(matrix, [96, 0, 0]);
    const impact = mapPoint3d(matrix, [96, 160, 0]);
    expect(top[0]).toBeCloseTo(branch.sourceX * pitch);
    expect(top[1]).toBeCloseTo(branch.sourceY * pitch);
    expect(impact[0]).toBeCloseTo(branch.targetX * pitch);
    expect(impact[1]).toBeCloseTo(branch.targetY * pitch);
    const left = mapPoint3d(matrix, [0, 96, 0]);
    const right = mapPoint3d(matrix, [192, 96, 0]);
    expect(Math.hypot(right[0] - left[0], right[1] - left[1])).toBeCloseTo(pitch * 2);
  }
});

it('scales the impact anchor with the image frame dimensions', () => {
  const branch = buildLightningBranches([cueFor([48])])[0];
  const matrix = processTransform3d(lightningSpriteTransform(branch, 50, 96, 96));
  const impact = mapPoint3d(matrix, [48, 80, 0]);
  expect(impact[0]).toBeCloseTo(branch.targetX * 50);
  expect(impact[1]).toBeCloseTo(branch.targetY * 50);
});

it('sweeps a seven-cell blade over the complete line in 220ms and starts the vertical stroke at 60ms', () => {
  for (const pitch of [25, 50]) {
    expect(swordSweepFrame(-1, 0, 7 * pitch, pitch).opacity).toBe(0);
    const frames = [0, 55, 110, 165, 219].map(ms => swordSweepFrame(ms, 0, 7 * pitch, pitch));
    for (let i = 1; i < frames.length; i++) expect(frames[i].head).toBeGreaterThan(frames[i - 1].head);
    expect(frames.at(-1)!.head - pitch * 7).toBeGreaterThan(6.5 * pitch);
    expect(swordSweepFrame(220, 0, 7 * pitch, pitch).head - pitch * 7).toBeCloseTo(7 * pitch);
    expect(swordSweepFrame(220, 0, 7 * pitch, pitch).opacity).toBe(0);
    expect(swordSweepFrame(59, 60, 7 * pitch, pitch).opacity).toBe(0);
    expect(swordSweepFrame(60, 60, 7 * pitch, pitch).opacity).toBe(1);
    expect(swordSweepFrame(280, 60, 7 * pitch, pitch).opacity).toBe(0);
    expect(swordSweepFrame(208, 0, 7 * pitch, pitch).opacity).toBe(.5);
  }
});

it.each(['horizontal', 'vertical'] as const)('separates %s halves with opposite rotations and accelerating gravity', axis => {
  for (const half of [0, 1] as const) {
    expect(swordShardFrame(579, 580, axis, half, 50).opacity).toBe(0);
    expect(swordShardFrame(580, 580, axis, half, 50)).toEqual({ tx: 0, ty: 0, rotation: 0, opacity: 1 });
    const middle = swordShardFrame(830, 580, axis, half, 50);
    const late = swordShardFrame(955, 580, axis, half, 50);
    expect(late.ty).toBeGreaterThan(middle.ty);
    expect(Math.abs(late.rotation)).toBeGreaterThan(Math.abs(middle.rotation));
    expect(middle.rotation * (half === 0 ? -1 : 1)).toBeGreaterThan(0);
    expect(swordShardFrame(1080, 580, axis, half, 50).opacity).toBe(0);
    expect(swordShardFrame(1600, 580, axis, half, 50).opacity).toBe(0);
    const smaller = swordShardFrame(830, 580, axis, half, 25);
    expect(smaller.tx).toBeCloseTo(middle.tx / 2);
    expect(smaller.ty).toBeCloseTo(middle.ty / 2);
  }
  const a = swordShardFrame(830, 580, axis, 0, 50), b = swordShardFrame(830, 580, axis, 1, 50);
  if (axis === 'horizontal') expect(a.ty).toBeLessThan(b.ty);
  else expect(a.tx).toBeLessThan(b.tx);
  expect(a.rotation).toBe(-b.rotation);
});

it.each([0, 60])('leaves a stationary afterimage only after the sweep, fading linearly for 300ms (start=%s)', start => {
  expect(swordAfterimageOpacity(start + 219, start)).toBe(0);
  expect(swordAfterimageOpacity(start + 220, start)).toBe(.35);
  expect(swordAfterimageOpacity(start + 370, start)).toBeCloseTo(.175);
  expect(swordAfterimageOpacity(start + 519, start)).toBeGreaterThan(0);
  expect(swordAfterimageOpacity(start + 520, start)).toBe(0);
  expect(swordAfterimageOpacity(1600, start)).toBe(0);
});
