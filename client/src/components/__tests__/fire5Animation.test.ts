import { FIRE5_IDLE, fire5FrameAt } from '../fire5Animation';

describe('Fire 5 idle timeline', () => {
  it('uses the padded atlas rectangles and every metadata duration', () => {
    expect(FIRE5_IDLE.frames).toHaveLength(24);
    let start = 0;
    FIRE5_IDLE.frames.forEach((frame, index) => {
      expect(fire5FrameAt(start)).toBe(frame);
      expect(fire5FrameAt(start + frame.durationMs - .001)).toBe(frame);
      expect(frame.rect).toEqual({ x: index % 6 * 260 + 2, y: Math.floor(index / 6) * 260 + 2, width: 256, height: 256 });
      start += frame.durationMs;
    });
    expect(start).toBe(1000);
  });

  it('wraps at the end and across multiple loops', () => {
    expect(fire5FrameAt(0).index).toBe(0);
    expect(fire5FrameAt(41.99).index).toBe(0);
    expect(fire5FrameAt(42).index).toBe(1);
    expect(fire5FrameAt(999.99).index).toBe(23);
    expect(fire5FrameAt(1000).index).toBe(0);
    expect(fire5FrameAt(9042).index).toBe(1);
    expect(fire5FrameAt(-1).index).toBe(23);
  });

  it('always selects the first frame for Reduce Motion', () => {
    for (const time of [0, 42, 500, 999, 9042]) expect(fire5FrameAt(time, true).index).toBe(0);
  });
});
