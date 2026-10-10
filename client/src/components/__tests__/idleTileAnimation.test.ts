import { TileKind } from '../../game/types';
import { idleFrameAt, TIER5_IDLE_ANIMATIONS } from '../idleTileAnimation';

const animations = [
  ['Fire 5', TIER5_IDLE_ANIMATIONS[TileKind.Fire]!, 24, 1000],
  ['Lightning 5', TIER5_IDLE_ANIMATIONS[TileKind.Lightning]!, 46, 1916],
  ['Sword 5', TIER5_IDLE_ANIMATIONS[TileKind.Sword]!, 24, 1000],
  ['Spirit Orb 5', TIER5_IDLE_ANIMATIONS[TileKind.SpiritOrb]!, 23, 3000],
] as const;

describe.each(animations)('%s idle atlas', (_name, animation, frameCount, durationMs) => {
  it('uses every padded atlas rectangle and frame duration', () => {
    expect(animation.frames).toHaveLength(frameCount);
    let start = 0;
    animation.frames.forEach((frame, index) => {
      expect(idleFrameAt(animation, start)).toBe(frame);
      expect(idleFrameAt(animation, start + frame.durationMs - .001)).toBe(frame);
      expect(frame.rect).toEqual({
        x: index % 6 * 260 + 2,
        y: Math.floor(index / 6) * 260 + 2,
        width: 256,
        height: 256,
      });
      start += frame.durationMs;
    });
    expect(start).toBe(durationMs);
    expect(animation.durationMs).toBe(durationMs);
  });

  it('wraps loops and holds frame zero for Reduce Motion', () => {
    expect(idleFrameAt(animation, 0).index).toBe(0);
    expect(idleFrameAt(animation, durationMs).index).toBe(0);
    expect(idleFrameAt(animation, durationMs - .001).index).toBe(frameCount - 1);
    expect(idleFrameAt(animation, -1).index).toBe(frameCount - 1);
    for (const time of [0, 42, durationMs / 2, durationMs - 1, durationMs * 4]) {
      expect(idleFrameAt(animation, time, true).index).toBe(0);
    }
  });
});
