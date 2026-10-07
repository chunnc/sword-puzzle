import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useIsFocused } from 'expo-router';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { ART } from '../assets';

export function FloatingCultivator() {
  const focused = useIsFocused();
  const initialReduceMotion = useReducedMotion();
  const [reduceMotion, setReduceMotion] = useState(initialReduceMotion);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const offset = useSharedValue(0);
  const floatingStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  useEffect(() => {
    let mounted = true;
    let preferenceChanged = false;
    const motionSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', enabled => {
      preferenceChanged = true;
      setReduceMotion(enabled);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (mounted && !preferenceChanged) setReduceMotion(enabled);
    }).catch(() => {
      if (mounted && !preferenceChanged) setReduceMotion(true);
    });
    const appSubscription = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => {
      mounted = false;
      motionSubscription.remove();
      appSubscription.remove();
    };
  }, []);

  useEffect(() => {
    cancelAnimation(offset);
    if (focused && active && !reduceMotion) {
      offset.value = -6;
      offset.value = withRepeat(withTiming(6, { duration: 2000, easing: Easing.inOut(Easing.sin) }), -1, true);
    } else {
      offset.value = 0;
    }
    return () => cancelAnimation(offset);
  }, [active, focused, offset, reduceMotion]);

  return (
    <Animated.View pointerEvents="none" style={[styles.hero, floatingStyle]}>
      <Image source={ART.cultivator} contentFit="contain" accessibilityLabel="Kiếm tu đang tu luyện" style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({ hero: { flex: 1, width: '100%' } });
