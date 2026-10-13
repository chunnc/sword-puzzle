import type { SfxId } from './SfxProvider';

export interface TimedSfxCue {
  id: SfxId;
  delayMs: number;
  reducedDelayMs?: number;
}

/** Owns pending cues, not audio tails. Cancellation never replays on resume. */
export function createSfxSequence(cues: readonly TimedSfxCue[], play: (id: SfxId) => void) {
  const emitted = new Set<number>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let startedAt: number | null = null, reduced = false, cancelled = false;
  let resolve!: () => void;
  const finished = new Promise<void>(yes => { resolve = yes; });
  const clear = () => { timers.forEach(clearTimeout); timers.clear(); };
  const emit = (index: number) => {
    if (cancelled || emitted.has(index)) return;
    emitted.add(index);
    try { play(cues[index].id); } catch { /* Feedback cannot block resolution. */ }
    if (emitted.size === cues.length) resolve();
  };
  const schedule = () => {
    clear();
    if (cancelled || startedAt === null) return;
    if (!cues.length) { resolve(); return; }
    cues.forEach((cue, index) => {
      if (cancelled || emitted.has(index)) return;
      const remaining = startedAt! + (reduced ? cue.reducedDelayMs ?? 0 : cue.delayMs) - Date.now();
      if (remaining <= 0) emit(index);
      else {
        const timer = setTimeout(() => { timers.delete(timer); emit(index); }, remaining);
        timers.add(timer);
      }
    });
  };
  return {
    finished,
    start(reduceMotion = false) {
      if (cancelled || startedAt !== null) return;
      startedAt = Date.now(); reduced = reduceMotion; schedule();
    },
    reduce() { reduced = true; schedule(); },
    cancel() { cancelled = true; clear(); resolve(); },
  };
}
