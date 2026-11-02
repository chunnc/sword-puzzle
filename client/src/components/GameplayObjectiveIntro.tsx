import React, { useState } from 'react';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ART, tileArtwork } from '../assets';
import { getContentVersion, semanticTileKind, type ObjectiveDefinition } from '../game/domain';
import { TileKind, type BoardSnapshot } from '../game/types';
import { colors } from '../theme';
import { GameplayDialogButton } from './GameplayDialogButton';
import { InventoryDialogPanel } from './InventoryDialogPanel';

function objectiveDetails(objective: ObjectiveDefinition, content: ReturnType<typeof getContentVersion>) {
  // Keep the preview compatible with map content that introduces Trận Nhãn.
  if ((objective.type as string) === 'ActivateNodes') return { name: 'Kích hoạt Trận Nhãn', icon: ART.overlaySeal };
  switch (objective.type) {
    case 'Collect': return {
      name: `Thu ${content.tiles.find(tile => tile.id === objective.tileKind)?.name ?? 'linh vật'}${objective.chargeTier ? ` cấp ${objective.chargeTier}` : ''}`,
      icon: tileArtwork(semanticTileKind(objective.tileKind, content), objective.chargeTier),
    };
    case 'BreakRocks': return { name: 'Phá đá', icon: tileArtwork(TileKind.Rock) };
    case 'BreakSeals': return { name: 'Phá phong ấn', icon: ART.overlaySeal };
    case 'Battle':
    case 'Boss': return {
      name: objective.enemy.name,
      icon: ART[objective.enemy.artKey as keyof typeof ART] ?? ART.beast,
    };
    default: return { name: 'Mục tiêu', icon: ART.overlaySeal };
  }
}

export function GameplayObjectiveIntro({ board, onStart, onBack }: {
  board: BoardSnapshot; onStart: () => void; onBack: () => void;
}) {
  const [panelWidth, setPanelWidth] = useState(0);
  const buttonWidth = Math.min(panelWidth < 350 ? 168 : 184, panelWidth > 0 ? Math.max(0, panelWidth - 48) : 168);
  const content = getContentVersion(board.contentVersion);
  const level = board.level;
  return <View testID="game-objective-intro" accessibilityViewIsModal style={styles.overlay}>
    <InventoryDialogPanel testID="game-objective-intro-panel">
      <View style={styles.content} onLayout={event => setPanelWidth(event.nativeEvent.layout.width)}>
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.2} style={styles.title}>MỤC TIÊU MÀN {level.id}</Text>
        <ScrollView testID="game-objective-intro-list" style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
          {level.objectives.map(objective => {
            const { name, icon } = objectiveDetails(objective, content);
            const enemy = objective.type === 'Battle' || objective.type === 'Boss';
            const label = enemy ? `Hạ ${name}, ${objective.target} máu` : `${name}, ${objective.target}`;
            return <View key={objective.id} testID={`intro-objective-${objective.id}`} accessible accessibilityRole="text" accessibilityLabel={label} style={styles.objective}>
              <Image source={icon} contentFit="contain" accessible={false} style={styles.icon} />
              <Text numberOfLines={2} maxFontSizeMultiplier={1.2} style={styles.objectiveName}>{enemy ? `Hạ ${name}` : name}</Text>
              {enemy
                ? <Text maxFontSizeMultiplier={1.2} style={styles.target}>
                    <Text style={styles.targetCurrent}>{objective.target}</Text><Text style={styles.targetSecondary}> HP</Text>
                  </Text>
                : <Text maxFontSizeMultiplier={1.2} style={styles.target}>
                    <Text style={styles.targetCurrent}>0</Text><Text style={styles.targetSecondary}>/{objective.target}</Text>
                  </Text>}
            </View>;
          })}
        </ScrollView>
        <View style={styles.actions}>
          <GameplayDialogButton title="BẮT ĐẦU" art="buttonPrimary" width={buttonWidth} disabled={false} onPress={onStart} />
          <GameplayDialogButton title="QUAY VỀ" art="buttonSecondary" width={buttonWidth} disabled={false} onPress={onBack} />
        </View>
      </View>
    </InventoryDialogPanel>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 20, backgroundColor: colors.veil, padding: 16, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, width: '100%', paddingHorizontal: 32, paddingVertical: 22, alignItems: 'center', gap: 5 },
  title: { color: colors.goldBright, fontSize: 18, lineHeight: 24, fontWeight: '900', textAlign: 'center' },
  list: { width: '100%', flex: 1, minHeight: 0 },
  listContent: { paddingVertical: 4, gap: 8 },
  objective: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 40, height: 40, flexShrink: 0 },
  objectiveName: { color: colors.ivory, fontSize: 14, lineHeight: 18, fontWeight: '800', flex: 1 },
  target: { fontSize: 18, lineHeight: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
  targetCurrent: { color: colors.goldBright },
  targetSecondary: { color: colors.parchment, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  actions: { width: '100%', alignItems: 'center', gap: 2 },
});
