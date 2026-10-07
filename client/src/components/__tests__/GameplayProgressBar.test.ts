import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { withTiming } from 'react-native-reanimated';
import { GameplayProgressBar } from '../GameplayProgressBar';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: require('react-native').View }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: require('react-native').View },
  useSharedValue: (value: number) => require('react').useRef({ value }).current,
  useAnimatedStyle: (style: () => unknown) => style(), withTiming: jest.fn((value: number) => value),
}));

describe('native gameplay progress bars', () => {
  let renderer: ReactTestRenderer;
  const view = (id: string) => renderer.root.findAllByType(View).find(node => node.props.testID === id)!;
  const mount = (props: Partial<React.ComponentProps<typeof GameplayProgressBar>> = {}) => {
    act(() => { renderer = create(React.createElement(GameplayProgressBar, { value: 50, max: 100, tone: 'health', accessibilityLabel: 'Máu yêu vương', ...props })); });
  };
  afterEach(() => { act(() => { renderer?.unmount(); }); });

  it.each([
    [-20, 100, 0], [0, 100, 0], [25, 100, 25], [100, 100, 100], [140, 100, 100],
    [50, 0, 0], [50, -10, 0], [NaN, 100, 0], [50, Infinity, 0],
  ])('clamps value %s / max %s to %s and fills the measured inner track', (value, max, current) => {
    mount({ value, max });
    const limit = Number.isFinite(max) && max > 0 ? max : 0;
    expect(view('game-health-bar').props.accessibilityValue).toEqual({ min: 0, max: limit, now: current });
    act(() => { view('game-health-track').props.onLayout({ nativeEvent: { layout: { width: 200 } } }); });
    expect(StyleSheet.flatten(view('game-health-fill').props.style).width).toBe(limit ? current / limit * 200 : 0);
    expect(renderer.root.findAllByType(View).some(node => node.props.source)).toBe(false);
  });

  it.each(['health', 'qi'] as const)('renders %s as a clipped pill with a native gradient', tone => {
    mount({ tone });
    expect(StyleSheet.flatten(view(`game-${tone}-bar`).props.style)).toMatchObject({ height: tone === 'health' ? 18 : 12, borderRadius: 999, overflow: 'hidden' });
    const gradient = renderer.root.findAllByType(LinearGradient).find(node => node.props.colors)!;
    expect(gradient.props.colors).toHaveLength(3);
    expect(view(`game-${tone}-bar`).props.accessibilityRole).toBe('progressbar');
  });

  it('animates HP changes with the requested duration and updates immediately when motion is disabled', () => {
    mount({ animated: true, duration: 180 });
    expect(withTiming).toHaveBeenLastCalledWith(0.5, { duration: 180 });
    act(() => { renderer.update(React.createElement(GameplayProgressBar, { value: 25, max: 100, tone: 'health', accessibilityLabel: 'Máu yêu vương', animated: true, duration: 180 })); });
    expect(withTiming).toHaveBeenLastCalledWith(0.25, { duration: 180 });
    jest.mocked(withTiming).mockClear();
    act(() => { renderer.update(React.createElement(GameplayProgressBar, { value: 10, max: 100, tone: 'health', accessibilityLabel: 'Máu yêu vương', animated: false })); });
    expect(withTiming).not.toHaveBeenCalled();
    expect(view('game-health-bar').props.accessibilityValue.now).toBe(10);
  });
});
