import { BoardEngine } from '../BoardEngine';
import { installContent, mapToLevel, validateMap } from '../domain';

const sourceConfig = require('../../../../content/game-config.json');
const sourceMaps = require('../../../../content/game-maps.json');

function engineWithObstaclePolicy() {
  const config = installContent(structuredClone(sourceConfig));
  const raw = structuredClone(sourceMaps[0]);
  delete raw.tutorial;
  raw.layout = Array.from({ length: 7 }, () => Array(7).fill(-1));
  raw.initialSeals = [];
  raw.objectives = [{ id: 'main', type: 'Battle', target: 1_000_000,
    enemy: { id: 'pressure-test', name: 'Pressure Test', artKey: 'beast' } }];
  raw.moves = 18;
  raw.spawnPolicy.comboChance = 1;
  raw.spawnPolicy.setupChance = 1;
  raw.spawnPolicy.obstaclePressure = .3;
  return new BoardEngine(mapToLevel(validateMap(raw, config), 24680, 0, config));
}

function lineAndNeighbor(engine: BoardEngine) {
  const internals = engine as any;
  const board = engine.snapshot().level.board;
  for (let y = 0; y < board.height; y++) for (let x = 0; x + 2 < board.width; x++) {
    const line = [y * board.width + x, y * board.width + x + 1, y * board.width + x + 2];
    if (!line.every(index => board.activeCells[index])) continue;
    const neighbor = internals.area(line[1], 1).find((index: number) => board.activeCells[index] && !line.includes(index));
    if (neighbor !== undefined) return { line, neighbor };
  }
  throw new Error('NO_TEST_LINE_NEAR_OBSTACLE');
}

function obstacleTile(engine: BoardEngine) {
  const internals = engine as any;
  return { kind: internals.kind('rock'), chargeTier: 0 as const, locked: false };
}

function assistedRoll(engine: BoardEngine, score: number) {
  const internals = engine as any;
  const pressure = internals.effectivePressure();
  const assistance = .3;
  const baseAcceptance = Math.exp(-pressure * .3 * score);
  internals.level.assistReduction = assistance;
  const assistedPressure = internals.effectivePressure();
  const assistedAcceptance = Math.exp(-assistedPressure * .3 * score);
  internals.level.assistReduction = 0;
  return Math.floor((baseAcceptance + assistedAcceptance) * 500_000);
}

describe('obstacle spawn pressure', () => {
  it('rejects near-obstacle combos less often after retry assistance', () => {
    const engine = engineWithObstaclePolicy(), internals = engine as any;
    const { line, neighbor } = lineAndNeighbor(engine);
    const board = engine.snapshot().tiles.map(tile => tile ? { ...tile } : null);
    board[neighbor] = obstacleTile(engine);
    const score = internals.obstacleScore([line], board);
    expect(score).toBeGreaterThan(0);
    const roll = assistedRoll(engine, score);
    internals.nextIndex = () => roll;
    internals.level.assistReduction = 0;
    expect(internals.rejectObstacleCombo([line], board)).toBe(true);
    internals.level.assistReduction = .3;
    expect(internals.rejectObstacleCombo([line], board)).toBe(false);
  });

  it('counts locked seal cells as nearby obstacles', () => {
    const engine = engineWithObstaclePolicy(), internals = engine as any;
    const { line, neighbor } = lineAndNeighbor(engine);
    const board = engine.snapshot().tiles.map(tile => tile ? { ...tile } : null);
    board[neighbor]!.locked = true;
    const score = internals.obstacleScore([line], board);
    expect(score).toBeGreaterThan(0);
    internals.nextIndex = () => 999_999;
    expect(internals.rejectObstacleCombo([line], board)).toBe(true);
  });

  it('restores a rejected seeded refill and uses the ordinary refill path', () => {
    const engine = engineWithObstaclePolicy(), internals = engine as any;
    internals.level.mapDefinition.spawnPolicy.candidates = 1;
    internals.level.mapDefinition.spawnPolicy.obstaclePressure = .9;
    const { line, neighbor } = lineAndNeighbor(engine);
    internals.tiles[neighbor] = obstacleTile(engine);
    for (const index of line) internals.tiles[index] = null;
    const before = internals.tiles.map((tile: any) => tile ? { ...tile } : null);
    internals.nextIndex = () => 950_000;
    expect(internals.refillChance(1)).toBe(1);
    internals.refillPositions = () => line.map(index => ({ index, fromY: 0, spawned: true }));
    let seededCount = 0;
    internals.seededRefill = (snapshot: any[]) => {
      seededCount++;
      internals.tiles = snapshot.map(tile => tile ? { ...tile } : null);
      for (const index of line) internals.tiles[index] = { kind: internals.kind('sword'), chargeTier: 0, locked: false };
      return { tiles: internals.tiles, falls: line.map(index => ({ index, fromY: 0, spawned: true })) };
    };
    let fallbackCount = 0;
    internals.refillOnce = () => {
      fallbackCount++;
      for (const [offset, index] of line.entries()) internals.tiles[index] = {
        kind: internals.content.normalTileIds![offset], chargeTier: 0, locked: false
      };
      return line.map(index => ({ index, fromY: 0, spawned: true }));
    };

    internals.refill(1);
    expect(seededCount).toBe(1);
    expect(fallbackCount).toBe(1);
    expect(internals.metrics.seeded).toBe(0);
  });

  it('restores the board and stops searching after pressure rejects a setup motif', () => {
    const engine = engineWithObstaclePolicy(), internals = engine as any;
    const { neighbor } = lineAndNeighbor(engine);
    internals.tiles[neighbor] = obstacleTile(engine);
    internals.nextIndex = () => 0;
    internals.shuffle = () => {};
    const before = internals.tiles.map((tile: any) => tile ? { ...tile } : null);
    let rejected = 0;
    internals.rejectObstacleCombo = () => { rejected++; return true; };
    const spawned = engine.snapshot().level.board.activeCells.flatMap((active, index) => active ? [index] : []);

    internals.prepareCombo(new Set(spawned));

    expect(rejected).toBe(1);
    expect(internals.metrics.setups).toBe(0);
    expect(internals.metrics.setupFallbacks).toBe(1);
    expect(internals.tiles).toEqual(before);
  });
});
