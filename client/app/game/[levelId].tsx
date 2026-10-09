import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useReducedMotion } from 'react-native-reanimated';
import { Board, boardClearDurationMs, BOARD_CLEAR_MS, type BoardVisualEffect } from '../../src/components/Board';
import { createBoardPresenter } from '../../src/components/boardPresenter';
import { createBoardMotionSession } from '../../src/components/boardMotion';
import { SpiritQiFlightOverlay } from '../../src/components/SpiritQiFlightOverlay';
import { buildSpiritFlightCues, type SpiritFlightLayout } from '../../src/components/spiritParticles';
import { BoardActionCancelled } from '../../src/game/boardAction';
import { GameplayDock, GameplayHeader, GameplayInfo } from '../../src/components/GameplayChrome';
import { GameplayResultPopup, type GameplayResult } from '../../src/components/GameplayResultPopup';
import { GameplayLeaveDialog } from '../../src/components/GameplayLeaveDialog';
import { ArtPanel, GameButton, ScreenFrame } from '../../src/components/Art';
import { Notice } from '../../src/components/Notice';
import { BoardEngine } from '../../src/game/BoardEngine';
import { skillTarget } from '../../src/game/skillTargets';
import { getLevel } from '../../src/game/levels';
import { CONTENT, LEVEL_COUNT, SKILLS, realmForExp, type SkillId } from '../../src/game/domain';
import { GoalKind, TileKind, type BoardActionPresenter, type BoardSnapshot, type CellPosition } from '../../src/game/types';
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
    const store = useGameStore();
    const persisted = store.save.active?.levelId === levelId ? store.save.active : null;
    const level = useMemo(() => { try {
        return persisted?.level ?? getLevel(levelId);
    }
    catch {
        return null;
    } }, [levelId, persisted?.level]);
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
    const sceneRef = useRef<View>(null), gridRef = useRef<View>(null), qiBarRef = useRef<View>(null);
    const measureId = useRef(0);
    const [flightLayout, setFlightLayout] = useState<SpiritFlightLayout | null>(null);
    const spiritCues = useMemo(() => board ? buildSpiritFlightCues(effect, board.level.board, board.runId) : [],
        [board?.runId, board?.level.board, effect?.id]);
    // Board owns playback/completion; the screen overlay reads that exact clock.
    const spiritMotion = useMemo(() => !reduceMotion && spiritCues.length ? createBoardMotionSession('clear') : undefined,
        [board?.runId, effect?.id, reduceMotion, spiritCues.length]);
    const measureFlightLayout = useCallback(() => {
        const root = sceneRef.current, grid = gridRef.current, bar = qiBarRef.current;
        const requestId = ++measureId.current;
        if (!root || !grid || !bar) return;
        let measuredBoard: SpiritFlightLayout['board'] | undefined;
        let measuredTarget: SpiritFlightLayout['target'] | undefined;
        const valid = () => alive.current && requestId === measureId.current;
        const fail = () => { if (valid()) setFlightLayout(null); };
        const commit = () => {
            if (!valid() || !measuredBoard || !measuredTarget) return;
            const next = { board: measuredBoard, target: measuredTarget };
            setFlightLayout(previous => previous && previous.board.x === next.board.x && previous.board.y === next.board.y
                && previous.board.width === next.board.width && previous.board.height === next.board.height
                && previous.target.x === next.target.x && previous.target.y === next.target.y ? previous : next);
        };
        grid.measureLayout(root, (x, y, width, height) => {
            if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) { fail(); return; }
            measuredBoard = { x, y, width, height }; commit();
        }, fail);
        bar.measureLayout(root, (x, y, width, height) => {
            if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) { fail(); return; }
            measuredTarget = { x: x + width / 2, y: y + height / 2 }; commit();
        }, fail);
    }, []);
    useEffect(() => { measureFlightLayout(); }, [measureFlightLayout, viewport.width, viewport.height, height, compact, board?.condensed, targetSkill]);
    const activeAction = useRef<{ controller: AbortController; playback: ReturnType<typeof createBoardPresenter> } | null>(null);
    const onMotionStarted = useCallback((runId: string, id: number) => activeAction.current?.playback.onMotionStarted(runId, id), []);
    const onMotionFinished = useCallback((runId: string, id: number) => activeAction.current?.playback.onMotionFinished(runId, id), []);
    useEffect(() => {
        if (!store.foreground) activeAction.current?.controller.abort();
    }, [store.foreground]);
    useEffect(() => { activeAction.current?.playback.setReduceMotion(reduceMotion); }, [reduceMotion]);
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
    useEffect(() => { alive.current = true; return () => { alive.current = false; activeAction.current?.controller.abort(); }; }, []);
    useEffect(() => {
        if (busyRef.current || !persisted || !level) return;
        setBoard(persisted);
        if (new BoardEngine(level, persisted).lost)
            openResult({ kind: 'lost', runId: persisted.runId, levelId });
    }, [level, levelId, openResult, persisted]);
    useEffect(() => {
        const summary = store.save.lastWin;
        if (!busy && summary && summary.levelId === levelId && summary.runId === persisted?.runId) openResult({ kind: 'won', runId: summary.runId, summary });
        if (!busy && store.initialized && !persisted && !store.save.pending && !resultRef.current && !store.save.lastWin) router.replace('/map');
    }, [busy, store.save.lastWin, store.initialized, store.save.pending, persisted, levelId, openResult, router]);
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
    const content = engine.contentDefinition;
    const locked = !store.online || !store.foreground || store.recovering || store.authRequired || Boolean(store.save.pending);
    const available = engine.availableSkills();
    const skill = content.skills.find(s => s.id === targetSkill);
    const targetMode = skillTarget(targetSkill);
    const required = targetMode === 'triple' ? 3 : targetMode === 'pair' || targetMode === 'chargedPair' ? 2 : 1;
    const preview: number[] = [];
    if (targets.length) {
        const p = targets[0];
        if (targetMode === 'row') {
            for (let x = 0; x < level.board.width; x++)
                if (level.board.activeCells[p.y * level.board.width + x]) preview.push(p.y * level.board.width + x);
        } else if (skill?.id === 'hoa-lien' || skill?.id === 'pha-chuong' || skill?.id === 'hoi-linh')
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    const x = p.x + dx, y = p.y + dy;
                    if (x >= 0 && y >= 0 && x < level.board.width && y < level.board.height)
                        if (level.board.activeCells[y * level.board.width + x]) preview.push(y * level.board.width + x);
                }
        else if (targetMode === 'kind')
            board.tiles.forEach((t, i) => { if (t && t.kind === board.tiles[p.y * level.board.width + p.x]?.kind)
                preview.push(i); });
    }
    // Support callers that still return a collected animation. Live store actions
    // use the presenter directly and return animation: null.
    const play = async (result: BoardActionResult, presenter: BoardActionPresenter) => {
        const animation = result.animation;
        if (!animation) return;
        if (reduceMotion) { setBoard(animation.finalBoard); return; }
        const show = async (phase: Parameters<BoardActionPresenter['present']>[0]) => {
            const playback = presenter.present(phase);
            await playback.started;
            await playback.finished;
        };
        await show({ kind: 'start', action: animation });
        for (const step of animation.steps) await show({ kind: 'step', step });
        await show({ kind: 'settled', board: animation.finalBoard });
    };
    const perform = async (work: (presenter: BoardActionPresenter) => Promise<BoardActionResult>, rejectedSwap?: [
        CellPosition,
        CellPosition
    ]) => {
        if (busyRef.current || resultRef.current || locked)
            return;
        busyRef.current = true;
        setBusy(true);
        setSelected(null);
        const controller = new AbortController();
        const playback = createBoardPresenter({
            runId: board.runId, signal: controller.signal, reduceMotion, qiCap: content.qiCap,
            nextId: () => ++effectId.current, setBoard, setEffect,
            onStart: () => { setTargetSkill(null); setTargets([]); },
        });
        const action = { controller, playback };
        activeAction.current = action;
        let completed = false;
        try {
            const result = await work(playback.presenter);
            if (controller.signal.aborted) throw new BoardActionCancelled();
            if (!alive.current)
                return;
            if (!result.changed) {
                if (rejectedSwap && !reduceMotion) {
                    await playback.rejectSwap(rejectedSwap[0], rejectedSwap[1]);
                }
                else
                    store.setNotice('Chọn mục tiêu hợp lệ cho kiếm thuật.');
                return;
            }
            setTargetSkill(null);
            setTargets([]);
            await play(result, playback.presenter);
            completed = true;
            if (alive.current && result.won && result.summary)
                openResult({ kind: 'won', runId: result.summary.runId, summary: result.summary });
            else if (alive.current && result.lost)
                openResult({ kind: 'lost', runId: board.runId, levelId });
        }
        catch (error) {
            if (alive.current && !(error instanceof BoardActionCancelled))
                store.setNotice('Không thể hoàn tất thao tác. Vui lòng thử lại.');
        }
        finally {
            controller.abort();
            playback.dispose();
            if (activeAction.current === action) activeAction.current = null;
            busyRef.current = false;
            if (alive.current) {
                const saved = useGameStore.getState().save.active;
                if (!completed && saved?.runId === board.runId) setBoard(saved);
                setBusy(false);
                setEffect(null);
            }
        }
    };
    const swap = (x1: number, y1: number, x2: number, y2: number) => {
        if (targetSkill || Math.abs(x1 - x2) + Math.abs(y1 - y2) !== 1)
            return;
        void perform(presenter => store.swap(x1, y1, x2, y2, presenter), [{ x: x1, y: y1 }, { x: x2, y: y2 }]);
    };
    const tap = (x: number, y: number) => {
        if (busyRef.current || resultRef.current || locked)
            return;
        if (targetSkill) {
            const tile = board.tiles[y * level.board.width + x];
            if (!tile) return;
            if (targetMode === 'triple' && (tile.locked || tile.chargeTier || tile.kind === TileKind.Rock || tile.kind === TileKind.Lightning) || targetMode === 'chargedPair' && (!tile.chargeTier || tile.locked) || targetMode === 'pair' && (tile.locked || tile.kind === TileKind.Rock) || targetMode === 'kind' && tile.kind === TileKind.Rock)
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
    const cellSize = Math.min(Math.max(0, (viewport.width || width) - 28) / level.board.width, Math.max(0, height - 6) / level.board.height);
    const boardWidth = cellSize * level.board.width, boardHeight = cellSize * level.board.height;
    return (
      <ScreenFrame background={level.objectives.some(o => o.type === 'Boss') ? 'bgBoss' : 'bgGame'}>
        <View testID="game-content" style={styles.gameContent} onLayout={event => setViewport({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
          <View ref={sceneRef} collapsable={false} testID="game-scene" onLayout={measureFlightLayout} style={styles.scene} pointerEvents={overlayOpen ? 'none' : 'auto'} accessibilityElementsHidden={overlayOpen} importantForAccessibility={overlayOpen ? 'no-hide-descendants' : 'auto'}>
            <GameplayHeader levelId={levelId} busy={busy || Boolean(result) || locked} compact={compact} onBack={requestLeave} onHelp={() => { if (!busyRef.current && !resultRef.current) setHelp(true); }} />
            <GameplayInfo level={level} board={board} compact={compact} reduceMotion={reduceMotion}
                duration={effect?.kind === 'clear' ? boardClearDurationMs(effect.effects) : BOARD_CLEAR_MS} />
            <View testID="game-board-space" style={styles.boardSpace} onLayout={event => setHeight(event.nativeEvent.layout.height)}>
              <View style={{ width: boardWidth, height: boardHeight }}>
                <Board snapshot={board} selected={selected} targets={targets} preview={preview} targetingHint={skill ? `${skill.name} · chọn ${required} ô` : null} showTargetingHint={false} locked={busy || overlayOpen || locked} visualEffect={effect} reduceMotion={reduceMotion} onCellPress={tap} onSwipe={swap} onMotionStarted={onMotionStarted} onMotionFinished={onMotionFinished}
                  motionSession={spiritMotion} gridRef={gridRef} onGridLayout={measureFlightLayout} />
              </View>
            </View>
            <GameplayDock board={board} skillSlots={realmForExp(store.save.profile.totalExp).skillSlots} available={available} cost={id => engine.cost(id)} targetSkill={targetSkill} targetCount={required} canCast={targets.length === required} busy={busy || Boolean(result) || locked} compact={compact}
              qiBarRef={qiBarRef} onQiBarLayout={measureFlightLayout}
              onSkill={id => { if (!busyRef.current && !resultRef.current) { setTargetSkill(id); setTargets([]); setSelected(null); } }}
              onCancel={() => { if (!busyRef.current && !resultRef.current) { setTargetSkill(null); setTargets([]); } }}
              onCast={() => { if (targetSkill) void perform(presenter => store.castSkill(targetSkill, targets, presenter)); }} />
            {spiritMotion && flightLayout && store.foreground && !overlayOpen ? <SpiritQiFlightOverlay key={`${board.runId}:${effect!.id}`}
              cues={spiritCues} geometry={level.board} layout={flightLayout} progress={spiritMotion.progress}
              durationMs={effect?.kind === 'clear' ? boardClearDurationMs(effect.effects) : BOARD_CLEAR_MS} /> : null}
          </View>
          {displayResult ? <GameplayResultPopup key={displayResult.runId} result={displayResult} busy={busy} reduceMotion={reduceMotion} onReady={() => { if (resultRef.current?.runId === displayResult.runId) resultReady.current = true; }} onContinue={() => void continueResult()} onBack={requestLeave} /> : null}
          <View pointerEvents="box-none" style={styles.noticeLayer}><Notice message={store.notice} onDismiss={() => store.setNotice('')} /></View>
          {help && !leave ? <View accessibilityViewIsModal style={styles.overlay}><ArtPanel art="dialogPanel" style={styles.dialog}><Text style={styles.dialogTitle}>LINH VẬT</Text><Text style={styles.body}>Ghép 3 nhận sát thương và khí. Ghép 4–5 giữ một ô cường hóa; ghép tiếp cùng loại để kích hoạt.</Text>{content.tiles.map(tile => <Text key={tile.id} style={styles.rule}>{tile.name}: {tile.damage} sát thương · {tile.qi} khí</Text>)}<Text style={styles.body}>Kiếm: hàng / chữ thập. Hỏa: 3×3 / 13 ô. Lôi: thêm 50% / toàn bộ Lôi. Châu: nhiều khí / Ngưng Khí.</Text><GameButton title="ĐÃ HIỂU" onPress={() => setHelp(false)} /></ArtPanel></View> : null}
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
