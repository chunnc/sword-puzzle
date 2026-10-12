import { boardLayout, BOARD_FRAME_INSET } from '../boardLayout';

const inset = BOARD_FRAME_INSET * 2;

describe('board sizing within the gameplay viewport', () => {
  it.each([[296, 200], [366, 500], [744, 800]])('keeps the same square cells on small and full maps at %s × %s', (width, height) => {
    const sizes = [[5, 5], [7, 7], [7, 8]].map(([columns, rows]) => {
      const size = boardLayout(width, height, { width: columns, height: rows });
      const pitch = (size.width - inset) / columns;
      expect((size.height - inset) / rows).toBeCloseTo(pitch);
      expect(pitch).toBeLessThanOrEqual(44);
      expect(size.width).toBeLessThanOrEqual(width);
      expect(size.height).toBeLessThanOrEqual(height);
      return pitch;
    });
    expect(sizes[0]).toBeCloseTo(sizes[1]);
    expect(sizes[1]).toBeCloseTo(sizes[2]);
  });

  it('reserves the exact frame outside the grid and caps cells at 44 dp', () => {
    expect(boardLayout(500, 700, { width: 7, height: 8 })).toEqual({ width: 318, height: 362 });
  });

  it('shrinks safely for extra objective rows and maps larger than the reference frame', () => {
    const full = boardLayout(320, 360, { width: 7, height: 8 });
    const withBoss = boardLayout(320, 280, { width: 7, height: 8 });
    expect(withBoss.height).toBeLessThan(full.height);
    const large = boardLayout(320, 280, { width: 12, height: 12 });
    expect(large.width).toBeLessThanOrEqual(320);
    expect(large.height).toBeLessThanOrEqual(280);
  });

  it('does not produce negative or invalid sizes before layout is measured', () => {
    expect(boardLayout(0, -6, { width: 5, height: 5 })).toEqual({ width: inset, height: inset });
  });
});
