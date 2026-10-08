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
  expect(new Set(particles.map(particle => particle.angle)).size).toBeGreaterThan(8);
});

it('builds a chained lightning atlas with target impacts and caps secondary sparks', () => {
  const first = cueFor('lightning', [25, 33, 41, 47, 40, 39, 38, 37, 36, 35, 34, 27]);
  const second = { ...cueFor('lightning', [23, 22, 21, 20, 19, 18, 17, 16]), startAt: .12 };
  const sprites = buildLightningSpriteSpecs([first, second]);
  expect(sprites).toEqual(buildLightningSpriteSpecs([first, second]));
  expect(sprites.filter(sprite => sprite.kind === 'spark')).toHaveLength(LIGHTNING_SPARK_CAP);
  expect(sprites.filter(sprite => sprite.kind === 'impact')).toHaveLength(first.targets.length + second.targets.length);
  expect(sprites.filter(sprite => sprite.kind === 'bolt').length).toBeGreaterThan(0);
  expect(sprites.filter(sprite => sprite.kind === 'bolt').length).toBeLessThanOrEqual(LIGHTNING_BOLT_CAP);
  expect(sprites.every(sprite => sprite.spriteIndex >= 0 && sprite.spriteIndex < 8)).toBe(true);
});

it('fades atlas sprites over their lifetime and hides them outside it', () => {
  expect(particleAlpha(-.01, .2)).toBe(0);
  expect(particleAlpha(0, .2)).toBe(0);
  expect(particleAlpha(.036, .2)).toBeCloseTo(1);
  expect(particleAlpha(.2, .2)).toBe(0);
  expect(particleAlpha(.1, .2)).toBeGreaterThan(0);
});
