import type { CellPosition } from '../game/types';
import type { BoardGeometry } from './boardVisuals';

export const BOARD_SWIPE_DISTANCE = 10;
export const BOARD_SWIPE_AXIS_RATIO = 1.2;

/** Screen-space direction; board Y grows upward. Safe to call on the UI thread. */
export function swipeNeighbor(
  source: CellPosition, dx: number, dy: number, geometry: BoardGeometry,
): CellPosition | null {
  'worklet';
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (!Number.isInteger(source.x) || !Number.isInteger(source.y)
    || source.x < 0 || source.y < 0 || source.x >= geometry.width || source.y >= geometry.height
    || geometry.activeCells && !geometry.activeCells[source.y * geometry.width + source.x]) return null;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  let target: CellPosition;
  if (ax >= BOARD_SWIPE_DISTANCE && ax >= ay * BOARD_SWIPE_AXIS_RATIO) {
    target = { x: source.x + (dx > 0 ? 1 : -1), y: source.y };
  } else if (ay >= BOARD_SWIPE_DISTANCE && ay >= ax * BOARD_SWIPE_AXIS_RATIO) {
    target = { x: source.x, y: source.y + (dy > 0 ? -1 : 1) };
  } else return null;
  if (target.x < 0 || target.y < 0 || target.x >= geometry.width || target.y >= geometry.height
    || geometry.activeCells && !geometry.activeCells[target.y * geometry.width + target.x]) return null;
  return target;
}
