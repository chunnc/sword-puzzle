import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Image as NativeImage, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Canvas, ColorMatrix, Image as SkiaImage, useImage, type SkImage } from '@shopify/react-native-skia';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import { ART } from '../assets';
import type { WinSummary } from '../game/types';
import { colors } from '../theme';
import { resultPanelScale, resultTimeline, starColorMatrix, starProgress, RESULT_REWARD_MS } from './gameplayResultVisuals';
import { InventoryDialogPanel } from './InventoryDialogPanel';

export type GameplayResult =
  | { kind: 'won'; runId: string; summary: WinSummary }
  | { kind: 'lost'; runId: string; levelId: number };

function ResultStar({ image, index, earned, elapsed, size }: { image: SkImage | null; index: number; earned: boolean; elapsed: SharedValue<number>; size: number }) {
  const matrix = useDerivedValue(() => starColorMatrix(starProgress(elapsed.value, index, earned)));
  const motion = useAnimatedStyle(() => {
    const progress = starProgress(elapsed.value, index, earned);
    return { transform: [{ scale: 1 + 0.14 * Math.sin(progress * Math.PI) }] };
  });
  return <Animated.View testID={`result-star-${index}`} style={[{ width: size, height: size }, motion]}>
    <Canvas style={{ width: size, height: size }} accessible={false}>
      <SkiaImage image={image} x={4} y={4} width={size - 8} height={size - 8} fit="contain"><ColorMatrix matrix={matrix} /></SkiaImage>
    </Canvas>
  </Animated.View>;
}

function ResultButton({ title, art, width, disabled, onPress }: { title: string; art: 'buttonPrimary' | 'buttonSecondary'; width: number; disabled: boolean; onPress: () => void }) {
  const source = NativeImage.resolveAssetSource(ART[art]);
  const ratio = source?.width && source?.height ? source.width / source.height
    : art === 'buttonPrimary' ? 1400 / 363 : 1400 / 356;
  const imageHeight = width / ratio;
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={disabled ? undefined : onPress}
    style={({ pressed }) => [styles.button, { width, height: Math.max(44, imageHeight) }, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    <Image source={ART[art]} contentFit="contain" accessible={false} style={[styles.buttonArt, { width, height: imageHeight }]} />
    <Text numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2} style={[styles.buttonText, art === 'buttonPrimary' && styles.primaryText]}>{title}</Text>
  </Pressable>;
}

export function GameplayResultPopup({ result, busy, reduceMotion, onReady, onContinue, onBack }: {
  result: GameplayResult; busy: boolean; reduceMotion: boolean;
  onReady: () => void; onContinue: () => void; onBack: () => void;
}) {
  const won = result.kind === 'won', stars = won ? result.summary.stars : 0;
  const exp = won ? result.summary.expGained : 0, coins = won ? result.summary.coinsGained : 0;
  const hasRewards = exp > 0 || coins > 0;
  // Freeze choreography per mount: server reward reconciliation must not replay it.
  const timeline = useRef(resultTimeline(stars, hasRewards)).current;
  const elapsed = useSharedValue(reduceMotion ? timeline.duration : 0);
  const [ready, setReady] = useState(reduceMotion);
  const [starFailed, setStarFailed] = useState(false);
  const starError = useCallback(() => setStarFailed(true), []);
  const star = useImage(ART.gameplayResultStar as number, starError);
  const onReadyRef = useRef(onReady);
  const mounted = useRef(true);
  const completed = useRef(false);
  onReadyRef.current = onReady;
  const finish = useCallback(() => { if (mounted.current && !completed.current) { completed.current = true; setReady(true); onReadyRef.current(); } }, []);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (completed.current) { elapsed.value = timeline.duration; return; }
    if (reduceMotion) {
      elapsed.value = timeline.duration;
      finish();
    } else {
      if (won && !star && !starFailed) return;
      elapsed.value = withTiming(timeline.duration, { duration: timeline.duration, easing: Easing.linear }, finished => {
        if (finished) runOnJS(finish)();
      });
    }
    return () => cancelAnimation(elapsed);
  }, [elapsed, finish, reduceMotion, star, starFailed, timeline, won]);

  const panelMotion = useAnimatedStyle(() => ({ opacity: Math.min(1, elapsed.value / 160), transform: [{ scale: resultPanelScale(elapsed.value) }] }));
  const veilMotion = useAnimatedStyle(() => ({ opacity: Math.min(1, elapsed.value / 160) }));
  const rewardMotion = useAnimatedStyle(() => ({ opacity: elapsed.value >= timeline.duration ? 1 : Math.max(0, Math.min(1, (elapsed.value - timeline.rewardStart) / RESULT_REWARD_MS)) }));
  const disabled = !ready || busy;
  const [panelWidth, setPanelWidth] = useState(0);
  const compact = panelWidth < 350;
  const buttonWidth = Math.min(compact ? 168 : 184, panelWidth > 0 ? Math.max(0, panelWidth - 48) : 168);

  return <View testID="game-result-popup" accessibilityViewIsModal style={styles.overlay}>
    <Animated.View pointerEvents="none" style={[styles.veil, veilMotion]} />
    <Animated.View testID="result-panel-motion" onLayout={event => setPanelWidth(event.nativeEvent.layout.width)} style={[styles.panel, panelMotion]}>
      <InventoryDialogPanel testID="result-panel">
        <View style={[styles.content, compact && styles.compactContent]}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={1.2} style={[styles.title, compact && styles.compactTitle]}>{won ? 'VƯỢT ẢI' : 'HẾT LƯỢT'}</Text>
          {won ? <View testID="result-stars" accessible accessibilityLabel={`${stars} trên 3 sao`} style={styles.stars}>
            {[0, 1, 2].map(index => <ResultStar key={index} image={star} index={index} earned={index < stars} elapsed={elapsed} size={compact ? 56 : 72} />)}
          </View> : null}
          {hasRewards ? <Animated.View testID="result-rewards" style={[styles.rewards, compact && styles.compactRewards, rewardMotion]}>
            {exp > 0 ? <Text maxFontSizeMultiplier={1.2} style={styles.reward}>+{exp} EXP</Text> : null}
            {coins > 0 ? <View style={styles.coinReward}><Image source={ART.iconLinhThach} contentFit="contain" accessible={false} style={styles.coin} /><Text accessibilityLabel={`+${coins} Linh Thạch`} maxFontSizeMultiplier={1.2} style={styles.reward}>+{coins}</Text></View> : null}
          </Animated.View> : null}
          <View testID="result-actions" style={[styles.actions, compact && styles.compactActions]}>
            <ResultButton title={won ? 'TIẾP TỤC' : 'CHƠI LẠI'} art="buttonPrimary" width={buttonWidth} disabled={disabled} onPress={onContinue} />
            <ResultButton title="QUAY VỀ" art="buttonSecondary" width={buttonWidth} disabled={disabled} onPress={onBack} />
          </View>
        </View>
      </InventoryDialogPanel>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 40, padding: 16, alignItems: 'center', justifyContent: 'center' },
  veil: { ...StyleSheet.absoluteFill, backgroundColor: colors.veil },
  panel: { width: '100%', maxWidth: 360 },
  content: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 16, gap: 8 },
  compactContent: { paddingVertical: 8, gap: 4 },
  title: { fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), color: colors.ivory, fontSize: 25, lineHeight: 30, fontWeight: '800', textAlign: 'center', letterSpacing: 1, textShadowColor: colors.inkDeep, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2 },
  compactTitle: { fontSize: 22, lineHeight: 26 },
  stars: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  rewards: { minHeight: 32, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  compactRewards: { minHeight: 28 },
  reward: { color: colors.ivory, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  coinReward: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  coin: { width: 28, height: 28 },
  actions: { width: '100%', flexDirection: 'column', alignItems: 'center', gap: 6 },
  compactActions: { gap: 4 },
  button: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14 },
  buttonArt: { position: 'absolute' },
  buttonText: { color: colors.ivory, fontSize: 12, fontWeight: '900', letterSpacing: 0.3, textShadowColor: colors.inkDeep, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },
  primaryText: { color: colors.inkDeep, textShadowColor: 'transparent', textShadowRadius: 0 },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.85 },
});
