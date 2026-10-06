import {
  DISPLAY_INDICES, BOARD_SWAP_MS, BOARD_CLEAR_MS, BOARD_FALL_MS, BOARD_REJECT_MS,
  buildCellVisuals, cellBounds, cellMotion, pointToCell, type BoardVisualEffect,
} from '../boardVisuals';

describe('Skia board coordinates and animation', () => {
  it('aligns every touch target with its rendered cell at different board sizes', () => {
    for (const side of [210, 343, 375.5]) {
      for (let index = 0; index < 49; index++) {
        const bounds = cellBounds(index, side);
        expect(pointToCell(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, side))
          .toEqual({ x: index % 7, y: Math.floor(index / 7) });
      }
    }
    expect(cellBounds(0, 350)).toEqual({ x: 1, y: 301, width: 48, height: 48 });
    expect(cellBounds(48, 350)).toEqual({ x: 301, y: 1, width: 48, height: 48 });
    expect(DISPLAY_INDICES.slice(0, 7)).toEqual([42, 43, 44, 45, 46, 47, 48]);
  });

  it('keeps the existing swipe clamping and ignores gestures before layout', () => {
    expect(pointToCell(-20, -20, 350)).toEqual({ x: 0, y: 6 });
    expect(pointToCell(370, 370, 350)).toEqual({ x: 6, y: 0 });
    expect(pointToCell(100, 50, 350)).toEqual({ x: 2, y: 5 });
    expect(pointToCell(1, 1, 0)).toBeNull();
  });

  it.each([
    [{ x: 2, y: 3 }, { x: 3, y: 3 }, 50, 0],
    [{ x: 2, y: 3 }, { x: 2, y: 4 }, 0, -50],
  ] as const)('moves both swapped pieces to the opposite cell', (first, second, tx, ty) => {
    const cells = buildCellVisuals({ id: 1, kind: 'swap', first, second }, null);
    const a = first.y * 7 + first.x, b = second.y * 7 + second.x;
    expect(cellMotion(cells[a], 50, 1, 1)).toEqual({ tx, ty, opacity: 1, scale: 1 });
    expect(cellMotion(cells[b], 50, 1, 1)).toMatchObject({ tx: -tx || 0, ty: -ty || 0 });
    expect(cells.filter(cell => cell.dx || cell.dy)).toHaveLength(2);
  });

  it('rejects with a 38% excursion and returns to the original position', () => {
    const cells = buildCellVisuals({ id: 1, kind: 'reject', first: { x: 0, y: 0 }, second: { x: 1, y: 0 } }, null);
    expect(cellMotion(cells[0], 50, .38, 1).tx).toBe(19);
    expect(cellMotion(cells[0], 50, 0, 1).tx).toBe(0);
  });

  it('starts falling pieces at their source, including above the top board edge', () => {
    const cells = buildCellVisuals({ id: 2, kind: 'fall', falls: [{ index: 7, fromY: 4 }, { index: 42, fromY: 7 }] }, null);
    expect(cellMotion(cells[7], 50, 0, 1).ty).toBe(-150);
    expect(cellMotion(cells[42], 50, 0, 1).ty).toBe(-50);
    expect(cellBounds(42, 350).y + cellMotion(cells[42], 50, 0, 1).ty).toBe(-49);
    expect(cellMotion(cells[7], 50, 1, 1).ty).toBeCloseTo(0);
    expect(cells[0].falling).toBe(false);
  });

  it('does not resurrect cumulative clears during sequential elemental traces', () => {
    const first: BoardVisualEffect = { id: 3, kind: 'clear', cleared: [0], changed: [3], effects: [{ kind: 'fire', cells: [0], source: 1, damage: 0, qi: 0 }] };
    const second: BoardVisualEffect = { id: 4, kind: 'clear', cleared: [0, 2], changed: [3], effects: [{ kind: 'lightning', cells: [2], damage: 0, qi: 0 }] };
    const start = buildCellVisuals(first, null), next = buildCellVisuals(second, first);
    expect(cellMotion(start[0], 50, 0, 1)).toMatchObject({ opacity: 1, scale: 1 });
    expect(cellMotion(start[0], 50, 1, 1)).toMatchObject({ opacity: 0, scale: .5 });
    expect(cellMotion(next[0], 50, 0, 1)).toMatchObject({ opacity: 0, scale: .5 });
    expect(cellMotion(next[2], 50, 0, 1)).toMatchObject({ opacity: 1, scale: 1 });
    expect(cellMotion(next[3], 50, .5, 1.12).scale).toBe(1.12);
    expect(start[1]).toMatchObject({ flashing: true, flashColor: '#ffb063' });
    expect(next[0].flashing).toBe(false);
    expect(next[2].flashColor).toBe('#c7a5ff');
    expect(buildCellVisuals(first, { id: 5, kind: 'fall', falls: [] })[0].hidden).toBe(false);
  });

  it('disables all motion and flashes under reduced motion', () => {
    const effect: BoardVisualEffect = { id: 6, kind: 'clear', cleared: [0], changed: [1], effects: [{ kind: 'spirit', cells: [0, 1], damage: 0, qi: 3 }] };
    for (const visual of buildCellVisuals(effect, effect, true)) {
      expect(cellMotion(visual, 50, .5, 1.12)).toEqual({ tx: 0, ty: 0, opacity: 1, scale: 1 });
      expect(visual.flashing).toBe(false);
    }
    expect([BOARD_SWAP_MS, BOARD_CLEAR_MS, BOARD_FALL_MS, BOARD_REJECT_MS]).toEqual([210, 240, 280, 260]);
  });
});
