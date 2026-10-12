import type { BoardGeometry } from './boardVisuals';

export interface OutlinePoint { x: number; y: number }
interface Edge { from: OutlinePoint; to: OutlinePoint; direction: number }
const key = ({ x, y }: OutlinePoint) => `${x},${y}`;

// Clockwise edges keep an active cell on their right. At a diagonal contact,
// turning right traces separate contours instead of joining them into a bow tie.
export function boardOutlineLoops(geometry: BoardGeometry): OutlinePoint[][] {
  const { width, height, activeCells } = geometry;
  const active = (x: number, row: number) => x >= 0 && x < width && row >= 0 && row < height
    && (!activeCells || !!activeCells[(height - 1 - row) * width + x]);
  const edges: Edge[] = [];
  const outgoing = new Map<string, number[]>();
  const add = (from: OutlinePoint, to: OutlinePoint, direction: number) => {
    const index = edges.push({ from, to, direction }) - 1;
    const at = key(from);
    outgoing.set(at, [...(outgoing.get(at) ?? []), index]);
  };
  for (let row = 0; row < height; row++) for (let x = 0; x < width; x++) {
    if (!active(x, row)) continue;
    if (!active(x, row - 1)) add({ x, y: row }, { x: x + 1, y: row }, 0);
    if (!active(x + 1, row)) add({ x: x + 1, y: row }, { x: x + 1, y: row + 1 }, 1);
    if (!active(x, row + 1)) add({ x: x + 1, y: row + 1 }, { x, y: row + 1 }, 2);
    if (!active(x - 1, row)) add({ x, y: row + 1 }, { x, y: row }, 3);
  }
  const visited = new Set<number>();
  const loops: OutlinePoint[][] = [];
  const turnRank = [1, 0, 3, 2]; // right, straight, left, reverse
  for (let start = 0; start < edges.length; start++) {
    if (visited.has(start)) continue;
    const loop: OutlinePoint[] = [];
    let current: number | undefined = start;
    while (current !== undefined && !visited.has(current)) {
      const edge: Edge = edges[current];
      visited.add(current);
      loop.push(edge.from);
      if (key(edge.to) === key(edges[start].from)) break;
      current = (outgoing.get(key(edge.to)) ?? []).filter(index => !visited.has(index))
        .sort((a, b) => turnRank.indexOf((edges[a].direction - edge.direction + 4) % 4)
          - turnRank.indexOf((edges[b].direction - edge.direction + 4) % 4))[0];
    }
    // Drop straight-through vertices so corner radii do not split long edges.
    loops.push(loop.filter((point, index) => {
      const before = loop[(index + loop.length - 1) % loop.length];
      const after = loop[(index + 1) % loop.length];
      return (point.x - before.x) * (after.y - point.y) !== (point.y - before.y) * (after.x - point.x);
    }));
  }
  return loops;
}

// SVG path data is accepted directly by Skia and keeps the geometry helper pure.
export function boardOutlinePath(geometry: BoardGeometry, side: number, radius = 4): string {
  if (side <= 0 || geometry.width <= 0) return '';
  const pitch = side / geometry.width;
  return boardOutlineLoops(geometry).map(loop => {
    const corners = loop.map((point, index) => {
      const before = loop[(index + loop.length - 1) % loop.length];
      const after = loop[(index + 1) % loop.length];
      const incomingLength = Math.hypot(point.x - before.x, point.y - before.y);
      const outgoingLength = Math.hypot(after.x - point.x, after.y - point.y);
      const r = Math.min(radius, incomingLength * pitch / 2, outgoingLength * pitch / 2);
      return {
        x: point.x * pitch, y: point.y * pitch,
        inX: point.x * pitch - (point.x - before.x) / incomingLength * r,
        inY: point.y * pitch - (point.y - before.y) / incomingLength * r,
        outX: point.x * pitch + (after.x - point.x) / outgoingLength * r,
        outY: point.y * pitch + (after.y - point.y) / outgoingLength * r,
      };
    });
    return corners.map((corner, index) => `${index ? 'L' : 'M'}${corner.inX},${corner.inY} Q${corner.x},${corner.y} ${corner.outX},${corner.outY}`).join(' ') + ' Z';
  }).join(' ');
}
