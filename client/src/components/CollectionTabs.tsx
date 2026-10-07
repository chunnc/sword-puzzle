import React from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ART } from '../assets';
import { colors } from '../theme';

export type CollectionCategory = 'sword' | 'skill';

export function CollectionTabs({ category, disabled = false, onSelect }: {
  category: CollectionCategory;
  disabled?: boolean;
  onSelect: (category: CollectionCategory) => void;
}) {
  return (
    <View style={styles.tabs}>
      {(['sword', 'skill'] as const).map(tab => (
        <Pressable key={tab} accessibilityRole="tab" accessibilityLabel={tab === 'sword' ? 'Bảo kiếm' : 'Kiếm thuật'} accessibilityState={{ selected: category === tab, disabled }} disabled={disabled} onPress={() => onSelect(tab)} style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
          <Image source={ART[category === tab ? 'inventoryTabActive' : 'inventoryTabIdle']} contentFit="fill" accessible={false} style={StyleSheet.absoluteFill} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.tabText, category === tab && styles.selectedTabText]}>{tab === 'sword' ? 'BẢO KIẾM' : 'KIẾM THUẬT'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 10, flexShrink: 0 },
  tab: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  tabText: { color: colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  selectedTabText: { color: colors.ivory },
  pressed: { opacity: 0.85 },
});
