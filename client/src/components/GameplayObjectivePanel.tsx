import React, { useMemo, useState, type PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Canvas, Group, Image, useImage } from '@shopify/react-native-skia';
import { ART } from '../assets';
import { gameplayPanelSlices } from './gameplayPanelSlices';

export function GameplayObjectivePanel({ variant, children, style, testID }: PropsWithChildren<{
  variant: 'boss' | 'collection'; style?: StyleProp<ViewStyle>; testID?: string;
}>) {
  const image = useImage(variant === 'boss' ? ART.gameplayBossPanel : ART.gameplayCollectionPanel);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const slices = useMemo(() => image ? gameplayPanelSlices(image.width(), image.height(), size.width, size.height) : [], [image, size.width, size.height]);
  return <View testID={testID} style={[styles.panel, style]} onLayout={event => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
    <Canvas pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      {slices.map((slice, index) => <Group key={index} clip={slice.clip}>
        <Image image={image} {...slice.image} fit="fill" />
      </Group>)}
    </Canvas>
    {children}
  </View>;
}

const styles = StyleSheet.create({ panel: { justifyContent: 'center', alignItems: 'stretch' } });
