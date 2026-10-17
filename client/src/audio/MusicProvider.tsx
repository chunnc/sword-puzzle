import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { createAudioPlayer, preload } from 'expo-audio';
import { createMusicController, type MusicCueTrack } from './musicController';

const MUSIC = {
  background: require('../../app-assets/audio/music/background_music.mp3') as number,
  fight: require('../../app-assets/audio/music/fight_music.mp3') as number,
  victory: require('../../app-assets/audio/music/victory_music.mp3') as number,
  defeat: require('../../app-assets/audio/music/defeat_music.mp3') as number,
} as const;

for (const source of Object.values(MUSIC)) void preload(source).catch(() => undefined);

type MusicController = ReturnType<typeof createMusicController>;
type MusicContextValue = {
  playResultMusic: (kind: 'won' | 'lost', runId: string) => void;
  resumeGameplayMusic: () => void;
};

const MusicContext = createContext<MusicContextValue>({
  playResultMusic: () => undefined,
  resumeGameplayMusic: () => undefined,
});

export function MusicProvider({ pathname, children }: React.PropsWithChildren<{ pathname: string }>) {
  const controller = useRef<MusicController | null>(null);
  const routeTrack = pathname.startsWith('/game/') ? 'fight' : 'background';

  useLayoutEffect(() => {
    const current = createMusicController(MUSIC, createAudioPlayer, AppState.currentState === 'active');
    controller.current = current;
    current.setRoute(pathname, routeTrack);
    const subscription = AppState.addEventListener('change', state => current.setAppActive(state === 'active'));
    return () => {
      subscription.remove();
      current.dispose();
      controller.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    controller.current?.setRoute(pathname, routeTrack);
  }, [pathname, routeTrack]);

  const playResultMusic = useCallback((kind: 'won' | 'lost', runId: string) => {
    const track: MusicCueTrack = kind === 'won' ? 'victory' : 'defeat';
    controller.current?.playResultCue(track, `${kind}:${runId}`);
  }, []);
  const resumeGameplayMusic = useCallback(() => controller.current?.resumeLoop(), []);
  const value = useMemo(() => ({ playResultMusic, resumeGameplayMusic }), [playResultMusic, resumeGameplayMusic]);

  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}

export function useMusic() { return useContext(MusicContext); }
