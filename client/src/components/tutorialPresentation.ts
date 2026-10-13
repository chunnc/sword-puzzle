import type { CellPosition } from '../game/types';
import { cellBounds, type BoardGeometry } from './boardVisuals';

export type TutorialMove = { key: string; from: CellPosition; to: CellPosition; text: string };
export const TUTORIAL_CYCLE_MS = 1800;
export const TUTORIAL_COLOR = '#FFF2B0';
// Anchor measured against the generated square PNG, including its transparent margins.
export const TUTORIAL_FINGERTIP = { x: .42, y: .035 };

export function tutorialGeometry(move: TutorialMove, side: number, geometry: BoardGeometry) {
  const from = cellBounds(move.from.y * geometry.width + move.from.x, side, geometry);
  const to = cellBounds(move.to.y * geometry.width + move.to.x, side, geometry);
  const x = Math.min(from.x, to.x), y = Math.min(from.y, to.y);
  const handSize = Math.max(36, Math.min(52, side / geometry.width * 1.2));
  const height = side * geometry.height / geometry.width;
  // Near the lower edge, put the wrist above the fingertip so the hand stays visible.
  const wristAbove = Math.max(from.y + from.height / 2, to.y + to.height / 2)
    + handSize * (1 - TUTORIAL_FINGERTIP.y) > height;
  return {
    from: { x: from.x + from.width / 2, y: from.y + from.height / 2 },
    to: { x: to.x + to.width / 2, y: to.y + to.height / 2 },
    outline: { x, y, width: Math.max(from.x + from.width, to.x + to.width) - x,
      height: Math.max(from.y + from.height, to.y + to.height) - y },
    handSize, handRotation: wristAbove ? '180deg' as const : '0deg' as const,
    fingertip: wristAbove ? { x: 1 - TUTORIAL_FINGERTIP.x, y: 1 - TUTORIAL_FINGERTIP.y } : TUTORIAL_FINGERTIP,
    width: side, height,
  };
}

export function tutorialFrame(phase: number, geometry: ReturnType<typeof tutorialGeometry>, textHeight: number) {
  'worklet';
  // Fade in, drag, hold at the destination, then fade out before resetting.
  const t = Math.max(0, Math.min(1, (phase - .15) / .55));
  const eased = t * t * (3 - 2 * t);
  const x = geometry.from.x + (geometry.to.x - geometry.from.x) * eased;
  const y = geometry.from.y + (geometry.to.y - geometry.from.y) * eased;
  const handX = x - geometry.handSize * geometry.fingertip.x;
  const handY = y - geometry.handSize * geometry.fingertip.y;
  const rightSpace = geometry.width - Math.max(geometry.from.x, geometry.to.x) - geometry.handSize * (1 - geometry.fingertip.x) - 14;
  const leftSpace = Math.min(geometry.from.x, geometry.to.x) - geometry.handSize * geometry.fingertip.x - 14;
  const beside = Math.max(rightSpace, leftSpace) >= 110;
  const onRight = rightSpace >= leftSpace;
  const textWidth = Math.max(0, Math.min(180, beside ? Math.max(rightSpace, leftSpace) : geometry.width - 12));
  const desiredX = beside ? (onRight ? handX + geometry.handSize + 8 : handX - textWidth - 8) : x - textWidth / 2;
  const desiredY = beside ? handY + 8 : handY - textHeight - 8;
  return {
    handX, handY, textWidth,
    textX: Math.max(6, Math.min(geometry.width - textWidth - 6, desiredX)),
    textY: Math.max(6, Math.min(geometry.height - textHeight - 6, desiredY)),
    opacity: phase < .1 ? phase / .1 : phase > .85 ? Math.max(0, (1 - phase) / .15) : 1,
  };
}
