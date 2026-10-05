import React, { PropsWithChildren } from 'react';
import { Image, ImageContentFit } from 'expo-image';
import { ImageStyle, Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Artwork, ART } from '../assets';
import { colors } from '../theme';

export function ScreenFrame({
  background,
  children,
  tint,
  style,
}: PropsWithChildren<{ background: Artwork; tint?: string; style?: StyleProp<ViewStyle> }>) {
  return (
    <View style={[styles.screen, style]}>
      <Image source={ART[background]} contentFit="cover" style={StyleSheet.absoluteFill} cachePolicy="memory-disk" />
      {tint ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} /> : null}
      <SafeAreaView style={styles.safeContent} edges={['top', 'bottom']}>
        {children}
      </SafeAreaView>
    </View>
  );
}

export function ArtImage({
  art,
  style,
  contentFit = 'contain',
  accessibilityLabel,
}: {
  art: Artwork;
  style: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  accessibilityLabel?: string;
}) {
  return <Image source={ART[art]} style={style} contentFit={contentFit} accessibilityLabel={accessibilityLabel} />;
}

export function ArtPanel({
  art,
  children,
  style,
  contentFit = 'fill',
}: PropsWithChildren<{ art: Artwork; style?: StyleProp<ViewStyle>; contentFit?: ImageContentFit }>) {
  return (
    <View style={[styles.artPanel, style]}>
      <Image source={ART[art]} contentFit={contentFit} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

export function GameButton({
  title,
  onPress,
  art = 'buttonPrimary',
  disabled = false,
  style,
  textStyle,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  art?: Artwork;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={[styles.button, style, disabled && styles.disabled]}
    >
      <Image source={ART[disabled ? 'buttonDisabled' : art]} contentFit="fill" style={StyleSheet.absoluteFill} />
      <Text style={[styles.buttonText, textStyle]}>{title}</Text>
    </Pressable>
  );
}

export function TitleBanner({ title }: { title: string }) {
  return (
    <ArtPanel art="banner" style={styles.titleBanner}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={styles.titleText}>{title}</Text>
    </ArtPanel>
  );
}

export function ProgressBar({ portion, color }: { portion: number; color: 'blue' | 'red' }) {
  return (
    <ArtPanel art="barTrack" style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(1, portion)) * 100}%` }]}>
        <Image source={ART[color === 'red' ? 'barRed' : 'barBlue']} contentFit="fill" style={StyleSheet.absoluteFill} />
      </View>
    </ArtPanel>
  );
}

export function BackdropDivider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  safeContent: { flex: 1, paddingHorizontal: 12 },
  artPanel: { justifyContent: 'center', alignItems: 'center', overflow: 'visible' },
  button: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
    color: colors.inkDeep,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '900',
    overflow: 'visible',
  },
  buttonText: { color: colors.inkDeep, textAlign: 'center', fontWeight: '900', letterSpacing: 0.5 },
  disabled: { opacity: 0.62 },
  titleBanner: { height: 60, width: '100%', marginBottom: 5 },
  titleText: { color: colors.ivory, fontSize: 24, fontWeight: '900', letterSpacing: 1.4 },
  progressTrack: { height: 18, width: '100%', overflow: 'hidden', borderRadius: 12, alignItems: 'flex-start' },
  progressFill: { height: '100%', overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(239, 211, 144, 0.5)' },
});
