import { create } from 'zustand';
import { BoardEngine, newId } from '../game/BoardEngine';
import { BoardActionCancelled, runBoardAction } from '../game/boardAction';
import { CONTENT, registerContent, highestUnlocked, installContent, isCompleted, normalizeProfile, type Loadout, type PlayerOperation, type SkillId, type MapSummary, type RunReport, chapterForLevel, mapStars, mapToLevel, validateMap } from '../game/domain';
import { clearSave, emptySave, loadSave, persistSave } from '../game/save';
import type { BoardActionAnimation, BoardActionPresenter, BoardActionStart, CellPosition, SaveData, Stars, WinSummary } from '../game/types';
import { checkHealth, createGuest, fetchBootstrap, fetchProfile, GameApiError, isApiConfigured, isConnectionError, setConnectionErrorHandler, loginAccount, registerAccount, syncProfile, createAdIntent, checkAdIntent, deviceSession, logoutAccount, fetchChapterMaps, startRun, finishRun } from '../services/api';
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
  chapterId: string;
  chapterMaps: MapSummary[];
  chapterLoading: boolean;
  chapterError: string;
  selectChapter: (id: string, options?: { force?: boolean }) => Promise<void>;
  finishLevel: (outcome: RunReport['outcome']) => Promise<boolean>;
  leaveLevel: () => Promise<boolean>;
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
  checkConnection: () => Promise<void>;
  setForeground: (active: boolean) => void;
  startLevel: (id: number, restart?: boolean) => Promise<boolean>;
  swap: (x1: number, y1: number, x2: number, y2: number, presenter?: BoardActionPresenter) => Promise<BoardActionResult>;
  castSkill: (id: SkillId, targets: CellPosition[], presenter?: BoardActionPresenter) => Promise<BoardActionResult>;
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
const CLIENT_VERSION = '1.8.0';
let startRequestInFlight = false;
let recoveryInFlight: Promise<void> | null = null,
  mutationQueue = Promise.resolve(),
  identityLoaded = false,
  lifecycle = 0,
  bindingChanged = false,
  connectionFailureGeneration = 0;
const reportedConnectionErrors = new WeakSet<GameApiError>();
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
const CHAPTER_CACHE_MS = 5 * 60 * 1000;
interface ChapterCacheEntry {
  maps: MapSummary[];
  fetchedAt: number;
  contentVersion: number;
  catalogRevision?: number;
  stale: boolean;
}
const chapterCache = new Map<string, ChapterCacheEntry>();
const chapterRequests = new Map<string, Promise<void>>();
let chapterCacheScope = { epoch: -1, uid: '', contentVersion: -1 };
let catalogRevision: number | undefined;

// Token refreshes keep the session generation; identity changes retire all requests.
function syncChapterCacheScope() {
  const next = { epoch: getSessionGeneration(), uid: getCurrentSession()?.uid ?? '', contentVersion: CONTENT?.version ?? -1 };
  if (next.epoch === chapterCacheScope.epoch && next.uid === chapterCacheScope.uid && next.contentVersion === chapterCacheScope.contentVersion) return;
  chapterCacheScope = next;
  chapterCache.clear();
  chapterRequests.clear();
  catalogRevision = undefined;
  const state = useGameStore.getState();
  if (state.chapterMaps.length || state.chapterLoading || state.chapterError) {
    useGameStore.setState({ chapterMaps: [], chapterLoading: false, chapterError: '' });
  }
}

function observeCatalogRevision(revision?: number) {
  if (revision === undefined || catalogRevision !== undefined && revision <= catalogRevision) return;
  catalogRevision = revision;
  for (const entry of chapterCache.values()) {
    if (entry.catalogRevision !== revision) entry.stale = true;
  }
}

function sameMapData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key =>
    Object.prototype.hasOwnProperty.call(right, key) && sameMapData(left[key], right[key]));
}

async function loadChapter(chapterId: string, options?: { force?: boolean }) {
  syncChapterCacheScope();
  const session = getCurrentSession();
  if (!session) throw new GameApiError('INVALID_SESSION', 401);
  const chapter = CONTENT.chapters?.find(c => c.id === chapterId);
  if (!chapter || chapter.firstLevelId > highestUnlocked(useGameStore.getState().save.profile.levels)) return;
  const epoch = getSessionGeneration();
  const scope = chapterCacheScope;
  const cached = chapterCache.get(chapterId);
  const state = useGameStore.getState();
  const maps = cached?.maps;
  const inFlight = chapterRequests.get(chapterId);
  const fresh = cached && !cached.stale && Date.now() - cached.fetchedAt < CHAPTER_CACHE_MS;
  if (state.chapterId !== chapterId || maps && state.chapterMaps !== maps || !maps && state.chapterMaps.length
    || state.chapterLoading !== !maps || state.chapterError && (options?.force || inFlight)) {
    useGameStore.setState({ chapterId, chapterMaps: maps ?? [], chapterLoading: !maps, chapterError: '' });
  }
  if (inFlight) return inFlight;
  if (fresh && !options?.force) return;
  if (useGameStore.getState().chapterError) useGameStore.setState({ chapterError: '' });
  const currentRequest = () => epoch === getSessionGeneration() && scope === chapterCacheScope && CONTENT.version === scope.contentVersion;
  // Maps are reads: keep refreshes out of the gameplay mutation queue.
  const request = (async () => {
    try {
      const result = await fetchChapterMaps(session, chapterId);
      if (!currentRequest()) return;
      const payload = result.value;
      if (!Number.isSafeInteger(payload.contentVersion) || payload.contentVersion < 3 || payload.chapterId !== chapterId || !Array.isArray(payload.maps)) throw new GameApiError('INVALID_RESPONSE');
      if (payload.catalogRevision !== undefined && (!Number.isSafeInteger(payload.catalogRevision) || payload.catalogRevision < 0)) throw new GameApiError('INVALID_RESPONSE');
      if (payload.contentVersion !== CONTENT.version) throw new GameApiError('CONTENT_MISMATCH');
      const currentChapter = CONTENT.chapters?.find(c => c.id === chapterId);
      if (!currentChapter || payload.maps.length !== currentChapter.lastLevelId-currentChapter.firstLevelId+1
        || payload.maps.some((m,i) => m.chapterId !== chapterId || m.id !== currentChapter.firstLevelId+i || m.orderInChapter !== i+1 || !['easy','medium','hard','very-hard'].includes(m.difficulty) || !Array.isArray(m.objectives))) throw new GameApiError('INVALID_RESPONSE');
      observeCatalogRevision(payload.catalogRevision);
      const nextMaps = cached && sameMapData(cached.maps, payload.maps) ? cached.maps : payload.maps;
      chapterCache.set(chapterId, { maps: nextMaps, fetchedAt: Date.now(), contentVersion: payload.contentVersion,
        catalogRevision: payload.catalogRevision, stale: payload.catalogRevision !== undefined && catalogRevision !== undefined && payload.catalogRevision < catalogRevision });
      useGameStore.setState({ session: getCurrentSession() ?? result.session });
      const latest = useGameStore.getState();
      if (latest.chapterId === chapterId && (latest.chapterMaps !== nextMaps || latest.chapterLoading || latest.chapterError)) {
        useGameStore.setState({ chapterMaps: nextMaps, chapterLoading: false, chapterError: '' });
      }
    } catch (error) {
      if (!currentRequest()) return;
      if (useGameStore.getState().chapterId === chapterId) {
        useGameStore.setState({ chapterLoading: false, chapterError: apiErrorMessage(error) });
      }
      await failure(error);
      throw error;
    }
  })();
  chapterRequests.set(chapterId, request);
  try { await request; }
  finally { if (chapterRequests.get(chapterId) === request) chapterRequests.delete(chapterId); }
}
async function recoverRunStart() {
  const state = useGameStore.getState(), pending = state.save.pendingStart, session = getCurrentSession();
  if (!pending || !session) return;
  const epoch = getSessionGeneration();
  let response;
  try { response = await startRun(session, pending); }
  catch (error) {
    if (epoch !== getSessionGeneration() || useGameStore.getState().save.ownerId !== session.uid) throw new GameApiError('SESSION_CHANGED');
    if (error instanceof GameApiError && ['RUN_CONFLICT','RUN_FINISHED','LEVEL_LOCKED','INVALID_RUN','MAP_NOT_FOUND'].includes(error.code)) {
      await persistNext({ ...useGameStore.getState().save, pendingStart: undefined });
    }
    throw error;
  }
  if (epoch !== getSessionGeneration() || useGameStore.getState().save.ownerId !== session.uid) throw new GameApiError('SESSION_CHANGED');
  const run = response.value.run, content = registerContent(response.value.config);
  const map = validateMap(run.map, content);
  if (run.configVersion !== content.version || run.mapVersion !== map.mapVersion || run.runId !== pending.runId || map.id !== pending.levelId || !Number.isSafeInteger(run.seed) || run.seed <= 0 || run.seed > 0xffffffff
    || !Number.isSafeInteger(run.totalExp) || run.totalExp < 0 || !Number.isSafeInteger(run.attempt) || run.attempt < 1
    || !run.loadout || !Array.isArray(run.loadout.skills) || run.loadout.skills.length > 2
    || new Set(run.loadout.skills).size !== run.loadout.skills.length || !run.loadout.skills.every(id => content.skills.some(s => s.id === id && s.kind !== 'passive')) || run.loadout.sword !== null && !content.swords.some(s => s.id === run.loadout.sword)
    || !Number.isFinite(run.assistReduction) || run.assistReduction < 0 || run.assistReduction > .3) throw new GameApiError('INVALID_RESPONSE');
  if (run.passiveSkills !== undefined && (!Array.isArray(run.passiveSkills) || new Set(run.passiveSkills).size !== run.passiveSkills.length || !run.passiveSkills.every(id => content.skills.some(s => s.id === id && s.kind === 'passive')))) throw new GameApiError('INVALID_RESPONSE');
  const active = new BoardEngine(mapToLevel(map, run.seed, run.assistReduction, content), null, { loadout: run.loadout, totalExp: run.totalExp, passiveSkills: run.passiveSkills }).snapshot();
  active.runId = run.runId;
  await persistNext({ ...useGameStore.getState().save, active, pendingStart: undefined, retiredRunId: undefined, lastWin: null });
  useGameStore.setState({ session: response.session });
}
async function submitRunFinish(): Promise<boolean> {
  const state = useGameStore.getState(), pending = state.save.pendingFinish, session = getCurrentSession();
  if (!pending) return true;
  if (!session) throw new GameApiError('INVALID_SESSION', 401);
  const epoch = getSessionGeneration();
  let response;
  try { response = await finishRun(session, pending.runId, pending.report); }
  catch (error) {
    if (epoch !== getSessionGeneration() || useGameStore.getState().save.ownerId !== session.uid || useGameStore.getState().save.pendingFinish?.runId !== pending.runId) throw new GameApiError('SESSION_CHANGED');
    if (error instanceof GameApiError && ['RUN_CONFLICT','RUN_NOT_FOUND'].includes(error.code)) {
      await persistNext({ ...useGameStore.getState().save, pendingFinish: undefined, active: null, retiredRunId: undefined, lastWin: null });
      useGameStore.setState({ notice: apiErrorMessage(error) });
      return false;
    }
    throw error;
  }
  if (epoch !== getSessionGeneration() || useGameStore.getState().save.ownerId !== session.uid || useGameStore.getState().save.pendingFinish?.runId !== pending.runId) throw new GameApiError('SESSION_CHANGED');
  const result = response.value;
  if (result.profileConfig) installContent(result.profileConfig);
  const profile = normalizeProfile(result.profile);
  if (!profile || pending.report.outcome === 'won' && (!result.reward || result.reward.id !== pending.runId || ![1,2,3].includes(result.stars))) throw new GameApiError('INVALID_RESPONSE');
  const retired = useGameStore.getState().save.retiredRunId === pending.runId;
  await persistNext({ ...useGameStore.getState().save, profile, pendingFinish: undefined, retiredRunId: undefined,
    ...(pending.report.outcome !== 'won' || retired ? { active: null, lastWin: null } : {}),
    ...(pending.report.outcome === 'won' && !retired ? { lastWin: { ...result.reward!, runId: pending.runId, levelId: pending.levelId, stars: result.stars, totalExp: profile.totalExp } } : {}) });
  useGameStore.setState({ session: response.session });
  return true;
}
async function finishActive(outcome: RunReport['outcome']): Promise<boolean> {
  const state = useGameStore.getState(), snapshot = state.save.active;
  if (state.save.pendingFinish) return submitRunFinish();
  if (!snapshot?.level.mapDefinition || state.save.lastWin?.runId === snapshot.runId) return true;
  const engine = new BoardEngine(snapshot.level, snapshot);
  await persistNext({ ...state.save, pendingFinish: { runId: snapshot.runId, levelId: snapshot.levelId, contentVersion: snapshot.contentVersion,
    report: { outcome, movesUsed: engine.movesUsed, objectiveProgress: snapshot.objectiveProgress, extraMovesUsed: snapshot.extraMovesUsed } } });
  return submitRunFinish();
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
    ITEM_NOT_FOR_SALE: 'Vật phẩm này chỉ nhận qua thành tích hoặc đã ngừng phát hành.',
    ITEM_LOCKED: 'Hãy vượt thêm màn để mở món này.',
    INVALID_LOADOUT: 'Trang bị chưa hợp lệ hoặc chưa đủ ô kỹ năng.',
    CONTENT_MISMATCH: 'Cấu hình game đã thay đổi. Vui lòng kết nối lại.',
    CONTENT_NOT_CONFIGURED: 'Máy chủ chưa có dữ liệu game.',
    CLIENT_UPDATE_REQUIRED: 'Vui lòng cập nhật phiên bản game.',
    INCOMPLETE_OBJECTIVES: 'Chưa hoàn thành tất cả mục tiêu.',
    PENDING_OPERATION: 'Đang chờ máy chủ xác nhận thao tác trước.',
    CONNECTION_REQUIRED: 'Cần kết nối máy chủ để tiếp tục.',
    PROFILE_OWNER_MISMATCH: 'Vui lòng đăng nhập đúng tài khoản để xác nhận thao tác còn chờ.',
    RUN_CONFLICT: 'Ván chơi này đã kết thúc hoặc được thay thế. Hãy bắt đầu ván mới.',
    RUN_NOT_FOUND: 'Không tìm thấy phiên chơi. Hãy bắt đầu ván mới.',
    RUN_FINISHED: 'Ván chơi này đã kết thúc. Hãy bắt đầu ván mới.'
  };
  return messages[code] ?? 'Không thể hoàn thành thao tác. Vui lòng thử lại.';
}
function available(includePending = false) {
  const s = useGameStore.getState();
  return s.initialized && s.bootstrapLoaded && s.online && s.foreground && !s.recovering && !s.authRequired && (includePending || !s.save.pending && !s.save.pendingFinish && !s.save.pendingStart);
}
function reportConnectionFailure(error: GameApiError) {
  if (!reportedConnectionErrors.has(error)) {
    reportedConnectionErrors.add(error);
    connectionFailureGeneration++;
  }
  useGameStore.setState({
    online: false,
    connectionFailed: true,
    notice: apiErrorMessage(error),
    ...(!useGameStore.getState().initialized ? { bootError: apiErrorMessage(error) } : {})
  });
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
  if (isConnectionError(error)) reportConnectionFailure(error);
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
  if (useGameStore.getState().save.pendingFinish && !await submitRunFinish()) return false;
  const state = useGameStore.getState(),
    pending = state.save.pending;
  if (!pending) { if (state.save.pendingStart) await recoverRunStart(); return true; }
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
  if (!rejected && useGameStore.getState().save.pendingStart) await recoverRunStart();
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
    const stars = mapStars(engine.levelDefinition.mapDefinition!, engine.movesUsed);
    await persistNext({ ...previous, active: snapshot, lastWin: null, pendingFinish: {
      runId: snapshot.runId, levelId, contentVersion: snapshot.contentVersion,
      report: { outcome: 'won', movesUsed: engine.movesUsed, objectiveProgress: snapshot.objectiveProgress, extraMovesUsed: snapshot.extraMovesUsed }
    } });
    let accepted = false;
    try { accepted = await submitRunFinish(); } catch (error) { await failure(error); }
    return { changed: true, won: true, lost: false, stars, levelId, animation: engine.animation,
      summary: accepted ? useGameStore.getState().save.lastWin ?? undefined : undefined };
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
function presentAndRecord(engine: BoardEngine, start: BoardActionStart, previous: SaveData, presenter: BoardActionPresenter) {
  const epoch = getSessionGeneration();
  return runBoardAction(engine, start, presenter, () => {
    const state = useGameStore.getState();
    if (presenter.signal.aborted || !state.foreground || epoch !== getSessionGeneration() ||
        state.save.ownerId !== previous.ownerId || state.save.active?.runId !== previous.active?.runId)
      throw new BoardActionCancelled();
    return record(engine, previous);
  });
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
  const loaded = current.ownerId === session.uid ? current : await loadSave(session.uid);
  const saved = loaded.active && loaded.active.contentVersion < 8
    ? { ...loaded, active: null, lastWin: null, pendingStart: undefined, pendingFinish: undefined, retiredRunId: undefined }
    : loaded;
  if (epoch !== lifecycle) return;
  // Keep pending ownership visible even if authentication fails before profile fetch.
  if (current.ownerId !== session.uid) useGameStore.setState({ save: { ...saved, ownerId: session.uid } });
  const remote = await fetchProfile(session);
  if (epoch !== lifecycle) return;
  const profile = normalizeProfile(remote.profile);
  if (!profile) throw new GameApiError('INVALID_RESPONSE');
  const active = saved.active;
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
  if (useGameStore.getState().save.pendingStart) await recoverRunStart();
  const restored = useGameStore.getState().save.active;
  syncChapterCacheScope();
  observeCatalogRevision(bootstrap.catalogRevision);
  await loadChapter(chapterForLevel(restored?.levelId ?? highestUnlocked(useGameStore.getState().save.profile.levels)).id);
  useGameStore.setState({
    initialized: true,
    authRequired: false,
    bootError: ''
  });
  if (bootstrap.rewardedAdsEnabled) void initializeRewardedAds().catch(() => undefined);
}
export const useGameStore = create<GameState>((set, get) => ({
  save: emptySave(),
  chapterId: '', chapterMaps: [], chapterLoading: false, chapterError: '',
  selectChapter: async (id, options) => { if (available()) await loadChapter(id, options); },
  finishLevel: outcome => serialize(async () => {
    if (!available()) return false;
    try { return await finishActive(outcome); } catch (error) { await failure(error); return false; }
  }),
  leaveLevel: () => serialize(async () => {
    const save = get().save, active = save.active;
    if (!active) return true;
    if (!active.level.mapDefinition || save.lastWin?.runId === active.runId) {
      await persistNext({ ...save, active: null, lastWin: null, retiredRunId: undefined });
      return true;
    }
    const engine = new BoardEngine(active.level, active);
    const report: RunReport = save.pendingFinish?.report ?? { outcome: engine.won ? 'won' : engine.lost ? 'lost' : 'abandoned',
      movesUsed: engine.movesUsed, objectiveProgress: active.objectiveProgress, extraMovesUsed: active.extraMovesUsed };
    try {
      await persistNext({ ...save, retiredRunId: active.runId, pendingFinish: { runId: active.runId, levelId: active.levelId, contentVersion: active.contentVersion, report } });
    } catch (error) { await failure(error); return false; }
    try { await submitRunFinish(); } catch (error) { await failure(error); }
    return true; // Durable retirement survives a lost acknowledgement.
  }),
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
    if (!get().initialized || !get().online) throw new Error(get().bootError || 'CONNECTION_REQUIRED');
    return '/map';
  },
  checkConnection: async () => {
    if (!get().foreground) return;
    if (recoveryInFlight) return recoveryInFlight;
    const epoch = lifecycle;
    const failureGeneration = connectionFailureGeneration;
    const wasConnectionFailed = get().connectionFailed;
    recoveryInFlight = (async () => {
      set({
        checkingConnection: true,
        recovering: true
      });
      let healthy = false;
      try {
        if (!isApiConfigured()) throw new GameApiError('API_NOT_CONFIGURED');
        await checkHealth();
        healthy = true;
        if (epoch !== lifecycle || !get().foreground) return;
        const recover = !get().online || !get().initialized || !get().bootstrapLoaded || get().authRequired || bindingChanged;
        if (recover) await serialize(hydrate);else if (get().save.pending || get().save.pendingFinish || get().save.pendingStart) await serialize(submitPending);
        if (epoch === lifecycle && get().foreground && failureGeneration === connectionFailureGeneration) {
          set({ online: true, connectionFailed: false, bootError: '' });
        }
      } catch (error) {
        if (epoch !== lifecycle) return;
        await failure(error);
        set({
          ...(!isConnectionError(error) && failureGeneration === connectionFailureGeneration ? {
            online: healthy && (!wasConnectionFailed || get().authRequired),
            connectionFailed: !healthy || wasConnectionFailed && !get().authRequired
          } : {}),
          bootError: apiErrorMessage(error)
        });
      } finally {
        if (epoch === lifecycle) set({
          checkingConnection: false,
          recovering: false
        });
      }
    })().finally(() => {
      recoveryInFlight = null;
    });
    return recoveryInFlight;
  },
  setForeground: active => set({ foreground: active }),
  startLevel: levelId => {
    if (startRequestInFlight) return Promise.resolve(false);
    startRequestInFlight = true;
    return serialize(async () => {
      if (!available(true)) return false;
      try {
        const uncertainStart = get().save.pendingStart;
        if (!await submitPending()) return false;
        if (uncertainStart) return uncertainStart.levelId === levelId;
        const current = get().save;
        if (!Number.isInteger(levelId) || levelId < 1 || levelId > CONTENT.levelCount) return false;
        const previousEngine = current.active ? new BoardEngine(current.active.level, current.active) : null;
        if (previousEngine?.lost && !await finishActive('lost')) return false;
        await persistNext({ ...get().save, pendingStart: { runId: newId(), levelId,
          previousRunId: current.active?.level.mapDefinition ? current.active.runId : null } });
        await recoverRunStart();
        const ch = get().save.active!.level.mapDefinition!.chapterId;
        if (get().chapterId !== ch) set({ chapterId: ch, chapterMaps: chapterCache.get(ch)?.maps ?? [], chapterLoading: false, chapterError: '' });
        return true;
      } catch (error) { await failure(error); return false; }
    }).finally(() => { startRequestInFlight = false; });
  },
  swap: (x1, y1, x2, y2, presenter) => serialize(async () => {
    const current = get().save;
    if (!available() || !current.active) return emptyResult();
    try {
      if (presenter?.signal.aborted) throw new BoardActionCancelled();
      const engine = new BoardEngine(current.active.level, current.active);
      if (presenter) {
        const start = engine.beginSwap(x1, y1, x2, y2);
        if (!start) return emptyResult(current.active.levelId);
        return await presentAndRecord(engine, start, current, presenter);
      }
      if (!engine.trySwap(x1, y1, x2, y2)) return emptyResult(current.active.levelId);
      return await record(engine, current);
    } catch (error) {
      if (error instanceof BoardActionCancelled) throw error;
      await failure(error);
      if (presenter) throw error;
      return emptyResult(current.active.levelId);
    }
  }),
  castSkill: (id, targets, presenter) => serialize(async () => {
    const current = get().save;
    if (!available() || !current.active) return emptyResult();
    try {
      if (presenter?.signal.aborted) throw new BoardActionCancelled();
      const engine = new BoardEngine(current.active.level, current.active);
      if (presenter) {
        const start = engine.beginSkill(id, targets);
        if (!start) return emptyResult(current.active.levelId);
        return await presentAndRecord(engine, start, current, presenter);
      }
      if (!engine.trySkill(id, targets)) return emptyResult(current.active.levelId);
      return await record(engine, current);
    } catch (error) {
      if (error instanceof BoardActionCancelled) throw error;
      await failure(error);
      if (presenter) throw error;
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
      if ((get().save.pending || get().save.pendingStart || get().save.pendingFinish) && !get().authRequired) await submitPending();
      const previous = get().save;
      const hasPending = previous.pending || previous.pendingStart || previous.pendingFinish;
      const session = await loginAccount(email, password, getCurrentSession(), confirmedDiscardGuest, hasPending ? previous.ownerId ?? undefined : undefined);
      if (hasPending && previous.ownerId !== session.uid) throw new Error('PROFILE_OWNER_MISMATCH');
      await saveSession(session);
      set({ session });
      const remote = await fetchProfile(session), profile = normalizeProfile(remote.profile);
      if (!profile) throw new GameApiError('INVALID_RESPONSE');
      const saved = previous.ownerId === session.uid ? previous : emptySave();
      const active = saved.active;
      await persistNext({ ...saved, ownerId: session.uid, profile, active });
      await loadChapter(chapterForLevel(active?.levelId ?? highestUnlocked(profile.levels)).id);
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
      if (get().save.pending || get().save.pendingStart || get().save.pendingFinish) await submitPending();
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
useGameStore.subscribe(syncChapterCacheScope);
setConnectionErrorHandler(reportConnectionFailure);
export function getHighestUnlocked(save: SaveData) {
  return highestUnlocked(save.profile.levels);
}
export function getLevelStars(save: SaveData, id: number): Stars {
  return save.profile.levels.find(x => x.levelId === id)?.stars ?? 0;
}
export function getLevelCompleted(save: SaveData, id: number) {
  return isCompleted(save.profile.levels, id);
}
