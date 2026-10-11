import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { preload, useAudioPlayer, type AudioPlayer } from 'expo-audio';

const SFX = {
  ui_tap: require('../../app-assets/audio/ui_tap.wav') as number,
  match_spirit: require('../../app-assets/audio/match_spirit.wav') as number,
  fire_burst: require('../../app-assets/audio/fire_burst.wav') as number,
} as const;

export type SfxId = keyof typeof SFX;

for (const source of Object.values(SFX)) void preload(source).catch(() => undefined);

const SfxContext = createContext<(id: SfxId) => void>(() => undefined);

function useTwoPlaybackChannels(source: number): readonly [AudioPlayer, AudioPlayer] {
  const first = useAudioPlayer(source);
  const second = useAudioPlayer(source);
  return useMemo(() => [first, second], [first, second]);
}

export function SfxProvider({ children }: React.PropsWithChildren) {
  const tapChannels = useTwoPlaybackChannels(SFX.ui_tap);
  const matchChannels = useTwoPlaybackChannels(SFX.match_spirit);
  const fireChannels = useTwoPlaybackChannels(SFX.fire_burst);
  const channels = useMemo<Record<SfxId, readonly [AudioPlayer, AudioPlayer]>>(() => ({
    ui_tap: tapChannels,
    match_spirit: matchChannels,
    fire_burst: fireChannels,
  }), [tapChannels, matchChannels, fireChannels]);
  const cursor = useRef<Record<SfxId, number>>({ ui_tap: 0, match_spirit: 0, fire_burst: 0 });

  const playSfx = useCallback((id: SfxId) => {
    if (AppState.currentState !== 'active') return;
    const index = cursor.current[id];
    cursor.current[id] = (index + 1) % channels[id].length;
    const player = channels[id][index];
    void player.seekTo(0).catch(() => undefined).then(() => {
      if (AppState.currentState === 'active') player.play();
    }).catch(() => undefined);
  }, [channels]);

  return <SfxContext.Provider value={playSfx}>{children}</SfxContext.Provider>;
}

export function useSfx() {
  return useContext(SfxContext);
}
