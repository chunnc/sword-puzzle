import { createBoardPresenter } from '../boardPresenter';
import { BoardActionCancelled, runBoardAction } from '../../game/boardAction';
import { BoardEngine } from '../../game/BoardEngine';
import { getLevel } from '../../game/levels';
import type { BoardResolutionStep } from '../../game/types';
import type { BoardVisualEffect } from '../boardVisuals';

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function fixture(reduceMotion = false) {
    const board = new BoardEngine(getLevel(5)).snapshot();
    const step: BoardResolutionStep = {
        before: board, after: { ...board, swordQi: 20 }, chain: 1, damage: 1,
        cleared: [0, 1], changed: [], falls: [{ index: 0, fromY: 7 }],
        effects: [{ kind: 'fire', source: 0, cells: [0], qi: 10, damage: 1 },
            { kind: 'lightning', source: 1, cells: [1], qi: 10, damage: 0 }],
    };
    const controller = new AbortController();
    const setBoard = jest.fn(), setEffect = jest.fn();
    let id = 0;
    const playback = createBoardPresenter({ runId: board.runId, signal: controller.signal,
        reduceMotion, qiCap: 100, nextId: () => ++id, setBoard, setEffect, onStart: jest.fn() });
    const effect = () => setEffect.mock.calls.at(-1)![0] as BoardVisualEffect;
    const begin = () => playback.onMotionStarted(board.runId, effect().id);
    const finish = () => playback.onMotionFinished(board.runId, effect().id);
    return { board, step, controller, playback, setBoard, setEffect, effect, begin, finish };
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

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
