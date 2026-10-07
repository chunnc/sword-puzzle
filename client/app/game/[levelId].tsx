import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useReducedMotion } from 'react-native-reanimated';
import { ART } from '../../src/assets';
import { Board, BOARD_CLEAR_MS, BOARD_FALL_MS, BOARD_SWAP_MS, BOARD_REJECT_MS, type BoardVisualEffect } from '../../src/components/Board';
import { BottomNav, TopHud } from '../../src/components/Chrome';
import { ArtPanel, GameButton, ProgressBar, ScreenFrame, TitleBanner } from '../../src/components/Art';
import { Notice } from '../../src/components/Notice';
import { BoardEngine } from '../../src/game/BoardEngine';
import { getLevel } from '../../src/game/levels';
import { CONTENT, SKILLS, skillCost, type SkillId } from '../../src/game/domain';
import { GoalKind, TileKind, type BoardSnapshot, type CellPosition } from '../../src/game/types';
import { useGameStore, type BoardActionResult } from '../../src/state/gameStore';
import { hasRewardedAdUnit } from '../../src/services/ads';
import { navigateTab } from '../../src/components/Navigation';
import { colors } from '../../src/theme';
export default function GameScreen() {
    const { levelId: rawId } = useLocalSearchParams<{
        levelId: string;
    }>();
    const levelId = Number(rawId), router = useRouter(), { width } = useWindowDimensions();
    const level = useMemo(() => { try {
        return getLevel(levelId);
    }
    catch {
        return null;
    } }, [levelId]);
    const store = useGameStore();
    const persisted = store.save.active?.levelId === levelId ? store.save.active : null;
    const [board, setBoard] = useState<BoardSnapshot | null>(persisted);
    const [selected, setSelected] = useState<CellPosition | null>(null);
    const [targetSkill, setTargetSkill] = useState<SkillId | null>(null);
    const [targets, setTargets] = useState<CellPosition[]>([]);
    const [height, setHeight] = useState(0), [busy, setBusy] = useState(false);
    const [viewportHeight, setViewportHeight] = useState(0);
    const compact = viewportHeight > 0 && viewportHeight < 640;
    const [effect, setEffect] = useState<BoardVisualEffect | null>(null), [help, setHelp] = useState(false);
    const busyRef = useRef(false), alive = useRef(true), effectId = useRef(0);
    const reduceMotion = useReducedMotion();
    const engine = useMemo(() => board && level ? new BoardEngine(level, board) : null, [board, level]);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => { if (!busyRef.current && persisted)
        setBoard(persisted); }, [persisted]);
    if (!board || !level || !engine)
        return <ScreenFrame background="bgGame"><Text style={styles.body}>Không tìm thấy màn chơi.</Text><GameButton title="VỀ TIÊN LỘ" onPress={() => router.replace('/map')}/></ScreenFrame>;
    const battle = level.goal === GoalKind.Battle || level.goal === GoalKind.Boss;
    const available = engine.availableSkills(), lost = engine.lost;
    const skill = SKILLS.find(s => s.id === targetSkill);
    const required = skill?.target === 'triple' ? 3 : skill?.target === 'pair' || skill?.target === 'chargedPair' ? 2 : 1;
    const preview: number[] = [];
    if (targets.length) {
        const p = targets[0];
        if (skill?.target === 'row')
            for (let x = 0; x < 7; x++)
                preview.push(p.y * 7 + x);
        else if (skill?.id === 'hoa-lien' || skill?.id === 'pha-chuong' || skill?.id === 'hoi-linh')
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    const x = p.x + dx, y = p.y + dy;
                    if (x >= 0 && y >= 0 && x < 7 && y < 7)
                        preview.push(y * 7 + x);
                }
        else if (skill?.target === 'kind')
            board.tiles.forEach((t, i) => { if (t.kind === board.tiles[p.y * 7 + p.x].kind)
                preview.push(i); });
    }
    const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
    const emit = (value: Omit<Extract<BoardVisualEffect, {
        kind: 'clear';
    }>, 'id'>) => setEffect({ ...value, id: ++effectId.current });
    const play = async (result: BoardActionResult) => {
        const animation = result.animation;
        if (!animation)
            return;
        if (reduceMotion) {
            setBoard(animation.finalBoard);
            return;
        }
        if (animation.swap) {
            const { x1, y1, x2, y2 } = animation.swap;
            setEffect({ id: ++effectId.current, kind: 'swap', first: { x: x1, y: y1 }, second: { x: x2, y: y2 } });
            await wait(BOARD_SWAP_MS);
            if (!alive.current)
                return;
        }
        setBoard(animation.swappedBoard);
        setEffect(null);
        for (const step of animation.steps) {
            const cleared = new Set<number>();
            let visual = step.before;
            setBoard(visual);
            // Each trace is played independently; overlapping blasts never run together.
            for (const trace of step.effects) {
                trace.cells.forEach(i => { if (step.cleared.includes(i))
                    cleared.add(i); });
                if (trace.source !== undefined && step.cleared.includes(trace.source))
                    cleared.add(trace.source);
                visual = { ...visual, swordQi: Math.min(100, visual.swordQi + trace.qi), remaining: battle ? Math.max(0, visual.remaining - trace.damage) : visual.remaining, condensed: visual.condensed || trace.kind === 'spirit' && trace.source !== undefined && step.before.tiles[trace.source].chargeTier === 5 };
                setBoard(visual);
                emit({ kind: 'clear', cleared: [...cleared], changed: step.changed, effects: [trace] });
                await wait(BOARD_CLEAR_MS);
                if (!alive.current)
                    return;
            }
            setBoard(step.after);
            setEffect({ id: ++effectId.current, kind: 'fall', falls: step.falls });
            await wait(BOARD_FALL_MS);
            if (!alive.current)
                return;
        }
        setBoard(animation.finalBoard);
        setEffect(null);
    };
    const perform = async (work: () => Promise<BoardActionResult>, rejectedSwap?: [
        CellPosition,
        CellPosition
    ]) => {
        if (busyRef.current)
            return;
        busyRef.current = true;
        setBusy(true);
        setSelected(null);
        try {
            const result = await work();
            if (!alive.current)
                return;
            if (!result.changed) {
                if (rejectedSwap && !reduceMotion) {
                    setEffect({ id: ++effectId.current, kind: 'reject', first: rejectedSwap[0], second: rejectedSwap[1] });
                    await wait(BOARD_REJECT_MS);
                }
                else
                    store.setNotice('Chọn mục tiêu hợp lệ cho kiếm thuật.');
                return;
            }
            setTargetSkill(null);
            setTargets([]);
            await play(result);
            if (alive.current && result.won)
                router.replace({ pathname: '/win', params: { levelId: String(levelId) } });
        }
        catch {
            if (alive.current)
                store.setNotice('Không thể hoàn tất thao tác. Vui lòng thử lại.');
        }
        finally {
            busyRef.current = false;
            if (alive.current) {
                setBusy(false);
                setEffect(null);
            }
        }
    };
    const swap = (x1: number, y1: number, x2: number, y2: number) => {
        if (targetSkill || Math.abs(x1 - x2) + Math.abs(y1 - y2) !== 1)
            return;
        void perform(() => store.swap(x1, y1, x2, y2), [{ x: x1, y: y1 }, { x: x2, y: y2 }]);
    };
    const tap = (x: number, y: number) => {
        if (busyRef.current)
            return;
        if (targetSkill) {
            const tile = board.tiles[y * 7 + x];
            if (skill?.target === 'triple' && (tile.locked || tile.chargeTier || tile.kind === TileKind.Rock || tile.kind === TileKind.Lightning) || skill?.target === 'chargedPair' && (!tile.chargeTier || tile.locked) || skill?.target === 'pair' && (tile.locked || tile.kind === TileKind.Rock) || skill?.target === 'kind' && tile.kind === TileKind.Rock)
                return;
            const exists = targets.some(p => p.x === x && p.y === y);
            setTargets(exists ? targets.filter(p => p.x !== x || p.y !== y) : required === 1 ? [{ x, y }] : [...targets.slice(-(required - 1)), { x, y }]);
        }
        else if (selected?.x === x && selected.y === y)
            setSelected(null);
        else if (selected && Math.abs(selected.x - x) + Math.abs(selected.y - y) === 1)
            swap(selected.x, selected.y, x, y);
        else
            setSelected({ x, y });
    };
    const restart = async () => { if (busyRef.current)
        return; setTargetSkill(null); setTargets([]); if (await store.startLevel(levelId, true))
        setBoard(useGameStore.getState().save.active); };
    const goalName = battle ? 'MÁU YÊU THÚ' : level.goal === GoalKind.Collect ? `THU ${(CONTENT.tiles.find(t => t.id === level.collectKind)?.name ?? 'Linh vật').toUpperCase()}` : level.goal === GoalKind.BreakRocks ? 'PHÁ ĐÁ' : 'PHÁ PHONG ẤN';
    return <ScreenFrame background={level.goal === GoalKind.Boss ? 'bgBoss' : 'bgGame'}>
    <View testID="game-content" style={styles.gameContent} onLayout={event => setViewportHeight(event.nativeEvent.layout.height)}>
    <TopHud onAccount={() => router.push('/account')}/>
    <View style={[styles.titleRow, compact && styles.compactTitleRow]}><Text numberOfLines={1} style={[styles.title, compact && styles.compactTitle]}>MÀN {levelId} · {level.goal === GoalKind.Boss ? 'YÊU VƯƠNG' : battle ? 'YÊU THÚ' : 'BÍ CẢNH'}</Text><Pressable hitSlop={compact ? 10 : undefined} onPress={() => setHelp(true)} accessibilityRole="button" accessibilityLabel="Luật các ô"><Text style={[styles.link, compact && styles.compactLink]}>LUẬT Ô</Text></Pressable></View>
    <View style={[styles.stats, compact && styles.compactStats]}><Text style={[styles.stat, compact && styles.compactStat]}>{goalName}{'\n'}<Text style={[styles.number, compact && styles.compactNumber]}>{board.remaining}{battle ? ' HP' : ` / ${level.target}`}</Text></Text>{compact && battle ? <Image source={ART.beast} style={styles.compactBeast} contentFit="contain" /> : null}<Text style={[styles.stat, compact && styles.compactStat]}>LƯỢT{'\n'}<Text style={[styles.number, compact && styles.compactNumber]}>{board.moves}</Text></Text></View>
    {battle ? <View style={compact ? styles.compactEnemy : styles.enemy}>{!compact ? <Image source={ART.beast} style={styles.beast} contentFit="contain"/> : null}<ProgressBar portion={board.remaining / level.target} color="red" animated={!reduceMotion} duration={BOARD_CLEAR_MS}/></View> : null}
    <View testID="game-board-space" style={styles.boardSpace} onLayout={e => setHeight(e.nativeEvent.layout.height)}><View style={{ width: Math.min(width - 28, Math.max(0, height - 4)), height: Math.min(width - 28, Math.max(0, height - 4)) }}><Board snapshot={board} selected={selected} targets={targets} preview={preview} targetingHint={skill ? `${skill.name} · chọn ${required} ô` : null} locked={busy} visualEffect={effect} reduceMotion={reduceMotion} onCellPress={tap} onSwipe={swap}/></View></View>
    <View style={[styles.energy, compact && styles.compactEnergy]}><Text style={styles.energyText}>KIẾM KHÍ {board.swordQi}/100{board.condensed ? ' · NGƯNG KHÍ −25%' : ''}</Text><ProgressBar portion={board.swordQi / 100} color="blue"/></View>
    <View testID="game-skill-controls" style={[styles.skillControls, compact && styles.compactSkillControls]}>
    {targetSkill ? <View style={styles.castRow}><GameButton title="HỦY" art="buttonSecondary" disabled={busy} onPress={() => { setTargetSkill(null); setTargets([]); }} style={[styles.castButton, compact && styles.compactCastButton]}/><GameButton title={`THI TRIỂN · ${engine.cost(targetSkill)} KHÍ`} disabled={busy || targets.length !== required} onPress={() => void perform(() => store.castSkill(targetSkill, targets))} style={[styles.castButton, compact && styles.compactCastButton]}/></View> : <View style={styles.skills}>{board.loadout.skills.map(id => { const definition = SKILLS.find(s => s.id === id)!; return <Pressable key={id} disabled={busy || !available.includes(id)} accessibilityRole="button" accessibilityLabel={`${definition.name}, ${engine.cost(id)} kiếm khí`} accessibilityState={{ disabled: busy || !available.includes(id) }} onPress={() => { setTargetSkill(id); setTargets([]); setSelected(null); }} style={[styles.skill, !available.includes(id) && styles.dim]}><Text style={styles.skillGlyph}>{definition.icon}</Text><Text style={styles.skillName}>{definition.name}</Text><Text style={styles.cost}>{engine.cost(id)} khí</Text></Pressable>; })}</View>}
    </View>
    {board.moves === 0 && !lost && !busy ? <Text style={styles.lastChance}>Hết lượt · bạn còn một lần thi triển kiếm thuật.</Text> : null}
    <BottomNav active="map" onSelect={id => navigateTab(router, id)}/><Notice message={store.notice} onDismiss={() => store.setNotice('')}/>
    {lost && !busy ? <View style={styles.overlay}><ArtPanel art="dialogPanel" style={styles.dialog}><Text style={styles.dialogTitle}>HẾT LƯỢT</Text><Text style={styles.body}>Còn {board.remaining} mục tiêu. Thử một cách ghép khác.</Text><GameButton title="CHƠI LẠI" onPress={() => void restart()}/>{store.online && store.adsEnabled && store.session && hasRewardedAdUnit() && !board.extraMovesUsed ? <GameButton title="QUẢNG CÁO · +3 LƯỢT" disabled={store.adsLoading} onPress={() => void store.requestExtraMoves()} art="buttonSecondary"/> : null}<GameButton title="VỀ TIÊN LỘ" onPress={() => router.replace('/map')} art="buttonSecondary"/></ArtPanel></View> : null}
    {help ? <View style={styles.overlay}><ArtPanel art="dialogPanel" style={styles.dialog}><Text style={styles.dialogTitle}>LINH VẬT</Text><Text style={styles.body}>Ghép 3 nhận sát thương và khí. Ghép 4–5 giữ một ô cường hóa; ghép tiếp cùng loại để kích hoạt.</Text>{CONTENT.tiles.map(t => <Text key={t.id} style={styles.rule}>{t.name}: {t.damage} sát thương · {t.qi} khí</Text>)}<Text style={styles.body}>Kiếm: hàng / chữ thập. Hỏa: 3×3 / 13 ô. Lôi: thêm 50% / toàn bộ Lôi. Châu: nhiều khí / Ngưng Khí.</Text><GameButton title="ĐÃ HIỂU" onPress={() => setHelp(false)}/></ArtPanel></View> : null}
  </View></ScreenFrame>;
}
const styles = StyleSheet.create({
    gameContent: { flex: 1, minHeight: 0, marginHorizontal: -12, paddingHorizontal: 12 },
    compactTitleRow: { paddingVertical: 2 }, compactTitle: { fontSize: 14, flexShrink: 1 }, compactLink: { padding: 2 },
    compactStats: { paddingVertical: 2, alignItems: 'center' }, compactStat: { fontSize: 9, lineHeight: 12 }, compactNumber: { fontSize: 16, lineHeight: 19 },
    compactBeast: { width: 60, height: 32 }, compactEnemy: { height: 18, flexShrink: 0, marginTop: 2 },
    compactEnergy: { paddingVertical: 2, gap: 1 }, compactSkillControls: { height: 48 }, compactCastButton: { minHeight: 44, paddingVertical: 7 },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }, title: { color: colors.ivory, fontWeight: '900', fontSize: 16 }, link: { color: colors.goldBright, fontSize: 11, fontWeight: '800', padding: 8 }, stats: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 5, backgroundColor: 'rgba(4,35,39,.85)', borderRadius: 10 }, stat: { color: colors.textMuted, fontSize: 10, fontWeight: '800' }, number: { color: colors.ivory, fontSize: 22, fontWeight: '900' }, enemy: { height: 85, alignItems: 'center', justifyContent: 'flex-end', gap: 2 }, beast: { width: 140, height: 63 }, boardSpace: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' }, energy: { gap: 3, paddingVertical: 5 }, energyText: { color: colors.goldBright, fontSize: 10, fontWeight: '800', textAlign: 'center' }, skillControls: { height: 59, flexShrink: 0 }, skills: { flex: 1, flexDirection: 'row', gap: 8 }, skill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.gold, borderRadius: 12, backgroundColor: '#0b5051' }, skillGlyph: { color: colors.goldBright, fontSize: 28 }, skillName: { color: colors.ivory, fontSize: 12, fontWeight: '800' }, cost: { color: colors.textMuted, fontSize: 10 }, dim: { opacity: .5 }, castRow: { flex: 1, flexDirection: 'row', gap: 5, alignItems: 'center' }, castButton: { flex: 1, paddingHorizontal: 8, minHeight: 49 }, lastChance: { color: colors.goldBright, fontSize: 10, textAlign: 'center', paddingTop: 3 }, overlay: { ...StyleSheet.absoluteFill, zIndex: 30, backgroundColor: colors.veil, alignItems: 'center', justifyContent: 'center', padding: 20 }, dialog: { width: '100%', maxWidth: 390, padding: 30, gap: 12 }, dialogTitle: { fontSize: 22, fontWeight: '900', color: colors.ivory }, body: { color: colors.ivory, fontSize: 13, textAlign: 'center', lineHeight: 20 }, rule: { color: colors.goldBright, fontSize: 13 },
});
