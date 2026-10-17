import type { AudioPlayer, AudioStatus } from 'expo-audio';

export type MusicLoopTrack = 'background' | 'fight';
export type MusicCueTrack = 'victory' | 'defeat';
export type MusicTrack = MusicLoopTrack | MusicCueTrack;

type Intent =
  | { type: 'loop'; track: MusicLoopTrack }
  | { type: 'cue'; track: MusicCueTrack; key: string }
  | { type: 'silent' };

type Voice = { player: AudioPlayer; unsubscribe: () => void; track: MusicTrack; intent: Intent };

export function createMusicController(
  sources: Record<MusicTrack, number>,
  createPlayer: (source: number) => AudioPlayer,
  initiallyActive: boolean,
) {
  let disposed = false;
  let appActive = initiallyActive;
  let routeKey: string | null = null;
  let baseTrack: MusicLoopTrack = 'background';
  let intent: Intent = { type: 'silent' };
  let lastCueKey: string | null = null;
  let voice: Voice | null = null;

  const disposeVoice = () => {
    const current = voice;
    voice = null;
    if (!current) return;
    try { current.unsubscribe(); } catch { /* Native audio may already be gone. */ }
    try { current.player.remove(); } catch { /* Cleanup must not affect gameplay. */ }
  };

  const startIntent = () => {
    if (disposed || intent.type === 'silent') return;
    const track = intent.track;
    const voiceMatchesIntent = voice?.track === track && voice.intent.type === intent.type
      && (intent.type !== 'cue' || (voice.intent.type === 'cue' && voice.intent.key === intent.key));
    if (voiceMatchesIntent) return;

    disposeVoice();
    if (!appActive) return;
    try {
      const player = createPlayer(sources[track]);
      player.loop = intent.type === 'loop';
      const startedIntent = intent;
      const subscription = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        if (!status.didJustFinish || startedIntent.type !== 'cue' || voice?.player !== player) return;
        intent = { type: 'silent' };
        disposeVoice();
      });
      voice = { player, unsubscribe: () => subscription.remove(), track, intent: startedIntent };
      player.play();
    } catch {
      disposeVoice();
    }
  };

  return {
    setRoute(nextRouteKey: string, track: MusicLoopTrack) {
      if (disposed) return;
      const routeChanged = routeKey !== nextRouteKey;
      routeKey = nextRouteKey;
      baseTrack = track;
      if (routeChanged) {
        lastCueKey = null;
        intent = { type: 'loop', track: baseTrack };
      } else if (intent.type === 'loop') {
        intent = { type: 'loop', track: baseTrack };
      }
      startIntent();
    },
    playResultCue(track: MusicCueTrack, key: string) {
      if (disposed || lastCueKey === key) return;
      lastCueKey = key;
      intent = { type: 'cue', track, key };
      startIntent();
    },
    resumeLoop() {
      if (disposed) return;
      lastCueKey = null;
      intent = { type: 'loop', track: baseTrack };
      startIntent();
    },
    setAppActive(active: boolean) {
      if (disposed || appActive === active) return;
      appActive = active;
      if (!active) {
        try { voice?.player.pause(); } catch { /* The player may already be unavailable. */ }
      } else if (voice) {
        try { voice.player.play(); } catch { startIntent(); }
      } else {
        startIntent();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      intent = { type: 'silent' };
      disposeVoice();
    },
  };
}
