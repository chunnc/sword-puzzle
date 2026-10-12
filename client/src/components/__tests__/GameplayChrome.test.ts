import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { GameplayHeader, GameplayInfo } from '../GameplayChrome';
import { GameplayProgressBar } from '../GameplayProgressBar';
import { ART } from '../../assets';
import { CONTENT, tileId, type ObjectiveDefinition, type TileKey } from '../../game/domain';
import { getLevel } from '../../game/levels';
import type { BoardSnapshot } from '../../game/types';

jest.mock('expo-image', () => ({ Image: require('react-native').View }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: require('react-native').View }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true, default: { View: require('react-native').View },
  useSharedValue: (value: number) => require('react').useRef({ value }).current,
  useAnimatedStyle: (style: () => unknown) => style(),
  withTiming: (value: number) => value, withSequence: (...values: number[]) => values.at(-1),
  cancelAnimation: jest.fn(), Easing: { out: (value: unknown) => value, back: () => ({}), quad: {} },
}));

describe('gameplay header and objective rows', () => {
  let renderer: ReactTestRenderer;
  afterEach(() => { act(() => renderer?.unmount()); });
  const view = (id: string) => renderer.root.findAllByType(View).find(node => node.props.testID === id)!;
  const collect = (id: string, kind: TileKey = 'sword'): ObjectiveDefinition => ({ id, type: 'Collect', tileKind: tileId(kind, CONTENT), target: 15 });
  const enemy = (type: 'Battle' | 'Boss'): ObjectiveDefinition => ({ id: 'enemy', type, target: 300, enemy: { id: 'enemy', name: 'Yêu vương', artKey: 'beast' } });
  function info(objectives: ObjectiveDefinition[], progress: Record<string, number> = {}, compact = false) {
    const level = { ...getLevel(15), objectives };
    const board = { contentVersion: CONTENT.version, objectiveProgress: progress } as BoardSnapshot;
    return React.createElement(GameplayInfo, { level, board, compact, reduceMotion: true, duration: 250 });
  }

  it('centers one sword and the changing move count independently of back', () => {
    const onBack = jest.fn();
    for (const moves of [15, 0, 3]) {
      const header = React.createElement(GameplayHeader, { moves, busy: false, compact: false, onBack });
      act(() => { if (renderer) renderer.update(header); else renderer = create(header); });
      expect(view('game-moves').props.accessibilityLabel).toBe(`Còn ${moves} lượt`);
      const centered = StyleSheet.flatten(view('game-moves').parent!.props.style);
      expect(centered).toMatchObject({ position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' });
      expect(StyleSheet.flatten(view('game-moves').props.style)).not.toHaveProperty('backgroundColor');
      const icons = view('game-moves').findAllByType(View).filter(node => node.props.source === ART.gameplayMovesIcon);
      expect(icons).toHaveLength(1);
      expect(StyleSheet.flatten(icons[0].props.style)).toMatchObject({ width: 28, height: 28 });
      expect(view('game-moves').findAllByType(Text).some(node => node.props.children === moves)).toBe(true);
      expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'Luật các ô')).toHaveLength(0);
    }
    renderer.root.findAll(node => node.props.accessibilityLabel === 'Rời màn chơi' && node.props.onPress)[0].props.onPress();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it.each([1, 2, 3])('fits %s equally spaced collection objectives in one row without labels or scrolling', count => {
    const goals = (['sword', 'fire', 'lightning'] as const).slice(0, count).map((kind, index) => collect(`goal-${index}`, kind));
    act(() => { renderer = create(info(goals)); });
    expect(StyleSheet.flatten(view('game-objective-panel').props.style).width).toBe('100%');
    expect(StyleSheet.flatten(view('game-objectives-row').props.style).flexDirection).toBe('row');
    expect(view('game-objectives-row').props.children).toHaveLength(count);
    for (let index = 0; index < count; index++) {
      const goal = view(`objective-goal-${index}`);
      expect(StyleSheet.flatten(goal.props.style)).toMatchObject({ flex: 1, minWidth: 0 });
      expect(goal.props.accessibilityLabel).toContain('0 / 15');
      expect(goal.findAllByType(Text).some(node => String(node.props.children).startsWith('Thu '))).toBe(false);
    }
    expect(renderer.root.findAllByType(ScrollView)).toHaveLength(0);
    expect(view('game-enemy-panel')).toBeUndefined();
  });

  it.each(['Battle', 'Boss'] as const)('puts %s above collection in its own full-width row and preserves HP', type => {
    act(() => { renderer = create(info([collect('collect'), enemy(type)], { enemy: 120 }, true)); });
    expect(view('game-info').props.children.filter(Boolean).map((node: React.ReactElement<{ testID: string }>) => node.props.testID)).toEqual(['game-enemy-panel', 'game-objective-panel']);
    expect(StyleSheet.flatten(view('game-enemy-panel').props.style)).toMatchObject({ width: '100%', height: 66 });
    expect(view('game-enemy-panel').findAllByType(Text).some(node => node.props.children === 'Yêu vương')).toBe(true);
    const health = renderer.root.findByType(GameplayProgressBar);
    expect(health.props).toMatchObject({ value: 180, max: 300, accessibilityLabel: 'Máu Yêu vương' });
  });

  it('omits an empty collection row for a boss-only level', () => {
    act(() => { renderer = create(info([enemy('Boss')])); });
    expect(view('game-enemy-panel')).toBeDefined();
    expect(view('game-objective-panel')).toBeUndefined();
  });

  it('updates visible and accessible progress, completion, and restored collection progress', () => {
    const goals: ObjectiveDefinition[] = [collect('collect'), { id: 'rock', type: 'BreakRocks', target: 2 }, { id: 'seal', type: 'BreakSeals', target: 3 }];
    act(() => { renderer = create(info(goals, { collect: 4, rock: 2, seal: 1 })); });
    expect(view('objective-rock').props.accessibilityLabel).toBe('Phá đá, 2 / 2, hoàn thành');
    expect(view('objective-rock').findAllByType(Text).some(node => node.props.children === ' ✓')).toBe(true);
    const next = info(goals, { collect: 15, rock: 2, seal: 3 });
    act(() => renderer.update(next));
    expect(view('objective-collect').props.accessibilityLabel).toContain('15 / 15, hoàn thành');
  });
});
