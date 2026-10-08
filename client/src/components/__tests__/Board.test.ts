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
  runOnUI: (fn: (...args: unknown[]) => unknown) => fn,
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
}));

jest.mock('react-native-reanimated', () => ({
  useSharedValue: (value: number) => require('react').useRef({ value }).current,
  useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
  cancelAnimation: jest.fn(),
  withTiming: jest.fn((value: number) => value),
  withSequence: (...values: number[]) => values[values.length - 1],
}));

jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const host = (name: string) => (props: { children?: React.ReactNode }) => React.createElement(name, props, props.children);
  return {
    Canvas: host('Canvas'), Group: host('Group'), Image: host('SkiaImage'),
    RoundedRect: host('RoundedRect'), Paragraph: host('Paragraph'), Paint: host('Paint'),
    FontWeight: { Black: 900 },
    useImage: jest.fn((asset: number) => ({ asset })),
    Skia: {
      Color: (color: string) => color,
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
    const effect: BoardVisualEffect = { id: 1, kind: 'clear', cleared: [0], changed: [1], effects: [{ kind: 'fire', cells: [0], damage: 0, qi: 0 }] };
    mount({ visualEffect: effect });
    expect((withTiming as jest.Mock).mock.calls).toEqual([
      [1, { duration: 360 }], [1.12, { duration: 150 }], [1, { duration: 210 }],
      [.85, { duration: 105 }], [0, { duration: 255 }],
    ]);
    (withTiming as jest.Mock).mockClear();
    act(() => { renderer.update(React.createElement(Board, { ...props, snapshot: { ...snapshot, swordQi: 12 }, visualEffect: effect })); });
    expect(withTiming).not.toHaveBeenCalled();
    act(() => { renderer.update(React.createElement(Board, { ...props, visualEffect: { id: 2, kind: 'reject', first: { x: 0, y: 0 }, second: { x: 1, y: 0 } } })); });
    expect((withTiming as jest.Mock).mock.calls).toEqual([[.38, { duration: 165 }], [0, { duration: 225 }]]);
    expect(cancelAnimation).toHaveBeenCalled();
  });

  it('does not start animation when reduced motion is enabled', () => {
    mount({ reduceMotion: true, visualEffect: { id: 3, kind: 'fall', falls: [{ index: 0, fromY: 7 }] } });
    expect(withTiming).not.toHaveBeenCalled();
  });

  it('fades sprite and text together and keeps prior cleared cells absent', () => {
    const first: BoardVisualEffect = { id: 4, kind: 'clear', cleared: [42], changed: [], effects: [{ kind: 'spirit', cells: [42], damage: 0, qi: 10 }] };
    mount({ visualEffect: first });
    const layers = () => renderer.root.findAll(node => node.type === 'Group' as never && node.props.layer);
    expect(layers()).toHaveLength(1);
    expect(layers()[0].props.layer.props.opacity).toEqual({ value: 0 });
    expect(renderer.root.findAll(node => node.type === 'SkiaImage' as never)).toHaveLength(49);
    const second: BoardVisualEffect = { id: 5, kind: 'clear', cleared: [42, 43], changed: [], effects: [{ kind: 'fire', cells: [43], damage: 1, qi: 1 }] };
    act(() => { renderer.update(React.createElement(Board, { ...props, visualEffect: second })); });
    expect(renderer.root.findAll(node => node.type === 'SkiaImage' as never)).toHaveLength(48);
    expect(layers()).toHaveLength(1);
    act(() => { renderer.update(React.createElement(Board, { ...props, visualEffect: { id: 6, kind: 'fall', falls: [{ index: 42, fromY: 7 }] } })); });
    expect(renderer.root.findAll(node => node.type === 'SkiaImage' as never)).toHaveLength(49);
    expect(layers()).toHaveLength(0);
    expect(withTiming).toHaveBeenLastCalledWith(1, { duration: 450 });
  });
});
