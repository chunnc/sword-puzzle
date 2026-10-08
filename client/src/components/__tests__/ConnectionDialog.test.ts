import React, { Profiler } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Modal, StyleSheet, Text } from 'react-native';
import { ArtPanel, GameButton } from '../Art';
import { ConnectionDialog } from '../ConnectionDialog';
import { DIALOG_PANEL_METADATA } from '../../assets';
import { emptySave } from '../../game/save';
import { useGameStore } from '../../state/gameStore';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('react-native-reanimated', () => ({ __esModule: true, default: { View: require('react-native').View }, useAnimatedStyle: jest.fn(), useSharedValue: jest.fn(), withTiming: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('expo-image', () => ({ Image: require('react-native').View }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, usePathname: () => mockPathname }));
jest.mock('../../state/gameStore', () => {
  const { create } = require('zustand');
  return {
    useGameStore: create(() => ({
      online: false, initialized: true, checkingConnection: false, authRequired: false, notice: '',
      save: require('../../game/save').emptySave(),
      checkConnection: jest.fn(async () => undefined),
      syncProgress: jest.fn(async () => undefined),
    })),
  };
});
jest.mock('../Art', () => {
  const actual = jest.requireActual('../Art');
  return { ...actual, ArtPanel: jest.fn(actual.ArtPanel) };
});

const mockRouter = { push: jest.fn() };
let mockPathname = '/map';
let renderer: ReactTestRenderer;
const commits = jest.fn();
const tree = () => React.createElement(Profiler, { id: 'dialog', onRender: commits }, React.createElement(ConnectionDialog));
const modal = () => renderer.root.findByType(Modal);
const panel = () => renderer.root.findByType(ArtPanel);
const button = () => renderer.root.findByType(GameButton);
const texts = () => renderer.root.findAllByType(Text).map(node => node.props.children);
const spinner = () => renderer.root.findAllByProps({ accessibilityLabel: 'Đang thử kết nối lại' })[0];
const checkConnection = () => jest.mocked(useGameStore.getState().checkConnection);
const syncProgress = () => jest.mocked(useGameStore.getState().syncProgress);

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = '/map';
  useGameStore.setState({ online: false, initialized: true, checkingConnection: false, authRequired: false, notice: '', save: emptySave() });
  checkConnection().mockReset().mockResolvedValue(undefined);
  syncProgress().mockReset().mockResolvedValue(undefined);
});
afterEach(() => { act(() => renderer?.unmount()); });

it('uses the wide artwork and metadata ratio only for network failures and preserves it while closing', () => {
  act(() => { renderer = create(tree()); });
  expect(panel().props.art).toBe('dialogPanelWide');
  expect(panel().props.contentFit).toBe('contain');
  expect(StyleSheet.flatten(panel().props.style)).toMatchObject({
    width: '100%', maxWidth: 380, aspectRatio: DIALOG_PANEL_METADATA.dialogPanelWide.runtime.aspectRatio,
  });
  act(() => useGameStore.setState({ online: true }));
  expect(modal().props.visible).toBe(false);
  expect(modal().props.children.props.children.props.mode).toBe('network');

  act(() => useGameStore.setState({ authRequired: true }));
  expect(panel().props.art).toBe('dialogPanel');
  expect(panel().props.contentFit).toBe('fill');
  expect(StyleSheet.flatten(panel().props.style).aspectRatio).toBeUndefined();

  act(() => useGameStore.setState({
    authRequired: false, notice: 'Timeout',
    save: { ...emptySave(), pending: { contentVersion: 3, operation: { id: 'pending_purchase1', kind: 'purchase', category: 'skill', itemId: 'ngu-kiem' } } },
  }));
  expect(panel().props.art).toBe('dialogPanel');
  expect(panel().props.contentFit).toBe('fill');
  expect(StyleSheet.flatten(panel().props.style).aspectRatio).toBeUndefined();
});

it('reserves space above a bottom-anchored retry button and reduces text without shrinking its touch target', () => {
  act(() => { renderer = create(tree()); });
  const content = renderer.root.findByProps({ testID: 'connection-dialog-content' });
  const footer = renderer.root.findByProps({ testID: 'connection-dialog-footer' });
  expect(StyleSheet.flatten(content.props.style)).toMatchObject({
    position: 'absolute', top: 20, bottom: 80, left: 20, right: 20, gap: 8,
  });
  expect(StyleSheet.flatten(footer.props.style)).toMatchObject({
    position: 'absolute', bottom: 20, left: 20, right: 20, alignItems: 'center',
  });
  const textNodes = renderer.root.findAllByType(Text);
  expect(StyleSheet.flatten(textNodes[0].props.style)).toMatchObject({ fontSize: 16, lineHeight: 20 });
  expect(StyleSheet.flatten(textNodes[1].props.style)).toMatchObject({ fontSize: 13, lineHeight: 18 });
  expect(StyleSheet.flatten(button().props.textStyle)).toMatchObject({ fontSize: 12 });
  const touchTarget = button().findAllByProps({ accessibilityRole: 'button' })[0];
  expect(StyleSheet.flatten(touchTarget.props.style).minHeight).toBe(48);
  expect(StyleSheet.flatten(button().parent!.props.style).minWidth).toBe(176);
});

it('keeps modal, panel and text unchanged across repeated background checks', () => {
  act(() => { renderer = create(tree()); });
  const originalModal = modal(), originalPanel = panel(), originalText = texts(), originalStyle = panel().props.style;
  commits.mockClear(); jest.mocked(ArtPanel).mockClear();
  for (let cycle = 0; cycle < 6; cycle++) {
    act(() => useGameStore.setState({ checkingConnection: true }));
    act(() => useGameStore.setState({ checkingConnection: false, notice: `Network failure ${cycle}`, save: { ...useGameStore.getState().save } }));
  }
  expect(commits).not.toHaveBeenCalled();
  expect(ArtPanel).not.toHaveBeenCalled();
  expect(modal()).toBe(originalModal);
  expect(panel()).toBe(originalPanel);
  expect(panel().props.style).toBe(originalStyle);
  expect(texts()).toEqual(originalText);
  expect(button().props.title).toBe('THỬ LẠI');
  expect(button().props.disabled).toBe(false);
  expect(spinner().props.animating).toBe(false);
  expect(modal().props.visible).toBe(true);
  expect(modal().props.animationType).toBe('fade');
  act(() => modal().props.onRequestClose());
  expect(modal().props.visible).toBe(true);
});

it('memoizes the panel when its parent renders without a presentation change', () => {
  act(() => { renderer = create(tree()); });
  const originalPanel = panel(); jest.mocked(ArtPanel).mockClear();
  act(() => renderer.update(tree()));
  expect(panel()).toBe(originalPanel);
  expect(ArtPanel).not.toHaveBeenCalled();
});

it('does not commit dialog updates for background polling while online', () => {
  useGameStore.setState({ online: true });
  act(() => { renderer = create(tree()); });
  commits.mockClear();
  for (let cycle = 0; cycle < 3; cycle++) {
    act(() => useGameStore.setState({ checkingConnection: true }));
    act(() => useGameStore.setState({ checkingConnection: false, notice: `Notice ${cycle}` }));
  }
  expect(commits).not.toHaveBeenCalled();
  expect(modal().props.visible).toBe(false);
});

it('limits manual retry feedback to the button and keeps its label, art and geometry', async () => {
  let reject!: (error: Error) => void;
  checkConnection().mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
  act(() => { renderer = create(tree()); });
  const originalPanel = panel(), originalText = texts(), originalButtonStyle = button().props.style;
  const press = button().props.onPress;
  jest.mocked(ArtPanel).mockClear();
  act(() => { press(); press(); });
  expect(checkConnection()).toHaveBeenCalledTimes(1);
  expect(ArtPanel).not.toHaveBeenCalled();
  expect(panel()).toBe(originalPanel);
  expect(texts()).toEqual(originalText);
  expect(button().props.title).toBe('THỬ LẠI');
  expect(button().props.art).toBe('buttonPrimary');
  expect(button().props.disabledArt).toBe('buttonPrimary');
  expect(button().props.style).toBe(originalButtonStyle);
  expect(button().props.disabled).toBe(true);
  expect(spinner().props.animating).toBe(true);
  await act(async () => { reject(new Error('Still offline')); });
  expect(modal().props.visible).toBe(true);
  expect(button().props.disabled).toBe(false);
  expect(spinner().props.animating).toBe(false);
  expect(texts()).toEqual(originalText);
  expect(ArtPanel).not.toHaveBeenCalled();
});

it('closes after retry succeeds without replacing the mounted modal', async () => {
  let complete!: () => void;
  checkConnection().mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  act(() => { renderer = create(tree()); });
  const originalModal = modal();
  act(() => button().props.onPress());
  await act(async () => { useGameStore.setState({ online: true }); complete(); });
  expect(modal()).toBe(originalModal);
  expect(modal().props.visible).toBe(false);
});

it('keeps pending feedback stable and retries the operation instead of health', async () => {
  useGameStore.setState({ online: true, notice: 'Timeout', save: { ...emptySave(), pending: { contentVersion: 3, operation: { id: 'pending_purchase1', kind: 'purchase', category: 'skill', itemId: 'ngu-kiem' } } } });
  act(() => { renderer = create(tree()); });
  const originalPanel = panel(), originalText = texts(); commits.mockClear();
  act(() => useGameStore.setState({ checkingConnection: true, notice: 'A different failure', save: { ...useGameStore.getState().save, pending: { ...useGameStore.getState().save.pending! } } }));
  act(() => useGameStore.setState({ checkingConnection: false }));
  expect(commits).not.toHaveBeenCalled();
  expect(panel()).toBe(originalPanel);
  expect(texts()).toEqual(originalText);
  await act(async () => button().props.onPress());
  expect(syncProgress()).toHaveBeenCalledTimes(1);
  expect(checkConnection()).not.toHaveBeenCalled();
});

it('keeps login usable during background checks and hides on the account route', () => {
  useGameStore.setState({ online: true, authRequired: true, checkingConnection: true });
  act(() => { renderer = create(tree()); });
  expect(button().props.title).toBe('KHÔI PHỤC HỒ SƠ');
  expect(button().props.disabled).not.toBe(true);
  act(() => button().props.onPress());
  expect(mockRouter.push).toHaveBeenCalledWith('/account');
  mockPathname = '/account';
  act(() => renderer.update(tree()));
  expect(modal().props.visible).toBe(false);
});
