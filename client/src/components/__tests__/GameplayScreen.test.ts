import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import * as Native from 'react-native';
import GameScreen from '../../../app/game/[levelId]';
import { ART, SKILL_ART, SWORD_ART } from '../../assets';
import { Board } from '../Board';
import { GameplayDock, GameplayInfo } from '../GameplayChrome';
import { GameplayProgressBar } from '../GameplayProgressBar';
import { GameplayResultPopup } from '../GameplayResultPopup';
import { BoardEngine } from '../../game/BoardEngine';
import { getLevel } from '../../game/levels';
import { emptySave } from '../../game/save';
import type { BoardActionResult } from '../../state/gameStore';
import { GoalKind } from '../../game/types';

jest.mock('expo-image', () => ({ Image: require('react-native').View }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => mockRouter, useFocusEffect: (callback: () => () => void) => require('react').useEffect(callback, [callback]) }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: require('react-native').View }, useReducedMotion: () => mockReduceMotion,
  useSharedValue: (value: number) => require('react').useRef({ value }).current,
  useAnimatedStyle: (style: () => unknown) => style(), withTiming: (value: number) => value,
}));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: require('react-native').View }));
jest.mock('../../services/ads', () => ({ hasRewardedAdUnit: () => false }));
jest.mock('../../state/gameStore', () => ({ useGameStore: Object.assign((selector?: (state: typeof mockState) => unknown) => selector ? selector(mockState) : mockState, { getState: () => mockState }) }));
jest.mock('../Board', () => ({ Board: require('react-native').View, BOARD_CLEAR_MS: 30, BOARD_FALL_MS: 20, BOARD_SWAP_MS: 10, BOARD_REJECT_MS: 10 }));
jest.mock('../GameplayResultPopup', () => ({ GameplayResultPopup: require('react-native').View }));
jest.mock('../Art', () => {
  const React = require('react'), { View, Pressable, Text } = require('react-native');
  return { ScreenFrame: View, ArtPanel: View, ProgressBar: View,
    GameButton: ({ title, accessibilityLabel, onPress, disabled, style }: { title: string; accessibilityLabel?: string; onPress: () => void; disabled?: boolean; style: unknown }) => React.createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: accessibilityLabel ?? title, onPress: disabled ? undefined : onPress, disabled, style }, React.createElement(Text, null, title)),
  };
});

const mockParams = { levelId: '15' };
let mockReduceMotion = true;
const mockRouter = { push: jest.fn(), replace: jest.fn() };
const mockState = { save: emptySave(), notice: '', online: false, adsEnabled: false, session: null, setNotice: jest.fn(), swap: jest.fn(), castSkill: jest.fn(), startLevel: jest.fn() };

describe('gameplay presentation and exit behavior', () => {
  let renderer: ReactTestRenderer, hardwareBack: () => boolean;
  const removeBack = jest.fn();
  const view = (id: string) => renderer.root.findAllByType(Native.View).find(node => node.props.testID === id)!;
  const button = (label: string) => renderer.root.findAll(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label)[0];
  const board = () => renderer.root.findAllByType(Board).find(node => node.props.snapshot)!;
  const popup = () => renderer.root.findAllByType(GameplayResultPopup).find(node => node.props.result)!;
  const mount = () => { act(() => { renderer = create(React.createElement(GameScreen)); }); };
  beforeEach(() => {
    jest.clearAllMocks(); mockReduceMotion = true; mockParams.levelId = '15'; mockState.save = emptySave();
    mockState.save.active = new BoardEngine(getLevel(15)).snapshot(); mockState.save.active.swordQi = 100;
    mockState.startLevel.mockResolvedValue(true);
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
    expect(sources).not.toContain(ART.gameplayDock);
    expect(sources).not.toContain(ART.barTrack); expect(sources).not.toContain(ART.barRed); expect(sources).not.toContain(ART.barBlue);
    expect(view('game-skill-slot-0')).toBeDefined(); expect(view('game-skill-slot-1')).toBeDefined();
    expect(Native.StyleSheet.flatten(view('game-board-space').props.style).justifyContent).toBe('flex-end');
  });

  it('reserves empty cast actions and uses separate sprites in fixed-size buttons', () => {
    mount();
    const actions = view('game-cast-actions');
    expect(Native.StyleSheet.flatten(actions.props.style).height).toBe(44);
    expect(actions.props.children).toBeNull();
    act(() => { button('Nhất Kiếm, 60 kiếm khí').props.onPress(); });
    const cancel = button('Hủy chọn kỹ năng'), cast = button('Thi triển · 60 khí');
    expect(Native.StyleSheet.flatten(cancel.props.style({ pressed: false }))).toMatchObject({ width: 64, height: 44, borderRadius: 12 });
    expect(Native.StyleSheet.flatten(cast.props.style({ pressed: false }))).toMatchObject({ width: 156, height: 44, borderRadius: 12 });
    expect(cancel.findAllByType(Native.View).some(node => node.props.source === ART.gameplayCancel)).toBe(true);
    expect(cast.findAllByType(Native.View).some(node => node.props.source === ART.gameplayCast)).toBe(true);
    for (const node of [cancel, cast]) {
      const style = Native.StyleSheet.flatten(node.props.style({ pressed: false }));
      expect(style).not.toHaveProperty('backgroundColor'); expect(style).not.toHaveProperty('borderWidth');
      expect(Native.StyleSheet.flatten(node.props.style({ pressed: true })).transform).toEqual([{ scale: 0.96 }]);
    }
    act(() => { cancel.props.onPress(); });
    expect(view('game-cast-actions').props.children).toBeNull();
    expect(Native.StyleSheet.flatten(view('game-cast-actions').props.style).height).toBe(44);
  });

  it('dims both sprite buttons and blocks departure during a pending cast', async () => {
    let finish!: (result: BoardActionResult) => void;
    mockState.castSkill.mockReturnValue(new Promise<BoardActionResult>(resolve => { finish = resolve; }));
    mount(); act(() => { button('Nhất Kiếm, 60 kiếm khí').props.onPress(); });
    act(() => { board().props.onCellPress(0, 0); });
    act(() => { button('Thi triển · 60 khí').props.onPress(); });
    for (const label of ['Hủy chọn kỹ năng', 'Thi triển · 60 khí']) {
      const node = button(label); expect(node.props.disabled).toBe(true);
      expect(Native.StyleSheet.flatten(node.props.style({ pressed: false })).opacity).toBe(0.55);
      expect(node.findAllByType(Native.View).some(child => child.props.source === ART.gameplayCancel || child.props.source === ART.gameplayCast)).toBe(true);
    }
    expect(button('Rời màn chơi').props.disabled).toBe(true);
    await act(async () => { finish({ changed: false, won: false, lost: false, stars: 0, levelId: 15, animation: null }); });
    expect(button('Rời màn chơi').props.disabled).toBe(false);
  });

  it.each([false, true])('uses the same info and control dimensions for every goal (compact=%s)', compact => {
    const snapshots = Object.values(GoalKind).map(goal => {
      const id = Array.from({ length: 40 }, (_, index) => index + 1).find(id => getLevel(id).goal === goal)!;
      mockParams.levelId = String(id); mockState.save.active = new BoardEngine(getLevel(id)).snapshot(); mount();
      act(() => { view('game-content').props.onLayout({ nativeEvent: { layout: { width: 320, height: compact ? 490 : 760 } } }); });
      const objective = Native.StyleSheet.flatten(view('game-objective-panel').props.style);
      const moves = Native.StyleSheet.flatten(view('game-moves-panel').props.style);
      const controls = Native.StyleSheet.flatten(view('game-skill-controls').props.style);
      expect(objective.height).toBe(compact ? 66 : 76); expect(moves.height).toBe(objective.height);
      expect(controls.height).toBe(compact ? 166 : 202);
      const avatar = view('game-enemy-avatar');
      const battle = goal === GoalKind.Battle || goal === GoalKind.Boss;
      expect(Boolean(avatar)).toBe(battle);
      if (avatar) {
        expect(Native.StyleSheet.flatten(avatar.props.style)).toMatchObject({ width: compact ? 40 : 48, height: compact ? 40 : 48 });
        const health = renderer.root.findAllByType(GameplayProgressBar).find(node => node.props.tone === 'health')!;
        expect(health.parent!.children).toHaveLength(2);
        expect(health.parent!.children[0]).toMatchObject({ props: { children: goal === GoalKind.Boss ? 'Yêu vương' : 'Yêu thú' } });
        expect(health.props.animated).toBe(false);
      }
      const dock = Native.StyleSheet.flatten(view('game-equipment-row').props.style);
      expect(dock.height + 30 + 44 + 4 + 8).toBe(controls.height);
      const result = [objective.height, moves.height, moves.width, controls.height];
      act(() => { renderer.unmount(); }); return result;
    });
    expect(snapshots.every(dimensions => JSON.stringify(dimensions) === JSON.stringify(snapshots[0]))).toBe(true);
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
    expect(button('Nhất Kiếm, 60 kiếm khí').props.disabled).toBe(false);
    expect(renderer.root.findAllByType(Native.Text).some(node => node.props.children === 'HẾT LƯỢT')).toBe(false);
    act(() => { renderer.unmount(); }); mockState.save.active!.skillUsed = true; mount();
    expect(button('Nhất Kiếm, 60 kiếm khí').props.disabled).toBe(true);
    expect(popup().props.result.kind).toBe('lost');
  });

  it('cancels exit with targets intact and confirms without altering the saved run', () => {
    mount(); act(() => { button('Nhất Kiếm, 60 kiếm khí').props.onPress(); });
    act(() => { board().props.onCellPress(0, 0); });
    const saved = JSON.stringify(mockState.save.active);
    act(() => { button('Rời màn chơi').props.onPress(); });
    expect(view('game-leave-confirmation')).toBeDefined(); expect(board().props.locked).toBe(true); expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(view('game-leave-panel').props.art).toBe('inventoryDialog');
    expect(view('game-leave-panel').props.contentFit).toBe('contain');
    expect(Native.StyleSheet.flatten(view('game-leave-panel').props.style)).toMatchObject({ maxWidth: 360, aspectRatio: 800 / 671 });
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

  async function winRun(stars: 0 | 1 | 2 | 3 = 3) {
    const finalBoard = { ...mockState.save.active!, remaining: 0 };
    const summary = { runId: finalBoard.runId, levelId: finalBoard.levelId, stars, bestStars: stars, expGained: 100, totalExp: 1500, coinsGained: 125, realmBefore: 0, realmAfter: 1 };
    mockState.swap.mockImplementation(async () => {
      mockState.save.active = null;
      mockState.save.lastWin = summary;
      return { changed: true, won: true, lost: false, stars, levelId: finalBoard.levelId, summary, animation: { swappedBoard: finalBoard, finalBoard, steps: [] } };
    });
    mount();
    await act(async () => { board().props.onSwipe(0, 0, 1, 0); });
    return summary;
  }

  it.each([0, 1, 2, 3] as const)('keeps the final board and opens a %s-star win popup without navigation', async stars => {
    await winRun(stars);
    expect(popup().props.result.summary.stars).toBe(stars);
    expect(board().props.snapshot.remaining).toBe(0);
    expect(board().props.locked).toBe(true);
    expect(mockState.save.active).toBeNull();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    act(() => { board().props.onSwipe(0, 0, 1, 0); hardwareBack(); popup().props.onContinue(); });
    expect(mockState.swap).toHaveBeenCalledTimes(1);
    expect(mockState.startLevel).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('continues to the next level after a realm increase and prevents duplicate starts', async () => {
    await winRun();
    let finish!: (ok: boolean) => void;
    mockState.startLevel.mockReturnValue(new Promise<boolean>(resolve => { finish = resolve; }));
    act(() => { popup().props.onReady(); popup().props.onContinue(); popup().props.onContinue(); hardwareBack(); });
    expect(mockState.startLevel).toHaveBeenCalledTimes(1);
    expect(mockState.startLevel).toHaveBeenCalledWith(16);
    expect(popup().props.busy).toBe(true);
    expect(mockRouter.replace).not.toHaveBeenCalled();
    await act(async () => { finish(true); });
    expect(mockRouter.replace).toHaveBeenCalledWith('/game/16');
  });

  it('keeps the popup available if starting the next level fails', async () => {
    await winRun(); mockState.startLevel.mockResolvedValue(false);
    await act(async () => { popup().props.onReady(); popup().props.onContinue(); });
    expect(popup().props.busy).toBe(false);
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockState.setNotice).toHaveBeenCalledWith('Không thể bắt đầu màn. Vui lòng thử lại.');
    mockState.startLevel.mockResolvedValue(true);
    await act(async () => { popup().props.onContinue(); });
    expect(mockRouter.replace).toHaveBeenCalledWith('/game/16');
  });

  it('returns directly to the map on ready Android Back or at the last level', async () => {
    await winRun();
    act(() => { popup().props.onReady(); hardwareBack(); });
    expect(mockRouter.replace).toHaveBeenCalledWith('/map');
    expect(view('game-leave-confirmation')).toBeUndefined();
    act(() => { renderer.unmount(); }); jest.clearAllMocks();
    mockParams.levelId = '40'; mockState.save.active = new BoardEngine(getLevel(40)).snapshot();
    await winRun();
    await act(async () => { popup().props.onReady(); popup().props.onContinue(); });
    expect(mockRouter.replace).toHaveBeenCalledWith('/map');
    expect(mockState.startLevel).not.toHaveBeenCalled();
  });

  it('restores a lost run and restarts with a new board without changing routes', async () => {
    mockState.save.active!.moves = 0; mockState.save.active!.swordQi = 0; mount();
    expect(popup().props.result.kind).toBe('lost');
    const runId = board().props.snapshot.runId;
    mockState.startLevel.mockImplementation(async () => { mockState.save.active = new BoardEngine(getLevel(15)).snapshot(); return true; });
    await act(async () => { popup().props.onReady(); popup().props.onContinue(); });
    expect(mockState.startLevel).toHaveBeenCalledWith(15, true);
    expect(renderer.root.findAllByType(GameplayResultPopup).filter(node => node.props.result)).toHaveLength(0);
    expect(board().props.snapshot.runId).not.toBe(runId);
    expect(board().props.locked).toBe(false);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('uses only reward reconciliation for the same run and resets when the route changes', async () => {
    const summary = await winRun();
    mockState.save.lastWin = { ...summary, expGained: 0, coinsGained: 10 };
    act(() => { renderer.update(React.createElement(GameScreen)); });
    expect(popup().props.result.summary).toMatchObject({ expGained: 0, coinsGained: 10 });
    mockState.save.lastWin = { ...summary, runId: 'another-run', coinsGained: 999 };
    act(() => { renderer.update(React.createElement(GameScreen)); });
    expect(popup().props.result.summary.coinsGained).toBe(125);
    mockParams.levelId = '16'; mockState.save.active = new BoardEngine(getLevel(16)).snapshot();
    act(() => { renderer.update(React.createElement(GameScreen)); });
    expect(renderer.root.findAllByType(GameplayResultPopup).filter(node => node.props.result)).toHaveLength(0);
    expect(board().props.snapshot.levelId).toBe(16);
  });

  it('finishes the real last-skill board animation before opening a zero-star win', async () => {
    jest.useFakeTimers();
    try {
      mockReduceMotion = false; mockParams.levelId = '1';
      const snapshot = new BoardEngine(getLevel(1)).snapshot();
      snapshot.moves = 0; snapshot.remaining = 1; snapshot.swordQi = 60;
      for (let x = 0; x < 7; x++) snapshot.tiles[x] = { kind: 0, chargeTier: 0, locked: false };
      mockState.save.active = snapshot;
      const engine = new BoardEngine(getLevel(1), snapshot);
      expect(engine.trySkill('nhat-kiem', [{ x: 0, y: 0 }])).toBe(true);
      const summary = { runId: snapshot.runId, levelId: 1, stars: 0 as const, bestStars: 0 as const, expGained: 30, totalExp: 30, coinsGained: 100, realmBefore: 0, realmAfter: 0 };
      mockState.castSkill.mockImplementation(async () => {
        mockState.save.active = null; mockState.save.lastWin = summary;
        return { changed: true, won: true, lost: false, stars: 0, levelId: 1, summary, animation: engine.animation };
      });
      mount(); act(() => { button('Nhất Kiếm, 60 kiếm khí').props.onPress(); board().props.onCellPress(0, 0); });
      await act(async () => { button('Thi triển · 60 khí').props.onPress(); });
      expect(renderer.root.findAllByType(GameplayResultPopup).filter(node => node.props.result)).toHaveLength(0);
      expect(board().props.locked).toBe(true);
      await act(async () => { await jest.runAllTimersAsync(); });
      expect(popup().props.result.summary.stars).toBe(0);
      expect(board().props.snapshot).toEqual(engine.animation!.finalBoard);
      expect(mockRouter.replace).not.toHaveBeenCalled();
    } finally { jest.useRealTimers(); }
  });

  it('opens loss only after the final swap animation completes', async () => {
    jest.useFakeTimers();
    try {
      mockReduceMotion = false;
      const before = mockState.save.active!, finalBoard = { ...before, moves: 0, swordQi: 0 };
      mockState.swap.mockResolvedValue({ changed: true, won: false, lost: true, stars: 0, levelId: 15, animation: { swap: { x1: 0, y1: 0, x2: 1, y2: 0 }, swappedBoard: before, finalBoard, steps: [] } });
      mount(); await act(async () => { board().props.onSwipe(0, 0, 1, 0); });
      expect(renderer.root.findAllByType(GameplayResultPopup).filter(node => node.props.result)).toHaveLength(0);
      await act(async () => { await jest.runAllTimersAsync(); });
      expect(popup().props.result.kind).toBe('lost');
      expect(board().props.snapshot).toEqual(finalBoard);
    } finally { jest.useRealTimers(); }
  });
});
