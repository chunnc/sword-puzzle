import { cancelAnimation, makeMutable, type SharedValue } from 'react-native-reanimated';
import { cellMotion, type BoardVisualEffect, type CellVisual } from './boardVisuals';

type TileTransform = [{ translateX: number }, { translateY: number }, { scale: number }];
export interface CellMotionValues {
  transform: SharedValue<TileTransform>;
  opacity: SharedValue<number>;
}
export interface BoardMotionSession {
  kind: BoardVisualEffect['kind'] | undefined;
  progress: SharedValue<number>;
  pulse: SharedValue<number>;
  flash: SharedValue<number>;
}
export interface BoardMotionFrame {
  cells: (CellMotionValues | null)[];
  animated: { visual: CellVisual; values: CellMotionValues }[];
  pitch: number;
}

export function createBoardMotionSession(kind: BoardMotionSession['kind']): BoardMotionSession {
  return { kind, progress: makeMutable(0), pulse: makeMutable(1), flash: makeMutable(0) };
}

function tileTransform(frame: ReturnType<typeof cellMotion>): TileTransform {
  'worklet';
  return [{ translateX: frame.tx || 0 }, { translateY: frame.ty || 0 }, { scale: frame.scale }];
}

// Initialize outputs on the JS thread before Skia can draw the new phase.
// Stationary and already-hidden cells need no animated outputs or listeners.
export function createBoardMotionFrame(visuals: CellVisual[], pitch: number): BoardMotionFrame {
  const animated: BoardMotionFrame['animated'] = [];
  const cells = visuals.map(visual => {
    if (visual.hidden || !(visual.dx || visual.dy || visual.clearing || visual.changed)) return null;
    const frame = cellMotion(visual, pitch, 0, 1);
    const values = { transform: makeMutable(tileTransform(frame)), opacity: makeMutable(frame.opacity) };
    animated.push({ visual, values });
    return values;
  });
  return { cells, animated, pitch };
}

export function updateBoardMotionFrame(frame: BoardMotionFrame, progress: number, pulse: number) {
  'worklet';
  for (const cell of frame.animated) {
    const next = cellMotion(cell.visual, frame.pitch, progress, pulse);
    cell.values.transform.value = tileTransform(next);
    if (cell.visual.clearing) cell.values.opacity.value = next.opacity;
  }
}

// Cleanup owns this session only. A late mapper can still read it, but cannot
// rewind its cells or write into the next session's outputs.
export function finishBoardMotionSession(session: BoardMotionSession, frame: BoardMotionFrame) {
  'worklet';
  cancelAnimation(session.progress);
  cancelAnimation(session.pulse);
  cancelAnimation(session.flash);
  session.progress.value = session.kind === 'reject' ? 0 : 1;
  session.pulse.value = 1;
  session.flash.value = 0;
  updateBoardMotionFrame(frame, session.progress.value, 1);
}
