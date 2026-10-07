import React, { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ART, SKILL_ART, SWORD_ART, type Artwork } from '../assets';
import { SKILLS, SWORDS, realmForExp, type SkillId } from '../game/domain';
import { useGameStore } from '../state/gameStore';
import { colors } from '../theme';
import { ScreenFrame } from './Art';
import { BottomNav, TopHud } from './Chrome';
import { navigateTab } from './Navigation';
import { Notice } from './Notice';

type Category = 'sword' | 'skill';
const SAVE_ERROR = 'Không thể lưu thay đổi. Vui lòng thử lại.';

function EquipmentArt({ art, skill = false, empty = false }: { art?: Artwork; skill?: boolean; empty?: boolean }) {
  return (
    <View style={styles.socket}>
      <Image source={ART[skill ? empty ? 'slotSkillEmpty' : 'slotSkill' : 'slotSword']} contentFit="contain" accessible={false} style={StyleSheet.absoluteFill} />
      {art ? <Image source={ART[art]} contentFit="contain" accessible={false} style={styles.itemIcon} /> : null}
    </View>
  );
}

function EquipButton({ title, label, disabled, onPress }: { title: string; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={disabled ? undefined : onPress} style={({ pressed }) => [styles.equipTap, pressed && styles.pressed]}>
      <Image source={ART[disabled ? 'inventoryButtonDisabled' : 'inventoryButton']} contentFit="fill" accessible={false} style={styles.equipArt} />
      <Text maxFontSizeMultiplier={1.2} style={[styles.equipText, disabled && styles.disabledText]}>{title}</Text>
    </Pressable>
  );
}

export function InventoryCollection({ initialCategory = 'sword' }: { initialCategory?: Category }) {
  const router = useRouter();
  const store = useGameStore();
  const profile = store.save.profile;
  const realm = realmForExp(profile.totalExp);
  const [category, setCategory] = useState<Category>(initialCategory);
  const [selectedSkillId, setSelectedSkillId] = useState<SkillId | null>(null);
  const [working, setWorking] = useState(false);
  const [modalError, setModalError] = useState('');
  const inFlight = useRef(false);
  const selectedSkill = SKILLS.find(skill => skill.id === selectedSkillId);

  useEffect(() => {
    setCategory(initialCategory);
    setSelectedSkillId(null);
    setModalError('');
  }, [initialCategory]);

  const execute = async (work: () => Promise<boolean>, inModal = false): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setWorking(true);
    setModalError('');
    try {
      const saved = await work();
      if (saved) store.setNotice('Đã trang bị. Áp dụng từ màn tiếp theo.');
      else if (inModal) setModalError(useGameStore.getState().notice || SAVE_ERROR);
      return saved;
    } catch {
      if (inModal) setModalError(SAVE_ERROR);
      else store.setNotice(SAVE_ERROR);
      return false;
    } finally {
      inFlight.current = false;
      setWorking(false);
    }
  };

  const equipSkill = async (id: SkillId, slot: number) => {
    const skills = [...profile.loadout.skills];
    const other = skills.indexOf(id);
    if (other >= 0 && other !== slot) {
      const previous = skills[slot];
      // Loadout skills are contiguous: moving an equipped skill requires a swap.
      if (!previous) return;
      skills[slot] = id;
      skills[other] = previous;
    } else {
      skills[slot] = id;
    }
    if (await execute(() => store.equip({ ...profile.loadout, skills }), true)) setSelectedSkillId(null);
  };

  const closeModal = () => {
    if (inFlight.current) return;
    setSelectedSkillId(null);
    setModalError('');
  };
  const items = category === 'sword' ? SWORDS : SKILLS;
  const owned: readonly string[] = category === 'sword' ? profile.ownedSwords : profile.ownedSkills;

  return (
    <ScreenFrame background="bgRealm">
      <TopHud onAccount={() => router.push('/account')} />
      <View style={styles.tabs}>
        {(['sword', 'skill'] as const).map(tab => (
          <Pressable key={tab} accessibilityRole="tab" accessibilityLabel={tab === 'sword' ? 'Bảo kiếm' : 'Kiếm thuật'} accessibilityState={{ selected: category === tab, disabled: working }} disabled={working} onPress={() => setCategory(tab)} style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
            <Image source={ART[category === tab ? 'inventoryTabActive' : 'inventoryTabIdle']} contentFit="fill" accessible={false} style={StyleSheet.absoluteFill} />
            <Text maxFontSizeMultiplier={1.3} style={[styles.tabText, category === tab && styles.selectedTabText]}>{tab === 'sword' ? 'BẢO KIẾM' : 'KIẾM THUẬT'}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
        {items.filter(item => owned.includes(item.id)).map(item => {
          const isSkill = 'cost' in item;
          const slot = isSkill ? profile.loadout.skills.indexOf(item.id) : -1;
          const equipped = isSkill ? slot >= 0 : profile.loadout.sword === item.id;
          const canEquip = !equipped || (isSkill && profile.loadout.skills.length > 1);
          const art = isSkill ? SKILL_ART[item.id] : SWORD_ART[item.id];
          return (
            <View key={item.id} style={styles.card}>
              <Image source={ART.inventoryCard} contentFit="fill" accessible={false} style={StyleSheet.absoluteFill} />
              <EquipmentArt art={art} skill={isSkill} />
              <View style={styles.cardBody}>
                <View style={styles.cardHeading}>
                  <View style={styles.nameArea}>
                    <Text style={styles.name}>{item.name}</Text>
                    {equipped || isSkill ? <Text style={styles.meta}>{equipped ? isSkill ? `Đang ở ô ${slot + 1} · ` : 'Đang trang bị' : ''}{isSkill ? `${item.cost} khí` : ''}</Text> : null}
                  </View>
                  {canEquip ? <EquipButton title={equipped ? 'ĐỔI Ô' : 'TRANG BỊ'} label={`${equipped ? 'Đổi ô' : 'Trang bị'} ${item.name}`} disabled={working} onPress={() => {
                    if (isSkill) {
                      setModalError('');
                      setSelectedSkillId(item.id);
                    } else {
                      void execute(() => store.equip({ ...profile.loadout, sword: item.id }));
                    }
                  }} /> : null}
                </View>
                <Text style={styles.description}>{item.description}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
      <BottomNav active="bag" onSelect={id => navigateTab(router, id)} />
      <Notice message={store.notice} onDismiss={() => store.setNotice('')} />
      <Modal visible={Boolean(selectedSkill)} transparent animationType="none" onRequestClose={closeModal}>
        <SafeAreaView style={styles.modalOverlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="Đóng bảng chọn ô" disabled={working} onPress={closeModal} style={StyleSheet.absoluteFill} />
          {selectedSkill ? (
            <View accessibilityViewIsModal style={styles.dialog}>
              <Image source={ART.inventoryDialog} contentFit="fill" accessible={false} style={StyleSheet.absoluteFill} />
              <ScrollView contentContainerStyle={styles.dialogContent}>
                <Text accessibilityRole="header" style={styles.dialogTitle}>Trang bị {selectedSkill.name}</Text>
                <Text style={styles.dialogCaption}>Chọn ô trang bị</Text>
                {Array.from({ length: realm.skillSlots }, (_, slot) => {
                  const current = SKILLS.find(skill => skill.id === profile.loadout.skills[slot]);
                  const selected = current?.id === selectedSkill.id;
                  const unavailableMove = !current && profile.loadout.skills.includes(selectedSkill.id);
                  const disabled = working || selected || unavailableMove;
                  return (
                    <Pressable key={slot} accessibilityRole="button" accessibilityLabel={`Trang bị ${selectedSkill.name} vào ô ${slot + 1}, ${current ? current.name : 'ô trống'}`} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={disabled ? undefined : () => void equipSkill(selectedSkill.id, slot)} style={({ pressed }) => [styles.slotRow, selected && styles.selectedSlot, disabled && !selected && styles.disabledSlot, pressed && styles.pressed]}>
                      <EquipmentArt art={current ? SKILL_ART[current.id] : undefined} skill empty={!current} />
                      <View style={styles.slotCopy}>
                        <Text style={styles.slotNumber}>Ô {slot + 1}</Text>
                        <Text style={styles.slotName}>{current?.name ?? 'Ô trống'}</Text>
                      </View>
                      {selected ? <Text style={styles.slotState}>Đang dùng</Text> : null}
                    </Pressable>
                  );
                })}
                {working ? <Text accessibilityLiveRegion="polite" style={styles.dialogCaption}>Đang lưu…</Text> : null}
                {modalError ? <Text accessibilityRole="alert" style={styles.modalError}>{modalError}</Text> : null}
                <Pressable accessibilityRole="button" accessibilityLabel="Hủy trang bị" accessibilityState={{ disabled: working }} disabled={working} onPress={closeModal} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
                  <Text style={styles.cancelText}>HỦY</Text>
                </Pressable>
              </ScrollView>
            </View>
          ) : null}
        </SafeAreaView>
      </Modal>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 10, flexShrink: 0 },
  tab: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  tabText: { color: colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  selectedTabText: { color: colors.ivory },
  scroll: { flex: 1, minHeight: 0 },
  list: { gap: 8, paddingBottom: 12 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, minHeight: 88 },
  socket: { width: 56, height: 56, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  itemIcon: { width: 48, height: 48 },
  cardBody: { flex: 1, minWidth: 0, gap: 5 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nameArea: { flex: 1, minWidth: 0, gap: 2 },
  name: { color: colors.ivory, fontSize: 17, lineHeight: 22, fontWeight: '800' },
  meta: { color: colors.goldBright, fontSize: 10, lineHeight: 15, fontWeight: '600' },
  description: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  equipTap: { width: 88, minHeight: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  equipArt: { position: 'absolute', width: 88, height: 34 },
  equipText: { color: colors.ivory, fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
  disabledText: { color: colors.ivory },
  pressed: { opacity: 0.85 },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(1,18,23,0.76)', padding: 24 },
  dialog: { width: '100%', maxWidth: 340, maxHeight: '90%' },
  dialogContent: { padding: 20, gap: 8 },
  dialogTitle: { color: colors.ivory, fontSize: 20, lineHeight: 26, fontWeight: '800', textAlign: 'center' },
  dialogCaption: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginBottom: 4 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(215,183,110,0.26)', backgroundColor: 'rgba(11,80,81,0.45)' },
  selectedSlot: { borderColor: colors.gold, backgroundColor: 'rgba(26,119,114,0.32)' },
  disabledSlot: { opacity: 0.55 },
  slotCopy: { flex: 1, minWidth: 0, gap: 3 },
  slotNumber: { color: colors.goldBright, fontSize: 11, fontWeight: '700' },
  slotName: { color: colors.ivory, fontSize: 14, lineHeight: 19, fontWeight: '700' },
  slotState: { color: colors.gold, fontSize: 10, maxWidth: 50, textAlign: 'center' },
  modalError: { color: '#ffb7aa', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: colors.goldBright, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
});
