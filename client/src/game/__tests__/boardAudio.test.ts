import { BoardEngine } from '../BoardEngine';
import { CONTENT, tileId, type SkillId } from '../domain';
import { getLevel } from '../levels';
import { gameplaySnapshot } from '../../components/__tests__/fixtures/gameplay';
import { boardSoundCues } from '../../audio/boardSoundCues';
import type { Tile } from '../types';

const tile = (key: Parameters<typeof tileId>[0], chargeTier: 0 | 4 | 5 = 0, locked = false): Tile => ({ kind: tileId(key), chargeTier, locked });
function fixture(skill: SkillId = 'thu') {
  const snapshot = gameplaySnapshot(getLevel(5));
  snapshot.tiles = Array.from({ length: 49 }, (_, index) => ({
    kind: CONTENT.normalTileIds[(index % 7 + 2 * Math.floor(index / 7)) % 4], chargeTier: 0, locked: false,
  }));
  snapshot.swordQi = 100; snapshot.loadout.skills = [skill];
  return snapshot;
}

it('attributes adjacent rock breaks to the ordinary match, not a later activation', () => {
  const snapshot = fixture();
  for (const index of [21, 22, 30]) snapshot.tiles[index] = tile('sword');
  snapshot.tiles[23] = tile('fire'); snapshot.tiles[14] = tile('rock'); snapshot.tiles[15] = tile('fire', 0, true);
  const engine = new BoardEngine(snapshot.level, snapshot);
  expect(engine.beginSwap(2, 4, 2, 3)).not.toBeNull();
  const step = engine.nextResolutionStep()!;
  expect(step.effects[0]).toMatchObject({ origin: 'match', brokenRocks: [14] });
  expect(boardSoundCues(step).map(cue => cue.id)).toEqual(['rock_break', 'match_spirit']);
  expect(engine.snapshot()).not.toHaveProperty('effects');
});

it('attributes skill and queued fire rock breaks separately and never duplicates a rock', () => {
  const snapshot = fixture();
  snapshot.tiles[24] = tile('fire', 4); snapshot.tiles[25] = tile('rock'); snapshot.tiles[10] = tile('rock');
  const engine = new BoardEngine(snapshot.level, snapshot);
  expect(engine.beginSkill('thu', [{ x: 3, y: 3 }])).not.toBeNull();
  const step = engine.nextResolutionStep()!;
  expect(step.effects[0]).toMatchObject({ origin: 'skill', skillId: 'thu', brokenRocks: [25] });
  expect(step.effects[1]).toMatchObject({ origin: 'charged', kind: 'fire', brokenRocks: [10] });
  expect(new Set(step.effects.flatMap(trace => trace.brokenRocks ?? [])).size).toBe(2);
  expect(boardSoundCues(step).map(cue => [cue.id, cue.traceIndex])).toEqual([
    ['rock_break', 0], ['sword_slash', 0], ['rock_break', 1], ['fire_burst', 1],
  ]);
});

it.each([false, true])('groups actual Phá Chướng rocks and keeps seal-only clears quiet (rocks=%s)', rocks => {
  const snapshot = fixture('pha-chuong');
  snapshot.tiles[16] = rocks ? tile('rock') : tile('fire', 0, true);
  snapshot.tiles[17] = rocks ? tile('rock') : tile('sword', 0, true);
  snapshot.tiles[18] = tile('lightning', 0, true);
  const engine = new BoardEngine(snapshot.level, snapshot);
  expect(engine.beginSkill('pha-chuong', [{ x: 3, y: 3 }])).not.toBeNull();
  const step = engine.nextResolutionStep()!;
  expect(step.effects[0]).toMatchObject({ origin: 'skill', skillId: 'pha-chuong', brokenRocks: rocks ? [16, 17] : [] });
  expect(boardSoundCues(step).map(cue => cue.id)).toEqual(rocks ? ['rock_break'] : []);
});

it.each([4, 5] as const)('keeps the consumed spirit tier %s and audio even with no remaining targets', tier => {
  const snapshot = fixture('nhat-kiem'); snapshot.tiles[21] = tile('spirit', tier);
  const engine = new BoardEngine(snapshot.level, snapshot);
  expect(engine.beginSkill('nhat-kiem', [{ x: 0, y: 3 }])).not.toBeNull();
  const step = engine.nextResolutionStep()!;
  expect(step.effects[1]).toMatchObject({ origin: 'charged', kind: 'spirit', cells: [], spiritChargeTier: tier });
  expect(boardSoundCues(step).map(cue => cue.id)).toEqual(['sword_slash', 'spirit_absorb']);
});
