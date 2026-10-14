jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import { BoardEngine } from '../BoardEngine';
import { installContent, mapFromDocument, mapToDocument, mapToLevel, validateMap, type ObjectiveDefinition } from '../domain';
import { normalizeSnapshot } from '../save';
import type { Tile } from '../types';

const config = require('../../../../content/game-config.json');
const source = require('../../../../content/game-maps.json')[0];
const content = installContent(config);
const tile = (kind: number, chargeTier: Tile['chargeTier'] = 0, locked = false): Tile => ({ kind, chargeTier, locked });
const collect = (id: string, tileKind: number, chargeTier?: 4 | 5): ObjectiveDefinition =>
  ({ id, type: 'Collect', tileKind, target: 30, ...(chargeTier ? { chargeTier } : {}) });

function fixture(objectives: ObjectiveDefinition[]) {
  const raw = { ...structuredClone(source), objectives, layout: Array.from({ length: 7 }, () => Array(7).fill(-1)), initialSeals: [] };
  delete raw.tutorial;
  const map = validateMap(raw, content), level = mapToLevel(map, 2468, 0, content);
  const snapshot = new BoardEngine(level).snapshot();
  snapshot.tiles = snapshot.tiles.map((_, index) => tile(content.normalTileIds[(index % 7 + 2 * Math.floor(index / 7)) % 4]));
  snapshot.loadout = { sword: null, skills: ['nhat-kiem'] };
  snapshot.swordQi = 100;
  return { map, level, snapshot };
}

it.each(content.normalTileIds.flatMap(kind => ([4, 5] as const).map(tier => [kind, tier] as const)))
('counts exactly one consumed %s/%s tile and also advances its general objective', (kind, tier) => {
  const { level, snapshot } = fixture([collect('all', kind), collect('tier4', kind, 4), collect('tier5', kind, 5),
    collect('other', content.normalTileIds.find(id => id !== kind)!, tier)]);
  snapshot.tiles[24] = tile(kind, tier);
  const engine = new BoardEngine(level, snapshot);
  expect(engine.trySkill('nhat-kiem', [{ x: 0, y: 3 }])).toBe(true);
  const step = engine.animation!.steps[0];
  expect(step.after.objectiveProgress[`tier${tier}`]).toBe(1);
  expect(step.after.objectiveProgress[tier === 4 ? 'tier5' : 'tier4']).toBe(0);
  expect(step.after.objectiveProgress.other).toBe(0);
  expect(step.after.objectiveProgress.all).toBe(step.cleared.filter(index => step.before.tiles[index]?.kind === kind).length);
  expect(step.cleared.filter(index => index === 24)).toHaveLength(1);
});

it.each([4, 5] as const)('does not count creation of tier %s or the ordinary tiles consumed to create it', tier => {
  const kind = content.normalTileIds[0], others = content.normalTileIds.slice(1);
  const { level, snapshot } = fixture([collect('special', kind, tier), collect('all', kind)]);
  snapshot.tiles = snapshot.tiles.map((_, index) => tile(others[(index % 7 + 2 * Math.floor(index / 7)) % 3]));
  for (let x = 0; x < tier - 1; x++) snapshot.tiles[21 + x] = tile(kind);
  snapshot.tiles[28 + tier - 1] = tile(kind);
  const engine = new BoardEngine(level, snapshot);
  expect(engine.trySwap(tier - 1, 4, tier - 1, 3)).toBe(true);
  const step = engine.animation!.steps[0];
  expect(step.after.tiles.some(t => t?.kind === kind && t.chargeTier === tier)).toBe(true);
  expect(step.after.objectiveProgress.special).toBe(0);
  expect(step.after.objectiveProgress.all).toBe(tier - 1);
});

it('does not collect a charged tile when only its seal is removed', () => {
  const kind = content.normalTileIds[0];
  const { level, snapshot } = fixture([collect('special', kind, 4)]);
  snapshot.tiles[24] = tile(kind, 4, true);
  const engine = new BoardEngine(level, snapshot);
  engine.trySkill('nhat-kiem', [{ x: 0, y: 3 }]);
  expect(engine.animation!.steps[0].after.objectiveProgress.special).toBe(0);
  expect(engine.animation!.steps[0].after.tiles[24]).toEqual(tile(kind, 4));
});

it('counts separate tiers once each during overlapping chained effects', () => {
  const [sword, fire] = content.normalTileIds;
  const { level, snapshot } = fixture([collect('four', sword, 4), collect('five', sword, 5), collect('fire', fire, 5)]);
  snapshot.tiles[21] = tile(sword, 4);
  snapshot.tiles[24] = tile(sword, 5);
  snapshot.tiles[31] = tile(fire, 5);
  const engine = new BoardEngine(level, snapshot);
  engine.trySkill('nhat-kiem', [{ x: 0, y: 3 }]);
  expect(engine.animation!.steps[0].after.objectiveProgress).toEqual({ four: 1, five: 1, fire: 1 });
  expect(engine.won).toBe(false);
});

it('round trips tier objectives and independent surplus progress through documents and saves', () => {
  const kind = content.normalTileIds[0];
  const { map, level, snapshot } = fixture([collect('all', kind), collect('four', kind, 4), collect('five', kind, 5)]);
  expect(mapFromDocument(mapToDocument(map), content)).toEqual(map);
  snapshot.objectiveProgress = { all: 35, four: 2, five: 1 };
  const normalized = normalizeSnapshot(snapshot)!;
  expect(normalized).not.toBeNull();
  expect(normalized.level.objectives).toEqual(map.objectives);
  expect(new BoardEngine(level, normalized).snapshot().objectiveProgress).toEqual(snapshot.objectiveProgress);
});

it.each([0, 3, 6, -1, 4.5, '4', null])('rejects invalid objective chargeTier %s', chargeTier => {
  const raw = structuredClone(source);
  raw.objectives = [{ id: 'tier', type: 'Collect', tileKind: content.normalTileIds[0], target: 1, chargeTier }];
  expect(() => validateMap(raw, content)).toThrow('INVALID_MAP');
});
