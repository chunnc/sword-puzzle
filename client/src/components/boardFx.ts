import type { BoardEffectCue } from './boardVisuals';

export const FIRE_EMBER_COUNT = 12;
export const FIRE_GLINT_COUNT = 4;
export const LIGHTNING_SPARK_CAP = 16;
export const LIGHTNING_BOLT_CAP = 96;

export interface FireParticleSpec {
  spriteIndex: number;
  angle: number;
  speed: number;
  size: number;
  startAt: number;
  lifetime: number;
  spin: number;
}

export interface LightningSpriteSpec {
  spriteIndex: number;
  x: number;
  y: number;
  angle: number;
  size: number;
  startAt: number;
  lifetime: number;
  kind: 'bolt' | 'impact' | 'spark';
  driftX: number;
  driftY: number;
  spin: number;
}

function randomSource(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function createFireParticleSpecs(cue: BoardEffectCue): FireParticleSpec[] {
  const random = randomSource(cue.seed);
  const count = FIRE_EMBER_COUNT + FIRE_GLINT_COUNT;
  return Array.from({ length: count }, (_, index) => {
    const glint = index >= FIRE_EMBER_COUNT;
    const ringAngle = glint
      ? ((index - FIRE_EMBER_COUNT) / FIRE_GLINT_COUNT + .125) * Math.PI * 2
      : index / FIRE_EMBER_COUNT * Math.PI * 2;
    return {
      spriteIndex: glint ? 4 + Math.floor(random() * 4) : Math.floor(random() * 4),
      angle: ringAngle + (random() - .5) * .62,
      speed: glint ? .42 + random() * .6 : .58 + random() * .9,
      size: glint ? .2 + random() * .12 : .23 + random() * .16,
      startAt: cue.startAt + (glint ? .13 : .15) + random() * .075,
      lifetime: .36 + random() * .14,
      spin: (random() - .5) * 3.8,
    };
  });
}

export function buildLightningSpriteSpecs(cues: BoardEffectCue[]): LightningSpriteSpec[] {
  const sprites: LightningSpriteSpec[] = [];
  let sparks = 0;
  let bolts = 0;
  for (const cue of cues) {
    if (cue.kind !== 'lightning') continue;
    let fromX = cue.sourceX, fromY = cue.sourceY;
    const random = randomSource(cue.seed);
    for (let targetIndex = 0; targetIndex < cue.targets.length; targetIndex++) {
      const target = cue.targets[targetIndex];
      const dx = target.x - fromX, dy = target.y - fromY;
      const distance = Math.hypot(dx, dy);
      const segmentCount = distance < .05 ? 0 : Math.min(14, Math.max(1, Math.ceil(distance / .58)));
      const normalX = distance > .05 ? -dy / distance : 0;
      const normalY = distance > .05 ? dx / distance : 0;
      const travelStart = Math.max(cue.startAt, target.impactAt - .13);
      for (let segment = 0; segment < segmentCount; segment++) {
        const t = (segment + .5) / segmentCount;
        const bend = (random() - .5) * .3;
        const along = (random() - .5) * .06;
        const spriteIndex = Math.floor(random() * 4);
        const angleJitter = (random() - .5) * .22;
        const size = .82 + random() * .14;
        if (bolts < LIGHTNING_BOLT_CAP) {
          sprites.push({
            spriteIndex,
            x: fromX + dx * (t + along) + normalX * bend,
            y: fromY + dy * (t + along) + normalY * bend,
            angle: Math.atan2(dy, dx) + Math.PI / 4 + angleJitter,
            size,
            startAt: travelStart + (target.impactAt - travelStart) * (segment + 1) / segmentCount,
            lifetime: .12,
            kind: 'bolt',
            driftX: 0,
            driftY: 0,
            spin: 0,
          });
          bolts++;
        }
      }
      sprites.push({
        spriteIndex: 4 + Math.floor(random() * 4),
        x: target.x,
        y: target.y,
        angle: random() * Math.PI * 2,
        size: .84 + random() * .24,
        startAt: target.impactAt,
        lifetime: .17,
        kind: 'impact',
        driftX: 0,
        driftY: 0,
        spin: 0,
      });
      for (let spark = 0; spark < 2 && sparks < LIGHTNING_SPARK_CAP; spark++, sparks++) {
        const angle = random() * Math.PI * 2;
        const speed = .35 + random() * .55;
        sprites.push({
          spriteIndex: 4 + Math.floor(random() * 4),
          x: target.x,
          y: target.y,
          angle: angle + Math.PI / 4,
          size: .22 + random() * .13,
          startAt: target.impactAt + .015 + random() * .045,
          lifetime: .18 + random() * .07,
          kind: 'spark',
          driftX: Math.cos(angle) * speed,
          driftY: Math.sin(angle) * speed,
          spin: (random() - .5) * 4,
        });
      }
      fromX = target.x;
      fromY = target.y;
    }
  }
  return sprites;
}

export function particleAlpha(age: number, lifetime: number) {
  'worklet';
  if (age < 0 || age >= lifetime) return 0;
  const normalized = age / lifetime;
  return normalized < .18 ? normalized / .18 : 1 - (normalized - .18) / .82;
}
