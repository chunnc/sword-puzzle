import React, { useEffect, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { colors } from '../theme';
import { OutlinedText } from './OutlinedText';

const DAMAGE_TRAIL_DELAY_MS = 450;
const DAMAGE_TRAIL_DURATION_MS = 500;

export function GameplayProgressBar({ value, max, tone, accessibilityLabel, animated = false, duration = 250, viewRef, onLayout }: {
  value: number; max: number; tone: 'health' | 'qi'; accessibilityLabel: string; animated?: boolean; duration?: number;
  viewRef?: React.Ref<View>; onLayout?: () => void;
}) {
  const limit = Number.isFinite(max) && max > 0 ? max : 0;
  const current = Number.isFinite(value) ? Math.max(0, Math.min(value, limit)) : 0;
  const portion = limit > 0 ? current / limit : 0;
  const health = tone === 'health';
  const [trackWidth, setTrackWidth] = useState(0);
  const progress = useSharedValue(portion);
  const damageProgress = useSharedValue(portion);
  const previousPortion = useRef(portion);
  const firstUpdate = useRef(true);
  useEffect(() => {
    const previous = previousPortion.current;
    const changed = previous !== portion;
    const initial = firstUpdate.current;
    firstUpdate.current = false;
    previousPortion.current = portion;

    if (!animated || (!initial && health && changed && portion > previous)) {
      cancelAnimation(progress);
      progress.value = portion;
    } else if (changed || initial) {
      progress.value = withTiming(portion, { duration });
    }

    if (!health || !animated) {
      cancelAnimation(damageProgress);
      damageProgress.value = portion;
    } else if (changed && portion < previous) {
      cancelAnimation(damageProgress);
      damageProgress.value = withDelay(
        Math.max(0, duration) + DAMAGE_TRAIL_DELAY_MS,
        withTiming(portion, { duration: DAMAGE_TRAIL_DURATION_MS }),
      );
    } else if (changed) {
      cancelAnimation(damageProgress);
      damageProgress.value = portion;
    }
  }, [animated, damageProgress, duration, health, portion, progress]);
  useEffect(() => () => {
    cancelAnimation(progress);
    cancelAnimation(damageProgress);
  }, [damageProgress, progress]);
  const fillStyle = useAnimatedStyle(() => ({ width: progress.value * trackWidth }));
  const damageStyle = useAnimatedStyle(() => ({ width: damageProgress.value * trackWidth }));
  const healthFillStyle = useAnimatedStyle(() => ({
    width: progress.value * trackWidth,
    borderTopRightRadius: progress.value >= 1 ? 999 : 0,
    borderBottomRightRadius: progress.value >= 1 ? 999 : 0,
  }));
  return (
    <View ref={viewRef} collapsable={false} onLayout={onLayout} testID={`game-${tone}-bar`} accessible accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: limit, now: current }} style={[styles.track, { height: health ? 16 : 12 }]}>
      <View testID={`game-${tone}-track`} onLayout={event => setTrackWidth(event.nativeEvent.layout.width)} style={styles.inner}>
        {health ? <Animated.View testID="game-health-damage" pointerEvents="none" style={[styles.damage, damageStyle]} /> : null}
        <Animated.View testID={`game-${tone}-fill`} style={[styles.fill, health ? healthFillStyle : fillStyle]}>
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
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 1, borderRadius: 999, overflow: 'hidden' },
  damage: { position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 0, borderRadius: 0, backgroundColor: colors.goldBright },
  label: { ...StyleSheet.absoluteFill, justifyContent: 'center', paddingHorizontal: 3 },
  value: { color: colors.ivory, fontSize: 10, lineHeight: 12, includeFontPadding: false, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
});
