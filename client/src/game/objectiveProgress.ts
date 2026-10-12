import type { LevelDefinition, ObjectiveProgress } from './domain';

// Snapshots retain actual counts. The existing server contract expects each
// reported objective to be capped at its target, including abandoned runs.
export function toRunReportProgress(level: LevelDefinition, progress: ObjectiveProgress): ObjectiveProgress {
  return Object.fromEntries(level.objectives.map(objective => [objective.id, Math.min(progress[objective.id], objective.target)]));
}
