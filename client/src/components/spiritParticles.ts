import { BOARD_SPIRIT_MS, cellCenter, effectSeed, type BoardGeometry, type BoardVisualEffect } from './boardVisuals';

interface Point { x: number; y: number }
export interface SpiritFlightLayout {
  board: Point & { width: number; height: number };
  target: Point;
}
export interface SpiritFlightCue {
  key: string;
  sourceX: number;
  sourceY: number;
  chargeTier: 4 | 5;
  seed: number;
}
export interface SpiritParticle {
  source: Point;
  lifted: Point;
  control: Point;
  target: Point;
  delayMs: number;
  radius: number;
  phase: number;
  color: string;
  star: boolean;
}

export function buildSpiritFlightCues(effect: BoardVisualEffect | null, geometry: BoardGeometry, runId: string): SpiritFlightCue[] {
  if (effect?.kind !== 'clear') return [];
  return effect.effects.flatMap((trace, index) => {
    const source = trace.source;
    if (trace.kind !== 'spirit' || !trace.spiritChargeTier || source === undefined
      || !Number.isInteger(source) || source < 0 || source >= geometry.width * geometry.height
      || geometry.activeCells && !geometry.activeCells[source]) return [];
    const point = cellCenter(source, geometry);
    return [{ key: `${runId}:${effect.id}:${index}`, sourceX: point.x, sourceY: point.y,
      chargeTier: trace.spiritChargeTier, seed: effectSeed(runId, effect.id, source, `spirit:${index}`) }];
  });
}

export function buildSpiritParticles(cue: SpiritFlightCue, layout: SpiritFlightLayout, geometry: BoardGeometry): SpiritParticle[] {
  const pitch = layout.board.width / geometry.width;
  const source = { x: layout.board.x + cue.sourceX * pitch, y: layout.board.y + cue.sourceY * pitch };
  let seed = cue.seed;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
  return Array.from({ length: cue.chargeTier === 5 ? 28 : 16 }, (_, index) => {
    const lifted = { x: source.x + (random() - .5) * pitch * 1.1, y: source.y - pitch * (.3 + random() * .45) };
    return {
      source, lifted, target: layout.target,
      control: { x: lifted.x + (layout.target.x - lifted.x) * .2 + (random() - .5) * pitch * 1.5,
        y: lifted.y + (layout.target.y - lifted.y) * .15 - pitch * (.3 + random() * .6) },
      delayMs: random() * 100,
      radius: pitch * (.021 + random() * .012) * (cue.chargeTier === 5 ? 1.15 : 1),
      phase: random() * Math.PI * 2,
      color: ['#54ed67', '#77ff9b', '#b2ff79'][index % 3],
      star: index % 4 === 0,
    };
  });
}

export function spiritParticleFrame(particle: SpiritParticle, elapsedMs: number) {
  'worklet';
  const lift = Math.max(0, Math.min(1, elapsedMs / 180));
  const liftEase = 1 - Math.pow(1 - lift, 3);
  const travel = Math.max(0, Math.min(1, (elapsedMs - 180 - particle.delayMs) / (720 - particle.delayMs)));
  const t = travel * travel;
  const inverse = 1 - t;
  const start = elapsedMs < 180
    ? { x: particle.source.x + (particle.lifted.x - particle.source.x) * liftEase,
      y: particle.source.y + (particle.lifted.y - particle.source.y) * liftEase }
    : particle.lifted;
  const twinkle = .5 + .5 * Math.sin(elapsedMs * .028 + particle.phase);
  return {
    x: inverse * inverse * start.x + 2 * inverse * t * particle.control.x + t * t * particle.target.x,
    y: inverse * inverse * start.y + 2 * inverse * t * particle.control.y + t * t * particle.target.y,
    opacity: elapsedMs < 0 || elapsedMs >= 900 ? 0
      : Math.min(1, elapsedMs / 45) * (.55 + .45 * twinkle) * Math.min(1, (900 - elapsedMs) / 35),
    scale: .8 + .4 * twinkle,
    rotation: particle.phase + elapsedMs * .002,
  };
}

export function spiritArrivalOpacity(elapsedMs: number) {
  'worklet';
  const t = (elapsedMs - 900) / (BOARD_SPIRIT_MS - 900);
  return t <= 0 || t >= 1 ? 0 : Math.sin(t * Math.PI) * .85;
}
