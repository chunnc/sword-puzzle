import React, { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from 'expo-router';
import { Circle, Group } from '@shopify/react-native-skia';
import { useAnimatedReaction, useDerivedValue, useFrameCallback, useSharedValue, type FrameInfo, type SharedValue } from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import { chargedTileParticle as config } from '../theme';
import { chargedParticleFrame, chargedParticleRadius, type ParticleBounds } from './chargedTileParticles';

export function useChargedParticleClock(visible: SharedValue<boolean>, reduced: boolean) {
  const phase = useSharedValue(0);
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
    // A completed clear can hide the last tile before JS disables the clock.
    if (visible.value && frame.timeSincePreviousFrame !== null) {
      phase.value = (phase.value + frame.timeSincePreviousFrame / config.cycleMs) % 1;
    }
  }, [phase, visible]);
  const clock = useFrameCallback(tick, false);
  useEffect(() => {
    clock.setActive(focused && foreground && hasVisible && !reduced);
    return () => clock.setActive(false);
  }, [clock, focused, foreground, hasVisible, reduced]);
  return phase;
}

export function ChargedTileParticle({ bounds, color, elementPhase, phase, reduced }: {
  bounds: ParticleBounds; color: string; elementPhase: number; phase: SharedValue<number>; reduced: boolean;
}) {
  return <Group>
    {Array.from({ length: config.tailCount + 1 }, (_, index) => <SparkDot key={index}
      bounds={bounds} color={color} elementPhase={elementPhase} phase={phase} reduced={reduced} tail={config.tailCount - index} />)}
  </Group>;
}

function SparkDot({ bounds, color, elementPhase, phase, reduced, tail }: {
  bounds: ParticleBounds; color: string; elementPhase: number; phase: SharedValue<number>; reduced: boolean; tail: number;
}) {
  const frame = useDerivedValue(() => chargedParticleFrame(bounds, phase.value, elementPhase, reduced, tail));
  const transform = useDerivedValue(() => [{ translateX: frame.value.x }, { translateY: frame.value.y }]);
  const opacity = useDerivedValue(() => frame.value.opacity);
  const radius = chargedParticleRadius(bounds) * (tail ? 1 - tail * .15 : 1);
  return <Group transform={transform} opacity={opacity}>
    {!tail ? <>
      <Circle cx={0} cy={0} r={radius * config.haloRatio} color={color} opacity={.15} />
      <Circle cx={0} cy={0} r={radius * 1.5} color={color} opacity={.25} />
    </> : null}
    <Circle cx={0} cy={0} r={radius} color={color} />
    {!tail ? <Circle cx={0} cy={0} r={radius * .4} color="#FFFFFF" /> : null}
  </Group>;
}
