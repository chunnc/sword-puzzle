export const RESULT_PANEL_MS = 340;
export const RESULT_STAR_MS = 300;
export const RESULT_STAR_GAP_MS = 100;
export const RESULT_REWARD_MS = 160;

export function resultTimeline(stars: number, hasRewards: boolean) {
  const rewardStart = RESULT_PANEL_MS + stars * RESULT_STAR_MS + Math.max(0, stars - 1) * RESULT_STAR_GAP_MS;
  return { rewardStart, duration: rewardStart + (hasRewards ? RESULT_REWARD_MS : 0) };
}

export function starProgress(elapsed: number, index: number, earned: boolean) {
  'worklet';
  if (!earned) return 0;
  return Math.max(0, Math.min(1, (elapsed - RESULT_PANEL_MS - index * (RESULT_STAR_MS + RESULT_STAR_GAP_MS)) / RESULT_STAR_MS));
}

/** Saturation changes RGB only; the generated sprite's alpha remains intact. */
export function starColorMatrix(saturation: number) {
  'worklet';
  const gray = 1 - saturation, r = 0.2126 * gray, g = 0.7152 * gray, b = 0.0722 * gray;
  return [r + saturation, g, b, 0, 0, r, g + saturation, b, 0, 0, r, g, b + saturation, 0, 0, 0, 0, 0, 1, 0];
}

export function resultPanelScale(elapsed: number) {
  'worklet';
  if (elapsed >= RESULT_PANEL_MS) return 1;
  if (elapsed >= 240) return 1.04 - 0.04 * (elapsed - 240) / 100;
  const progress = Math.max(0, elapsed / 240);
  return 0.72 + 0.32 * (1 - Math.pow(1 - progress, 3));
}
