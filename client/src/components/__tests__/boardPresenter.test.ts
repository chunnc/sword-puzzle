import { createBoardPresenter } from '../boardPresenter';
import { BoardActionCancelled, runBoardAction } from '../../game/boardAction';
import { BoardEngine } from '../../game/BoardEngine';
import { getLevel } from '../../game/levels';
import { TileKind, type BoardResolutionStep } from '../../game/types';
import { boardClearDurationMs, buildCellVisuals, cellMotion, type BoardVisualEffect } from '../boardVisuals';

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function fixture(reduceMotion = false, resolutionStep?: BoardResolutionStep) {
    const board = resolutionStep?.before ?? new BoardEngine(getLevel(5)).snapshot();
    const step: BoardResolutionStep = resolutionStep ?? {
        before: board, after: { ...board, swordQi: 20 }, chain: 1, damage: 1,
        cleared: [0, 1], changed: [], falls: [{ index: 0, fromY: 7 }],
        effects: [{ kind: 'fire', source: 0, cells: [0], qi: 10, damage: 1 },
            { kind: 'lightning', source: 1, cells: [1], qi: 10, damage: 0 }],
    };
    const controller = new AbortController();
    const setBoard = jest.fn(), setEffect = jest.fn(), onSfx = jest.fn();
    let id = 0;
    const playback = createBoardPresenter({ runId: board.runId, signal: controller.signal,
        reduceMotion, qiCap: 100, nextId: () => ++id, setBoard, setEffect, onStart: jest.fn(), onSfx });
    const effect = () => setEffect.mock.calls.at(-1)![0] as BoardVisualEffect;
    const begin = () => playback.onMotionStarted(board.runId, effect().id);
    const finish = () => playback.onMotionFinished(board.runId, effect().id);
    return { board, step, controller, playback, setBoard, setEffect, onSfx, effect, begin, finish };
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('plays eligible cues without starting a board animation when reduce motion is enabled', async () => {
    const f = fixture(true);
    const before = f.board;
    const match = { kind: 'skill' as const, cells: [0, 1, 2], damage: 3, qi: 3, objectiveProgressAfter: {} };
    before.tiles = Array.from({ length: 49 }, (_, i) => ({ kind: i % 4, chargeTier: 0 as const, locked: false }));
    const step = { ...f.step, before, effects: [match], cleared: [0, 1, 2], falls: [] };
    const play = f.playback.presenter.present({ kind: 'step', step });
    await flush();
    jest.runOnlyPendingTimers();
    await flush();
    await play.finished;
    expect(f.onSfx).toHaveBeenCalledTimes(1);
    expect(f.onSfx).toHaveBeenCalledWith('match_spirit');
    expect(f.setEffect.mock.calls.every(([effect]) => effect === null)).toBe(true);
});

it('continues board resolution if audio playback reports a synchronous failure', async () => {
    const f = fixture(true);
    f.onSfx.mockImplementation(() => { throw new Error('AUDIO_UNAVAILABLE'); });
    const before = f.board;
    before.tiles = Array.from({ length: 49 }, (_, i) => ({ kind: i % 4, chargeTier: 0 as const, locked: false }));
    const after = { ...before, score: 10 };
    const step = { ...f.step, before, after, effects: [
        { kind: 'skill' as const, cells: [0, 1, 2], damage: 3, qi: 3, objectiveProgressAfter: {} },
    ], cleared: [0, 1, 2], falls: [] };
    const play = f.playback.presenter.present({ kind: 'step', step });
    await flush();
    jest.runOnlyPendingTimers();
    await flush();
    await expect(play.finished).resolves.toBeUndefined();
    expect(f.setBoard).toHaveBeenCalledWith(after);
});

it('presents reward-free settlement after landing, with the final board between fade phases', async () => {
    const f = fixture(false);
    const landed = { ...f.board, score: 17 }, final = { ...landed, reshuffles: 1 };
    const step = { ...f.step, effects: [], falls: [], after: final, settlement: { before: landed, reason: 'cascade-cap' as const } };
    const play = f.playback.presenter.present({ kind: 'step', step });
    await flush();
    expect(f.setBoard.mock.calls.at(-1)![0]).toEqual(landed);
    expect(f.effect()).toMatchObject({ kind: 'settle', direction: 'out' });
    f.finish(); await flush();
    expect(f.setBoard.mock.calls.at(-1)![0]).toEqual(final);
    expect(f.effect()).toMatchObject({ kind: 'settle', direction: 'in' });
    f.finish(); await play.finished;
    expect(f.setEffect.mock.calls.at(-1)![0]).toBeNull();
});

it('settlement fades all cells over two 75ms phases and respects reduced motion', () => {
    for (const direction of ['out','in'] as const) {
        const effect = { id: 1, kind: 'settle' as const, direction };
        const visual = buildCellVisuals(effect, null)[0];
        expect(cellMotion(visual, 50, 0, 1).opacity).toBe(direction === 'out' ? 1 : 0);
        expect(cellMotion(visual, 50, 1, 1).opacity).toBe(direction === 'out' ? 0 : 1);
        expect(buildCellVisuals(effect, null, true)[0].settling).toBeUndefined();
    }
});

function engineFixture() {
    const board = new BoardEngine(getLevel(5)).snapshot();
    board.tiles = Array.from({ length: 49 }, (_, i) => ({
        kind: (i % 7 + 2 * Math.floor(i / 7)) % 4, chargeTier: 0, locked: false,
    }));
    board.level = { ...board.level, objectives: [{ id: 'main', type: 'Battle', target: 100000,
        enemy: { id: 'test', name: 'Test', artKey: 'beast' } }] };
    board.objectiveProgress = { main: 0 };
    return board;
}

it.each([
    [TileKind.Sword, 4], [TileKind.Sword, 5], [TileKind.Fire, 4], [TileKind.Fire, 5],
    [TileKind.Lightning, 4], [TileKind.Lightning, 5], [TileKind.SpiritOrb, 4], [TileKind.SpiritOrb, 5],
] as const)('plays matched %s/%s with its source lifecycle and engine rewards applied exactly once', async (kind, tier) => {
    const board = engineFixture();
    for (const index of [21, 22, 30]) board.tiles[index] = { kind, chargeTier: index === 21 ? tier : 0, locked: false };
    board.tiles[23] = { kind: (kind + 1) % 4, chargeTier: 0, locked: false };
    const engine = new BoardEngine(board.level, board);
    expect(engine.beginSwap(2, 4, 2, 3)).not.toBeNull();
    const step = engine.nextResolutionStep()!;
    expect(step.effects).toHaveLength(2);
    expect(step.effects[0]).toMatchObject({ kind: 'skill', cells: expect.arrayContaining([21]) });
    expect(step.effects[1].source).toBe(21);
    const f = fixture(false, step);
    const phase = f.playback.presenter.present({ kind: 'step', step });
    const match = f.effect();
    expect(match).toMatchObject({ retainedSources: [21] });
    expect(cellMotion(buildCellVisuals(match, null)[21], 50, 1, 1).opacity).toBe(1);
    expect(f.setBoard.mock.calls.at(-1)![0].swordQi).toBe(step.before.swordQi + step.effects[0].qi);
    f.begin(); f.finish(); await flush();
    const activation = f.effect();
    expect(activation).toMatchObject({ retainedSources: [21], effects: [step.effects[1]] });
    expect(buildCellVisuals(activation, match)[21]).toMatchObject({ hidden: false, clearing: false, splitAt: null });
    if (kind !== TileKind.Sword) expect(activation).toMatchObject({ sourceActivation: { source: 21, kind: step.effects[1].kind } });
    f.begin(); await jest.advanceTimersByTimeAsync(5000);
    expect(f.effect()).toBe(activation);
    expect(f.setBoard).not.toHaveBeenCalledWith(step.after);
    f.finish(); await flush();
    expect(f.effect().kind).toBe('fall');
    expect(f.setBoard).toHaveBeenLastCalledWith(step.after);
    expect(step.after.score - step.before.score).toBe(step.cleared.length * 10 * step.chain);
    expect(step.after.swordQi).toBe(step.before.swordQi + step.effects.reduce((sum, trace) => sum + trace.qi, 0));
    expect(step.after.objectiveProgress).toEqual(step.effects[1].objectiveProgressAfter);
    const writes = f.setBoard.mock.calls.length;
    f.playback.onMotionFinished(f.board.runId, activation.id); await flush();
    expect(f.setBoard).toHaveBeenCalledTimes(writes);
    f.begin(); f.finish(); await flush();
    await jest.advanceTimersByTimeAsync(300); await phase.finished;
    expect(f.effect()).toBeNull();
    f.playback.dispose();
});

it('retains sword → fire → lightning sources in queue order without resurrecting completed sources or duplicating capped qi', async () => {
    const board = engineFixture();
    board.swordQi = 100;
    board.tiles[21] = { kind: TileKind.Sword, chargeTier: 4, locked: false };
    board.tiles[24] = { kind: TileKind.Fire, chargeTier: 5, locked: false };
    board.tiles[31] = { kind: TileKind.Lightning, chargeTier: 5, locked: false };
    const engine = new BoardEngine(board.level, board);
    expect(engine.beginSkill('nhat-kiem', [{ x: 0, y: 3 }])).not.toBeNull();
    const step = engine.nextResolutionStep()!;
    expect(step.effects.map(trace => trace.kind)).toEqual(['slash', 'slash', 'fire', 'lightning']);
    const f = fixture(false, step);
    const phase = f.playback.presenter.present({ kind: 'step', step });
    const retained = [[21, 24, 31], [21, 24, 31], [24, 31], [31]];
    let previous: BoardVisualEffect | null = null, qi = step.before.swordQi;
    for (let index = 0; index < step.effects.length; index++) {
        const effect = f.effect(), trace = step.effects[index];
        expect(effect).toMatchObject({ retainedSources: retained[index], effects: [trace] });
        const visuals = buildCellVisuals(effect, previous);
        for (const source of retained[index]) {
            expect(cellMotion(visuals[source], 50, 0, 1).opacity).toBe(1);
            const active = effect.kind === 'clear' && effect.sourceActivation?.source === source;
            expect(cellMotion(visuals[source], 50, 1, 1).opacity).toBe(active ? 0 : 1);
        }
        if (index >= 2) expect(visuals[21].hidden).toBe(true);
        if (index >= 3) expect(visuals[24].hidden).toBe(true);
        qi += trace.qi;
        expect(f.setBoard.mock.calls.at(-1)![0]).toMatchObject({ swordQi: qi, objectiveProgress: trace.objectiveProgressAfter });
        f.begin(); f.finish(); await flush();
        previous = effect;
    }
    expect(step.after.swordQi).toBe(100);
    expect(qi).toBe(step.after.swordQi);
    expect(step.after.score - step.before.score).toBe(step.cleared.length * 10);
    expect(f.setBoard).toHaveBeenLastCalledWith(step.after);
    expect(f.effect().kind).toBe('fall');
    f.begin(); f.finish(); await flush();
    await jest.advanceTimersByTimeAsync(300); await phase.finished;
    f.playback.dispose();
});

it('starts a shared Hỏa Liên source windup only in its queued activation and waits for the explosion after hiding it', async () => {
    const board = engineFixture();
    board.swordQi = 100;
    board.loadout.skills = ['hoa-lien'];
    board.tiles[16] = { kind: TileKind.Fire, chargeTier: 4, locked: false };
    const engine = new BoardEngine(board.level, board);
    expect(engine.beginSkill('hoa-lien', [{ x: 3, y: 3 }])).not.toBeNull();
    const step = engine.nextResolutionStep()!;
    expect(step.effects.map(trace => [trace.kind, trace.source])).toEqual([['fire', 16], ['fire', 16]]);
    const f = fixture(false, step);
    const phase = f.playback.presenter.present({ kind: 'step', step });
    const skill = f.effect();
    expect(skill).toMatchObject({ sourceActivation: undefined });
    f.begin(); f.finish(); await flush();
    const effect = f.effect() as Extract<BoardVisualEffect, { kind: 'clear' }>;
    expect(effect).toMatchObject({ retainedSources: [16], sourceActivation: { kind: 'fire', source: 16 } });
    const visual = buildCellVisuals(effect, skill)[16], duration = boardClearDurationMs(effect.effects, effect.sourceActivation);
    expect(cellMotion(visual, 50, 219 / duration, 1).opacity).toBe(1);
    expect(cellMotion(visual, 50, 220 / duration, 1).opacity).toBe(0);
    f.begin(); await flush();
    expect(f.setBoard).not.toHaveBeenCalledWith(step.after);
    f.begin(); f.finish(); await flush();
    expect(f.setBoard).toHaveBeenLastCalledWith(step.after);
    f.begin(); f.finish(); await flush();
    await jest.advanceTimersByTimeAsync(300); await phase.finished;
    f.playback.dispose();
});

it('waits for real completions, ignores stale callbacks and rests 300ms after landing', async () => {
    const f = fixture();
    const phase = f.playback.presenter.present({ kind: 'step', step: f.step });
    let started = false, finished = false;
    void phase.started.then(() => { started = true; });
    void phase.finished.then(() => { finished = true; });
    expect(f.effect().kind).toBe('clear');
    expect(f.setBoard.mock.calls.at(-1)![0].swordQi).toBe(10);
    f.playback.onMotionStarted('other-run', f.effect().id);
    f.playback.onMotionFinished(f.board.runId, 999);
    await flush(); expect(started).toBe(false);
    f.begin(); await flush(); expect(started).toBe(true);
    await jest.advanceTimersByTimeAsync(5000);
    expect(f.effect().kind).toBe('clear');
    expect(finished).toBe(false);
    const oldId = f.effect().id;
    f.finish(); await flush();
    expect(f.effect().kind).toBe('clear');
    expect(f.setBoard.mock.calls.at(-1)![0].swordQi).toBe(20);
    f.playback.onMotionFinished(f.board.runId, oldId);
    await flush(); expect(f.effect().kind).toBe('clear');
    f.begin(); f.finish(); await flush();
    expect(f.effect().kind).toBe('fall');
    f.begin();
    await jest.advanceTimersByTimeAsync(5000);
    expect(finished).toBe(false);
    // No timer can finish a fall: only its UI completion starts the rest.
    f.finish(); await flush();
    await jest.advanceTimersByTimeAsync(299);
    expect(finished).toBe(false);
    expect(f.effect().kind).toBe('fall');
    await jest.advanceTimersByTimeAsync(1);
    await phase.finished;
    expect(finished).toBe(true);
    expect(f.effect()).toBeNull();
    f.playback.dispose();
});

it.each([4, 5] as const)('waits for all tier %s fragments to finish before starting board gravity', async tier => {
    const f = fixture();
    f.step.effects = [{ kind: tier === 5 ? 'cross' : 'slash', swordChargeTier: tier,
        source: 0, cells: [0, 1], qi: 0, damage: 0 }];
    const phase = f.playback.presenter.present({ kind: 'step', step: f.step });
    f.begin(); await flush();
    expect(f.effect()).toMatchObject({ kind: 'clear', effects: [expect.objectContaining({ swordChargeTier: tier })] });
    await jest.advanceTimersByTimeAsync(tier === 5 ? 1079 : 1019);
    expect(f.effect().kind).toBe('clear');
    expect(f.setBoard).not.toHaveBeenCalledWith(f.step.after);
    f.finish(); await flush();
    expect(f.setBoard).toHaveBeenLastCalledWith(f.step.after);
    expect(f.effect().kind).toBe('fall');
    f.begin(); f.finish(); await flush();
    await jest.advanceTimersByTimeAsync(300);
    await phase.finished;
    f.playback.dispose();
});

it.each([4, 5] as const)('defers tier %s orb bonus/condensation until arrival, retaining earlier base qi', async tier => {
    const f = fixture();
    f.board.tiles[0] = { kind: TileKind.SpiritOrb, chargeTier: tier, locked: false };
    f.step.effects = [{ kind: 'skill', cells: [0], qi: 12, damage: 0 },
        { kind: 'spirit', spiritChargeTier: tier, source: 0, cells: [], qi: 24, damage: 0 }];
    f.step.after = { ...f.board, swordQi: 36, condensed: tier === 5 };
    const phase = f.playback.presenter.present({ kind: 'step', step: f.step });
    expect(f.setBoard.mock.calls.at(-1)![0].swordQi).toBe(12);
    f.begin(); f.finish(); await flush();
    expect(f.effect()).toMatchObject({ effects: [expect.objectContaining({ spiritChargeTier: tier })] });
    f.begin(); await jest.advanceTimersByTimeAsync(5000);
    expect(f.setBoard.mock.calls.at(-1)![0]).toMatchObject({ swordQi: 12, condensed: false });
    const id = f.effect().id;
    f.finish(); await flush();
    expect(f.setBoard).toHaveBeenLastCalledWith(f.step.after);
    expect(f.effect().kind).toBe('fall');
    const writes = f.setBoard.mock.calls.length;
    f.playback.onMotionFinished(f.board.runId, id); await flush();
    expect(f.setBoard).toHaveBeenCalledTimes(writes);
    f.begin(); f.finish(); await flush();
    await jest.advanceTimersByTimeAsync(300); await phase.finished;
    f.playback.dispose();
});

it.each(['abort', 'reduce', 'cap'] as const)('handles %s during an orb flight without duplicate qi or a hung phase', async mode => {
    const f = fixture();
    f.board.tiles[0] = { kind: TileKind.SpiritOrb, chargeTier: 5, locked: false };
    if (mode === 'cap') f.board.swordQi = 100;
    f.step.effects = [{ kind: 'spirit', spiritChargeTier: 5, source: 0, cells: [], qi: mode === 'cap' ? 0 : 24, damage: 0 }];
    f.step.after = { ...f.board, swordQi: mode === 'cap' ? 100 : 24, condensed: true };
    f.step.falls = [];
    const phase = f.playback.presenter.present({ kind: 'step', step: f.step });
    f.begin(); await flush();
    expect(f.setBoard).toHaveBeenLastCalledWith(f.board);
    if (mode === 'abort') {
        const id = f.effect().id;
        f.controller.abort();
        await expect(phase.finished).rejects.toBeInstanceOf(BoardActionCancelled);
        f.playback.onMotionFinished(f.board.runId, id); await flush();
        expect(f.setBoard).toHaveBeenLastCalledWith(f.board);
    } else {
        if (mode === 'reduce') f.playback.setReduceMotion(true);
        else f.finish();
        await phase.finished;
        expect(f.setBoard).toHaveBeenLastCalledWith(f.step.after);
        expect(f.effect()).toBeNull();
    }
    expect(jest.getTimerCount()).toBe(0);
    f.playback.dispose();
});

it.each(['clear', 'fall', 'rest'] as const)('cancels during %s without hanging or applying late callbacks', async position => {
    const f = fixture();
    const phase = f.playback.presenter.present({ kind: 'step', step: f.step });
    f.begin();
    if (position !== 'clear') {
        f.finish(); await flush(); f.begin(); f.finish(); await flush(); f.begin();
        if (position === 'rest') { f.finish(); await flush(); }
    }
    const id = f.effect().id;
    f.controller.abort();
    await expect(phase.finished).rejects.toBeInstanceOf(BoardActionCancelled);
    const writes = f.setBoard.mock.calls.length;
    f.playback.onMotionFinished(f.board.runId, id);
    await jest.runAllTimersAsync();
    expect(f.setBoard).toHaveBeenCalledTimes(writes);
    expect(jest.getTimerCount()).toBe(0);
    f.playback.dispose();
});

it('skips animations and rest in reduced motion while yielding between waves', async () => {
    const f = fixture(true);
    const phase = f.playback.presenter.present({ kind: 'step', step: f.step });
    expect(f.setBoard).toHaveBeenLastCalledWith(f.step.after);
    expect(f.setEffect).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(0);
    await phase.started; await phase.finished;
    expect(jest.getTimerCount()).toBe(0);
    expect(f.setEffect).toHaveBeenLastCalledWith(null);
    f.playback.dispose();
});

it.each([false, true])('can enable reduced motion during an animation or its rest (rest=%s)', async rest => {
    const f = fixture();
    const phase = f.playback.presenter.present({ kind: 'step', step: f.step });
    if (rest) {
        f.begin(); f.finish(); await flush(); f.begin(); f.finish(); await flush(); f.begin(); f.finish(); await flush();
        expect(jest.getTimerCount()).toBe(1);
    }
    f.playback.setReduceMotion(true);
    await phase.finished;
    expect(f.setBoard).toHaveBeenLastCalledWith(f.step.after);
    expect(jest.getTimerCount()).toBe(0);
    f.playback.dispose();
});

it('prepares the next wave while the current fire trace is still visible', async () => {
    const f = fixture();
    const next = jest.fn().mockReturnValueOnce(f.step).mockReturnValueOnce({ ...f.step, chain: 2 }).mockReturnValue(null);
    const engine = { nextResolutionStep: next, snapshot: () => f.step.after } as unknown as BoardEngine;
    const commit = jest.fn(async () => 'saved');
    const result = runBoardAction(engine, { kind: 'swap', swappedBoard: f.board,
        swap: { x1: 0, y1: 0, x2: 1, y2: 0 } }, f.playback.presenter, commit);
    expect(next).not.toHaveBeenCalled();
    f.begin(); await flush();
    expect(next).toHaveBeenCalledTimes(1);
    f.finish(); await flush();
    expect(f.effect().kind).toBe('clear');
    f.begin(); await flush();
    expect(next).toHaveBeenCalledTimes(2);
    expect(f.effect().kind).toBe('clear');
    expect(commit).not.toHaveBeenCalled();
    f.controller.abort();
    await expect(result).rejects.toBeInstanceOf(BoardActionCancelled);
    f.playback.dispose();
});
