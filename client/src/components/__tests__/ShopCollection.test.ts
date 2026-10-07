import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaView } from 'react-native-safe-area-context';
import { CollectionScreen } from '../CollectionScreen';
import { CollectionTabs } from '../CollectionTabs';
import { ART, SKILL_ART, SWORD_ART } from '../../assets';
import { SKILLS, SWORDS, type SkillId, type SwordId } from '../../game/domain';
import { emptySave } from '../../game/save';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-image', () => ({ Image: require('react-native').View }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: () => mockDimensions }));
jest.mock('../../state/gameStore', () => ({
  useGameStore: Object.assign((selector?: (state: typeof mockState) => unknown) => selector ? selector(mockState) : mockState, { getState: () => mockState }),
}));
jest.mock('../Art', () => ({ ScreenFrame: require('react-native').View, ArtPanel: require('react-native').View }));

const mockRouter = { push: jest.fn(), replace: jest.fn() };
let mockDimensions = { width: 390, height: 844, scale: 3, fontScale: 1 };
const mockState = {
  save: emptySave(),
  notice: '',
  purchase: jest.fn<Promise<boolean>, ['sword' | 'skill', string]>(),
  equip: jest.fn(),
  setNotice: jest.fn((notice: string) => { mockState.notice = notice; }),
};

describe('shop collection', () => {
  let renderer: ReactTestRenderer;
  const insets = { top: 47, bottom: 34, left: 0, right: 0 };
  const scene = (category: 'sword' | 'skill') => React.createElement(SafeAreaInsetsContext.Provider, { value: insets }, React.createElement(CollectionScreen, { shop: true, initialCategory: category }));
  const mount = (category: 'sword' | 'skill' = 'sword') => {
    act(() => { renderer = create(scene(category)); });
  };
  const refresh = (category: 'sword' | 'skill' = 'sword') => {
    act(() => { renderer.update(scene(category)); });
  };
  const button = (label: string) => renderer.root.findAll(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label && typeof node.props.disabled === 'boolean')[0];
  const text = () => renderer.root.findAllByType(Text).map(node => React.Children.toArray(node.props.children).filter(child => typeof child === 'string' || typeof child === 'number').join('')).join('\n');
  const sources = () => renderer.root.findAllByType(View).filter(node => node.props.source).map(node => node.props.source);
  const modal = () => renderer.root.findByType(Modal);
  const panel = () => modal().findAllByType(View).find(node => node.props.source === ART.shopDialog)!.parent!;
  const panelStyle = () => StyleSheet.flatten(panel().props.style);
  const footerStyle = () => StyleSheet.flatten(buy().parent!.parent!.props.style);
  const open = (name = 'Trọng Nhạc') => { act(() => { button(`Xem ${name}`).props.onPress(); }); };
  const buy = () => button('Mua Trọng Nhạc, 200 Linh Thạch');

  beforeEach(() => {
    jest.clearAllMocks();
    mockDimensions = { width: 390, height: 844, scale: 3, fontScale: 1 };
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
    expect(text()).toContain('Cần vượt qua màn 3');
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

  it('keeps only the catalogue scrollable with both indicators hidden', () => {
    mount();
    open();
    const scrolls = renderer.root.findAllByType(ScrollView);
    expect(scrolls).toHaveLength(1);
    expect(scrolls[0].props.showsVerticalScrollIndicator).toBe(false);
    expect(scrolls[0].props.showsHorizontalScrollIndicator).toBe(false);
    expect(scrolls[0].props.scrollEnabled).not.toBe(false);
    expect(modal().findAllByType(ScrollView)).toHaveLength(0);
  });

  it.each([false, true])('shows Mua, price and currency icon only inside the purchase button when disabled is %s', disabled => {
    if (disabled) mockState.save.profile.coins = 0;
    mount();
    open();
    const purchase = buy();
    expect(purchase.props.disabled).toBe(disabled);
    const labels = purchase.findAllByType(Text).map(node => node.props.children);
    expect(labels).toEqual(['Mua', 200]);
    const images = purchase.findAllByType(View).filter(node => node.props.source).map(node => node.props.source);
    expect(images).toContain(ART.iconLinhThach);
    expect(images).toContain(ART[disabled ? 'shopButtonDisabled' : 'shopButton']);
    const panelText = modal().findAllByType(Text).map(node => React.Children.toArray(node.props.children).join('')).join('\n');
    expect(panelText.split('\n')).not.toContain('Linh Thạch');
    expect(panelText).not.toContain('Mở sau màn');
    const currencyIcons = modal().findAllByType(View).filter(node => node.props.source === ART.iconLinhThach);
    expect(currencyIcons).toHaveLength(1);
  });

  it('keeps the larger overhanging close target inside a transparent wrapper', () => {
    mount();
    open();
    const close = button('Đóng');
    const style = StyleSheet.flatten(close.props.style({ pressed: false }));
    expect(style).toMatchObject({ position: 'absolute', top: 0, right: 0, width: 56, height: 56 });
    expect(close.findAllByType(Text)).toHaveLength(0);
    const icon = close.findAllByType(View).find(node => node.props.source === ART.shopCloseIcon)!;
    expect(StyleSheet.flatten(icon.props.style)).toMatchObject({ width: 44, height: 44 });
    const wrapper = modal().findAllByType(View).find(node => node.props.accessibilityViewIsModal)!;
    const wrapperStyle = StyleSheet.flatten(wrapper.props.style);
    expect(wrapper.props.pointerEvents).toBe('box-none');
    expect(wrapperStyle.padding).toBe(12);
    expect(wrapperStyle.width).toBe(panelStyle().width + 24);
    expect(wrapperStyle.height).toBeCloseTo(panelStyle().height + 24);
    expect(style.top - wrapperStyle.padding).toBe(-12);
    expect(style.right - wrapperStyle.padding).toBe(-12);
    expect(sources()).not.toContain(ART.shopCloseButton);
  });

  it.each([320, 360, 390])('fixes the panel ratio and anchors a 20%% narrower purchase button at %s points', width => {
    mockDimensions = { width, height: 844, scale: 3, fontScale: 1 };
    mount();
    open();
    const layout = panelStyle();
    const panelWidth = Math.min(340, width - 40);
    expect(layout.width).toBe(panelWidth);
    expect(layout.height).toBeCloseTo(panelWidth * 1000 / 824);
    expect(panel().props.onLayout).toBeUndefined();
    const art = modal().findAllByType(View).find(node => node.props.source === ART.shopDialog)!;
    expect(art.props.contentFit).toBe('contain');
    const buttonStyle = StyleSheet.flatten(buy().props.style({ pressed: false }));
    expect(buttonStyle.width).toBeCloseTo((panelWidth - 40) * 0.8);
    expect(buttonStyle.height).toBe(44);
    expect(footerStyle()).toMatchObject({ position: 'absolute', bottom: 20, left: 20, right: 20, alignItems: 'center' });
    const itemArt = modal().findAllByType(View).find(node => node.props.source === ART.iconSwordTrongNhac)!.parent!;
    expect(StyleSheet.flatten(itemArt.props.style).maxWidth).toBeUndefined();
    let iconArea = itemArt.parent!;
    while (typeof StyleSheet.flatten(iconArea.props.style)?.width !== 'number') iconArea = iconArea.parent!;
    expect(StyleSheet.flatten(iconArea.props.style)).toMatchObject({ width: width <= 320 ? 96 : 104, height: width <= 320 ? 96 : 104 });
  });

  it('keeps panel and purchase geometry unchanged through saving, errors and balance/progress updates', async () => {
    let fail!: (error: Error) => void;
    mockState.purchase.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    mount();
    open();
    const layout = panelStyle();
    const footer = footerStyle();
    const purchaseStyle = StyleSheet.flatten(buy().props.style({ pressed: false }));
    act(() => { buy().props.onPress(); });
    expect(text()).toContain('Đang lưu…');
    expect(panelStyle()).toEqual(layout);
    expect(footerStyle()).toEqual(footer);
    await act(async () => { fail(new Error('disk failure')); });
    expect(panelStyle()).toEqual(layout);
    expect(StyleSheet.flatten(buy().props.style({ pressed: false }))).toEqual(purchaseStyle);
    mockState.save = { ...mockState.save, profile: { ...mockState.save.profile, coins: 0, levels: [] } };
    refresh();
    const messages = modal().findAllByType(Text).map(node => node.props.children);
    expect(messages).toContain('Không thể lưu thay đổi. Vui lòng thử lại.');
    expect(messages).not.toContain('Cần vượt qua màn 3');
    expect(messages).not.toContain('Chưa đủ Linh Thạch.');
    expect(buy().props.disabled).toBe(true);
    expect(panelStyle()).toEqual(layout);
    expect(footerStyle()).toEqual(footer);
  });

  it('prioritizes the unlock message over insufficient currency', () => {
    mockState.save.profile.coins = 0;
    mockState.save.profile.levels = [];
    mount();
    open();
    expect(text()).toContain('Cần vượt qua màn 3');
    expect(text()).not.toContain('Chưa đủ Linh Thạch.');
  });

  it('uses the existing screen safe-area padding from the first modal render', () => {
    mount();
    open();
    expect(modal().props.animationType).toBe('none');
    expect(modal().props.onShow).toBeUndefined();
    expect(modal().findAllByType(SafeAreaView)).toHaveLength(0);
    const overlay = modal().findAllByType(View).find(node => {
      const style = StyleSheet.flatten(node.props.style);
      return style?.backgroundColor === 'rgba(1, 18, 23, 0.62)';
    })!;
    expect(StyleSheet.flatten(overlay.props.style)).toMatchObject({ paddingTop: 67, paddingBottom: 54, paddingLeft: 20, paddingRight: 20 });
    refresh();
    expect(StyleSheet.flatten(overlay.props.style)).toMatchObject({ paddingTop: 67, paddingBottom: 54 });
  });

  it('keeps every catalogue description visible and untruncated in the compact panel', () => {
    mount();
    for (const category of ['sword', 'skill'] as const) {
      refresh(category);
      for (const item of (category === 'sword' ? SWORDS : SKILLS).slice(1)) {
        open(item.name);
        const description = modal().findAllByType(Text).find(node => node.props.children === item.description)!;
        expect(description).toBeDefined();
        expect(description.props.numberOfLines).toBeUndefined();
        act(() => { button('Đóng').props.onPress(); });
      }
    }
  });
});
