import React, { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ART } from '../assets';
import { GameButton, ScreenFrame, TitleBanner } from './Art';
import { TopHud, BottomNav } from './Chrome';
import { InventoryCollection } from './InventoryCollection';
import { Notice } from './Notice';
import { navigateTab } from './Navigation';
import { SKILLS, SWORDS, type SkillId } from '../game/domain';
import { useGameStore } from '../state/gameStore';
import { colors } from '../theme';

type CollectionProps = { shop?: boolean; initialCategory?: 'skill' | 'sword' };

export function CollectionScreen({ shop = false, initialCategory = 'sword' }: CollectionProps) {
  return shop ? <ShopCollection initialCategory={initialCategory} /> : <InventoryCollection initialCategory={initialCategory} />;
}

function ShopCollection({ initialCategory }: { initialCategory: 'skill' | 'sword' }) {
  const router = useRouter();
  const store = useGameStore();
  const p = store.save.profile;
  const [category, setCategory] = useState(initialCategory);
  const [working, setWorking] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => setCategory(initialCategory), [initialCategory]);
  const items = category === 'skill' ? SKILLS : SWORDS;
  const ownedIds: readonly string[] = category === 'skill' ? p.ownedSkills : p.ownedSwords;
  const execute = async (work: () => Promise<boolean>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setWorking(true);
    try {
      if (await work()) store.setNotice('Đã thêm vào túi đồ.');
    } catch {
      store.setNotice('Không thể lưu thay đổi. Vui lòng thử lại.');
    } finally {
      inFlight.current = false;
      setWorking(false);
    }
  };

  return (
    <ScreenFrame background="bgRealm">
      <TopHud onAccount={() => router.push('/account')} />
      <TitleBanner title="LINH BẢO CÁC" />
      <View style={styles.tabs}>
        {(['sword', 'skill'] as const).map(c => <Pressable key={c} onPress={() => setCategory(c)} accessibilityRole="tab" accessibilityState={{ selected: category === c }} style={[styles.tab, category === c && styles.activeTab]}><Text style={styles.tabText}>{c === 'sword' ? 'BẢO KIẾM' : 'KIẾM THUẬT'}</Text></Pressable>)}
      </View>
      <Text style={styles.caption}>{p.coins} linh thạch · Mua một lần, sở hữu vĩnh viễn</Text>
      <ScrollView contentContainerStyle={styles.list}>
        {items.map(item => {
          const owned = ownedIds.includes(item.id);
          const locked = p.levels.length < item.unlock;
          const equipped = category === 'skill' ? p.loadout.skills.includes(item.id as SkillId) : p.loadout.sword === item.id;
          return (
            <View key={item.id} style={[styles.card, equipped && styles.equipped]}>
              <View style={styles.cardTop}>
                <View style={[styles.iconFrame, { borderColor: 'color' in item ? item.color : colors.gold }]}>
                  {'icon' in item ? <Text style={styles.glyph}>{item.icon}</Text> : <Image source={ART.tileSword} contentFit="contain" style={styles.swordIcon} />}
                </View>
                <View style={styles.nameArea}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.itemMeta}>{equipped ? 'ĐANG TRANG BỊ' : owned ? 'ĐÃ SỞ HỮU' : locked ? `MỞ SAU MÀN ${item.unlock}` : `${item.price} LINH THẠCH`}{'cost' in item ? ` · ${item.cost} KHÍ` : ''}</Text>
                </View>
              </View>
              <Text style={styles.description}>{item.description}</Text>
              <GameButton title={owned ? 'ĐÃ SỞ HỮU' : locked ? `CẦN VƯỢT ${item.unlock} MÀN` : `MUA · ${item.price}`} disabled={working || owned || locked || p.coins < item.price} onPress={() => void execute(() => store.purchase(category, item.id))} style={styles.button} />
            </View>
          );
        })}
        <GameButton title="XEM TÚI ĐỒ" onPress={() => router.replace('/inventory')} art="buttonSecondary" />
      </ScrollView>
      <BottomNav active="shop" onSelect={id => navigateTab(router, id)} />
      <Notice message={store.notice} onDismiss={() => store.setNotice('')} />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8 }, tab: { flex: 1, paddingVertical: 12, borderWidth: 1, borderColor: '#376d68', borderRadius: 8, backgroundColor: '#0b4144', alignItems: 'center' }, activeTab: { borderColor: colors.gold, backgroundColor: '#175a56' }, tabText: { color: colors.ivory, fontSize: 12, fontWeight: '800' }, caption: { color: colors.textMuted, fontSize: 11, textAlign: 'center', paddingVertical: 10 }, list: { gap: 12, paddingBottom: 18 }, card: { borderWidth: 1, borderColor: '#47716a', backgroundColor: 'rgba(4,35,39,.94)', borderRadius: 14, padding: 14, gap: 10 }, equipped: { borderColor: colors.goldBright }, cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 }, iconFrame: { width: 50, height: 58, borderWidth: 1, borderRadius: 10, backgroundColor: '#0b5051', justifyContent: 'center', alignItems: 'center' }, glyph: { color: colors.goldBright, fontSize: 32 }, swordIcon: { width: 42, height: 50 }, nameArea: { flex: 1, gap: 5 }, name: { fontSize: 20, fontWeight: '800', color: colors.ivory }, itemMeta: { color: colors.gold, fontSize: 10, fontWeight: '700' }, description: { color: colors.textMuted, fontSize: 13, lineHeight: 20 }, button: { minHeight: 43 },
});
