import { BoardEngine } from '../BoardEngine';
import { BoardActionCancelled, runBoardAction } from '../boardAction';
import { getLevel } from '../levels';
import type { BoardActionPhase, BoardActionPresenter, BoardResolutionStep } from '../types';

function deferred<T = void>() {
    let resolve!: (value: T) => void, reject!: (error: unknown) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    void promise.catch(() => undefined);
    return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function fixture() {
    const board = new BoardEngine(getLevel(5)).snapshot();
    const steps = [1, 2].map(chain => ({ before: board, after: board, effects: [], falls: [], cleared: [], changed: [], damage: 0, chain } satisfies BoardResolutionStep));
    const next = jest.fn().mockReturnValueOnce(steps[0]).mockReturnValueOnce(steps[1]).mockReturnValue(null);
    const engine = { nextResolutionStep: next, snapshot: () => board } as unknown as BoardEngine;
    const controller = new AbortController();
    const phases: { phase: BoardActionPhase; started: ReturnType<typeof deferred<void>>; finished: ReturnType<typeof deferred<void>> }[] = [];
    const presenter: BoardActionPresenter = {
        signal: controller.signal,
        present(phase) {
            const started = deferred(), finished = deferred();
            phases.push({ phase, started, finished });
            controller.signal.addEventListener('abort', () => {
                started.reject(new BoardActionCancelled()); finished.reject(new BoardActionCancelled());
            }, { once: true });
            if (phase.kind === 'settled') { started.resolve(); finished.resolve(); }
            return { started: started.promise, finished: finished.promise };
        },
    };
    const committed = deferred<string>();
    const commit = jest.fn(() => committed.promise);
    const result = runBoardAction(engine, { kind: 'swap', swappedBoard: board }, presenter, commit);
    void result.catch(() => undefined);
    return { next, phases, controller, commit, committed, result };
}

it('computes exactly one future wave after UI start and commits during the last playback', async () => {
    const f = fixture();
    expect(f.phases[0].phase.kind).toBe('start');
    expect(f.next).not.toHaveBeenCalled();
    f.phases[0].started.resolve(); await flush();
    expect(f.next).toHaveBeenCalledTimes(1);
    expect(f.phases).toHaveLength(1);
    f.phases[0].finished.resolve(); await flush();
    expect(f.phases[1].phase.kind).toBe('step');
    expect(f.next).toHaveBeenCalledTimes(1);
    f.phases[1].started.resolve(); await flush();
    expect(f.next).toHaveBeenCalledTimes(2);
    expect(f.commit).not.toHaveBeenCalled();
    f.phases[1].finished.resolve(); await flush();
    f.phases[2].started.resolve(); await flush();
    expect(f.next).toHaveBeenCalledTimes(3);
    expect(f.commit).toHaveBeenCalledTimes(1);
    let done = false;
    void f.result.then(() => { done = true; });
    f.phases[2].finished.resolve(); await flush();
    expect(f.phases[3].phase.kind).toBe('settled');
    expect(done).toBe(false);
    f.committed.resolve('saved');
    await expect(f.result).resolves.toBe('saved');
});

it('cancels before finalization without storing the partially resolved board', async () => {
    const f = fixture();
    f.phases[0].started.resolve(); await flush();
    f.controller.abort();
    await expect(f.result).rejects.toBeInstanceOf(BoardActionCancelled);
    expect(f.next).toHaveBeenCalledTimes(1);
    expect(f.commit).not.toHaveBeenCalled();
});

it('can cancel before the first UI acknowledgement without calculating a wave', async () => {
    const f = fixture();
    f.controller.abort();
    await expect(f.result).rejects.toBeInstanceOf(BoardActionCancelled);
    expect(f.next).not.toHaveBeenCalled();
    expect(f.commit).not.toHaveBeenCalled();
});

it('awaits a final write already in progress when presentation is cancelled', async () => {
    const f = fixture();
    for (let i = 0; i < 2; i++) {
        f.phases[i].started.resolve(); await flush();
        f.phases[i].finished.resolve(); await flush();
    }
    f.phases[2].started.resolve(); await flush();
    expect(f.commit).toHaveBeenCalledTimes(1);
    f.controller.abort();
    let done = false;
    void f.result.catch(() => { done = true; });
    await flush();
    expect(done).toBe(false);
    f.committed.resolve('saved');
    await expect(f.result).rejects.toBeInstanceOf(BoardActionCancelled);
    expect(f.phases).toHaveLength(3);
});
