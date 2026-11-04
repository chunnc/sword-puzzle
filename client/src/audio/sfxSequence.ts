import type { SfxId } from './SfxProvider';

export interface TimedSfxCue {
  id: SfxId;
  delayMs: number;
  reducedDelayMs?: number;
}

/** Owns queued cues and their started playback. Cancellation never replays on resume. */
export function createSfxSequence(
  cues: readonly TimedSfxCue[],
  play: (id: SfxId) => void | (() => void),
  onPlaybackStopped?: () => void,
) {
  const emitted = new Set<number>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const stops = new Set<() => void>();
  let startedAt: number | null = null, reduced = false, cancelled = false;
  let resolve!: () => void;
  const finished = new Promise<void>(yes => { resolve = yes; });
  const clear = () => { timers.forEach(clearTimeout); timers.clear(); };
  const emit = (index: number) => {
    if (cancelled || emitted.has(index)) return;
    emitted.add(index);
    try {
      const stop = play(cues[index].id);
      if (stop) stops.add(stop);
    } catch { /* Feedback cannot block resolution. */ }
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
  const stopPlayback = () => {
    stops.forEach(stop => { try { stop(); } catch { /* Audio cleanup must not affect gameplay. */ } });
    stops.clear();
    onPlaybackStopped?.();
  };
  return {
    finished,
    start(reduceMotion = false) {
      if (cancelled || startedAt !== null) return;
      startedAt = Date.now(); reduced = reduceMotion; schedule();
    },
    reduce() { reduced = true; schedule(); },
    stopPlayback,
    cancel() { cancelled = true; clear(); stopPlayback(); resolve(); },
  };
}
