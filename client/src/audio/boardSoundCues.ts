import type { BoardResolutionStep, BoardAnimationEffect } from '../game/types';
import type { SfxId } from './SfxProvider';
import type { TimedSfxCue } from './sfxSequence';
import { BOARD_FIRE_CHARGE_MS, BOARD_SPIRIT_EMIT_AT_MS, BOARD_SWORD_CROSS_DELAY_MS } from '../components/boardVisuals';

export interface BoardSoundCue extends TimedSfxCue { traceIndex: number }

const skillSounds: Partial<Record<string, SfxId>> = {
  'hoa-lien': 'fire_burst', 'dan-loi': 'lightning_chain', 'hoi-linh': 'spirit_absorb',
  thu: 'sword_slash', 'nhat-kiem': 'sword_slash', 'van-kiem': 'sword_slash',
};

/** Cues belong to individual traces, never to the beginning of the entire wave. */
export function boardSoundCues(step: BoardResolutionStep): BoardSoundCue[] {
  const finalChargedSource = new Map<number, number>();
  step.effects.forEach((trace, index) => {
    if (trace.source !== undefined && (trace.origin === 'charged'
      || step.before.tiles[trace.source]?.chargeTier && step.cleared.includes(trace.source))) {
      finalChargedSource.set(trace.source, index);
    }
  });
  const cues: BoardSoundCue[] = [];
  step.effects.forEach((trace, traceIndex) => {
    const add = (id: SfxId, delayMs = 0, reducedDelayMs = 0) => cues.push({ id, traceIndex, delayMs, reducedDelayMs });
    if (trace.brokenRocks?.length) add('rock_break');
    if (trace.origin === 'skill') {
      const sound = trace.skillId && skillSounds[trace.skillId];
      if (sound) add(sound);
      // Ngự Kiếm plays at the swap start; Liên Kiếm uses its queued activations.
      return;
    }
    const charged = (trace.origin === 'charged' || !trace.origin) && trace.source !== undefined
      && finalChargedSource.get(trace.source) === traceIndex;
    if (charged) {
      if (trace.kind === 'fire') add('fire_burst', BOARD_FIRE_CHARGE_MS);
      else if (trace.kind === 'lightning') add('lightning_chain');
      else if (trace.kind === 'spirit') add('spirit_absorb', BOARD_SPIRIT_EMIT_AT_MS);
      else if (trace.kind === 'slash' || trace.kind === 'cross') {
        add('sword_slash');
        if (trace.swordChargeTier === 5 || trace.kind === 'cross') {
          add('sword_slash', BOARD_SWORD_CROSS_DELAY_MS, BOARD_SWORD_CROSS_DELAY_MS);
        }
      }
    } else if (isOrdinaryMatch(trace, step)) add('match_spirit');
  });
  return cues;
}

function isOrdinaryMatch(trace: BoardAnimationEffect, step: BoardResolutionStep) {
  if (trace.origin && trace.origin !== 'match') return false;
  if (trace.kind !== 'skill' || trace.source !== undefined || trace.objectiveProgressAfter === undefined) return false;
  return trace.cells.filter(index => step.before.tiles[index]?.chargeTier === 0).length >= 3;
}
