import React, { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from 'expo-router';
import { Atlas, useRectBuffer, useRSXformBuffer, type SkImage } from '@shopify/react-native-skia';
import { useAnimatedReaction, useFrameCallback, useSharedValue, type FrameInfo, type SharedValue } from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import { FIRE5_IDLE, fire5FrameAt } from './fire5Animation';
import type { ParticleBounds } from './chargedTileParticles';

export type Fire5IdleState = { image: SkImage | null; elapsedMs: SharedValue<number> };

export function useFire5Clock(visible: SharedValue<boolean>, reduced: boolean) {
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
      elapsedMs.value = (elapsedMs.value + frame.timeSincePreviousFrame) % FIRE5_IDLE.durationMs;
    }
  }, [elapsedMs, visible]);
  const clock = useFrameCallback(tick, false);
  useEffect(() => {
    clock.setActive(focused && foreground && hasVisible && !reduced);
    return () => clock.setActive(false);
  }, [clock, focused, foreground, hasVisible, reduced]);
  return elapsedMs;
}

export function Fire5Tile({ idle, bounds, reduced }: {
  idle: Fire5IdleState; bounds: ParticleBounds; reduced: boolean;
}) {
  const { image, elapsedMs } = idle;
  const sprites = useRectBuffer(1, rect => {
    'worklet';
    const frame = fire5FrameAt(elapsedMs.value, reduced).rect;
    rect.setXYWH(frame.x, frame.y, frame.width, frame.height);
  });
  const transforms = useRSXformBuffer(1, transform => {
    'worklet';
    const scale = Math.min(bounds.width, bounds.height) / FIRE5_IDLE.frameSize.width;
    transform.set(scale, 0,
      bounds.x + (bounds.width - FIRE5_IDLE.frameSize.width * scale) / 2,
      bounds.y + (bounds.height - FIRE5_IDLE.frameSize.height * scale) / 2);
  });
  return <Atlas image={image} sprites={sprites} transforms={transforms} />;
}
