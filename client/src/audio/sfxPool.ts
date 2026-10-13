import type { AudioPlayer } from 'expo-audio';

/** A lease includes the async seek, so close cues never rewind a busy voice. */
export function createSfxPool<Id extends string>(
  sources: Record<Id, number>,
  createPlayer: (source: number) => AudioPlayer,
  isActive: () => boolean,
) {
  type Voice = { player: AudioPlayer; busy: boolean; seeking: boolean; lease: number; removed: boolean; unsubscribe: () => void };
  const voices = new Map<Id, Voice[]>();
  let disposed = false;
  const remove = (voice: Voice) => {
    voice.removed = true;
    voice.lease++;
    try { voice.unsubscribe(); } catch { /* Native audio may already be gone. */ }
    try { voice.player.remove(); } catch { /* Cleanup must not affect gameplay. */ }
  };
  const stop = () => {
    for (const group of voices.values()) group.forEach(remove);
    voices.clear();
  };
  return {
    play(id: Id) {
      if (disposed || !isActive()) return;
      let voice: Voice | undefined;
      try {
        const group = voices.get(id) ?? [];
        voice = group.find(candidate => !candidate.busy);
        if (!voice) {
          const player = createPlayer(sources[id]);
          voice = { player, busy: false, seeking: false, lease: 0, removed: false, unsubscribe: () => undefined };
          const created = voice;
          const subscription = player.addListener('playbackStatusUpdate', status => {
            if (status.didJustFinish && !created.removed && !created.seeking) created.busy = false;
          });
          voice.unsubscribe = () => subscription.remove();
          group.push(voice);
          voices.set(id, group);
        }
        voice.busy = true;
        voice.seeking = true;
        const reserved = voice, lease = ++voice.lease;
        void voice.player.seekTo(0).then(() => {
          if (reserved.removed || reserved.lease !== lease || disposed) return;
          reserved.seeking = false;
          if (!isActive()) { reserved.busy = false; return; }
          reserved.player.play();
        }).catch(() => {
          if (reserved.lease === lease) reserved.busy = false;
        });
      } catch {
        if (voice) {
          remove(voice);
          const group = voices.get(id);
          if (group) voices.set(id, group.filter(candidate => candidate !== voice));
        }
      }
    },
    stop,
    dispose() { disposed = true; stop(); },
  };
}
