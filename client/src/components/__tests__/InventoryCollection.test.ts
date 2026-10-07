import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Modal, View } from 'react-native';
import { CollectionScreen } from '../CollectionScreen';
import { InventoryCollection } from '../InventoryCollection';
import { ART, SKILL_ART, SWORD_ART } from '../../assets';
import { SKILLS, SWORDS, type Loadout } from '../../game/domain';
import { emptySave } from '../../game/save';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-image', () => ({ Image: require('react-native').View }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('../../state/gameStore', () => ({
  useGameStore: Object.assign((selector?: (state: typeof mockState) => unknown) => selector ? selector(mockState) : mockState, { getState: () => mockState }),
}));
jest.mock('../Art', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    ScreenFrame: View,
    ArtPanel: View,
    TitleBanner: ({ title }: { title: string }) => React.createElement(Text, { testID: 'title-banner' }, title),
    GameButton: ({ title, onPress, disabled }: { title: string; onPress: () => void; disabled: boolean }) => React.createElement(Pressable, { accessibilityRole: 'button', disabled: Boolean(disabled), onPress: disabled ? undefined : onPress, accessibilityLabel: title }, React.createElement(Text, null, title)),
  };
});

const mockRouter = { push: jest.fn(), replace: jest.fn() };
const mockState = {
  save: emptySave(),
  notice: '',
  equip: jest.fn<Promise<boolean>, [Loadout]>(),
  purchase: jest.fn<Promise<boolean>, [string, string]>(),
  setNotice: jest.fn((notice: string) => { mockState.notice = notice; }),
};

describe('inventory collection', () => {
  let renderer: ReactTestRenderer;
  const mount = (category: 'skill' | 'sword' = 'sword', shop = false) => {
    act(() => { renderer = create(React.createElement(CollectionScreen, { initialCategory: category, shop })); });
  };
  const button = (label: string) => renderer.root.findAll(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label && typeof node.props.disabled === 'boolean')[0];
  const sources = () => renderer.root.findAllByType(View).filter(node => node.props.source).map(node => node.props.source);
  const modal = () => renderer.root.findByType(Modal);
  const openSkill = (name = 'Hỏa Liên') => { act(() => { button(`Trang bị ${name}`).props.onPress(); }); };
  const slotLabel = (name: string, slot: number, current: string) => `Trang bị ${name} vào ô ${slot}, ${current}`;

  beforeEach(() => {
    jest.clearAllMocks();
    mockState.save = emptySave();
    mockState.save.profile.ownedSwords = ['thanh-phong', 'trong-nhac'];
    mockState.save.profile.ownedSkills = ['nhat-kiem', 'ngu-kiem', 'hoa-lien'];
    mockState.notice = '';
    mockState.equip.mockImplementation(async loadout => {
      mockState.save = { ...mockState.save, profile: { ...mockState.save.profile, loadout } };
      return true;
    });
    mockState.purchase.mockResolvedValue(true);
  });
  afterEach(() => { act(() => { renderer?.unmount(); }); });

  it('removes the inventory banner, caption and shop shortcut and only shows owned items', () => {
    mount();
    expect(renderer.root.findAll(node => node.props.testID === 'title-banner')).toHaveLength(0);
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'ĐẾN LINH BẢO CÁC')).toHaveLength(0);
    expect(button('Trang bị Trọng Nhạc')).toBeDefined();
    expect(button('Trang bị Thanh Phong')).toBeUndefined();
    expect(sources()).toContain(ART.iconSwordThanhPhong);
    expect(sources()).not.toContain(ART.iconSwordHoaVan);
    expect(sources()).not.toContain(ART.tileSword);
    expect(renderer.root.findAll(node => typeof node.props.children === 'string' && node.props.children.includes('ô kỹ năng'))).toHaveLength(0);
  });

  it('renders the asset for every owned sword and skill', () => {
    mockState.save.profile.ownedSwords = SWORDS.map(item => item.id);
    mockState.save.profile.ownedSkills = SKILLS.map(item => item.id);
    mount();
    for (const sword of SWORDS) expect(sources()).toContain(ART[SWORD_ART[sword.id]]);
    act(() => { renderer.update(React.createElement(CollectionScreen, { initialCategory: 'skill' })); });
    for (const skill of SKILLS) expect(sources()).toContain(ART[SKILL_ART[skill.id]]);
  });

  it('equips a sword without changing skill slots', async () => {
    mount();
    await act(async () => { button('Trang bị Trọng Nhạc').props.onPress(); });
    expect(mockState.equip).toHaveBeenCalledWith({ sword: 'trong-nhac', skills: ['nhat-kiem'] });
    act(() => { renderer.update(React.createElement(CollectionScreen)); });
    expect(button('Trang bị Trọng Nhạc')).toBeUndefined();
    expect(button('Trang bị Thanh Phong')).toBeDefined();
    expect(mockState.setNotice).toHaveBeenCalledWith('Đã trang bị. Áp dụng từ màn tiếp theo.');
  });

  it.each([0, 1500])('opens only available skill slots at %s EXP without saving', exp => {
    mockState.save.profile.totalExp = exp;
    mount('skill');
    openSkill();
    expect(modal().props.visible).toBe(true);
    expect(button(slotLabel('Hỏa Liên', 1, 'Nhất Kiếm'))).toBeDefined();
    expect(Boolean(button(slotLabel('Hỏa Liên', 2, 'ô trống')))).toBe(exp === 1500);
    expect(mockState.equip).not.toHaveBeenCalled();
  });

  it('equips a skill in an empty second slot', async () => {
    mockState.save.profile.totalExp = 1500;
    mount('skill');
    openSkill();
    await act(async () => { button(slotLabel('Hỏa Liên', 2, 'ô trống')).props.onPress(); });
    expect(mockState.equip).toHaveBeenCalledWith({ sword: 'thanh-phong', skills: ['nhat-kiem', 'hoa-lien'] });
    expect(modal().props.visible).toBe(false);
  });

  it('replaces the selected slot and retains the other skill', async () => {
    mockState.save.profile.totalExp = 1500;
    mockState.save.profile.loadout.skills = ['nhat-kiem', 'ngu-kiem'];
    mount('skill');
    openSkill();
    await act(async () => { button(slotLabel('Hỏa Liên', 1, 'Nhất Kiếm')).props.onPress(); });
    expect(mockState.equip).toHaveBeenCalledWith({ sword: 'thanh-phong', skills: ['hoa-lien', 'ngu-kiem'] });
  });

  it('swaps an equipped skill rather than duplicating it', async () => {
    mockState.save.profile.totalExp = 1500;
    mockState.save.profile.loadout.skills = ['nhat-kiem', 'ngu-kiem'];
    mount('skill');
    act(() => { button('Đổi ô Nhất Kiếm').props.onPress(); });
    expect(button(slotLabel('Nhất Kiếm', 1, 'Nhất Kiếm')).props.disabled).toBe(true);
    await act(async () => { button(slotLabel('Nhất Kiếm', 2, 'Ngự Kiếm')).props.onPress(); });
    expect(mockState.equip).toHaveBeenCalledWith({ sword: 'thanh-phong', skills: ['ngu-kiem', 'nhat-kiem'] });
    expect(modal().props.visible).toBe(false);
  });

  it('does not offer a move that would leave an unsupported gap in the loadout', () => {
    mockState.save.profile.totalExp = 1500;
    mount('skill');
    expect(button('Đổi ô Nhất Kiếm')).toBeUndefined();
    expect(button('Trang bị Ngự Kiếm')).toBeDefined();
  });

  it.each(['cancel', 'back', 'backdrop'])('dismisses through %s without saving', action => {
    mount('skill');
    openSkill();
    act(() => {
      if (action === 'back') modal().props.onRequestClose();
      else if (action === 'backdrop') button('Đóng bảng chọn ô').props.onPress();
      else button('Hủy trang bị').props.onPress();
    });
    expect(modal().props.visible).toBe(false);
    expect(mockState.equip).not.toHaveBeenCalled();
  });

  it('blocks repeated saves and dismissal while a save is in flight', async () => {
    let finish!: (saved: boolean) => void;
    mockState.equip.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    mount('skill');
    openSkill();
    const choose = button(slotLabel('Hỏa Liên', 1, 'Nhất Kiếm')).props.onPress;
    act(() => { choose(); choose(); });
    expect(mockState.equip).toHaveBeenCalledTimes(1);
    expect(button('Hủy trang bị').props.disabled).toBe(true);
    expect(button(slotLabel('Hỏa Liên', 1, 'Nhất Kiếm')).props.disabled).toBe(true);
    act(() => { modal().props.onRequestClose(); });
    expect(modal().props.visible).toBe(true);
    await act(async () => { finish(true); });
    expect(modal().props.visible).toBe(false);
  });

  it.each(['throws', 'returns false'])('retains the modal and supports retry when saving %s', async failure => {
    if (failure === 'throws') mockState.equip.mockRejectedValueOnce(new Error('disk failure'));
    else mockState.equip.mockImplementationOnce(async () => { mockState.notice = 'Trang bị chưa hợp lệ hoặc chưa đủ ô kỹ năng.'; return false; });
    mount('skill');
    openSkill();
    await act(async () => { button(slotLabel('Hỏa Liên', 1, 'Nhất Kiếm')).props.onPress(); });
    expect(modal().props.visible).toBe(true);
    expect(renderer.root.findAll(node => node.props.accessibilityRole === 'alert').length).toBeGreaterThan(0);
    expect(button(slotLabel('Hỏa Liên', 1, 'Nhất Kiếm')).props.disabled).toBe(false);
    await act(async () => { button(slotLabel('Hỏa Liên', 1, 'Nhất Kiếm')).props.onPress(); });
    expect(modal().props.visible).toBe(false);
  });

  it('dismisses the chooser when route category changes', () => {
    mount('skill');
    openSkill();
    act(() => { renderer.update(React.createElement(CollectionScreen, { initialCategory: 'sword' })); });
    expect(modal().props.visible).toBe(false);
    expect(renderer.root.findAllByType(InventoryCollection)).toHaveLength(1);
    expect(mockState.equip).not.toHaveBeenCalled();
  });

  it('retains the shop banner, catalogue and purchase flow', async () => {
    mockState.save.profile.coins = 1000;
    mockState.save.profile.ownedSwords = ['thanh-phong'];
    mockState.save.profile.levels = [1, 2, 3].map(levelId => ({ levelId, stars: 3 as const }));
    mount('sword', true);
    expect(renderer.root.findAll(node => node.props.testID === 'title-banner').length).toBeGreaterThan(0);
    expect(button('XEM TÚI ĐỒ')).toBeDefined();
    expect(renderer.root.findAllByType(InventoryCollection)).toHaveLength(0);
    const buy = button('MUA · 200');
    expect(buy.props.disabled).toBe(false);
    await act(async () => { buy.props.onPress(); });
    expect(mockState.purchase).toHaveBeenCalledWith('sword', 'trong-nhac');
    expect(mockState.setNotice).toHaveBeenCalledWith('Đã thêm vào túi đồ.');
    expect(mockState.equip).not.toHaveBeenCalled();
  });
});
