import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text, View } from 'react-native';
import { GameplayObjectiveIntro } from '../GameplayObjectiveIntro';
import { ART } from '../../assets';
import { enemyAvatarURL } from '../../enemyAvatars';
import { CONTENT } from '../../game/domain';
import { getLevel } from '../../game/levels';
import type { BoardSnapshot } from '../../game/types';

jest.mock('expo-image', () => ({ Image: require('react-native').View }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../InventoryDialogPanel', () => ({
  InventoryDialogPanel: ({ children, ...props }: { children: React.ReactNode }) =>
    require('react').createElement(require('react-native').View, props, children),
}));
jest.mock('../GameplayDialogButton', () => ({
  GameplayDialogButton: ({ title }: { title: string }) => require('react').createElement(require('react-native').Text, null, title),
}));

describe('gameplay objective intro enemy portrait', () => {
  let renderer: ReactTestRenderer;
  afterEach(() => act(() => renderer?.unmount()));

  it('shows the selected full avatar in the pre-battle objective row', () => {
    const level = {
      ...getLevel(20),
      objectives: [{ id: 'main', type: 'Boss' as const, target: 631, enemy: { id: 'boss-20', name: 'Trận Linh Hộ Tông', artKey: 'enemyAvatar20' } }],
    };
    const board = { contentVersion: CONTENT.version, level } as BoardSnapshot;
    act(() => { renderer = create(<GameplayObjectiveIntro board={board} onStart={jest.fn()} onBack={jest.fn()} />); });
    const portrait = renderer.root.findAllByType(View).find(node => node.props.source === enemyAvatarURL('enemyAvatar20'))!;
    expect(portrait.props.contentFit).toBe('contain');
    expect(portrait.props.cachePolicy).toBe('memory');
    expect(portrait.props.accessible).toBe(false);
    expect(portrait.props.style).toMatchObject({ width: 40, height: 40 });
    expect(portrait.props.style).not.toHaveProperty('borderRadius');
    expect(renderer.root.findAllByType(Text).some(node => node.props.children === 'Hạ Trận Linh Hộ Tông')).toBe(true);
  });

  it('uses the local fallback after a Storage portrait fails to load', () => {
    const board = {
      contentVersion: CONTENT.version,
      level: {
        ...getLevel(20),
        objectives: [{ id: 'main', type: 'Boss' as const, target: 631, enemy: { id: 'boss-20', name: 'Trận Linh Hộ Tông', artKey: 'enemyAvatar20' } }],
      },
    } as BoardSnapshot;
    act(() => { renderer = create(<GameplayObjectiveIntro board={board} onStart={jest.fn()} onBack={jest.fn()} />); });
    const portrait = renderer.root.findAllByType(View).find(node => node.props.source === enemyAvatarURL('enemyAvatar20'))!;
    act(() => portrait.props.onError());
    const fallback = renderer.root.findAllByType(View).find(node => node.props.source === ART.beast)!;
    expect(fallback.props.cachePolicy).toBe('none');
    expect(fallback.props.contentFit).toBe('contain');
  });

  it('uses the local fallback for legacy enemy art keys without a Storage object', () => {
    const level = {
      ...getLevel(20),
      objectives: [{ id: 'main', type: 'Boss' as const, target: 631, enemy: { id: 'legacy-boss', name: 'Yêu Vương', artKey: 'beast' } }],
    };
    const board = { contentVersion: CONTENT.version, level } as BoardSnapshot;
    act(() => { renderer = create(<GameplayObjectiveIntro board={board} onStart={jest.fn()} onBack={jest.fn()} />); });
    expect(renderer.root.findAllByType(View).some(node => node.props.source === ART.beast)).toBe(true);
  });
});
