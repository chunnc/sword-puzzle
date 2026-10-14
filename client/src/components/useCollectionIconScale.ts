import { useEffect, useRef } from 'react';
import { cancelAnimation, Easing, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

export function useCollectionIconScale(progress: number, reduced: boolean) {
  const scale = useSharedValue(1);
  const previous = useRef(progress);
  useEffect(() => {
    const changed = previous.current !== progress;
    previous.current = progress;
    if (!changed && !reduced) return;
    cancelAnimation(scale);
    if (reduced) { scale.value = 1; return; }
    scale.value = withSequence(
      withTiming(1.28, { duration: 90, easing: Easing.out(Easing.back(1.7)) }),
      withTiming(1, { duration: 130, easing: Easing.out(Easing.quad) }),
    );
  }, [progress, reduced, scale]);
  useEffect(() => () => cancelAnimation(scale), [scale]);
  return scale;
}
