import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { StyleSheet, Text, View } from 'react-native';
import { cancelAnimation, withTiming } from 'react-native-reanimated';
import { ART } from '../../assets';
import { GameplayResultPopup, type GameplayResult } from '../GameplayResultPopup';
import { resultPanelScale, resultTimeline, starColorMatrix, starProgress } from '../gameplayResultVisuals';

jest.mock('expo-image', () => ({ Image: require('react-native').View }));
jest.mock('react-native-worklets', () => ({ runOnJS: (fn: () => void) => fn }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true, default: { View: require('react-native').View },
  useSharedValue: (value: number) => require('react').useRef({ value }).current,
  useAnimatedStyle: (fn: () => unknown) => fn(),
  useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
  Easing: { linear: (value: number) => value },
  withTiming: jest.fn((value: number, options: { duration: number }, complete: (finished: boolean) => void) => {
    setTimeout(() => complete(true), options.duration); return value;
  }),
  cancelAnimation: jest.fn(),
}));
jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const host = (name: string) => (props: { children?: React.ReactNode }) => React.createElement(name, props, props.children);
  const image = { generatedStar: true };
  return { Canvas: host('Canvas'), Image: host('SkiaImage'), ColorMatrix: host('ColorMatrix'), useImage: jest.fn(() => image) };
});

const win: GameplayResult = { kind: 'won', runId: 'test-result-run', summary: {
  runId: 'test-result-run', levelId: 4, stars: 3, bestStars: 3, expGained: 100, coinsGained: 125,
  totalExp: 1500, realmBefore: 0, realmAfter: 1,
} };

describe('result popup presentation and choreography', () => {
  let renderer: ReactTestRenderer;
  const onReady = jest.fn(), onContinue = jest.fn(), onBack = jest.fn();
  const props = { result: win, busy: false, reduceMotion: false, onReady, onContinue, onBack };
  const mount = (extra: Partial<typeof props> = {}) => { act(() => { renderer = create(React.createElement(GameplayResultPopup, { ...props, ...extra })); }); };
  const buttons = () => renderer.root.findAll(node => node.props.accessibilityRole === 'button' && typeof node.props.style === 'function');
  const button = (label: string) => buttons().find(node => node.props.accessibilityLabel === label)!;
  const texts = () => renderer.root.findAllByType(Text).map(node => node.props.children);
  const images = () => renderer.root.findAll(node => node.type === 'SkiaImage' as never);
  const matrices = () => renderer.root.findAll(node => node.type === 'ColorMatrix' as never).map(node => node.props.matrix.value);
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => { act(() => { renderer?.unmount(); }); jest.useRealTimers(); });

  it('uses the generated gold star with grayscale, then unlocks both buttons only after the full sequence', () => {
    mount();
    expect(buttons()).toHaveLength(2);
    expect(images()).toHaveLength(3);
    expect(matrices()).toEqual([starColorMatrix(0), starColorMatrix(0), starColorMatrix(0)]);
    const sources = renderer.root.findAllByType(View).map(node => node.props.source);
    expect(sources).toContain(ART.inventoryDialog);
    expect(sources).toContain(ART.buttonPrimary);
    expect(sources).toContain(ART.buttonSecondary);
    expect(sources).not.toContain(ART.gameplayResultPanel);
    expect(sources).not.toContain(ART.starGray);
    const panel = renderer.root.findAllByType(View).find(node => node.props.testID === 'result-panel')!;
    expect(StyleSheet.flatten(panel.props.style)).toMatchObject({ maxWidth: 360, aspectRatio: 800 / 671 });
    const panelArt = panel.findAllByType(View).find(node => node.props.source === ART.inventoryDialog)!;
    expect(panelArt.props.contentFit).toBe('contain');
    for (const node of buttons()) {
      expect(StyleSheet.flatten(node.props.style({ pressed: false })).height).toBe(44);
      const image = node.findAllByType(View).find(view => view.props.source === ART.buttonPrimary || view.props.source === ART.buttonSecondary)!;
      const dimensions = StyleSheet.flatten(image.props.style);
      expect(dimensions.width).toBe(168);
      expect(dimensions.width / dimensions.height).toBeCloseTo(image.props.source === ART.buttonPrimary ? 1400 / 363 : 1400 / 356);
      expect(image.props.contentFit).toBe('contain');
    }
    expect(require('@shopify/react-native-skia').useImage).toHaveBeenCalledWith(ART.gameplayResultStar, expect.any(Function));
    expect(buttons().every(button => button.props.disabled && !button.props.onPress)).toBe(true);
    act(() => { jest.advanceTimersByTime(1599); });
    expect(onReady).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(1); });
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(buttons().every(button => !button.props.disabled)).toBe(true);
    act(() => { button('QUAY VỀ').props.onPress(); button('TIẾP TỤC').props.onPress(); });
    expect(onBack).toHaveBeenCalledTimes(1); expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it.each([0, 1, 2, 3] as const)('honors reduced motion for %s stars and preserves gray unearned stars', stars => {
    const result: GameplayResult = { ...win, summary: { ...win.summary, stars } };
    mount({ result, reduceMotion: true });
    expect(matrices()).toEqual([0, 1, 2].map(index => starColorMatrix(index < stars ? 1 : 0)));
    expect(withTiming).not.toHaveBeenCalled(); expect(onReady).toHaveBeenCalledTimes(1);
    expect(buttons().every(button => !button.props.disabled)).toBe(true);
  });

  it('shows only positive rewards and has no stars or rewards on loss', () => {
    mount({ result: { ...win, summary: { ...win.summary, expGained: 0, coinsGained: 10 } }, reduceMotion: true });
    expect(texts().flat()).not.toContain('EXP');
    expect(renderer.root.findAllByType(Text).filter(node => node.props.accessibilityLabel === '+10 Linh Thạch')).toHaveLength(1);
    act(() => { renderer.update(React.createElement(GameplayResultPopup, { ...props, result: { kind: 'lost', runId: 'lost-run', levelId: 4 }, reduceMotion: true })); });
    expect(images()).toHaveLength(0); expect(texts()).toContain('HẾT LƯỢT'); expect(texts()).toContain('CHƠI LẠI');
    expect(renderer.root.findAll(node => node.props.testID === 'result-rewards')).toHaveLength(0);
  });

  it('does not replay the animation when reconciled rewards change and blocks actions while working', () => {
    mount(); act(() => { jest.advanceTimersByTime(1600); });
    act(() => { renderer.update(React.createElement(GameplayResultPopup, { ...props, result: { ...win, summary: { ...win.summary, expGained: 0, coinsGained: 10 } }, busy: true })); });
    expect(withTiming).toHaveBeenCalledTimes(1);
    expect(buttons().every(button => button.props.disabled && !button.props.onPress)).toBe(true);
  });

  it('stacks the primary action above return, keeps intrinsic ratios at both sizes and uses opacity on press', () => {
    mount({ reduceMotion: true });
    const actions = renderer.root.findAllByType(View).find(node => node.props.testID === 'result-actions')!;
    expect(StyleSheet.flatten(actions.props.style)).toMatchObject({ flexDirection: 'column', alignItems: 'center' });
    expect(buttons().map(node => node.props.accessibilityLabel)).toEqual(['TIẾP TỤC', 'QUAY VỀ']);
    const panel = renderer.root.findAllByType(View).find(node => node.props.testID === 'result-panel-motion')!;
    for (const [width, buttonWidth] of [[288, 168], [328, 168], [360, 184]]) {
      act(() => { panel.props.onLayout({ nativeEvent: { layout: { width } } }); });
      for (const node of buttons()) {
        const normal = StyleSheet.flatten(node.props.style({ pressed: false }));
        const pressed = StyleSheet.flatten(node.props.style({ pressed: true }));
        const image = node.findAllByType(View).find(view => view.props.source === ART.buttonPrimary || view.props.source === ART.buttonSecondary)!;
        const art = StyleSheet.flatten(image.props.style);
        expect(normal.width).toBe(buttonWidth); expect(normal.height).toBeGreaterThanOrEqual(44);
        expect(art.width).toBe(buttonWidth);
        expect(art.width / art.height).toBeCloseTo(image.props.source === ART.buttonPrimary ? 1400 / 363 : 1400 / 356);
        expect(pressed.transform).toBeUndefined(); expect(pressed.opacity).toBe(0.85);
      }
      expect(images().every(image => image.props.width === (width < 350 ? 48 : 64))).toBe(true);
    }
    act(() => { renderer.update(React.createElement(GameplayResultPopup, { ...props, result: { kind: 'lost', runId: 'lost-run', levelId: 4 }, reduceMotion: true })); });
    expect(buttons().map(node => node.props.accessibilityLabel)).toEqual(['CHƠI LẠI', 'QUAY VỀ']);
  });

  it('cancels animation and ignores a queued completion after unmount', () => {
    mount(); act(() => { renderer.unmount(); }); act(() => { jest.advanceTimersByTime(1600); });
    expect(cancelAnimation).toHaveBeenCalled(); expect(onReady).not.toHaveBeenCalled();
  });

  it('colors stars left to right with gaps and never changes sprite alpha', () => {
    expect([0, 1, 2].map(index => starProgress(490, index, true))).toEqual([0.5, 0, 0]);
    expect([0, 1, 2].map(index => starProgress(740, index, true))).toEqual([1, 0, 0]);
    expect([0, 1, 2].map(index => starProgress(890, index, true))).toEqual([1, 0.5, 0]);
    expect([0, 1, 2].map(index => starProgress(1290, index, index < 2))).toEqual([1, 1, 0]);
    for (const saturation of [0, 0.5, 1]) expect(starColorMatrix(saturation).slice(15)).toEqual([0, 0, 0, 1, 0]);
    expect(resultTimeline(3, true)).toEqual({ rewardStart: 1440, duration: 1600 });
    expect(resultTimeline(0, true)).toEqual({ rewardStart: 340, duration: 500 });
    expect(resultPanelScale(0)).toBe(0.72); expect(resultPanelScale(240)).toBe(1.04); expect(resultPanelScale(340)).toBe(1);
  });
});
