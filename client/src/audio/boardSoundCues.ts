import type { BoardResolutionStep, BoardAnimationEffect } from '../game/types';
import type { SfxId } from './SfxProvider';

/** Sound cues are derived from the same resolved wave the presenter animates. */
export function boardSoundCues(step: BoardResolutionStep): SfxId[] {
  const finalChargedSource = new Map<number, number>();
  step.effects.forEach((trace, index) => {
    if (trace.source !== undefined && step.before.tiles[trace.source]?.chargeTier && step.cleared.includes(trace.source)) {
      finalChargedSource.set(trace.source, index);
    }
  });

  const cues: SfxId[] = [];
  step.effects.forEach((trace, index) => {
    if (isChargedFireActivation(trace, step, index, finalChargedSource)) cues.push('fire_burst');
    else if (isOrdinaryMatch(trace, step)) cues.push('match_spirit');
  });
  return cues;
}

function isChargedFireActivation(trace: BoardAnimationEffect, step: BoardResolutionStep,
  index: number, finalChargedSource: Map<number, number>) {
  if (trace.kind !== 'fire' || trace.source === undefined || finalChargedSource.get(trace.source) !== index) return false;
  const tier = step.before.tiles[trace.source]?.chargeTier;
  return tier === 4 || tier === 5;
}

function isOrdinaryMatch(trace: BoardAnimationEffect, step: BoardResolutionStep) {
  if (trace.kind !== 'skill' || trace.source !== undefined || trace.objectiveProgressAfter === undefined) return false;
  const ordinaryCells = trace.cells.filter(index => {
    const tile = step.before.tiles[index];
    return Boolean(tile && tile.chargeTier === 0);
  });
  return ordinaryCells.length >= 3;
}
