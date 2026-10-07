import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AccessibilityInfo, AppState, type AppStateStatus } from 'react-native';
import { cancelAnimation, withRepeat } from 'react-native-reanimated';
import { FloatingCultivator } from '../FloatingCultivator';

jest.mock('expo-image', () => ({ Image: require('react-native').View }));
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: require('react-native').View },
  useSharedValue: (value: number) => {
    mockOffset = require('react').useRef({ value }).current;
    return mockOffset;
  },
  useAnimatedStyle: (fn: () => unknown) => fn(),
  useReducedMotion: () => mockReducedMotion,
  cancelAnimation: jest.fn(),
  withTiming: jest.fn((value: number) => value),
  withRepeat: jest.fn((value: number) => value),
  Easing: { sin: jest.fn(), inOut: (fn: unknown) => fn },
}));

let mockFocused = true;
let mockReducedMotion = false;
let mockOffset: { value: number };
const originalAppState = AppState.currentState;

describe('floating cultivator lifecycle', () => {
  let renderer: ReactTestRenderer;
  let appChanged: (state: AppStateStatus) => void;
  let motionChanged: (enabled: boolean) => void;
  const removeAppListener = jest.fn();
  const removeMotionListener = jest.fn();
  const mount = async () => { await act(async () => { renderer = create(React.createElement(FloatingCultivator)); }); };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFocused = true;
    mockReducedMotion = false;
    AppState.currentState = 'active';
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appChanged = listener;
      return { remove: removeAppListener };
    });
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((_event: string, listener: (enabled: boolean) => void) => {
      motionChanged = listener;
      return { remove: removeMotionListener };
    }) as unknown as typeof AccessibilityInfo.addEventListener);
  });
  afterEach(() => {
    act(() => { renderer?.unmount(); });
    jest.restoreAllMocks();
  });
  afterAll(() => { AppState.currentState = originalAppState; });

  it('floats only while focused and active, then resumes after foregrounding', async () => {
    await mount();
    expect(withRepeat).toHaveBeenCalledTimes(1);
    jest.mocked(withRepeat).mockClear();
    jest.mocked(cancelAnimation).mockClear();
    act(() => { appChanged('background'); });
    expect(cancelAnimation).toHaveBeenCalled();
    expect(withRepeat).not.toHaveBeenCalled();
    expect(mockOffset.value).toBe(0);
    act(() => { appChanged('active'); });
    expect(withRepeat).toHaveBeenCalledTimes(1);
    jest.mocked(withRepeat).mockClear();
    mockFocused = false;
    act(() => { renderer.update(React.createElement(FloatingCultivator)); });
    expect(withRepeat).not.toHaveBeenCalled();
    expect(mockOffset.value).toBe(0);
  });

  it('stops immediately when Reduce Motion changes and resumes when disabled', async () => {
    await mount();
    jest.mocked(withRepeat).mockClear();
    act(() => { motionChanged(true); });
    expect(mockOffset.value).toBe(0);
    expect(withRepeat).not.toHaveBeenCalled();
    act(() => { motionChanged(false); });
    expect(withRepeat).toHaveBeenCalledTimes(1);
  });

  it('does not start with Reduce Motion already enabled', async () => {
    mockReducedMotion = true;
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    await mount();
    expect(withRepeat).not.toHaveBeenCalled();
    expect(mockOffset.value).toBe(0);
  });

  it('does not let a delayed preference read overwrite a newer accessibility event', async () => {
    let resolve!: (value: boolean) => void;
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockReturnValue(new Promise(done => { resolve = done; }));
    act(() => { renderer = create(React.createElement(FloatingCultivator)); });
    act(() => { motionChanged(true); });
    jest.mocked(withRepeat).mockClear();
    await act(async () => { resolve(false); });
    expect(mockOffset.value).toBe(0);
    expect(withRepeat).not.toHaveBeenCalled();
  });

  it('cancels the animation and removes subscriptions when unmounted', async () => {
    await mount();
    jest.mocked(cancelAnimation).mockClear();
    act(() => { renderer.unmount(); });
    expect(cancelAnimation).toHaveBeenCalled();
    expect(removeAppListener).toHaveBeenCalledTimes(1);
    expect(removeMotionListener).toHaveBeenCalledTimes(1);
  });
});
