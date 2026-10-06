import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TopHud } from '../src/components/Chrome';
import { ArtPanel, GameButton, ScreenFrame, TitleBanner } from '../src/components/Art';
import { CONTENT, LEVEL_COUNT } from '../src/game/domain';
import { useGameStore } from '../src/state/gameStore';
import { colors } from '../src/theme';
export default function WinScreen() {
    const router = useRouter(), params = useLocalSearchParams<{
        levelId?: string;
    }>(), store = useGameStore(), levelId = Number(params.levelId) || 1;
    const summary = store.save.lastWin?.levelId === levelId ? store.save.lastWin : null;
    const stars = summary?.stars ?? store.save.profile.levels.find(x => x.levelId === levelId)?.stars ?? 0;
    const breakthrough = summary && summary.realmAfter > summary.realmBefore;
    const next = async () => {
        if (breakthrough && summary) {
            router.replace({ pathname: '/character', params: { breakthroughRunId: summary.runId } });
            return;
        }
        if (levelId < LEVEL_COUNT && await store.startLevel(levelId + 1))
            router.replace(`/game/${levelId + 1}` as never);
        else
            router.replace('/map');
    };
    return <ScreenFrame background="bgGame"><TopHud onAccount={() => router.push('/account')}/><TitleBanner title="VƯỢT ẢI"/><View style={styles.center}><ArtPanel art="dialogPanel" style={styles.card}>
  <Text style={styles.title}>MÀN {levelId} HOÀN THÀNH</Text><Text style={styles.stars}>{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</Text><Text style={styles.body}>{stars} sao · {CONTENT.expRates[stars]}% EXP nền</Text>
  <View style={styles.rewards}><Text style={styles.reward}>+{summary?.expGained ?? 0} EXP</Text><Text style={styles.reward}>+{summary?.coinsGained ?? 0} linh thạch</Text></View>
  <Text style={styles.body}>Thành tích cao nhất: {summary?.bestStars ?? stars} sao</Text><Text style={styles.body}>Tổng tu vi: {store.save.profile.totalExp} EXP</Text>
  {summary?.expGained === 0 ? <Text style={styles.note}>Nâng sao cao nhất để nhận thêm EXP.</Text> : null}
  {levelId === 40 ? <Text style={styles.note}>Đã hoàn thành 40 màn. Bạn có thể trở lại nâng sao và thử bộ kiếm thuật khác.</Text> : null}
  <GameButton title={breakthrough ? 'ĐỘT PHÁ' : levelId < 40 ? 'MÀN TIẾP THEO' : 'VỀ TIÊN LỘ'} onPress={() => void next()} style={styles.button}/><GameButton title="VỀ TIÊN LỘ" onPress={() => router.replace('/map')} art="buttonSecondary" style={styles.button}/>
 </ArtPanel></View></ScreenFrame>;
}
const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, card: { width: '100%', maxWidth: 390, padding: 30, gap: 10 }, title: { color: colors.ivory, fontSize: 18, fontWeight: '800', textAlign: 'center' }, stars: { color: colors.goldBright, fontSize: 50, textAlign: 'center' }, body: { color: colors.ivory, fontSize: 13, textAlign: 'center' }, rewards: { flexDirection: 'row', justifyContent: 'space-around', gap: 12, paddingVertical: 12 }, reward: { color: '#8efbd4', fontSize: 17, fontWeight: '900' }, note: { color: colors.textMuted, fontSize: 11, lineHeight: 18, textAlign: 'center' }, button: { width: '100%' } });
