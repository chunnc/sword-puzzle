import { boardOutlineLoops, boardOutlinePath, type OutlinePoint } from '../boardOutline';
import type { BoardGeometry } from '../boardVisuals';

const fromRows = (rows: number[][]): BoardGeometry => ({
  width: rows[0].length, height: rows.length, activeCells: [...rows].reverse().flat().map(Boolean),
});
const area = (loop: OutlinePoint[]) => loop.reduce((sum, point, index) => {
  const next = loop[(index + 1) % loop.length];
  return sum + point.x * next.y - next.x * point.y;
}, 0) / 2;

describe('board contours', () => {
  it('traces a full rectangular board without internal grid edges', () => {
    expect(boardOutlineLoops({ width: 7, height: 8 })).toEqual([[
      { x: 0, y: 0 }, { x: 7, y: 0 }, { x: 7, y: 8 }, { x: 0, y: 8 },
    ]]);
  });

  it('cuts missing corners and edge notches out of the outer contour', () => {
    const corner = boardOutlineLoops(fromRows([[0, 1, 1], [1, 1, 1], [1, 1, 1]]));
    expect(corner).toHaveLength(1);
    expect(corner[0]).toContainEqual({ x: 1, y: 1 });
    expect(corner[0]).not.toContainEqual({ x: 0, y: 0 });
    expect(area(corner[0])).toBe(8);
    const notch = boardOutlineLoops(fromRows([[1, 0, 1], [1, 0, 1], [1, 1, 1]]));
    expect(notch).toHaveLength(1);
    expect(notch[0]).toContainEqual({ x: 1, y: 2 });
    expect(notch[0]).toContainEqual({ x: 2, y: 2 });
    expect(area(notch[0])).toBe(7);
  });

  it('gives two adjacent interior holes one rectangular inner contour', () => {
    const rows = Array.from({ length: 5 }, () => Array(5).fill(1));
    rows[1][2] = rows[2][2] = 0;
    const loops = boardOutlineLoops(fromRows(rows));
    expect(loops).toHaveLength(2);
    expect(loops.map(area)).toEqual([25, -2]);
    expect(loops[1]).toHaveLength(4);
    expect(new Set(loops[1].map(point => point.x))).toEqual(new Set([2, 3]));
    expect(new Set(loops[1].map(point => point.y))).toEqual(new Set([1, 3]));
  });

  it('traces separate holes and disconnected or diagonally touching islands', () => {
    const rows = Array.from({ length: 5 }, () => Array(5).fill(1));
    rows[1][1] = rows[3][3] = 0;
    expect(boardOutlineLoops(fromRows(rows))).toHaveLength(3);
    for (const rows of [[[1, 0, 1]], [[1, 0], [0, 1]], [[0, 1], [1, 0]]]) {
      const loops = boardOutlineLoops(fromRows(rows));
      expect(loops).toHaveLength(2);
      expect(loops.map(area)).toEqual([1, 1]);
      expect(loops.every(loop => loop.length === 4)).toBe(true);
    }
  });

  it('draws every exposed edge exactly once for all 3 × 3 cell masks', () => {
    for (let mask = 0; mask < 512; mask++) {
      const activeCells = Array.from({ length: 9 }, (_, index) => !!(mask & (1 << index)));
      const geometry = { width: 3, height: 3, activeCells };
      const loops = boardOutlineLoops(geometry);
      const actual: string[] = [];
      for (const loop of loops) for (let index = 0; index < loop.length; index++) {
        const from = loop[index], to = loop[(index + 1) % loop.length];
        const dx = Math.sign(to.x - from.x), dy = Math.sign(to.y - from.y);
        expect(dx === 0 || dy === 0).toBe(true);
        for (let step = 0; step < Math.abs(to.x - from.x) + Math.abs(to.y - from.y); step++) {
          actual.push(`${from.x + step * dx},${from.y + step * dy}:${from.x + (step + 1) * dx},${from.y + (step + 1) * dy}`);
        }
      }
      const active = (x: number, y: number) => x >= 0 && x < 3 && y >= 0 && y < 3 && activeCells[(2 - y) * 3 + x];
      const expected: string[] = [];
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
        if (!active(x, y)) continue;
        if (!active(x, y - 1)) expected.push(`${x},${y}:${x + 1},${y}`);
        if (!active(x + 1, y)) expected.push(`${x + 1},${y}:${x + 1},${y + 1}`);
        if (!active(x, y + 1)) expected.push(`${x + 1},${y + 1}:${x},${y + 1}`);
        if (!active(x - 1, y)) expected.push(`${x},${y + 1}:${x},${y}`);
      }
      expect(actual.sort()).toEqual(expected.sort());
      expect(loops.reduce((sum, loop) => sum + area(loop), 0)).toBe(activeCells.filter(Boolean).length);
    }
  });

  it('rounds corners at 4 dp and scales to the actual pitch, including very small cells', () => {
    const square = { width: 1, height: 1 };
    expect(boardOutlinePath(square, 44)).toBe('M0,4 Q0,0 4,0 L40,0 Q44,0 44,4 L44,40 Q44,44 40,44 L4,44 Q0,44 0,40 Z');
    expect(boardOutlinePath(square, 4)).toContain('M0,2 Q0,0 2,0');
    expect(boardOutlinePath(square, 0)).toBe('');
    expect(boardOutlinePath(fromRows([[0, 0], [0, 0]]), 88)).toBe('');
  });
});
