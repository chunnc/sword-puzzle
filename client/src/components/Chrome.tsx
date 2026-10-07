import React from 'react';
import { Image } from 'expo-image';
import { ImageSourcePropType, ImageStyle, Pressable, StyleProp, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ART } from '../assets';
import { colors, type } from '../theme';
import { ArtPanel } from './Art';
import { useGameStore } from '../state/gameStore';
import { useRouter } from 'expo-router';
import type { BottomNavId } from './Navigation';
import { formatHudAmount } from './hudPresentation';

export function TopHud({ onAccount }: { onAccount: () => void }) {
  const { width } = useWindowDimensions();
  const profile = useGameStore(state => state.save.profile);
  const router = useRouter();

  return (
    <ArtPanel art="hudTrayV2" style={[styles.hud, { width: width - 8 }]}>
      <View style={styles.avatar}>
        <Art image="avatar" style={StyleSheet.absoluteFill} />
        <Art image="avatarFrame" style={StyleSheet.absoluteFill} />
      </View>
      <View style={styles.currencies}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Linh Thạch: ${profile.coins}, mở Cửa Hàng`} onPress={() => router.push('/shop')} style={styles.currency}>
          <HudStat image="iconLinhThach" value={formatHudAmount(profile.coins)} />
        </Pressable>
        <View accessible accessibilityRole="text" accessibilityLabel="Linh Thạch Tinh Hoa: 0" style={styles.currency}>
          <HudStat image="iconLinhThachTinhHoa" value="0" />
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Tài khoản" onPress={onAccount} style={styles.menu}>
        <Art image="iconMenu" style={styles.menuImage} />
      </Pressable>
    </ArtPanel>
  );
}

function HudStat({ image, value }: { image: keyof typeof ART; value: string }) {
  return (
    <View style={styles.statDisplay}>
      <Art image={image} style={styles.statIcon} />
      <Text accessible={false} numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.statValue}>{value}</Text>
    </View>
  );
}

function Art({ image, style }: { image: keyof typeof ART; style: StyleProp<ImageStyle> }) {
  return <Image source={ART[image]} contentFit="contain" accessible={false} style={style} />;
}

const tabs = [
  { id: 'map', label: 'TIÊN LỘ', image: 'iconMap' },
  { id: 'person', label: 'NHÂN VẬT', image: 'iconPerson' },
  { id: 'bag', label: 'TÚI ĐỒ', image: 'iconBag' },
  { id: 'shop', label: 'CỬA HÀNG', image: 'iconShop' },
] as const;

export function BottomNav({ active, onSelect }: { active: BottomNavId; onSelect: (id: BottomNavId) => void }) {
  const { width } = useWindowDimensions();

  return (
    <ArtPanel art="nav" style={[styles.nav, { width: width - 8 }]}>
      {tabs.map((tab) => {
        const image = ART[tab.image];
        const selected = active === tab.id;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="button"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected }}
            onPress={() => { if (!selected) onSelect(tab.id); }}
            style={styles.navItem}
          >
            <ImageView source={image} selected={selected} />
            <Text numberOfLines={1} style={[styles.navLabel, selected && styles.navLabelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </ArtPanel>
  );
}

function ImageView({ source, selected }: { source: ImageSourcePropType; selected: boolean }) {
  return <Image source={source} contentFit="contain" style={[styles.navIcon, !selected && styles.navIconInactive]} />;
}

const styles = StyleSheet.create({
  hud: {
    height: 72,
    flexShrink: 0,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 4,
    marginBottom: 8,
  },
  avatar: {
    width: 60,
    height: 60,
    position: 'relative',
    flexShrink: 0,
  },
  currencies: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  currency: { flex: 1, minWidth: 0, height: 48, justifyContent: 'center' },
  statDisplay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  statIcon: { width: 30, height: 30, flexShrink: 0 },
  statValue: { ...type.body, color: colors.ivory, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'], flexShrink: 1 },
  menu: { width: 48, height: 48, flexShrink: 0, justifyContent: 'center', alignItems: 'center' },
  menuImage: { width: 36, height: 36 },
  nav: {
    aspectRatio: 1600 / 365,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    marginTop: 5,
  },
  navItem: { width: '24%', height: 62, justifyContent: 'center', alignItems: 'center', gap: 0 },
  navIcon: { width: 32, height: 32 },
  navIconInactive: { opacity: 0.68 },
  navLabel: { color: '#dce2d3', fontSize: 9, fontWeight: '600', letterSpacing: 0.2 },
  navLabelActive: { color: colors.goldBright, fontWeight: '900' },
});
