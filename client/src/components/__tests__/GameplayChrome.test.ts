import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { GameplayHeader, GameplayInfo } from '../GameplayChrome';
import { GameplayProgressBar } from '../GameplayProgressBar';
import { ART } from '../../assets';
import { CONTENT, tileId, type ObjectiveDefinition, type TileKey } from '../../game/domain';
import { getLevel } from '../../game/levels';
import type { BoardSnapshot } from '../../game/types';
import { colors } from '../../theme';

jest.mock('expo-image', () => ({ Image: require('react-native').View }));
jest.mock('../GameplayObjectivePanel', () => ({ GameplayObjectivePanel: require('react-native').View }));
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
      expect(StyleSheet.flatten(goal.props.style)).toMatchObject({ width: '33.333333%', minWidth: 0, justifyContent: 'flex-start' });
      expect(goal.props.accessibilityLabel).toContain('0 / 15');
      expect(goal.findAllByType(Text).some(node => String(node.props.children).startsWith('Thu '))).toBe(false);
    }
    expect(renderer.root.findAllByType(ScrollView)).toHaveLength(0);
    expect(view('game-enemy-panel')).toBeUndefined();
  });

  it.each(['Battle', 'Boss'] as const)('puts %s above collection in its own full-width row and preserves HP', type => {
    act(() => { renderer = create(info([collect('collect'), enemy(type)], { enemy: 120 }, true)); });
    expect(view('game-info').props.children.filter(Boolean).map((node: React.ReactElement<{ testID: string }>) => node.props.testID)).toEqual(['game-enemy-panel', 'game-objective-panel']);
    expect(StyleSheet.flatten(view('game-enemy-panel').props.style)).toMatchObject({ width: '100%', height: 52, paddingVertical: 6 });
    expect(view('game-enemy-panel').findAllByType(Text).some(node => node.props.children === 'Yêu vương')).toBe(true);
    const health = renderer.root.findByType(GameplayProgressBar);
    expect(health.props).toMatchObject({ value: 180, max: 300, accessibilityLabel: 'Máu Yêu vương' });
  });

  it('omits an empty collection row for a boss-only level', () => {
    act(() => { renderer = create(info([enemy('Boss')])); });
    expect(view('game-enemy-panel')).toBeDefined();
    expect(view('game-objective-panel')).toBeUndefined();
  });

  it.each([false, true])('uses shorter panels without shrinking avatars or collection icons (compact=%s)', compact => {
    act(() => { renderer = create(info([enemy('Boss'), collect('collect')], {}, compact)); });
    expect(StyleSheet.flatten(view('game-objective-panel').props.style)).toMatchObject({ height: compact ? 44 : 48, paddingVertical: compact ? 4 : 6, paddingHorizontal: compact ? 18 : 20 });
    expect(StyleSheet.flatten(view('game-enemy-panel').props.style)).toMatchObject({ height: compact ? 52 : 60, paddingVertical: 6, paddingHorizontal: compact ? 18 : 20 });
    const health = renderer.root.findByType(GameplayProgressBar);
    expect(StyleSheet.flatten(health.parent!.props.style)).toMatchObject({ gap: 4, paddingRight: 16 });
    expect(StyleSheet.flatten(view('game-enemy-avatar').props.style)).toMatchObject({ width: compact ? 40 : 48, height: compact ? 40 : 48 });
    expect(StyleSheet.flatten(view('objective-icon-collect').props.style)).toMatchObject({ width: 28, height: 28 });
  });

  it('updates visible and accessible progress, completion, and restored collection progress', () => {
    const goals: ObjectiveDefinition[] = [collect('collect'), { id: 'rock', type: 'BreakRocks', target: 2 }, { id: 'seal', type: 'BreakSeals', target: 3 }];
    act(() => { renderer = create(info(goals, { collect: 4, rock: 2, seal: 1 })); });
    expect(view('objective-rock').props.accessibilityLabel).toBe('Phá đá, 2 / 2, hoàn thành');
    expect(view('objective-rock').findAllByType(Text).some(node => node.props.children === ' ✓')).toBe(false);
    for (const progress of [14, 15, 23]) {
      act(() => renderer.update(info(goals, { collect: progress, rock: 2, seal: 3 })));
      expect(view('objective-collect').props.accessibilityLabel).toContain(`${progress} / 15${progress >= 15 ? ', hoàn thành' : ''}`);
      const texts = view('objective-collect').findAllByType(Text);
      const counter = texts.find(node => Array.isArray(node.props.children) && node.props.children[0] === progress)!;
      expect(StyleSheet.flatten(counter.props.style).color).toBe(progress >= 15 ? colors.success : colors.ivory);
      const total = texts.find(node => Array.isArray(node.props.children) && node.props.children[0] === '/')!;
      expect(StyleSheet.flatten(total.props.style).color).toBe(progress >= 15 ? colors.success : colors.textMuted);
    }
    expect(renderer.root.findAllByType(Text).some(node => String(node.props.children).includes('✓'))).toBe(false);
  });

  it('uses separate panel artwork and a green name at zero boss HP without a tick', () => {
    act(() => { renderer = create(info([enemy('Boss'), collect('collect')], { enemy: 300, collect: 23 })); });
    expect(view('game-enemy-panel').props.variant).toBe('boss');
    expect(view('game-objective-panel').props.variant).toBe('collection');
    const name = view('game-enemy-panel').findAllByType(Text).find(node => node.props.children === 'Yêu vương')!;
    expect(StyleSheet.flatten(name.props.style).color).toBe(colors.success);
    expect(renderer.root.findByType(GameplayProgressBar).props.value).toBe(0);
  });
});
