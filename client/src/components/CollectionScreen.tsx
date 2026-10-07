import React, { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ART } from '../assets';
import { ArtPanel, GameButton, ScreenFrame, TitleBanner } from './Art';
import { TopHud, BottomNav } from './Chrome';
import { Notice } from './Notice';
import { navigateTab } from './Navigation';
import { SKILLS, SWORDS, realmForExp, type SkillId, type SwordId } from '../game/domain';
import { useGameStore } from '../state/gameStore';
import { colors } from '../theme';
export function CollectionScreen({ shop = false, initialCategory = 'sword' }: {
    shop?: boolean;
    initialCategory?: 'skill' | 'sword';
}) {
    const router = useRouter(), store = useGameStore(), p = store.save.profile, realm = realmForExp(p.totalExp);
    const [category, setCategory] = useState<'skill' | 'sword'>(initialCategory), [working, setWorking] = useState(false);
    useEffect(() => setCategory(initialCategory), [initialCategory]);
    const items = category === 'skill' ? SKILLS : SWORDS;
    const ownedIds: readonly string[] = category === 'skill' ? p.ownedSkills : p.ownedSwords;
    const execute = async (work: () => Promise<boolean>) => { if (working)
        return; setWorking(true); try {
        if (await work())
            store.setNotice(shop ? 'Đã thêm vào túi đồ.' : 'Đã trang bị. Áp dụng từ màn tiếp theo.');
    }
    catch {
        store.setNotice('Không thể lưu thay đổi. Vui lòng thử lại.');
    }
    finally {
        setWorking(false);
    } };
    const equipSkill = (id: SkillId, slot: number) => {
        const skills = [...p.loadout.skills];
        const other = skills.indexOf(id);
        if (other >= 0 && other !== slot) {
            const old = skills[slot];
            skills[slot] = id;
            if (old)
                skills[other] = old;
            else
                skills.splice(other, 1);
        }
        else
            skills[slot] = id;
        return store.equip({ ...p.loadout, skills });
    };
    return <ScreenFrame background="bgRealm"><TopHud onAccount={() => router.push('/account')}/><TitleBanner title={shop ? 'LINH BẢO CÁC' : 'TÚI ĐỒ'}/>
    <View style={styles.tabs}>{(['sword', 'skill'] as const).map(c => <Pressable key={c} onPress={() => setCategory(c)} accessibilityRole="tab" accessibilityState={{ selected: category === c }} style={[styles.tab, category === c && styles.activeTab]}><Text style={styles.tabText}>{c === 'sword' ? 'BẢO KIẾM' : 'KIẾM THUẬT'}</Text></Pressable>)}</View>
    <Text style={styles.caption}>{shop ? `${p.coins} linh thạch · Mua một lần, sở hữu vĩnh viễn` : `${realm.name} · ${realm.stageName} · ${realm.skillSlots} ô kỹ năng`}</Text>
    <ScrollView contentContainerStyle={styles.list}>
      {items.filter(item => shop || ownedIds.includes(item.id)).map(item => {
            const owned = ownedIds.includes(item.id), locked = p.levels.length < item.unlock;
            const equipped = category === 'skill' ? p.loadout.skills.includes(item.id as SkillId) : p.loadout.sword === item.id;
            return <View key={item.id} style={[styles.card, equipped && styles.equipped]}>
          <View style={styles.cardTop}><View style={[styles.iconFrame, { borderColor: 'color' in item ? item.color : colors.gold }]}>{'icon' in item ? <Text style={styles.glyph}>{item.icon}</Text> : <Image source={ART.tileSword} contentFit="contain" style={styles.swordIcon}/>}</View><View style={styles.nameArea}><Text style={styles.name}>{item.name}</Text><Text style={styles.itemMeta}>{equipped ? 'ĐANG TRANG BỊ' : owned ? 'ĐÃ SỞ HỮU' : locked ? `MỞ SAU MÀN ${item.unlock}` : `${item.price} LINH THẠCH`}{'cost' in item ? ` · ${item.cost} KHÍ` : ''}</Text></View></View>
          <Text style={styles.description}>{item.description}</Text>
          {shop ? <GameButton title={owned ? 'ĐÃ SỞ HỮU' : locked ? `CẦN VƯỢT ${item.unlock} MÀN` : `MUA · ${item.price}`} disabled={working || owned || locked || p.coins < item.price} onPress={() => void execute(() => store.purchase(category, item.id))} style={styles.button}/> : category === 'sword' ? <GameButton title={equipped ? 'ĐANG TRANG BỊ' : 'TRANG BỊ'} disabled={working || equipped} onPress={() => void execute(() => store.equip({ ...p.loadout, sword: item.id as SwordId }))} style={styles.button}/> : <View style={styles.slotButtons}>{Array.from({ length: realm.skillSlots }, (_, slot) => <GameButton key={slot} title={p.loadout.skills[slot] === item.id ? `ĐÃ Ở Ô ${slot + 1}` : `TRANG BỊ Ô ${slot + 1}`} disabled={working || p.loadout.skills[slot] === item.id} onPress={() => void execute(() => equipSkill(item.id as SkillId, slot))} style={styles.slotButton}/>)}</View>}
        </View>;
        })}
      {!shop ? <GameButton title="ĐẾN LINH BẢO CÁC" onPress={() => router.push('/shop')} art="buttonSecondary"/> : <GameButton title="XEM TÚI ĐỒ" onPress={() => router.replace('/inventory')} art="buttonSecondary"/>}
    </ScrollView><BottomNav active={shop ? 'shop' : 'bag'} onSelect={id => navigateTab(router, id)}/><Notice message={store.notice} onDismiss={() => store.setNotice('')}/>
  </ScreenFrame>;
}
const styles = StyleSheet.create({ tabs: { flexDirection: 'row', gap: 8 }, tab: { flex: 1, paddingVertical: 12, borderWidth: 1, borderColor: '#376d68', borderRadius: 8, backgroundColor: '#0b4144', alignItems: 'center' }, activeTab: { borderColor: colors.gold, backgroundColor: '#175a56' }, tabText: { color: colors.ivory, fontSize: 12, fontWeight: '800' }, caption: { color: colors.textMuted, fontSize: 11, textAlign: 'center', paddingVertical: 10 }, list: { gap: 12, paddingBottom: 18 }, card: { borderWidth: 1, borderColor: '#47716a', backgroundColor: 'rgba(4,35,39,.94)', borderRadius: 14, padding: 14, gap: 10 }, equipped: { borderColor: colors.goldBright }, cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 }, iconFrame: { width: 50, height: 58, borderWidth: 1, borderRadius: 10, backgroundColor: '#0b5051', justifyContent: 'center', alignItems: 'center' }, glyph: { color: colors.goldBright, fontSize: 32 }, swordIcon: { width: 42, height: 50 }, nameArea: { flex: 1, gap: 5 }, name: { fontSize: 20, fontWeight: '800', color: colors.ivory }, itemMeta: { color: colors.gold, fontSize: 10, fontWeight: '700' }, description: { color: colors.textMuted, fontSize: 13, lineHeight: 20 }, button: { minHeight: 43 }, slotButtons: { flexDirection: 'row', gap: 6 }, slotButton: { flex: 1, paddingHorizontal: 8, minHeight: 43 } });
