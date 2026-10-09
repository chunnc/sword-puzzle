import type { BoardAnimationEffect, BoardAnimationFall, CellPosition } from '../game/types';

export interface BoardGeometry { width: number; height: number; activeCells?: boolean[] }
const DEFAULT_GEOMETRY: BoardGeometry = { width: 7, height: 7 };
export const BOARD_SWAP_MS = 320;
export const BOARD_CLEAR_MS = 360;
export const BOARD_FIRE_MS = 1200;
export const BOARD_LIGHTNING_MS = 1600;
export const BOARD_SPIRIT_MS = 1000;
export const BOARD_FALL_MS = 450;
export const BOARD_CHAIN_DELAY_MS = 300;
export const BOARD_REJECT_MS = 390;
export const BOARD_REJECT_OUT_MS = 165;
export const BOARD_REJECT_BACK_MS = BOARD_REJECT_MS - BOARD_REJECT_OUT_MS;
export const BOARD_FLASH_IN_MS = 105;
export const BOARD_PULSE_IN_MS = 150;
export const BOARD_FIRE_CLEAR_AT = .75;
export const BOARD_LIGHTNING_CLEAR_AT = .8;
export const BOARD_SWORD_SWEEP_MS = 220;
export const BOARD_SWORD_CROSS_DELAY_MS = 60;
export const BOARD_SWORD_AFTERIMAGE_MS = 300;
export const BOARD_SWORD_SHARDS_MS = 500;

type ClearTimingInput = BoardAnimationEffect['kind'] | BoardAnimationEffect;
export function boardClearDurationMs(effectOrEffects: ClearTimingInput | readonly ClearTimingInput[]) {
  const effects: readonly ClearTimingInput[] = Array.isArray(effectOrEffects)
    ? effectOrEffects : [effectOrEffects as ClearTimingInput];
  return effects.reduce((duration, effect) => {
    const kind = typeof effect === 'string' ? effect : effect.kind;
    const swordTier = typeof effect === 'string' ? undefined : effect.swordChargeTier;
    const spiritMs = typeof effect !== 'string' && kind === 'spirit' && effect.spiritChargeTier ? BOARD_SPIRIT_MS : 0;
    const swordMs = (kind === 'slash' || kind === 'cross') && swordTier
      ? BOARD_SWORD_SWEEP_MS + (swordTier === 5 ? BOARD_SWORD_CROSS_DELAY_MS : 0) + BOARD_SWORD_AFTERIMAGE_MS + BOARD_SWORD_SHARDS_MS : 0;
    return Math.max(duration, swordMs, spiritMs,
      kind === 'fire' ? BOARD_FIRE_MS : kind === 'lightning' ? BOARD_LIGHTNING_MS : BOARD_CLEAR_MS);
  }, BOARD_CLEAR_MS);
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

interface BoardEffectCueBase {
  sourceX: number;
  sourceY: number;
  sourceIndex: number;
  startAt: number;
  clearAt: number;
  seed: number;
  targets: BoardEffectTarget[];
}

export interface ElementalBoardEffectCue extends BoardEffectCueBase { kind: 'fire' | 'lightning' }
export type SwordCutAxis = 'horizontal' | 'vertical';
export interface SwordStroke {
  axis: SwordCutAxis;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startAtMs: number;
}
export interface SwordBoardEffectCue extends BoardEffectCueBase {
  kind: 'slash' | 'cross';
  splitAtMs: number;
  endAtMs: number;
  strokes: SwordStroke[];
  targets: (BoardEffectTarget & { axis: SwordCutAxis })[];
}
export type BoardEffectCue = ElementalBoardEffectCue | SwordBoardEffectCue;

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
  splitAt: number | null;
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
  previous: BoardVisualEffect | null = null,
): BoardEffectCue[] {
  if (!effect || effect.kind !== 'clear') return [];
  const events = effect.effects.filter((item): item is BoardAnimationEffect & {
    source: number;
  } => (item.kind === 'fire' || item.kind === 'lightning'
    || ((item.kind === 'slash' || item.kind === 'cross') && !!item.swordChargeTier))
    && item.source !== undefined && validCell(item.source, geometry)
    && item.cells.some(index => validCell(index, geometry)));
  const durationMs = boardClearDurationMs(effect.effects);
  const alreadyCleared = new Set(previous?.kind === 'clear' ? previous.cleared : []);
  const cleared = new Set(effect.cleared);
  const claimedSwordTargets = new Set<number>();
  return events.map((event, eventIndex): BoardEffectCue => {
    const targetIndices = [...new Set(event.cells.filter(index => validCell(index, geometry)))];
    const points = targetIndices.map(index => ({ index, ...cellCenter(index, geometry) }));
    // Effects retain their source even when an earlier trace has already removed it.
    const sourceIndex = event.source;
    const source = cellCenter(sourceIndex, geometry);
    if (event.kind === 'slash' || event.kind === 'cross') {
      const cross = event.swordChargeTier === 5;
      const splitAtMs = BOARD_SWORD_SWEEP_MS + (cross ? BOARD_SWORD_CROSS_DELAY_MS : 0) + BOARD_SWORD_AFTERIMAGE_MS;
      const strokes: SwordStroke[] = [{ axis: 'horizontal', startX: 0, startY: source.y,
        endX: geometry.width, endY: source.y, startAtMs: 0 }];
      if (cross) strokes.push({ axis: 'vertical', startX: source.x, startY: 0,
        endX: source.x, endY: geometry.height, startAtMs: BOARD_SWORD_CROSS_DELAY_MS });
      return {
        kind: cross ? 'cross' : 'slash', sourceX: source.x, sourceY: source.y, sourceIndex,
        startAt: 0, clearAt: splitAtMs / durationMs, splitAtMs,
        endAtMs: splitAtMs + BOARD_SWORD_SHARDS_MS, strokes,
        seed: effectSeed(runId, effect.id, eventIndex, event.kind),
        targets: points.filter(point => {
          const onStroke = point.y === source.y || cross && point.x === source.x;
          if (!onStroke || !cleared.has(point.index) || alreadyCleared.has(point.index) || claimedSwordTargets.has(point.index)) return false;
          claimedSwordTargets.add(point.index);
          return true;
        }).map((point): SwordBoardEffectCue['targets'][number] => ({ ...point, impactAt: splitAtMs / durationMs,
          axis: point.y === source.y ? 'horizontal' : 'vertical' })),
      };
    }
    const startAt = events.length <= 1 ? 0 : eventIndex / (events.length - 1) * (80 / durationMs);
    let targets = points;
    if (event.kind === 'fire') {
      targets = [...points].sort((a, b) => Math.hypot(a.x - source.x, a.y - source.y)
        - Math.hypot(b.x - source.x, b.y - source.y) || a.index - b.index);
    }
    const maxDistance = Math.max(1, ...targets.map(point => Math.hypot(point.x - source.x, point.y - source.y)));
    return {
      kind: event.kind as ElementalBoardEffectCue['kind'],
      sourceX: source.x,
      sourceY: source.y,
      sourceIndex,
      startAt,
      clearAt: startAt + (event.kind === 'fire' ? BOARD_FIRE_CLEAR_AT : BOARD_LIGHTNING_CLEAR_AT),
      seed: effectSeed(runId, effect.id, eventIndex, event.kind),
      targets: targets.map(point => ({
        ...point,
        impactAt: event.kind === 'fire'
          ? startAt + .16 + .28 * Math.hypot(point.x - source.x, point.y - source.y) / maxDistance
          : startAt + .08,
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
  cues: BoardEffectCue[] = buildBoardEffectCues(effect, geometry, '', previous),
): CellVisual[] {
  const previouslyCleared = new Set(previous?.kind === 'clear' ? previous.cleared : []);
  const impacts = new Map<number, number>();
  const clearStarts = new Map<number, number>();
  const splits = new Map<number, number>();
  for (const cue of cues) {
    if (cue.kind === 'slash' || cue.kind === 'cross') {
      for (const target of cue.targets) {
        const current = splits.get(target.index);
        if (current === undefined || cue.clearAt < current) splits.set(target.index, cue.clearAt);
      }
      continue;
    }
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
      changed: false, flashing: false, flashColor: '#ffeab0', clearAt: 0, flashAt: null, splitAt: null,
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
      visual.flashing = !!trace && !trace.swordChargeTier;
      visual.flashAt = impacts.get(index) ?? null;
      visual.clearAt = cleared ? clearStarts.get(index) ?? 0 : 0;
      visual.splitAt = cleared && !visual.hidden ? splits.get(index) ?? null : null;
      if (visual.splitAt !== null) visual.flashing = false;
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
    opacity: visual.hidden ? 0 : visual.splitAt !== null ? Number(progress < visual.splitAt) : visual.clearing ? 1 - clearProgress : 1,
    scale: visual.hidden ? .5 : visual.splitAt !== null ? 1 : visual.clearing ? 1 - .5 * clearProgress : visual.changed ? pulse : 1,
  };
}

// Match the old row traversal for screen reader order (top-left first).
export function displayIndices(geometry: BoardGeometry) {
  return Array.from({ length: geometry.width * geometry.height }, (_, n) => (geometry.height-1-Math.floor(n/geometry.width))*geometry.width+n%geometry.width).filter(i => !geometry.activeCells || geometry.activeCells[i]);
}
// Legacy helper export retained for existing callers; the board uses its geometry.
export const DISPLAY_INDICES = displayIndices(DEFAULT_GEOMETRY);
