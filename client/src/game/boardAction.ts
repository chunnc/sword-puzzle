import type { BoardEngine } from './BoardEngine';
import type { BoardActionPhase, BoardActionPresenter, BoardActionStart, BoardPhasePlayback } from './types';

export class BoardActionCancelled extends Error {
    constructor() { super('BOARD_ACTION_CANCELLED'); }
}

// Only one future wave can exist. UI playback owns its clocks; the engine never
// waits for storage or a request before starting a visible phase.
export async function runBoardAction<T>(engine: BoardEngine, start: BoardActionStart,
    presenter: BoardActionPresenter, commit: () => Promise<T>): Promise<T> {
    const check = () => { if (presenter.signal.aborted) throw new BoardActionCancelled(); };
    const present = (phase: BoardActionPhase): BoardPhasePlayback => {
        check();
        const playback = presenter.present(phase);
        // Cancellation can reject completion while we are awaiting start.
        void playback.finished.catch(() => undefined);
        return playback;
    };
    let playing = present({ kind: 'start', action: start });
    for (;;) {
        await playing.started;
        check();
        const next = engine.nextResolutionStep();
        check();
        if (next) {
            await playing.finished;
            playing = present({ kind: 'step', step: next });
            continue;
        }
        // Keep the serialized store transaction alive even if the screen leaves
        // after the final durable write has begun.
        const committed = commit();
        void committed.catch(() => undefined);
        try {
            await playing.finished;
            const settled = present({ kind: 'settled', board: engine.snapshot() });
            await settled.started;
            await settled.finished;
        } catch (error) {
            await committed;
            throw error;
        }
        return await committed;
    }
}
