import React, { useEffect, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors } from '../theme';
import { OutlinedText } from './OutlinedText';

export function GameplayProgressBar({ value, max, tone, accessibilityLabel, animated = false, duration = 250 }: {
  value: number; max: number; tone: 'health' | 'qi'; accessibilityLabel: string; animated?: boolean; duration?: number;
}) {
  const limit = Number.isFinite(max) && max > 0 ? max : 0;
  const current = Number.isFinite(value) ? Math.max(0, Math.min(value, limit)) : 0;
  const portion = limit > 0 ? current / limit : 0;
  const [trackWidth, setTrackWidth] = useState(0);
  const progress = useSharedValue(portion);
  useEffect(() => {
    progress.value = animated ? withTiming(portion, { duration }) : portion;
  }, [animated, duration, portion, progress]);
  const fillStyle = useAnimatedStyle(() => ({ width: progress.value * trackWidth }));
  const health = tone === 'health';
  return (
    <View testID={`game-${tone}-bar`} accessible accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: limit, now: current }} style={[styles.track, { height: health ? 18 : 12 }]}>
      <View testID={`game-${tone}-track`} onLayout={event => setTrackWidth(event.nativeEvent.layout.width)} style={styles.inner}>
        <Animated.View testID={`game-${tone}-fill`} style={[styles.fill, fillStyle]}>
          <LinearGradient colors={health ? ['#942f35', '#e35646', '#ff9674'] : ['#0b717a', '#49c8e5', '#b7f4e7']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </View>
      {health ? <View pointerEvents="none" style={styles.label}>
        <OutlinedText accessible={false} numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.value}>{current}/{limit} HP</OutlinedText>
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', borderRadius: 999, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.inkDeep, overflow: 'hidden' },
  inner: { flex: 1, borderRadius: 999, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 999, overflow: 'hidden' },
  label: { ...StyleSheet.absoluteFill, justifyContent: 'center', paddingHorizontal: 3 },
  value: { color: colors.ivory, fontSize: 10, lineHeight: 12, includeFontPadding: false, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
});
