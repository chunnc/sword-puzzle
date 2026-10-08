import type { BoardAnimationEffect, BoardAnimationFall, CellPosition } from '../game/types';

export interface BoardGeometry { width: number; height: number; activeCells?: boolean[] }
const DEFAULT_GEOMETRY: BoardGeometry = { width: 7, height: 7 };
export const BOARD_SWAP_MS = 320;
export const BOARD_CLEAR_MS = 360;
export const BOARD_FIRE_MS = 800;
export const BOARD_LIGHTNING_MS = 1000;
export const BOARD_FALL_MS = 450;
export const BOARD_CHAIN_DELAY_MS = 300;
export const BOARD_REJECT_MS = 390;
export const BOARD_REJECT_OUT_MS = 165;
export const BOARD_REJECT_BACK_MS = BOARD_REJECT_MS - BOARD_REJECT_OUT_MS;
export const BOARD_FLASH_IN_MS = 105;
export const BOARD_PULSE_IN_MS = 150;
export const BOARD_FIRE_CLEAR_AT = .75;
export const BOARD_LIGHTNING_CLEAR_AT = .8;

export function boardClearDurationMs(kindOrKinds: BoardAnimationEffect['kind'] | readonly BoardAnimationEffect['kind'][]) {
  const kinds = typeof kindOrKinds === 'string' ? [kindOrKinds] : kindOrKinds;
  return kinds.reduce((duration, kind) => Math.max(duration,
    kind === 'fire' ? BOARD_FIRE_MS : kind === 'lightning' ? BOARD_LIGHTNING_MS : BOARD_CLEAR_MS), BOARD_CLEAR_MS);
}

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

export interface BoardEffectTarget {
  index: number;
  x: number;
  y: number;
  impactAt: number;
}

export interface BoardEffectCue {
  kind: 'fire' | 'lightning';
  sourceX: number;
  sourceY: number;
  sourceIndex: number;
  startAt: number;
  clearAt: number;
  seed: number;
  targets: BoardEffectTarget[];
}

export interface CellVisual {
  dx: number;
  dy: number;
  falling: boolean;
  clearing: boolean;
  hidden: boolean;
  changed: boolean;
  flashing: boolean;
  flashColor: string;
  clearAt: number;
  flashAt: number | null;
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

export function cellCenter(index: number, geometry: BoardGeometry = DEFAULT_GEOMETRY) {
  return {
    x: index % geometry.width + .5,
    y: geometry.height - 1 - Math.floor(index / geometry.width) + .5,
  };
}

function validCell(index: number, geometry: BoardGeometry) {
  return Number.isInteger(index) && index >= 0 && index < geometry.width * geometry.height
    && (!geometry.activeCells || geometry.activeCells[index] === true);
}

export function effectSeed(runId: string, effectId: number, index: number, kind: string) {
  let hash = 2166136261;
  const input = `${runId}:${effectId}:${index}:${kind}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

export function buildBoardEffectCues(
  effect: BoardVisualEffect | null,
  geometry: BoardGeometry = DEFAULT_GEOMETRY,
  runId = '',
): BoardEffectCue[] {
  if (!effect || effect.kind !== 'clear') return [];
  const events = effect.effects.filter((item): item is BoardAnimationEffect & {
    kind: 'fire' | 'lightning'; source: number;
  } => (item.kind === 'fire' || item.kind === 'lightning')
    && item.source !== undefined && validCell(item.source, geometry)
    && item.cells.some(index => validCell(index, geometry)));
  const durationMs = boardClearDurationMs(effect.effects.map(item => item.kind));
  return events.map((event, eventIndex) => {
    const targetIndices = [...new Set(event.cells.filter(index => validCell(index, geometry)))];
    const points = targetIndices.map(index => ({ index, ...cellCenter(index, geometry) }));
    // Fire and lightning events are emitted from a concrete charged/source cell.
    const sourceIndex = event.source;
    const source = cellCenter(sourceIndex, geometry);
    const startAt = events.length <= 1 ? 0 : eventIndex / (events.length - 1) * (80 / durationMs);
    let targets = points;
    if (event.kind === 'fire') {
      targets = [...points].sort((a, b) => Math.hypot(a.x - source.x, a.y - source.y)
        - Math.hypot(b.x - source.x, b.y - source.y) || a.index - b.index);
    }
    const maxDistance = Math.max(1, ...targets.map(point => Math.hypot(point.x - source.x, point.y - source.y)));
    return {
      kind: event.kind as BoardEffectCue['kind'],
      sourceX: source.x,
      sourceY: source.y,
      sourceIndex,
      startAt,
      clearAt: startAt + (event.kind === 'fire' ? BOARD_FIRE_CLEAR_AT : BOARD_LIGHTNING_CLEAR_AT),
      seed: effectSeed(runId, effect.id, eventIndex, event.kind),
      targets: targets.map((point, targetIndex) => ({
        ...point,
        impactAt: event.kind === 'fire'
          ? startAt + .16 + .28 * Math.hypot(point.x - source.x, point.y - source.y) / maxDistance
          : startAt + (targets.length === 1 ? .55 : .2 + .35 * targetIndex / (targets.length - 1)),
      })),
    };
  });
}

export function cellImpactOpacity(visual: CellVisual, progress: number) {
  'worklet';
  if (visual.flashAt === null) return 0;
  const age = progress - visual.flashAt;
  const rise = .035, duration = .17;
  if (age < 0 || age >= duration) return 0;
  const envelope = age < rise ? age / rise : 1 - (age - rise) / (duration - rise);
  return .68 * envelope;
}

export function pointToCell(px: number, py: number, side: number, geometry: BoardGeometry = DEFAULT_GEOMETRY): CellPosition | null {
  'worklet';
  if (side <= 0 || px < 0 || py < 0 || px >= side || py >= side * geometry.height / geometry.width) return null;
  const pitch = side / geometry.width;
  const column = Math.floor(px / pitch), row = geometry.height - 1 - Math.floor(py / pitch);
  if (geometry.activeCells && !geometry.activeCells[row * geometry.width + column]) return null;
  return { x: column, y: row };
}

export function buildCellVisuals(
  effect: BoardVisualEffect | null,
  previous: BoardVisualEffect | null,
  reduceMotion = false,
  geometry: BoardGeometry = DEFAULT_GEOMETRY,
  cues: BoardEffectCue[] = buildBoardEffectCues(effect, geometry),
): CellVisual[] {
  const previouslyCleared = new Set(previous?.kind === 'clear' ? previous.cleared : []);
  const impacts = new Map<number, number>();
  const clearStarts = new Map<number, number>();
  for (const cue of cues) {
    const sourceClear = clearStarts.get(cue.sourceIndex);
    if (sourceClear === undefined || cue.clearAt < sourceClear) clearStarts.set(cue.sourceIndex, cue.clearAt);
    for (const target of cue.targets) {
      const current = impacts.get(target.index);
      if (current === undefined || target.impactAt < current) impacts.set(target.index, target.impactAt);
      const clearStart = clearStarts.get(target.index);
      if (clearStart === undefined || cue.clearAt < clearStart) clearStarts.set(target.index, cue.clearAt);
    }
  }
  return Array.from({ length: geometry.width * geometry.height }, (_, index) => {
    const visual: CellVisual = {
      dx: 0, dy: 0, falling: false, clearing: false, hidden: false,
      changed: false, flashing: false, flashColor: '#ffeab0', clearAt: 0, flashAt: null,
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
      visual.flashAt = impacts.get(index) ?? null;
      visual.clearAt = cleared ? clearStarts.get(index) ?? 0 : 0;
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
  const clearProgress = Math.max(0, Math.min(1, (progress - visual.clearAt) / Math.max(.0001, 1 - visual.clearAt)));
  return {
    tx: visual.dx * pitch * travel,
    ty: visual.dy * pitch * travel,
    opacity: visual.hidden ? 0 : visual.clearing ? 1 - clearProgress : 1,
    scale: visual.hidden ? .5 : visual.clearing ? 1 - .5 * clearProgress : visual.changed ? pulse : 1,
  };
}

// Match the old row traversal for screen reader order (top-left first).
export function displayIndices(geometry: BoardGeometry) {
  return Array.from({ length: geometry.width * geometry.height }, (_, n) => (geometry.height-1-Math.floor(n/geometry.width))*geometry.width+n%geometry.width).filter(i => !geometry.activeCells || geometry.activeCells[i]);
}
// Legacy helper export retained for existing callers; the board uses its geometry.
export const DISPLAY_INDICES = displayIndices(DEFAULT_GEOMETRY);
