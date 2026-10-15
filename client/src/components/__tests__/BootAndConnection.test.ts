import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Modal, Pressable, View } from 'react-native';
import BootScreen from '../../../app/index';
import { ConnectionDialog } from '../ConnectionDialog';
import { BoardEngine } from '../../game/BoardEngine';
import { getLevel } from '../../game/levels';
import { emptySave } from '../../game/save';
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname,
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback])
}));
jest.mock('../../state/gameStore', () => ({
  useGameStore: Object.assign((selector: (state: typeof mockState) => unknown) => selector(mockState), { getState: () => mockState })
}));
jest.mock('../Art', () => {
  const React = require('react');
  const Native = require('react-native');
  return { ScreenFrame: Native.View, ArtPanel: Native.View, GameButton: ({ title, onPress, disabled }: any) => React.createElement(Native.Pressable, { accessibilityLabel: title, onPress, disabled }) };
});

let mockPathname = '/map';
const mockRouter = {
  replace: jest.fn(),
  push: jest.fn()
};
const mockState = {
  save: emptySave(),
  initialized: false,
  bootstrapLoaded: true,
  foreground: true,
  online: false,
  connectionFailed: false,
  checkingConnection: false,
  authRequired: false,
  bootError: '',
  notice: '',
  initialize: jest.fn(async () => '/map'),
  checkConnection: jest.fn(async () => undefined),
  syncProgress: jest.fn(async () => undefined)
};
let renderer: ReactTestRenderer;
afterEach(() => {
  act(() => renderer?.unmount());
});
beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = '/map';
  Object.assign(mockState, {
    save: emptySave(),
    initialized: false,
    bootstrapLoaded: true,
    foreground: true,
    online: false,
    connectionFailed: false,
    checkingConnection: false,
    authRequired: false,
    bootError: '',
    notice: ''
  });
});
it('keeps the welcome scene after initialization until Play is pressed', async () => {
  await act(async () => {
    renderer = create(React.createElement(BootScreen));
  });
  expect(mockState.initialize).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).not.toHaveBeenCalled();
  mockState.initialized = true;
  mockState.online = true;
  act(() => renderer.update(React.createElement(BootScreen)));
  expect(mockRouter.replace).not.toHaveBeenCalled();
  const play = renderer.root.findAll(node => node.props.accessibilityLabel === 'CHƠI' && typeof node.props.onPress === 'function')[0];
  act(() => { play.props.onPress(); play.props.onPress(); });
  expect(mockRouter.replace).toHaveBeenCalledWith('/map');
  expect(mockRouter.replace).toHaveBeenCalledTimes(1);
});
it.each(['unfinished', 'won', 'lost'])('waits for Play before opening the map with a saved %s run', async (status) => {
  const level = getLevel(1);
  const active = new BoardEngine(level).snapshot();
  if (status === 'lost') active.moves = 0;
  if (status === 'won') {
    active.objectiveProgress = Object.fromEntries(level.objectives.map(goal => [goal.id, goal.target]));
    mockState.save.lastWin = {
      runId: active.runId, levelId: 1, stars: 3, bestStars: 3,
      expGained: 30, totalExp: 30, coinsGained: 100, realmBefore: 0, realmAfter: 0,
    };
  }
  mockState.save.active = active;
  await act(async () => { renderer = create(React.createElement(BootScreen)); });
  expect(mockRouter.replace).not.toHaveBeenCalled();

  mockState.initialized = true;
  mockState.online = true;
  act(() => renderer.update(React.createElement(BootScreen)));
  expect(mockRouter.replace).not.toHaveBeenCalled();
  act(() => renderer.root.findAll(node => node.props.accessibilityLabel === 'CHƠI' && typeof node.props.onPress === 'function')[0].props.onPress());
  expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).toHaveBeenCalledWith('/map');

  mockState.save.active = new BoardEngine(level).snapshot();
  act(() => renderer.update(React.createElement(BootScreen)));
  expect(mockRouter.replace).toHaveBeenCalledTimes(1);
});
it('keeps boot failures reviewable and allows retry', async () => {
  mockState.bootError = 'Không thể kết nối';
  mockState.initialize.mockRejectedValueOnce(new Error('network'));
  await act(async () => {
    renderer = create(React.createElement(BootScreen));
  });
  const retry = renderer.root.findAll(node => node.props.accessibilityLabel === 'THỬ LẠI' && typeof node.props.onPress === 'function')[0];
  await act(async () => retry.props.onPress());
  expect(mockState.initialize).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).not.toHaveBeenCalled();
});
it('opens one account popup with welcome context and keeps Play locked before readiness', async () => {
  await act(async () => { renderer = create(React.createElement(BootScreen)); });
  const play = renderer.root.findAll(node => node.props.accessibilityLabel === 'CHƠI' && typeof node.props.onPress === 'function')[0];
  expect(play.props.disabled).toBe(true);
  act(() => play.props.onPress());
  expect(mockRouter.replace).not.toHaveBeenCalled();
  const save = renderer.root.findAll(node => node.props.accessibilityLabel === 'LƯU TIẾN TRÌNH' && typeof node.props.onPress === 'function')[0];
  act(() => { save.props.onPress(); save.props.onPress(); });
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/account', params: { source: 'welcome' } });
});
it('does not navigate when readiness or foreground changes without Play', async () => {
  mockState.initialized = true; mockState.online = true;
  await act(async () => { renderer = create(React.createElement(BootScreen)); });
  mockState.foreground = false;
  act(() => renderer.update(React.createElement(BootScreen)));
  mockState.foreground = true;
  act(() => renderer.update(React.createElement(BootScreen)));
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(mockState.initialize).not.toHaveBeenCalled();
});
it('defers startup until foreground and resumes an interrupted initial boot', async () => {
  mockState.foreground = false;
  await act(async () => { renderer = create(React.createElement(BootScreen)); });
  expect(mockState.initialize).not.toHaveBeenCalled();
  mockState.foreground = true;
  await act(async () => renderer.update(React.createElement(BootScreen)));
  expect(mockState.initialize).toHaveBeenCalledTimes(1);
});
it('network modal ignores Back and only hides after connection recovery succeeds', async () => {
  mockState.connectionFailed = true;
  act(() => {
    renderer = create(React.createElement(ConnectionDialog));
  });
  const modal = () => renderer.root.findByType(Modal);
  expect(modal().props.visible).toBe(true);
  act(() => modal().props.onRequestClose());
  expect(modal().props.visible).toBe(true);
  await act(async () => renderer.root.findAll(node => node.props.accessibilityLabel === 'THỬ LẠI' && typeof node.props.onPress === 'function')[0].props.onPress());
  expect(mockState.checkConnection).toHaveBeenCalledTimes(1);
  expect(modal().props.visible).toBe(true);
  mockState.online = true;
  act(() => renderer.update(React.createElement(ConnectionDialog)));
  expect(modal().props.visible).toBe(false);
});
it('offers retry for an uncertain purchase while health is good', async () => {
  mockState.online = true;
  mockState.initialized = true;
  mockState.notice = 'Timeout';
  mockState.save.pending = {
    contentVersion: 8,
    operation: {
      id: 'purchase_pending',
      kind: 'purchase',
      category: 'skill',
      itemId: 'ngu-kiem'
    }
  };
  act(() => {
    renderer = create(React.createElement(ConnectionDialog));
  });
  expect(renderer.root.findByType(Modal).props.visible).toBe(true);
  await act(async () => renderer.root.findAll(node => node.props.accessibilityLabel === 'THỬ LẠI' && typeof node.props.onPress === 'function')[0].props.onPress());
  expect(mockState.syncProgress).toHaveBeenCalledTimes(1);
  expect(mockState.checkConnection).not.toHaveBeenCalled();
});

it('allows reauthentication without the modal blocking account inputs', async () => {
  mockState.online = true; mockState.authRequired = true;
  act(() => { renderer = create(React.createElement(ConnectionDialog)); });
  expect(renderer.root.findByType(Modal).props.visible).toBe(true);
  act(() => renderer.root.findAll(node => node.props.accessibilityLabel === 'KHÔI PHỤC HỒ SƠ' && typeof node.props.onPress === 'function')[0].props.onPress());
  expect(mockRouter.push).toHaveBeenCalledWith('/account');
  mockPathname = '/account';
  act(() => renderer.update(React.createElement(ConnectionDialog)));
  expect(renderer.root.findByType(Modal).props.visible).toBe(false);
});
