import React, { createContext, useCallback, useContext, useLayoutEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { createAudioPlayer, preload } from 'expo-audio';
import { createSfxPool } from './sfxPool';

const SFX = {
  ui_tap: require('../../app-assets/audio/ui_tap.wav') as number,
  match_spirit: require('../../app-assets/audio/match_spirit.wav') as number,
  fire_burst: require('../../app-assets/audio/fire_burst.wav') as number,
  lightning_chain: require('../../app-assets/audio/lightning_chain.mp3') as number,
  spirit_absorb: require('../../app-assets/audio/spirit_absorb.mp3') as number,
  sword_slash: require('../../app-assets/audio/sword_slash.mp3') as number,
  rock_break: require('../../app-assets/audio/rock_break.mp3') as number,
  star_award: require('../../app-assets/audio/star_award.mp3') as number,
} as const;

export type SfxId = keyof typeof SFX;
for (const source of Object.values(SFX)) void preload(source).catch(() => undefined);
const SfxContext = createContext<(id: SfxId) => void>(() => undefined);

export function SfxProvider({ children }: React.PropsWithChildren) {
  const pool = useRef<ReturnType<typeof createSfxPool<SfxId>> | null>(null);
  // Ready before child passive effects can award a reduced-motion star on mount.
  useLayoutEffect(() => {
    const current = createSfxPool(SFX, createAudioPlayer, () => AppState.currentState === 'active');
    pool.current = current;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') current.stop();
    });
    return () => { subscription.remove(); current.dispose(); pool.current = null; };
  }, []);
  const playSfx = useCallback((id: SfxId) => { pool.current?.play(id); }, []);
  return <SfxContext.Provider value={playSfx}>{children}</SfxContext.Provider>;
}

export function useSfx() { return useContext(SfxContext); }
