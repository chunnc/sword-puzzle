export function gameRoute(levelId: number, introRunId?: string | null): string {
  const path = `/game/${levelId}`;
  return introRunId ? `${path}?introRunId=${encodeURIComponent(introRunId)}` : path;
}
