export interface PanelSlice {
  clip: { x: number; y: number; width: number; height: number };
  image: { x: number; y: number; width: number; height: number };
}

// Caps scale uniformly with height. Only the quiet center changes its x scale.
export function gameplayPanelSlices(sourceWidth: number, sourceHeight: number, width: number, height: number): PanelSlice[] {
  if (sourceWidth <= 0 || sourceHeight <= 0 || width <= 0 || height <= 0) return [];
  const cap = Math.min(sourceHeight * .75, sourceWidth / 3);
  const edge = Math.min(cap * height / sourceHeight, width / 2);
  const sources = [[0, cap], [cap, sourceWidth - cap * 2], [sourceWidth - cap, cap]];
  const destinations = [[0, edge], [edge, width - edge * 2], [width - edge, edge]];
  return sources.flatMap(([sourceX, sourceW], index) => {
    const [x, destinationWidth] = destinations[index];
    if (destinationWidth <= 0) return [];
    const scaleX = destinationWidth / sourceW;
    return [{
      clip: { x, y: 0, width: destinationWidth, height },
      image: { x: x - sourceX * scaleX, y: 0, width: sourceWidth * scaleX, height },
    }];
  });
}
