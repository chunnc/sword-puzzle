import React, { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ART, SKILL_ART, SWORD_ART } from '../assets';
import { SKILLS, SWORDS } from '../game/domain';
import { useGameStore } from '../state/gameStore';
import { colors } from '../theme';
import { ScreenFrame } from './Art';
import { BottomNav, TopHud } from './Chrome';
import { CollectionTabs, type CollectionCategory } from './CollectionTabs';
import { navigateTab } from './Navigation';
import { Notice } from './Notice';

type ShopItem = typeof SWORDS[number] | typeof SKILLS[number];
type Selection = { category: CollectionCategory; id: ShopItem['id'] };
const SAVE_ERROR = 'Không thể lưu thay đổi. Vui lòng thử lại.';

function ItemArt({ item }: { item: ShopItem }) {
  const skill = 'cost' in item;
  const art = skill ? SKILL_ART[item.id] : SWORD_ART[item.id];
  return (
    <View style={styles.itemArt}>
      {skill ? <Image source={ART.slotSkill} contentFit="contain" accessible={false} style={StyleSheet.absoluteFill} /> : null}
      <Image source={ART[art]} contentFit="contain" accessible={false} style={StyleSheet.absoluteFill} />
    </View>
  );
}

function Price({ value }: { value: number }) {
  return (
    <View style={styles.priceRow}>
      <Image source={ART.iconLinhThach} contentFit="contain" accessible={false} style={styles.priceIcon} />
      <Text maxFontSizeMultiplier={1.2} style={styles.price}>{value}</Text>
    </View>
  );
}

function PurchaseButton({ price, label, disabled, onPress }: {
  price: number;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={disabled ? undefined : onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Image source={ART[disabled ? 'shopButtonDisabled' : 'shopButton']} contentFit="fill" accessible={false} style={StyleSheet.absoluteFill} />
      <View style={styles.buyContent}>
        <Text maxFontSizeMultiplier={1.2} style={[styles.buttonText, disabled && styles.secondaryText]}>Mua</Text>
        <Text maxFontSizeMultiplier={1.2} style={[styles.buttonText, styles.buyPrice, disabled && styles.secondaryText]}>{price}</Text>
        <Image source={ART.iconLinhThach} contentFit="contain" accessible={false} style={styles.priceIcon} />
      </View>
    </Pressable>
  );
}

export function ShopCollection({ initialCategory = 'sword' }: { initialCategory?: CollectionCategory }) {
  const router = useRouter();
  const store = useGameStore();
  const profile = store.save.profile;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState<number | null>(null);
  const cardWidth = ((gridWidth ?? width - 24) - 8) / 2;
  const [category, setCategory] = useState<CollectionCategory>(initialCategory);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [working, setWorking] = useState(false);
  const [modalError, setModalError] = useState('');
  const inFlight = useRef(false);
  const list = useRef<ScrollView>(null);
  const items = category === 'sword' ? SWORDS : SKILLS;
  const owned: readonly string[] = category === 'sword' ? profile.ownedSwords : profile.ownedSkills;
  const available = items.filter(item => !owned.includes(item.id));
  const selectedOwned: readonly string[] = selection?.category === 'skill' ? profile.ownedSkills : profile.ownedSwords;
  const selectedItem = selection && !selectedOwned.includes(selection.id)
    ? (selection.category === 'sword' ? SWORDS : SKILLS).find(item => item.id === selection.id)
    : undefined;
  const locked = Boolean(selectedItem && profile.levels.length < selectedItem.unlock);
  const insufficient = Boolean(selectedItem && profile.coins < selectedItem.price);
  const buyDisabled = working || locked || insufficient;

  useEffect(() => {
    setCategory(initialCategory);
    setSelection(null);
    setModalError('');
  }, [initialCategory]);

  useEffect(() => {
    list.current?.scrollTo({ y: 0, animated: false });
  }, [category]);

  useEffect(() => {
    if (selection && !selectedItem) {
      setSelection(null);
      setModalError('');
    }
  }, [selection, selectedItem]);

  const closeModal = () => {
    if (inFlight.current) return;
    setSelection(null);
    setModalError('');
  };

  const purchase = async () => {
    if (inFlight.current || !selection || !selectedItem || buyDisabled) return;
    inFlight.current = true;
    setWorking(true);
    setModalError('');
    store.setNotice('');
    try {
      if (await store.purchase(selection.category, selectedItem.id)) {
        setSelection(null);
        store.setNotice('Đã thêm vào túi đồ.');
      } else {
        setModalError(useGameStore.getState().notice || SAVE_ERROR);
      }
    } catch {
      setModalError(SAVE_ERROR);
    } finally {
      inFlight.current = false;
      setWorking(false);
    }
  };

  const rows = Array.from({ length: Math.ceil(available.length / 2) }, (_, row) => available.slice(row * 2, row * 2 + 2));

  return (
    <ScreenFrame background="bgRealm">
      <TopHud onAccount={() => router.push('/account')} />
      <CollectionTabs category={category} disabled={working} onSelect={next => {
        if (inFlight.current) return;
        setCategory(next);
        setSelection(null);
        setModalError('');
      }} />
      <ScrollView ref={list} onLayout={event => setGridWidth(event.nativeEvent.layout.width)} style={styles.scroll} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}>
        {rows.map(row => (
          <View key={row[0].id} style={styles.row}>
            {row.map(item => {
              const itemLocked = profile.levels.length < item.unlock;
              return (
                <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Xem ${item.name}`} accessibilityHint={`${item.price} Linh Thạch${itemLocked ? `, mở sau màn ${item.unlock}` : ''}`} accessibilityState={{ disabled: working }} disabled={working} onPress={() => {
                  setModalError('');
                  setSelection({ category, id: item.id });
                }} style={({ pressed }) => [styles.card, { width: cardWidth }, pressed && styles.pressed]}>
                  <Image source={ART.shopCard} contentFit="fill" accessible={false} style={StyleSheet.absoluteFill} />
                  <View style={[styles.iconArea, itemLocked && styles.lockedArt]}><ItemArt item={item} /></View>
                  <Text numberOfLines={2} maxFontSizeMultiplier={1.2} style={styles.name}>{item.name}</Text>
                  <Price value={item.price} />
                  <View style={styles.cardStatus}>
                    {itemLocked ? <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.lockLabel}>Mở sau màn {item.unlock}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
            {row.length === 1 ? <View style={{ width: cardWidth }} /> : null}
          </View>
        ))}
        {!available.length ? (
          <View style={styles.empty}>
            <Text accessibilityLiveRegion="polite" style={styles.emptyText}>Đã sở hữu toàn bộ {category === 'sword' ? 'bảo kiếm' : 'kiếm thuật'}.</Text>
          </View>
        ) : null}
      </ScrollView>
      <BottomNav active="shop" onSelect={id => navigateTab(router, id)} />
      <Notice message={store.notice} onDismiss={() => store.setNotice('')} />
      <Modal visible={Boolean(selectedItem)} transparent animationType="none" onRequestClose={closeModal}>
        <View style={[styles.modalOverlay, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20, paddingLeft: insets.left + 20, paddingRight: insets.right + 20 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Đóng chi tiết vật phẩm" accessibilityState={{ disabled: working }} disabled={working} onPress={closeModal} style={StyleSheet.absoluteFill} />
          {selectedItem ? (
            <View accessibilityViewIsModal style={styles.dialog}>
              <Image source={ART.shopDialog} contentFit="fill" accessible={false} style={StyleSheet.absoluteFill} />
              <View style={styles.detailContent}>
                <View style={styles.detailIcon}><ItemArt item={selectedItem} /></View>
                <Text accessibilityRole="header" style={styles.detailTitle}>{selectedItem.name}</Text>
                <Text style={styles.description}>{selectedItem.description}</Text>
                {'cost' in selectedItem ? <Text style={styles.detailMeta}>Tiêu hao {selectedItem.cost} khí</Text> : null}
              </View>
              <View style={styles.footer}>
                {working || locked || insufficient ? <Text accessibilityLiveRegion="polite" style={styles.reason}>{working ? 'Đang lưu…' : locked ? `Cần vượt qua màn ${selectedItem.unlock}` : 'Chưa đủ Linh Thạch.'}</Text> : null}
                {modalError ? <Text accessibilityRole="alert" style={styles.modalError}>{modalError}</Text> : null}
                <PurchaseButton price={selectedItem.price} label={`Mua ${selectedItem.name}, ${selectedItem.price} Linh Thạch`} disabled={buyDisabled} onPress={() => void purchase()} />
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Đóng" accessibilityState={{ disabled: working }} disabled={working} onPress={working ? undefined : closeModal} style={({ pressed }) => [styles.close, working && styles.closeDisabled, pressed && styles.pressed]}>
                <Image source={ART.shopCloseIcon} contentFit="contain" accessible={false} style={styles.closeIcon} />
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0 },
  list: { gap: 8, paddingBottom: 12 },
  row: { flexDirection: 'row', gap: 8 },
  card: { aspectRatio: 4 / 5, padding: 12, alignItems: 'center', gap: 4 },
  iconArea: { flex: 1, minHeight: 40, width: '100%', alignItems: 'center', justifyContent: 'center' },
  itemArt: { width: '100%', height: '100%', maxWidth: 92, maxHeight: 92 },
  lockedArt: { opacity: 0.65 },
  name: { color: colors.ivory, fontSize: 15, lineHeight: 20, fontWeight: '800', textAlign: 'center', minHeight: 40 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 22 },
  priceIcon: { width: 22, height: 22 },
  price: { color: colors.goldBright, fontSize: 14, lineHeight: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  cardStatus: { minHeight: 16 },
  lockLabel: { color: colors.textMuted, fontSize: 10, lineHeight: 16, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  empty: { backgroundColor: 'rgba(6,36,39,0.92)', borderColor: colors.gold, borderWidth: 1, borderRadius: 12, padding: 24 },
  emptyText: { color: colors.ivory, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.veil },
  dialog: { width: '100%', maxWidth: 340, padding: 20 },
  detailContent: { alignItems: 'center', gap: 8, paddingBottom: 4 },
  detailIcon: { width: 72, height: 72 },
  detailTitle: { color: colors.ivory, fontSize: 22, lineHeight: 28, fontWeight: '800', textAlign: 'center' },
  description: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center', alignSelf: 'stretch' },
  detailMeta: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  footer: { flexShrink: 0, gap: 8, paddingTop: 12 },
  reason: { color: colors.goldBright, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  modalError: { color: '#ffb7aa', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  button: { height: 44, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center' },
  buyContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buyPrice: { fontVariant: ['tabular-nums'] },
  buttonText: { color: colors.inkDeep, fontSize: 13, fontWeight: '800', letterSpacing: 0.4 },
  secondaryText: { color: colors.ivory },
  close: { position: 'absolute', top: 12, right: 12, width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  closeIcon: { width: 32, height: 32 },
  closeDisabled: { opacity: 0.55 },
});
