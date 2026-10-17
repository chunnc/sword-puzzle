import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { BottomNav, TopHud } from '../Chrome';
import { EnergyEmptyDialog } from '../EnergyDisplay';
import { CollectionScreen } from '../CollectionScreen';
import { navigateTab } from '../Navigation';
import CharacterScreen from '../../../app/character';
import AccountScreen from '../../../app/account';
import InventoryScreen from '../../../app/inventory';
import MapScreen from '../../../app/map';
import { installContent, mapSummary, REALMS, SKILLS, SWORDS, type MapSummary } from '../../game/domain';
import { ART, SKILL_ART, SWORD_ART } from '../../assets';
import { emptySave } from '../../game/save';
import { gameplaySnapshot } from './fixtures/gameplay';
import { getLevel } from '../../game/levels';
import type { SaveData, WinSummary } from '../../game/types';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-image', () => ({ Image: jest.fn(props => require('react').createElement(require('react-native').View, props)) }));
jest.mock('@shopify/react-native-skia', () => {
  const { View } = require('react-native');
  const paths: Array<{ moveTo: jest.Mock; cubicTo: jest.Mock }> = [];
  return { Canvas: View, Path: View, BlurMask: View, __paths: paths, Skia: { Path: { Make: () => {
    const path = { moveTo: jest.fn(), cubicTo: jest.fn() };
    paths.push(path);
    return path;
  } } } };
});
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback,[callback]),
}));
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: jest.fn() }));
jest.mock('../FloatingCultivator', () => ({ FloatingCultivator: require('react-native').View }));
jest.mock('../../state/gameStore', () => ({
  useGameStore: Object.assign((selector?: (state: typeof mockState) => unknown) => selector ? selector(mockState) : mockState,{getState:()=>mockState}),
  getHighestUnlocked: (save: SaveData) => require('../../game/domain').highestUnlocked(save.profile.levels),
  getLevelStars: (save: SaveData, id: number) => save.profile.levels.find(level => level.levelId === id)?.stars ?? 0,
  getLevelCompleted: (save: SaveData, id: number) => require('../../game/domain').isCompleted(save.profile.levels, id),
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
  save: emptySave(), notice: '', session: null, online: false,foreground:true,energyClockOffsetMs:0,energyPrompt:false,
  chapterId: '', chapterMaps: [] as MapSummary[], chapterLoading: false, chapterError: '', selectChapter: jest.fn(),
  startLevel: jest.fn(), register: jest.fn(), login: jest.fn(), setNotice: jest.fn(),setEnergyPrompt:jest.fn(),syncEnergy:jest.fn(),
};

const win: WinSummary = {
  runId: 'winning-run', levelId: 4, stars: 3, bestStars: 3,
  expGained: 100, totalExp: REALMS[1].exp, coinsGained: 10,
  realmBefore: 0, realmAfter: 1,
};

describe('scene navigation', () => {
  let renderer: ReactTestRenderer;
  const mount = (element: React.ReactElement) => {
    act(() => { renderer = create(React.createElement(SafeAreaInsetsContext.Provider, { value: { top: 0, bottom: 0, left: 0, right: 0 } }, element)); });
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
    mockState.foreground = true;
    installContent(require('../../../../content/game-config.json'));
    mockState.chapterId='chapter-1';mockState.chapterMaps=require('../../../../content/game-maps.json').map(mapSummary);
    mockState.chapterLoading=false;mockState.chapterError='';mockState.notice='';mockState.selectChapter.mockResolvedValue(undefined);
    mockRouter.canGoBack.mockReturnValue(true);
    mockState.startLevel.mockResolvedValue(true);
  });
  afterEach(() => { act(() => { renderer?.unmount(); }); installContent(require('../../../../content/game-config.json')); });

  it.each([true, false])('requests a new run from the map and navigates only after success=%s', async (success) => {
    let finish!: (result: boolean) => void;
    mockState.startLevel.mockImplementation(() => new Promise<boolean>(resolve => { finish = resolve; }));
    mount(React.createElement(MapScreen));
    act(() => { button(`Màn 1, ${{ easy: 'Dễ', medium: 'Vừa', hard: 'Khó', 'very-hard': 'Rất khó' }[mockState.chapterMaps[0].difficulty]}, màn hiện tại`).props.onPress(); });
    expect(mockState.startLevel).toHaveBeenCalledWith(1);
    expect(mockRouter.push).not.toHaveBeenCalled();

    await act(async () => { finish(success); });
    if (success) expect(mockRouter.push).toHaveBeenCalledWith('/game/1');
    else expect(mockRouter.push).not.toHaveBeenCalled();
  });
  it('passes the new run ID to the objective intro after opening a map', async () => {
    mockState.startLevel.mockImplementation(async () => {
      mockState.save.active = gameplaySnapshot(getLevel(1));
      return true;
    });
    mount(React.createElement(MapScreen));
    await act(async () => { button('Màn 1, Dễ, màn hiện tại').props.onPress(); });
    expect(mockRouter.push).toHaveBeenCalledWith(`/game/1?introRunId=${encodeURIComponent(mockState.save.active!.runId)}`);
  });
  it('does not create a second attempt for rapid duplicate map presses',async()=>{
    let finish!: (value:boolean)=>void;
    mockState.startLevel.mockImplementation(()=>new Promise<boolean>(resolve=>{finish=resolve;}));
    mount(React.createElement(MapScreen));
    act(()=>{button(`Màn 1, ${{ easy: 'Dễ', medium: 'Vừa', hard: 'Khó', 'very-hard': 'Rất khó' }[mockState.chapterMaps[0].difficulty]}, màn hiện tại`).props.onPress();button(`Màn 1, ${{ easy: 'Dễ', medium: 'Vừa', hard: 'Khó', 'very-hard': 'Rất khó' }[mockState.chapterMaps[0].difficulty]}, màn hiện tại`).props.onPress();});
    expect(mockState.startLevel).toHaveBeenCalledTimes(1);
    await act(async()=>{finish(true);});expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });
  it('defers a start completed in background until foreground without starting again',async()=>{
    let finish!: (value:boolean)=>void;
    const scene=()=>React.createElement(SafeAreaInsetsContext.Provider,{value:{top:0,bottom:0,left:0,right:0}},React.createElement(MapScreen));
    mockState.startLevel.mockImplementation(()=>new Promise<boolean>(resolve=>{finish=resolve;}));
    mount(React.createElement(MapScreen));act(()=>{button(`Màn 1, ${{ easy: 'Dễ', medium: 'Vừa', hard: 'Khó', 'very-hard': 'Rất khó' }[mockState.chapterMaps[0].difficulty]}, màn hiện tại`).props.onPress();});
    mockState.foreground=false;
    act(()=>{renderer.update(scene());});
    await act(async()=>{finish(true);});expect(mockRouter.push).not.toHaveBeenCalled();
    mockState.foreground=true;act(()=>{renderer.update(scene());});
    expect(mockRouter.push).toHaveBeenCalledWith('/game/1');expect(mockState.startLevel).toHaveBeenCalledTimes(1);
  });

  it('renders only the active chapter and waits for an explicit chapter selection', () => {
    const config = structuredClone(require('../../../../content/game-config.json'));
    const first = config.chapters[0], count = first.lastLevelId;
    const second = { ...first, id: 'chapter-2', name: 'Chương thử nghiệm', order: 2, firstLevelId: count + 1, lastLevelId: count * 2 };
    installContent({ ...config, levelCount: count * 2, levelBaseExp: Array(count * 2).fill(100), chapters: [first, second] });
    mockState.chapterMaps = [...mockState.chapterMaps, ...mockState.chapterMaps.map(map => ({ ...map, id: map.id + count, chapterId: second.id }))];
    mockState.save.profile.levels = Array.from({ length: count }, (_, i) => ({ levelId: i + 1, stars: 1 }));
    mount(React.createElement(MapScreen));
    const labels = renderer.root.findAll(node => typeof node.props.onPress === 'function').map(node => node.props.accessibilityLabel);
    expect(labels.some(label => String(label).startsWith('Màn 1,'))).toBe(true);
    expect(labels.some(label => String(label).startsWith(`Màn ${second.firstLevelId},`))).toBe(false);
    act(() => { button('Chọn chương, Vân Hải Tiên Sơn').props.onPress(); });
    expect(button(`Chương 2, ${second.name}`).props.accessibilityState.disabled).toBe(false);
    act(() => { button(`Chương 2, ${second.name}`).props.onPress(); });
    expect(mockState.selectChapter).toHaveBeenCalledWith(second.id);
  });

  it('uses the chapter card as the picker and displays only chapter name and star progress', () => {
    mount(React.createElement(MapScreen));
    expect(button('Chọn chương, Vân Hải Tiên Sơn')).toBeDefined();
    expect(hasText('VÂN HẢI TIÊN SƠN')).toBe(true);
    expect(hasText(`0/${mockState.chapterMaps.length * 3} ★`)).toBe(true);
    expect(hasText('TIÊN LỘ · 4 MÀN')).toBe(false);
    expect(hasText('Dễ')).toBe(false);
    act(() => { button('Chọn chương, Vân Hải Tiên Sơn').props.onPress(); });
    const modal = renderer.root.findByType(Modal);
    expect(modal.props.visible).toBe(true);
    act(() => { modal.props.onRequestClose(); });
    expect(renderer.root.findByType(Modal).props.visible).toBe(false);
  });

  it('shows locked chapters as disabled in the chapter picker', () => {
    const config = structuredClone(require('../../../../content/game-config.json'));
    const first = config.chapters[0];
    const second = { ...first, id: 'chapter-2', name: 'Chương thử nghiệm', order: 2,
      firstLevelId: first.lastLevelId + 1, lastLevelId: first.lastLevelId * 2 };
    installContent({ ...config, levelCount: second.lastLevelId,
      levelBaseExp: Array(second.lastLevelId).fill(100), chapters: [first, second] });
    mount(React.createElement(MapScreen));
    act(() => { button('Chọn chương, Vân Hải Tiên Sơn').props.onPress(); });
    const locked = button(`Chương 2, ${second.name}, đã khóa`);
    expect(locked.props.disabled).toBe(true);
    expect(locked.props.accessibilityState.disabled).toBe(true);
  });

  it.each([
    { levels: [] as typeof mockState.save.profile.levels },
    { levels: [{ levelId: 1, stars: 1 }] as typeof mockState.save.profile.levels },
    { levels: [{ levelId: 1, stars: 1 }, { levelId: 2, stars: 2 }] as typeof mockState.save.profile.levels },
    { levels: [{ levelId: 1, stars: 1 }, { levelId: 2, stars: 2 }, { levelId: 3, stars: 3 }] as typeof mockState.save.profile.levels },
  ])('places current progress at 30%% of the map viewport (%#)', ({ levels }) => {
    mockState.save.profile.levels = levels;
    const index = mockState.chapterMaps.length - 1 - levels.length;
    mount(React.createElement(MapScreen));
    const list = renderer.root.findByType(require('react-native').FlatList);
    const scrollToOffset = jest.spyOn(list.instance, 'scrollToOffset');
    act(() => { list.props.onLayout({ nativeEvent: { layout: { width: 320, height: 500 } } }); });
    expect(scrollToOffset).not.toHaveBeenCalled();
    // An event from before the new padding was laid out must not consume the scroll request.
    act(() => { list.props.onContentSizeChange(320, 496); });
    expect(scrollToOffset).not.toHaveBeenCalled();
    const expectedContentHeight = 88 + mockState.chapterMaps.length * 124 + 288;
    act(() => { list.props.onContentSizeChange(320, expectedContentHeight); });
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: Number(index) * 124, animated: false });
    const updatedList = renderer.root.findByType(require('react-native').FlatList);
    const contentStyle = StyleSheet.flatten(updatedList.props.contentContainerStyle);
    expect(contentStyle.paddingTop).toBe(88);
    expect(contentStyle.paddingBottom).toBe(288);
    const itemLayout = updatedList.props.getItemLayout(null, index);
    const actualOffset = (scrollToOffset.mock.calls.at(-1)![0] as { offset: number }).offset;
    expect(itemLayout.offset + itemLayout.length / 2 - actualOffset).toBe(150);
    expect(itemLayout.offset + 20 - actualOffset).toBeGreaterThanOrEqual(0);
    scrollToOffset.mockClear();
    act(() => { list.props.onContentSizeChange(320, 872); });
    expect(scrollToOffset).not.toHaveBeenCalled();
  });

  it('fills the area between HUD and bottom navigation and floats the chapter card above the list', () => {
    mount(React.createElement(MapScreen));
    const list = renderer.root.findByType(require('react-native').FlatList);
    expect(StyleSheet.flatten(list.props.style)).toMatchObject({ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 });
    const area = renderer.root.findAllByType(View).find(node => node.props.testID === 'map-area')!;
    expect(StyleSheet.flatten(area.props.style)).toMatchObject({ flex: 1, position: 'relative' });
    const chapterCard = button('Chọn chương, Vân Hải Tiên Sơn');
    expect(StyleSheet.flatten(chapterCard.props.style)).toMatchObject({ position: 'absolute', top: 8, right: 0, zIndex: 2 });
    expect(list.findAll(node => String(node.props.accessibilityLabel).startsWith('Chọn chương,'))).toHaveLength(0);
    act(() => { chapterCard.props.onPress(); });
    expect(renderer.root.findByType(Modal).props.visible).toBe(true);
  });

  it('overlays an arched star row on tighter, offset level nodes', () => {
    const skia = require('@shopify/react-native-skia');
    skia.__paths.length = 0;
    mockState.save.profile.levels = [{ levelId: 1, stars: 1 }];
    mount(React.createElement(MapScreen));
    const list = renderer.root.findByType(require('react-native').FlatList);
    act(() => { list.props.onLayout({ nativeEvent: { layout: { width: 320, height: 500 } } }); });
    const arcs = renderer.root.findAllByType(View).filter(node => {
      const style = StyleSheet.flatten(node.props.style);
      return Boolean(style) && style.width === 68 && style.height === 36 && style.top === 20;
    });
    expect(arcs).toHaveLength(1);
    const arc = arcs[0];
    expect(arc.props.pointerEvents).toBe('none');
    const ImageComponent = require('expo-image').Image;
    const stars = renderer.root.findAllByType(ImageComponent).filter(node => node.props.source === ART.starGray);
    const brightStars = renderer.root.findAllByType(ImageComponent).filter(node => node.props.source === ART.starBright);
    expect(stars).toHaveLength(2);
    expect(brightStars).toHaveLength(1);
    expect(stars.filter(star => StyleSheet.flatten(star.props.style).top === 0)).toHaveLength(1);
    expect(stars.filter(star => StyleSheet.flatten(star.props.style).top === 8)).toHaveLength(1);
    const middleStar = stars.find(star => StyleSheet.flatten(star.props.style).top === 0)!;
    expect(StyleSheet.flatten(middleStar.props.style).left).toBe(22);
    const stage = button('Màn 4, Dễ, đã khóa');
    expect(StyleSheet.flatten(stage.props.style)).toMatchObject({ height: 84, top: 20 });
    expect(StyleSheet.flatten(stage.props.style).transform).toEqual([{ translateX: 36 }]);
    const completedStage = button('Màn 1, Dễ, đã hoàn thành, 1 sao');
    const arcStyle = StyleSheet.flatten(arc.props.style);
    const stageStyle = StyleSheet.flatten(completedStage.props.style);
    expect(arcStyle.marginLeft + arcStyle.width / 2).toBe(stageStyle.marginLeft + stageStyle.width / 2);
    const row = renderer.root.findAllByType(View).find(node => StyleSheet.flatten(node.props.style)?.height === 124);
    expect(row).toBeDefined();
    expect(skia.__paths).toHaveLength(mockState.chapterMaps.length);
    const lowerEdge = skia.__paths[0].cubicTo.mock.calls[0];
    const nextRowStart = skia.__paths[1].moveTo.mock.calls[0];
    expect(lowerEdge.slice(4)).toEqual([nextRowStart[0], 124]);
    expect(nextRowStart[1]).toBe(0);
  });

  it('hides star placeholders for uncompleted map nodes', () => {
    mount(React.createElement(MapScreen));
    const ImageComponent = require('expo-image').Image;
    const stars = renderer.root.findAllByType(ImageComponent).filter(node =>
      node.props.source === ART.starBright || node.props.source === ART.starGray);
    const arcs = renderer.root.findAllByType(View).filter(node => {
      const style = StyleSheet.flatten(node.props.style);
      return Boolean(style) && style.width === 68 && style.height === 36 && style.top === 20;
    });
    expect(stars).toHaveLength(0);
    expect(arcs).toHaveLength(0);
    expect(button('Màn 1, Dễ, màn hiện tại')).toBeDefined();
  });

  it('reduces horizontal node offset on a narrow map viewport', () => {
    mount(React.createElement(MapScreen));
    const list = renderer.root.findByType(require('react-native').FlatList);
    act(() => { list.props.onLayout({ nativeEvent: { layout: { width: 160, height: 500 } } }); });
    expect(StyleSheet.flatten(button('Màn 4, Dễ, đã khóa').props.style).transform).toEqual([{ translateX: 30 }]);
  });

  it('preserves the map list and row renders until their displayed data changes', () => {
    mockState.save.profile.levels = mockState.chapterMaps.map(map => ({ levelId: map.id, stars: 1 }));
    const scene = () => React.createElement(SafeAreaInsetsContext.Provider, { value: { top: 0, bottom: 0, left: 0, right: 0 } }, React.createElement(MapScreen));
    const image = require('expo-image').Image as jest.Mock;
    const stageCalls = () => image.mock.calls.filter(([props]) => [ART.stageCurrent, ART.stageDone, ART.stageLocked].includes(props.source));
    mount(React.createElement(MapScreen));
    const list = renderer.root.findByType(require('react-native').FlatList);
    const data = list.props.data;
    expect(stageCalls()).toHaveLength(mockState.chapterMaps.length);
    image.mockClear();
    mockState.notice = 'Thông báo mới';
    mockState.save = { ...mockState.save, profile: { ...mockState.save.profile, coins: 123 } };
    act(() => { renderer.update(scene()); });
    expect(renderer.root.findByType(require('react-native').FlatList).props.data).toBe(data);
    expect(stageCalls()).toHaveLength(0);
    mockState.save = { ...mockState.save, profile: { ...mockState.save.profile,
      levels: mockState.save.profile.levels.map((level, i) => i ? level : { ...level, stars: 2 }),
    } };
    act(() => { renderer.update(scene()); });
    expect(stageCalls()).toHaveLength(1);
    expect(button(`Màn 1, ${{ easy: 'Dễ', medium: 'Vừa', hard: 'Khó', 'very-hard': 'Rất khó' }[mockState.chapterMaps[0].difficulty]}, đã hoàn thành, 2 sao`)).toBeDefined();
    image.mockClear();
    mockState.chapterMaps = mockState.chapterMaps.map((map, i) => i ? map : { ...map, difficulty: 'hard' });
    act(() => { renderer.update(scene()); });
    expect(stageCalls()).toHaveLength(1);
    expect(button('Màn 1, Khó, đã hoàn thành, 2 sao')).toBeDefined();
    expect(mockState.selectChapter).toHaveBeenCalledTimes(1);
  });

  it('forces a refresh from the map retry button without hiding cached levels', () => {
    mockState.chapterError = 'Không thể tải';
    mount(React.createElement(MapScreen));
    const retry = renderer.root.findAll(node => typeof node.props.onPress === 'function'
      && node.findAllByType(Text).some(text => String(text.props.children).includes('Thử lại')))[0];
    act(() => { retry.props.onPress(); });
    expect(mockState.selectChapter).toHaveBeenLastCalledWith('chapter-1', { force: true });
    expect(renderer.root.findByType(require('react-native').FlatList).props.data).toHaveLength(mockState.chapterMaps.length);
  });

  it('does not replace the selected scene and opens the shop from the bottom bar', () => {
    const onSelect = jest.fn((id) => navigateTab(mockRouter as never, id));
    mount(React.createElement(BottomNav, { active: 'map', onSelect }));
    act(() => { button('TIÊN LỘ').props.onPress(); });
    expect(onSelect).not.toHaveBeenCalled();
    act(() => { button('CỬA HÀNG').props.onPress(); });
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/shop');
  });

  it('reselecting the active map tab invokes its return-to-progress handler', () => {
    const onSelect = jest.fn();
    const onReselect = jest.fn();
    mount(React.createElement(BottomNav, { active: 'map', onSelect, onReselect }));
    act(() => { button('TIÊN LỘ').props.onPress(); });
    expect(onReselect).toHaveBeenCalledWith('map');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('marks the shop as selected rather than the inventory', () => {
    mount(React.createElement(CollectionScreen, { shop: true }));
    expect(button('CỬA HÀNG').props.accessibilityState.selected).toBe(true);
    expect(button('TÚI ĐỒ').props.accessibilityState.selected).toBe(false);
    act(() => { button('CỬA HÀNG').props.onPress(); });
    expect(mockRouter.replace).not.toHaveBeenCalled();
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
    act(() => { button('Chưa có kiếm, mở Túi Đồ').props.onPress(); });
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/inventory', params: { category: 'sword' } });
    act(() => { button('Ô kỹ năng 1 trống, mở Kiếm thuật').props.onPress(); });
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
    const premium = renderer.root.findAllByType(View).find(node => node.props.accessibilityLabel === 'Tiên Ngọc: 0')!;
    expect(premium.props.onPress).toBeUndefined();
    expect(premium.findAllByType(View).some(node => node.props.source === ART.iconTienNgoc)).toBe(true);
    expect(renderer.root.findAllByType(View).some(node => node.props.source === ART.iconLinhThach)).toBe(true);
    expect(renderer.root.findAllByType(View).some(node => node.props.source === ART.iconBolt)).toBe(true);
    expect(renderer.root.findAllByType(View).some(node => node.props.accessibilityLabel === 'Năng lượng: 5 trên 5')).toBe(true);
    act(() => { button('Tài khoản').props.onPress(); });
    expect(onAccount).toHaveBeenCalledTimes(1);
  });
  it('shows a dedicated low-energy panel with a close action', () => {
    mockState.energyPrompt = true;
    const asOf = Date.now();
    mockState.save.profile.energy = { current: 4, nextRecoveryAt: asOf + 30 * 60_000, asOf };
    mount(React.createElement(EnergyEmptyDialog));
    expect(hasText('Bạn đã hết năng lượng')).toBe(true);
    expect(renderer.root.findAllByType(Text).some(node => String(node.props.children).includes('30 phút'))).toBe(true);
    expect(hasText('Đầy')).toBe(false);
    act(() => { button('Đóng').props.onPress(); });
    expect(mockState.setEnergyPrompt).toHaveBeenCalledWith(false);
    mockState.energyPrompt = false;
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
      expect(mockRouter.replace).toHaveBeenCalledWith('/');
      expect(mockRouter.back).not.toHaveBeenCalled();
    }
  });
});
