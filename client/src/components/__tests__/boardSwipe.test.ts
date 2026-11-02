import { swipeNeighbor } from '../boardSwipe';
import { pointToCell } from '../boardVisuals';

const geometry = { width: 7, height: 7 };
const source = { x: 3, y: 3 };

describe('directional board swipes', () => {
  it.each([
    [10, 0, 4, 3], [-10, 0, 2, 3], [0, -10, 3, 4], [0, 10, 3, 2],
    [160, 0, 4, 3], [25, 15, 4, 3], [15, -25, 3, 4], [12, 10, 4, 3],
  ])('maps displacement (%s, %s) to one neighbor', (dx, dy, x, y) => {
    expect(swipeNeighbor(source, dx, dy, geometry)).toEqual({ x, y });
  });

  it.each([[0, 0], [9.99, 0], [7.2, 7.2], [20, 20], [11.9, 10], [NaN, 20], [20, Infinity]])(
    'waits for sufficient, unambiguous displacement (%s, %s)', (dx, dy) => {
      expect(swipeNeighbor(source, dx, dy, geometry)).toBeNull();
    },
  );

  it.each([[0, 3, -20, 0], [6, 3, 20, 0], [3, 0, 0, 20], [3, 6, 0, -20]])(
    'does not leave the board from (%s, %s)', (x, y, dx, dy) => {
      expect(swipeNeighbor({ x, y }, dx, dy, geometry)).toBeNull();
    },
  );

  it('uses the touch-down cell near a boundary and ignores where the finger ends', () => {
    const from = pointToCell(149, 175, 350, geometry)!;
    expect(swipeNeighbor(from, 12, 0, geometry)).toEqual({ x: 3, y: 3 });
    const nearEdge = pointToCell(275, 175, 350, geometry)!;
    expect(pointToCell(360, 175, 350, geometry)).toBeNull();
    expect(swipeNeighbor(nearEdge, 85, 0, geometry)).toEqual({ x: 6, y: 3 });
  });

  it('respects rectangular geometry and holes for both source and target', () => {
    const board = { width: 4, height: 8, activeCells: Array(32).fill(true) };
    board.activeCells[29] = false;
    expect(swipeNeighbor({ x: 2, y: 6 }, 0, -15, board)).toEqual({ x: 2, y: 7 });
    expect(swipeNeighbor({ x: 2, y: 7 }, -15, 0, board)).toBeNull();
    expect(swipeNeighbor({ x: 1, y: 7 }, 15, 0, board)).toBeNull();
    expect(swipeNeighbor({ x: 2, y: 7 }, 0, -15, board)).toBeNull();
    expect(swipeNeighbor({ x: -1, y: 3 }, 15, 0, board)).toBeNull();
    expect(swipeNeighbor({ x: 1.5, y: 3 }, 15, 0, board)).toBeNull();
  });
});
