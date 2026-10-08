import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AccessibilityInfo, AppState, type AppStateStatus } from 'react-native';
import RootLayout from '../../../app/_layout';

jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: require('react-native').View }));
jest.mock('react-native-reanimated', () => ({}));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaProvider: require('react-native').View }));
jest.mock('expo-router', () => {
  const React = require('react');
  const View = require('react-native').View;
  const Stack = Object.assign(View, {
    Screen: () => null,
    Protected: ({ guard, children }: any) => guard ? React.createElement(View, null, children) : null,
  });
  return { Stack };
});
jest.mock('../../state/gameStore', () => ({
  useGameStore: Object.assign((selector: (state: typeof mockState) => unknown) => selector(mockState), { getState: () => mockState }),
}));
jest.mock('../ConnectionDialog', () => ({ ConnectionDialog: require('react-native').View }));
jest.mock('../../services/acceptance', () => ({ installAcceptanceBridge: jest.fn() }));

const mockState = { initialized: true, bootstrapLoaded: true, setForeground: jest.fn(), checkConnection: jest.fn() };

it('only updates foreground on resume and never schedules health polling', async () => {
  jest.useFakeTimers();
  const originalState = AppState.currentState;
  AppState.currentState = 'active';
  let onChange!: (state: AppStateStatus) => void;
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    onChange = listener;
    return { remove };
  });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const interval = jest.spyOn(global, 'setInterval');
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(React.createElement(RootLayout)); });
    expect(mockState.setForeground).toHaveBeenLastCalledWith(true);
    act(() => { onChange('background'); onChange('active'); });
    expect(mockState.setForeground.mock.calls.map(call => call[0])).toEqual([true, false, true]);
    await act(async () => { await jest.advanceTimersByTimeAsync(90_000); });
    expect(interval).not.toHaveBeenCalled();
    expect(mockState.checkConnection).not.toHaveBeenCalled();
    act(() => renderer.unmount());
    expect(remove).toHaveBeenCalledTimes(1);
  } finally {
    AppState.currentState = originalState;
    jest.restoreAllMocks();
    jest.useRealTimers();
  }
});
