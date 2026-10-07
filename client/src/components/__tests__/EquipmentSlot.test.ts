import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { View } from 'react-native';
import { ART } from '../../assets';
import { EquipmentSlot } from '../EquipmentSlot';

jest.mock('expo-image', () => ({ Image: require('react-native').View }));

describe('equipment socket contents', () => {
  let renderer: ReactTestRenderer;
  const onPress = jest.fn();
  const mount = (element: React.ReactElement) => { act(() => { renderer = create(element); }); };
  const imageSources = () => renderer.root.findAllByType(View).filter(node => node.props.source).map(node => node.props.source);
  const button = (label: string) => renderer.root.findAll(node => node.props.accessibilityLabel === label && node.props.accessibilityRole === 'button' && 'disabled' in node.props)[0];
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => { act(() => { renderer?.unmount(); }); });

  it('layers an equipped sword over its square socket', () => {
    mount(React.createElement(EquipmentSlot, { kind: 'sword', art: 'iconSwordThanhPhong', label: 'Bảo kiếm', onPress }));
    expect(imageSources()).toEqual([ART.slotSword, ART.iconSwordThanhPhong]);
    act(() => { button('Bảo kiếm').props.onPress(); });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('layers an equipped skill over its circular socket', () => {
    mount(React.createElement(EquipmentSlot, { kind: 'skill', state: 'equipped', art: 'iconSkillHoaLien', label: 'Kỹ năng', onPress }));
    expect(imageSources()).toEqual([ART.slotSkill, ART.iconSkillHoaLien]);
  });

  it('shows only the empty socket and permits selecting a skill', () => {
    mount(React.createElement(EquipmentSlot, { kind: 'skill', state: 'empty', label: 'Ô trống', onPress }));
    expect(imageSources()).toEqual([ART.slotSkillEmpty]);
    act(() => { button('Ô trống').props.onPress(); });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows only the locked socket and blocks interaction', () => {
    mount(React.createElement(EquipmentSlot, { kind: 'skill', state: 'locked', label: 'Ô khóa', onPress }));
    expect(imageSources()).toEqual([ART.slotSkillLocked]);
    expect(button('Ô khóa').props.disabled).toBe(true);
    expect(button('Ô khóa').props.accessibilityState.disabled).toBe(true);
    expect(button('Ô khóa').props.onPress).toBeUndefined();
  });
});
