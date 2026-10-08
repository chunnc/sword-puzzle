import { createBoardMotionSession, createBoardMotionFrame, updateBoardMotionFrame, finishBoardMotionSession } from '../boardMotion';
import { buildCellVisuals, type BoardVisualEffect } from '../boardVisuals';

jest.mock('react-native-reanimated', () => ({
  makeMutable: (value: unknown) => ({ value }), cancelAnimation: jest.fn(),
}));

it('allocates outputs only for affected cells, with the correct first frame before any UI update', () => {
  const visuals = buildCellVisuals({ id: 1, kind: 'fall', falls: [{ index: 7, fromY: 4 }] }, null);
  const frame = createBoardMotionFrame(visuals, 50);
  expect(frame.animated).toHaveLength(1);
  expect(frame.cells[7]!.transform.value).toEqual([{ translateX: 0 }, { translateY: -150 }, { scale: 1 }]);
  expect(frame.cells[7]!.opacity.value).toBe(1);
  expect(frame.cells.filter(Boolean)).toHaveLength(1);
  updateBoardMotionFrame(frame, 1, 1);
  expect(frame.cells[7]!.transform.value).toEqual([{ translateX: 0 }, { translateY: 0 }, { scale: 1 }]);
});

it.each(['fall', 'swap', 'clear', 'reject'] as const)('finishes %s without modifying another session, including a late reaction', kind => {
  const effect: BoardVisualEffect = kind === 'fall' ? { id: 1, kind, falls: [{ index: 7, fromY: 4 }] }
    : kind === 'clear' ? { id: 1, kind, cleared: [7], changed: [], effects: [] }
    : { id: 1, kind, first: { x: 0, y: 1 }, second: { x: 1, y: 1 } };
  const old = createBoardMotionSession(kind);
  const oldFrame = createBoardMotionFrame(buildCellVisuals(effect, null), 50);
  old.progress.value = .5;
  old.pulse.value = 1.12;
  old.flash.value = .85;
  const next = createBoardMotionSession('fall');
  const nextFrame = createBoardMotionFrame(buildCellVisuals({ id: 2, kind: 'fall', falls: [{ index: 48, fromY: 7 }] }, effect), 50);
  finishBoardMotionSession(old, oldFrame);
  const final = structuredClone(oldFrame.cells[7]!.transform.value);
  updateBoardMotionFrame(oldFrame, old.progress.value, old.pulse.value);
  expect(oldFrame.cells[7]!.transform.value).toEqual(final);
  expect(old.progress.value).toBe(kind === 'reject' ? 0 : 1);
  expect(old.pulse.value).toBe(1);
  expect(old.flash.value).toBe(0);
  expect(next.progress.value).toBe(0);
  expect(nextFrame.cells[48]!.transform.value[1].translateY).toBe(-50);
  if (kind === 'clear') expect(oldFrame.cells[7]!.opacity.value).toBe(0);
});

it('keeps previously cleared cells hidden and uses no outputs for idle or reduced motion', () => {
  const first: BoardVisualEffect = { id: 1, kind: 'clear', cleared: [7], changed: [], effects: [] };
  const second: BoardVisualEffect = { ...first, id: 2, cleared: [7, 8] };
  const frame = createBoardMotionFrame(buildCellVisuals(second, first), 50);
  expect(frame.cells[7]).toBeNull();
  expect(frame.animated).toHaveLength(1);
  expect(frame.cells[8]!.opacity.value).toBe(1);
  for (const visuals of [buildCellVisuals(null, first), buildCellVisuals(second, first, true)]) {
    expect(createBoardMotionFrame(visuals, 50).animated).toHaveLength(0);
  }
});
