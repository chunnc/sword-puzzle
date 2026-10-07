import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import * as Native from 'react-native';
import GameScreen from '../../../app/game/[levelId]';
import { Board } from '../Board';
import { BoardEngine } from '../../game/BoardEngine';
import { getLevel } from '../../game/levels';
import { emptySave } from '../../game/save';

jest.mock('expo-image', () => ({ Image: require('react-native').View }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ levelId: '15' }), useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), useFocusEffect: () => undefined }));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
jest.mock('../../services/ads', () => ({ hasRewardedAdUnit: () => false }));
jest.mock('../../state/gameStore', () => ({ useGameStore: (selector?: (state: typeof mockState) => unknown) => selector ? selector(mockState) : mockState }));
jest.mock('../Board', () => ({ Board: require('react-native').View, BOARD_CLEAR_MS: 0, BOARD_FALL_MS: 0, BOARD_SWAP_MS: 0, BOARD_REJECT_MS: 0 }));
jest.mock('../Chrome', () => ({ TopHud: require('react-native').View, BottomNav: require('react-native').View }));
jest.mock('../Art', () => {
  const React = require('react');
  const { View, Pressable } = require('react-native');
  return { ScreenFrame: View, ArtPanel: View, ProgressBar: View,
    GameButton: ({ title, onPress, style }: { title: string; onPress: () => void; style: unknown }) => React.createElement(Pressable, { accessibilityLabel: title, onPress, style }),
  };
});

const mockState = { save: emptySave(), notice: '', online: false, adsEnabled: false, session: null, setNotice: jest.fn() };

describe('gameplay layout with dedicated controls', () => {
  let renderer: ReactTestRenderer;
  const view = (id: string) => renderer.root.findAllByType(Native.View).find(node => node.props.testID === id)!;
  const button = (label: string) => renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
  const boardSize = () => Native.StyleSheet.flatten(renderer.root.findAllByType(Board).find(node => node.props.snapshot)!.parent!.props.style);

  beforeEach(() => {
    mockState.save = emptySave();
    mockState.save.active = new BoardEngine(getLevel(15)).snapshot();
    mockState.save.active.swordQi = 100;
    jest.spyOn(Native, 'useWindowDimensions').mockReturnValue({ width: 320, height: 568, scale: 3, fontScale: 1 });
  });
  afterEach(() => { act(() => { renderer?.unmount(); }); jest.restoreAllMocks(); });

  it.each([490, 760])('keeps the board and controls stable while targeting a skill at viewport height %s', viewportHeight => {
    act(() => { renderer = create(React.createElement(GameScreen)); });
    act(() => { view('game-content').props.onLayout({ nativeEvent: { layout: { height: viewportHeight } } }); });
    act(() => { view('game-board-space').props.onLayout({ nativeEvent: { layout: { height: 190 } } }); });
    const initialBoardSize = boardSize();
    const initialControlsHeight = Native.StyleSheet.flatten(view('game-skill-controls').props.style).height;
    expect(initialBoardSize.width).toBeGreaterThan(0);
    act(() => { button('Nhất Kiếm, 60 kiếm khí').props.onPress(); });
    expect(renderer.root.findAllByType(Board).find(node => node.props.snapshot)!.props.targetingHint).toBe('Nhất Kiếm · chọn 1 ô');
    expect(boardSize()).toEqual(initialBoardSize);
    expect(Native.StyleSheet.flatten(view('game-skill-controls').props.style).height).toBe(initialControlsHeight);
    act(() => { button('Hủy').props.onPress(); });
    expect(boardSize()).toEqual(initialBoardSize);
    expect(Native.StyleSheet.flatten(view('game-skill-controls').props.style).height).toBe(initialControlsHeight);
  });
});
