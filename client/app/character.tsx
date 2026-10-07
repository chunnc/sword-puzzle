import React, { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SKILL_ART, SWORD_ART } from '../src/assets';
import { BottomNav, TopHud } from '../src/components/Chrome';
import { ProgressBar, ScreenFrame } from '../src/components/Art';
import { FloatingCultivator } from '../src/components/FloatingCultivator';
import { EquipmentSlot } from '../src/components/EquipmentSlot';
import { OutlinedText } from '../src/components/OutlinedText';
import { navigateTab } from '../src/components/Navigation';
import { realmForExp, SKILLS, SWORDS } from '../src/game/domain';
import { useGameStore } from '../src/state/gameStore';
import { colors } from '../src/theme';

export default function CharacterScreen() {
  const router = useRouter();
  const [sceneHeight, setSceneHeight] = useState(0);
  const compact = sceneHeight > 0 && sceneHeight < 420;
  const profile = useGameStore(state => state.save.profile);
  const realm = realmForExp(profile.totalExp);
  const sword = SWORDS.find(item => item.id === profile.loadout.sword)!;
  const expLabel = realm.next ? `${profile.totalExp - realm.exp}/${realm.next.exp - realm.exp}` : 'MAX';
  const stageName = realm.stageName.replace(/\b(kỳ|mãn)/g, word => word[0].toUpperCase() + word.slice(1));
  const openInventory = (category: 'sword' | 'skill') => router.push({ pathname: '/inventory', params: { category } });

  return (
    <ScreenFrame background="bgRealm">
      <TopHud onAccount={() => router.push('/account')} />
      <View onLayout={event => setSceneHeight(event.nativeEvent.layout.height)} style={[styles.scene, compact && styles.compactScene]}>
        <View style={[styles.realmTitle, compact && styles.compactRealmTitle]}>
          <OutlinedText key={realm.name} accessible accessibilityRole="header" accessibilityLabel={`${realm.name}${realm.next ? ` ${stageName}` : ''}`} numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.realm}>{realm.name}</OutlinedText>
          {realm.next ? <OutlinedText accessible={false} maxFontSizeMultiplier={1.2} style={styles.stage}>{stageName}</OutlinedText> : null}
        </View>

        <View style={[styles.hero, compact && styles.compactHero]}>
          <FloatingCultivator />
        </View>

        <View accessible style={[styles.progress, compact && styles.compactProgress]} accessibilityRole="progressbar" accessibilityLabel="Tu vi" accessibilityValue={{ min: 0, max: 100, now: Math.round(realm.progress * 100), text: expLabel }}>
          <ProgressBar portion={realm.progress} color="blue" fillHeight={14} />
          <OutlinedText maxFontSizeMultiplier={1.2} style={styles.exp}>{expLabel}</OutlinedText>
        </View>

        <View style={[styles.loadout, compact && styles.compactLoadout]}>
          <EquipmentSlot kind="sword" art={SWORD_ART[sword.id]} label={`Bảo kiếm ${sword.name}, mở Túi Đồ`} onPress={() => openInventory('sword')} />
          {[0, 1].map(slot => {
            const locked = slot >= realm.skillSlots;
            const skillId = profile.loadout.skills[slot];
            const skill = !locked && skillId ? SKILLS.find(item => item.id === skillId) : undefined;
            return (
              <EquipmentSlot
                key={slot}
                kind="skill"
                {...(locked ? { state: 'locked' as const } : skill ? { state: 'equipped' as const, art: SKILL_ART[skill.id] } : { state: 'empty' as const })}
                label={locked ? `Ô kỹ năng ${slot + 1} bị khóa, mở tại 1500 EXP` : `Ô kỹ năng ${slot + 1}${skill ? `, ${skill.name}` : ' trống'}, mở Kiếm thuật`}
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

const displayFont = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' });
const styles = StyleSheet.create({
  scene: { flex: 1, minHeight: 0, alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  compactScene: { paddingTop: 4, paddingBottom: 4 },
  compactRealmTitle: { minHeight: 72 },
  compactHero: { marginVertical: 2, paddingVertical: 6 },
  compactProgress: { gap: 3, marginTop: 2 },
  compactLoadout: { marginTop: 8 },
  realmTitle: { width: '100%', minHeight: 78, alignItems: 'center', flexShrink: 0 },
  realm: { width: '100%', fontFamily: displayFont, fontSize: 32, lineHeight: 44, fontWeight: '700', color: colors.ivory, textAlign: 'center', textShadowColor: colors.inkDeep, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2 },
  stage: { fontFamily: displayFont, fontSize: 20, lineHeight: 28, color: colors.goldBright, textAlign: 'center', textShadowColor: colors.inkDeep, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2 },
  hero: { flex: 1, minHeight: 0, width: '100%', marginVertical: 4, paddingVertical: 8 },
  progress: { width: '78%', maxWidth: 360, alignItems: 'center', gap: 5, marginTop: 4, flexShrink: 0 },
  exp: { color: colors.ivory, fontSize: 12, lineHeight: 18, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'], textShadowColor: colors.inkDeep, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  loadout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 14, flexShrink: 0 },
});
