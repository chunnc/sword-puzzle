import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { View } from 'react-native';
import { GameplayObjectivePanel } from '../GameplayObjectivePanel';
import { ART } from '../../assets';
import { useImage } from '@shopify/react-native-skia';

jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const host = (name: string) => (props: any) => React.createElement(name, props, props.children);
  return { Canvas: host('Canvas'), Group: host('Group'), Image: host('SkiaImage'), useImage: jest.fn((source: number) => ({ source, width: () => 1120, height: () => 154 })) };
});

it.each(['boss', 'collection'] as const)('uses the %s artwork in three clipped regions while keeping content above it', variant => {
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(React.createElement(GameplayObjectivePanel, { variant, testID: 'panel' }, React.createElement(View, { testID: 'content' }))); });
  const panel = renderer.root.findAllByType(View).find(node => node.props.testID === 'panel')!;
  expect(useImage).toHaveBeenLastCalledWith(variant === 'boss' ? ART.gameplayBossPanel : ART.gameplayCollectionPanel);
  act(() => panel.props.onLayout({ nativeEvent: { layout: { width: 366, height: variant === 'boss' ? 60 : 48 } } }));
  const regions = renderer.root.findAll(node => node.type === 'Group' as never);
  expect(regions).toHaveLength(3);
  expect(regions[0].props.clip.width).toBe((variant === 'boss' ? 60 : 48) * .75);
  expect(renderer.root.findAllByType(View).some(node => node.props.testID === 'content')).toBe(true);
  act(() => renderer.unmount());
});
