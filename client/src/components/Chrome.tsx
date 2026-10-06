import React from 'react';
import { Image } from 'expo-image';
import { ImageSourcePropType, ImageStyle, Pressable, StyleProp, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ART } from '../assets';
import { colors, type } from '../theme';
import { ArtPanel } from './Art';
import { useGameStore } from '../state/gameStore';
import { realmForExp } from '../game/domain';
import { useRouter } from 'expo-router';
import type { BottomNavId } from './Navigation';

export function TopHud({ onAccount }: { onAccount: () => void }) {
  const { width } = useWindowDimensions();
  const profile = useGameStore(state => state.save.profile);
  const router = useRouter();
  const realm = realmForExp(profile.totalExp);

  return (
    <ArtPanel art="hudTray" style={[styles.hud, { width: width - 8 }]}>
      <View style={styles.avatar}>
        <Art image="avatar" style={StyleSheet.absoluteFill} />
        <Art image="avatarFrame" style={StyleSheet.absoluteFill} />
      </View>
      <HudStat image="iconJade" value={`${profile.totalExp} EXP`} />
      <Pressable accessibilityRole="button" accessibilityLabel={`${profile.coins} linh thạch, mở cửa hàng`} onPress={() => router.push('/shop')}><HudStat image="iconCoin" value={String(profile.coins)} /></Pressable>
      <Text numberOfLines={2} style={{ color: colors.ivory, fontSize: 10, fontWeight: '800', maxWidth: 58 }}>{realm.name}</Text>
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
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function Art({ image, style }: { image: keyof typeof ART; style: StyleProp<ImageStyle> }) {
  return <Image source={ART[image]} contentFit="contain" style={style} />;
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
    aspectRatio: 1600 / 195,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 9,
    marginBottom: 8,
  },
  avatar: {
    width: 50,
    height: 50,
    position: 'relative',
    flexShrink: 0,
    marginRight: 4,
    transform: [{ translateX: -3 }, { translateY: 3 }],
  },
  statDisplay: { minWidth: 57, height: 37, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  statIcon: { width: 22, height: 22 },
  statValue: { ...type.body, color: colors.ivory, fontSize: 14 },
  menu: { width: 39, height: 39, justifyContent: 'center', alignItems: 'center' },
  menuImage: { width: 34, height: 34 },
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
