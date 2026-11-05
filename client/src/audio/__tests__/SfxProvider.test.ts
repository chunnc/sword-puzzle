import React, { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import { SfxProvider, useSfx, type SfxId } from '../SfxProvider';
import { createBoardPresenter } from '../../components/boardPresenter';
import { gameplaySnapshot } from '../../components/__tests__/fixtures/gameplay';
import { getLevel } from '../../game/levels';
import type { BoardVisualEffect } from '../../components/boardVisuals';
import type { BoardResolutionStep } from '../../game/types';

const mockPlayers: { play: jest.Mock; pause: jest.Mock; remove: jest.Mock; unsubscribe: jest.Mock }[] = [];
jest.mock('expo-audio', () => ({
  preload: jest.fn(() => Promise.resolve()),
  createAudioPlayer: jest.fn(() => {
    const player = { seekTo: jest.fn(() => Promise.resolve()), play: jest.fn(), pause: jest.fn(), remove: jest.fn(), unsubscribe: jest.fn(),
      addListener: () => ({ remove: player.unsubscribe }) };
    mockPlayers.push(player); return player;
  }),
}));

let playLater: (id: SfxId) => void | (() => void);
function Consumer() {
  const play = useSfx(); playLater = play;
  useEffect(() => { play('star_award'); play('star_award'); play('star_award'); play('sword_slash'); play('sword_slash'); }, [play]);
  return null;
}

let renderer: ReactTestRenderer;
let onChange: (state: AppStateStatus) => void;
beforeEach(() => {
  jest.clearAllMocks(); mockPlayers.length = 0;
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    onChange = listener; return { remove: jest.fn() };
  });
});
afterEach(() => { act(() => renderer?.unmount()); jest.restoreAllMocks(); });

it('is ready for child mount awards and disposes full overlapping voices on unmount', async () => {
  await act(async () => { renderer = create(React.createElement(SfxProvider, null, React.createElement(Consumer))); });
  expect(mockPlayers).toHaveLength(5);
  expect(mockPlayers.every(player => player.play.mock.calls.length === 1)).toBe(true);
  act(() => { renderer.unmount(); });
  act(() => { playLater('star_award'); });
  expect(mockPlayers).toHaveLength(5);
  expect(mockPlayers.every(player => player.remove.mock.calls.length === 1 && player.unsubscribe.mock.calls.length === 1)).toBe(true);
});

it('stops existing voices in the background and starts fresh voices on the next foreground cue', async () => {
  await act(async () => { renderer = create(React.createElement(SfxProvider, null, React.createElement(Consumer))); });
  act(() => { AppState.currentState = 'background'; onChange('background'); playLater('star_award'); });
  expect(mockPlayers).toHaveLength(5);
  expect(mockPlayers.every(player => player.remove.mock.calls.length === 1)).toBe(true);
  await act(async () => { AppState.currentState = 'active'; onChange('active'); });
  expect(mockPlayers).toHaveLength(5);
  await act(async () => { playLater('star_award'); });
  expect(mockPlayers).toHaveLength(6); expect(mockPlayers[5].play).toHaveBeenCalledTimes(1);
});

it('passes the real stop handle to the presenter and stops only its lightning voice', async () => {
  await act(async () => { renderer = create(React.createElement(SfxProvider, null, React.createElement(Consumer))); });
  const otherStop = playLater('lightning_chain');
  const board = gameplaySnapshot(getLevel(5));
  let effect: BoardVisualEffect | null = null;
  const controller = new AbortController();
  const presenter = createBoardPresenter({ runId: board.runId, signal: controller.signal, reduceMotion: false,
    qiCap: 100, nextId: () => 1, setBoard: () => {}, setEffect: value => { effect = value; },
    onStart: () => {}, onSfx: playLater });
  const step: BoardResolutionStep = { before: board, after: board, chain: 1, damage: 0,
    cleared: [0], changed: [], falls: [], effects: [{ kind: 'lightning', origin: 'charged', source: 0, cells: [], damage: 0, qi: 0 }] };
  const phase = presenter.presenter.present({ kind: 'step', step });
  presenter.onMotionStarted(board.runId, effect!.id);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  const other = mockPlayers[5], owned = mockPlayers[6];
  expect(owned.play).toHaveBeenCalledTimes(1);
  presenter.onMotionFinished(board.runId, effect!.id);
  await phase.finished;
  expect(owned.pause).toHaveBeenCalledTimes(1);
  expect(other.pause).not.toHaveBeenCalled();
  otherStop?.();
  presenter.dispose();
});
