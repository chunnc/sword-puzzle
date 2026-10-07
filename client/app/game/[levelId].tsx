import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useReducedMotion } from 'react-native-reanimated';
import { Board, BOARD_CLEAR_MS, BOARD_FALL_MS, BOARD_SWAP_MS, BOARD_REJECT_MS, type BoardVisualEffect } from '../../src/components/Board';
import { GameplayDock, GameplayHeader, GameplayInfo } from '../../src/components/GameplayChrome';
import { GameplayResultPopup, type GameplayResult } from '../../src/components/GameplayResultPopup';
import { GameplayLeaveDialog } from '../../src/components/GameplayLeaveDialog';
import { ArtPanel, GameButton, ScreenFrame } from '../../src/components/Art';
import { Notice } from '../../src/components/Notice';
import { BoardEngine } from '../../src/game/BoardEngine';
import { getLevel } from '../../src/game/levels';
import { CONTENT, LEVEL_COUNT, SKILLS, realmForExp, type SkillId } from '../../src/game/domain';
import { GoalKind, TileKind, type BoardSnapshot, type CellPosition } from '../../src/game/types';
import { useGameStore, type BoardActionResult } from '../../src/state/gameStore';
import { colors } from '../../src/theme';
export default function GameScreen() {
    const { levelId: rawId } = useLocalSearchParams<{
        levelId: string;
    }>();
    return <GameplaySession key={rawId} levelId={Number(rawId)} />;
}

function GameplaySession({ levelId }: { levelId: number }) {
    const router = useRouter(), { width } = useWindowDimensions();
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
    const [result, setResult] = useState<GameplayResult | null>(null);
    const resultRef = useRef<GameplayResult | null>(null), resultReady = useRef(false);
    const busyRef = useRef(false), alive = useRef(true), effectId = useRef(0);
    const reduceMotion = useReducedMotion();
    const engine = useMemo(() => board && level ? new BoardEngine(level, board) : null, [board, level]);
    const openResult = useCallback((next: GameplayResult) => {
        if (resultRef.current?.runId === next.runId) return;
        resultRef.current = next;
        resultReady.current = false;
        setSelected(null);
        setTargetSkill(null);
        setTargets([]);
        setHelp(false);
        setLeave(false);
        setResult(next);
    }, []);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => {
        if (busyRef.current || !persisted || !level) return;
        setBoard(persisted);
        if (new BoardEngine(level, persisted).lost)
            openResult({ kind: 'lost', runId: persisted.runId, levelId });
    }, [level, levelId, openResult, persisted]);
    const requestLeave = useCallback(() => {
        if (busyRef.current) return;
        if (resultRef.current) {
            if (resultReady.current) { busyRef.current = true; setBusy(true); router.replace('/map'); }
        } else setLeave(true);
    }, [router]);
    useFocusEffect(useCallback(() => {
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            if (busyRef.current) return true;
            if (resultRef.current) { requestLeave(); return true; }
            if (leave) setLeave(false);
            else if (help) setHelp(false);
            else if (!board) router.replace('/map');
            else setLeave(true);
            return true;
        });
        return () => subscription.remove();
    }, [board, help, leave, requestLeave, router]));
    if (!board || !level || !engine)
        return <ScreenFrame background="bgGame"><Text style={styles.body}>Không tìm thấy màn chơi.</Text><GameButton title="VỀ TIÊN LỘ" onPress={() => router.replace('/map')}/></ScreenFrame>;
    const battle = level.goal === GoalKind.Battle || level.goal === GoalKind.Boss;
    const available = engine.availableSkills();
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
        if (busyRef.current || resultRef.current)
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
            if (alive.current && result.won && result.summary)
                openResult({ kind: 'won', runId: result.summary.runId, summary: result.summary });
            else if (alive.current && result.lost)
                openResult({ kind: 'lost', runId: board.runId, levelId });
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
        if (busyRef.current || resultRef.current)
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
    const continueResult = async () => {
        const completed = resultRef.current;
        if (busyRef.current || !completed || !resultReady.current) return;
        busyRef.current = true;
        setBusy(true);
        let navigating = false;
        try {
            if (completed.kind === 'won') {
                if (levelId === LEVEL_COUNT) { router.replace('/map'); navigating = true; return; }
                if (!await store.startLevel(levelId + 1)) throw new Error('START_FAILED');
                if (alive.current) { router.replace(`/game/${levelId + 1}` as never); navigating = true; }
            } else {
                if (!await store.startLevel(levelId, true)) throw new Error('START_FAILED');
                if (alive.current) {
                    setBoard(useGameStore.getState().save.active);
                    resultRef.current = null;
                    resultReady.current = false;
                    setResult(null);
                }
            }
        } catch {
            if (alive.current) store.setNotice('Không thể bắt đầu màn. Vui lòng thử lại.');
        } finally {
            if (!navigating) {
                busyRef.current = false;
                if (alive.current) setBusy(false);
            }
        }
    };
    const overlayOpen = help || leave || Boolean(result);
    const displayResult = result?.kind === 'won' && store.save.lastWin?.runId === result.runId
        ? { ...result, summary: store.save.lastWin } : result;
    const boardSide = Math.min(Math.max(0, (viewport.width || width) - 28), Math.max(0, height - 6));
    return (
      <ScreenFrame background={level.goal === GoalKind.Boss ? 'bgBoss' : 'bgGame'}>
        <View testID="game-content" style={styles.gameContent} onLayout={event => setViewport({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
          <View style={styles.scene} pointerEvents={overlayOpen ? 'none' : 'auto'} accessibilityElementsHidden={overlayOpen} importantForAccessibility={overlayOpen ? 'no-hide-descendants' : 'auto'}>
            <GameplayHeader levelId={levelId} busy={busy || Boolean(result)} compact={compact} onBack={requestLeave} onHelp={() => { if (!busyRef.current && !resultRef.current) setHelp(true); }} />
            <GameplayInfo level={level} board={board} compact={compact} reduceMotion={reduceMotion} duration={BOARD_CLEAR_MS} />
            <View testID="game-board-space" style={styles.boardSpace} onLayout={event => setHeight(event.nativeEvent.layout.height)}>
              <View style={{ width: boardSide, height: boardSide }}>
                <Board snapshot={board} selected={selected} targets={targets} preview={preview} targetingHint={skill ? `${skill.name} · chọn ${required} ô` : null} showTargetingHint={false} locked={busy || overlayOpen} visualEffect={effect} reduceMotion={reduceMotion} onCellPress={tap} onSwipe={swap} />
              </View>
            </View>
            <GameplayDock board={board} skillSlots={realmForExp(store.save.profile.totalExp).skillSlots} available={available} cost={id => engine.cost(id)} targetSkill={targetSkill} targetCount={required} canCast={targets.length === required} busy={busy || Boolean(result)} compact={compact}
              onSkill={id => { if (!busyRef.current && !resultRef.current) { setTargetSkill(id); setTargets([]); setSelected(null); } }}
              onCancel={() => { if (!busyRef.current && !resultRef.current) { setTargetSkill(null); setTargets([]); } }}
              onCast={() => { if (targetSkill) void perform(() => store.castSkill(targetSkill, targets)); }} />
          </View>
          {displayResult ? <GameplayResultPopup key={displayResult.runId} result={displayResult} busy={busy} reduceMotion={reduceMotion} onReady={() => { if (resultRef.current?.runId === displayResult.runId) resultReady.current = true; }} onContinue={() => void continueResult()} onBack={requestLeave} /> : null}
          <View pointerEvents="box-none" style={styles.noticeLayer}><Notice message={store.notice} onDismiss={() => store.setNotice('')} /></View>
          {help && !leave ? <View accessibilityViewIsModal style={styles.overlay}><ArtPanel art="dialogPanel" style={styles.dialog}><Text style={styles.dialogTitle}>LINH VẬT</Text><Text style={styles.body}>Ghép 3 nhận sát thương và khí. Ghép 4–5 giữ một ô cường hóa; ghép tiếp cùng loại để kích hoạt.</Text>{CONTENT.tiles.map(tile => <Text key={tile.id} style={styles.rule}>{tile.name}: {tile.damage} sát thương · {tile.qi} khí</Text>)}<Text style={styles.body}>Kiếm: hàng / chữ thập. Hỏa: 3×3 / 13 ô. Lôi: thêm 50% / toàn bộ Lôi. Châu: nhiều khí / Ngưng Khí.</Text><GameButton title="ĐÃ HIỂU" onPress={() => setHelp(false)} /></ArtPanel></View> : null}
          {leave ? <GameplayLeaveDialog busy={busy} compact={(viewport.width || width) < 360} onContinue={() => setLeave(false)} onBack={() => { if (!busyRef.current) router.replace('/map'); }} /> : null}
        </View>
      </ScreenFrame>
    );
}

const styles = StyleSheet.create({
    gameContent: { flex: 1, minHeight: 0, marginHorizontal: -12, paddingHorizontal: 12 },
    scene: { flex: 1, minHeight: 0 },
    noticeLayer: { ...StyleSheet.absoluteFill, zIndex: 50 },
    boardSpace: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6 },
    overlay: { ...StyleSheet.absoluteFill, zIndex: 30, backgroundColor: colors.veil, alignItems: 'center', justifyContent: 'center', padding: 12 },
    dialog: { width: '100%', maxWidth: 390, padding: 24, gap: 12 },
    dialogTitle: { fontSize: 22, fontWeight: '900', color: colors.ivory, textAlign: 'center' },
    body: { color: colors.ivory, fontSize: 13, textAlign: 'center', lineHeight: 20 },
    rule: { color: colors.goldBright, fontSize: 13 },
});
