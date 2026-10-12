import { gameplayPanelSlices } from '../gameplayPanelSlices';

it.each([44, 48, 52, 60])('preserves both end caps at height %s across viewport widths', height => {
  for (const width of [296, 320, 366, 744]) {
    const slices = gameplayPanelSlices(1120, 154, width, height);
    expect(slices).toHaveLength(3);
    const [left, center, right] = slices;
    expect(left.clip.x).toBe(0);
    expect(left.clip.width).toBe(height * .75);
    expect(right.clip.width).toBe(left.clip.width);
    expect(center.clip.x).toBe(left.clip.width);
    expect(right.clip.x).toBe(center.clip.x + center.clip.width);
    expect(right.clip.x + right.clip.width).toBe(width);
    for (const cap of [left, right]) expect(cap.image.width / 1120).toBeCloseTo(cap.image.height / 154);
    expect(center.clip.width).toBe(width - height * 1.5);
    expect(left.image.x).toBe(0);
    expect(right.image.x + right.image.width).toBeCloseTo(width);
  }
});

it('does not draw before layout or image dimensions are available', () => {
  expect(gameplayPanelSlices(1120, 154, 0, 60)).toEqual([]);
  expect(gameplayPanelSlices(0, 0, 366, 60)).toEqual([]);
});
