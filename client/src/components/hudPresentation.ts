/** Compact only the displayed amount; accessibility keeps the exact balance. */
export function formatHudAmount(amount: number): string {
  if (amount < 10_000) return String(amount);
  const units = [[1_000_000_000_000, 'T'], [1_000_000_000, 'B'], [1_000_000, 'M'], [1_000, 'K']] as const;
  const [divisor, suffix] = units.find(([divisor]) => amount >= divisor)!;
  const scaled = amount / divisor;
  const compact = scaled >= 100 ? Math.floor(scaled) : Math.floor(scaled * 10) / 10;
  return `${compact}${suffix}`;
}
