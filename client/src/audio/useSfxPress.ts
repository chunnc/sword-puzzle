import { useCallback } from 'react';
import { useSfx } from './SfxProvider';

type Handler = (...args: any[]) => unknown;

export function useSfxPress() {
  const playSfx = useSfx();
  return useCallback(<T extends Handler>(handler: T | undefined, playOnPress = true): T | undefined => {
    if (!handler) return undefined;
    return ((...args: Parameters<T>) => {
      if (playOnPress) playSfx('ui_tap');
      return handler(...args);
    }) as T;
  }, [playSfx]);
}
