import React, { useEffect, useState } from 'react';
import { AppState, Image, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { ART } from '../assets';
import { colors } from '../theme';
import { TUTORIAL_CYCLE_MS, tutorialFrame, type tutorialGeometry } from './tutorialPresentation';

export function TutorialGuide({ geometry, text, visible, reduceMotion }: {
  geometry: ReturnType<typeof tutorialGeometry>; text: string; visible: boolean; reduceMotion: boolean;
}) {
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [textHeight, setTextHeight] = useState(60);
  const phase = useSharedValue(reduceMotion ? .15 : 0);
  const active = visible && focused && foreground;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    cancelAnimation(phase);
    phase.value = reduceMotion ? .15 : 0;
    if (active && !reduceMotion) phase.value = withRepeat(withTiming(1, { duration: TUTORIAL_CYCLE_MS, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(phase);
  }, [active, reduceMotion, phase, geometry]);
  const handStyle = useAnimatedStyle(() => {
    const frame = tutorialFrame(phase.value, geometry, textHeight);
    return { opacity: frame.opacity, transform: [{ translateX: frame.handX }, { translateY: frame.handY }] };
  });
  const textStyle = useAnimatedStyle(() => {
    const frame = tutorialFrame(phase.value, geometry, textHeight);
    return { opacity: frame.opacity, transform: [{ translateX: frame.textX }, { translateY: frame.textY }] };
  });
  if (!active) return null;
  const textWidth = tutorialFrame(.15, geometry, textHeight).textWidth;
  return <View testID="tutorial-guide" pointerEvents="none" style={styles.overlay}>
    <Animated.View testID="tutorial-hand" style={[styles.hand, { width: geometry.handSize, height: geometry.handSize }, handStyle]}>
      <Image source={ART.tutorialHand} resizeMode="contain" accessible={false}
        style={[StyleSheet.absoluteFill, { width: geometry.handSize, height: geometry.handSize,
          transform: [{ rotate: geometry.handRotation }] }]} />
    </Animated.View>
    <Animated.View testID="tutorial-text" style={[styles.label, { width: textWidth }, textStyle]}
      onLayout={event => setTextHeight(event.nativeEvent.layout.height)}>
      <Text accessibilityRole="text" style={styles.text}>{text}</Text>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 5 },
  hand: { position: 'absolute', left: 0, top: 0 },
  label: { position: 'absolute', left: 0, top: 0, backgroundColor: colors.inkDeep, borderColor: '#FFF2B0', borderWidth: 1,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  text: { color: colors.ivory, fontSize: 13, lineHeight: 18, fontWeight: '800', textAlign: 'center' },
});
