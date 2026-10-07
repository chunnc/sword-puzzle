import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useReducedMotion } from 'react-native-reanimated';
import { Board, BOARD_CLEAR_MS, BOARD_FALL_MS, BOARD_SWAP_MS, BOARD_REJECT_MS, type BoardVisualEffect } from '../../src/components/Board';
import { GameplayDock, GameplayHeader, GameplayInfo } from '../../src/components/GameplayChrome';
import { ArtPanel, GameButton, ScreenFrame } from '../../src/components/Art';
import { Notice } from '../../src/components/Notice';
import { BoardEngine } from '../../src/game/BoardEngine';
import { getLevel } from '../../src/game/levels';
import { CONTENT, SKILLS, realmForExp, type SkillId } from '../../src/game/domain';
import { GoalKind, TileKind, type BoardSnapshot, type CellPosition } from '../../src/game/types';
import { useGameStore, type BoardActionResult } from '../../src/state/gameStore';
import { hasRewardedAdUnit } from '../../src/services/ads';
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
    const [viewport, setViewport] = useState({ width: 0, height: 0 });
    const compact = viewport.height > 0 && viewport.height < 640;
    const [effect, setEffect] = useState<BoardVisualEffect | null>(null), [help, setHelp] = useState(false);
    const [leave, setLeave] = useState(false);
    const busyRef = useRef(false), alive = useRef(true), effectId = useRef(0);
    const reduceMotion = useReducedMotion();
    const engine = useMemo(() => board && level ? new BoardEngine(level, board) : null, [board, level]);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => { if (!busyRef.current && persisted)
        setBoard(persisted); }, [persisted]);
    const requestLeave = useCallback(() => {
        if (!busyRef.current) setLeave(true);
    }, []);
    useFocusEffect(useCallback(() => {
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            if (busyRef.current) return true;
            if (leave) setLeave(false);
            else if (help) setHelp(false);
            else if (!board) router.replace('/map');
            else setLeave(true);
            return true;
        });
        return () => subscription.remove();
    }, [board, help, leave, router]));
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
    const restart = async () => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        setTargetSkill(null);
        setTargets([]);
        try {
            if (await store.startLevel(levelId, true) && alive.current)
                setBoard(useGameStore.getState().save.active);
        } catch {
            if (alive.current) store.setNotice('Không thể bắt đầu lại màn. Vui lòng thử lại.');
        } finally {
            busyRef.current = false;
            if (alive.current) setBusy(false);
        }
    };
    const overlayOpen = help || leave || lost && !busy;
    const boardSide = Math.min(Math.max(0, (viewport.width || width) - 28), Math.max(0, height - 6));
    return (
      <ScreenFrame background={level.goal === GoalKind.Boss ? 'bgBoss' : 'bgGame'}>
        <View testID="game-content" style={styles.gameContent} onLayout={event => setViewport({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
          <View style={styles.scene} pointerEvents={overlayOpen ? 'none' : 'auto'} accessibilityElementsHidden={overlayOpen} importantForAccessibility={overlayOpen ? 'no-hide-descendants' : 'auto'}>
            <GameplayHeader levelId={levelId} busy={busy} compact={compact} onBack={requestLeave} onHelp={() => setHelp(true)} />
            <GameplayInfo level={level} board={board} compact={compact} reduceMotion={reduceMotion} duration={BOARD_CLEAR_MS} />
            <View testID="game-board-space" style={styles.boardSpace} onLayout={event => setHeight(event.nativeEvent.layout.height)}>
              <View style={{ width: boardSide, height: boardSide }}>
                <Board snapshot={board} selected={selected} targets={targets} preview={preview} targetingHint={skill ? `${skill.name} · chọn ${required} ô` : null} showTargetingHint={false} locked={busy || overlayOpen} visualEffect={effect} reduceMotion={reduceMotion} onCellPress={tap} onSwipe={swap} />
              </View>
            </View>
            <GameplayDock board={board} skillSlots={realmForExp(store.save.profile.totalExp).skillSlots} available={available} cost={id => engine.cost(id)} targetSkill={targetSkill} targetCount={required} canCast={targets.length === required} busy={busy} compact={compact}
              onSkill={id => { setTargetSkill(id); setTargets([]); setSelected(null); }}
              onCancel={() => { setTargetSkill(null); setTargets([]); }}
              onCast={() => { if (targetSkill) void perform(() => store.castSkill(targetSkill, targets)); }} />
          </View>
          <Notice message={store.notice} onDismiss={() => store.setNotice('')} />
          {lost && !busy && !leave ? <View accessibilityViewIsModal style={styles.overlay}><ArtPanel art="dialogPanel" style={styles.dialog}><Text style={styles.dialogTitle}>HẾT LƯỢT</Text><Text style={styles.body}>Còn {board.remaining} mục tiêu. Thử một cách ghép khác.</Text><GameButton title="CHƠI LẠI" onPress={() => void restart()} />{store.online && store.adsEnabled && store.session && hasRewardedAdUnit() && !board.extraMovesUsed ? <GameButton title="QUẢNG CÁO · +3 LƯỢT" disabled={store.adsLoading} onPress={() => void store.requestExtraMoves()} art="buttonSecondary" textStyle={styles.secondaryText} /> : null}<GameButton title="VỀ TIÊN LỘ" onPress={requestLeave} art="buttonSecondary" textStyle={styles.secondaryText} /></ArtPanel></View> : null}
          {help && !leave ? <View accessibilityViewIsModal style={styles.overlay}><ArtPanel art="dialogPanel" style={styles.dialog}><Text style={styles.dialogTitle}>LINH VẬT</Text><Text style={styles.body}>Ghép 3 nhận sát thương và khí. Ghép 4–5 giữ một ô cường hóa; ghép tiếp cùng loại để kích hoạt.</Text>{CONTENT.tiles.map(tile => <Text key={tile.id} style={styles.rule}>{tile.name}: {tile.damage} sát thương · {tile.qi} khí</Text>)}<Text style={styles.body}>Kiếm: hàng / chữ thập. Hỏa: 3×3 / 13 ô. Lôi: thêm 50% / toàn bộ Lôi. Châu: nhiều khí / Ngưng Khí.</Text><GameButton title="ĐÃ HIỂU" onPress={() => setHelp(false)} /></ArtPanel></View> : null}
          {leave ? <View testID="game-leave-confirmation" accessibilityViewIsModal style={styles.overlay}><ArtPanel art="dialogPanel" style={styles.dialog}><Text accessibilityRole="header" style={styles.dialogTitle}>Rời màn chơi?</Text><Text style={styles.body}>Tiến trình màn này đã được lưu. Bạn có thể chơi tiếp khi quay lại.</Text><GameButton title="Tiếp tục" disabled={busy} onPress={() => setLeave(false)} /><GameButton title="Về Tiên Lộ" disabled={busy} onPress={() => { if (!busyRef.current) router.replace('/map'); }} art="buttonSecondary" textStyle={styles.secondaryText} /></ArtPanel></View> : null}
        </View>
      </ScreenFrame>
    );
}

const styles = StyleSheet.create({
    gameContent: { flex: 1, minHeight: 0, marginHorizontal: -12, paddingHorizontal: 12 },
    scene: { flex: 1, minHeight: 0 },
    boardSpace: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6 },
    overlay: { ...StyleSheet.absoluteFill, zIndex: 30, backgroundColor: colors.veil, alignItems: 'center', justifyContent: 'center', padding: 12 },
    dialog: { width: '100%', maxWidth: 390, padding: 24, gap: 12 },
    dialogTitle: { fontSize: 22, fontWeight: '900', color: colors.ivory, textAlign: 'center' },
    body: { color: colors.ivory, fontSize: 13, textAlign: 'center', lineHeight: 20 },
    rule: { color: colors.goldBright, fontSize: 13 },
    secondaryText: { color: colors.ivory },
});
