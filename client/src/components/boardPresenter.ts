import { BoardActionCancelled } from '../game/boardAction';
import type { BoardActionPhase, BoardActionPresenter, BoardPhasePlayback, BoardSnapshot } from '../game/types';
import { BOARD_CHAIN_DELAY_MS, type BoardVisualEffect } from './boardVisuals';

function deferred() {
    let resolve!: () => void, reject!: (error: unknown) => void;
    const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    void promise.catch(() => undefined);
    return { promise, resolve, reject };
}

export function createBoardPresenter(options: {
    runId: string;
    signal: AbortSignal;
    reduceMotion: boolean;
    qiCap: number;
    nextId: () => number;
    setBoard: (board: BoardSnapshot) => void;
    setEffect: (effect: BoardVisualEffect | null) => void;
    onStart: () => void;
}) {
    const { signal } = options;
    let reduceMotion = options.reduceMotion;
    let finishDelay: (() => void) | null = null;
    let active: { id: number; started: ReturnType<typeof deferred>; finished: ReturnType<typeof deferred> } | null = null;
    const check = () => { if (signal.aborted) throw new BoardActionCancelled(); };
    const wait = (ms: number) => new Promise<void>((resolve, reject) => {
        check();
        const abort = () => {
            clearTimeout(timer);
            finishDelay = null;
            signal.removeEventListener('abort', abort);
            reject(new BoardActionCancelled());
        };
        const finish = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', abort);
            finishDelay = null;
            resolve();
        };
        const timer = setTimeout(finish, ms);
        finishDelay = finish;
        signal.addEventListener('abort', abort, { once: true });
    });
    const abort = () => {
        active?.started.reject(new BoardActionCancelled());
        active?.finished.reject(new BoardActionCancelled());
        active = null;
    };
    signal.addEventListener('abort', abort, { once: true });
    const animate = (effect: BoardVisualEffect): BoardPhasePlayback => {
        check();
        const pending = { id: effect.id, started: deferred(), finished: deferred() };
        active = pending;
        options.setEffect(effect);
        return { started: pending.started.promise, finished: pending.finished.promise };
    };
    const present = (phase: BoardActionPhase): BoardPhasePlayback => {
        const started = deferred();
        const play = async () => {
            check();
            let began = false;
            const motion = async (effect: BoardVisualEffect) => {
                const playback = animate(effect);
                await playback.started;
                if (!began) { began = true; started.resolve(); }
                await playback.finished;
                check();
            };
            if (phase.kind === 'start') {
                options.onStart();
                if (!reduceMotion && phase.action.swap) {
                    const { x1, y1, x2, y2 } = phase.action.swap;
                    await motion({ id: options.nextId(), kind: 'swap', first: { x: x1, y: y1 }, second: { x: x2, y: y2 } });
                }
                check();
                options.setBoard(phase.action.swappedBoard);
                options.setEffect(null);
            } else if (phase.kind === 'step') {
                const { step } = phase;
                if (!reduceMotion) {
                    const cleared = new Set<number>();
                    let visual = step.before;
                    options.setBoard(visual);
                    for (const trace of step.effects) {
                        if (reduceMotion) break;
                        trace.cells.forEach(i => { if (step.cleared.includes(i)) cleared.add(i); });
                        if (trace.source !== undefined && step.cleared.includes(trace.source)) cleared.add(trace.source);
                        visual = { ...visual,
                            swordQi: Math.min(options.qiCap, visual.swordQi + trace.qi),
                            objectiveProgress: trace.objectiveProgressAfter ?? visual.objectiveProgress,
                            condensed: visual.condensed || trace.kind === 'spirit' && trace.source !== undefined && step.before.tiles[trace.source]?.chargeTier === 5,
                        };
                        options.setBoard(visual);
                        await motion({ id: options.nextId(), kind: 'clear', cleared: [...cleared], changed: step.changed, effects: [trace] });
                    }
                    options.setBoard(step.after);
                    if (step.falls.length && !reduceMotion) {
                        await motion({ id: options.nextId(), kind: 'fall', falls: step.falls });
                        // This delay starts only after the UI confirms the landing.
                        if (!reduceMotion) await wait(BOARD_CHAIN_DELAY_MS);
                        check();
                    }
                } else options.setBoard(step.after);
            } else options.setBoard(phase.board);
            if (!began) {
                // Yield between invisible/reduced-motion waves as well.
                if (phase.kind !== 'settled') await wait(0);
                check();
                started.resolve();
            }
            options.setEffect(null);
        };
        const finished = play().catch(error => { started.reject(error); throw error; });
        void finished.catch(() => undefined);
        return { started: started.promise, finished };
    };
    const presenter: BoardActionPresenter = { signal, present };
    return {
        presenter,
        onMotionStarted(runId: string, id: number) {
            if (!signal.aborted && runId === options.runId && active?.id === id) active.started.resolve();
        },
        onMotionFinished(runId: string, id: number) {
            if (!signal.aborted && runId === options.runId && active?.id === id) {
                active.started.resolve();
                active.finished.resolve();
                active = null;
            }
        },
        rejectSwap(first: { x: number; y: number }, second: { x: number; y: number }) {
            return animate({ id: options.nextId(), kind: 'reject', first, second }).finished;
        },
        setReduceMotion(value: boolean) {
            reduceMotion = value;
            if (value) {
                active?.started.resolve();
                active?.finished.resolve();
                active = null;
                finishDelay?.();
            }
        },
        dispose() { signal.removeEventListener('abort', abort); },
    };
}
