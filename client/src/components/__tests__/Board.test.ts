import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { StyleSheet, Text, View } from 'react-native';
import { Board, type BoardVisualEffect } from '../Board';
import { BoardEngine } from '../../game/BoardEngine';
import { getLevel } from '../../game/levels';
import { TileKind } from '../../game/types';
import { Gesture } from 'react-native-gesture-handler';
import { cancelAnimation, withTiming } from 'react-native-reanimated';

jest.mock('react-native-gesture-handler', () => ({
  Gesture: {
    Pan: jest.fn(() => {
      const gesture: { enabled: jest.Mock; minDistance: jest.Mock; onEnd: jest.Mock } = {
        enabled: jest.fn(() => gesture),
        minDistance: jest.fn(() => gesture),
        onEnd: jest.fn(() => gesture),
      };
      return gesture;
    }),
  },
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-worklets', () => ({
  runOnUI: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
    if (mockQueueUI) mockUIQueue.push(() => fn(...args));
    else fn(...args);
  },
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
}));

jest.mock('react-native-reanimated', () => ({
  makeMutable: (value: unknown) => ({ value }),
  useAnimatedReaction: (prepare: () => unknown, react: (value: unknown) => void, dependencies: unknown[]) => {
    require('react').useEffect(() => {
      const run = () => react(prepare());
      mockReactions.push(run);
      run();
    }, dependencies);
  },
  cancelAnimation: jest.fn(),
  withTiming: jest.fn((value: number) => value),
  withSequence: (...values: number[]) => values[values.length - 1],
}));

let mockQueueUI = false;
const mockUIQueue: (() => unknown)[] = [];
const mockReactions: (() => void)[] = [];

jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const host = (name: string) => (props: { children?: React.ReactNode }) => React.createElement(name, props, props.children);
  const buffer = (size: number, create: () => unknown, modifier: (value: never, index: number) => void) => {
    const value = Array.from({ length: size }, create);
    value.forEach((item, index) => modifier(item as never, index));
    return { value };
  };
  return {
    Canvas: host('Canvas'), Group: host('Group'), Image: host('SkiaImage'), Atlas: host('Atlas'),
    RoundedRect: host('RoundedRect'), Paragraph: host('Paragraph'), Paint: host('Paint'),
    FontWeight: { Black: 900 },
    useImage: jest.fn((asset: number) => ({ asset, width: () => 1024, height: () => 512 })),
    useRectBuffer: jest.fn((size: number, modifier: (value: never, index: number) => void) => buffer(size, () => ({
      setXYWH(x: number, y: number, width: number, height: number) { Object.assign(this, { x, y, width, height }); },
    }), modifier)),
    useRSXformBuffer: jest.fn((size: number, modifier: (value: never, index: number) => void) => buffer(size, () => ({
      set(...values: number[]) { Object.assign(this, { values }); },
    }), modifier)),
    useColorBuffer: jest.fn((size: number, modifier: (value: never, index: number) => void) => buffer(size, () => new Float32Array(4), modifier)),
    Skia: {
      Color: (color: string) => color,
      XYWHRect: (x: number, y: number, width: number, height: number) => ({ x, y, width, height }),
      ParagraphBuilder: {
        Make: (options: { textStyle: Record<string, unknown> }) => {
          // Native JSI treats present-but-undefined style properties as errors.
          if (Object.values(options.textStyle).some(value => value === undefined)) throw new Error('Invalid native paragraph style');
          let text = '';
          const builder = {
            addText: (value: string) => { text = value; return builder; },
            build: () => ({ text, layout: () => {}, getLongestLine: () => text.length * Number(options.textStyle.fontSize), getHeight: () => Number(options.textStyle.fontSize) * 1.2 }),
          };
          return builder;
        },
      },
    },
  };
});

describe('Skia Board integration', () => {
  let renderer: ReactTestRenderer;
  const snapshot = new BoardEngine(getLevel(5)).snapshot();
  snapshot.tiles[42] = { kind: TileKind.SpiritOrb, chargeTier: 5, locked: true };
  const onCellPress = jest.fn(), onSwipe = jest.fn();
  const props = { snapshot, selected: null, onCellPress, onSwipe };

  function mount(extra: Partial<React.ComponentProps<typeof Board>> = {}) {
    act(() => { renderer = create(React.createElement(Board, { ...props, ...extra })); });
    const grid = renderer.root.findAllByType(View).find(node => typeof node.props.onLayout === 'function')!;
    act(() => { grid.props.onLayout({ nativeEvent: { layout: { width: 350, height: 350 } } }); });
  }

  const buttons = () => renderer.root.findAll(node => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function');
  const tile = (index: number) => renderer.root.findAll(node => node.type === 'Group' as never &&
    node.props.origin?.x === index % 7 * 50 + 25 && node.props.origin?.y === (6 - Math.floor(index / 7)) * 50 + 25)[0];

  beforeEach(() => { mockQueueUI = false; mockUIQueue.length = 0; mockReactions.length = 0; });
  afterEach(() => { act(() => { renderer?.unmount(); }); });

  it('renders one canvas and keeps 49 correctly positioned accessible buttons', () => {
    mount();
    expect(renderer.root.findAll(node => node.type === 'Canvas' as never)).toHaveLength(1);
    expect(renderer.root.findAll(node => node.type === 'SkiaImage' as never)).toHaveLength(49);
    const cells = buttons();
    expect(cells).toHaveLength(49);
    expect(cells[0].props.accessibilityLabel).toContain('cường hóa 5, phong ấn, hàng 7, cột 1');
    expect(StyleSheet.flatten(cells[0].props.style)).toMatchObject({ left: 1, top: 1, width: 48, height: 48 });
    expect(StyleSheet.flatten(cells[48].props.style)).toMatchObject({ left: 301, top: 301, width: 48, height: 48 });
    act(() => { cells[0].props.onPress(); });
    expect(onCellPress).toHaveBeenCalledWith(0, 6);
    const clipped = renderer.root.findAll(node => node.type === 'Group' as never && node.props.clip);
    expect(clipped).toHaveLength(1);
    expect(clipped[0].props.clip).toEqual({ x: 0, y: 0, width: 350, height: 350 });
  });

  it('preserves swipe coordinates and disables swiping while locked or targeting', () => {
    mount();
    const latestGesture = () => (Gesture.Pan as jest.Mock).mock.results.at(-1)!.value;
    act(() => { latestGesture().onEnd.mock.calls[0][0]({ x: 75, y: 325, translationX: 50, translationY: 0 }); });
    expect(onSwipe).toHaveBeenCalledWith(0, 0, 1, 0);
    act(() => { renderer.update(React.createElement(Board, { ...props, locked: true })); });
    expect(latestGesture().enabled).toHaveBeenCalledWith(false);
    expect(buttons()).toHaveLength(49);
    expect(buttons().every(node => node.props.disabled)).toBe(true);
    act(() => { renderer.update(React.createElement(Board, { ...props, targetingHint: 'Chọn một ô' })); });
    expect(latestGesture().enabled).toHaveBeenCalledWith(false);
    expect(buttons().every(node => !node.props.disabled)).toBe(true);
    act(() => { renderer.update(React.createElement(Board, { ...props, targetingHint: 'Chọn một ô', showTargetingHint: false })); });
    expect(latestGesture().enabled).toHaveBeenCalledWith(false);
    expect(renderer.root.findAllByType(Text).some(node => node.props.children === 'Chọn một ô')).toBe(false);
  });

  it.each([175, 350])('keeps the seal label inside its tile at grid width %s', side => {
    mount();
    const grid = renderer.root.findAllByType(View).find(node => typeof node.props.onLayout === 'function')!;
    act(() => { grid.props.onLayout({ nativeEvent: { layout: { width: side, height: side } } }); });
    const seal = renderer.root.findAll(node => node.type === 'Paragraph' as never && node.props.paragraph.text === '封')[0];
    const bounds = StyleSheet.flatten(buttons()[0].props.style);
    expect(seal.props.x).toBeGreaterThanOrEqual(bounds.left);
    expect(seal.props.y).toBeGreaterThanOrEqual(bounds.top);
    expect(seal.props.x + seal.props.width).toBeLessThanOrEqual(bounds.left + bounds.width);
    expect(seal.props.y + seal.props.paragraph.getHeight()).toBeLessThanOrEqual(bounds.top + bounds.height);
  });

  it('uses the slower timing sequence, ignores HUD-only updates and cancels on cleanup', () => {
    const effect: BoardVisualEffect = { id: 1, kind: 'clear', cleared: [0], changed: [1], effects: [{ kind: 'fire', cells: [0], source: 0, damage: 0, qi: 0 }] };
    mount({ visualEffect: effect });
    expect((withTiming as jest.Mock).mock.calls).toEqual([
      [1, { duration: 800 }], [1.12, { duration: 150 }], [1, { duration: 650 }],
      [.85, { duration: 105 }], [0, { duration: 695 }],
    ]);
    (withTiming as jest.Mock).mockClear();
    act(() => { renderer.update(React.createElement(Board, { ...props, snapshot: { ...snapshot, swordQi: 12 }, visualEffect: effect })); });
    expect(withTiming).not.toHaveBeenCalled();
    act(() => { renderer.update(React.createElement(Board, { ...props, visualEffect: { id: 2, kind: 'reject', first: { x: 0, y: 0 }, second: { x: 1, y: 0 } } })); });
    expect((withTiming as jest.Mock).mock.calls).toEqual([[.38, { duration: 165 }], [0, { duration: 225 }]]);
    expect(cancelAnimation).toHaveBeenCalled();
  });

  it('uses a 1000ms clear timeline for lightning', () => {
    mount({ visualEffect: {
      id: 11, kind: 'clear', cleared: [0, 1], changed: [],
      effects: [{ kind: 'lightning', cells: [1], source: 0, damage: 0, qi: 0 }],
    } });
    expect((withTiming as jest.Mock).mock.calls).toEqual([
      [1, { duration: 1000 }], [1.12, { duration: 150 }], [1, { duration: 850 }],
      [.85, { duration: 105 }], [0, { duration: 895 }],
    ]);
  });

  it('does not start animation when reduced motion is enabled', () => {
    mount({ reduceMotion: true, visualEffect: { id: 3, kind: 'fall', falls: [{ index: 0, fromY: 7 }] } });
    expect(withTiming).not.toHaveBeenCalled();
  });

  it('draws fire flipbook and particles from one phase atlas batch', () => {
    mount({ visualEffect: {
      id: 70, kind: 'clear', cleared: [0, 1], changed: [],
      effects: [{ kind: 'fire', cells: [0, 1], source: 0, damage: 2, qi: 0 }],
    } });
    const atlases = renderer.root.findAll(node => node.type === 'Atlas' as never);
    expect(atlases).toHaveLength(2);
    expect(atlases[0].props.sprites.value).toHaveLength(1);
    expect(atlases[1].props.sprites).toHaveLength(16);
    expect(atlases[1].props.transforms.value).toHaveLength(16);
  });

  it('draws chained lightning sprite segments and impacts only for the active cue', () => {
    mount({ visualEffect: {
      id: 71, kind: 'clear', cleared: [0, 1, 8], changed: [],
      effects: [{ kind: 'lightning', cells: [1, 8], source: 0, damage: 3, qi: 0 }],
    } });
    const atlases = renderer.root.findAll(node => node.type === 'Atlas' as never);
    expect(atlases).toHaveLength(1);
    expect(atlases[0].props.sprites.length).toBeGreaterThan(2);
    expect(atlases[0].props.transforms.value).toHaveLength(atlases[0].props.sprites.length);
  });

  it('keeps the same effect phase and atlas cues through HUD-only updates', () => {
    const effect: BoardVisualEffect = {
      id: 72, kind: 'clear', cleared: [0], changed: [],
      effects: [{ kind: 'fire', cells: [0], source: 0, damage: 1, qi: 0 }],
    };
    mount({ visualEffect: effect });
    (withTiming as jest.Mock).mockClear();
    act(() => renderer.update(React.createElement(Board, {
      ...props,
      snapshot: { ...snapshot, swordQi: snapshot.swordQi + 1 },
      visualEffect: { ...effect, effects: effect.effects.map(item => ({ ...item })) },
    })));
    expect(withTiming).not.toHaveBeenCalled();
    expect(renderer.root.findAll(node => node.type === 'Atlas' as never)).toHaveLength(2);
  });

  it('skips the sprite emitter when reduced motion is enabled', () => {
    mount({ reduceMotion: true, visualEffect: {
      id: 73, kind: 'clear', cleared: [0], changed: [],
      effects: [{ kind: 'lightning', cells: [0], source: 1, damage: 1, qi: 0 }],
    } });
    expect(renderer.root.findAll(node => node.type === 'Atlas' as never)).toHaveLength(0);
    expect(withTiming).not.toHaveBeenCalled();
  });

  it.each(['clear', 'idle'] as const)('keeps a landed tile still when an old UI reaction runs after transition to %s', next => {
    mount({ visualEffect: { id: 10, kind: 'fall', falls: [{ index: 7, fromY: 4 }] } });
    const oldTile = tile(7), oldTransform = oldTile.props.transform;
    const oldReaction = mockReactions.at(-1)!;
    expect(oldTransform.value).toEqual([{ translateX: 0 }, { translateY: 0 }, { scale: 1 }]);
    const canvas = renderer.root.findAll(node => node.type === 'Canvas' as never)[0];
    const sprite = oldTile.findAll(node => node.type === 'SkiaImage' as never)[0];
    act(() => renderer.update(React.createElement(Board, { ...props, visualEffect: next === 'clear'
      ? { id: 11, kind: 'clear', cleared: [48], changed: [], effects: [{ kind: 'fire', cells: [48], source: 48, damage: 1, qi: 0 }] }
      : null })));
    oldReaction();
    expect(oldTransform.value).toEqual([{ translateX: 0 }, { translateY: 0 }, { scale: 1 }]);
    expect(tile(7)).toBe(oldTile);
    expect(tile(7).props.transform).toBeUndefined();
    expect(renderer.root.findAll(node => node.type === 'Canvas' as never)[0]).toBe(canvas);
    expect(tile(7).findAll(node => node.type === 'SkiaImage' as never)[0]).toBe(sprite);
  });

  it('initializes the new fall at its source even while UI worklets are queued', () => {
    mockQueueUI = true;
    mount({ visualEffect: { id: 20, kind: 'fall', falls: [{ index: 7, fromY: 4 }] } });
    expect(tile(7).props.transform.value).toEqual([{ translateX: 0 }, { translateY: -150 }, { scale: 1 }]);
    const oldTransform = tile(7).props.transform;
    act(() => renderer.update(React.createElement(Board, { ...props, visualEffect: {
      id: 21, kind: 'fall', falls: [{ index: 48, fromY: 7 }],
    } })));
    const nextTransform = tile(48).props.transform;
    expect(nextTransform.value).toEqual([{ translateX: 0 }, { translateY: -50 }, { scale: 1 }]);
    // Even a late cleanup of the old phase cannot cancel or finish the new fall.
    act(() => { mockUIQueue[1](); });
    expect(oldTransform.value).toEqual([{ translateX: 0 }, { translateY: 0 }, { scale: 1 }]);
    expect(nextTransform.value).toEqual([{ translateX: 0 }, { translateY: -50 }, { scale: 1 }]);
    act(() => { mockUIQueue[2](); mockReactions.at(-1)!(); });
    expect(nextTransform.value).toEqual([{ translateX: 0 }, { translateY: 0 }, { scale: 1 }]);
  });

  it('does not restart a phase for equivalent effect objects or selection updates', () => {
    const effect: BoardVisualEffect = { id: 30, kind: 'fall', falls: [{ index: 7, fromY: 4 }] };
    mount({ visualEffect: effect });
    const transform = tile(7).props.transform;
    (withTiming as jest.Mock).mockClear();
    act(() => renderer.update(React.createElement(Board, { ...props, selected: { x: 2, y: 2 },
      snapshot: { ...snapshot, swordQi: 22 }, visualEffect: { ...effect } })));
    expect(tile(7).props.transform).toBe(transform);
    expect(withTiming).not.toHaveBeenCalled();
  });

  it('starts a new run with fresh clocks even when the effect ID is reused', () => {
    const effect: BoardVisualEffect = { id: 40, kind: 'fall', falls: [{ index: 7, fromY: 4 }] };
    mount({ visualEffect: effect });
    const transform = tile(7).props.transform;
    act(() => renderer.update(React.createElement(Board, { ...props,
      snapshot: { ...snapshot, runId: 'another-run' }, visualEffect: effect })));
    expect(tile(7).props.transform).not.toBe(transform);
    expect(transform.value).toEqual([{ translateX: 0 }, { translateY: 0 }, { scale: 1 }]);
  });

  it('retires motion when reduced motion changes without hiding the current clear on reenable', () => {
    const effect: BoardVisualEffect = { id: 50, kind: 'clear', cleared: [7], changed: [], effects: [] };
    mount({ visualEffect: effect });
    const oldOpacity = tile(7).props.layer.props.opacity;
    act(() => renderer.update(React.createElement(Board, { ...props, visualEffect: effect, reduceMotion: true })));
    expect(tile(7).props.transform).toBeUndefined();
    expect(tile(7).props.layer).toBeUndefined();
    expect(oldOpacity.value).toBe(0);
    act(() => renderer.update(React.createElement(Board, { ...props, visualEffect: effect, reduceMotion: false })));
    expect(tile(7)).toBeDefined();
    expect(tile(7).props.layer.props.opacity).not.toBe(oldOpacity);
  });

  it('fades sprite and text together and keeps prior cleared cells absent', () => {
    const first: BoardVisualEffect = { id: 4, kind: 'clear', cleared: [42], changed: [], effects: [{ kind: 'spirit', cells: [42], damage: 0, qi: 10 }] };
    mount({ visualEffect: first });
    const layers = () => renderer.root.findAll(node => node.type === 'Group' as never && node.props.layer);
    expect(layers()).toHaveLength(1);
    expect(layers()[0].props.layer.props.opacity).toEqual({ value: 0 });
    expect(renderer.root.findAll(node => node.type === 'SkiaImage' as never)).toHaveLength(49);
    const second: BoardVisualEffect = { id: 5, kind: 'clear', cleared: [42, 43], changed: [], effects: [{ kind: 'fire', cells: [43], source: 42, damage: 1, qi: 1 }] };
    act(() => { renderer.update(React.createElement(Board, { ...props, visualEffect: second })); });
    expect(renderer.root.findAll(node => node.type === 'SkiaImage' as never)).toHaveLength(48);
    expect(layers()).toHaveLength(1);
    act(() => { renderer.update(React.createElement(Board, { ...props, visualEffect: { id: 6, kind: 'fall', falls: [{ index: 42, fromY: 7 }] } })); });
    expect(renderer.root.findAll(node => node.type === 'SkiaImage' as never)).toHaveLength(49);
    expect(layers()).toHaveLength(0);
    expect(withTiming).toHaveBeenLastCalledWith(1, { duration: 450 });
  });
});
