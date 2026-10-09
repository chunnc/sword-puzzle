import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { BlurMask, Canvas, Circle, Group, Path, Skia } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { BOARD_SPIRIT_MS, type BoardGeometry } from './boardVisuals';
import { buildSpiritParticles, spiritArrivalOpacity, spiritParticleFrame,
  type SpiritFlightCue, type SpiritFlightLayout, type SpiritParticle } from './spiritParticles';

export function SpiritQiFlightOverlay({ cues, geometry, layout, progress, durationMs }: {
  cues: SpiritFlightCue[];
  geometry: BoardGeometry;
  layout: SpiritFlightLayout;
  progress: SharedValue<number>;
  durationMs: number;
}) {
  const particles = useMemo(() => cues.flatMap(cue => buildSpiritParticles(cue, layout, geometry)), [cues, layout, geometry]);
  const elapsedMs = useDerivedValue(() => progress.value * durationMs);
  const arrival = useDerivedValue(() => progress.value >= 1 ? 0 : spiritArrivalOpacity(elapsedMs.value));
  const glowRadius = layout.board.width / geometry.width * (cues.some(cue => cue.chargeTier === 5) ? .45 : .32);
  return <Canvas testID="spirit-qi-flight" pointerEvents="none" accessible={false} accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    <Group>
      {particles.map((particle, index) => <Spark key={index} particle={particle} elapsedMs={elapsedMs} progress={progress} />)}
      <Group opacity={arrival}>
        <Circle cx={layout.target.x} cy={layout.target.y} r={glowRadius} color="#69ff7d">
          <BlurMask blur={glowRadius * .45} style="normal" />
        </Circle>
        <Circle cx={layout.target.x} cy={layout.target.y} r={glowRadius * .25} color="#e5ffeb" />
      </Group>
    </Group>
  </Canvas>;
}

function Spark({ particle, elapsedMs, progress }: { particle: SpiritParticle; elapsedMs: SharedValue<number>; progress: SharedValue<number> }) {
  const frame = useDerivedValue(() => spiritParticleFrame(particle, elapsedMs.value));
  const transform = useDerivedValue(() => [{ translateX: frame.value.x }, { translateY: frame.value.y },
    { rotate: frame.value.rotation }, { scale: frame.value.scale }]);
  const opacity = useDerivedValue(() => progress.value >= 1 || elapsedMs.value >= BOARD_SPIRIT_MS ? 0 : frame.value.opacity);
  const star = useMemo(() => {
    const r = particle.radius;
    return Skia.Path.Make().moveTo(0, -r * 3).lineTo(r * .35, -r * .35)
      .lineTo(r * 3, 0).lineTo(r * .35, r * .35).lineTo(0, r * 3)
      .lineTo(-r * .35, r * .35).lineTo(-r * 3, 0).lineTo(-r * .35, -r * .35).close();
  }, [particle.radius]);
  return <Group transform={transform} opacity={opacity}>
    <Circle cx={0} cy={0} r={particle.radius * 2.5} color={particle.color} opacity={.45}>
      <BlurMask blur={particle.radius * 1.2} style="normal" />
    </Circle>
    {particle.star ? <Path path={star} color="#bcffce" opacity={.7} /> : null}
    <Circle cx={0} cy={0} r={particle.radius} color={particle.color} />
    <Circle cx={0} cy={0} r={particle.radius * .45} color="#effff4" />
  </Group>;
}
