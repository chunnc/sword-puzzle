import React, { useEffect } from 'react';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import type { NavigationProp } from 'expo-router/react-navigation';
import { ART } from '../src/assets';
import { TopHud, BottomNav } from '../src/components/Chrome';
import { GameButton, ProgressBar, ScreenFrame, TitleBanner } from '../src/components/Art';
import { navigateTab } from '../src/components/Navigation';
import { CONTENT, REALMS, realmForExp, SKILLS, SWORDS } from '../src/game/domain';
import { useGameStore } from '../src/state/gameStore';
import { colors } from '../src/theme';
export default function CharacterScreen() {
    const router = useRouter(), p = useGameStore(s => s.save.profile), realm = realmForExp(p.totalExp), sword = SWORDS.find(x => x.id === p.loadout.sword)!;
    const navigation = useNavigation<NavigationProp<{ character: { breakthroughRunId?: string } }, 'character'>>();
    const { breakthroughRunId } = useLocalSearchParams<{ breakthroughRunId?: string }>();
    const lastWin = useGameStore(s => s.save.lastWin);
    const breakthrough = lastWin && lastWin.runId === breakthroughRunId && lastWin.realmAfter > lastWin.realmBefore ? lastWin : null;

    useEffect(() => {
        if (!breakthroughRunId) return;
        // Replacement removes the scene's params. Clear them on blur too,
        // when another scene is pushed over this one.
        return navigation.addListener('blur', () => {
            navigation.setParams({ breakthroughRunId: undefined });
        });
    }, [breakthroughRunId, navigation]);

    return <ScreenFrame background="bgRealm"><TopHud onAccount={() => router.push('/account')}/><TitleBanner title="KIẾM TU"/><ScrollView contentContainerStyle={styles.content}>
  <View style={styles.hero}><Image source={ART.cultivator} contentFit="contain" style={StyleSheet.absoluteFill}/><View style={styles.realmBadge}><Text style={styles.realm}>{realm.name}</Text><Text style={styles.sub}>{realm.stageName}</Text></View></View>
  <View style={styles.panel}><Text style={styles.heading}>{p.totalExp} EXP</Text><ProgressBar portion={realm.progress} color="blue"/><Text style={styles.sub}>{realm.next ? `Còn ${realm.next.exp - p.totalExp} EXP để đạt ${realm.next.name}` : 'Đã đạt Chân Tiên'}</Text><Text style={styles.sub}>Uy lực ×{realm.damageScale.toFixed(2)} · {p.levels.length}/40 màn hoàn thành</Text></View>
  {breakthrough ? <View accessibilityRole="summary" style={[styles.panel, styles.breakthrough]}><Text style={styles.heading}>ĐỘT PHÁ</Text><Text style={styles.celebration}>{REALMS[breakthrough.realmBefore].name} → {REALMS[breakthrough.realmAfter].name}</Text><GameButton title="TIẾP TỤC TIÊN LỘ" onPress={() => router.replace('/map')}/></View> : null}
  <View style={styles.panel}><Text style={styles.heading}>Bảo kiếm · {sword.name}</Text><Text style={styles.body}>{sword.description}</Text>{p.loadout.skills.map((id, index) => <View key={id} style={styles.skill}><Text style={styles.glyph}>{SKILLS.find(s => s.id === id)!.icon}</Text><View style={{ flex: 1 }}><Text style={styles.heading}>Ô {index + 1} · {SKILLS.find(s => s.id === id)!.name}</Text><Text style={styles.body}>{SKILLS.find(s => s.id === id)!.description}</Text></View></View>)}{realm.skillSlots === 1 ? <Text style={styles.sub}>Ô kỹ năng thứ hai mở tại 1.500 EXP.</Text> : null}<GameButton title="CHỌN TRANG BỊ" onPress={() => router.push('/inventory')}/></View>
  <View style={styles.panel}><Text style={styles.heading}>Linh vật trong trận</Text>{CONTENT.tiles.map(t => <Text key={t.id} style={styles.body}>{t.name} · {Math.floor(t.damage * realm.damageScale * (sword.id === 'trong-nhac' && t.id === 0 ? 1.3 : sword.id === 'hoa-van' && t.id === 1 ? 1.5 : 1))} sát thương · {t.qi + (sword.id === 'thanh-phong' && t.id === 0 || sword.id === 'loi-minh' && t.id === 2 ? 1 : sword.id === 'tu-linh' && t.id === 3 ? 2 : 0)} khí</Text>)}</View>
 </ScrollView><BottomNav active="person" onSelect={id => navigateTab(router, id)}/></ScreenFrame>;
}
const styles = StyleSheet.create({ content: { gap: 12, paddingBottom: 18 }, hero: { height: 235, alignItems: 'center' }, realmBadge: { position: 'absolute', bottom: 0, backgroundColor: '#073e40', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.gold, alignItems: 'center', minWidth: 170 }, realm: { color: colors.ivory, fontSize: 23, fontWeight: '900' }, sub: { color: colors.gold, fontSize: 11, lineHeight: 18 }, panel: { padding: 16, gap: 9, borderWidth: 1, borderColor: '#54786e', borderRadius: 14, backgroundColor: 'rgba(4,35,39,.92)' }, breakthrough: { borderColor: colors.goldBright }, celebration: { color: colors.goldBright, fontSize: 20, fontWeight: '900', textAlign: 'center' }, heading: { color: colors.ivory, fontSize: 15, fontWeight: '800' }, body: { color: colors.textMuted, fontSize: 13, lineHeight: 20 }, skill: { flexDirection: 'row', gap: 10, paddingVertical: 5 }, glyph: { color: colors.goldBright, fontSize: 30, width: 38 } });
