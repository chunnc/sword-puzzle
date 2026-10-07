import { formatHudAmount } from '../hudPresentation';

describe('HUD amount display', () => {
  it.each([
    [0, '0'], [760, '760'], [9999, '9999'], [10000, '10K'],
    [12345, '12.3K'], [999999, '999K'], [1000000, '1M'],
    [99500000, '99.5M'], [1500000000, '1.5B'], [2000000000000, '2T'],
    [Number.MAX_SAFE_INTEGER, '9007T'],
  ])('fits %s into a compact counter as %s', (amount, display) => {
    expect(formatHudAmount(amount)).toBe(display);
  });
});
