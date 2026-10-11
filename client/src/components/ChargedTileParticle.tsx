import React, { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from 'expo-router';
import { BlurMask, Circle, Group, Path, Skia } from '@shopify/react-native-skia';
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
  const sparkleTransform = useDerivedValue(() => [{ scale: frame.value.sparkleScale }]);
  const sparkleOpacity = useDerivedValue(() => frame.value.sparkleOpacity);
  const radius = chargedParticleRadius(bounds) * (tail ? 1 - tail * .15 : 1);
  const sparkle = React.useMemo(() => {
    const tip = radius * 2.25, waist = radius * .22;
    return Skia.Path.Make().moveTo(0, -tip).lineTo(waist, -waist).lineTo(tip, 0)
      .lineTo(waist, waist).lineTo(0, tip).lineTo(-waist, waist).lineTo(-tip, 0)
      .lineTo(-waist, -waist).close();
  }, [radius]);
  return <Group transform={transform} opacity={opacity}>
    {!tail ? <>
      <Circle cx={0} cy={0} r={radius * config.haloRatio} color={color} opacity={.2}>
        <BlurMask blur={radius * .8} style="normal" />
      </Circle>
      <Circle cx={0} cy={0} r={radius * 1.5} color={color} opacity={.32} />
      <Group transform={sparkleTransform} opacity={sparkleOpacity}>
        <Path path={sparkle} color="#fff7d1" />
      </Group>
    </> : null}
    <Circle cx={0} cy={0} r={radius} color={color} />
    {!tail ? <Circle cx={0} cy={0} r={radius * .4} color="#FFFFFF" /> : null}
  </Group>;
}
