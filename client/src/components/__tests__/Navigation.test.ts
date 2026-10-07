import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomNav, TopHud } from '../Chrome';
import { CollectionScreen } from '../CollectionScreen';
import { navigateTab } from '../Navigation';
import CharacterScreen from '../../../app/character';
import WinScreen from '../../../app/win';
import AccountScreen from '../../../app/account';
import InventoryScreen from '../../../app/inventory';
import { REALMS, SKILLS, SWORDS } from '../../game/domain';
import { SKILL_ART, SWORD_ART } from '../../assets';
import { emptySave } from '../../game/save';
import type { WinSummary } from '../../game/types';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-image', () => ({ Image: require('react-native').View }));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../FloatingCultivator', () => ({ FloatingCultivator: require('react-native').View }));
jest.mock('../../state/gameStore', () => ({
  useGameStore: (selector?: (state: typeof mockState) => unknown) => selector ? selector(mockState) : mockState,
}));
jest.mock('../Art', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    ScreenFrame: View,
    ArtPanel: View,
    ProgressBar: View,
    TitleBanner: ({ title }: { title: string }) => React.createElement(Text, null, title),
    GameButton: ({ title, onPress }: { title: string; onPress: () => void }) =>
      React.createElement(Pressable, { onPress, accessibilityLabel: title }, React.createElement(Text, null, title)),
  };
});

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn() };
let mockParams: Record<string, string> = {};
const mockState = {
  save: emptySave(), notice: '', session: null, online: false,
  startLevel: jest.fn(), register: jest.fn(), login: jest.fn(), setNotice: jest.fn(),
};

const win: WinSummary = {
  runId: 'winning-run', levelId: 4, stars: 3, bestStars: 3,
  expGained: 100, totalExp: REALMS[1].exp, coinsGained: 10,
  realmBefore: 0, realmAfter: 1,
};

describe('scene navigation', () => {
  let renderer: ReactTestRenderer;
  const mount = (element: React.ReactElement) => {
    act(() => { renderer = create(element); });
  };
  const button = (label: string) => renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
  const hasText = (text: string) => renderer.root.findAll(node => {
    const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
    return children.filter((child: unknown) => typeof child === 'string' || typeof child === 'number').join('') === text;
  }).length > 0;

  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    mockState.save = emptySave();
    mockRouter.canGoBack.mockReturnValue(true);
    mockState.startLevel.mockResolvedValue(true);
  });
  afterEach(() => { act(() => { renderer?.unmount(); }); });

  it('does not replace the selected scene and opens the shop from the bottom bar', () => {
    const onSelect = jest.fn((id) => navigateTab(mockRouter as never, id));
    mount(React.createElement(BottomNav, { active: 'map', onSelect }));
    act(() => { button('TIÊN LỘ').props.onPress(); });
    expect(onSelect).not.toHaveBeenCalled();
    act(() => { button('CỬA HÀNG').props.onPress(); });
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/shop');
  });

  it('marks the shop as selected rather than the inventory', () => {
    mount(React.createElement(CollectionScreen, { shop: true }));
    expect(button('CỬA HÀNG').props.accessibilityState.selected).toBe(true);
    expect(button('TÚI ĐỒ').props.accessibilityState.selected).toBe(false);
    act(() => { button('CỬA HÀNG').props.onPress(); });
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('opens the character scene directly when a realm increases', async () => {
    mockParams = { levelId: '4' };
    mockState.save.lastWin = win;
    mount(React.createElement(WinScreen));
    expect(renderer.root.findAllByType(BottomNav)).toHaveLength(0);
    await act(async () => { button('ĐỘT PHÁ').props.onPress(); });
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/character');
    expect(mockState.startLevel).not.toHaveBeenCalled();
  });

  it('continues to the next level when no realm increases', async () => {
    mockParams = { levelId: '4' };
    mockState.save.lastWin = { ...win, realmAfter: 0 };
    mount(React.createElement(WinScreen));
    await act(async () => { button('MÀN TIẾP THEO').props.onPress(); });
    expect(mockState.startLevel).toHaveBeenCalledWith(5);
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/game/5');
  });

  it('does not use a breakthrough summary from a different level', async () => {
    mockParams = { levelId: '5' };
    mockState.save.lastWin = win;
    mount(React.createElement(WinScreen));
    expect(button('ĐỘT PHÁ')).toBeUndefined();
    await act(async () => { button('MÀN TIẾP THEO').props.onPress(); });
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/game/6');
  });

  it.each([
    [0, '0/1500', 'Luyện Khí', 'Sơ Kỳ'],
    [500, '500/1500', 'Luyện Khí', 'Trung Kỳ'],
    [1499, '1499/1500', 'Luyện Khí', 'Viên Mãn'],
    [1500, '0/2500', 'Trúc Cơ', 'Sơ Kỳ'],
    [1600, '100/2500', 'Trúc Cơ', 'Sơ Kỳ'],
    [110000, 'MAX', 'Chân Tiên', undefined],
  ])('shows current realm progress at %s EXP', (exp, fraction, realm, stage) => {
    mockState.save.profile.totalExp = exp as number;
    mockState.save.lastWin = win;
    mount(React.createElement(CharacterScreen));
    expect(hasText(fraction as string)).toBe(true);
    expect(renderer.root.findAllByType(Text).filter(node => node.props.accessibilityRole === 'header' && node.props.accessibilityLabel === `${realm}${stage ? ` ${stage}` : ''}`)).toHaveLength(1);
    expect(renderer.root.findAllByType(ScrollView)).toHaveLength(0);
    expect(hasText(`${exp} EXP`)).toBe(false);
    expect(hasText('KIẾM TU')).toBe(false);
    expect(hasText('ĐỘT PHÁ')).toBe(false);
    expect(button('TIẾP TỤC TIÊN LỘ')).toBeUndefined();
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'Tu vi')[0].props.accessibilityValue.text).toBe(fraction);
  });

  it('opens equipment categories from the icons and disables the locked second skill slot', () => {
    mount(React.createElement(CharacterScreen));
    act(() => { button('Bảo kiếm Thanh Phong, mở Túi Đồ').props.onPress(); });
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/inventory', params: { category: 'sword' } });
    act(() => { button('Ô kỹ năng 1, Nhất Kiếm, mở Kiếm thuật').props.onPress(); });
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/inventory', params: { category: 'skill' } });
    const locked = renderer.root.findAll(node => node.props.accessibilityLabel === 'Ô kỹ năng 2 bị khóa, mở tại 1500 EXP' && node.props.disabled)[0];
    expect(locked.props.accessibilityState.disabled).toBe(true);
    expect(locked.props.onPress).toBeUndefined();
  });

  it('opens an available empty slot and updates when loadout changes', () => {
    mockState.save.profile.totalExp = 1500;
    mount(React.createElement(CharacterScreen));
    act(() => { button('Ô kỹ năng 2 trống, mở Kiếm thuật').props.onPress(); });
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/inventory', params: { category: 'skill' } });
    mockState.save.profile.loadout.skills = ['nhat-kiem', 'hoa-lien'];
    act(() => { renderer.update(React.createElement(CharacterScreen)); });
    expect(button('Ô kỹ năng 2, Hỏa Liên, mở Kiếm thuật')).toBeDefined();
  });

  it.each(SWORDS)('renders the icon for equipped sword $id', sword => {
    mockState.save.profile.loadout.sword = sword.id;
    mount(React.createElement(CharacterScreen));
    expect(renderer.root.findAll(node => node.props.art === SWORD_ART[sword.id])).toHaveLength(1);
  });

  it.each(SKILLS)('renders the icon for equipped skill $id', skill => {
    mockState.save.profile.loadout.skills = [skill.id];
    mount(React.createElement(CharacterScreen));
    expect(renderer.root.findAll(node => node.props.art === SKILL_ART[skill.id])).toHaveLength(1);
  });

  it('shows both currencies in the taller shared HUD without EXP or realm', () => {
    mockState.save.profile.totalExp = 500;
    mockState.save.profile.coins = 12345;
    const onAccount = jest.fn();
    mount(React.createElement(TopHud, { onAccount }));
    expect(hasText('12.3K')).toBe(true);
    expect(hasText('0')).toBe(true);
    expect(hasText('500 EXP')).toBe(false);
    expect(hasText('Luyện Khí')).toBe(false);
    const tray = renderer.root.findAllByType(View).find(node => node.props.art === 'hudTrayV2')!;
    expect(StyleSheet.flatten(tray.props.style).height).toBe(72);
    expect(StyleSheet.flatten(tray.props.style).flexShrink).toBe(0);
    act(() => { button('Linh Thạch: 12345, mở Cửa Hàng').props.onPress(); });
    expect(mockRouter.push).toHaveBeenCalledWith('/shop');
    const premium = renderer.root.findAllByType(View).find(node => node.props.accessibilityLabel === 'Linh Thạch Tinh Hoa: 0')!;
    expect(premium.props.onPress).toBeUndefined();
    act(() => { button('Tài khoản').props.onPress(); });
    expect(onAccount).toHaveBeenCalledTimes(1);
  });

  it.each(['skill', 'sword', 'invalid', undefined])('opens inventory with category %s', category => {
    mockParams = category ? { category } : {};
    mount(React.createElement(InventoryScreen));
    const tabs = renderer.root.findAll(node => node.props.accessibilityRole === 'tab' && typeof node.props.onPress === 'function');
    expect(tabs[0].props.accessibilityState.selected).toBe(category !== 'skill');
    expect(tabs[1].props.accessibilityState.selected).toBe(category === 'skill');
  });

  it('switches inventory category when new route params arrive', () => {
    mount(React.createElement(InventoryScreen));
    mockParams = { category: 'skill' };
    act(() => { renderer.update(React.createElement(InventoryScreen)); });
    const skillTabs = renderer.root.findAll(node => node.props.accessibilityRole === 'tab' && typeof node.props.onPress === 'function');
    expect(skillTabs[1].props.accessibilityState.selected).toBe(true);
  });

  it.each([true, false])('returns from account with history=%s and has no bottom bar', (canGoBack) => {
    mockRouter.canGoBack.mockReturnValue(canGoBack);
    mount(React.createElement(AccountScreen));
    expect(renderer.root.findAllByType(BottomNav)).toHaveLength(0);
    act(() => { button('QUAY LẠI').props.onPress(); });
    if (canGoBack) {
      expect(mockRouter.back).toHaveBeenCalledTimes(1);
      expect(mockRouter.replace).not.toHaveBeenCalled();
    } else {
      expect(mockRouter.replace).toHaveBeenCalledTimes(1);
      expect(mockRouter.replace).toHaveBeenCalledWith('/map');
      expect(mockRouter.back).not.toHaveBeenCalled();
    }
  });
});
