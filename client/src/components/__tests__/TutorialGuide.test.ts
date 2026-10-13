import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, StyleSheet, type AppStateStatus } from 'react-native';
import { cancelAnimation, withRepeat, withTiming } from 'react-native-reanimated';
import { TutorialGuide } from '../TutorialGuide';
import { TUTORIAL_CYCLE_MS, TUTORIAL_FINGERTIP, tutorialFrame, tutorialGeometry } from '../tutorialPresentation';

jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: require('react-native').View },
  useSharedValue: (value: number) => {
    mockPhase = require('react').useRef({ value }).current;
    return mockPhase;
  },
  useAnimatedStyle: (fn: () => unknown) => fn(),
  cancelAnimation: jest.fn(),
  withTiming: jest.fn((value: number) => value),
  withRepeat: jest.fn(() => .15),
  Easing: { linear: (value: number) => value },
}));

let mockFocused = true;
let mockPhase: { value: number };
const originalAppState = AppState.currentState;
const move = { key: 'run:0', from: { x: 2, y: 1 }, to: { x: 2, y: 2 }, text: 'Kéo viên Kiếm xuống để ghép 3 viên.' };
const geometry = tutorialGeometry(move, 280, { width: 7, height: 7 });

describe('tutorial movement and label layout', () => {
  it('fades between loops and moves the fingertip exactly between cell centers', () => {
    expect(tutorialFrame(0, geometry, 60).opacity).toBe(0);
    expect(tutorialFrame(1, geometry, 60).opacity).toBe(0);
    for (const [phase, center] of [[.15, geometry.from], [.7, geometry.to]] as const) {
      const frame = tutorialFrame(phase, geometry, 60);
      expect(frame.handX + geometry.handSize * TUTORIAL_FINGERTIP.x).toBeCloseTo(center.x);
      expect(frame.handY + geometry.handSize * TUTORIAL_FINGERTIP.y).toBeCloseTo(center.y);
      expect(frame.opacity).toBe(1);
    }
  });

  it.each([140, 220, 308])('keeps a long wrapped label inside a small board of width %s', side => {
    for (const [from, to] of [
      [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      [{ x: 6, y: 7 }, { x: 6, y: 6 }],
      [{ x: 2, y: 3 }, { x: 2, y: 4 }],
    ]) {
      const layout = tutorialGeometry({ ...move, from, to }, side, { width: 7, height: 8 });
      for (const phase of [0, .15, .4, .7, .9, 1]) {
        const frame = tutorialFrame(phase, layout, 78);
        expect(frame.textX).toBeGreaterThanOrEqual(6);
        expect(frame.textX + frame.textWidth).toBeLessThanOrEqual(side - 6);
        expect(frame.textY).toBeGreaterThanOrEqual(6);
        expect(frame.textY + 78).toBeLessThanOrEqual(layout.height - 6);
      }
    }
  });

  it('follows the authored down/down/up gestures for maps 1 and 2', () => {
    const maps = require('../../../../content/game-maps.json').slice(0, 2);
    const directions: number[] = [];
    for (const map of maps) for (const step of map.tutorial.steps) {
      const height = map.layout.length, width = map.layout[0].length;
      const layout = tutorialGeometry({ key: 'step', text: step.text,
        from: { x: step.from.column - 1, y: height - step.from.row },
        to: { x: step.to.column - 1, y: height - step.to.row },
      }, width * 40, { width, height });
      directions.push(Math.sign(layout.to.y - layout.from.y));
      for (const phase of [.15, .7]) {
        const frame = tutorialFrame(phase, layout, 78);
        expect(frame.handY).toBeGreaterThanOrEqual(0);
        expect(frame.handY + layout.handSize).toBeLessThanOrEqual(layout.height);
        const center = phase === .15 ? layout.from : layout.to;
        expect(frame.handY + layout.handSize * layout.fingertip.y).toBeCloseTo(center.y);
      }
    }
    expect(directions).toEqual([1, 1, -1]);
  });
});

describe('tutorial animation lifecycle', () => {
  let renderer: ReactTestRenderer;
  let appChanged: (state: AppStateStatus) => void;
  const removeListener = jest.fn();
  const props = { geometry, text: move.text, visible: true, reduceMotion: false };
  const mount = (extra = {}) => act(() => { renderer = create(React.createElement(TutorialGuide, { ...props, ...extra })); });
  const update = (extra = {}) => act(() => { renderer.update(React.createElement(TutorialGuide, { ...props, ...extra })); });

  beforeEach(() => {
    jest.clearAllMocks(); mockFocused = true; AppState.currentState = 'active';
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appChanged = listener;
      return { remove: removeListener };
    });
  });
  afterEach(() => { act(() => renderer?.unmount()); jest.restoreAllMocks(); });
  afterAll(() => { AppState.currentState = originalAppState; });

  it('loops indefinitely with a 1.8 second cycle without restarting on unrelated renders', () => {
    mount();
    expect(withTiming).toHaveBeenCalledWith(1, { duration: TUTORIAL_CYCLE_MS, easing: expect.any(Function) });
    expect(withRepeat).toHaveBeenCalledWith(1, -1, false);
    update();
    expect(withRepeat).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAll(node => node.props.testID === 'tutorial-guide')[0].props.pointerEvents).toBe('none');
  });

  it('cancels and hides while dismissed, backgrounded, or unfocused', () => {
    mount();
    act(() => appChanged('background'));
    expect(renderer.toJSON()).toBeNull();
    expect(cancelAnimation).toHaveBeenCalled();
    act(() => appChanged('active'));
    expect(withRepeat).toHaveBeenCalledTimes(2);
    mockFocused = false; update();
    expect(renderer.toJSON()).toBeNull();
    mockFocused = true; update({ visible: false });
    expect(renderer.toJSON()).toBeNull();
    expect(withRepeat).toHaveBeenCalledTimes(2);
  });

  it('shows a static opaque hand with reduced motion and cancels on unmount', () => {
    mount({ reduceMotion: true });
    expect(withRepeat).not.toHaveBeenCalled();
    expect(mockPhase.value).toBe(.15);
    const hand = renderer.root.findAll(node => node.props.testID === 'tutorial-hand')[0];
    expect(StyleSheet.flatten(hand.props.style).opacity).toBe(1);
    jest.mocked(cancelAnimation).mockClear();
    act(() => renderer.unmount());
    expect(cancelAnimation).toHaveBeenCalled();
    expect(removeListener).toHaveBeenCalledTimes(1);
  });
});
