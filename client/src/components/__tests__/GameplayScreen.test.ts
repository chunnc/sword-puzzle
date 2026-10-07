import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import * as Native from 'react-native';
import GameScreen from '../../../app/game/[levelId]';
import { ART, SKILL_ART, SWORD_ART } from '../../assets';
import { Board } from '../Board';
import { GameplayDock, GameplayInfo } from '../GameplayChrome';
import { BoardEngine } from '../../game/BoardEngine';
import { getLevel } from '../../game/levels';
import { emptySave } from '../../game/save';
import type { BoardActionResult } from '../../state/gameStore';
import { GoalKind } from '../../game/types';

jest.mock('expo-image', () => ({ Image: require('react-native').View }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => mockRouter, useFocusEffect: (callback: () => () => void) => require('react').useEffect(callback, [callback]) }));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
jest.mock('../../services/ads', () => ({ hasRewardedAdUnit: () => false }));
jest.mock('../../state/gameStore', () => ({ useGameStore: Object.assign((selector?: (state: typeof mockState) => unknown) => selector ? selector(mockState) : mockState, { getState: () => mockState }) }));
jest.mock('../Board', () => ({ Board: require('react-native').View, BOARD_CLEAR_MS: 0, BOARD_FALL_MS: 0, BOARD_SWAP_MS: 0, BOARD_REJECT_MS: 0 }));
jest.mock('../Art', () => {
  const React = require('react'), { View, Pressable, Text } = require('react-native');
  return { ScreenFrame: View, ArtPanel: View, ProgressBar: View,
    GameButton: ({ title, accessibilityLabel, onPress, disabled, style }: { title: string; accessibilityLabel?: string; onPress: () => void; disabled?: boolean; style: unknown }) => React.createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: accessibilityLabel ?? title, onPress: disabled ? undefined : onPress, disabled, style }, React.createElement(Text, null, title)),
  };
});

const mockParams = { levelId: '15' };
const mockRouter = { push: jest.fn(), replace: jest.fn() };
const mockState = { save: emptySave(), notice: '', online: false, adsEnabled: false, session: null, setNotice: jest.fn(), swap: jest.fn(), castSkill: jest.fn(), startLevel: jest.fn() };

describe('gameplay presentation and exit behavior', () => {
  let renderer: ReactTestRenderer, hardwareBack: () => boolean;
  const removeBack = jest.fn();
  const view = (id: string) => renderer.root.findAllByType(Native.View).find(node => node.props.testID === id)!;
  const button = (label: string) => renderer.root.findAll(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label)[0];
  const board = () => renderer.root.findAllByType(Board).find(node => node.props.snapshot)!;
  const mount = () => { act(() => { renderer = create(React.createElement(GameScreen)); }); };
  beforeEach(() => {
    jest.clearAllMocks(); mockParams.levelId = '15'; mockState.save = emptySave();
    mockState.save.active = new BoardEngine(getLevel(15)).snapshot(); mockState.save.active.swordQi = 100;
    jest.spyOn(Native, 'useWindowDimensions').mockReturnValue({ width: 320, height: 568, scale: 3, fontScale: 1 });
    jest.spyOn(Native.BackHandler, 'addEventListener').mockImplementation((_event, handler) => { hardwareBack = handler as () => boolean; return { remove: removeBack }; });
  });
  afterEach(() => { act(() => { renderer?.unmount(); }); jest.restoreAllMocks(); });

  it('renders run equipment and two sockets with no shared HUD/navigation or sword navigation', () => {
    mockState.save.active!.loadout.sword = 'trong-nhac'; mount();
    expect(view('game-sword').props.accessibilityLabel).toBe('Bảo kiếm Trọng Nhạc');
    expect(view('game-sword').props.onPress).toBeUndefined();
    const sources = renderer.root.findAllByType(Native.View).map(node => node.props.source);
    expect(sources).toContain(ART[SWORD_ART['trong-nhac']]); expect(sources).toContain(ART[SKILL_ART['nhat-kiem']]);
    expect(sources).not.toContain(ART.hudTrayV2); expect(sources).not.toContain(ART.nav);
    expect(view('game-skill-slot-0')).toBeDefined(); expect(view('game-skill-slot-1')).toBeDefined();
    expect(Native.StyleSheet.flatten(view('game-board-space').props.style).justifyContent).toBe('flex-end');
  });

  it('shows locked and empty second sockets without changing run equipment', () => {
    mount(); expect(button('Ô kỹ năng 2 bị khóa, mở tại 1500 EXP').props.disabled).toBe(true);
    act(() => { renderer.unmount(); }); mockState.save.profile.totalExp = 1600; mount();
    expect(button('Ô kỹ năng 2 trống').props.disabled).toBe(true);
    expect(mockState.save.active!.loadout.skills).toEqual(['nhat-kiem']);
  });

  it('keeps both run skills when the live profile differs and disables insufficient qi', () => {
    mockState.save.active!.loadout.skills = ['nhat-kiem', 'hoa-lien']; mockState.save.active!.swordQi = 60; mount();
    expect(button('Nhất Kiếm, 60 kiếm khí').props.disabled).toBe(false);
    expect(button('Hỏa Liên, 65 kiếm khí').props.disabled).toBe(true);
    expect(renderer.root.findByType(GameplayDock).props.board.loadout.skills).toEqual(['nhat-kiem', 'hoa-lien']);
  });

  it('uses discounted costs and confirms casting only after selecting a target', async () => {
    mockState.save.active!.loadout.sword = 'huyen-co'; mockState.save.active!.condensed = true; mount();
    const cost = new BoardEngine(getLevel(15), mockState.save.active!).cost('nhat-kiem');
    act(() => { button(`Nhất Kiếm, ${cost} kiếm khí`).props.onPress(); });
    expect(button(`Thi triển · ${cost} khí`).props.disabled).toBe(true);
    expect(button(`Nhất Kiếm, ${cost} kiếm khí`).props.accessibilityState.selected).toBe(true);
    act(() => { board().props.onCellPress(0, 0); });
    expect(button(`Thi triển · ${cost} khí`).props.disabled).toBe(false);
    mockState.castSkill.mockResolvedValue({ changed: false, won: false, animation: null });
    await act(async () => { button(`Thi triển · ${cost} khí`).props.onPress(); });
    expect(mockState.castSkill).toHaveBeenCalledWith('nhat-kiem', [{ x: 0, y: 0 }]);
  });

  it.each(Object.values(GoalKind))('shows goal, moves and appropriate HP for %s', goal => {
    const id = Array.from({ length: 40 }, (_, index) => index + 1).find(id => getLevel(id).goal === goal)!;
    mockParams.levelId = String(id); mockState.save.active = new BoardEngine(getLevel(id)).snapshot(); mount();
    const info = renderer.root.findByType(GameplayInfo);
    expect(info.props.board.moves).toBe(getLevel(id).moves); expect(info.props.board.remaining).toBe(getLevel(id).target);
    expect(renderer.root.findAllByType(Native.View).filter(node => String(node.props.accessibilityLabel).startsWith('Máu '))).toHaveLength(goal === GoalKind.Battle || goal === GoalKind.Boss ? 1 : 0);
  });

  it('allows a final skill at zero moves and disables skills already used', () => {
    mockState.save.active!.moves = 0; mount();
    expect(button('Nhất Kiếm, 60 kiếm khí').props.disabled).toBe(false); expect(renderer.root.findByType(GameplayDock).props.lost).toBe(false);
    act(() => { renderer.unmount(); }); mockState.save.active!.skillUsed = true; mount();
    expect(button('Nhất Kiếm, 60 kiếm khí').props.disabled).toBe(true); expect(renderer.root.findByType(GameplayDock).props.lost).toBe(true);
  });

  it('cancels exit with targets intact and confirms without altering the saved run', () => {
    mount(); act(() => { button('Nhất Kiếm, 60 kiếm khí').props.onPress(); });
    act(() => { board().props.onCellPress(0, 0); });
    const saved = JSON.stringify(mockState.save.active);
    act(() => { button('Rời màn chơi').props.onPress(); });
    expect(view('game-leave-confirmation')).toBeDefined(); expect(board().props.locked).toBe(true); expect(mockRouter.replace).not.toHaveBeenCalled();
    act(() => { button('Tiếp tục').props.onPress(); });
    expect(board().props.targets).toEqual([{ x: 0, y: 0 }]);
    act(() => { button('Rời màn chơi').props.onPress(); });
    act(() => { button('Về Tiên Lộ').props.onPress(); });
    expect(mockRouter.replace).toHaveBeenCalledWith('/map'); expect(JSON.stringify(mockState.save.active)).toBe(saved); expect(mockState.startLevel).not.toHaveBeenCalled();
  });

  it('handles Android back, dismisses the foremost overlay and removes its listener', () => {
    mount(); act(() => { button('Luật các ô').props.onPress(); });
    act(() => { expect(hardwareBack()).toBe(true); });
    expect(renderer.root.findAllByType(Native.Text).some(node => node.props.children === 'LINH VẬT')).toBe(false);
    act(() => { hardwareBack(); }); expect(view('game-leave-confirmation')).toBeDefined();
    act(() => { hardwareBack(); }); expect(view('game-leave-confirmation')).toBeUndefined();
    act(() => { renderer.unmount(); }); expect(removeBack).toHaveBeenCalled();
  });

  it('blocks exit until an in-flight board action finishes', async () => {
    let finish!: (result: BoardActionResult) => void;
    mockState.swap.mockReturnValue(new Promise<BoardActionResult>(resolve => { finish = resolve; })); mount();
    act(() => { board().props.onSwipe(0, 0, 1, 0); });
    expect(button('Rời màn chơi').props.disabled).toBe(true); expect(button('Nhất Kiếm, 60 kiếm khí').props.disabled).toBe(true);
    act(() => { expect(hardwareBack()).toBe(true); }); expect(view('game-leave-confirmation')).toBeUndefined();
    await act(async () => { finish({ changed: false, won: false, lost: false, stars: 0, levelId: 15, animation: null }); });
    expect(button('Rời màn chơi').props.disabled).toBe(false);
  });
});
