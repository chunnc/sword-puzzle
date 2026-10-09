import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { Board, SpiritOrb, type BoardVisualEffect } from '../Board';
import { ART, tileArtwork } from '../../assets';
import { colors } from '../../theme';
import { ChargedTileParticle } from '../ChargedTileParticle';
import { chargedParticleStyle } from '../chargedTileParticles';
import { BoardEffects } from '../BoardEffects';
import { SpiritQiFlightOverlay } from '../SpiritQiFlightOverlay';
import { buildSpiritFlightCues } from '../spiritParticles';
import { createBoardMotionSession } from '../boardMotion';
import { buildBoardEffectCues } from '../boardVisuals';
import type { SkImage } from '@shopify/react-native-skia';
import { BoardEngine } from '../../game/BoardEngine';
import { getLevel } from '../../game/levels';
import { TileKind } from '../../game/types';
import { Gesture } from 'react-native-gesture-handler';
import { cancelAnimation, Easing, makeMutable, withTiming } from 'react-native-reanimated';

// Jest Expo normally gives every image the same ID; distinct IDs make wrong
// element/tier selection observable in the renderer and asset helper tests.
jest.mock('../../../app-assets/ui/tile_sword.webp', () => 101);
jest.mock('../../../app-assets/ui/tile_sword_4.webp', () => 102);
jest.mock('../../../app-assets/ui/tile_sword_5.webp', () => 103);
jest.mock('../../../app-assets/ui/tile_fire.webp', () => 104);
jest.mock('../../../app-assets/ui/tile_fire_4.webp', () => 105);
jest.mock('../../../app-assets/ui/tile_fire_5.webp', () => 106);
jest.mock('../../../app-assets/ui/tile_lightning.webp', () => 107);
jest.mock('../../../app-assets/ui/tile_lightning_4.webp', () => 108);
jest.mock('../../../app-assets/ui/tile_lightning_5.webp', () => 109);
jest.mock('../../../app-assets/ui/tile_spirit_orb.webp', () => 110);
jest.mock('../../../app-assets/ui/tile_spirit_orb_4.webp', () => 111);
jest.mock('../../../app-assets/ui/tile_spirit_orb_5.webp', () => 112);
jest.mock('../../../app-assets/ui/tile_rock.webp', () => 113);

jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));

jest.mock('react-native-gesture-handler', () => ({
  Gesture: {
    Pan: jest.fn(() => {
      const gesture: { enabled: jest.Mock; minDistance: jest.Mock; onEnd: jest.Mock } = {
        enabled: jest.fn(() => gesture),
        minDistance: jest.fn(() => gesture),
        onEnd: jest.fn(() => gesture),
      };
      return gesture;
    }),
  },
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-worklets', () => ({
  runOnUI: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
    if (mockQueueUI) mockUIQueue.push(() => fn(...args));
    else fn(...args);
  },
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
}));

jest.mock('react-native-reanimated', () => ({
  Easing: { linear: (value: number) => value },
  useDerivedValue: (updater: () => unknown) => {
    const React = require('react');
    const latest = React.useRef(updater);
    latest.current = updater;
    return React.useRef({ get value() { return latest.current(); } }).current;
  },
  makeMutable: (value: unknown) => ({ value }),
  useSharedValue: (value: unknown) => require('react').useRef({ value }).current,
  useFrameCallback: (callback: MockFrameClock['callback']) => {
    const ref = require('react').useRef(null);
    if (!ref.current) {
      const clock: MockFrameClock = { callback, active: false, setActive: jest.fn((active: boolean) => { clock.active = active; }) };
      ref.current = clock;
      mockFrameClocks.push(clock);
    }
    ref.current.callback = callback;
    return ref.current;
  },
  useAnimatedReaction: (prepare: () => unknown, react: (value: unknown) => void, dependencies: unknown[]) => {
    require('react').useEffect(() => {
      const run = () => react(prepare());
      mockReactions.push(run);
      run();
    }, dependencies);
  },
  cancelAnimation: jest.fn(),
  withTiming: jest.fn((value: number) => value),
  withSequence: (...values: number[]) => values[values.length - 1],
}));

type MockFrameClock = { callback: (frame: { timeSincePreviousFrame: number | null }) => void; active: boolean; setActive: jest.Mock };
const mockFrameClocks: MockFrameClock[] = [];
let mockFocused = true;
let mockAppChanged: (state: 'active' | 'background') => void;
const originalAppState = AppState.currentState;
let mockQueueUI = false;
const mockUIQueue: (() => unknown)[] = [];
const mockReactions: (() => void)[] = [];

jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const host = (name: string) => (props: { children?: React.ReactNode }) => React.createElement(name, props, props.children);
  const buffer = (size: number, create: () => unknown, modifier: (value: never, index: number) => void) => {
    const value = Array.from({ length: size }, create);
    value.forEach((item, index) => modifier(item as never, index));
    return { value };
  };
  return {
    Canvas: host('Canvas'), Group: host('Group'), Image: host('SkiaImage'), Atlas: host('Atlas'),
    RoundedRect: host('RoundedRect'), Paragraph: host('Paragraph'), Paint: host('Paint'), Circle: host('Circle'),
    Path: host('Path'), BlurMask: host('BlurMask'), LinearGradient: host('LinearGradient'),
    FontWeight: { Black: 900 },
    useImage: jest.fn((asset: number) => ({ asset, width: () => 960, height: () => 576 })),
    useRectBuffer: jest.fn((size: number, modifier: (value: never, index: number) => void) => buffer(size, () => ({
      setXYWH(x: number, y: number, width: number, height: number) { Object.assign(this, { x, y, width, height }); },
    }), modifier)),
    useRSXformBuffer: jest.fn((size: number, modifier: (value: never, index: number) => void) => buffer(size, () => ({
      set(...values: number[]) { Object.assign(this, { values }); },
    }), modifier)),
    useColorBuffer: jest.fn((size: number, modifier: (value: never, index: number) => void) => buffer(size, () => new Float32Array(4), modifier)),
    Skia: {
      Path: { Make: () => {
        const path = { moveTo: () => path, lineTo: () => path, close: () => path };
        return path;
      } },
      Color: (color: string) => color,
      XYWHRect: (x: number, y: number, width: number, height: number) => ({ x, y, width, height }),
      ParagraphBuilder: {
        Make: (options: { textStyle: Record<string, unknown> }) => {
          // Native JSI treats present-but-undefined style properties as errors.
          if (Object.values(options.textStyle).some(value => value === undefined)) throw new Error('Invalid native paragraph style');
          let text = '';
          const builder = {
            addText: (value: string) => { text = value; return builder; },
            build: () => ({ text, layout: () => {}, getLongestLine: () => text.length * Number(options.textStyle.fontSize), getHeight: () => Number(options.textStyle.fontSize) * 1.2 }),
          };
          return builder;
        },
      },
    },
  };
});

describe('Skia Board integration', () => {
  let renderer: ReactTestRenderer;
  const snapshot = new BoardEngine(getLevel(5)).snapshot();
  snapshot.tiles[42] = { kind: TileKind.SpiritOrb, chargeTier: 5, locked: true };
  const onCellPress = jest.fn(), onSwipe = jest.fn();
  const props = { snapshot, selected: null, onCellPress, onSwipe };

  function mount(extra: Partial<React.ComponentProps<typeof Board>> = {}) {
    act(() => { renderer = create(React.createElement(Board, { ...props, ...extra })); });
    const grid = renderer.root.findAllByType(View).find(node => typeof node.props.onLayout === 'function')!;
    act(() => { grid.props.onLayout({ nativeEvent: { layout: { width: 350, height: 350 } } }); });
  }

  const buttons = () => renderer.root.findAll(node => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function');
  const tile = (index: number) => renderer.root.findAll(node => node.type === 'Group' as never &&
    node.props.origin?.x === index % 7 * 50 + 25 && node.props.origin?.y === (6 - Math.floor(index / 7)) * 50 + 25)[0];
  const reactFrames = () => act(() => { mockReactions.forEach(run => run()); mockReactions.forEach(run => run()); });

  beforeEach(() => {
    mockQueueUI = false; mockUIQueue.length = 0; mockReactions.length = 0; mockFrameClocks.length = 0; mockFocused = true;
    AppState.currentState = 'active';
    const appListeners = new Set<(state: 'active' | 'background') => void>();
    mockAppChanged = state => appListeners.forEach(listener => listener(state));
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appListeners.add(listener);
      return { remove: jest.fn(() => appListeners.delete(listener)) };
    });
  });
  afterEach(() => { act(() => { renderer?.unmount(); }); jest.restoreAllMocks(); });
  afterAll(() => { AppState.currentState = originalAppState; });

  it.each([
    [TileKind.Sword, 101, 102, 103],
    [TileKind.Fire, 104, 105, 106],
    [TileKind.Lightning, 107, 108, 109],
    [TileKind.SpiritOrb, 110, 111, 112],
    [TileKind.Rock, 113, 113, 113],
  ])('selects base/4/5 artwork for tile kind %s', (kind, base, tier4, tier5) => {
    expect(tileArtwork(kind)).toBe(base);
    expect(tileArtwork(kind, 0)).toBe(base);
    expect(tileArtwork(kind, 4)).toBe(tier4);
    expect(tileArtwork(kind, 5)).toBe(tier5);
  });

  it.each([280, 350])('renders all twelve sprites with less padding at board width %s', side => {
    const next = { ...snapshot, tiles: [...snapshot.tiles] };
    const expected = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112];
    [TileKind.Sword, TileKind.Fire, TileKind.Lightning, TileKind.SpiritOrb].forEach((kind, k) => {
      ([0, 4, 5] as const).forEach((chargeTier, t) => {
        next.tiles[k * 3 + t] = { kind, chargeTier, locked: false };
      });
    });
    next.tiles[12] = { kind: TileKind.Rock, chargeTier: 0, locked: false };
    mount({ snapshot: next });
    const grid = renderer.root.findAllByType(View).find(node => typeof node.props.onLayout === 'function')!;
    act(() => { grid.props.onLayout({ nativeEvent: { layout: { width: side, height: side } } }); });
    const cells = buttons();
    const sprites = renderer.root.findAll(node => node.type === 'SkiaImage' as never);
    for (let index = 0; index < 13; index++) {
      const cell = cells.find(node => {
        const bounds = StyleSheet.flatten(node.props.style);
        return bounds.left === index % 7 * side / 7 + 1
          && bounds.top === (6 - Math.floor(index / 7)) * side / 7 + 1;
      })!;
      const bounds = StyleSheet.flatten(cell.props.style);
      const sprite = sprites.find(node => node.props.x > bounds.left && node.props.x < bounds.left + bounds.width
        && node.props.y > bounds.top && node.props.y < bounds.top + bounds.height)!;
      expect(sprite.props.image.asset).toBe(index < 12 ? expected[index] : ART.tileRock);
      expect(sprite.props.x).toBeCloseTo(bounds.left + bounds.width * (index < 12 ? .03 : .06));
      expect(sprite.props.width).toBeCloseTo(bounds.width * (index < 12 ? .94 : .88));
      const particle = renderer.root.findAllByType(ChargedTileParticle).filter(node =>
        node.props.bounds.x === bounds.left && node.props.bounds.y === bounds.top);
      expect(particle).toHaveLength(index < 12 && index % 3 !== 0 ? 1 : 0);
      if (particle.length) expect(particle[0].props).toMatchObject({
        bounds: { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height },
        color: chargedParticleStyle(next.tiles[index]!.kind)!.color,
      });
    }
    expect(renderer.root.findAll(node => node.type === 'RoundedRect' as never
      && node.props.color === colors.boardCell)).toHaveLength(49);
    expect(StyleSheet.flatten(renderer.root.findAllByType(View)[0].props.style).backgroundColor).toBe(colors.boardFrame);
    expect(renderer.root.findAll(node => node.type === 'RoundedRect' as never && node.props.color === '#C4B580')).toHaveLength(0);
    const labels = renderer.root.findAll(node => node.type === 'Paragraph' as never).map(node => node.props.paragraph.text);
    expect(labels).not.toContain('氣');
    expect(labels.some(text => text.includes('✧') || text.includes('✦'))).toBe(false);
    expect(labels).toContain('封');
    expect(cells.find(node => node.props.accessibilityLabel.includes('cường hóa 4'))).toBeDefined();
    expect(cells.find(node => node.props.accessibilityLabel.includes('cường hóa 5'))).toBeDefined();
  });

  it('changes the sprite when a tile upgrades without remounting the board', () => {
    const next = { ...snapshot, tiles: [...snapshot.tiles] };
    next.tiles[0] = { kind: TileKind.Fire, chargeTier: 0, locked: false };
    mount({ snapshot: next });
    const sprite = () => tile(0).findAll(node => node.type === 'SkiaImage' as never)[0];
    const particle = () => tile(0).findAllByType(ChargedTileParticle);
    expect(sprite().props.image.asset).toBe(104);
    expect(particle()).toHaveLength(0);
    for (const chargeTier of [4, 5] as const) {
      const upgraded = { ...next, tiles: [...next.tiles] };
      upgraded.tiles[0] = { ...next.tiles[0]!, chargeTier };
      act(() => { renderer.update(React.createElement(Board, { ...props, snapshot: upgraded })); });
      expect(sprite().props.image.asset).toBe(chargeTier === 4 ? 105 : 106);
      expect(particle()).toHaveLength(1);
    }
    act(() => { renderer.update(React.createElement(Board, { ...props, snapshot: next })); });
    expect(particle()).toHaveLength(0);
  });

  it('shares one continuous clock across particles, HUD updates and action phases', () => {
    mount();
    reactFrames();
    expect(mockFrameClocks).toHaveLength(1);
    expect(mockFrameClocks[0].active).toBe(true);
    const phases = renderer.root.findAllByType(ChargedTileParticle).map(node => node.props.phase);
    expect(new Set(phases).size).toBe(1);
    mockFrameClocks[0].callback({ timeSincePreviousFrame: 160 });
    expect(phases[0].value).toBeCloseTo(.1);
    act(() => { renderer.update(React.createElement(Board, { ...props, snapshot: { ...snapshot, swordQi: 20 } })); });
    act(() => { renderer.update(React.createElement(Board, { ...props,
      visualEffect: { id: 94, kind: 'swap', first: { x: 0, y: 6 }, second: { x: 1, y: 6 } } })); });
    const after = renderer.root.findAllByType(ChargedTileParticle)[0].props.phase;
    expect(after).toBe(phases[0]);
    expect(after.value).toBeCloseTo(.1);
    expect(mockFrameClocks).toHaveLength(1);
  });

  it('pauses the clock on background, loss of focus, Reduce Motion and unmount', () => {
    mount(); reactFrames();
    const clock = mockFrameClocks[0];
    clock.callback({ timeSincePreviousFrame: 160 });
    const phase = renderer.root.findAllByType(ChargedTileParticle)[0].props.phase;
    act(() => mockAppChanged('background'));
    expect(clock.active).toBe(false);
    act(() => mockAppChanged('active'));
    expect(clock.active).toBe(true);
    expect(phase.value).toBeCloseTo(.1);
    mockFocused = false;
    act(() => renderer.update(React.createElement(Board, { ...props })));
    expect(clock.active).toBe(false);
    mockFocused = true;
    act(() => renderer.update(React.createElement(Board, { ...props, reduceMotion: true })));
    expect(clock.active).toBe(false);
    const particle = renderer.root.findAllByType(ChargedTileParticle)[0];
    const dots = () => particle.findAll(node => node.type === 'Group' as never && node.props.transform && node.props.opacity);
    const positions = dots().map(node => node.props.transform.value);
    const opacity = dots().map(node => node.props.opacity.value);
    phase.value = .9;
    expect(dots().map(node => node.props.transform.value)).toEqual(positions);
    expect(dots().map(node => node.props.opacity.value)).toEqual(opacity);
    act(() => renderer.update(React.createElement(Board, { ...props })));
    expect(clock.active).toBe(true);
    act(() => renderer.unmount());
    expect(clock.active).toBe(false);
  });

  it('runs only while a charged tile or its fragments remain visible', () => {
    const next: typeof snapshot = { ...snapshot, tiles: snapshot.tiles.map(tile => ({ ...tile!, chargeTier: 0 as const })) };
    mount({ snapshot: next }); reactFrames();
    const clock = mockFrameClocks[0];
    expect(clock.active).toBe(false);
    next.tiles[0] = { kind: TileKind.Fire, chargeTier: 4, locked: false };
    act(() => renderer.update(React.createElement(Board, { ...props, snapshot: { ...next } })));
    reactFrames();
    expect(clock.active).toBe(true);
    const motionSession = createBoardMotionSession('clear');
    act(() => renderer.update(React.createElement(Board, { ...props, snapshot: { ...next }, motionSession,
      visualEffect: { id: 95, kind: 'clear', cleared: [0], changed: [], effects: [
        { kind: 'slash', swordChargeTier: 4, source: 0, cells: [0], damage: 0, qi: 0 },
      ] } })));
    motionSession.progress.value = .7;
    reactFrames();
    expect(tile(0).props.layer.props.opacity.value).toBe(0);
    expect(clock.active).toBe(true);
    motionSession.progress.value = 1;
    reactFrames();
    expect(clock.active).toBe(false);
  });

  it.each(['swap', 'fall'] as const)('moves charged particles with the tile during %s without coloring its stationary cell', kind => {
    const next = { ...snapshot, tiles: [...snapshot.tiles] };
    next.tiles[0] = { kind: TileKind.Fire, chargeTier: 4, locked: false };
    const motionSession = createBoardMotionSession(kind);
    const visualEffect: BoardVisualEffect = kind === 'swap'
      ? { id: 91, kind, first: { x: 0, y: 0 }, second: { x: 1, y: 0 } }
      : { id: 91, kind, falls: [{ index: 0, fromY: 3 }] };
    mount({ snapshot: next, visualEffect, motionSession });
    motionSession.progress.value = .5;
    mockReactions.at(-1)!();
    const moving = tile(0);
    const particle = moving.findAllByType(ChargedTileParticle);
    expect(particle).toHaveLength(1);
    expect(moving.findAll(node => node.type === 'SkiaImage' as never)[0].props.image.asset).toBe(105);
    expect(moving.props.transform.value).toEqual([
      { translateX: kind === 'swap' ? 25 : 0 }, { translateY: kind === 'fall' ? -75 : 0 }, { scale: 1 },
    ]);
    const stationary = renderer.root.findAll(node => node.type === 'RoundedRect' as never
      && node.props.color === colors.boardCell && node.props.x === 1 && node.props.y === 301);
    expect(stationary).toHaveLength(1);
  });

  it('fades charged particles with a cleared tile and removes it in the following clear phase', () => {
    const next = { ...snapshot, tiles: [...snapshot.tiles] };
    next.tiles[0] = { kind: TileKind.Fire, chargeTier: 5, locked: true };
    const motionSession = createBoardMotionSession('clear');
    const visualEffect: BoardVisualEffect = { id: 92, kind: 'clear', cleared: [0], changed: [], effects: [] };
    mount({ snapshot: next, visualEffect, motionSession, selected: { x: 0, y: 0 } });
    motionSession.progress.value = .5;
    mockReactions.at(-1)!();
    expect(tile(0).props.layer.props.opacity.value).toBe(.5);
    expect(tile(0).findAllByType(ChargedTileParticle)).toHaveLength(1);
    expect(tile(0).findAll(node => node.type === 'Paragraph' as never)[0].props.paragraph.text).toBe('封');
    expect(renderer.root.findAll(node => node.type === 'RoundedRect' as never
      && node.props.color === colors.goldBright && node.props.style === 'stroke')).toHaveLength(1);
    motionSession.progress.value = 1;
    mockReactions.at(-1)!();
    expect(tile(0).props.layer.props.opacity.value).toBe(0);
    act(() => { renderer.update(React.createElement(Board, { ...props, snapshot: next,
      visualEffect: { ...visualEffect, id: 93 } })); });
    expect(tile(0)).toBeUndefined();
    expect(renderer.root.findAll(node => node.type === 'RoundedRect' as never
      && node.props.color === colors.boardCell)).toHaveLength(49);
  });

  it('uses the same charged artwork and padding for sword fragments', () => {
    const next = { ...snapshot, tiles: [...snapshot.tiles] };
    next.tiles[0] = { kind: TileKind.Sword, chargeTier: 4, locked: false };
    next.tiles[1] = { kind: TileKind.Lightning, chargeTier: 5, locked: false };
    mount({ snapshot: next, visualEffect: { id: 90, kind: 'clear', cleared: [0, 1], changed: [],
      effects: [{ kind: 'slash', cells: [0, 1], source: 0, swordChargeTier: 4, damage: 1, qi: 0 }] } });
    const fragments = renderer.root.findByType(BoardEffects).findAll(node => node.type === 'SkiaImage' as never);
    expect(fragments.map(node => node.props.image.asset)).toEqual([102, 102, 109, 109]);
    for (const sprite of fragments) expect(sprite.props.width).toBeCloseTo(48 * .94);
    const particles = renderer.root.findByType(BoardEffects).findAllByType(ChargedTileParticle);
    expect(particles).toHaveLength(4);
    for (const particle of particles) expect(particle.props.bounds).toMatchObject({ width: 48, height: 48 });
    const phases = renderer.root.findAllByType(ChargedTileParticle).map(node => node.props.phase);
    expect(new Set(phases).size).toBe(1);
  });

  it('renders the standalone spirit icon without a character overlay', () => {
    act(() => { renderer = create(React.createElement(SpiritOrb, { size: 34 })); });
    const sprites = renderer.root.findAll(node => node.type === 'SkiaImage' as never);
    expect(sprites).toHaveLength(1);
    expect(sprites[0].props.image.asset).toBe(110);
    expect(renderer.root.findAll(node => node.type === 'Paragraph' as never)).toHaveLength(0);
  });

  it('renders one canvas and keeps 49 correctly positioned accessible buttons', () => {
    mount();
    expect(renderer.root.findAll(node => node.type === 'Canvas' as never)).toHaveLength(1);
    expect(renderer.root.findAll(node => node.type === 'SkiaImage' as never)).toHaveLength(49);
    const cells = buttons();
    expect(cells).toHaveLength(49);
    expect(cells[0].props.accessibilityLabel).toContain('cường hóa 5, phong ấn, hàng 7, cột 1');
    expect(StyleSheet.flatten(cells[0].props.style)).toMatchObject({ left: 1, top: 1, width: 48, height: 48 });
    expect(StyleSheet.flatten(cells[48].props.style)).toMatchObject({ left: 301, top: 301, width: 48, height: 48 });
    act(() => { cells[0].props.onPress(); });
    expect(onCellPress).toHaveBeenCalledWith(0, 6);
    const clipped = renderer.root.findAll(node => node.type === 'Group' as never && node.props.clip);
    expect(clipped).toHaveLength(1);
    expect(clipped[0].props.clip).toEqual({ x: 0, y: 0, width: 350, height: 350 });
  });

  it('preserves swipe coordinates and disables swiping while locked or targeting', () => {
    mount();
    const latestGesture = () => (Gesture.Pan as jest.Mock).mock.results.at(-1)!.value;
    act(() => { latestGesture().onEnd.mock.calls[0][0]({ x: 75, y: 325, translationX: 50, translationY: 0 }); });
    expect(onSwipe).toHaveBeenCalledWith(0, 0, 1, 0);
    act(() => { renderer.update(React.createElement(Board, { ...props, locked: true })); });
    expect(latestGesture().enabled).toHaveBeenCalledWith(false);
    expect(buttons()).toHaveLength(49);
    expect(buttons().every(node => node.props.disabled)).toBe(true);
    act(() => { renderer.update(React.createElement(Board, { ...props, targetingHint: 'Chọn một ô' })); });
    expect(latestGesture().enabled).toHaveBeenCalledWith(false);
    expect(buttons().every(node => !node.props.disabled)).toBe(true);
    act(() => { renderer.update(React.createElement(Board, { ...props, targetingHint: 'Chọn một ô', showTargetingHint: false })); });
    expect(latestGesture().enabled).toHaveBeenCalledWith(false);
    expect(renderer.root.findAllByType(Text).some(node => node.props.children === 'Chọn một ô')).toBe(false);
  });

  it.each([175, 350])('keeps the seal label inside its tile at grid width %s', side => {
    mount();
    const grid = renderer.root.findAllByType(View).find(node => typeof node.props.onLayout === 'function')!;
    act(() => { grid.props.onLayout({ nativeEvent: { layout: { width: side, height: side } } }); });
    const seal = renderer.root.findAll(node => node.type === 'Paragraph' as never && node.props.paragraph.text === '封')[0];
    const bounds = StyleSheet.flatten(buttons()[0].props.style);
    expect(seal.props.x).toBeGreaterThanOrEqual(bounds.left);
    expect(seal.props.y).toBeGreaterThanOrEqual(bounds.top);
    expect(seal.props.x + seal.props.width).toBeLessThanOrEqual(bounds.left + bounds.width);
    expect(seal.props.y + seal.props.paragraph.getHeight()).toBeLessThanOrEqual(bounds.top + bounds.height);
  });

  it('uses the slower timing sequence, ignores HUD-only updates and cancels on cleanup', () => {
    const effect: BoardVisualEffect = { id: 1, kind: 'clear', cleared: [0], changed: [1], effects: [{ kind: 'fire', cells: [0], source: 0, damage: 0, qi: 0 }] };
    mount({ visualEffect: effect });
    expect((withTiming as jest.Mock).mock.calls.map(call => call.slice(0, 2))).toEqual([
      [1, { duration: 1200 }], [1.12, { duration: 150 }], [1, { duration: 1050 }],
      [.85, { duration: 105 }], [0, { duration: 1095 }],
    ]);
    (withTiming as jest.Mock).mockClear();
    act(() => { renderer.update(React.createElement(Board, { ...props, snapshot: { ...snapshot, swordQi: 12 }, visualEffect: effect })); });
    expect(withTiming).not.toHaveBeenCalled();
    act(() => { renderer.update(React.createElement(Board, { ...props, visualEffect: { id: 2, kind: 'reject', first: { x: 0, y: 0 }, second: { x: 1, y: 0 } } })); });
    expect((withTiming as jest.Mock).mock.calls.map(call => call.slice(0, 2))).toEqual([[.38, { duration: 165 }], [0, { duration: 225 }]]);
    expect(cancelAnimation).toHaveBeenCalled();
  });

  it('uses a linear elapsed clock and a 1600ms clear timeline for lightning', () => {
    mount({ visualEffect: {
      id: 11, kind: 'clear', cleared: [0, 1], changed: [],
      effects: [{ kind: 'lightning', cells: [1], source: 0, damage: 0, qi: 0 }],
    } });
    expect((withTiming as jest.Mock).mock.calls.map(call => call.slice(0, 2))).toEqual([
      [1600, { duration: 1600, easing: Easing.linear }],
      [1, { duration: 1600 }], [1.12, { duration: 150 }], [1, { duration: 1450 }],
      [.85, { duration: 105 }], [0, { duration: 1495 }],
    ]);
  });

  it.each([4, 5] as const)('plays tier %s on a linear clock and preserves complete artwork in exactly two fragments per target', tier => {
    const effect: BoardVisualEffect = { id: 80 + tier, kind: 'clear', cleared: [23, 24, 25, 17], changed: [], effects: [
      { kind: tier === 5 ? 'cross' : 'slash', swordChargeTier: tier, source: 24, cells: [23, 24, 25, 17], damage: 0, qi: 0 },
    ] };
    const orbSnapshot = { ...snapshot, tiles: [...snapshot.tiles] };
    for (const index of [17, 24, 25]) orbSnapshot.tiles[index] = { kind: TileKind.Fire, chargeTier: 0, locked: false };
    orbSnapshot.tiles[23] = { kind: TileKind.SpiritOrb, chargeTier: 5, locked: false };
    mount({ snapshot: orbSnapshot, visualEffect: effect });
    const duration = tier === 5 ? 1080 : 1020;
    expect(withTiming).toHaveBeenCalledWith(1, { duration, easing: Easing.linear }, expect.any(Function));
    const effects = renderer.root.findByType(BoardEffects);
    const fragments = effects.findAll(node => node.type === 'Group' as never && node.props.layer);
    expect(fragments).toHaveLength(tier === 5 ? 8 : 6);
    expect(effects.findAll(node => node.type === 'Paragraph' as never)).toHaveLength(0);
    expect(effects.findAll(node => node.type === 'SkiaImage' as never && node.props.image.asset === ART.tileSpiritOrb5)).toHaveLength(2);
    expect(effects.findAll(node => node.type === 'RoundedRect' as never && node.props.color === colors.boardCell)).toHaveLength(0);
    expect(effects.findAllByType(ChargedTileParticle)).toHaveLength(2);
    expect(effects.findAll(node => node.type === 'Path' as never)).toHaveLength(tier === 5 ? 6 : 3);
    const progress = effects.props.progress;
    const afterimages = effects.findAll(node => node.type === 'RoundedRect' as never && node.props.color === '#ffffff');
    expect(afterimages).toHaveLength(tier === 5 ? 2 : 1);
    for (const line of afterimages) expect(line.props).toMatchObject({ x: 0, y: -1, width: 350, height: 2 });
    for (const time of [0, 219, 220, 370, 520, 579]) {
      progress.value = time / duration;
      mockReactions.at(-1)!();
      expect(tile(23).props.layer.props.opacity.value).toBe(time < (tier === 5 ? 580 : 520) ? 1 : 0);
      afterimages.forEach((line, index) => {
        const age = time - 220 - index * 60;
        expect(line.props.opacity.value).toBeCloseTo(age < 0 || age >= 300 ? 0 : .35 * (1 - age / 300));
      });
    }
    progress.value = ((tier === 5 ? 580 : 520) - .1) / duration;
    mockReactions.at(-1)!();
    expect(tile(23).props.layer.props.opacity.value).toBe(1);
    expect(fragments.map(node => node.props.layer.props.opacity.value)).toEqual(Array(fragments.length).fill(0));
    // The completion guard hides fragments even if a delayed clock/reaction still references this phase.
    progress.value = (tier === 5 ? 580 : 520) / duration;
    mockReactions.at(-1)!();
    expect(tile(23).props.layer.props.opacity.value).toBe(0);
    expect(afterimages.map(line => line.props.opacity.value)).toEqual(Array(afterimages.length).fill(0));
    expect(fragments.map(node => node.props.layer.props.opacity.value)).toEqual(Array(fragments.length).fill(1));
    progress.value = 1;
    expect(fragments.map(node => node.props.layer.props.opacity.value)).toEqual(Array(fragments.length).fill(0));
    // Cleanup must hide the trail too, even if its local clock was still in the fade interval.
    progress.value = 370 / duration;
    expect(afterimages[0].props.opacity.value).toBeGreaterThan(0);
    const retiredOpacities = afterimages.map(line => line.props.opacity);
    act(() => renderer.update(React.createElement(Board, { ...props, visualEffect: null })));
    expect(retiredOpacities.map(opacity => opacity.value)).toEqual(Array(afterimages.length).fill(0));
    expect(renderer.root.findAllByType(BoardEffects)).toHaveLength(0);
  });

  it('fits stationary white trails to the actual row and column lengths on rectangular boards', () => {
    const geometry = { width: 5, height: 3, activeCells: Array(15).fill(true) };
    const cells = [5, 6, 7, 8, 9, 2, 12];
    mount({ snapshot: { ...snapshot, tiles: snapshot.tiles.slice(0, 15), level: { ...snapshot.level, board: geometry } },
      visualEffect: { id: 88, kind: 'clear', cleared: cells, changed: [], effects: [
        { kind: 'cross', swordChargeTier: 5, source: 7, cells, damage: 0, qi: 0 },
      ] } });
    const effects = renderer.root.findByType(BoardEffects);
    const lines = effects.findAll(node => node.type === 'RoundedRect' as never && node.props.color === '#ffffff');
    expect(lines.map(line => line.props.width)).toEqual([350, 210]);
    for (const line of lines) expect(line.props.height).toBeCloseTo(2.8);
    const transforms = effects.findAll(node => node.type === 'Group' as never && Array.isArray(node.props.transform))
      .map(node => node.props.transform);
    expect(transforms).toContainEqual([{ translateX: 0 }, { translateY: 105 }, { rotate: 0 }]);
    expect(transforms).toContainEqual([{ translateX: 175 }, { translateY: 0 }, { rotate: Math.PI / 2 }]);
  });

  it('does not resurrect sword targets cleared by an earlier trace and retains the same clock across layout and HUD changes', () => {
    const first: BoardVisualEffect = { id: 85, kind: 'clear', cleared: [23, 24], changed: [], effects: [] };
    mount({ visualEffect: first });
    const effect: BoardVisualEffect = { id: 86, kind: 'clear', cleared: [23, 24, 25], changed: [], effects: [
      { kind: 'slash', swordChargeTier: 4, source: 24, cells: [23, 24, 25], damage: 0, qi: 0 },
    ] };
    act(() => renderer.update(React.createElement(Board, { ...props, visualEffect: effect })));
    const effects = renderer.root.findByType(BoardEffects);
    const progress = effects.props.progress;
    expect(effects.findAll(node => node.type === 'SkiaImage' as never)).toHaveLength(2);
    const clips = () => effects.findAll(node => node.type === 'Group' as never && node.props.clip).map(node => node.props.clip);
    expect(clips()).toEqual([{ x: 201, y: 151, width: 48, height: 24 }, { x: 201, y: 175, width: 48, height: 24 }]);
    (withTiming as jest.Mock).mockClear();
    act(() => renderer.update(React.createElement(Board, { ...props, snapshot: { ...snapshot, swordQi: 12 }, visualEffect: { ...effect } })));
    const grid = renderer.root.findAllByType(View).find(node => typeof node.props.onLayout === 'function')!;
    act(() => grid.props.onLayout({ nativeEvent: { layout: { width: 175, height: 175 } } }));
    expect(renderer.root.findByType(BoardEffects).props.progress).toBe(progress);
    expect(clips()).toEqual([{ x: 101, y: 76, width: 23, height: 11.5 }, { x: 101, y: 87.5, width: 23, height: 11.5 }]);
    expect(withTiming).not.toHaveBeenCalled();
    mockQueueUI = true;
    act(() => renderer.update(React.createElement(Board, { ...props, visualEffect: { ...effect, id: 87 } })));
    const next = renderer.root.findByType(BoardEffects).props.progress;
    expect(next).not.toBe(progress);
    act(() => { mockUIQueue[0](); });
    expect(progress.value).toBe(1);
    expect(next.value).toBe(0);
    expect(cancelAnimation).toHaveBeenCalledWith(progress);
  });

  it('reports UI start and successful completion without treating cancellation as completion', () => {
    const onMotionStarted = jest.fn(), onMotionFinished = jest.fn();
    mount({ onMotionStarted, onMotionFinished,
      visualEffect: { id: 90, kind: 'fall', falls: [{ index: 7, fromY: 4 }] } });
    expect(onMotionStarted).toHaveBeenCalledWith(snapshot.runId, 90);
    expect(onMotionFinished).not.toHaveBeenCalled();
    const completed = (withTiming as jest.Mock).mock.calls.at(-1)![2];
    act(() => completed(false));
    expect(onMotionFinished).not.toHaveBeenCalled();
    act(() => completed(true));
    expect(onMotionFinished).toHaveBeenCalledWith(snapshot.runId, 90);
    onMotionFinished.mockClear();
    act(() => renderer.unmount());
    expect(onMotionFinished).not.toHaveBeenCalled();
  });

  it('uses a 1600ms clear timeline for combined fire and lightning', () => {
    mount({ visualEffect: {
      id: 12, kind: 'clear', cleared: [0, 1], changed: [],
      effects: [
        { kind: 'fire', cells: [0], source: 0, damage: 1, qi: 0 },
        { kind: 'lightning', cells: [1], source: 0, damage: 1, qi: 0 },
      ],
    } });
    expect(withTiming).toHaveBeenCalledWith(1, { duration: 1600 }, expect.any(Function));
    const effects = renderer.root.findByType(BoardEffects);
    expect(effects.findAll(node => node.type === 'Atlas' as never)).toHaveLength(1);
    expect(effects.findAll(node => node.type === 'SkiaImage' as never)).toHaveLength(1);
  });

  it('does not start animation when reduced motion is enabled', () => {
    mount({ reduceMotion: true, visualEffect: { id: 3, kind: 'fall', falls: [{ index: 0, fromY: 7 }] } });
    expect(withTiming).not.toHaveBeenCalled();
  });

  it('draws the fire flipbook as one atlas without the old particle layer', () => {
    mount({ visualEffect: {
      id: 70, kind: 'clear', cleared: [0, 1], changed: [],
      effects: [{ kind: 'fire', cells: [0, 1], source: 0, damage: 2, qi: 0 }],
    } });
    const atlases = renderer.root.findAll(node => node.type === 'Atlas' as never);
    expect(atlases).toHaveLength(1);
    expect(atlases[0].props.sprites.value).toHaveLength(1);
    expect(atlases[0].props.transforms.value).toHaveLength(1);
  });

  it('draws one clipped lightning sprite per target without old segments or particles', () => {
    mount({ visualEffect: {
      id: 71, kind: 'clear', cleared: [0, 1, 8], changed: [],
      effects: [{ kind: 'lightning', cells: [1, 8], source: 0, damage: 3, qi: 0 }],
    } });
    const effects = renderer.root.findByType(BoardEffects);
    expect(effects.findAll(node => node.type === 'Atlas' as never)).toHaveLength(0);
    expect(effects.findAll(node => node.type === 'SkiaImage' as never)).toHaveLength(2);
    expect(effects.findAll(node => node.type === 'Group' as never && node.props.clip)).toHaveLength(2);
  });

  it('retains the lightning clock during HUD updates and cancels it on a new phase', () => {
    const effect: BoardVisualEffect = { id: 74, kind: 'clear', cleared: [0, 1], changed: [],
      effects: [{ kind: 'lightning', source: 0, cells: [1], damage: 1, qi: 0 }] };
    mount({ visualEffect: effect });
    const clock = renderer.root.findByType(BoardEffects).props.elapsedMs;
    (withTiming as jest.Mock).mockClear();
    act(() => renderer.update(React.createElement(Board, { ...props, visualEffect: { ...effect },
      snapshot: { ...snapshot, swordQi: snapshot.swordQi + 1 } })));
    expect(renderer.root.findByType(BoardEffects).props.elapsedMs).toBe(clock);
    expect(withTiming).not.toHaveBeenCalled();
    mockQueueUI = true;
    act(() => renderer.update(React.createElement(Board, { ...props, visualEffect: { ...effect, id: 75 } })));
    const nextClock = renderer.root.findByType(BoardEffects).props.elapsedMs;
    expect(nextClock).not.toBe(clock);
    expect(nextClock.value).toBe(0);
    act(() => { mockUIQueue[0](); });
    expect(cancelAnimation).toHaveBeenCalledWith(clock);
    expect(nextClock.value).toBe(0);
  });

  it('keeps the same effect phase and atlas cues through HUD-only updates', () => {
    const effect: BoardVisualEffect = {
      id: 72, kind: 'clear', cleared: [0], changed: [],
      effects: [{ kind: 'fire', cells: [0], source: 0, damage: 1, qi: 0 }],
    };
    mount({ visualEffect: effect });
    (withTiming as jest.Mock).mockClear();
    act(() => renderer.update(React.createElement(Board, {
      ...props,
      snapshot: { ...snapshot, swordQi: snapshot.swordQi + 1 },
      visualEffect: { ...effect, effects: effect.effects.map(item => ({ ...item })) },
    })));
    expect(withTiming).not.toHaveBeenCalled();
    expect(renderer.root.findAll(node => node.type === 'Atlas' as never)).toHaveLength(1);
  });

  it.each(['fire', 'lightning', 'slash', 'cross'] as const)('skips the %s sprite emitter when reduced motion is enabled', kind => {
    mount({ reduceMotion: true, visualEffect: {
      id: 73, kind: 'clear', cleared: [0], changed: [],
      effects: [{ kind, cells: [0], source: 1, damage: 1, qi: 0,
        ...(kind === 'slash' || kind === 'cross' ? { swordChargeTier: kind === 'slash' ? 4 as const : 5 as const } : {}) }],
    } });
    expect(renderer.root.findAll(node => node.type === 'Atlas' as never)).toHaveLength(0);
    expect(renderer.root.findAllByType(BoardEffects)).toHaveLength(0);
    expect(withTiming).not.toHaveBeenCalled();
  });

  it.each(['clear', 'idle'] as const)('keeps a landed tile still when an old UI reaction runs after transition to %s', next => {
    mount({ visualEffect: { id: 10, kind: 'fall', falls: [{ index: 7, fromY: 4 }] } });
    const oldTile = tile(7), oldTransform = oldTile.props.transform;
    const oldReaction = mockReactions.at(-1)!;
    expect(oldTransform.value).toEqual([{ translateX: 0 }, { translateY: 0 }, { scale: 1 }]);
    const canvas = renderer.root.findAll(node => node.type === 'Canvas' as never)[0];
    const sprite = oldTile.findAll(node => node.type === 'SkiaImage' as never)[0];
    act(() => renderer.update(React.createElement(Board, { ...props, visualEffect: next === 'clear'
      ? { id: 11, kind: 'clear', cleared: [48], changed: [], effects: [{ kind: 'fire', cells: [48], source: 48, damage: 1, qi: 0 }] }
      : null })));
    oldReaction();
    expect(oldTransform.value).toEqual([{ translateX: 0 }, { translateY: 0 }, { scale: 1 }]);
    expect(tile(7)).toBe(oldTile);
    expect(tile(7).props.transform).toBeUndefined();
    expect(renderer.root.findAll(node => node.type === 'Canvas' as never)[0]).toBe(canvas);
    expect(tile(7).findAll(node => node.type === 'SkiaImage' as never)[0]).toBe(sprite);
  });

  it('initializes the new fall at its source even while UI worklets are queued', () => {
    mockQueueUI = true;
    mount({ visualEffect: { id: 20, kind: 'fall', falls: [{ index: 7, fromY: 4 }] } });
    expect(tile(7).props.transform.value).toEqual([{ translateX: 0 }, { translateY: -150 }, { scale: 1 }]);
    const oldTransform = tile(7).props.transform;
    act(() => renderer.update(React.createElement(Board, { ...props, visualEffect: {
      id: 21, kind: 'fall', falls: [{ index: 48, fromY: 7 }],
    } })));
    const nextTransform = tile(48).props.transform;
    expect(nextTransform.value).toEqual([{ translateX: 0 }, { translateY: -50 }, { scale: 1 }]);
    // Even a late cleanup of the old phase cannot cancel or finish the new fall.
    act(() => { mockUIQueue[1](); });
    expect(oldTransform.value).toEqual([{ translateX: 0 }, { translateY: 0 }, { scale: 1 }]);
    expect(nextTransform.value).toEqual([{ translateX: 0 }, { translateY: -50 }, { scale: 1 }]);
    act(() => { mockUIQueue[2](); mockReactions.at(-1)!(); });
    expect(nextTransform.value).toEqual([{ translateX: 0 }, { translateY: 0 }, { scale: 1 }]);
  });

  it('does not restart a phase for equivalent effect objects or selection updates', () => {
    const effect: BoardVisualEffect = { id: 30, kind: 'fall', falls: [{ index: 7, fromY: 4 }] };
    mount({ visualEffect: effect });
    const transform = tile(7).props.transform;
    (withTiming as jest.Mock).mockClear();
    act(() => renderer.update(React.createElement(Board, { ...props, selected: { x: 2, y: 2 },
      snapshot: { ...snapshot, swordQi: 22 }, visualEffect: { ...effect } })));
    expect(tile(7).props.transform).toBe(transform);
    expect(withTiming).not.toHaveBeenCalled();
  });

  it('starts a new run with fresh clocks even when the effect ID is reused', () => {
    const effect: BoardVisualEffect = { id: 40, kind: 'fall', falls: [{ index: 7, fromY: 4 }] };
    mount({ visualEffect: effect });
    const transform = tile(7).props.transform;
    act(() => renderer.update(React.createElement(Board, { ...props,
      snapshot: { ...snapshot, runId: 'another-run' }, visualEffect: effect })));
    expect(tile(7).props.transform).not.toBe(transform);
    expect(transform.value).toEqual([{ translateX: 0 }, { translateY: 0 }, { scale: 1 }]);
  });

  it('retires motion when reduced motion changes without hiding the current clear on reenable', () => {
    const effect: BoardVisualEffect = { id: 50, kind: 'clear', cleared: [7], changed: [], effects: [] };
    mount({ visualEffect: effect });
    const oldOpacity = tile(7).props.layer.props.opacity;
    act(() => renderer.update(React.createElement(Board, { ...props, visualEffect: effect, reduceMotion: true })));
    expect(tile(7).props.transform).toBeUndefined();
    expect(tile(7).props.layer).toBeUndefined();
    expect(oldOpacity.value).toBe(0);
    act(() => renderer.update(React.createElement(Board, { ...props, visualEffect: effect, reduceMotion: false })));
    expect(tile(7)).toBeDefined();
    expect(tile(7).props.layer.props.opacity).not.toBe(oldOpacity);
  });

  it('fades sprite and text together and keeps prior cleared cells absent', () => {
    const first: BoardVisualEffect = { id: 4, kind: 'clear', cleared: [42], changed: [], effects: [{ kind: 'spirit', cells: [42], damage: 0, qi: 10 }] };
    mount({ visualEffect: first });
    const layers = () => renderer.root.findAll(node => node.type === 'Group' as never && node.props.layer);
    expect(layers()).toHaveLength(1);
    expect(layers()[0].props.layer.props.opacity).toEqual({ value: 0 });
    expect(renderer.root.findAll(node => node.type === 'SkiaImage' as never)).toHaveLength(49);
    const second: BoardVisualEffect = { id: 5, kind: 'clear', cleared: [42, 43], changed: [], effects: [{ kind: 'fire', cells: [43], source: 42, damage: 1, qi: 1 }] };
    act(() => { renderer.update(React.createElement(Board, { ...props, visualEffect: second })); });
    expect(renderer.root.findAll(node => node.type === 'SkiaImage' as never)).toHaveLength(48);
    expect(layers()).toHaveLength(1);
    act(() => { renderer.update(React.createElement(Board, { ...props, visualEffect: { id: 6, kind: 'fall', falls: [{ index: 42, fromY: 7 }] } })); });
    expect(renderer.root.findAll(node => node.type === 'SkiaImage' as never)).toHaveLength(49);
    expect(layers()).toHaveLength(0);
    expect(withTiming).toHaveBeenLastCalledWith(1, { duration: 450 }, expect.any(Function));
  });
});

describe('spirit orb flight rendering', () => {
  let renderer: ReactTestRenderer;
  const geometry = { width: 7, height: 7 };
  const layout = { board: { x: 10, y: 90, width: 350, height: 350 }, target: { x: 185, y: 480 } };
  const clear = (tier: 4 | 5): BoardVisualEffect => ({ id: 88, kind: 'clear', cleared: [24], changed: [],
    effects: [{ kind: 'spirit', spiritChargeTier: tier, source: 24, cells: [], qi: 0, damage: 0 }] });
  afterEach(() => { act(() => renderer?.unmount()); });

  it.each([4, 5] as const)('renders %s particles outside any board clip and hides them at completion', tier => {
    const progress = makeMutable(.18);
    act(() => { renderer = create(React.createElement(SpiritQiFlightOverlay, {
      cues: buildSpiritFlightCues(clear(tier), geometry, 'a'), geometry, layout, progress, durationMs: 1000,
    })); });
    const canvas = renderer.root.findAll(node => node.type === 'Canvas' as never)[0];
    expect(canvas.props.pointerEvents).toBe('none');
    expect(canvas.props.accessible).toBe(false);
    expect(renderer.root.findAll(node => node.type === 'Group' as never && node.props.clip)).toHaveLength(0);
    expect(renderer.root.findAll(node => node.type === 'Circle' as never)).toHaveLength((tier === 5 ? 28 : 16) * 3 + 2);
    const sparks = renderer.root.findAll(node => node.type === 'Group' as never && node.props.transform);
    expect(sparks.every(node => node.props.opacity.value > 0)).toBe(true);
    expect(sparks.every(node => node.props.transform.value[1].translateY < 265)).toBe(true);
    progress.value = .9;
    expect(sparks.every(node => node.props.transform.value[0].translateX === 185
      && node.props.transform.value[1].translateY === 480)).toBe(true);
    progress.value = 1;
    expect(sparks.every(node => node.props.opacity.value === 0)).toBe(true);
  });

  it('uses the external clock for a linear 1000ms phase without restarting on HUD/layout updates', () => {
    const snapshot = new BoardEngine(getLevel(5)).snapshot();
    const motionSession = createBoardMotionSession('clear');
    const props = { snapshot, selected: null, onCellPress: jest.fn(), onSwipe: jest.fn(), visualEffect: clear(5), motionSession };
    jest.mocked(withTiming).mockClear();
    act(() => { renderer = create(React.createElement(Board, props)); });
    expect(withTiming).toHaveBeenCalledWith(1, { duration: 1000, easing: Easing.linear }, expect.any(Function));
    expect(motionSession.progress.value).toBe(1);
    jest.mocked(withTiming).mockClear();
    motionSession.progress.value = .4;
    act(() => { renderer.update(React.createElement(Board, { ...props, snapshot: { ...snapshot, swordQi: 99 } })); });
    const grid = renderer.root.findAllByType(View).find(node => node.props.onLayout)!;
    act(() => { grid.props.onLayout({ nativeEvent: { layout: { width: 210, height: 210 } } }); });
    expect(withTiming).not.toHaveBeenCalled();
    expect(motionSession.progress.value).toBe(.4);
    act(() => renderer.unmount());
    expect(motionSession.progress.value).toBe(1);
  });
});

describe('lightning-test-2 flipbook rendering', () => {
  let renderer: ReactTestRenderer;
  const geometry = { width: 7, height: 7 };
  const image = { width: () => 960, height: () => 576 } as SkImage;
  const cue = buildBoardEffectCues({ id: 100, kind: 'clear', cleared: [17, 25], changed: [],
    effects: [{ kind: 'lightning', source: 24, cells: [17, 25], damage: 1, qi: 0 }] }, geometry)[0];
  const clock = makeMutable(0);
  const progress = makeMutable(0);

  function mount(cues = [cue], lightningImage: SkImage | null = image) {
    act(() => { renderer = create(React.createElement(BoardEffects, {
      cues, geometry, side: 350, elapsedMs: clock, progress, durationMs: 1600,
      fireBurstImage: null, lightningImage,
    })); });
  }
  const images = () => renderer.root.findAll(node => node.type === 'SkiaImage' as never);
  const sprites = () => renderer.root.findAll(node => node.type === 'Group' as never && node.props.opacity);
  beforeEach(() => { clock.value = 0; progress.value = .5; });
  afterEach(() => { act(() => renderer?.unmount()); });

  it('clips the first row and animates all targets in sync using elapsed time', () => {
    mount();
    const clips = renderer.root.findAll(node => node.type === 'Group' as never && node.props.clip);
    expect(clips.map(node => node.props.clip)).toEqual([
      { x: 0, y: 0, width: 192, height: 192 }, { x: 0, y: 0, width: 192, height: 192 },
    ]);
    const expected = [0, 1, 2, 3, 2, 1, 2, 3, 2, 1, 2, 3, 2, 1];
    expected.forEach((frame, tick) => {
      clock.value = tick * 120;
      for (const sprite of images()) {
        expect(sprite.props.x.value).toBeCloseTo(-frame * 192);
        expect(sprite.props).toMatchObject({ y: 0, width: 960, height: 576, fit: 'fill' });
      }
      expect(sprites().map(node => node.props.opacity.value)).toEqual([1, 1]);
    });
    clock.value = 1599;
    expect(sprites().map(node => node.props.opacity.value)).toEqual([1, 1]);
    clock.value = 1600;
    expect(sprites().map(node => node.props.opacity.value)).toEqual([0, 0]);
  });

  it('hides delayed cues before their start and hides retired phases', () => {
    mount([{ ...cue, startAt: .05 }]);
    expect(sprites().map(node => node.props.opacity.value)).toEqual([0, 0]);
    clock.value = 80;
    expect(sprites().map(node => node.props.opacity.value)).toEqual([1, 1]);
    clock.value = 200;
    expect(images()[0].props.x.value).toBe(-192);
    progress.value = 1;
    expect(sprites().map(node => node.props.opacity.value)).toEqual([0, 0]);
  });

  it('keeps the correct frame layout while the image loads', () => {
    mount([cue], null);
    expect(images()[0].props.image).toBeNull();
    expect(renderer.root.findAll(node => node.type === 'Group' as never && node.props.clip)[0].props.clip)
      .toEqual({ x: 0, y: 0, width: 192, height: 192 });
  });
});

describe('fire-test-2 flipbook rendering', () => {
  let renderer: ReactTestRenderer;
  const geometry = { width: 7, height: 7 };
  const fireBurstImage = { width: () => 960, height: () => 576 } as SkImage;
  const cue = buildBoardEffectCues({
    id: 80, kind: 'clear', cleared: [24], changed: [],
    effects: [{ kind: 'fire', source: 24, cells: [24], damage: 1, qi: 0 }],
  }, geometry)[0];

  function draw(timeMs: number, durationMs = 1200, cues = [cue], image: SkImage | null = fireBurstImage) {
    act(() => {
      renderer = create(React.createElement(BoardEffects, {
        cues, geometry, side: 350, progress: makeMutable(timeMs / durationMs), elapsedMs: makeMutable(timeMs), durationMs,
        fireBurstImage: image, lightningImage: null,
      }));
    });
    return renderer.root.findAll(node => node.type === 'Atlas' as never)[0].props;
  }

  afterEach(() => { act(() => renderer?.unmount()); });

  it.each([
    [0, 0, 0], [108, 192, 0], [180, 384, 0], [252, 576, 0],
    [324, 768, 0], [396, 0, 192], [468, 192, 192], [540, 384, 192],
    [612, 576, 192], [684, 768, 192], [756, 0, 384], [828, 192, 384],
  ])('selects the correct 192px frame at %sms', (timeMs, x, y) => {
    const atlas = draw(timeMs);
    expect(atlas.sprites.value[0]).toMatchObject({ x, y, width: 192, height: 192 });
    // Each frame spans a 4.5x4.5-cell box, centered on the triggering tile.
    expect(atlas.transforms.value[0].values).toEqual([225 / 192, 0, 62.5, 62.5]);
    expect(Array.from(atlas.colors.value[0])).toEqual([1, 1, 1, 1]);
  });

  it('stays fully opaque throughout playback and hides outside the active interval', () => {
    for (const [timeMs, expectedAlpha] of [[-1, 0], [0, 1], [600, 1], [828, 1], [863, 1], [864, 0], [1200, 0]]) {
      const atlas = draw(timeMs);
      expect(atlas.colors.value[0][3]).toBe(expectedAlpha);
      // Even after playback, never sample the three unused cells in the last row.
      expect(atlas.sprites.value[0].x).toBeLessThanOrEqual(768);
      if (atlas.sprites.value[0].y === 384) expect(atlas.sprites.value[0].x).toBeLessThanOrEqual(192);
      act(() => renderer.unmount());
    }
  });

  it('starts and ends each chained explosion at its own cue time', () => {
    const cues = [cue, { ...cue, sourceX: 4.5, startAt: .1 }];
    const early = draw(60, 1200, cues);
    expect(early.colors.value.map((color: Float32Array) => color[3])).toEqual([1, 0]);
    act(() => renderer.unmount());
    const started = draw(120, 1200, cues);
    expect(started.colors.value.map((color: Float32Array) => color[3])).toEqual([1, 1]);
    expect(started.transforms.value[1].values).toEqual([225 / 192, 0, 112.5, 62.5]);
    act(() => renderer.unmount());
    const ending = draw(900, 1200, cues);
    expect(ending.colors.value[0][3]).toBe(0);
    expect(ending.colors.value[1][3]).toBe(1);
    act(() => renderer.unmount());
    const ended = draw(990, 1200, cues);
    expect(ended.colors.value.map((color: Float32Array) => color[3])).toEqual([0, 0]);
  });

  it('keeps the correct frame geometry while the image is loading', () => {
    const atlas = draw(396, 1200, [cue], null);
    expect(atlas.image).toBeNull();
    expect(atlas.sprites.value[0]).toMatchObject({ x: 0, y: 192, width: 192, height: 192 });
  });
});
