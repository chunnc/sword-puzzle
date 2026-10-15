import { applyOperation, newlyGrantedItems, assistForFailures, mapStars, mapToLevel, realmForExp,
  advanceEnergy, consumeEnergy, type GameContent, type MapDefinition, type ObjectiveProgress, type PlayerProfile, type RunDefinition, type RunReport } from './game';

export interface MapStats {
  attemptsStarted: number; retryCount: number; wins: number; losses: number; abandoned: number;
  consecutiveFailures: number; bestStars: number; bestMovesUsed: number | null; firstWinAt: number | null;
}
export interface StoredRun extends RunDefinition {
  installationId: string; previousRunId: string | null; status: 'active' | RunReport['outcome'];
  createdAt: number; finishedAt?: number; energyConsumedAt?: number; report?: RunReport; receipt?: ReturnType<typeof completeRun>['receipt'];
}
export function emptyMapStats(): MapStats {
  return { attemptsStarted: 0, retryCount: 0, wins: 0, losses: 0, abandoned: 0,
    consecutiveFailures: 0, bestStars: 0, bestMovesUsed: null, firstWinAt: null };
}
export function startedStats(stats: MapStats): MapStats {
  return { ...stats, attemptsStarted: stats.attemptsStarted + 1, retryCount: stats.attemptsStarted };
}
export function abandonedStats(stats: MapStats): MapStats { return { ...stats, abandoned: stats.abandoned + 1 }; }
export function parseRunReport(raw: any, map: MapDefinition): RunReport {
  if (!raw || !['won','lost','abandoned'].includes(raw.outcome) || !Number.isSafeInteger(raw.movesUsed)
    || raw.movesUsed < 0 || typeof raw.extraMovesUsed !== 'boolean' || raw.movesUsed > map.moves + (raw.extraMovesUsed ? 3 : 0)
    || !raw.objectiveProgress || Array.isArray(raw.objectiveProgress) || Object.keys(raw.objectiveProgress).length !== map.objectives.length
    || !map.objectives.every(o => Number.isSafeInteger(raw.objectiveProgress[o.id]) && raw.objectiveProgress[o.id] >= 0 && raw.objectiveProgress[o.id] <= o.target)
    || raw.outcome === 'won' && !map.objectives.every(o => raw.objectiveProgress[o.id] === o.target)
    || raw.outcome === 'lost' && (raw.movesUsed < map.moves + (raw.extraMovesUsed ? 3 : 0) || map.objectives.every(o => raw.objectiveProgress[o.id] === o.target))) throw new Error('INVALID_RUN_REPORT');
  return { outcome: raw.outcome, movesUsed: raw.movesUsed, extraMovesUsed: raw.extraMovesUsed,
    objectiveProgress: Object.fromEntries(map.objectives.map(o => [o.id, raw.objectiveProgress[o.id]])) as ObjectiveProgress };
}
export function completeRun(run: RunDefinition, report: RunReport, stats: MapStats, profile: PlayerProfile, content: GameContent, profileContent: GameContent, now: number) {
  const nextStats = { ...stats };
  let nextProfile = profile;
  let reward;
  const stars = report.outcome === 'won' ? mapStars(run.map, report.movesUsed) : 0;
  if (report.outcome === 'won') {
    const context = { ...content, levels: [mapToLevel(run.map, run.seed, run.assistReduction, content)] };
    const applied = applyOperation(profile, { kind: 'win', id: run.runId, levelId: run.map.id, stars, objectiveProgress: report.objectiveProgress }, context, profileContent);
    if (applied.error) throw new Error(applied.error);
    nextProfile = applied.profile;
    nextStats.wins++;
    nextStats.consecutiveFailures = 0;
    nextStats.bestStars = Math.max(stats.bestStars, stars);
    nextStats.bestMovesUsed = Math.min(stats.bestMovesUsed ?? Infinity, report.movesUsed);
    nextStats.firstWinAt ??= now;
    reward = { itemsGranted: newlyGrantedItems(profile, nextProfile), id: run.runId, expGained: nextProfile.totalExp-profile.totalExp, coinsGained: nextProfile.coins-profile.coins,
      bestStars: nextProfile.levels.find(l => l.levelId === run.map.id)!.stars,
      realmBefore: realmForExp(profile.totalExp, profileContent).index, realmAfter: realmForExp(nextProfile.totalExp, profileContent).index };
  } else if (report.outcome === 'lost') { nextStats.losses++; nextStats.consecutiveFailures++; }
  else nextStats.abandoned++;
  const energyConsumedAt = 'energyConsumedAt' in run ? (run as StoredRun).energyConsumedAt : undefined;
  const consumesNow = report.outcome !== 'won' && energyConsumedAt === undefined;
  nextProfile = { ...nextProfile, energy: consumesNow
    ? consumeEnergy(nextProfile.energy, now) : advanceEnergy(nextProfile.energy, now) };
  return { profile: nextProfile, stats: nextStats, energyConsumedAt: energyConsumedAt ?? (consumesNow ? now : undefined), receipt: { levelId: run.map.id, mapVersion: run.mapVersion ?? run.map.mapVersion ?? run.map.contentVersion, configVersion: run.configVersion ?? content.version, stars, ...(reward ? { reward } : {}) } };
}
export { assistForFailures };

export function closeAbandonedRun(run: StoredRun, stats: MapStats, profile: PlayerProfile, now: number) {
  const nextStats = abandonedStats(stats);
  const consumed = run.energyConsumedAt === undefined;
  return {
    stats: nextStats,
    energyConsumedAt: run.energyConsumedAt ?? now,
    profile: { ...profile, energy: consumed ? consumeEnergy(profile.energy, now) : advanceEnergy(profile.energy, now) },
  };
}
