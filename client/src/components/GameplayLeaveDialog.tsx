import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { GameButton } from './Art';
import { InventoryDialogPanel } from './InventoryDialogPanel';

export function GameplayLeaveDialog({ busy, compact, onContinue, onBack }: {
  busy: boolean; compact: boolean; onContinue: () => void; onBack: () => void;
}) {
  return <View testID="game-leave-confirmation" accessibilityViewIsModal style={styles.overlay}>
    <InventoryDialogPanel testID="game-leave-panel">
      <View style={[styles.content, compact && styles.compactContent]}>
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.2} style={styles.title}>Rời màn chơi?</Text>
        <Text maxFontSizeMultiplier={1.2} style={styles.body}>Tiến trình màn này đã được lưu. Bạn có thể chơi tiếp khi quay lại.</Text>
        <GameButton title="Tiếp tục" disabled={busy} onPress={onContinue} style={styles.button} />
        <GameButton title="Về Tiên Lộ" disabled={busy} onPress={onBack} art="buttonSecondary" textStyle={styles.secondaryText} style={styles.button} />
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
  button: { width: '100%' },
  secondaryText: { color: colors.ivory },
});
