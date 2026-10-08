import type { BoardAnimationEffect, BoardAnimationFall, CellPosition } from '../game/types';

export interface BoardGeometry { width: number; height: number; activeCells?: boolean[] }
const DEFAULT_GEOMETRY: BoardGeometry = { width: 7, height: 7 };
export const BOARD_SWAP_MS = 320;
export const BOARD_CLEAR_MS = 360;
export const BOARD_FALL_MS = 450;
export const BOARD_CHAIN_DELAY_MS = 300;
export const BOARD_REJECT_MS = 390;
export const BOARD_REJECT_OUT_MS = 165;
export const BOARD_REJECT_BACK_MS = BOARD_REJECT_MS - BOARD_REJECT_OUT_MS;
export const BOARD_FLASH_IN_MS = 105;
export const BOARD_PULSE_IN_MS = 150;

export type BoardVisualEffect = {
  id: number;
  kind: 'swap' | 'reject';
  first: CellPosition;
  second: CellPosition;
} | {
  id: number;
  kind: 'clear';
  cleared: number[];
  changed: number[];
  effects: BoardAnimationEffect[];
} | {
  id: number;
  kind: 'fall';
  falls: BoardAnimationFall[];
};

export interface CellVisual {
  dx: number;
  dy: number;
  falling: boolean;
  clearing: boolean;
  hidden: boolean;
  changed: boolean;
  flashing: boolean;
  flashColor: string;
}

// The same bounds position both the artwork and its invisible touch target.
export function cellBounds(index: number, side: number, geometry: BoardGeometry = DEFAULT_GEOMETRY) {
  const pitch = side / geometry.width;
  return {
    x: (index % geometry.width) * pitch + 1,
    y: (geometry.height - 1 - Math.floor(index / geometry.width)) * pitch + 1,
    width: Math.max(0, pitch - 2),
    height: Math.max(0, pitch - 2),
  };
}

export function pointToCell(px: number, py: number, side: number, geometry: BoardGeometry = DEFAULT_GEOMETRY): CellPosition | null {
  'worklet';
  if (side <= 0 || px < 0 || py < 0 || px >= side || py >= side * geometry.height / geometry.width) return null;
  const pitch = side / geometry.width;
  const column = Math.floor(px / pitch), row = geometry.height - 1 - Math.floor(py / pitch);
  if (geometry.activeCells && !geometry.activeCells[row * geometry.width + column]) return null;
  return { x: column, y: row };
}

export function buildCellVisuals(effect: BoardVisualEffect | null, previous: BoardVisualEffect | null, reduceMotion = false, geometry: BoardGeometry = DEFAULT_GEOMETRY): CellVisual[] {
  const previouslyCleared = new Set(previous?.kind === 'clear' ? previous.cleared : []);
  return Array.from({ length: geometry.width * geometry.height }, (_, index) => {
    const visual: CellVisual = {
      dx: 0, dy: 0, falling: false, clearing: false, hidden: false,
      changed: false, flashing: false, flashColor: '#ffeab0',
    };
    if (!effect || reduceMotion) return visual;
    if (effect.kind === 'swap' || effect.kind === 'reject') {
      const x = index % geometry.width, y = Math.floor(index / geometry.width);
      const first = effect.first.x === x && effect.first.y === y;
      const second = effect.second.x === x && effect.second.y === y;
      if (first || second) {
        const from = first ? effect.first : effect.second;
        const to = first ? effect.second : effect.first;
        visual.dx = to.x - from.x;
        visual.dy = from.y - to.y;
      }
    } else if (effect.kind === 'fall') {
      const fall = effect.falls.find(item => item.index === index);
      if (fall) {
        visual.falling = true;
        visual.dy = Math.floor(index / geometry.width) - fall.fromY;
      }
    } else if (effect.kind === 'clear') {
      const cleared = effect.cleared.includes(index);
      visual.hidden = cleared && previouslyCleared.has(index);
      visual.clearing = cleared && !visual.hidden;
      visual.changed = !cleared && effect.changed.includes(index);
      const trace = effect.effects.find(item => item.cells.includes(index) || item.source === index);
      visual.flashing = !!trace;
      visual.flashColor = trace?.kind === 'fire' ? '#ffb063'
        : trace?.kind === 'lightning' ? '#c7a5ff'
        : trace?.kind === 'spirit' ? '#8efbd4' : '#ffeab0';
    }
    return visual;
  });
}

export function cellMotion(visual: CellVisual, pitch: number, progress: number, pulse: number) {
  'worklet';
  const travel = visual.falling ? 1 - progress : progress;
  return {
    tx: visual.dx * pitch * travel,
    ty: visual.dy * pitch * travel,
    opacity: visual.hidden ? 0 : visual.clearing ? 1 - progress : 1,
    scale: visual.hidden ? .5 : visual.clearing ? 1 - .5 * progress : visual.changed ? pulse : 1,
  };
}

// Match the old row traversal for screen reader order (top-left first).
export function displayIndices(geometry: BoardGeometry) {
  return Array.from({ length: geometry.width * geometry.height }, (_, n) => (geometry.height-1-Math.floor(n/geometry.width))*geometry.width+n%geometry.width).filter(i => !geometry.activeCells || geometry.activeCells[i]);
}
// Legacy helper export retained for existing callers; the board uses its geometry.
export const DISPLAY_INDICES = displayIndices(DEFAULT_GEOMETRY);
