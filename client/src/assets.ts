import { ImageSourcePropType } from 'react-native';
import { TileKind } from './game/types';
import type { SkillId, SwordId } from './game/domain';

export const ART = {
  iconLinhThach: require('../app-assets/ui/icon_linh_thach.webp') as ImageSourcePropType,
  iconTienNgoc: require('../app-assets/ui/icon_tien_ngoc.webp') as ImageSourcePropType,
  hudTrayV2: require('../app-assets/ui/hud_tray_v2.webp') as ImageSourcePropType,
  slotSword: require('../app-assets/ui/slot_sword.webp') as ImageSourcePropType,
  slotSkill: require('../app-assets/ui/slot_skill.webp') as ImageSourcePropType,
  slotSkillEmpty: require('../app-assets/ui/slot_skill_empty.webp') as ImageSourcePropType,
  slotSkillLocked: require('../app-assets/ui/slot_skill_locked.webp') as ImageSourcePropType,
  iconSwordThanhPhong: require('../app-assets/ui/icon_sword_thanh_phong.webp') as ImageSourcePropType,
  iconSwordTrongNhac: require('../app-assets/ui/icon_sword_trong_nhac.webp') as ImageSourcePropType,
  iconSwordHoaVan: require('../app-assets/ui/icon_sword_hoa_van.webp') as ImageSourcePropType,
  iconSwordLoiMinh: require('../app-assets/ui/icon_sword_loi_minh.webp') as ImageSourcePropType,
  iconSwordTuLinh: require('../app-assets/ui/icon_sword_tu_linh.webp') as ImageSourcePropType,
  iconSwordLienTinh: require('../app-assets/ui/icon_sword_lien_tinh.webp') as ImageSourcePropType,
  iconSwordPhaQuan: require('../app-assets/ui/icon_sword_pha_quan.webp') as ImageSourcePropType,
  iconSwordHuyenCo: require('../app-assets/ui/icon_sword_huyen_co.webp') as ImageSourcePropType,
  iconSkillNhatKiem: require('../app-assets/ui/icon_skill_nhat_kiem.webp') as ImageSourcePropType,
  iconSkillNguKiem: require('../app-assets/ui/icon_skill_ngu_kiem.webp') as ImageSourcePropType,
  iconSkillHoaLien: require('../app-assets/ui/icon_skill_hoa_lien.webp') as ImageSourcePropType,
  iconSkillDanLoi: require('../app-assets/ui/icon_skill_dan_loi.webp') as ImageSourcePropType,
  iconSkillPhaChuong: require('../app-assets/ui/icon_skill_pha_chuong.webp') as ImageSourcePropType,
  iconSkillLienKiem: require('../app-assets/ui/icon_skill_lien_kiem.webp') as ImageSourcePropType,
  iconSkillHoiLinh: require('../app-assets/ui/icon_skill_hoi_linh.webp') as ImageSourcePropType,
  iconSkillVanKiem: require('../app-assets/ui/icon_skill_van_kiem.webp') as ImageSourcePropType,
  iconSlotLocked: require('../app-assets/ui/icon_slot_locked.webp') as ImageSourcePropType,
  iconSlotEmpty: require('../app-assets/ui/icon_slot_empty.webp') as ImageSourcePropType,
  avatar: require('../app-assets/ui/avatar.webp') as ImageSourcePropType,
  avatarFrame: require('../app-assets/ui/avatar_frame.webp') as ImageSourcePropType,
  banner: require('../app-assets/ui/banner.webp') as ImageSourcePropType,
  barBlue: require('../app-assets/ui/bar_blue.webp') as ImageSourcePropType,
  barRed: require('../app-assets/ui/bar_red.webp') as ImageSourcePropType,
  barTrack: require('../app-assets/ui/bar_track.webp') as ImageSourcePropType,
  beast: require('../app-assets/ui/beast.webp') as ImageSourcePropType,
  bgBoss: require('../app-assets/ui/bg_boss.webp') as ImageSourcePropType,
  bgGame: require('../app-assets/ui/bg_game.webp') as ImageSourcePropType,
  bgMap: require('../app-assets/ui/bg_map.webp') as ImageSourcePropType,
  bgRealm: require('../app-assets/ui/bg_realm.webp') as ImageSourcePropType,
  buttonDisabled: require('../app-assets/ui/button_disabled.webp') as ImageSourcePropType,
  buttonPrimary: require('../app-assets/ui/button_primary.webp') as ImageSourcePropType,
  buttonSecondary: require('../app-assets/ui/button_secondary.webp') as ImageSourcePropType,
  chapterCard: require('../app-assets/ui/chapter_card.webp') as ImageSourcePropType,
  cultivator: require('../app-assets/ui/cultivator.webp') as ImageSourcePropType,
  dialogPanel: require('../app-assets/ui/dialog_panel.webp') as ImageSourcePropType,
  hudChip: require('../app-assets/ui/hud_chip.webp') as ImageSourcePropType,
  hudTray: require('../app-assets/ui/hud_tray.webp') as ImageSourcePropType,
  iconBag: require('../app-assets/ui/icon_bag.webp') as ImageSourcePropType,
  iconBolt: require('../app-assets/ui/icon_bolt.webp') as ImageSourcePropType,
  iconCoin: require('../app-assets/ui/icon_coin.webp') as ImageSourcePropType,
  iconHerb: require('../app-assets/ui/icon_herb.webp') as ImageSourcePropType,
  iconJade: require('../app-assets/ui/icon_jade.webp') as ImageSourcePropType,
  iconLotus: require('../app-assets/ui/icon_lotus.webp') as ImageSourcePropType,
  iconMap: require('../app-assets/ui/icon_map.webp') as ImageSourcePropType,
  iconMenu: require('../app-assets/ui/icon_menu.webp') as ImageSourcePropType,
  iconPerson: require('../app-assets/ui/icon_person.webp') as ImageSourcePropType,
  iconShop: require('../app-assets/ui/icon_shop.webp') as ImageSourcePropType,
  iconSkill: require('../app-assets/ui/icon_skill.webp') as ImageSourcePropType,
  nav: require('../app-assets/ui/nav.webp') as ImageSourcePropType,
  overlayOmni: require('../app-assets/ui/overlay_omni.webp') as ImageSourcePropType,
  overlaySeal: require('../app-assets/ui/overlay_seal.webp') as ImageSourcePropType,
  overlaySlash: require('../app-assets/ui/overlay_slash.webp') as ImageSourcePropType,
  panel: require('../app-assets/ui/panel.webp') as ImageSourcePropType,
  panelLight: require('../app-assets/ui/panel_light.webp') as ImageSourcePropType,
  skillIdle: require('../app-assets/ui/skill_idle.webp') as ImageSourcePropType,
  skillReady: require('../app-assets/ui/skill_ready.webp') as ImageSourcePropType,
  starBright: require('../app-assets/ui/star_bright.webp') as ImageSourcePropType,
  starGray: require('../app-assets/ui/star_gray.webp') as ImageSourcePropType,
  stageCurrent: require('../app-assets/ui/stage_current.webp') as ImageSourcePropType,
  stageDone: require('../app-assets/ui/stage_done.webp') as ImageSourcePropType,
  stageLocked: require('../app-assets/ui/stage_locked.webp') as ImageSourcePropType,
  tileFire: require('../app-assets/ui/tile_fire.webp') as number,
  tileHerb: require('../app-assets/ui/tile_herb.webp') as ImageSourcePropType,
  tileLightning: require('../app-assets/ui/tile_lightning.webp') as number,
  tileRock: require('../app-assets/ui/tile_rock.webp') as number,
  tileSpiritOrb: require('../app-assets/ui/tile_spirit_orb.webp') as number,
  tileStone: require('../app-assets/ui/tile_stone.webp') as ImageSourcePropType,
  tileSword: require('../app-assets/ui/tile_sword.webp') as number,
} as const;

export type Artwork = keyof typeof ART;

export const SWORD_ART = {
  'thanh-phong': 'iconSwordThanhPhong',
  'trong-nhac': 'iconSwordTrongNhac',
  'hoa-van': 'iconSwordHoaVan',
  'loi-minh': 'iconSwordLoiMinh',
  'tu-linh': 'iconSwordTuLinh',
  'lien-tinh': 'iconSwordLienTinh',
  'pha-quan': 'iconSwordPhaQuan',
  'huyen-co': 'iconSwordHuyenCo',
} as const satisfies Record<SwordId, Artwork>;

export const SKILL_ART = {
  'nhat-kiem': 'iconSkillNhatKiem',
  'ngu-kiem': 'iconSkillNguKiem',
  'hoa-lien': 'iconSkillHoaLien',
  'dan-loi': 'iconSkillDanLoi',
  'pha-chuong': 'iconSkillPhaChuong',
  'lien-kiem': 'iconSkillLienKiem',
  'hoi-linh': 'iconSkillHoiLinh',
  'van-kiem': 'iconSkillVanKiem',
} as const satisfies Record<SkillId, Artwork>;

export function tileArtwork(kind: TileKind): ImageSourcePropType {
  switch (kind) {
    case TileKind.Sword: return ART.tileSword;
    case TileKind.Fire: return ART.tileFire;
    case TileKind.Lightning: return ART.tileLightning;
    case TileKind.SpiritOrb: return ART.tileSpiritOrb;
    default: return ART.tileRock;
  }
}
