import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { StyleSheet, View } from 'react-native';
import { ProgressBar } from '../Art';

jest.mock('expo-image', () => ({ Image: require('react-native').View }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: require('react-native').View },
  useSharedValue: (value: number) => require('react').useRef({ value }).current,
  useAnimatedStyle: (getStyle: () => unknown) => getStyle(),
  withTiming: (value: number) => value,
}));

describe('art progress bar', () => {
  let renderer: ReactTestRenderer;

  afterEach(() => { act(() => { renderer?.unmount(); }); });

  it.each([[0, 0], [0.5, 95], [1, 190]])('keeps the fill 5dp inside both borders at %s progress', (portion, expectedWidth) => {
    act(() => { renderer = create(React.createElement(ProgressBar, { portion, color: 'blue', fillHeight: 14, horizontalInset: 5 })); });
    const track = renderer.root.findAllByType(View).find(node => typeof node.props.onLayout === 'function')!;
    act(() => { track.props.onLayout({ nativeEvent: { layout: { width: 200 } } }); });
    const fill = renderer.root.findAllByType(View).find(node => {
      const style = StyleSheet.flatten(node.props.style);
      return style?.height === 14 && style?.overflow === 'hidden';
    })!;
    expect(StyleSheet.flatten(fill.props.style)).toMatchObject({ left: 5, width: expectedWidth });
  });
});
