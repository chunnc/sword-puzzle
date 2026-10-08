import { create } from 'zustand';
import { BoardEngine, newId } from '../game/BoardEngine';
import { getLevel } from '../game/levels';
import { CONTENT, getContentVersion, gradeStars, highestUnlocked, installContent, isCompleted, normalizeProfile, type Loadout, type PlayerOperation, type SkillId } from '../game/domain';
import { clearSave, emptySave, loadSave, persistSave } from '../game/save';
import type { BoardActionAnimation, CellPosition, SaveData, Stars, WinSummary } from '../game/types';
import { checkHealth, createGuest, fetchBootstrap, fetchContent, fetchProfile, GameApiError, isApiConfigured, loginAccount, registerAccount, syncProfile, createAdIntent, checkAdIntent, deviceSession, logoutAccount } from '../services/api';
import { initializeRewardedAds, showRewardedForIntent } from '../services/ads';
import { resetDeviceIdentity } from '../services/device';
import { clearSession, getCurrentSession, getSessionGeneration, loadSession, saveSession, type SessionData } from '../services/session';
export interface BoardActionResult {
  changed: boolean;
  won: boolean;
  lost: boolean;
  stars: Stars;
  levelId: number;
  animation: BoardActionAnimation | null;
  summary?: WinSummary;
}
interface GameState {
  save: SaveData;
  session: SessionData | null;
  initialized: boolean;
  bootstrapLoaded: boolean;
  online: boolean;
  connectionFailed: boolean;
  foreground: boolean;
  recovering: boolean;
  checkingConnection: boolean;
  authRequired: boolean;
  bootError: string;
  adsEnabled: boolean;
  adsLoading: boolean;
  notice: string;
  initialize: () => Promise<string>;
  checkConnection: (retryIdentity?: boolean) => Promise<void>;
  setForeground: (active: boolean) => void;
  startLevel: (id: number, restart?: boolean) => Promise<boolean>;
  swap: (x1: number, y1: number, x2: number, y2: number) => Promise<BoardActionResult>;
  castSkill: (id: SkillId, targets: CellPosition[]) => Promise<BoardActionResult>;
  purchase: (category: 'skill' | 'sword', id: string) => Promise<boolean>;
  equip: (loadout: Loadout) => Promise<boolean>;
  requestExtraMoves: () => Promise<boolean>;
  register: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string, confirmedDiscardGuest?: boolean) => Promise<void>;
  startFreshGuest: () => Promise<void>;
  logout: () => Promise<void>;
  syncProgress: () => Promise<void>;
  setNotice: (notice: string) => void;
}
const CLIENT_VERSION = '1.3.0';
let healthInFlight: Promise<void> | null = null,
  mutationQueue = Promise.resolve(),
  identityLoaded = false,
  lifecycle = 0,
  bindingChanged = false,
  identityRetryRequested = false;
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = mutationQueue.then(work, work);
  mutationQueue = next.then(() => undefined, () => undefined);
  return next;
}
async function persistNext(save: SaveData) {
  await persistSave(save);
  useGameStore.setState({
    save
  });
}
const emptyResult = (levelId = 0): BoardActionResult => ({
  changed: false,
  won: false,
  lost: false,
  stars: 0,
  levelId,
  animation: null
});
export function apiErrorMessage(error: unknown): string {
  const code = error instanceof GameApiError ? error.code : error instanceof Error ? error.message : '';
  const messages: Record<string, string> = {
    API_NOT_CONFIGURED: 'Chưa cấu hình địa chỉ máy chủ.',
    TIMEOUT: 'Kết nối quá thời gian. Vui lòng thử lại.',
    NETWORK_ERROR: 'Không thể kết nối máy chủ.',
    INVALID_CREDENTIALS: 'Email hoặc mật khẩu chưa đúng định dạng.',
    EMAIL_EXISTS: 'Email này đã được đăng ký.',
    INVALID_EMAIL: 'Email không hợp lệ.',
    WEAK_PASSWORD: 'Mật khẩu chưa đủ mạnh.',
    INVALID_PASSWORD: 'Email hoặc mật khẩu không đúng.',
    EMAIL_NOT_FOUND: 'Email hoặc mật khẩu không đúng.',
    AUTH_FAILED: 'Không thể xác thực tài khoản.',
    TOO_MANY_ATTEMPTS: 'Bạn thử quá nhiều lần. Hãy đợi một lúc rồi thử lại.',
    ALREADY_REGISTERED: 'Tài khoản này đã được liên kết email.',
    INVALID_SESSION: 'Không thể khôi phục phiên chơi. Bạn có thể thử lại hoặc chọn hồ sơ khác.',
    DEVICE_KEY_MISSING: 'Không tìm thấy khóa khôi phục hồ sơ trên thiết bị.',
    INVALID_DEVICE_STORAGE: 'Không đọc được khóa thiết bị. Vui lòng thử lại.',
    DEVICE_KEY_INVALID: 'Khóa khôi phục thiết bị không hợp lệ.',
    DEVICE_REVOKED: 'Quyền truy cập của thiết bị đã bị thu hồi.',
    DEVICE_REAUTH_REQUIRED: 'Quyền truy cập đã thay đổi. Hãy đăng nhập lại hoặc chơi khách mới.',
    ACCOUNT_DISABLED: 'Tài khoản đã bị khóa.',
    ACCOUNT_DELETED: 'Tài khoản không còn tồn tại.',
    GUEST_DISCARD_CONFIRMATION_REQUIRED: 'Cần xác nhận trước khi rời hồ sơ khách.',
    DEVICE_BINDING_CHANGED: 'Liên kết thiết bị đã thay đổi. Đang tải lại hồ sơ.',
    IDENTITY_UNCERTAIN: 'Đang kiểm tra lại liên kết tài khoản. Vui lòng đợi.',
    IDENTITY_OPERATION_PENDING: 'Thao tác liên kết trước chưa hoàn tất. Hãy thử lại thao tác đó.',
    INVALID_SESSION_STORAGE: 'Không đọc được phiên đã lưu. Vui lòng thử lại.',
    INSUFFICIENT_COINS: 'Chưa đủ linh thạch.',
    ALREADY_OWNED: 'Bạn đã sở hữu món này.',
    ITEM_LOCKED: 'Hãy vượt thêm màn để mở món này.',
    INVALID_LOADOUT: 'Trang bị chưa hợp lệ hoặc chưa đủ ô kỹ năng.',
    CONTENT_MISMATCH: 'Cấu hình game đã thay đổi. Vui lòng kết nối lại.',
    CONTENT_NOT_CONFIGURED: 'Máy chủ chưa có dữ liệu game.',
    CLIENT_UPDATE_REQUIRED: 'Vui lòng cập nhật phiên bản game.',
    INCOMPLETE_OBJECTIVES: 'Chưa hoàn thành tất cả mục tiêu.',
    PENDING_OPERATION: 'Đang chờ máy chủ xác nhận thao tác trước.',
    CONNECTION_REQUIRED: 'Cần kết nối máy chủ để tiếp tục.',
    PROFILE_OWNER_MISMATCH: 'Vui lòng đăng nhập đúng tài khoản để xác nhận thao tác còn chờ.'
  };
  return messages[code] ?? 'Không thể hoàn thành thao tác. Vui lòng thử lại.';
}
function available(includePending = false) {
  const s = useGameStore.getState();
  return s.initialized && s.bootstrapLoaded && s.online && s.foreground && !s.recovering && !s.authRequired && (includePending || !s.save.pending);
}
async function failure(error: unknown, loginAttempt = false) {
  const s = useGameStore.getState();
  const code = error instanceof Error ? error.message : '';
  const auth = error instanceof GameApiError && (error.status === 401 || ['DEVICE_KEY_MISSING', 'DEVICE_KEY_INVALID', 'DEVICE_REVOKED', 'DEVICE_REAUTH_REQUIRED', ...(!loginAttempt ? ['ACCOUNT_DISABLED', 'ACCOUNT_DELETED'] : [])].includes(error.code)) || ['INVALID_SESSION_STORAGE', 'INVALID_DEVICE_STORAGE'].includes(code);
  useGameStore.setState({
    notice: apiErrorMessage(error),
    ...(auth ? {
      authRequired: true,
      bootError: apiErrorMessage(error)
    } : {})
  });
  if (error instanceof GameApiError && (error.code === 'TIMEOUT' || error.code === 'NETWORK_ERROR')) {
    try {
      await checkHealth();
      useGameStore.setState({ online: true, connectionFailed: false });
    } catch {
      useGameStore.setState({
        online: false,
        connectionFailed: true
      });
    }
  }
  if (error instanceof GameApiError && ['DEVICE_BINDING_CHANGED', 'IDENTITY_UNCERTAIN'].includes(error.code)) { bindingChanged = true; useGameStore.setState({ initialized: false, authRequired: false }); }
  if (error instanceof GameApiError && error.code === 'CONTENT_MISMATCH') useGameStore.setState({
    bootstrapLoaded: false,
    bootError: apiErrorMessage(error)
  });
  if (getCurrentSession()?.uid === s.session?.uid) useGameStore.setState({
    session: getCurrentSession()
  });
}
async function submitPending(): Promise<boolean> {
  const state = useGameStore.getState(),
    pending = state.save.pending;
  if (!pending) return true;
  const session = getCurrentSession();
  if (!session) throw new GameApiError('INVALID_SESSION', 401);
  const epoch = getSessionGeneration();
  const r = await syncProfile(session, [pending.operation], pending.contentVersion);
  if (epoch !== getSessionGeneration()) throw new GameApiError('SESSION_CHANGED');
  const profile = normalizeProfile(r.response.profile);
  const rejected = r.response.rejected.find(x => x.id === pending.operation.id);
  if (!profile || !r.response.acknowledged.includes(pending.operation.id) && !rejected) throw new GameApiError('INVALID_RESPONSE');
  const current = useGameStore.getState().save;
  if (current.ownerId !== session.uid || current.pending?.operation.id !== pending.operation.id) throw new GameApiError('SESSION_CHANGED');
  let lastWin = current.lastWin;
  if (pending.operation.kind === 'win' && !rejected) {
    const reward = r.response.rewards?.find(x => x.id === pending.operation.id);
    if (!reward) throw new GameApiError('INVALID_RESPONSE');
    lastWin = {
      ...reward,
      runId: pending.operation.id,
      levelId: pending.operation.levelId,
      stars: pending.operation.stars,
      totalExp: profile.totalExp
    };
  }
  await persistNext({
    ...current,
    profile,
    pending: null,
    lastWin,
    active: rejected && pending.operation.kind === 'win' ? null : current.active
  });
  useGameStore.setState({
    session: r.session,
    notice: rejected ? apiErrorMessage(new Error(rejected.reason)) : '',
    ...(rejected?.reason === 'CONTENT_MISMATCH' ? {
      bootstrapLoaded: false
    } : {})
  });
  return !rejected;
}
async function command(operation: PlayerOperation, version = CONTENT.version): Promise<boolean> {
  if (!available()) return false;
  useGameStore.setState({
    notice: ''
  });
  await persistNext({
    ...useGameStore.getState().save,
    pending: {
      contentVersion: version,
      operation
    }
  });
  try {
    return await submitPending();
  } catch (error) {
    await failure(error);
    return false;
  }
}
async function record(engine: BoardEngine, previous: SaveData): Promise<BoardActionResult> {
  const snapshot = engine.snapshot(),
    levelId = snapshot.levelId;
  if (engine.won) {
    const stars = gradeStars(engine.moves, engine.levelDefinition.moves);
    const operation: PlayerOperation = {
      id: snapshot.runId,
      kind: 'win',
      levelId,
      stars,
      objectiveProgress: snapshot.objectiveProgress
    };
    useGameStore.setState({
      notice: ''
    });
    await persistNext({
      ...previous,
      active: snapshot,
      lastWin: null,
      pending: {
        contentVersion: snapshot.contentVersion,
        operation
      }
    });
    let accepted = false;
    try {
      accepted = await submitPending();
    } catch (error) {
      await failure(error);
    }
    return {
      changed: true,
      won: true,
      lost: false,
      stars,
      levelId,
      animation: engine.animation,
      summary: accepted ? useGameStore.getState().save.lastWin ?? undefined : undefined
    };
  }
  await persistNext({
    ...previous,
    active: snapshot
  });
  return {
    changed: true,
    won: false,
    lost: engine.lost,
    stars: 0,
    levelId,
    animation: engine.animation
  };
}
async function hydrate() {
  const epoch = lifecycle;
  const bootstrap = await fetchBootstrap();
  const version = (v: string) => v.split('.').reduce((a, x) => a * 1000 + Number(x), 0);
  if (version(bootstrap.minClientVersion) > version(CLIENT_VERSION)) throw new GameApiError('CLIENT_UPDATE_REQUIRED');
  const content = installContent(bootstrap.content);
  if (content.version !== bootstrap.contentVersion || content.levelCount !== bootstrap.levelCount) throw new GameApiError('INVALID_RESPONSE');
  if (epoch !== lifecycle) return;
  useGameStore.setState({
    bootstrapLoaded: true,
    adsEnabled: bootstrap.rewardedAdsEnabled
  });
  if (!identityLoaded) {
    let stored: SessionData | null;
    try { stored = await loadSession(); }
    catch (error) {
      // A damaged token can be recovered only with an existing installation key.
      try { stored = await deviceSession(null, false); await saveSession(stored); }
      catch { throw error; }
    }
    identityLoaded = true;
    useGameStore.setState({ session: stored });
  }
  let session = getCurrentSession();
  if (!session || !session.installationId || useGameStore.getState().authRequired || bindingChanged) {
    session = session ? await deviceSession(session) : await createGuest();
    if (epoch !== lifecycle) return;
    await saveSession(session);
    useGameStore.setState({ session });
    bindingChanged = false;
  }
  const current = useGameStore.getState().save;
  const saved = current.ownerId === session.uid ? current : await loadSave(session.uid, fetchContent);
  if (epoch !== lifecycle) return;
  // Keep pending ownership visible even if authentication fails before profile fetch.
  if (current.ownerId !== session.uid) useGameStore.setState({ save: { ...saved, ownerId: session.uid } });
  const remote = await fetchProfile(session);
  if (epoch !== lifecycle) return;
  const profile = normalizeProfile(remote.profile);
  if (!profile) throw new GameApiError('INVALID_RESPONSE');
  const active = saved.active && saved.active.levelId <= highestUnlocked(profile.levels) ? saved.active : null;
  await persistNext({
    ...saved,
    ownerId: session.uid,
    profile,
    active
  });
  useGameStore.setState({
    session: remote.session
  });
  await submitPending();
  if (epoch !== lifecycle) return;
  useGameStore.setState({
    initialized: true,
    authRequired: false,
    bootError: ''
  });
  if (bootstrap.rewardedAdsEnabled) void initializeRewardedAds().catch(() => undefined);
}
export const useGameStore = create<GameState>((set, get) => ({
  save: emptySave(),
  session: null,
  initialized: false,
  bootstrapLoaded: false,
  online: false,
  connectionFailed: false,
  foreground: true,
  recovering: false,
  checkingConnection: false,
  authRequired: false,
  bootError: '',
  adsEnabled: false,
  adsLoading: false,
  notice: '',
  initialize: async () => {
    await get().checkConnection();
    if (!get().initialized) throw new Error(get().bootError || 'CONNECTION_REQUIRED');
    return '/map';
  },
  checkConnection: async (retryIdentity = true) => {
    if (!get().foreground) return;
    if (retryIdentity) identityRetryRequested = true;
    if (healthInFlight) return healthInFlight;
    const epoch = lifecycle;
    healthInFlight = (async () => {
      set({
        checkingConnection: true
      });
      let healthy = false;
      try {
        if (!isApiConfigured()) throw new GameApiError('API_NOT_CONFIGURED');
        await checkHealth();
        healthy = true;
        if (epoch !== lifecycle || !get().foreground) return;
        const retryRequested = identityRetryRequested;
        identityRetryRequested = false;
        if (get().authRequired && !retryRequested) {
          set({ online: true, connectionFailed: false });
          return;
        }
        const recover = !get().online || !get().initialized || !get().bootstrapLoaded || get().authRequired;
        set({
          online: true,
          connectionFailed: false,
          bootError: recover ? '' : get().bootError,
          recovering: recover
        });
        if (recover) await serialize(hydrate);else if (get().save.pending) await serialize(submitPending);
      } catch (error) {
        if (epoch !== lifecycle) return;
        set({
          online: healthy,
          connectionFailed: !healthy,
          bootError: apiErrorMessage(error)
        });
        await failure(error);
      } finally {
        if (epoch === lifecycle) set({
          checkingConnection: false,
          recovering: false
        });
      }
    })().finally(() => {
      healthInFlight = null;
    });
    return healthInFlight;
  },
  setForeground: active => {
    set({
      foreground: active,
      ...(active ? {
        online: false
      } : {})
    });
  },
  startLevel: (levelId, restart = false) => serialize(async () => {
    if (!available()) return false;
    const current = get().save;
    if (!Number.isInteger(levelId) || levelId < 1 || levelId > highestUnlocked(current.profile.levels)) return false;
    try {
      const active = !restart && current.active?.levelId === levelId ? current.active : new BoardEngine(getLevel(levelId), null, {
        loadout: current.profile.loadout,
        totalExp: current.profile.totalExp
      }).snapshot();
      await persistNext({
        ...current,
        active,
        lastWin: !restart && current.active?.runId === active.runId ? current.lastWin : null
      });
      return true;
    } catch (error) {
      await failure(error);
      return false;
    }
  }),
  swap: (x1, y1, x2, y2) => serialize(async () => {
    const current = get().save;
    if (!available() || !current.active) return emptyResult();
    try {
      const engine = new BoardEngine(current.active.level, current.active);
      if (!engine.trySwap(x1, y1, x2, y2)) return emptyResult(current.active.levelId);
      return await record(engine, current);
    } catch (error) {
      await failure(error);
      return emptyResult(current.active.levelId);
    }
  }),
  castSkill: (id, targets) => serialize(async () => {
    const current = get().save;
    if (!available() || !current.active) return emptyResult();
    try {
      const engine = new BoardEngine(current.active.level, current.active);
      if (!engine.trySkill(id, targets)) return emptyResult(current.active.levelId);
      return await record(engine, current);
    } catch (error) {
      await failure(error);
      return emptyResult(current.active.levelId);
    }
  }),
  purchase: (category, itemId) => serialize(() => command({
    id: newId(),
    kind: 'purchase',
    category,
    itemId
  })),
  equip: loadout => serialize(() => command({
    id: newId(),
    kind: 'equip',
    loadout
  })),
  requestExtraMoves: () => serialize(async () => {
    const snapshot = get().save.active,
      session = getCurrentSession();
    if (!available() || !snapshot || !session || !get().adsEnabled || snapshot.extraMovesUsed || !new BoardEngine(snapshot.level, snapshot).lost) return false;
    set({
      adsLoading: true
    });
    try {
      const epoch = getSessionGeneration(),
        created = await createAdIntent(session, snapshot.levelId);
      set({
        session: created.session
      });
      if (!(await showRewardedForIntent(created.intent.customData))) return false;
      if (epoch !== getSessionGeneration() || !available() || get().save.active?.runId !== snapshot.runId) return false;
      const engine = new BoardEngine(snapshot.level, get().save.active);
      if (!engine.grantExtraMoves()) return false;
      await persistNext({
        ...get().save,
        active: engine.snapshot()
      });
      set({
        notice: '+3 lượt'
      });
      void checkAdIntent(getCurrentSession()!, created.intent.intentId).catch(() => undefined);
      return true;
    } catch (error) {
      await failure(error);
      return false;
    } finally {
      set({
        adsLoading: false
      });
    }
  }),
  register: (email, password) => serialize(async () => {
    if (!available()) throw new Error(apiErrorMessage(new Error('CONNECTION_REQUIRED')));
    try {
      const session = await registerAccount(email, password, getCurrentSession());
      await saveSession(session);
      set({
        session
      });
      const remote = await fetchProfile(session);
      const profile = normalizeProfile(remote.profile);
      if (!profile) throw new GameApiError('INVALID_RESPONSE');
      await persistNext({
        ...get().save,
        profile
      });
      set({
        session: remote.session,
        authRequired: false,
        notice: ''
      });
    } catch (error) {
      await failure(error);
      throw new Error(apiErrorMessage(error));
    }
  }),
  login: (email, password, confirmedDiscardGuest = false) => serialize(async () => {
    if (!get().online || !get().foreground) throw new Error(apiErrorMessage(new Error('CONNECTION_REQUIRED')));
    try {
      // Recovery of the same owner is permitted when a pending request cannot yet authenticate.
      if (get().save.pending && !get().authRequired) await submitPending();
      const previous = get().save;
      const session = await loginAccount(email, password, getCurrentSession(), confirmedDiscardGuest, previous.pending ? previous.ownerId ?? undefined : undefined);
      if (previous.pending && previous.ownerId !== session.uid) throw new Error('PROFILE_OWNER_MISMATCH');
      await saveSession(session);
      set({ session });
      const remote = await fetchProfile(session), profile = normalizeProfile(remote.profile);
      if (!profile) throw new GameApiError('INVALID_RESPONSE');
      const saved = previous.ownerId === session.uid ? previous : emptySave();
      const active = saved.active && saved.active.levelId <= highestUnlocked(profile.levels) ? saved.active : null;
      await persistNext({ ...saved, ownerId: session.uid, profile, active });
      set({ session: remote.session, initialized: true, authRequired: false, bootError: '', notice: '' });
      await submitPending();
    } catch (error) {
      await failure(error, true);
      throw new Error(apiErrorMessage(error));
    }
  }),
  logout: () => serialize(async () => {
    if (!get().online || !get().foreground) throw new Error(apiErrorMessage(new Error('CONNECTION_REQUIRED')));
    try {
      if (get().save.pending) await submitPending();
      const current = getCurrentSession();
      if (!current || current.isGuest) return;
      const session = await logoutAccount(current);
      await saveSession(session);
      identityLoaded = true;
      set({ session, initialized: false, authRequired: false });
      await clearSave();
      set({ save: emptySave() });
      await hydrate();
    } catch (error) { await failure(error); throw new Error(apiErrorMessage(error)); }
  }),
  startFreshGuest: () => serialize(async () => {
    if (!get().online || !get().foreground) throw new Error(apiErrorMessage(new Error('CONNECTION_REQUIRED')));
    try {
      // Explicitly confirmed abandonment; never called by automatic recovery.
      await resetDeviceIdentity();
      await clearSession();
      await clearSave();
      identityLoaded = true;
      set({ session: null, save: emptySave(), initialized: false, authRequired: false });
      await hydrate();
    } catch (error) { await failure(error); throw new Error(apiErrorMessage(error)); }
  }),
  syncProgress: async () => {
    if (get().online && get().foreground) await serialize(async () => {
      try {
        await submitPending();
      } catch (error) {
        await failure(error);
      }
    });
  },
  setNotice: notice => set({
    notice
  })
}));
export function getHighestUnlocked(save: SaveData) {
  return highestUnlocked(save.profile.levels);
}
export function getLevelStars(save: SaveData, id: number): Stars {
  return save.profile.levels.find(x => x.levelId === id)?.stars ?? 0;
}
export function getLevelCompleted(save: SaveData, id: number) {
  return isCompleted(save.profile.levels, id);
}
