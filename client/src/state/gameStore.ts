import { create } from 'zustand';
import { BoardEngine } from '../game/BoardEngine';
import { getLevel, LEVEL_COUNT } from '../game/levels';
import { completedCount, emptySave, loadSave, mergeStars, persistSave, starsForLevel } from '../game/save';
import { BoardSnapshot, LevelStar, SaveData } from '../game/types';
import {
  checkAdIntent,
  createAdIntent,
  createGuest,
  fetchBootstrap,
  GameApiError,
  isApiConfigured,
  loginAccount,
  registerAccount,
  syncProgress as sendProgress,
} from '../services/api';
import { initializeRewardedAds, showRewardedForIntent } from '../services/ads';
import { clearSession, loadSession, saveSession, SessionData } from '../services/session';

export interface BoardActionResult {
  changed: boolean;
  won: boolean;
  lost: boolean;
  stars: number;
  levelId: number;
}

interface GameState {
  save: SaveData;
  session: SessionData | null;
  initialized: boolean;
  bootstrapLoaded: boolean;
  online: boolean;
  adsEnabled: boolean;
  adsLoading: boolean;
  notice: string;
  initialize: () => Promise<string>;
  startLevel: (levelId: number, restart?: boolean) => Promise<boolean>;
  swap: (x1: number, y1: number, x2: number, y2: number) => Promise<BoardActionResult>;
  useSwordQi: (row: number) => Promise<BoardActionResult>;
  requestExtraMoves: () => Promise<boolean>;
  register: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  syncProgress: () => Promise<void>;
  setNotice: (notice: string) => void;
}

let syncInFlight: Promise<void> | null = null;

function highestUnlocked(levels: LevelStar[]): number {
  return Math.min(LEVEL_COUNT, completedCount(levels) + 1);
}

function progressLevels(save: SaveData): LevelStar[] {
  return save.levels.map(({ levelId, stars }) => ({ levelId, stars }));
}

async function saveCurrentSession(session: SessionData | null): Promise<void> {
  if (session) await saveSession(session);
  else await clearSession();
}

async function persistNextSave(next: SaveData): Promise<void> {
  useGameStore.setState({ save: next });
  try {
    await persistSave(next);
  } catch {
    useGameStore.setState({ notice: 'Không thể lưu tiến trình trên thiết bị.' });
  }
}

function emptyResult(levelId = 0): BoardActionResult {
  return { changed: false, won: false, lost: false, stars: 0, levelId };
}

export function apiErrorMessage(error: unknown): string {
  if (!(error instanceof GameApiError)) return 'Có lỗi xảy ra. Vui lòng thử lại.';
  const messages: Record<string, string> = {
    OFFLINE: 'Đang ngoại tuyến. Bạn vẫn có thể chơi và lưu trên thiết bị.',
    TIMEOUT: 'Kết nối quá thời gian. Vui lòng thử lại.',
    NETWORK_ERROR: 'Không thể kết nối máy chủ. Vui lòng thử lại.',
    INVALID_CREDENTIALS: 'Email hoặc mật khẩu chưa đúng định dạng.',
    EMAIL_EXISTS: 'Email này đã được đăng ký.',
    INVALID_EMAIL: 'Email không hợp lệ.',
    WEAK_PASSWORD: 'Mật khẩu chưa đủ mạnh.',
    INVALID_PASSWORD: 'Email hoặc mật khẩu không đúng.',
    EMAIL_NOT_FOUND: 'Email hoặc mật khẩu không đúng.',
    AUTH_FAILED: 'Không thể xác thực tài khoản.',
    TOO_MANY_ATTEMPTS: 'Bạn thử quá nhiều lần. Hãy đợi một lúc rồi thử lại.',
    ALREADY_REGISTERED: 'Tài khoản này đã được liên kết email.',
    INVALID_SESSION: 'Phiên đăng nhập hết hạn. Đăng nhập lại để đồng bộ.',
  };
  return messages[error.code] ?? `Không thể hoàn thành thao tác (${error.code}).`;
}

async function recordBoardResult(engine: BoardEngine, previous: SaveData): Promise<BoardActionResult> {
  const levelId = engine.levelDefinition.id;
  if (engine.won) {
    const stars = engine.moves >= 6 ? 3 : engine.moves >= 2 ? 2 : 1;
    const oldStars = starsForLevel(previous.levels, levelId);
    const levels = oldStars >= stars
      ? previous.levels
      : oldStars === 0
        ? [...previous.levels, { levelId, stars }]
        : previous.levels.map((level) => level.levelId === levelId ? { ...level, stars } : level);
    await persistNextSave({ ...previous, levels, active: null });
    void useGameStore.getState().syncProgress();
    return { changed: true, won: true, lost: false, stars: Math.max(stars, oldStars), levelId };
  }
  await persistNextSave({ ...previous, active: engine.snapshot() });
  return { changed: true, won: false, lost: engine.lost, stars: 0, levelId };
}

export const useGameStore = create<GameState>((set, get) => ({
  save: emptySave(),
  session: null,
  initialized: false,
  bootstrapLoaded: false,
  online: false,
  adsEnabled: false,
  adsLoading: false,
  notice: '',

  initialize: async () => {
    const [save, session] = await Promise.all([loadSave(), loadSession()]);
    set({ save, session });
    set({ initialized: true });
    const active = get().save.active;
    if (isApiConfigured()) void get().syncProgress();
    return active ? `/game/${active.levelId}` : '/map';
  },

  startLevel: async (levelId, restart = false) => {
    if (!Number.isInteger(levelId) || levelId < 1 || levelId > highestUnlocked(get().save.levels)) return false;
    const current = get().save;
    const snapshot = !restart && current.active?.levelId === levelId
      ? current.active
      : new BoardEngine(getLevel(levelId)).snapshot();
    await persistNextSave({ ...current, active: snapshot });
    return true;
  },

  swap: async (x1, y1, x2, y2) => {
    const current = get().save;
    if (!current.active) return emptyResult();
    const engine = new BoardEngine(getLevel(current.active.levelId), current.active);
    if (!engine.trySwap(x1, y1, x2, y2)) return emptyResult(current.active.levelId);
    return recordBoardResult(engine, current);
  },

  useSwordQi: async (row) => {
    const current = get().save;
    if (!current.active) return emptyResult();
    const engine = new BoardEngine(getLevel(current.active.levelId), current.active);
    if (!engine.useSwordQi(row)) return emptyResult(current.active.levelId);
    return recordBoardResult(engine, current);
  },

  requestExtraMoves: async () => {
    const { save, session, online, adsEnabled } = get();
    const snapshot = save.active;
    if (!snapshot || !session || !online || !adsEnabled || snapshot.extraMovesUsed) return false;
    set({ adsLoading: true, notice: 'Đang chuẩn bị quảng cáo…' });
    try {
      const created = await createAdIntent(session, snapshot.levelId);
      await saveCurrentSession(created.session);
      set({ session: created.session });
      set({ notice: 'Đang tải quảng cáo…' });
      const rewarded = await showRewardedForIntent(created.intent.customData);
      if (!rewarded) {
        set({ notice: 'Chưa nhận được phần thưởng.' });
        return false;
      }
      const latest = get().save;
      if (!latest.active || latest.active.levelId !== snapshot.levelId) return false;
      const engine = new BoardEngine(getLevel(latest.active.levelId), latest.active);
      if (!engine.grantExtraMoves()) return false;
      await persistNextSave({ ...latest, active: engine.snapshot() });
      set({ notice: '+3 lượt' });
      void checkAdIntent(get().session ?? created.session, created.intent.intentId).catch(() => undefined);
      return true;
    } catch (error) {
      set({ notice: apiErrorMessage(error) });
      return false;
    } finally {
      set({ adsLoading: false });
    }
  },

  register: async (email, password) => {
    const current = get().session;
    try {
      const session = await registerAccount(email, password, current);
      await saveCurrentSession(session);
      set({ session, notice: '' });
      await get().syncProgress();
    } catch (error) {
      throw new Error(apiErrorMessage(error));
    }
  },

  login: async (email, password) => {
    const current = get().session;
    try {
      const session = await loginAccount(email, password, current);
      await saveCurrentSession(session);
      set({ session, notice: '' });
      await get().syncProgress();
    } catch (error) {
      throw new Error(apiErrorMessage(error));
    }
  },

  syncProgress: async () => {
    if (!isApiConfigured()) return;
    if (syncInFlight) return syncInFlight;
    syncInFlight = (async () => {
      try {
        if (!get().bootstrapLoaded) {
          const bootstrap = await fetchBootstrap();
          set({ bootstrapLoaded: true, online: true, adsEnabled: bootstrap.rewardedAdsEnabled });
          if (bootstrap.rewardedAdsEnabled) void initializeRewardedAds().catch(() => undefined);
        }
        let session = get().session;
        if (!session) {
          session = await createGuest();
          await saveCurrentSession(session);
          set({ session });
        }
        const result = await sendProgress(session, progressLevels(get().save));
        session = result.session;
        await saveCurrentSession(session);
        const current = get().save;
        const merged = mergeStars(current.levels, result.progress.levels);
        const next = { ...current, levels: merged };
        if (JSON.stringify(merged) !== JSON.stringify(current.levels)) await persistNextSave(next);
        set({ session, online: true, notice: '' });
      } catch (error) {
        set({ online: false });
        if (error instanceof GameApiError && error.code === 'INVALID_SESSION') {
          await clearSession().catch(() => undefined);
          set({ session: null });
        }
      }
    })().finally(() => { syncInFlight = null; });
    return syncInFlight;
  },

  setNotice: (notice) => set({ notice }),
}));

export function getHighestUnlocked(save: SaveData): number {
  return highestUnlocked(save.levels);
}

export function getLevelStars(save: SaveData, levelId: number): number {
  return starsForLevel(save.levels, levelId);
}

export function snapshotOfActive(save: SaveData): BoardSnapshot | null {
  return save.active;
}
