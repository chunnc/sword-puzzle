import {
  DISPLAY_INDICES, BOARD_SWAP_MS, BOARD_CLEAR_MS, BOARD_FIRE_MS, BOARD_LIGHTNING_MS, BOARD_FIRE_CLEAR_AT, BOARD_LIGHTNING_CLEAR_AT,
  BOARD_FALL_MS, BOARD_CHAIN_DELAY_MS, BOARD_REJECT_MS, boardClearDurationMs,
  buildBoardEffectCues, buildCellVisuals, cellBounds, cellImpactOpacity, cellMotion, effectSeed, pointToCell, type BoardVisualEffect,
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

  it('rejects swipes outside the board and ignores gestures before layout', () => {
    expect(pointToCell(-20, -20, 350)).toBeNull();
    expect(pointToCell(370, 370, 350)).toBeNull();
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
    const second: BoardVisualEffect = { id: 4, kind: 'clear', cleared: [0, 2], changed: [3], effects: [{ kind: 'lightning', cells: [2], source: 3, damage: 0, qi: 0 }] };
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
    expect([BOARD_SWAP_MS, BOARD_CLEAR_MS, BOARD_FALL_MS, BOARD_CHAIN_DELAY_MS, BOARD_REJECT_MS]).toEqual([320, 360, 450, 300, 390]);
  });

  it('builds deterministic fire and lightning cues from source and target cells', () => {
    const geometry = { width: 3, height: 3, activeCells: Array(9).fill(true) };
    const effect: BoardVisualEffect = {
      id: 17, kind: 'clear', cleared: [1, 4, 7], changed: [],
      effects: [
        { kind: 'fire', cells: [4, 1, 7], source: 4, damage: 1, qi: 0 },
        { kind: 'lightning', cells: [7, 1], source: 4, damage: 2, qi: 0 },
      ],
    };
    const cues = buildBoardEffectCues(effect, geometry, 'run-a');
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ kind: 'fire', sourceIndex: 4, sourceX: 1.5, sourceY: 1.5, startAt: 0 });
    expect(cues[0].targets.map(target => target.index)).toEqual([4, 1, 7]);
    expect(cues[0].targets[0].impactAt).toBeCloseTo(.16);
    expect(cues[0].targets[1].impactAt).toBeCloseTo(.44);
    expect(cues[0].targets[2].impactAt).toBeCloseTo(.44);
    expect(cues[1].startAt).toBeCloseTo(80 / BOARD_LIGHTNING_MS);
    expect(cues[1].targets.map(target => target.index)).toEqual([7, 1]);
    expect(cues[1].targets[0].impactAt).toBeCloseTo(80 / BOARD_LIGHTNING_MS + .08);
    expect(cues[1].targets[1].impactAt).toBeCloseTo(80 / BOARD_LIGHTNING_MS + .08);
    expect(cues[0].seed).toBe(buildBoardEffectCues(effect, geometry, 'run-a')[0].seed);
    expect(cues[0].seed).not.toBe(buildBoardEffectCues(effect, geometry, 'run-b')[0].seed);
    expect(effectSeed('run-a', 17, 0, 'fire')).not.toBe(effectSeed('run-a', 18, 0, 'fire'));
  });

  it('requires the game-provided source and keeps fire targets visible until the explosion finishes', () => {
    const geometry = { width: 3, height: 3, activeCells: Array(9).fill(true) };
    const effect: BoardVisualEffect = {
      id: 18, kind: 'clear', cleared: [0, 2], changed: [],
      effects: [{ kind: 'fire', cells: [0, 2], source: 4, damage: 1, qi: 0 }],
    };
    const cue = buildBoardEffectCues(effect, geometry)[0];
    expect(cue.sourceIndex).toBe(4);
    expect(cue.sourceX).toBe(1.5);
    expect(cue.sourceY).toBe(1.5);
    expect(cue.clearAt).toBe(BOARD_FIRE_CLEAR_AT);
    const visual = buildCellVisuals(effect, null, false, geometry, [cue]);
    expect(visual[0].clearAt).toBe(BOARD_FIRE_CLEAR_AT);
    expect(cellMotion(visual[0], 20, BOARD_FIRE_CLEAR_AT - .001, 1).opacity).toBe(1);
    expect(cellMotion(visual[0], 20, 1, 1).opacity).toBe(0);
    expect(cellImpactOpacity(visual[0], cue.targets[0].impactAt - .01)).toBe(0);
    expect(cellImpactOpacity(visual[0], cue.targets[0].impactAt + .035)).toBeCloseTo(.68);
    expect(buildBoardEffectCues({ ...effect, effects: [{ ...effect.effects[0], source: undefined }] }, geometry)).toHaveLength(0);
    expect(buildBoardEffectCues({ ...effect, effects: [{ ...effect.effects[0], source: 99 }] }, geometry)).toHaveLength(0);
  });

  it('keeps lightning targets visible until the source-to-target chain and impacts finish', () => {
    const geometry = { width: 3, height: 3, activeCells: Array(9).fill(true) };
    const effect: BoardVisualEffect = {
      id: 19, kind: 'clear', cleared: [4, 1, 7], changed: [],
      effects: [{ kind: 'lightning', cells: [7, 1], source: 4, damage: 1, qi: 0 }],
    };
    const cue = buildBoardEffectCues(effect, geometry)[0];
    expect(cue.sourceIndex).toBe(4);
    expect(cue.targets.map(target => target.index)).toEqual([7, 1]);
    expect(cue.targets[0].impactAt).toBe(.08);
    expect(cue.targets[1].impactAt).toBe(.08);
    expect(cue.clearAt).toBe(BOARD_LIGHTNING_CLEAR_AT);
    const visual = buildCellVisuals(effect, null, false, geometry, [cue]);
    for (const index of [1, 7]) {
      expect(visual[index].clearAt).toBe(BOARD_LIGHTNING_CLEAR_AT);
      expect(cellMotion(visual[index], 20, BOARD_LIGHTNING_CLEAR_AT - .001, 1).opacity).toBe(1);
      expect(cellMotion(visual[index], 20, 1, 1).opacity).toBe(0);
    }
  });

  it('chooses clear durations by effect kind and the longest duration for combined cues', () => {
    expect(boardClearDurationMs('fire')).toBe(BOARD_FIRE_MS);
    expect(boardClearDurationMs('lightning')).toBe(BOARD_LIGHTNING_MS);
    expect(boardClearDurationMs('spirit')).toBe(BOARD_CLEAR_MS);
    expect(boardClearDurationMs(['fire', 'lightning', 'spirit'])).toBe(1600);
  });
});
