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

const matchTrace = (cells: number[], source?: number): BoardAnimationEffect => ({
  kind: 'skill', cells, source, damage: 3, qi: 3, objectiveProgressAfter: {},
});

it('uses the shared match cue for ordinary three-cell matches and anchored four-matches', () => {
  const ordinary: Tile[] = Array.from({ length: 4 }, () => ({ kind: TileKind.Sword, chargeTier: 0, locked: false }));
  const fourMatch = [{ kind: TileKind.Sword, chargeTier: 4 as const, locked: false }, ...ordinary.slice(1)];
  expect(boardSoundCues(makeStep([matchTrace([0, 1, 2])], ordinary.slice(0, 3), [0, 1, 2])))
    .toEqual(['match_spirit']);
  expect(boardSoundCues(makeStep([matchTrace([0, 1, 2, 3])], fourMatch, [1, 2, 3])))
    .toEqual(['match_spirit']);
  const sealHit: Tile[] = [
    { kind: TileKind.Sword, chargeTier: 0, locked: true },
    { kind: TileKind.Sword, chargeTier: 0, locked: false },
    { kind: TileKind.Sword, chargeTier: 0, locked: false },
  ];
  expect(boardSoundCues(makeStep([matchTrace([0, 1, 2])], sealHit, [1, 2])))
    .toEqual(['match_spirit']);
});

it('does not mistake targeted skill clears or short traces for ordinary matches', () => {
  const charged: Tile[] = Array.from({ length: 3 }, () => ({ kind: TileKind.Fire, chargeTier: 4, locked: false }));
  const targetedSkill: BoardAnimationEffect = { kind: 'skill', source: 0, cells: [0, 1, 2], damage: 3, qi: 3, objectiveProgressAfter: {} };
  expect(boardSoundCues(makeStep([targetedSkill], charged, [0, 1, 2]))).toEqual([]);
  expect(boardSoundCues(makeStep([matchTrace([0, 1])], charged, [0, 1]))).toEqual([]);
});

it.each([4, 5] as const)('uses the same fire sound for charged fire tier %s', tier => {
  const tiles: Tile[] = [{ kind: TileKind.Fire, chargeTier: tier, locked: false }];
  const fire: BoardAnimationEffect = { kind: 'fire', source: 0, cells: [0], damage: 0, qi: 0 };
  expect(boardSoundCues(makeStep([fire], tiles, [0]))).toEqual(['fire_burst']);
});

it('plays one fire cue when a charged source appears in multiple traces in the same wave', () => {
  const tiles: Tile[] = [{ kind: TileKind.Fire, chargeTier: 4, locked: false }];
  const earlier: BoardAnimationEffect = { kind: 'fire', source: 0, cells: [0], damage: 0, qi: 0 };
  const activation: BoardAnimationEffect = { ...earlier, cells: [0, 1] };
  expect(boardSoundCues(makeStep([earlier, activation], tiles, [0]))).toEqual(['fire_burst']);
});
