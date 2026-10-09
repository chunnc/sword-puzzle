import { chargedParticleFrame, chargedParticleRadius, chargedParticleStyle, roundedPerimeterPoint } from '../chargedTileParticles';
import { chargedTileParticle as config } from '../../theme';
import { TileKind } from '../../game/types';

const bounds = { x: 0, y: 0, width: 100, height: 100 };

it('increases the radius by 50% and completes a lap in 1.6 seconds', () => {
  expect(config.cycleMs).toBe(1600);
  for (const size of [20, 38, 48, 70, 100]) {
    const cell = { x: 0, y: 0, width: size, height: size };
    expect(chargedParticleRadius(cell)).toBeCloseTo(Math.min(1.6, size * .03) * 1.5);
  }
});

it('travels clockwise around all four sides and closes the loop smoothly', () => {
  const expected = [{ x: 12.2, y: 8 }, { x: 92, y: 12.2 }, { x: 87.8, y: 92 }, { x: 8, y: 87.8 }];
  expected.forEach((point, i) => {
    const actual = roundedPerimeterPoint(bounds, i / 4);
    expect(actual.x).toBeCloseTo(point.x);
    expect(actual.y).toBeCloseTo(point.y);
  });
  expect(roundedPerimeterPoint(bounds, 1)).toEqual(roundedPerimeterPoint(bounds, 0));
  const before = roundedPerimeterPoint(bounds, 1 - 1e-7), after = roundedPerimeterPoint(bounds, 1e-7);
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(.001);
  expect(roundedPerimeterPoint(bounds, -.25)).toEqual(roundedPerimeterPoint(bounds, .75));
});

it('uses equal distance per unit time on a straight and a rounded corner', () => {
  const r = 4.2, straight = 75.6, perimeter = straight * 4 + Math.PI * r * 2;
  const delta = .001;
  const a = roundedPerimeterPoint(bounds, .05), b = roundedPerimeterPoint(bounds, .05 + delta);
  expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(perimeter * delta, 6);
  const start = straight / perimeter + .003;
  const c = roundedPerimeterPoint(bounds, start), d = roundedPerimeterPoint(bounds, start + delta);
  const angle = (point: { x: number; y: number }) => Math.atan2(point.y - 12.2, point.x - 87.8);
  expect((angle(d) - angle(c)) * r).toBeCloseTo(perimeter * delta, 6);
});

it.each([20, 38, 48, 70])('keeps the head and its halo within a %s px cell', size => {
  const cell = { x: 1, y: 1, width: size, height: size };
  for (let tick = 0; tick < 240; tick++) {
    const frame = chargedParticleFrame(cell, tick / 240, .25, false);
    const halo = frame.radius * config.haloRatio;
    expect(frame.x - halo).toBeGreaterThanOrEqual(cell.x - 1e-10);
    expect(frame.y - halo).toBeGreaterThanOrEqual(cell.y - 1e-10);
    expect(frame.x + halo).toBeLessThanOrEqual(cell.x + size + 1e-10);
    expect(frame.y + halo).toBeLessThanOrEqual(cell.y + size + 1e-10);
  }
});

it('keeps a short diminishing tail across the loop boundary and does not blink out', () => {
  const frames = Array.from({ length: 5 }, (_, tail) => chargedParticleFrame(bounds, .001, 0, false, tail));
  for (let i = 1; i < frames.length; i++) {
    expect(frames[i].radius).toBeLessThan(frames[i - 1].radius);
    expect(frames[i].opacity).toBeLessThan(frames[i - 1].opacity);
    expect(Number.isFinite(frames[i].x + frames[i].y)).toBe(true);
  }
  expect(config.tailSpacing * config.tailCount).toBeLessThan(.08);
  for (let tick = 0; tick < 240; tick++) expect(chargedParticleFrame(bounds, tick / 240, 0, false).opacity).toBeGreaterThanOrEqual(.6);
});

it('freezes all element phases at the top right without twinkling in Reduce Motion', () => {
  const frozen = chargedParticleFrame(bounds, 0, 0, true);
  expect(frozen.x).toBe(92);
  expect(frozen.y).toBeCloseTo(12.2);
  expect(frozen.opacity).toBe(1);
  expect(chargedParticleFrame(bounds, .8, .75, true)).toEqual(frozen);
  expect(chargedParticleStyle(TileKind.Rock)).toBeNull();
  expect(new Set([TileKind.Fire, TileKind.Sword, TileKind.Lightning, TileKind.SpiritOrb]
    .map(kind => chargedParticleStyle(kind)!.color)).size).toBe(4);
});
