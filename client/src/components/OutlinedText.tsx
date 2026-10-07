import React from 'react';
import { StyleSheet, Text, type TextProps, View } from 'react-native';
import { colors } from '../theme';

const offsets = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

/** A one-point dark outline keeps ivory lettering readable over bright clouds. */
export function OutlinedText({ children, style, ...props }: TextProps) {
  return (
    <View style={styles.wrap}>
      <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
        {offsets.map(([x, y]) => (
          <Text key={`${x}:${y}`} accessible={false} numberOfLines={props.numberOfLines} allowFontScaling={props.allowFontScaling} maxFontSizeMultiplier={props.maxFontSizeMultiplier} style={[style, styles.outline, { transform: [{ translateX: x }, { translateY: y }] }]}>{children}</Text>
        ))}
      </View>
      <Text {...props} style={style}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  outline: { position: 'absolute', width: '100%', color: colors.inkDeep, textShadowColor: colors.inkDeep, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 0 },
});
