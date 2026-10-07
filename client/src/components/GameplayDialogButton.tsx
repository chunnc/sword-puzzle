import React from 'react';
import { Image } from 'expo-image';
import { Image as NativeImage, Pressable, StyleSheet, Text } from 'react-native';
import { ART } from '../assets';
import { colors } from '../theme';

/** Both gameplay dialogs render each sprite at its intrinsic proportions. */
export function GameplayDialogButton({ title, art, width, disabled, onPress }: {
  title: string; art: 'buttonPrimary' | 'buttonSecondary'; width: number;
  disabled: boolean; onPress: () => void;
}) {
  const source = NativeImage.resolveAssetSource(ART[art]);
  const ratio = source?.width && source?.height ? source.width / source.height
    : art === 'buttonPrimary' ? 1400 / 363 : 1400 / 356;
  const imageHeight = width / ratio;
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={disabled ? undefined : onPress}
    style={({ pressed }) => [styles.button, { width, height: Math.max(44, imageHeight) }, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    <Image source={ART[art]} contentFit="contain" accessible={false} style={[styles.art, { width, height: imageHeight }]} />
    <Text numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2} style={[styles.text, art === 'buttonPrimary' && styles.primaryText]}>{title}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14 },
  art: { position: 'absolute' },
  text: { color: colors.ivory, fontSize: 12, fontWeight: '900', letterSpacing: 0.3, textShadowColor: colors.inkDeep, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },
  primaryText: { color: colors.inkDeep, textShadowColor: 'transparent', textShadowRadius: 0 },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.85 },
});
