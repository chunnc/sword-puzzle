import type { BoardAnimationEffect, BoardAnimationFall, CellPosition } from '../game/types';

export const BOARD_SIZE = 7;
export const BOARD_SWAP_MS = 210;
export const BOARD_CLEAR_MS = 240;
export const BOARD_FALL_MS = 280;
export const BOARD_CHAIN_DELAY_MS = 70;
export const BOARD_REJECT_MS = 260;
export const BOARD_REJECT_OUT_MS = 110;
export const BOARD_REJECT_BACK_MS = BOARD_REJECT_MS - BOARD_REJECT_OUT_MS;
export const BOARD_FLASH_IN_MS = 70;
export const BOARD_PULSE_IN_MS = 100;

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
export function cellBounds(index: number, side: number) {
  const pitch = side / BOARD_SIZE;
  return {
    x: (index % BOARD_SIZE) * pitch + 1,
    y: (BOARD_SIZE - 1 - Math.floor(index / BOARD_SIZE)) * pitch + 1,
    width: Math.max(0, pitch - 2),
    height: Math.max(0, pitch - 2),
  };
}

export function pointToCell(px: number, py: number, side: number): CellPosition | null {
  'worklet';
  if (side <= 0) return null;
  const pitch = side / BOARD_SIZE;
  const column = Math.max(0, Math.min(BOARD_SIZE - 1, Math.floor(px / pitch)));
  const row = Math.max(0, Math.min(BOARD_SIZE - 1, Math.floor(py / pitch)));
  return { x: column, y: BOARD_SIZE - 1 - row };
}

export function buildCellVisuals(effect: BoardVisualEffect | null, previous: BoardVisualEffect | null, reduceMotion = false): CellVisual[] {
  const previouslyCleared = new Set(previous?.kind === 'clear' ? previous.cleared : []);
  return Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
    const visual: CellVisual = {
      dx: 0, dy: 0, falling: false, clearing: false, hidden: false,
      changed: false, flashing: false, flashColor: '#ffeab0',
    };
    if (!effect || reduceMotion) return visual;
    if (effect.kind === 'swap' || effect.kind === 'reject') {
      const x = index % BOARD_SIZE, y = Math.floor(index / BOARD_SIZE);
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
        visual.dy = Math.floor(index / BOARD_SIZE) - fall.fromY;
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
export const DISPLAY_INDICES = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, displayIndex) =>
  (BOARD_SIZE - 1 - Math.floor(displayIndex / BOARD_SIZE)) * BOARD_SIZE + displayIndex % BOARD_SIZE);
