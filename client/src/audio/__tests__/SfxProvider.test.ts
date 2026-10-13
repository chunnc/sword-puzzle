import React, { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import { SfxProvider, useSfx, type SfxId } from '../SfxProvider';

const mockPlayers: { play: jest.Mock; remove: jest.Mock; unsubscribe: jest.Mock }[] = [];
jest.mock('expo-audio', () => ({
  preload: jest.fn(() => Promise.resolve()),
  createAudioPlayer: jest.fn(() => {
    const player = { seekTo: jest.fn(() => Promise.resolve()), play: jest.fn(), remove: jest.fn(), unsubscribe: jest.fn(),
      addListener: () => ({ remove: player.unsubscribe }) };
    mockPlayers.push(player); return player;
  }),
}));

let playLater: (id: SfxId) => void;
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
