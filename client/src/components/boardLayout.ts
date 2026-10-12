import type { BoardGeometry } from './boardVisuals';

// Reserve space outside the grid for the contour's stroke and its Canvas.
export const BOARD_FRAME_INSET = 5;

export function boardLayout(availableWidth: number, availableHeight: number, geometry: BoardGeometry) {
  const frameSize = BOARD_FRAME_INSET * 2;
  const cellSize = Math.min(
    44,
    Math.max(0, availableWidth - frameSize) / Math.max(7, geometry.width),
    Math.max(0, availableHeight - frameSize) / Math.max(8, geometry.height),
  );
  return {
    width: cellSize * geometry.width + frameSize,
    height: cellSize * geometry.height + frameSize,
  };
}
