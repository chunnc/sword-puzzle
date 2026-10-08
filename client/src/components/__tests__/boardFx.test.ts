import { buildBoardEffectCues } from '../boardVisuals';
import { buildLightningSpriteSpecs, createFireParticleSpecs, FIRE_EMBER_COUNT, FIRE_GLINT_COUNT, LIGHTNING_BOLT_CAP, LIGHTNING_SPARK_CAP, particleAlpha } from '../boardFx';

const geometry = { width: 7, height: 7, activeCells: Array(49).fill(true) };

function cueFor(kind: 'fire' | 'lightning', cells: number[], source = 24) {
  return buildBoardEffectCues({
    id: 2,
    kind: 'clear',
    cleared: cells,
    changed: [],
    effects: [{ kind, cells, source, damage: 1, qi: 0 }],
  }, geometry, 'fx-test')[0];
}

it('creates a fixed, varied atlas particle batch for a fire cue', () => {
  const cue = cueFor('fire', [24, 17, 25, 31]);
  const particles = createFireParticleSpecs(cue);
  expect(particles).toHaveLength(FIRE_EMBER_COUNT + FIRE_GLINT_COUNT);
  expect(particles).toEqual(createFireParticleSpecs(cue));
  expect(particles.slice(0, FIRE_EMBER_COUNT).every(particle => particle.spriteIndex >= 0 && particle.spriteIndex < 4)).toBe(true);
  expect(particles.slice(FIRE_EMBER_COUNT).every(particle => particle.spriteIndex >= 4 && particle.spriteIndex < 8)).toBe(true);
  expect(particles.every(particle => particle.startAt + particle.lifetime <= cue.clearAt)).toBe(true);
  expect(new Set(particles.map(particle => particle.angle)).size).toBeGreaterThan(8);
});

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
  expect(singleTarget.targets[0].impactAt).toBe(.55);
  expect(singleTargetSprites.every(sprite => sprite.startAt + sprite.lifetime <= singleTarget.clearAt + 1e-9)).toBe(true);
});

it('extends simultaneous branches from one source to each of three targets', () => {
  const cue = cueFor('lightning', [10, 38, 26]);
  const sprites = buildLightningSpriteSpecs([cue]);
  const impacts = sprites.filter(sprite => sprite.kind === 'impact');

  expect(cue.targets.map(target => target.index)).toEqual([10, 38, 26]);
  expect(new Set(cue.targets.map(target => target.impactAt))).toEqual(new Set([.55]));
  expect(impacts.map(sprite => sprite.targetIndex)).toEqual([0, 1, 2]);
  expect(impacts.map(sprite => sprite.startAt)).toEqual([.55, .55, .55]);

  cue.targets.forEach((target, targetIndex) => {
    const branch = sprites.filter(sprite => sprite.kind === 'bolt' && sprite.targetIndex === targetIndex);
    expect(branch.length).toBeGreaterThan(1);
    expect(branch[0].startAt).toBe(cue.startAt);
    expect(branch.at(-1)!.startAt).toBe(target.impactAt);
    expect(branch.every(sprite => sprite.holdUntil === target.impactAt)).toBe(true);

    const dx = target.x - cue.sourceX, dy = target.y - cue.sourceY;
    const length = Math.hypot(dx, dy);
    for (const sprite of branch) {
      const along = ((sprite.x - cue.sourceX) * dx + (sprite.y - cue.sourceY) * dy) / (length * length);
      const sideways = Math.abs(dx * (sprite.y - cue.sourceY) - dy * (sprite.x - cue.sourceX)) / length;
      expect(along).toBeGreaterThanOrEqual(0);
      expect(along).toBeLessThanOrEqual(1);
      expect(sideways).toBeLessThanOrEqual(.16);
    }
  });

  expect(sprites.every(sprite => (sprite.holdUntil ?? sprite.startAt) + sprite.lifetime <= cue.clearAt + 1e-9)).toBe(true);
});

it('fades atlas sprites over their lifetime and hides them outside it', () => {
  expect(particleAlpha(-.01, .2)).toBe(0);
  expect(particleAlpha(0, .2)).toBe(0);
  expect(particleAlpha(.036, .2)).toBeCloseTo(1);
  expect(particleAlpha(.2, .2)).toBe(0);
  expect(particleAlpha(.1, .2)).toBeGreaterThan(0);
});
