jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import { BoardEngine } from '../BoardEngine';
import { installContent, getLevelData, type GameContent, type ObjectiveDefinition } from '../domain';
import { normalizeSnapshot } from '../save';
import { pointToCell, cellBounds, displayIndices } from '../../components/boardVisuals';
const seed = require('../../../../content/game-content.json');
const enemy = {
  id: 'boss',
  name: 'Boss',
  artKey: 'beast'
};
function fixture(objectives: ObjectiveDefinition[], width = 7, height = 7, holes: number[] = []) {
  const content: GameContent = JSON.parse(JSON.stringify(seed));
  content.version = 4;
  const level = content.levels[0];
  level.objectives = objectives;
  level.board = {
    width,
    height,
    activeCells: Array.from({
      length: width * height
    }, (_, i) => !holes.includes(i))
  };
  level.obstacles = {
    rocks: 0,
    seals: 0
  };
  installContent(content);
  const snapshot = new BoardEngine(level).snapshot();
  snapshot.tiles = snapshot.tiles.map((t, i) => t ? {
    kind: (i % width + 2 * Math.floor(i / width)) % 4,
    chargeTier: 0,
    locked: false
  } : null);
  snapshot.swordQi = 100;
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
    kind: 0,
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
    kind: 0,
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
  expect(b.snapshot().objectiveProgress.swords).toBe(1);
  expect(b.won).toBe(false);
});
it('completes every objective with a final free skill at zero moves', () => {
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
  snapshot.moves = 0;
  const b = new BoardEngine(level, snapshot);
  expect(b.lost).toBe(false);
  expect(b.trySkill('nhat-kiem', [{
    x: 0,
    y: 0
  }])).toBe(true);
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
    kind: 0,
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
    kind: 0,
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
it('uses move-dependent weighted spawning and restores the RNG', () => {
  const {
    level,
    snapshot
  } = fixture([{
    id: 'collect',
    type: 'Collect',
    tileKind: 0,
    target: 100
  }]);
  level.spawnPhases = [{
    minMovesRemaining: 0,
    weights: [1, 1, 1, 1000]
  }, {
    minMovesRemaining: 8,
    weights: [1000, 1, 1, 1]
  }];
  snapshot.level = level;
  const a = new BoardEngine(level, snapshot),
    b = new BoardEngine(level, snapshot);
  const draws = (engine: BoardEngine) => Array.from({
    length: 1000
  }, () => (engine as any).nextKind());
  const early = draws(a);
  expect(early.filter(x => x === 0).length).toBeGreaterThan(950);
  expect(draws(b)).toEqual(early);
  a.moves = 0;
  const late = draws(a);
  expect(late.filter(x => x === 3).length).toBeGreaterThan(950);
});
it('rejects incompatible catalogs, duplicated objectives and multiple enemies', () => {
  const c: GameContent = JSON.parse(JSON.stringify(seed));
  c.levels[0].objectives = [{
    id: 'a',
    type: 'Boss',
    target: 1,
    enemy
  }, {
    id: 'b',
    type: 'Battle',
    target: 1,
    enemy
  }];
  expect(() => installContent(c)).toThrow('INVALID_CONTENT');
  c.levels[0].objectives = [{
    id: 'same',
    type: 'Collect',
    target: 1,
    tileKind: 0
  }, {
    id: 'same',
    type: 'Collect',
    target: 1,
    tileKind: 1
  }];
  expect(() => installContent(c)).toThrow('INVALID_CONTENT');
});
