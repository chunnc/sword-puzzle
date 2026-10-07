import React from 'react';
import { Image } from 'expo-image';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ART, SKILL_ART, SWORD_ART, type Artwork } from '../src/assets';
import { BottomNav, TopHud } from '../src/components/Chrome';
import { ProgressBar, ScreenFrame } from '../src/components/Art';
import { FloatingCultivator } from '../src/components/FloatingCultivator';
import { navigateTab } from '../src/components/Navigation';
import { realmForExp, SKILLS, SWORDS } from '../src/game/domain';
import { useGameStore } from '../src/state/gameStore';
import { colors } from '../src/theme';

export default function CharacterScreen() {
  const router = useRouter();
  const profile = useGameStore(state => state.save.profile);
  const realm = realmForExp(profile.totalExp);
  const sword = SWORDS.find(item => item.id === profile.loadout.sword)!;
  const expLabel = realm.next ? `${profile.totalExp - realm.exp}/${realm.next.exp - realm.exp}` : 'MAX';
  const stageName = realm.stageName.replace(/\b(kỳ|mãn)/g, word => word[0].toUpperCase() + word.slice(1));
  const openInventory = (category: 'sword' | 'skill') => router.push({ pathname: '/inventory', params: { category } });

  return (
    <ScreenFrame background="bgRealm">
      <TopHud showExp={false} onAccount={() => router.push('/account')} />
      <View style={styles.scene}>
        <View style={styles.realmTitle}>
          <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
            <Text numberOfLines={1} style={[styles.realm, styles.realmGlow]}>{realm.name}</Text>
          </View>
          <Text key={realm.name} accessible accessibilityRole="header" accessibilityLabel={`${realm.name}${realm.next ? ` ${stageName}` : ''}`} numberOfLines={1} style={styles.realm}>{realm.name}</Text>
          {realm.next ? <Text accessible={false} style={styles.stage}>{stageName}</Text> : null}
        </View>

        <View style={styles.hero}>
          <FloatingCultivator />
        </View>

        <View accessible style={styles.progress} accessibilityRole="progressbar" accessibilityLabel="Tu vi" accessibilityValue={{ min: 0, max: 100, now: Math.round(realm.progress * 100), text: expLabel }}>
          <ProgressBar portion={realm.progress} color="blue" fillHeight={14} />
          <Text style={styles.exp}>{expLabel}</Text>
        </View>

        <View style={styles.loadout}>
          <EquipmentIcon art={SWORD_ART[sword.id]} label={`Bảo kiếm ${sword.name}, mở Túi Đồ`} onPress={() => openInventory('sword')} />
          {[0, 1].map(slot => {
            const locked = slot >= realm.skillSlots;
            const skillId = profile.loadout.skills[slot];
            const skill = !locked && skillId ? SKILLS.find(item => item.id === skillId) : undefined;
            return (
              <EquipmentIcon
                key={slot}
                art={locked ? 'iconSlotLocked' : skill ? SKILL_ART[skill.id] : 'iconSlotEmpty'}
                label={locked ? `Ô kỹ năng ${slot + 1} bị khóa, mở tại 1500 EXP` : `Ô kỹ năng ${slot + 1}${skill ? `, ${skill.name}` : ' trống'}, mở Kiếm thuật`}
                disabled={locked}
                onPress={() => openInventory('skill')}
              />
            );
          })}
        </View>
      </View>
      <BottomNav active="person" onSelect={id => navigateTab(router, id)} />
    </ScreenFrame>
  );
}

function EquipmentIcon({ art, label, disabled = false, onPress }: { art: Artwork; label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={disabled ? undefined : onPress} style={({ pressed }) => [styles.equipment, pressed && styles.equipmentPressed, disabled && styles.equipmentLocked]}>
      <Image source={ART[art]} contentFit="contain" style={styles.equipmentImage} />
    </Pressable>
  );
}

const displayFont = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' });
const styles = StyleSheet.create({
  scene: { flex: 1, minHeight: 0, alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  realmTitle: { width: '100%', minHeight: 78, alignItems: 'center', flexShrink: 0 },
  realm: { width: '100%', fontFamily: displayFont, fontSize: 32, lineHeight: 44, fontWeight: '700', color: colors.ivory, textAlign: 'center', textShadowColor: colors.inkDeep, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 5 },
  realmGlow: { color: colors.ivory, textShadowColor: colors.blue, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 14, opacity: 0.65 },
  stage: { fontFamily: displayFont, fontSize: 20, lineHeight: 28, color: colors.goldBright, textShadowColor: colors.inkDeep, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  hero: { flex: 1, minHeight: 0, width: '100%', marginVertical: 4, paddingVertical: 8 },
  progress: { width: '78%', maxWidth: 360, alignItems: 'center', gap: 5, marginTop: 4, flexShrink: 0 },
  exp: { color: colors.ivory, fontSize: 11, lineHeight: 16, fontWeight: '600', fontVariant: ['tabular-nums'], textShadowColor: colors.inkDeep, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  loadout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginTop: 14, flexShrink: 0 },
  equipment: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  equipmentImage: { width: 72, height: 72 },
  equipmentPressed: { opacity: 0.8, transform: [{ scale: 0.94 }] },
  equipmentLocked: { opacity: 0.62 },
});
