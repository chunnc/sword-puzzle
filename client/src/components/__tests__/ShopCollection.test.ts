import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CollectionScreen } from '../CollectionScreen';
import { CollectionTabs } from '../CollectionTabs';
import { ART, SKILL_ART, SWORD_ART } from '../../assets';
import { SKILLS, SWORDS, type SkillId, type SwordId } from '../../game/domain';
import { emptySave } from '../../game/save';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-image', () => ({ Image: require('react-native').View }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('../../state/gameStore', () => ({
  useGameStore: Object.assign((selector?: (state: typeof mockState) => unknown) => selector ? selector(mockState) : mockState, { getState: () => mockState }),
}));
jest.mock('../Art', () => ({ ScreenFrame: require('react-native').View, ArtPanel: require('react-native').View }));

const mockRouter = { push: jest.fn(), replace: jest.fn() };
const mockState = {
  save: emptySave(),
  notice: '',
  purchase: jest.fn<Promise<boolean>, ['sword' | 'skill', string]>(),
  equip: jest.fn(),
  setNotice: jest.fn((notice: string) => { mockState.notice = notice; }),
};

describe('shop collection', () => {
  let renderer: ReactTestRenderer;
  const mount = (category: 'sword' | 'skill' = 'sword') => {
    act(() => { renderer = create(React.createElement(CollectionScreen, { shop: true, initialCategory: category })); });
  };
  const refresh = (category: 'sword' | 'skill' = 'sword') => {
    act(() => { renderer.update(React.createElement(CollectionScreen, { shop: true, initialCategory: category })); });
  };
  const button = (label: string) => renderer.root.findAll(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label && typeof node.props.disabled === 'boolean')[0];
  const text = () => renderer.root.findAllByType(Text).map(node => React.Children.toArray(node.props.children).filter(child => typeof child === 'string' || typeof child === 'number').join('')).join('\n');
  const sources = () => renderer.root.findAllByType(View).filter(node => node.props.source).map(node => node.props.source);
  const modal = () => renderer.root.findByType(Modal);
  const open = (name = 'Trọng Nhạc') => { act(() => { button(`Xem ${name}`).props.onPress(); }); };
  const buy = () => button('Mua Trọng Nhạc, 200 Linh Thạch');

  beforeEach(() => {
    jest.clearAllMocks();
    mockState.save = emptySave();
    mockState.save.profile.coins = 1000;
    mockState.save.profile.levels = Array.from({ length: 40 }, (_, i) => ({ levelId: i + 1, stars: 3 as const }));
    mockState.notice = '';
    mockState.purchase.mockImplementation(async (category, itemId) => {
      const item = (category === 'sword' ? SWORDS : SKILLS).find(item => item.id === itemId)!;
      const profile = mockState.save.profile;
      mockState.save = { ...mockState.save, profile: {
        ...profile,
        coins: profile.coins - item.price,
        ownedSwords: category === 'sword' ? [...profile.ownedSwords, itemId as SwordId] : profile.ownedSwords,
        ownedSkills: category === 'skill' ? [...profile.ownedSkills, itemId as SkillId] : profile.ownedSkills,
      } };
      return true;
    });
  });
  afterEach(() => { act(() => { renderer?.unmount(); }); });

  it('renders unowned items in catalogue order with their mapped art and shared inventory tabs', () => {
    mount();
    expect(renderer.root.findAllByType(CollectionTabs)).toHaveLength(1);
    expect(sources()).toContain(ART.inventoryTabActive);
    expect(sources()).toContain(ART.inventoryTabIdle);
    expect(button('Xem Thanh Phong')).toBeUndefined();
    for (const item of SWORDS.slice(1)) expect(sources()).toContain(ART[SWORD_ART[item.id]]);
    expect(sources()).not.toContain(ART.tileSword);
    const cards = renderer.root.findAll(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel?.startsWith('Xem ') && typeof node.props.disabled === 'boolean');
    expect(cards.map(node => node.props.accessibilityLabel)).toEqual(SWORDS.slice(1).map(item => `Xem ${item.name}`));
    expect(text()).not.toContain('LINH BẢO CÁC');
    expect(text()).not.toContain('sở hữu vĩnh viễn');
    expect(button('XEM TÚI ĐỒ')).toBeUndefined();
    expect(buy()).toBeUndefined();
  });

  it('shows full details only after a card is opened without buying or equipping', () => {
    mount();
    expect(text()).not.toContain(SWORDS[1].description);
    open();
    expect(modal().props.visible).toBe(true);
    expect(text()).toContain(SWORDS[1].description);
    expect(buy().props.disabled).toBe(false);
    expect(mockState.purchase).not.toHaveBeenCalled();
    expect(mockState.equip).not.toHaveBeenCalled();
  });

  it.each([320, 360, 390])('keeps every card, including the single last item, half the available grid width at %s points', width => {
    mount();
    const scroll = renderer.root.findAllByType(ScrollView)[0];
    act(() => { scroll.props.onLayout({ nativeEvent: { layout: { width: width - 24 } } }); });
    const cards = renderer.root.findAll(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel?.startsWith('Xem ') && typeof node.props.disabled === 'boolean');
    expect(cards).toHaveLength(7);
    const widths = cards.map(card => StyleSheet.flatten(card.props.style({ pressed: false })).width);
    expect(new Set(widths).size).toBe(1);
    expect(Number(widths[0]) * 2 + 8).toBe(width - 24);
  });

  it('shows skill artwork and qi cost and purchases using the skill category', async () => {
    mount('skill');
    expect(button('Xem Nhất Kiếm')).toBeUndefined();
    for (const item of SKILLS.slice(1)) expect(sources()).toContain(ART[SKILL_ART[item.id]]);
    open('Ngự Kiếm');
    expect(text()).toContain('Tiêu hao 30 khí');
    await act(async () => { button('Mua Ngự Kiếm, 150 Linh Thạch').props.onPress(); });
    expect(mockState.purchase).toHaveBeenCalledWith('skill', 'ngu-kiem');
    expect(button('Xem Ngự Kiếm')).toBeUndefined();
    expect(mockState.save.profile.coins).toBe(850);
  });

  it('updates the wallet and removes a purchased card without changing the loadout', async () => {
    mount();
    open();
    await act(async () => { buy().props.onPress(); });
    expect(mockState.purchase).toHaveBeenCalledWith('sword', 'trong-nhac');
    expect(mockState.save.profile.coins).toBe(800);
    expect(button('Xem Trọng Nhạc')).toBeUndefined();
    expect(modal().props.visible).toBe(false);
    expect(mockState.setNotice).toHaveBeenCalledWith('Đã thêm vào túi đồ.');
    expect(mockState.equip).not.toHaveBeenCalled();
  });

  it('keeps locked items inspectable and disables only purchasing', () => {
    mockState.save.profile.levels = [];
    mount();
    expect(button('Xem Trọng Nhạc').props.disabled).toBe(false);
    open();
    expect(text()).toContain('Cần vượt 3 màn để mua.');
    expect(buy().props.disabled).toBe(true);
    expect(buy().props.onPress).toBeUndefined();
    expect(sources()).toContain(ART.shopButtonDisabled);
  });

  it('disables purchasing when the balance is short and enables it at the exact price', () => {
    mockState.save.profile.coins = 199;
    mount();
    open();
    expect(text()).toContain('Chưa đủ Linh Thạch.');
    expect(buy().props.disabled).toBe(true);
    mockState.save = { ...mockState.save, profile: { ...mockState.save.profile, coins: 200 } };
    refresh();
    expect(buy().props.disabled).toBe(false);
    expect(text()).not.toContain('Chưa đủ Linh Thạch.');
  });

  it('rechecks unlock conditions when progress changes while details are open', () => {
    mockState.save.profile.levels = [];
    mount();
    open();
    expect(buy().props.disabled).toBe(true);
    mockState.save = { ...mockState.save, profile: { ...mockState.save.profile, levels: [1, 2, 3].map(levelId => ({ levelId, stars: 3 as const })) } };
    refresh();
    expect(buy().props.disabled).toBe(false);
  });

  it.each(['close', 'back', 'backdrop'])('dismisses via %s without buying', action => {
    mount();
    open();
    act(() => {
      if (action === 'back') modal().props.onRequestClose();
      else button(action === 'close' ? 'Đóng' : 'Đóng chi tiết vật phẩm').props.onPress();
    });
    expect(modal().props.visible).toBe(false);
    expect(mockState.purchase).not.toHaveBeenCalled();
  });

  it('blocks double purchase, tab changes and dismissal while saving', async () => {
    let finish!: (saved: boolean) => void;
    mockState.purchase.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    mount();
    open();
    const press = buy().props.onPress;
    act(() => { press(); press(); });
    expect(mockState.purchase).toHaveBeenCalledTimes(1);
    expect(buy().props.disabled).toBe(true);
    expect(button('Đóng').props.disabled).toBe(true);
    expect(button('Đóng chi tiết vật phẩm').props.disabled).toBe(true);
    expect(renderer.root.findByType(CollectionTabs).props.disabled).toBe(true);
    act(() => { modal().props.onRequestClose(); });
    expect(modal().props.visible).toBe(true);
    await act(async () => { finish(true); });
    expect(modal().props.visible).toBe(false);
  });

  it.each(['throws', 'returns false'])('keeps details open and permits retry when purchase %s', async failure => {
    if (failure === 'throws') mockState.purchase.mockRejectedValueOnce(new Error('disk failure'));
    else mockState.purchase.mockImplementationOnce(async () => { mockState.notice = 'Chưa đủ linh thạch.'; return false; });
    mount();
    open();
    await act(async () => { buy().props.onPress(); });
    expect(modal().props.visible).toBe(true);
    expect(buy().props.disabled).toBe(false);
    expect(button('Xem Trọng Nhạc')).toBeDefined();
    expect(mockState.save.profile.coins).toBe(1000);
    expect(text()).toContain(failure === 'throws' ? 'Không thể lưu thay đổi. Vui lòng thử lại.' : 'Chưa đủ linh thạch.');
    expect(renderer.root.findAll(node => node.props.accessibilityRole === 'alert').length).toBeGreaterThan(0);
    await act(async () => { buy().props.onPress(); });
    expect(modal().props.visible).toBe(false);
    expect(button('Xem Trọng Nhạc')).toBeUndefined();
  });

  it('clears selection and errors when switching tabs', async () => {
    mockState.purchase.mockRejectedValueOnce(new Error('disk failure'));
    mount();
    open();
    await act(async () => { buy().props.onPress(); });
    act(() => { renderer.root.findByType(CollectionTabs).props.onSelect('skill'); });
    expect(modal().props.visible).toBe(false);
    open('Ngự Kiếm');
    expect(text()).not.toContain('Không thể lưu thay đổi.');
  });

  it('clears selection when the route category changes', () => {
    mount();
    open();
    refresh('skill');
    expect(modal().props.visible).toBe(false);
    expect(button('Xem Ngự Kiếm')).toBeDefined();
  });

  it('closes details and removes an item when sync grants ownership', () => {
    mount();
    open();
    mockState.save = { ...mockState.save, profile: { ...mockState.save.profile, ownedSwords: ['thanh-phong', 'trong-nhac'] } };
    refresh();
    expect(modal().props.visible).toBe(false);
    expect(button('Xem Trọng Nhạc')).toBeUndefined();
    expect(mockState.purchase).not.toHaveBeenCalled();
  });

  it.each(['sword', 'skill'] as const)('shows the empty message when all %s items are owned', category => {
    mockState.save.profile.ownedSwords = SWORDS.map(item => item.id);
    mockState.save.profile.ownedSkills = SKILLS.map(item => item.id);
    mount(category);
    expect(text()).toContain(`Đã sở hữu toàn bộ ${category === 'sword' ? 'bảo kiếm' : 'kiếm thuật'}.`);
    expect(sources()).not.toContain(ART.shopCard);
    expect(buy()).toBeUndefined();
  });

  it('hides both indicators and keeps scrolling enabled in the list and details', () => {
    mount();
    open();
    for (const scroll of renderer.root.findAllByType(ScrollView)) {
      expect(scroll.props.showsVerticalScrollIndicator).toBe(false);
      expect(scroll.props.showsHorizontalScrollIndicator).toBe(false);
      expect(scroll.props.scrollEnabled).not.toBe(false);
    }
    const details = renderer.root.findAllByType(ScrollView)[1];
    expect(details.findAll(node => node.props.accessibilityLabel === 'Mua Trọng Nhạc, 200 Linh Thạch' || node.props.accessibilityLabel === 'Đóng')).toHaveLength(0);
  });
});
