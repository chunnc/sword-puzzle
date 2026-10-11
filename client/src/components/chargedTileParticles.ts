import { TileKind } from '../game/types';
import { chargedTileParticle as config } from '../theme';

export interface ParticleBounds { x: number; y: number; width: number; height: number }

export function chargedParticleRadius(bounds: ParticleBounds) {
  'worklet';
  return Math.min(config.maxRadius, Math.min(bounds.width, bounds.height) * config.radiusRatio);
}

export function chargedParticleStyle(kind: TileKind) {
  switch (kind) {
    case TileKind.Sword: return { color: config.colors.sword, phase: 0 };
    case TileKind.Fire: return { color: config.colors.fire, phase: .25 };
    case TileKind.Lightning: return { color: config.colors.lightning, phase: .5 };
    case TileKind.SpiritOrb: return { color: config.colors.spirit, phase: .75 };
    default: return null;
  }
}

// Arc-length parameterization keeps the speed constant, including at corners.
export function roundedPerimeterPoint(bounds: ParticleBounds, phase: number) {
  'worklet';
  const inset = Math.max(Math.min(bounds.width, bounds.height) * config.insetRatio,
    chargedParticleRadius(bounds) * config.haloRatio);
  const left = bounds.x + inset, top = bounds.y + inset;
  const width = Math.max(0, bounds.width - 2 * inset), height = Math.max(0, bounds.height - 2 * inset);
  const r = Math.min(width, height) * config.cornerRatio;
  const horizontal = width - 2 * r, vertical = height - 2 * r, arc = Math.PI * r / 2;
  const perimeter = 2 * (horizontal + vertical) + 4 * arc;
  if (perimeter <= 0) return { x: left, y: top };
  let distance = ((phase % 1 + 1) % 1) * perimeter;
  const lengths = [horizontal, arc, vertical, arc, horizontal, arc, vertical, arc];
  let segment = 0;
  while (segment < 7 && distance > lengths[segment]) distance -= lengths[segment++];
  const right = left + width, bottom = top + height;
  if (segment === 0) return { x: left + r + distance, y: top };
  if (segment === 2) return { x: right, y: top + r + distance };
  if (segment === 4) return { x: right - r - distance, y: bottom };
  if (segment === 6) return { x: left, y: bottom - r - distance };
  const angle = (segment - 3) * Math.PI / 4 + (r ? distance / r : 0);
  const cx = segment === 1 || segment === 3 ? right - r : left + r;
  const cy = segment === 1 || segment === 7 ? top + r : bottom - r;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

export function chargedParticleFrame(bounds: ParticleBounds, phase: number, elementPhase: number, reduced: boolean, tail = 0) {
  'worklet';
  const position = reduced ? .25 : phase + elementPhase;
  const point = roundedPerimeterPoint(bounds, position - tail * config.tailSpacing);
  const radius = chargedParticleRadius(bounds);
  const twinkle = reduced ? 1 : .8 + .2 * Math.cos(position * Math.PI * 6);
  const sparkle = reduced ? .65 : .35 + .65 * (.5 + .5 * Math.cos(position * Math.PI * 8));
  return { ...point, radius: radius * (tail ? 1 - tail * .15 : 1),
    opacity: tail ? (.6 - tail * .1) * twinkle : twinkle,
    sparkleScale: .7 + sparkle * .55, sparkleOpacity: .35 + sparkle * .65 };
}
