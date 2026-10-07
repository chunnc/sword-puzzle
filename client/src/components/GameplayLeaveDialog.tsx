import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { GameplayDialogButton } from './GameplayDialogButton';
import { InventoryDialogPanel } from './InventoryDialogPanel';

export function GameplayLeaveDialog({ busy, compact, onContinue, onBack }: {
  busy: boolean; compact: boolean; onContinue: () => void; onBack: () => void;
}) {
  const [panelWidth, setPanelWidth] = useState(0);
  const buttonWidth = Math.min(panelWidth < 350 ? 168 : 184, panelWidth > 0 ? Math.max(0, panelWidth - 48) : 168);
  return <View testID="game-leave-confirmation" accessibilityViewIsModal style={styles.overlay}>
    <InventoryDialogPanel testID="game-leave-panel">
      <View style={[styles.content, compact && styles.compactContent]} onLayout={event => setPanelWidth(event.nativeEvent.layout.width)}>
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.2} style={styles.title}>Rời màn chơi?</Text>
        <Text maxFontSizeMultiplier={1.2} style={styles.body}>Tiến trình màn này đã được lưu. Bạn có thể chơi tiếp khi quay lại.</Text>
        <View testID="game-leave-actions" style={styles.actions}>
          <GameplayDialogButton title="Tiếp tục" art="buttonPrimary" width={buttonWidth} disabled={busy} onPress={onContinue} />
          <GameplayDialogButton title="Về Tiên Lộ" art="buttonSecondary" width={buttonWidth} disabled={busy} onPress={onBack} />
        </View>
      </View>
    </InventoryDialogPanel>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 30, backgroundColor: colors.veil, padding: 16, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, width: '100%', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 20, gap: 10 },
  compactContent: { paddingVertical: 12, gap: 6 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '900', color: colors.ivory, textAlign: 'center' },
  body: { color: colors.ivory, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  actions: { width: '100%', alignItems: 'center', gap: 6 },
});
