jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import { BoardEngine } from '../BoardEngine';
import { installContent, mapToLevel, validateMap, type GameContent, type ObjectiveDefinition } from '../domain';
import { normalizeSnapshot } from '../save';
import { pointToCell, cellBounds, displayIndices } from '../../components/boardVisuals';
const seed = require('../../../../content/game-config.json');
const maps = require('../../../../content/game-maps.json');
const enemy = {
  id: 'boss',
  name: 'Boss',
  artKey: 'beast'
};
function fixture(objectives: ObjectiveDefinition[], width = 7, height = 7, holes: number[] = []) {
  const content: GameContent = installContent(JSON.parse(JSON.stringify(seed)));
  const raw = JSON.parse(JSON.stringify(maps[0]));
  delete raw.tutorial;
  raw.moves = 8;
  raw.layout = Array.from({ length: height }, (_, row) => Array.from({ length: width }, (_, column) => holes.includes((height-1-row)*width+column) ? 0 : -1));
  raw.objectives = [{ id: 'seed', type: 'Collect', tileKind: content.normalTileIds[0], target: 3 }];
  const map = validateMap(raw, content), level = mapToLevel(map, 2468, 0, content);
  const initial = new BoardEngine(level).snapshot();
  const translated = objectives.map(objective => objective.type === 'Collect'
    ? { ...objective, target: Math.min(30, objective.target), tileKind: content.normalTileIds[objective.tileKind] ?? objective.tileKind }
    : objective);
  level.objectives = translated;
  level.mapDefinition!.objectives = translated;
  const snapshot = { ...initial, level, objectiveProgress: Object.fromEntries(translated.map(o => [o.id, 0])) };
  snapshot.tiles = snapshot.tiles.map((t, i) => t ? {
    kind: content.normalTileIds[(i % width + 2 * Math.floor(i / width)) % 4],
    chargeTier: 0,
    locked: false
  } : null);
  snapshot.swordQi = 100;
  snapshot.loadout = { sword: null, skills: ['nhat-kiem'] };
  return {
    content,
    level,
    snapshot
  };
}
afterEach(() => {
  installContent(seed);
});
it('one clear contributes to collection and boss damage independently', () => {
  const {
    level,
    snapshot
  } = fixture([{
    id: 'swords',
    type: 'Collect',
    tileKind: 0,
    target: 100
  }, {
    id: 'boss',
    type: 'Boss',
    target: 100000,
    enemy
  }]);
  for (let x = 0; x < 7; x++) snapshot.tiles[x] = {
    kind: 1,
    chargeTier: 0,
    locked: false
  };
  const b = new BoardEngine(level, snapshot);
  b.trySkill('nhat-kiem', [{
    x: 0,
    y: 0
  }]);
  const trace = b.animation!.steps[0].effects[0];
  expect(trace.objectiveProgressAfter).toEqual({
    swords: 7,
    boss: 70
  });
  expect(b.won).toBe(false);
});
it('killing the boss first does not finish an incomplete collection', () => {
  const {
    level,
    snapshot
  } = fixture([{
    id: 'orbs',
    type: 'Collect',
    tileKind: 3,
    target: 100
  }, {
    id: 'boss',
    type: 'Boss',
    target: 1,
    enemy
  }]);
  for (let x = 0; x < 7; x++) snapshot.tiles[x] = {
    kind: 1,
    chargeTier: 0,
    locked: false
  };
  const b = new BoardEngine(level, snapshot);
  b.trySkill('nhat-kiem', [{
    x: 0,
    y: 0
  }]);
  expect(b.snapshot().objectiveProgress.boss).toBe(1);
  expect(b.won).toBe(false);
});
it('completing collection first does not finish a live boss', () => {
  const {
    level,
    snapshot
  } = fixture([{
    id: 'swords',
    type: 'Collect',
    tileKind: 0,
    target: 1
  }, {
    id: 'boss',
    type: 'Boss',
    target: 100000,
    enemy
  }]);
  const b = new BoardEngine(level, snapshot);
  b.trySkill('nhat-kiem', [{
    x: 0,
    y: 0
  }]);
  expect(b.snapshot().objectiveProgress.swords).toBeGreaterThan(1);
  expect(b.won).toBe(false);
});
it('completes every objective with the final paid swap at zero moves', () => {
  const {
    level,
    snapshot
  } = fixture([{
    id: 'swords',
    type: 'Collect',
    tileKind: 0,
    target: 1
  }, {
    id: 'boss',
    type: 'Boss',
    target: 1,
    enemy
  }]);
  snapshot.moves = 1;
  snapshot.tiles[0]!.kind = 1;
  snapshot.tiles[1]!.kind = 1;
  snapshot.tiles[2]!.kind = 2;
  snapshot.tiles[9]!.kind = 1;
  const b = new BoardEngine(level, snapshot);
  expect(b.lost).toBe(false);
  expect(b.trySwap(2, 1, 2, 0)).toBe(true);
  expect(b.moves).toBe(0);
  expect(b.won).toBe(true);
  expect(b.lost).toBe(false);
  expect(normalizeSnapshot(b.snapshot())).toEqual(b.snapshot());
});
it('tracks different collection kinds without sharing progress', () => {
  const {
    level,
    snapshot
  } = fixture([{
    id: 'swords',
    type: 'Collect',
    tileKind: 0,
    target: 100
  }, {
    id: 'fire',
    type: 'Collect',
    tileKind: 1,
    target: 100
  }]);
  for (let x = 0; x < 7; x++) snapshot.tiles[x] = {
    kind: 1,
    chargeTier: 0,
    locked: false
  };
  const b = new BoardEngine(level, snapshot);
  b.trySkill('nhat-kiem', [{
    x: 0,
    y: 0
  }]);
  expect(b.animation!.steps[0].effects[0].objectiveProgressAfter).toEqual({
    swords: 7,
    fire: 0
  });
});
it('preserves holes and rejects swaps into missing cells on a rectangular board', () => {
  const {
    level,
    snapshot
  } = fixture([{
    id: 'collect',
    type: 'Collect',
    tileKind: 0,
    target: 100
  }], 5, 6, [12]);
  const b = new BoardEngine(level, snapshot);
  const before = b.snapshot();
  expect(b.trySwap(1, 2, 2, 2)).toBe(false);
  expect(b.snapshot()).toEqual(before);
  expect(before.tiles).toHaveLength(30);
  expect(before.tiles[12]).toBeNull();
  expect(normalizeSnapshot(before)).toEqual(before);
  const geometry = level.board;
  expect(displayIndices(geometry)).toHaveLength(29);
  expect(pointToCell(125, 175, 250, geometry)).toBeNull();
  expect(cellBounds(0, 250, geometry)).toMatchObject({
    x: 1,
    y: 251,
    width: 48,
    height: 48
  });
});
it('does not form a match through a missing cell', () => {
  const {
    level,
    snapshot
  } = fixture([{
    id: 'collect',
    type: 'Collect',
    tileKind: 0,
    target: 100
  }], 5, 6, [2]);
  for (const i of [0, 1, 3, 4]) snapshot.tiles[i] = {
    kind: 1,
    chargeTier: 0,
    locked: false
  };
  const b = new BoardEngine(level, snapshot);
  expect((b as any).findGroups()).toEqual([]);
});
it('gravity refills each column segment without crossing a hole', () => {
  const {
    level,
    snapshot
  } = fixture([{
    id: 'collect',
    type: 'Collect',
    tileKind: 0,
    target: 100
  }], 5, 6, [12]);
  const b = new BoardEngine(level, snapshot),
    before = b.snapshot();
  const internals = b as any;
  internals.tiles[2] = null;
  const falls = internals.refill();
  const after = b.snapshot();
  expect(after.tiles[2]).toEqual(before.tiles[7]);
  expect(after.tiles[12]).toBeNull();
  expect(after.tiles[17]).toEqual(before.tiles[17]);
  expect(falls.every((f: any) => f.index !== 12)).toBe(true);
});
it('rejects duplicated objectives and multiple enemies in map definitions', () => {
  const c = installContent(JSON.parse(JSON.stringify(seed)));
  const raw = structuredClone(maps[0]);
  raw.objectives = [
    { id: 'a', type: 'Boss', target: 1, enemy },
    { id: 'b', type: 'Battle', target: 1, enemy },
  ];
  expect(() => validateMap(raw, c)).toThrow('INVALID_MAP');
  raw.objectives = [
    { id: 'same', type: 'Collect', target: 1, tileKind: c.normalTileIds[0] },
    { id: 'same', type: 'Collect', target: 1, tileKind: c.normalTileIds[1] },
  ];
  expect(() => validateMap(raw, c)).toThrow('INVALID_MAP');
});
