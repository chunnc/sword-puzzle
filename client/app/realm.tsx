import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ART } from '../src/assets';
import { TopHud, BottomNav } from '../src/components/Chrome';
import { GameButton, ProgressBar, ScreenFrame, TitleBanner } from '../src/components/Art';
import { navigateTab } from '../src/components/Navigation';
import { REALMS, realmForExp } from '../src/game/domain';
import { useGameStore } from '../src/state/gameStore';
import { colors } from '../src/theme';
export default function RealmScreen() {
    const router = useRouter(), params = useLocalSearchParams<{
        breakthrough?: string;
    }>(), save = useGameStore(s => s.save), realm = realmForExp(save.profile.totalExp);
    const breakthrough = params.breakthrough === '1' && save.lastWin && save.lastWin.realmAfter > save.lastWin.realmBefore;
    return <ScreenFrame background="bgRealm"><TopHud onAccount={() => router.push('/account')}/><TitleBanner title={breakthrough ? 'ĐỘT PHÁ' : 'TU LUYỆN'}/><ScrollView contentContainerStyle={styles.content}>
  <View style={styles.hero}><Image source={ART.cultivator} contentFit="contain" style={StyleSheet.absoluteFill}/></View>
  {breakthrough ? <Text style={styles.celebration}>{REALMS[save.lastWin!.realmBefore].name} → {realm.name}</Text> : null}
  <View style={styles.panel}><Text style={styles.current}>{realm.name} · {realm.stageName}</Text><ProgressBar portion={realm.progress} color="blue"/><Text style={styles.exp}>{save.profile.totalExp} EXP{realm.next ? ` / ${realm.next.exp} EXP` : ''}</Text><Text style={styles.body}>{realm.next ? `Đạt ${realm.next.name} để tăng uy lực. Nâng sao màn cũ để nhận thêm EXP.` : 'Kiếm đạo đã đạt Chân Tiên.'}</Text>{breakthrough ? <GameButton title="TIẾP TỤC TIÊN LỘ" onPress={() => router.replace('/map')}/> : null}</View>
  {REALMS.map((r, index) => <View key={r.id} style={[styles.row, index === realm.index && styles.selected]}><Text style={[styles.order, index <= realm.index && styles.reached]}>{index < realm.index ? '✓' : String(index + 1).padStart(2, '0')}</Text><View style={{ flex: 1 }}><Text style={styles.name}>{r.name}</Text><Text style={styles.body}>{r.exp.toLocaleString()} EXP{index === realm.index ? ` · ${realm.stageName}` : index > realm.index ? ' · Chưa đạt' : ''}</Text></View>{index === realm.index ? <Text style={styles.now}>HIỆN TẠI</Text> : null}</View>)}
 </ScrollView><BottomNav active="cultivation" onSelect={id => navigateTab(router, id)}/></ScreenFrame>;
}
const styles = StyleSheet.create({ content: { gap: 10, paddingBottom: 20 }, hero: { height: 190 }, celebration: { color: colors.goldBright, fontSize: 22, fontWeight: '900', textAlign: 'center', paddingBottom: 8 }, panel: { backgroundColor: 'rgba(4,35,39,.94)', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.gold, gap: 9 }, current: { color: colors.ivory, fontSize: 20, fontWeight: '800' }, exp: { color: colors.goldBright, fontSize: 13, fontWeight: '800' }, body: { color: colors.textMuted, fontSize: 12, lineHeight: 19 }, row: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 13, borderRadius: 11, borderWidth: 1, borderColor: '#315c5c', backgroundColor: 'rgba(4,35,39,.92)' }, selected: { borderColor: colors.goldBright, backgroundColor: '#165953' }, order: { fontSize: 24, color: '#7faaa2', fontWeight: '800', width: 35 }, reached: { color: colors.goldBright }, name: { color: colors.ivory, fontSize: 16, fontWeight: '800' }, now: { color: colors.goldBright, fontSize: 9, fontWeight: '900' } });
