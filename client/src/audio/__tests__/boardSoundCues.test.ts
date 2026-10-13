import { boardSoundCues } from '../boardSoundCues';
import type { BoardAnimationEffect, BoardResolutionStep, BoardSnapshot, Tile } from '../../game/types';
import { TileKind } from '../../game/types';

function makeStep(effects: BoardAnimationEffect[], tiles: (Tile | null)[], cleared: number[]): BoardResolutionStep {
  return {
    before: { tiles } as BoardSnapshot,
    after: { tiles } as BoardSnapshot,
    cleared, changed: [], effects, falls: [], damage: 0, chain: 1,
  };
}

const soundIds = (step: BoardResolutionStep) => boardSoundCues(step).map(cue => cue.id);

const matchTrace = (cells: number[], source?: number): BoardAnimationEffect => ({
  kind: 'skill', cells, source, damage: 3, qi: 3, objectiveProgressAfter: {},
});

it('uses the shared match cue for ordinary three-cell matches and anchored four-matches', () => {
  const ordinary: Tile[] = Array.from({ length: 4 }, () => ({ kind: TileKind.Sword, chargeTier: 0, locked: false }));
  const fourMatch = [{ kind: TileKind.Sword, chargeTier: 4 as const, locked: false }, ...ordinary.slice(1)];
  expect(soundIds(makeStep([matchTrace([0, 1, 2])], ordinary.slice(0, 3), [0, 1, 2])))
    .toEqual(['match_spirit']);
  expect(soundIds(makeStep([matchTrace([0, 1, 2, 3])], fourMatch, [1, 2, 3])))
    .toEqual(['match_spirit']);
  const sealHit: Tile[] = [
    { kind: TileKind.Sword, chargeTier: 0, locked: true },
    { kind: TileKind.Sword, chargeTier: 0, locked: false },
    { kind: TileKind.Sword, chargeTier: 0, locked: false },
  ];
  expect(soundIds(makeStep([matchTrace([0, 1, 2])], sealHit, [1, 2])))
    .toEqual(['match_spirit']);
});

it('does not mistake targeted skill clears or short traces for ordinary matches', () => {
  const charged: Tile[] = Array.from({ length: 3 }, () => ({ kind: TileKind.Fire, chargeTier: 4, locked: false }));
  const targetedSkill: BoardAnimationEffect = { kind: 'skill', source: 0, cells: [0, 1, 2], damage: 3, qi: 3, objectiveProgressAfter: {} };
  expect(soundIds(makeStep([targetedSkill], charged, [0, 1, 2]))).toEqual([]);
  expect(soundIds(makeStep([matchTrace([0, 1])], charged, [0, 1]))).toEqual([]);
});

it.each([4, 5] as const)('uses the same fire sound for charged fire tier %s', tier => {
  const tiles: Tile[] = [{ kind: TileKind.Fire, chargeTier: tier, locked: false }];
  const fire: BoardAnimationEffect = { kind: 'fire', source: 0, cells: [0], damage: 0, qi: 0 };
  expect(soundIds(makeStep([fire], tiles, [0]))).toEqual(['fire_burst']);
});

it('plays one fire cue when a charged source appears in multiple traces in the same wave', () => {
  const tiles: Tile[] = [{ kind: TileKind.Fire, chargeTier: 4, locked: false }];
  const earlier: BoardAnimationEffect = { kind: 'fire', source: 0, cells: [0], damage: 0, qi: 0 };
  const activation: BoardAnimationEffect = { ...earlier, cells: [0, 1] };
  expect(soundIds(makeStep([earlier, activation], tiles, [0]))).toEqual(['fire_burst']);
});

it.each([4, 5] as const)('uses shared elemental cues and source delays for tier %s', tier => {
  const cases = [
    ['fire', TileKind.Fire, 'fire_burst', 220],
    ['lightning', TileKind.Lightning, 'lightning_chain', 0],
    ['spirit', TileKind.SpiritOrb, 'spirit_absorb', 200],
  ] as const;
  for (const [kind, tileKind, id, delayMs] of cases) {
    const trace: BoardAnimationEffect = { kind, origin: 'charged', source: 0, cells: [], qi: 0, damage: 0 };
    expect(boardSoundCues(makeStep([trace], [{ kind: tileKind, chargeTier: tier, locked: false }], [0])))
      .toEqual([{ id, traceIndex: 0, delayMs, reducedDelayMs: 0 }]);
  }
});

it.each([4, 5] as const)('plays exactly one slash per sword stroke for tier %s', tier => {
  const trace: BoardAnimationEffect = { kind: tier === 5 ? 'cross' : 'slash', origin: 'charged', swordChargeTier: tier,
    source: 0, cells: [0], qi: 0, damage: 0 };
  const cues = boardSoundCues(makeStep([trace], [{ kind: TileKind.Sword, chargeTier: tier, locked: false }], [0]));
  expect(cues.map(cue => [cue.id, cue.delayMs, cue.reducedDelayMs]))
    .toEqual(tier === 5 ? [['sword_slash', 0, 0], ['sword_slash', 60, 60]] : [['sword_slash', 0, 0]]);
});

it.each([
  ['hoa-lien', 'fire_burst'], ['dan-loi', 'lightning_chain'], ['hoi-linh', 'spirit_absorb'],
  ['thu', 'sword_slash'], ['nhat-kiem', 'sword_slash'], ['van-kiem', 'sword_slash'],
] as const)('maps skill %s independently of ordinary matches and charged activations', (skillId, id) => {
  const trace: BoardAnimationEffect = { kind: 'skill', origin: 'skill', skillId, cells: [0, 1, 2], qi: 0, damage: 0, objectiveProgressAfter: {} };
  const tiles: Tile[] = Array.from({ length: 3 }, () => ({ kind: TileKind.Fire, chargeTier: 0, locked: false }));
  expect(boardSoundCues(makeStep([trace], tiles, [0, 1, 2])))
    .toEqual([{ id, traceIndex: 0, delayMs: 0, reducedDelayMs: 0 }]);
});

it('groups rock sounds per actual breaking trace and never confuses seals with rocks', () => {
  const traces: BoardAnimationEffect[] = [
    { kind: 'skill', origin: 'skill', skillId: 'pha-chuong', cells: [0, 1, 2], brokenRocks: [0, 1], qi: 0, damage: 0, objectiveProgressAfter: {} },
    { kind: 'skill', origin: 'skill', skillId: 'pha-chuong', cells: [3], brokenRocks: [], qi: 0, damage: 0 },
    { kind: 'skill', origin: 'skill', skillId: 'lien-kiem', cells: [4], qi: 0, damage: 0 },
    { kind: 'fire', origin: 'charged', source: 4, cells: [], brokenRocks: [5], qi: 0, damage: 0 },
  ];
  expect(boardSoundCues(makeStep(traces, [], []))).toEqual([
    { id: 'rock_break', traceIndex: 0, delayMs: 0, reducedDelayMs: 0 },
    { id: 'rock_break', traceIndex: 3, delayMs: 0, reducedDelayMs: 0 },
    { id: 'fire_burst', traceIndex: 3, delayMs: 220, reducedDelayMs: 0 },
  ]);
});
