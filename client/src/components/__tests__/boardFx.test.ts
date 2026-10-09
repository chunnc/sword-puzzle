import { mapPoint3d, processTransform3d } from '@shopify/react-native-skia/lib/commonjs/skia/types/Matrix4';
import { buildBoardEffectCues } from '../boardVisuals';
import { buildLightningBranches, lightningPlaybackFrame, lightningSpriteTransform } from '../boardFx';

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
