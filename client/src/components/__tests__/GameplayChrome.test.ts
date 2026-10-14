import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, ScrollView, StyleSheet, Text, View, type AppStateStatus } from 'react-native';
import { GameplayHeader, GameplayInfo } from '../GameplayChrome';
import { GameplayProgressBar } from '../GameplayProgressBar';
import { ART } from '../../assets';
import { CONTENT, tileId, type ObjectiveDefinition, type TileKey } from '../../game/domain';
import { getLevel } from '../../game/levels';
import type { BoardSnapshot } from '../../game/types';
import { colors } from '../../theme';
import { TileSprite } from '../TileSprite';
import { TIER5_IDLE_ANIMATIONS } from '../idleTileAnimation';
import { TileKind } from '../../game/types';
import { useImage } from '@shopify/react-native-skia';
import { GameTileImageProvider, useGameTileImage } from '../GameTileImages';

jest.mock('expo-image', () => ({ Image: require('react-native').View }));
jest.mock('../GameplayObjectivePanel', () => ({ GameplayObjectivePanel: require('react-native').View }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: require('react-native').View }));
jest.mock('../../../app-assets/ui/tile_sword_5.webp', () => 103);
jest.mock('../../../app-assets/ui/tile_sword_5_idle.png', () => 117);
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
jest.mock('react-native-worklets', () => ({ runOnJS: (fn: unknown) => fn }));
jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const host = (name: string) => (props: { children?: React.ReactNode }) => React.createElement(name, props, props.children);
  const buffer = (size: number, modifier: (item: unknown, index: number) => void) => {
    const value = Array.from({ length: size }, () => ({ setXYWH: jest.fn(), set: jest.fn() }));
    value.forEach(modifier);
    return { value };
  };
  return { Canvas: host('Canvas'), Group: host('Group'), Image: host('SkiaImage'), Atlas: host('Atlas'),
    Circle: host('Circle'), Path: host('Path'), BlurMask: host('BlurMask'),
    useImage: jest.fn((asset: number | null) => asset ? { asset } : null),
    useRectBuffer: buffer, useRSXformBuffer: buffer,
    Skia: { Path: { Make: () => {
      const path = { moveTo: () => path, lineTo: () => path, close: () => path };
      return path;
    } } },
  };
});
jest.mock('react-native-reanimated', () => ({
  __esModule: true, default: { View: require('react-native').View },
  useSharedValue: (value: number) => require('react').useRef({ value }).current,
  useDerivedValue: (fn: () => unknown) => {
    const latest = require('react').useRef(fn); latest.current = fn;
    return require('react').useRef({ get value() { return latest.current(); } }).current;
  },
  useFrameCallback: (callback: MockClock['callback']) => {
    const ref = require('react').useRef(null);
    if (!ref.current) {
      const clock: MockClock = { callback, active: false, setActive: jest.fn(active => { clock.active = active; }) };
      ref.current = clock; mockClocks.push(clock);
    }
    ref.current.callback = callback;
    return ref.current;
  },
  useAnimatedReaction: (prepare: () => unknown, react: (value: unknown) => void, dependencies: unknown[]) => {
    require('react').useEffect(() => { react(prepare()); });
  },
  useAnimatedStyle: (style: () => unknown) => style(),
  withTiming: (value: number) => value, withSequence: (...values: number[]) => values.at(-1),
  cancelAnimation: jest.fn(), Easing: { out: (value: unknown) => value, back: () => ({}), quad: {} },
}));

type MockClock = { callback: (frame: { timeSincePreviousFrame: number }) => void; active: boolean; setActive: jest.Mock };
const mockClocks: MockClock[] = [];
let mockFocused = true;

describe('gameplay header and objective rows', () => {
  let renderer: ReactTestRenderer;
  beforeEach(() => {
    mockClocks.length = 0; mockFocused = true;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
  });
  afterEach(() => { act(() => renderer?.unmount()); jest.restoreAllMocks(); });
  const tileSprites = () => renderer.root.findAllByType((TileSprite as any).type);
  const view = (id: string) => renderer.root.findAllByType(View).find(node => node.props.testID === id)!;
  const collect = (id: string, kind: TileKey = 'sword'): Extract<ObjectiveDefinition, { type: 'Collect' }> => ({ id, type: 'Collect', tileKind: tileId(kind, CONTENT), target: 15 });
  const enemy = (type: 'Battle' | 'Boss'): ObjectiveDefinition => ({ id: 'enemy', type, target: 300, enemy: { id: 'enemy', name: 'Yêu vương', artKey: 'beast' } });
  function info(objectives: ObjectiveDefinition[], progress: Record<string, number> = {}, compact = false, reduceMotion = true) {
    const level = { ...getLevel(15), objectives };
    const board = { contentVersion: CONTENT.version, objectiveProgress: progress } as BoardSnapshot;
    return React.createElement(GameplayInfo, { level, board, compact, reduceMotion, duration: 250 });
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

  it.each([false, true])('anchors charged icons to measured rows after a layout change (compact=%s)', compact => {
    const goals: ObjectiveDefinition[] = [collect('all'), { ...collect('four'), chargeTier: 4 }, { ...collect('five', 'fire'), chargeTier: 5 }];
    act(() => { renderer = create(info(goals, { five: 1 }, compact)); });
    expect(view('objective-four').props.accessibilityLabel).toContain('cấp 4');
    expect(view('objective-five').props.accessibilityLabel).toContain('cấp 5, 1 / 15');
    expect(StyleSheet.flatten(view('objective-icon-four').props.style)).toMatchObject({ width: 36, height: 28, flexShrink: 0 });
    for (const width of [80, 96, 120]) {
      act(() => {
        view('objective-four').props.onLayout({ nativeEvent: { layout: { x: width, y: 0, width, height: 36 } } });
        view('objective-five').props.onLayout({ nativeEvent: { layout: { x: width * 2, y: 0, width, height: 36 } } });
      });
      const sprites = tileSprites();
      expect(sprites.map(node => [node.props.kind, node.props.chargeTier])).toEqual([[TileKind.Sword, 4], [TileKind.Fire, 5]]);
      expect(sprites.map(node => node.props.bounds)).toEqual([
        { x: width + 10, y: 10, width: 28, height: 28 }, { x: width * 2 + 10, y: 10, width: 28, height: 28 },
      ]);
      expect(renderer.root.findAll(node => node.type === 'Canvas' as never)).toHaveLength(1);
      expect(renderer.root.findAll(node => node.type === 'Atlas' as never)).toHaveLength(1);
    }
    expect(mockClocks).toHaveLength(2);
    expect(mockClocks.every(clock => !clock.active)).toBe(true);
  });

  it('shares two clocks across four animated kinds without React renders per frame and pauses when hidden', () => {
    const originalState = AppState.currentState;
    AppState.currentState = 'active';
    const listeners = new Set<(state: AppStateStatus) => void>();
    const subscription = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      listeners.add(listener); return { remove: () => listeners.delete(listener) };
    });
    try {
      const goals: ObjectiveDefinition[] = (['sword', 'fire', 'lightning', 'spirit'] as const)
        .map(kind => ({ ...collect(kind, kind), chargeTier: 5 }));
      act(() => { renderer = create(info(goals, {}, false, false)); });
      act(() => goals.forEach((goal, index) => view(`objective-${goal.id}`).props.onLayout({
        nativeEvent: { layout: { x: index * 90, y: 0, width: 90, height: 36 } },
      })));
      expect(mockClocks).toHaveLength(2);
      expect(mockClocks.every(clock => clock.active)).toBe(true);
      const sprites = tileSprites();
      expect(new Set(sprites.map(node => node.props.elapsedMs)).size).toBe(1);
      expect(new Set(sprites.map(node => node.props.particlePhase)).size).toBe(1);
      const atlasAnimations = Object.values(TIER5_IDLE_ANIMATIONS);
      expect(atlasAnimations).toHaveLength(4);
      const calls = jest.mocked(useImage).mock.calls.length;
      act(() => { for (let frame = 0; frame < 120; frame++) mockClocks.forEach(clock => clock.callback({ timeSincePreviousFrame: 16 })); });
      expect(jest.mocked(useImage).mock.calls).toHaveLength(calls);
      expect(sprites[0].props.elapsedMs.value).toBe(1920);
      act(() => listeners.forEach(listener => listener('background')));
      expect(mockClocks.every(clock => !clock.active)).toBe(true);
      act(() => listeners.forEach(listener => listener('active')));
      expect(mockClocks.every(clock => clock.active)).toBe(true);
      mockFocused = false;
      act(() => renderer.update(info(goals, {}, false, false)));
      expect(mockClocks.every(clock => !clock.active)).toBe(true);
      act(() => renderer.unmount());
      expect(listeners.size).toBe(0);
    } finally { subscription.mockRestore(); AppState.currentState = originalState; }
  });

  it('does not mount animation clocks or a tile canvas for ordinary collection', () => {
    act(() => { renderer = create(info([collect('all')])); });
    expect(mockClocks).toHaveLength(0);
    expect(renderer.root.findAll(node => node.type === 'Canvas' as never)).toHaveLength(0);
  });

  it('shares decoded images between the board and HUD instead of loading another sprite sheet', () => {
    let boardImage: unknown;
    function BoardImageConsumer() { boardImage = useGameTileImage(ART.tileSword5Idle); return null; }
    const goals: ObjectiveDefinition[] = [{ ...collect('five'), chargeTier: 5 }];
    act(() => { renderer = create(React.createElement(GameTileImageProvider, {},
      React.createElement(BoardImageConsumer), info(goals))); });
    act(() => view('objective-five').props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 90, height: 36 } } }));
    expect(tileSprites()[0].props.idleImage).toBe(boardImage);
    expect(jest.mocked(useImage).mock.calls.filter(([source]) => source === ART.tileSword5Idle)).toHaveLength(1);
  });

  it('falls back to the tier artwork when the sprite sheet has not loaded', () => {
    jest.mocked(useImage).mockImplementation((asset: any) => asset === ART.tileSword5Idle ? null : { asset } as any);
    try {
      act(() => { renderer = create(info([{ ...collect('five'), chargeTier: 5 }])); });
      act(() => view('objective-five').props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 90, height: 36 } } }));
      expect(renderer.root.findAll(node => node.type === 'Atlas' as never)).toHaveLength(0);
      expect(renderer.root.findAll(node => node.type === 'SkiaImage' as never)).toHaveLength(1);
      expect(tileSprites()[0].props.image).toEqual({ asset: ART.tileSword5 });
    } finally { jest.mocked(useImage).mockImplementation((asset: any) => asset ? { asset } as any : null); }
  });
});
