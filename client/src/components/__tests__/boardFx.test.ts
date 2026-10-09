import { buildBoardEffectCues } from '../boardVisuals';
import {
  buildLightningSpriteSpecs,
  LIGHTNING_BOLT_CAP, LIGHTNING_SPARK_CAP, lightningBoltFrame, particleAlpha,
  type LightningSpriteSpec,
} from '../boardFx';

const geometry = { width: 7, height: 7, activeCells: Array(49).fill(true) };

function isBolt(sprite: LightningSpriteSpec): sprite is Extract<LightningSpriteSpec, { kind: 'bolt' }> {
  return sprite.kind === 'bolt';
}

function cueFor(kind: 'fire' | 'lightning', cells: number[], source = 24) {
  return buildBoardEffectCues({
    id: 2,
    kind: 'clear',
    cleared: cells,
    changed: [],
    effects: [{ kind, cells, source, damage: 1, qi: 0 }],
  }, geometry, 'fx-test')[0];
}

it('builds a deterministic lightning atlas and caps secondary sparks', () => {
  const first = cueFor('lightning', [25, 33, 41, 47, 40, 39, 38, 37, 36, 35, 34, 27]);
  const second = { ...cueFor('lightning', [23, 22, 21, 20, 19, 18, 17, 16]), startAt: .12 };
  const sprites = buildLightningSpriteSpecs([first, second]);
  expect(sprites).toEqual(buildLightningSpriteSpecs([first, second]));
  expect(sprites.filter(sprite => sprite.kind === 'spark')).toHaveLength(LIGHTNING_SPARK_CAP);
  expect(sprites.filter(sprite => sprite.kind === 'impact')).toHaveLength(first.targets.length + second.targets.length);
  expect(sprites.filter(sprite => sprite.kind === 'bolt').length).toBeGreaterThan(0);
  expect(sprites.filter(sprite => sprite.kind === 'bolt').length).toBeLessThanOrEqual(LIGHTNING_BOLT_CAP);
  expect(sprites.every(sprite => sprite.spriteIndex >= 0 && sprite.spriteIndex < 8)).toBe(true);

  const singleTarget = cueFor('lightning', [25]);
  const singleTargetSprites = buildLightningSpriteSpecs([singleTarget]);
  expect(singleTarget.targets[0].impactAt).toBe(.08);
  expect(singleTargetSprites.filter(sprite => !isBolt(sprite))
    .every(sprite => sprite.startAt + sprite.lifetime <= singleTarget.clearAt + 1e-9)).toBe(true);
  expect(singleTargetSprites.filter(isBolt)
    .every(sprite => sprite.holdUntil === singleTarget.clearAt)).toBe(true);
});

it('extends simultaneous branches from one source to each of three targets', () => {
  const cue = cueFor('lightning', [10, 38, 26]);
  const sprites = buildLightningSpriteSpecs([cue]);
  const impacts = sprites.filter(sprite => sprite.kind === 'impact');

  expect(cue.targets.map(target => target.index)).toEqual([10, 38, 26]);
  expect(new Set(cue.targets.map(target => target.impactAt))).toEqual(new Set([.08]));
  expect(impacts.map(sprite => sprite.targetIndex)).toEqual([0, 1, 2]);
  expect(impacts.map(sprite => sprite.startAt)).toEqual([.08, .08, .08]);

  cue.targets.forEach((target, targetIndex) => {
    const branch = sprites.filter((sprite): sprite is Extract<LightningSpriteSpec, { kind: 'bolt' }> =>
      isBolt(sprite) && sprite.targetIndex === targetIndex);
    expect(branch.length).toBeGreaterThan(1);
    expect(branch[0].startAt).toBe(cue.startAt);
    expect(branch.at(-1)!.startAt).toBe(target.impactAt);
    expect(branch.every(sprite => sprite.holdUntil === cue.clearAt)).toBe(true);

    const dx = target.x - cue.sourceX, dy = target.y - cue.sourceY;
    const length = Math.hypot(dx, dy);
    for (const sprite of branch) {
      const along = ((sprite.x - cue.sourceX) * dx + (sprite.y - cue.sourceY) * dy) / (length * length);
      const sideways = Math.abs(dx * (sprite.y - cue.sourceY) - dy * (sprite.x - cue.sourceX)) / length;
      expect(along).toBeGreaterThanOrEqual(0);
      expect(along).toBeLessThanOrEqual(1);
      expect(sideways).toBeLessThanOrEqual(.16);
    }

    const bolt = branch[0];
    const atSameProgress = lightningBoltFrame(bolt, .24);
    expect(lightningBoltFrame(bolt, .24)).toEqual(atSameProgress);
    expect(lightningBoltFrame(bolt, .24).alpha).toBeGreaterThan(0);
    expect(lightningBoltFrame(bolt, .3)).not.toEqual(atSameProgress);
    expect(lightningBoltFrame(bolt, .79).alpha).toBeGreaterThan(0);
    expect(lightningBoltFrame(bolt, .92).alpha).toBe(0);
  });

  expect(sprites.filter(sprite => !isBolt(sprite))
    .every(sprite => sprite.startAt + sprite.lifetime <= cue.clearAt + 1e-9)).toBe(true);
});

it('fades atlas sprites over their lifetime and hides them outside it', () => {
  expect(particleAlpha(-.01, .2)).toBe(0);
  expect(particleAlpha(0, .2)).toBe(0);
  expect(particleAlpha(.036, .2)).toBeCloseTo(1);
  expect(particleAlpha(.2, .2)).toBe(0);
  expect(particleAlpha(.1, .2)).toBeGreaterThan(0);
});
