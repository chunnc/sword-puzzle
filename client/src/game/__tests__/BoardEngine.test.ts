import fixtures from './unity-board-fixtures.json';
import specialFixtures from './unity-special-fixtures.json';
import { BoardEngine } from '../BoardEngine';
import { getLevel } from '../levels';
import { SpecialKind, TileKind } from '../types';

describe('BoardEngine Unity parity', () => {
  it.each(fixtures.levels)('matches seeded board and first legal move for level $levelId', (fixture) => {
    const level = getLevel(fixture.levelId);
    const board = new BoardEngine(level);
    expect(board.snapshot()).toEqual(fixture.initial);

    const [x1, y1, x2, y2] = fixture.move;
    expect(board.trySwap(x1, y1, x2, y2)).toBe(true);
    expect(board.snapshot()).toEqual(fixture.afterMove);
  });

  it.each(fixtures.levels)('restores the complete Unity snapshot for level $levelId', (fixture) => {
    const restored = new BoardEngine(getLevel(fixture.levelId), fixture.afterMove);
    expect(restored.snapshot()).toEqual(fixture.afterMove);
  });

  it('rejects non-adjacent swaps without changing the state', () => {
    const fixture = fixtures.levels[0];
    const board = new BoardEngine(getLevel(fixture.levelId));
    const before = board.snapshot();
    expect(board.trySwap(0, 0, 2, 0)).toBe(false);
    expect(board.snapshot()).toEqual(before);
  });

  it('activates a ready sword qi row and spends the charge once', () => {
    const fixture = fixtures.levels[0];
    const snapshot = { ...fixture.initial, swordQi: 100, tiles: fixture.initial.tiles.map((tile) => ({ ...tile })) };
    for (let x = 0; x < 7; x += 1) {
      const index = 3 * 7 + x;
      snapshot.tiles[index] = { kind: TileKind.Herb, special: SpecialKind.None, locked: false };
    }
    const board = new BoardEngine(getLevel(1), snapshot);
    expect(board.useSwordQi(3)).toBe(true);
    expect(board.swordQi).toBe(0);
    expect(board.remaining).toBe(0);
    expect(board.won).toBe(true);
    expect(board.useSwordQi(3)).toBe(false);
  });

  it('grants three extra moves only once after a loss', () => {
    const fixture = fixtures.levels[0];
    const board = new BoardEngine(getLevel(1), { ...fixture.initial, moves: 0 });
    expect(board.lost).toBe(true);
    expect(board.grantExtraMoves()).toBe(true);
    expect(board.moves).toBe(3);
    expect(board.extraMovesUsed).toBe(true);
    expect(board.grantExtraMoves()).toBe(false);
  });

  it.each(specialFixtures.specialCases)('matches Unity $name behavior', (fixture) => {
    const board = new BoardEngine(getLevel(1), fixture.input);
    if (fixture.move) {
      expect(board.trySwap(fixture.move[0], fixture.move[1], fixture.move[2], fixture.move[3])).toBe(true);
    } else {
      expect(board.useSwordQi(fixture.row)).toBe(true);
    }
    expect(board.snapshot()).toEqual(fixture.afterMove);
  });
});
