import { buildSpiritFlightCues, buildSpiritParticles, spiritArrivalOpacity, spiritParticleFrame, type SpiritFlightLayout } from '../spiritParticles';
import { boardClearDurationMs, type BoardVisualEffect } from '../boardVisuals';

const geometry = { width: 7, height: 7, activeCells: Array(49).fill(true) };
const effect = (tier: 4 | 5, source = 24): BoardVisualEffect => ({ id: 7, kind: 'clear', cleared: [source], changed: [],
  effects: [{ kind: 'spirit', source, cells: [], spiritChargeTier: tier, qi: 0, damage: 0 }] });
const layout: SpiritFlightLayout = { board: { x: 12, y: 90, width: 350, height: 350 }, target: { x: 187, y: 480 } };

it.each([4, 5] as const)('animates tier %s even with empty cells and zero qi at the cap', tier => {
  const cues = buildSpiritFlightCues(effect(tier), geometry, 'run-a');
  expect(cues).toHaveLength(1);
  expect(cues[0]).toMatchObject({ sourceX: 3.5, sourceY: 3.5, chargeTier: tier });
  const clear = effect(tier) as Extract<BoardVisualEffect, { kind: 'clear' }>;
  expect(boardClearDurationMs(clear.effects)).toBe(1000);
  expect(buildSpiritParticles(cues[0], layout, geometry)).toHaveLength(tier === 5 ? 28 : 16);
});

it('does not emit for creation, ordinary clears, invalid sources or inactive cells', () => {
  const clear = effect(4) as Extract<BoardVisualEffect, { kind: 'clear' }>;
  expect(buildSpiritFlightCues({ ...clear, effects: [{ ...clear.effects[0], kind: 'skill' }] }, geometry, 'a')).toEqual([]);
  expect(buildSpiritFlightCues({ ...clear, effects: [{ ...clear.effects[0], spiritChargeTier: undefined }] }, geometry, 'a')).toEqual([]);
  for (const source of [-1, 49, 1.5, undefined]) {
    expect(buildSpiritFlightCues({ ...clear, effects: [{ ...clear.effects[0], source }] }, geometry, 'a')).toEqual([]);
  }
  expect(buildSpiritFlightCues(clear, { ...geometry, activeCells: Array(49).fill(false) }, 'a')).toEqual([]);
  expect(buildSpiritFlightCues(null, geometry, 'a')).toEqual([]);
});

it('keeps seeded particles stable across equivalent renders and varies them between runs/phases', () => {
  const cue = buildSpiritFlightCues(effect(5), geometry, 'a')[0];
  const particles = buildSpiritParticles(cue, layout, geometry);
  expect(buildSpiritParticles(buildSpiritFlightCues(effect(5), geometry, 'a')[0], layout, geometry)).toEqual(particles);
  expect(buildSpiritFlightCues(effect(5), geometry, 'b')[0].seed).not.toBe(cue.seed);
  expect(buildSpiritFlightCues({ ...effect(5), id: 8 }, geometry, 'a')[0].seed).not.toBe(cue.seed);
  expect(new Set(particles.map(p => p.delayMs)).size).toBe(28);
});

it.each([210, 350])('lifts each particle, then converges outside the board at width %s', width => {
  const measured = { ...layout, board: { ...layout.board, width, height: width } };
  const cue = buildSpiritFlightCues(effect(5), geometry, 'a')[0];
  for (const particle of buildSpiritParticles(cue, measured, geometry)) {
    expect(spiritParticleFrame(particle, 0)).toMatchObject({ x: 12 + width / 2, y: 90 + width / 2, opacity: 0 });
    const lifted = spiritParticleFrame(particle, 180);
    expect(lifted.y).toBeLessThan(particle.source.y - width / 7 * .29);
    expect(lifted.y).toBeGreaterThan(particle.source.y - width / 7 * .76);
    expect(lifted.opacity).toBeGreaterThan(0);
    const arrival = spiritParticleFrame(particle, 900);
    expect(arrival.x).toBeCloseTo(layout.target.x);
    expect(arrival.y).toBeCloseTo(layout.target.y);
    expect(arrival.opacity).toBe(0);
    expect(spiritParticleFrame(particle, -1).opacity).toBe(0);
    expect(spiritParticleFrame(particle, 1000).opacity).toBe(0);
    expect(spiritParticleFrame(particle, 1600).opacity).toBe(0);
  }
  expect(spiritArrivalOpacity(899)).toBe(0);
  expect(spiritArrivalOpacity(950)).toBeCloseTo(.85);
  expect(spiritArrivalOpacity(1000)).toBe(0);
});

it('uses the board renderer coordinates on rectangular boards and preserves multiple orb sources', () => {
  const rectangular = { width: 5, height: 6 };
  const clear = effect(4, 0) as Extract<BoardVisualEffect, { kind: 'clear' }>;
  clear.effects.push({ ...clear.effects[0], source: 29, spiritChargeTier: 5 });
  const cues = buildSpiritFlightCues(clear, rectangular, 'a');
  const measured = { ...layout, board: { x: 20, y: 100, width: 200, height: 240 } };
  expect(buildSpiritParticles(cues[0], measured, rectangular)[0].source).toEqual({ x: 40, y: 320 });
  expect(buildSpiritParticles(cues[1], measured, rectangular)[0].source).toEqual({ x: 200, y: 120 });
  expect(cues[0].key).not.toBe(cues[1].key);
});
