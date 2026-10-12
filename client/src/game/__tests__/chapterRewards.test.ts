import { BoardEngine } from '../BoardEngine';
import { emptyProfile, installContent, mapToLevel, validateMap, type Loadout, type SkillId } from '../domain';
import { normalizeSnapshot } from '../save';
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const config = require('../../../../content/game-config.json');
const source = require('../../../../content/game-maps.json')[0];

function fixture(type: 'Boss' | 'Battle' = 'Boss', sword: Loadout['sword'] = 'co-ban', passiveSkills: SkillId[] = ['thieu', 'van']) {
  const c = installContent(config);
  const map = validateMap({ ...source, tutorial: undefined, objectives: [{ id: 'main', type, target: 100000, enemy: { id: 'fixture', name: 'Fixture', artKey: 'beast' } }] }, c);
  const level = mapToLevel(map, 1234, 0, c);
  const snapshot = new BoardEngine(level, null, { loadout: { sword, skills: ['thu'] }, totalExp: 0, passiveSkills }).snapshot();
  snapshot.tiles = snapshot.tiles.map((t, i) => t ? { kind: c.normalTileIds[(i % 5 + 2 * Math.floor(i / 5)) % 4], chargeTier: 0, locked: false } : null);
  snapshot.swordQi = 100;
  snapshot.tiles[12] = { kind: 4, chargeTier: 0, locked: false };
  return { snapshot, level, engine: new BoardEngine(level, snapshot) };
}

it.each([['Boss', 'co-ban', ['thieu', 'van'], 3], ['Boss', 'co-ban', ['thieu'], 2], ['Boss', null, ['thieu', 'van'], 2], ['Battle', 'co-ban', ['thieu', 'van'], 1], ['Battle', null, [], 0]] as const)('spirit damage follows weapon and boss-only bonuses: %s %s %s', (type, sword, passives, expected) => {
  const { engine } = fixture(type, sword, [...passives]);
  expect(engine.trySkill('thu', [{ x: 2, y: 2 }])).toBe(true);
  expect(engine.animation!.steps[0].effects[0].damage).toBe(expected);
});

it('adds bonuses before the cultivation multiplier', () => {
  const { snapshot, level } = fixture(); snapshot.damageScale = 1.5;
  const engine = new BoardEngine(level, snapshot);
  engine.trySkill('thu', [{ x: 2, y: 2 }]);
  expect(engine.animation!.steps[0].effects[0].damage).toBe(4);
});

it('new characters can play and restore with empty equipment', () => {
  const c = installContent(config), level = mapToLevel(validateMap(source, c), 1, 0, c);
  const engine = new BoardEngine(level, null, { loadout: emptyProfile().loadout, totalExp: 0 });
  expect(engine.availableSkills()).toEqual([]);
  expect(normalizeSnapshot(engine.snapshot())?.loadout).toEqual({ sword: null, skills: [] });
  expect(engine.trySwap(...engine.legalMoves()[0])).toBe(true);
});

it('Thứ costs 60 qi, consumes no move, and respects one cast between paid swaps', () => {
  const { engine } = fixture(); const before = engine.movesUsed;
  expect(engine.cost('thu')).toBe(60);
  expect(engine.trySkill('thu', [{ x: 2, y: 2 }])).toBe(true);
  expect(engine.animation!.swappedBoard.swordQi).toBe(40);
  expect(engine.movesUsed).toBe(before);
  expect(engine.trySkill('thu', [{ x: 1, y: 1 }])).toBe(false);
});

it('invalid targets and insufficient qi leave the board unchanged', () => {
  const { snapshot, level } = fixture(); snapshot.swordQi = 59;
  const engine = new BoardEngine(level, snapshot), before = engine.snapshot();
  expect(engine.trySkill('thu', [{ x: 2, y: 2 }])).toBe(false);
  expect(engine.trySkill('thu', [{ x: -1, y: 0 }])).toBe(false);
  expect(engine.snapshot()).toEqual(before);
});

it('Thứ rejects a void cell', () => {
  const { snapshot, level } = fixture();
  const map = structuredClone(level.mapDefinition!); map.layout[0][0] = 0;
  const c = installContent(config), withHole = mapToLevel(validateMap(map, c), 1234, 0, c);
  snapshot.level = withHole; snapshot.tiles[20] = null;
  const engine = new BoardEngine(withHole, snapshot);
  expect(engine.trySkill('thu', [{ x: 0, y: 4 }])).toBe(false);
});

it('Thứ breaks a rock without dealing damage for the obstacle', () => {
  const { snapshot, level } = fixture(); snapshot.tiles[12] = { kind: 5, chargeTier: 0, locked: false };
  level.objectives.push({ id: 'rocks', type: 'BreakRocks', target: 10 }); snapshot.objectiveProgress.rocks = 0;
  const engine = new BoardEngine(level, snapshot);
  expect(engine.trySkill('thu', [{ x: 2, y: 2 }])).toBe(true);
  expect(engine.snapshot().objectiveProgress.rocks).toBeGreaterThanOrEqual(1);
  expect(engine.animation!.steps[0].effects[0].damage).toBe(0);
});

it('Thứ unlocks a sealed charged tile before it can activate', () => {
  const { snapshot, level } = fixture(); snapshot.tiles[12] = { kind: 1, chargeTier: 4, locked: true };
  const engine = new BoardEngine(level, snapshot);
  expect(engine.trySkill('thu', [{ x: 2, y: 2 }])).toBe(true);
  expect(engine.animation!.steps[0].cleared).not.toContain(12);
  expect(engine.animation!.steps[0].effects.some(e => e.kind === 'slash')).toBe(false);
});

it('Thứ activates a charged sword and counts its damage once', () => {
  const { snapshot, level } = fixture(); snapshot.tiles[12] = { kind: 1, chargeTier: 4, locked: false };
  const engine = new BoardEngine(level, snapshot);
  expect(engine.trySkill('thu', [{ x: 2, y: 2 }])).toBe(true);
  expect(engine.animation!.steps[0].effects.some(e => e.kind === 'slash' && e.source === 12)).toBe(true);
  expect(engine.animation!.steps[0].cleared.filter(i => i === 12)).toHaveLength(1);
});

it('passive forms survive snapshot restore and cannot be cast', () => {
  const { snapshot, level } = fixture();
  const restored = normalizeSnapshot(snapshot)!;
  expect(restored.passiveSkills).toEqual(['thieu', 'van']);
  const engine = new BoardEngine(level, restored); snapshot.passiveSkills!.length = 0;
  expect(engine.snapshot().passiveSkills).toEqual(['thieu', 'van']);
  expect(engine.trySkill('thieu', [{ x: 2, y: 2 }])).toBe(false);
  expect(engine.availableSkills()).not.toContain('thieu');
  expect(normalizeSnapshot({ ...restored, passiveSkills: ['thu'] })).toBeNull();
});
