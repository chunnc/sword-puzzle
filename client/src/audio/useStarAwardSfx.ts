import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAnimatedReaction, type SharedValue } from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import { RESULT_PANEL_MS, RESULT_STAR_MS, RESULT_STAR_GAP_MS } from '../components/gameplayResultVisuals';
import { useSfx } from './SfxProvider';
import { createSfxSequence } from './sfxSequence';

export function useStarAwardSfx(elapsed: SharedValue<number>, runId: string, stars: number, enabled: boolean, reduceMotion: boolean) {
  const playSfx = useSfx();
  const ledger = useRef({ runId, stars, emitted: new Set<number>(),
    reducedClock: null as { startedAt: number; firstIndex: number } | null });
  const session = useRef<{
    runId: string; stars: number; emitted: Set<number>; blocked: boolean; reduced: boolean;
    sequence?: ReturnType<typeof createSfxSequence>;
  } | null>(null);
  const emitThrough = useCallback((count: number) => {
    const current = session.current;
    if (!current || current.runId !== runId || current.blocked || current.reduced || AppState.currentState !== 'active') return;
    for (let index = 0; index < Math.min(count, current.stars); index++) {
      if (current.emitted.has(index)) continue;
      current.emitted.add(index);
      try { playSfx('star_award'); } catch { /* Stars still complete without audio. */ }
    }
  }, [playSfx, runId]);

  useEffect(() => {
    if (!enabled) return;
    if (ledger.current.runId !== runId) ledger.current = { runId, stars, emitted: new Set<number>(), reducedClock: null };
    const current = { ...ledger.current, blocked: false, reduced: false,
      sequence: undefined as ReturnType<typeof createSfxSequence> | undefined };
    session.current = current;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { current.blocked = true; current.sequence?.cancel(); }
    });
    return () => {
      current.blocked = true; current.sequence?.cancel(); subscription.remove();
      if (session.current === current) session.current = null;
    };
    // Freeze the earned stars for this popup; reward reconciliation is not a new award.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, enabled]);

  useEffect(() => {
    const current = session.current;
    if (!reduceMotion || !current || current.blocked || current.reduced) return;
    current.reduced = true;
    const remaining = Array.from({ length: current.stars }, (_, index) => index).filter(index => !current.emitted.has(index));
    const clock = ledger.current.reducedClock ?? { startedAt: Date.now(), firstIndex: remaining[0] ?? 0 };
    ledger.current.reducedClock = clock;
    let next = 0;
    current.sequence = createSfxSequence(remaining.map(index => ({ id: 'star_award',
      delayMs: Math.max(0, clock.startedAt + (index - clock.firstIndex) * 100 - Date.now()) })), () => {
      const index = remaining[next++];
      if (current.blocked || AppState.currentState !== 'active' || current.emitted.has(index)) return;
      current.emitted.add(index); playSfx('star_award');
    });
    current.sequence.start();
  }, [reduceMotion, runId, enabled, playSfx]);

  useAnimatedReaction(
    () => enabled && !reduceMotion && elapsed.value >= RESULT_PANEL_MS
      ? Math.floor((elapsed.value - RESULT_PANEL_MS) / (RESULT_STAR_MS + RESULT_STAR_GAP_MS)) + 1 : 0,
    (count, previous) => { if (count > 0 && count !== previous) runOnJS(emitThrough)(count); },
    [elapsed, enabled, reduceMotion, emitThrough],
  );
}
