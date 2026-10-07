import React from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet } from 'react-native';
import { ART, type Artwork } from '../assets';

type EquipmentSlotProps = { label: string; onPress: () => void } & (
  { kind: 'sword'; art: Artwork } |
  { kind: 'skill'; state: 'equipped'; art: Artwork } |
  { kind: 'skill'; state: 'empty' | 'locked'; art?: never }
);

export function EquipmentSlot(props: EquipmentSlotProps) {
  const locked = props.kind === 'skill' && props.state === 'locked';
  const frame = props.kind === 'sword' ? 'slotSword' : props.state === 'empty' ? 'slotSkillEmpty' : locked ? 'slotSkillLocked' : 'slotSkill';

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={props.label} accessibilityState={{ disabled: locked }} disabled={locked} onPress={locked ? undefined : props.onPress} style={({ pressed }) => [styles.slot, pressed && styles.pressed]}>
      <Image source={ART[frame]} contentFit="contain" accessible={false} style={StyleSheet.absoluteFill} />
      {props.art ? <Image source={ART[props.art]} contentFit="contain" accessible={false} style={styles.icon} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 72, height: 72 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
});
