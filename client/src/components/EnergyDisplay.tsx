import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { advanceEnergy, type EnergyState } from '../game/domain';
import { useGameStore } from '../state/gameStore';
import { colors, type } from '../theme';
import { GameplayDialogButton } from './GameplayDialogButton';
import { InventoryDialogPanel } from './InventoryDialogPanel';
import { energyMinutes } from '../game/energyPresentation';
export { energyMinutes } from '../game/energyPresentation';

export function useEnergyDisplay(energy: EnergyState, serverOffsetMs: number, syncAtRecovery = true) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (energy.current >= 5 || energy.nextRecoveryAt === null) return;
    const remaining = Math.max(0, energy.nextRecoveryAt - (Date.now() + serverOffsetMs));
    const interval = setInterval(() => setNow(Date.now()), 10_000);
    const recovery = syncAtRecovery ? setTimeout(() => { void useGameStore.getState().syncEnergy(); }, remaining + 50) : undefined;
    return () => { clearInterval(interval); if (recovery) clearTimeout(recovery); };
  }, [energy.current, energy.nextRecoveryAt, serverOffsetMs, syncAtRecovery]);
  return advanceEnergy(energy, now + serverOffsetMs);
}

export function EnergyEmptyDialog() {
  const visible = useGameStore(state => state.energyPrompt);
  if (!visible) return null;
  return <EnergyEmptyDialogPanel />;
}

function EnergyEmptyDialogPanel() {
  const visible = useGameStore(state => state.energyPrompt);
  const close = useGameStore(state => state.setEnergyPrompt);
  const energy = useGameStore(state => state.save.profile.energy);
  const offset = useGameStore(state => state.energyClockOffsetMs);
  const display = useEnergyDisplay(energy, offset, false);
  const [width, setWidth] = useState(0);
  const buttonWidth = Math.min(220, width > 0 ? width - 40 : 220);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => close(false)} accessibilityViewIsModal>
    <View style={styles.backdrop}>
      <InventoryDialogPanel testID="energy-empty-panel">
        <View style={styles.content} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={1.2} style={styles.title}>Bạn đã hết năng lượng</Text>
          {display.nextRecoveryAt !== null
            ? <Text maxFontSizeMultiplier={1.2} style={styles.body}>Hồi 1 năng lượng sau {energyMinutes(display, Date.now() + offset)}.</Text>
            : <Text maxFontSizeMultiplier={1.2} style={styles.body}>Bạn đã hồi được năng lượng để tiếp tục.</Text>}
          <GameplayDialogButton title="Đóng" art="buttonPrimary" width={buttonWidth} disabled={false} onPress={() => close(false)} />
        </View>
      </InventoryDialogPanel>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,12,18,.82)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  content: { width: '100%', flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, gap: 14 },
  title: { ...type.heading, color: colors.goldBright, fontSize: 20, lineHeight: 26, fontWeight: '900', textAlign: 'center' },
  body: { color: colors.ivory, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
