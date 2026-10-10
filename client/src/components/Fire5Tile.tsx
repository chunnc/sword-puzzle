import React, { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from 'expo-router';
import { Atlas, useRectBuffer, useRSXformBuffer, type SkImage } from '@shopify/react-native-skia';
import { useAnimatedReaction, useFrameCallback, useSharedValue, type FrameInfo, type SharedValue } from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import { FIRE5_IDLE } from './fire5Animation';
import { idleFrameAt, type IdleSpriteAnimationMetadata } from './idleTileAnimation';
import type { ParticleBounds } from './chargedTileParticles';

export type Fire5IdleState = { image: SkImage | null; elapsedMs: SharedValue<number> };

export function useIdleTileClock(visible: SharedValue<boolean>, reduced: boolean) {
  const elapsedMs = useSharedValue(0);
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [hasVisible, setHasVisible] = useState(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  useAnimatedReaction(() => visible.value, (value, previous) => {
    if (value !== previous) runOnJS(setHasVisible)(value);
  }, [visible]);
  const tick = useCallback((frame: FrameInfo) => {
    'worklet';
    if (visible.value && frame.timeSincePreviousFrame !== null) {
      elapsedMs.value += frame.timeSincePreviousFrame;
    }
  }, [elapsedMs, visible]);
  const clock = useFrameCallback(tick, false);
  useEffect(() => {
    clock.setActive(focused && foreground && hasVisible && !reduced);
    return () => clock.setActive(false);
  }, [clock, focused, foreground, hasVisible, reduced]);
  return elapsedMs;
}

export function IdleAtlasTile({ image, animation, elapsedMs, bounds, reduced }: {
  image: SkImage;
  animation: IdleSpriteAnimationMetadata;
  elapsedMs: SharedValue<number>;
  bounds: ParticleBounds;
  reduced: boolean;
}) {
  const sprites = useRectBuffer(1, rect => {
    'worklet';
    const frame = idleFrameAt(animation, elapsedMs.value, reduced).rect;
    rect.setXYWH(frame.x, frame.y, frame.width, frame.height);
  });
  const transforms = useRSXformBuffer(1, transform => {
    'worklet';
    const scale = Math.min(bounds.width, bounds.height) / animation.frameSize.width;
    transform.set(scale, 0,
      bounds.x + (bounds.width - animation.frameSize.width * scale) / 2,
      bounds.y + (bounds.height - animation.frameSize.height * scale) / 2);
  });
  return <Atlas image={image} sprites={sprites} transforms={transforms} />;
}

export function Fire5Tile({ idle, bounds, reduced }: {
  idle: Fire5IdleState; bounds: ParticleBounds; reduced: boolean;
}) {
  return idle.image
    ? <IdleAtlasTile image={idle.image} animation={FIRE5_IDLE} elapsedMs={idle.elapsedMs} bounds={bounds} reduced={reduced} />
    : null;
}
