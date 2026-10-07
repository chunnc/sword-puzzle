import React from 'react';
import { Image } from 'expo-image';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ART, SKILL_ART, SWORD_ART, tileArtwork } from '../assets';
import { CONTENT, SKILLS, SWORDS, type SkillId } from '../game/domain';
import { GoalKind, TileKind, type BoardSnapshot, type LevelDefinition } from '../game/types';
import { colors } from '../theme';
import { ArtPanel } from './Art';
import { GameplayProgressBar } from './GameplayProgressBar';
import { OutlinedText } from './OutlinedText';

export function GameplayHeader({ levelId, busy, compact, onBack, onHelp }: {
  levelId: number; busy: boolean; compact: boolean; onBack: () => void; onHelp: () => void;
}) {
  return (
    <View style={[styles.header, compact && styles.compactHeader]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Rời màn chơi" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed, busy && styles.dim]}>
        <Image source={ART.gameplayBack} contentFit="contain" accessible={false} style={styles.backArt} />
      </Pressable>
      <View style={styles.stageTitle}><OutlinedText accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.stageText, compact && styles.compactStageText]}>Màn {levelId}</OutlinedText></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Luật các ô" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onHelp} style={({ pressed }) => [styles.help, pressed && styles.pressed]}>
        <OutlinedText maxFontSizeMultiplier={1.2} style={styles.helpText}>Luật ô</OutlinedText>
      </Pressable>
    </View>
  );
}

export function GameplayInfo({ level, board, compact, reduceMotion, duration }: {
  level: LevelDefinition; board: BoardSnapshot; compact: boolean; reduceMotion: boolean; duration: number;
}) {
  const battle = level.goal === GoalKind.Battle || level.goal === GoalKind.Boss;
  const goalName = battle ? level.goal === GoalKind.Boss ? 'Yêu vương' : 'Yêu thú'
    : level.goal === GoalKind.Collect ? `Thu ${CONTENT.tiles.find(tile => tile.id === level.collectKind)?.name ?? 'linh vật'}`
    : level.goal === GoalKind.BreakRocks ? 'Phá đá' : 'Phá phong ấn';
  const goalIcon = battle ? ART.beast : level.goal === GoalKind.Collect ? tileArtwork(level.collectKind)
    : level.goal === GoalKind.BreakRocks ? tileArtwork(TileKind.Rock) : ART.overlaySeal;
  return (
    <View testID="game-info" style={[styles.info, compact && styles.compactInfo]}>
      <View style={styles.infoRow}>
        <ArtPanel art="gameplayObjective" testID="game-objective-panel" style={[styles.objective, compact && styles.compactObjective]}>
          <View style={styles.goalRow}>
            {battle ? <View testID="game-enemy-avatar" style={[styles.avatar, compact && styles.compactAvatar]}>
              <Image source={ART.beast} contentFit="contain" accessible={false} style={[styles.avatarArt, compact && styles.compactAvatarArt]} />
            </View> : <Image source={goalIcon} contentFit="contain" accessible={false} style={styles.goalIcon} />}
            <View style={[styles.goalText, battle && styles.enemyText]}>
              <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.eyebrow}>{goalName}</Text>
              {battle ? <GameplayProgressBar value={board.remaining} max={level.target} tone="health" accessibilityLabel={`Máu ${goalName.toLowerCase()}`} animated={!reduceMotion} duration={duration} />
                : <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.goalNumber, compact && styles.compactGoalNumber]}>{board.remaining}<Text style={styles.goalTotal}> / {level.target}</Text></Text>}
            </View>
          </View>
        </ArtPanel>
        <ArtPanel art="gameplayMoves" testID="game-moves-panel" style={[styles.moves, compact && styles.compactMoves]}>
          <Text maxFontSizeMultiplier={1.2} style={styles.movesLabel}>Lượt</Text>
          <Text maxFontSizeMultiplier={1.2} style={[styles.movesNumber, compact && styles.compactGoalNumber, board.moves <= 3 && styles.lowMoves]}>{board.moves}</Text>
        </ArtPanel>
      </View>
    </View>
  );
}

export function GameplayDock({ board, skillSlots, available, cost, targetSkill, targetCount, canCast, busy, compact, onSkill, onCancel, onCast }: {
  board: BoardSnapshot; skillSlots: number; available: SkillId[]; cost: (id: SkillId) => number;
  targetSkill: SkillId | null; targetCount: number; canCast: boolean; busy: boolean; compact: boolean;
  onSkill: (id: SkillId) => void; onCancel: () => void; onCast: () => void;
}) {
  const sword = SWORDS.find(item => item.id === board.loadout.sword)!;
  return (
    <View testID="game-skill-controls" style={[styles.controls, compact && styles.compactControls]}>
      <View style={styles.energy}>
        <OutlinedText maxFontSizeMultiplier={1.2} style={styles.energyText}>Kiếm khí {board.swordQi}/100{board.condensed ? ' · Ngưng khí −25%' : ''}</OutlinedText>
        <GameplayProgressBar value={board.swordQi} max={100} tone="qi" accessibilityLabel="Kiếm khí" />
      </View>
      <View testID="game-cast-actions" style={styles.actions}>
        {targetSkill ? <View style={styles.castRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Hủy chọn kỹ năng" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onCancel} style={({ pressed }) => [styles.actionButton, styles.cancelButton, pressed && styles.pressed, busy && styles.disabledAction]}>
            <Image source={ART.gameplayCancel} contentFit="contain" accessible={false} style={StyleSheet.absoluteFill} />
            <Text maxFontSizeMultiplier={1.2} style={styles.cancelText}>Hủy</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Thi triển · ${cost(targetSkill)} khí`} accessibilityState={{ disabled: busy || !canCast }} disabled={busy || !canCast} onPress={onCast} style={({ pressed }) => [styles.actionButton, styles.castButton, pressed && styles.pressed, (busy || !canCast) && styles.disabledAction]}>
            <Image source={ART.gameplayCast} contentFit="contain" accessible={false} style={StyleSheet.absoluteFill} />
            <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.castText}>Thi triển · {cost(targetSkill)} khí</Text>
          </Pressable>
        </View> : null}
      </View>
      <View testID="game-equipment-row" style={[styles.dock, compact && styles.compactDock]}>
        <View testID="game-sword" accessible accessibilityRole="image" accessibilityLabel={`Bảo kiếm ${sword.name}`} style={styles.equipmentColumn}>
          <View style={[styles.socket, compact && styles.compactSocket]}>
            <Image source={ART.slotSword} contentFit="contain" accessible={false} style={StyleSheet.absoluteFill} />
            <Image source={ART[SWORD_ART[sword.id]]} contentFit="contain" accessible={false} style={[styles.equipmentIcon, compact && styles.compactEquipmentIcon]} />
          </View>
          <OutlinedText numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.itemName, compact && styles.compactItemName]}>{sword.name}</OutlinedText>
          <OutlinedText maxFontSizeMultiplier={1.2} style={[styles.itemCaption, compact && styles.compactItemCaption]}>Bảo kiếm</OutlinedText>
        </View>
        {[0, 1].map(slot => {
          const id = board.loadout.skills[slot];
          // Equipped skills belong to the run even if the live profile changes.
          const definition = id ? SKILLS.find(item => item.id === id) : undefined;
          const locked = !definition && slot >= skillSlots;
          const selected = Boolean(id && targetSkill === id);
          const ready = Boolean(id && available.includes(id));
          const disabled = busy || !definition || !ready;
          const frame = definition ? 'slotSkill' : locked ? 'slotSkillLocked' : 'slotSkillEmpty';
          return <View key={slot} testID={`game-skill-slot-${slot}`} style={styles.equipmentColumn}>
            <Pressable accessibilityRole="button" accessibilityLabel={definition ? `${definition.name}, ${cost(definition.id)} kiếm khí` : locked ? `Ô kỹ năng ${slot + 1} bị khóa, mở tại 1500 EXP` : `Ô kỹ năng ${slot + 1} trống`} accessibilityHint={selected ? `Chọn ${targetCount} ô trên bàn cờ, sau đó bấm Thi triển` : undefined} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={id ? () => onSkill(id) : undefined} style={({ pressed }) => [styles.socket, compact && styles.compactSocket, selected && styles.selectedSocket, pressed && styles.pressed]}>
              <Image source={ART[frame]} contentFit="contain" accessible={false} style={[StyleSheet.absoluteFill, definition && !ready && styles.dim]} />
              {definition ? <Image source={ART[SKILL_ART[definition.id]]} contentFit="contain" accessible={false} style={[styles.equipmentIcon, compact && styles.compactEquipmentIcon, !ready && styles.dim]} /> : null}
              {ready && !selected && !busy ? <View pointerEvents="none" style={styles.readyDot} /> : null}
            </Pressable>
            <OutlinedText numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.itemName, compact && styles.compactItemName, selected && styles.selectedName]}>{definition?.name ?? (locked ? 'Chưa mở' : 'Ô trống')}</OutlinedText>
            <OutlinedText numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.itemCaption, compact && styles.compactItemCaption, ready && styles.readyCaption]}>{definition ? `${selected ? `Chọn ${targetCount} ô · ` : ''}${cost(definition.id)} khí` : locked ? 'Trúc Cơ' : 'Kỹ năng'}</OutlinedText>
          </View>;
        })}
      </View>
    </View>
  );
}

const displayFont = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' });
const styles = StyleSheet.create({
  header: { height: 52, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  compactHeader: { height: 44 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backArt: { width: 40, height: 40 },
  stageTitle: { flex: 1, minWidth: 0 },
  stageText: { fontFamily: displayFont, fontSize: 21, fontWeight: '700', color: colors.ivory },
  compactStageText: { fontSize: 19 },
  help: { minWidth: 60, height: 44, alignItems: 'center', justifyContent: 'center' },
  helpText: { color: colors.goldBright, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  info: { flexShrink: 0, paddingTop: 8, paddingBottom: 8 },
  compactInfo: { paddingTop: 2, paddingBottom: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  objective: { height: 76, flex: 1, minWidth: 0, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'stretch' },
  compactObjective: { height: 66, paddingVertical: 6, paddingHorizontal: 12 },
  goalRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flex: 1 },
  goalIcon: { width: 40, height: 40, flexShrink: 0 },
  goalText: { flex: 1, minWidth: 0 },
  enemyText: { gap: 6, paddingRight: 28 },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.inkDeep, overflow: 'hidden', flexShrink: 0 },
  compactAvatar: { width: 40, height: 40, borderRadius: 20 },
  // Frame the existing beast's head, centered around 60% x / 29% y.
  avatarArt: { position: 'absolute', width: 120, height: 144, left: -48, top: -18 },
  compactAvatarArt: { width: 100, height: 120, left: -40, top: -15 },
  eyebrow: { color: colors.textMuted, fontSize: 11, lineHeight: 14, fontWeight: '700' },
  goalNumber: { color: colors.ivory, fontSize: 26, lineHeight: 30, fontWeight: '900', fontVariant: ['tabular-nums'] },
  goalTotal: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  compactGoalNumber: { fontSize: 22, lineHeight: 26 },
  moves: { width: 66, height: 76, paddingVertical: 8 },
  compactMoves: { height: 66, width: 60 },
  movesLabel: { color: colors.textMuted, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  movesNumber: { color: colors.ivory, fontSize: 28, lineHeight: 32, fontWeight: '900', fontVariant: ['tabular-nums'] },
  lowMoves: { color: colors.goldBright },
  controls: { height: 202, flexShrink: 0, paddingTop: 4, gap: 4 },
  compactControls: { height: 166 },
  energy: { height: 30, gap: 1, paddingHorizontal: 6 },
  energyText: { color: colors.goldBright, fontSize: 10, lineHeight: 12, fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'] },
  actions: { height: 44, justifyContent: 'center' },
  castRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44 },
  actionButton: { height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  cancelButton: { width: 64 },
  castButton: { width: 156 },
  cancelText: { color: colors.ivory, fontSize: 11, fontWeight: '700' },
  castText: { color: colors.goldBright, fontSize: 12, fontWeight: '800' },
  disabledAction: { opacity: 0.55 },
  dock: { height: 116, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 14 },
  compactDock: { height: 80, paddingVertical: 6 },
  equipmentColumn: { flex: 1, minWidth: 0, alignItems: 'center', gap: 1 },
  socket: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 30 },
  compactSocket: { width: 44, height: 44, borderRadius: 22 },
  equipmentIcon: { width: 52, height: 52 },
  compactEquipmentIcon: { width: 40, height: 40 },
  selectedSocket: { backgroundColor: 'rgba(242,213,142,0.15)', borderWidth: 2, borderColor: colors.goldBright },
  itemName: { color: colors.ivory, fontSize: 11, lineHeight: 14, fontWeight: '700', paddingHorizontal: 2, textAlign: 'center' },
  itemCaption: { color: colors.textMuted, fontSize: 9, lineHeight: 12, textAlign: 'center', fontVariant: ['tabular-nums'] },
  compactItemName: { fontSize: 10, lineHeight: 12 },
  compactItemCaption: { lineHeight: 10 },
  selectedName: { color: colors.goldBright },
  readyCaption: { color: '#9ee5c9' },
  readyDot: { position: 'absolute', right: 2, top: 3, width: 7, height: 7, borderRadius: 4, backgroundColor: '#9ee5c9', borderWidth: 1, borderColor: colors.inkDeep },
  pressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
  dim: { opacity: 0.45 },
});
