import AsyncStorage from '@react-native-async-storage/async-storage';
import { BoardEngine } from '../BoardEngine';
import { CONTENT, mapToLevel, tileId, validateMap } from '../domain';
import { emptySave, loadSave, normalizeSave, normalizeSnapshot, persistSave } from '../save';
import { toRunReportProgress } from '../objectiveProgress';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

function fixture() {
  const raw = structuredClone(require('../../../../content/game-maps.json')[0]);
  delete raw.tutorial;
  raw.layout = Array.from({ length: 7 }, () => Array(7).fill(-1));
  raw.layout[0][0] = raw.layout[0][1] = raw.layout[0][2] = tileId('rock', CONTENT);
  raw.initialSeals = [0, 1, 2].map(column => ({ row: 1, column }));
  raw.objectives = [
    { id: 'collect', type: 'Collect', tileKind: tileId('sword', CONTENT), target: 15 },
    { id: 'rocks', type: 'BreakRocks', target: 1 },
    { id: 'seals', type: 'BreakSeals', target: 1 },
    { id: 'boss', type: 'Boss', target: 100000, enemy: { id: 'boss', name: 'Boss', artKey: 'beast' } },
  ];
  const level = mapToLevel(validateMap(raw, CONTENT), 2468, 0, CONTENT);
  const snapshot = new BoardEngine(level).snapshot();
  snapshot.swordQi = 100;
  snapshot.loadout.skills = ['nhat-kiem', 'pha-chuong'];
  for (let x = 0; x < 7; x++) snapshot.tiles[x] = { kind: tileId('sword', CONTENT), chargeTier: 0, locked: false };
  return { level, snapshot };
}

beforeEach(async () => { await AsyncStorage.clear(); });

it('continues collecting past the target while another objective is incomplete and records actual trace counts', () => {
  const { level, snapshot } = fixture();
  snapshot.objectiveProgress.collect = 16;
  const engine = new BoardEngine(level, snapshot);
  expect(engine.trySkill('nhat-kiem', [{ x: 0, y: 0 }])).toBe(true);
  expect(engine.animation!.steps[0].effects[0].objectiveProgressAfter!.collect).toBe(23);
  expect(engine.snapshot().objectiveProgress.collect).toBeGreaterThanOrEqual(23);
  expect(engine.won).toBe(false);
});

it('continues counting destroyed rocks and broken seals beyond their targets', () => {
  const { level, snapshot } = fixture();
  snapshot.objectiveProgress.rocks = 3;
  snapshot.objectiveProgress.seals = 4;
  const engine = new BoardEngine(level, snapshot);
  expect(engine.trySkill('pha-chuong', [{ x: 1, y: 5 }])).toBe(true);
  expect(engine.snapshot().objectiveProgress).toMatchObject({ rocks: 6, seals: 7 });
});

it('does not increase adaptive difficulty or alter refill RNG when a completed objective has surplus', () => {
  const { level, snapshot } = fixture();
  const capped = new BoardEngine(level, { ...snapshot, objectiveProgress: { ...snapshot.objectiveProgress, collect: 15 } });
  const surplus = new BoardEngine(level, { ...snapshot, objectiveProgress: { ...snapshot.objectiveProgress, collect: 23 } });
  capped.trySkill('nhat-kiem', [{ x: 0, y: 0 }]);
  surplus.trySkill('nhat-kiem', [{ x: 0, y: 0 }]);
  const actual = surplus.snapshot(), expected = capped.snapshot();
  expect(actual.tiles).toEqual(expected.tiles);
  expect(actual.directorPressure).toBe(expected.directorPressure);
  expect(actual.randomState).toBe(expected.randomState);
  expect(actual.drops).toBe(expected.drops);
});

it('round-trips actual surplus counts through save and engine restoration while accepting old capped counts', async () => {
  const { snapshot } = fixture();
  for (const progress of [{ collect: 15, rocks: 1, seals: 1, boss: 30 }, { collect: 23, rocks: 6, seals: 7, boss: 30 }]) {
    snapshot.objectiveProgress = progress;
    expect(normalizeSnapshot(snapshot)).toEqual(snapshot);
    await persistSave({ ...emptySave(), ownerId: 'player', active: snapshot });
    const restored = (await loadSave('player')).active!;
    expect(restored.objectiveProgress).toEqual(progress);
    expect(new BoardEngine(restored.level, restored).snapshot().objectiveProgress).toEqual(progress);
  }
});

it.each(['won', 'lost', 'abandoned'] as const)('preserves raw counts with a compatible pending %s report', outcome => {
  const { level, snapshot } = fixture();
  snapshot.moves = 0;
  snapshot.objectiveProgress = { collect: 23, rocks: 6, seals: 7, boss: outcome === 'won' ? 100000 : 30 };
  const report = { outcome, movesUsed: level.moves, extraMovesUsed: false, objectiveProgress: toRunReportProgress(level, snapshot.objectiveProgress) };
  expect(report.objectiveProgress).toEqual({ collect: 15, rocks: 1, seals: 1, boss: outcome === 'won' ? 100000 : 30 });
  const journal = { ...emptySave(), ownerId: 'player', active: snapshot, pendingFinish: { runId: snapshot.runId, levelId: snapshot.levelId, contentVersion: snapshot.contentVersion, report } };
  expect(normalizeSave(journal)!.active!.objectiveProgress.collect).toBe(23);
  expect(normalizeSave(journal)!.pendingFinish!.report).toEqual(report);
  expect(normalizeSave({ ...journal, pendingFinish: { ...journal.pendingFinish, report: { ...report, objectiveProgress: { ...report.objectiveProgress, collect: 14 } } } })).toBeNull();
});

it('rejects invalid counts and keeps boss HP capped while a surplus-complete run still wins', () => {
  const { level, snapshot } = fixture();
  for (const count of [-1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    expect(normalizeSnapshot({ ...snapshot, objectiveProgress: { ...snapshot.objectiveProgress, collect: count } })).toBeNull();
  }
  expect(normalizeSnapshot({ ...snapshot, objectiveProgress: { ...snapshot.objectiveProgress, boss: 100001 } })).toBeNull();
  snapshot.objectiveProgress = { collect: 23, rocks: 6, seals: 7, boss: 100000 };
  const engine = new BoardEngine(level, snapshot);
  expect(engine.won).toBe(true);
  expect(engine.trySkill('nhat-kiem', [{ x: 0, y: 0 }])).toBe(false);
});
