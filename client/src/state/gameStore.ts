import { create } from 'zustand';
import { BoardEngine, newId } from '../game/BoardEngine';
import { getLevel } from '../game/levels';
import { applyOperation, gradeStars, highestUnlocked, isCompleted, normalizeProfile, realmForExp, type Loadout, type PlayerOperation, type SkillId } from '../game/domain';
import { archiveProfile, emptySave, loadArchivedProfile, loadSave, persistSave, projectProfile } from '../game/save';
import type { BoardActionAnimation, CellPosition, SaveData, Stars, WinSummary } from '../game/types';
import { checkAdIntent, createAdIntent, createGuest, fetchBootstrap, fetchProfile, GameApiError, isApiConfigured, loginAccount, registerAccount, syncProfile } from '../services/api';
import { initializeRewardedAds, showRewardedForIntent } from '../services/ads';
import { clearSession, loadSession, saveSession, type SessionData } from '../services/session';
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
    adsEnabled: boolean;
    adsLoading: boolean;
    notice: string;
    initialize: () => Promise<string>;
    startLevel: (levelId: number, restart?: boolean) => Promise<boolean>;
    swap: (x1: number, y1: number, x2: number, y2: number) => Promise<BoardActionResult>;
    castSkill: (id: SkillId, targets: CellPosition[]) => Promise<BoardActionResult>;
    purchase: (category: 'skill' | 'sword', itemId: string) => Promise<boolean>;
    equip: (loadout: Loadout) => Promise<boolean>;
    requestExtraMoves: () => Promise<boolean>;
    register: (email: string, password: string) => Promise<void>;
    login: (email: string, password: string) => Promise<void>;
    syncProgress: () => Promise<void>;
    setNotice: (notice: string) => void;
}
let syncInFlight: Promise<void> | null = null;
let mutationQueue = Promise.resolve();
function serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = mutationQueue.then(work, work);
    mutationQueue = next.then(() => undefined, () => undefined);
    return next;
}
async function persistNext(save: SaveData): Promise<void> {
    // Commit to disk before exposing a changed board or purchase.
    await persistSave(save);
    useGameStore.setState({ save });
}
function emptyResult(levelId = 0): BoardActionResult { return { changed: false, won: false, lost: false, stars: 0, levelId, animation: null }; }
export function apiErrorMessage(error: unknown): string {
    const code = error instanceof GameApiError ? error.code : error instanceof Error ? error.message : '';
    const messages: Record<string, string> = { OFFLINE: 'Đang ngoại tuyến. Tiến trình sẽ được đồng bộ khi có mạng.', TIMEOUT: 'Kết nối quá thời gian. Vui lòng thử lại.', NETWORK_ERROR: 'Không thể kết nối máy chủ.', INVALID_CREDENTIALS: 'Email hoặc mật khẩu chưa đúng định dạng.', EMAIL_EXISTS: 'Email này đã được đăng ký.', INVALID_EMAIL: 'Email không hợp lệ.', WEAK_PASSWORD: 'Mật khẩu chưa đủ mạnh.', INVALID_PASSWORD: 'Email hoặc mật khẩu không đúng.', EMAIL_NOT_FOUND: 'Email hoặc mật khẩu không đúng.', AUTH_FAILED: 'Không thể xác thực tài khoản.', TOO_MANY_ATTEMPTS: 'Bạn thử quá nhiều lần. Hãy đợi một lúc rồi thử lại.', ALREADY_REGISTERED: 'Tài khoản này đã được liên kết email.', INVALID_SESSION: 'Phiên đăng nhập hết hạn.', INSUFFICIENT_COINS: 'Chưa đủ linh thạch.', ALREADY_OWNED: 'Bạn đã sở hữu món này.', ITEM_LOCKED: 'Hãy vượt thêm màn để mở món này.', INVALID_LOADOUT: 'Trang bị chưa hợp lệ hoặc chưa đủ ô kỹ năng.', CONTENT_MISMATCH: 'Máy chủ chưa hỗ trợ phiên bản nội dung này.', SYNC_REQUIRED: 'Cần đồng bộ tiến trình khách trước khi đăng nhập.' };
    return messages[code] ?? 'Không thể hoàn thành thao tác. Vui lòng thử lại.';
}
async function enqueue(op: PlayerOperation): Promise<boolean> {
    const current = useGameStore.getState().save;
    const applied = applyOperation(current.profile, op);
    if (applied.error) {
        useGameStore.setState({ notice: apiErrorMessage(new Error(applied.error)) });
        return false;
    }
    await persistNext({ ...current, profile: applied.profile, operations: [...current.operations, op] });
    void useGameStore.getState().syncProgress();
    return true;
}
async function record(engine: BoardEngine, previous: SaveData): Promise<BoardActionResult> {
    const levelId = engine.levelDefinition.id;
    if (engine.won) {
        const stars = gradeStars(engine.moves, engine.levelDefinition.moves);
        const op: PlayerOperation = { id: engine.snapshot().runId, kind: 'win', levelId, stars };
        const applied = applyOperation(previous.profile, op);
        if (applied.error)
            throw new Error(applied.error);
        const profile = applied.profile;
        const summary: WinSummary = { runId: op.id, levelId, stars, bestStars: profile.levels.find(x => x.levelId === levelId)!.stars, expGained: profile.totalExp - previous.profile.totalExp, totalExp: profile.totalExp, coinsGained: profile.coins - previous.profile.coins, realmBefore: realmForExp(previous.profile.totalExp).index, realmAfter: realmForExp(profile.totalExp).index };
        await persistNext({ ...previous, profile, operations: [...previous.operations, op], active: null, lastWin: summary });
        void useGameStore.getState().syncProgress();
        return { changed: true, won: true, lost: false, stars, levelId, animation: engine.animation, summary };
    }
    await persistNext({ ...previous, active: engine.snapshot() });
    return { changed: true, won: false, lost: engine.lost, stars: 0, levelId, animation: engine.animation };
}
export const useGameStore = create<GameState>((set, get) => ({
    save: emptySave(), session: null, initialized: false, bootstrapLoaded: false, online: false, adsEnabled: false, adsLoading: false, notice: '',
    initialize: async () => {
        const [save, session] = await Promise.all([loadSave(), loadSession()]);
        set({ save, session, initialized: true });
        if (isApiConfigured())
            void get().syncProgress();
        return save.active ? `/game/${save.active.levelId}` : '/map';
    },
    startLevel: (levelId, restart = false) => serialize(async () => {
        const current = get().save;
        if (!Number.isInteger(levelId) || levelId < 1 || levelId > highestUnlocked(current.profile.levels))
            return false;
        const active = !restart && current.active?.levelId === levelId ? current.active : new BoardEngine(getLevel(levelId), null, { loadout: current.profile.loadout, totalExp: current.profile.totalExp }).snapshot();
        await persistNext({ ...current, active });
        return true;
    }),
    swap: (x1, y1, x2, y2) => serialize(async () => {
        const current = get().save;
        if (!current.active)
            return emptyResult();
        const engine = new BoardEngine(getLevel(current.active.levelId), current.active);
        if (!engine.trySwap(x1, y1, x2, y2))
            return emptyResult(current.active.levelId);
        return record(engine, current);
    }),
    castSkill: (id, targets) => serialize(async () => {
        const current = get().save;
        if (!current.active)
            return emptyResult();
        const engine = new BoardEngine(getLevel(current.active.levelId), current.active);
        if (!engine.trySkill(id, targets))
            return emptyResult(current.active.levelId);
        return record(engine, current);
    }),
    purchase: (category, itemId) => serialize(() => enqueue({ id: newId(), kind: 'purchase', category, itemId })),
    equip: loadout => serialize(() => enqueue({ id: newId(), kind: 'equip', loadout })),
    requestExtraMoves: async () => {
        const snapshot = get().save.active;
        const { session, online, adsEnabled } = get();
        if (!snapshot || !session || !online || !adsEnabled || snapshot.extraMovesUsed || !new BoardEngine(getLevel(snapshot.levelId), snapshot).lost)
            return false;
        set({ adsLoading: true, notice: 'Đang chuẩn bị quảng cáo…' });
        try {
            const created = await createAdIntent(session, snapshot.levelId);
            await saveSession(created.session);
            set({ session: created.session });
            if (!await showRewardedForIntent(created.intent.customData))
                return false;
            return await serialize(async () => {
                const current = get().save;
                if (current.active?.runId !== snapshot.runId)
                    return false;
                const engine = new BoardEngine(getLevel(snapshot.levelId), current.active);
                if (!engine.grantExtraMoves())
                    return false;
                await persistNext({ ...current, active: engine.snapshot() });
                set({ notice: '+3 lượt' });
                void checkAdIntent(get().session ?? created.session, created.intent.intentId).catch(() => undefined);
                return true;
            });
        }
        catch (error) {
            set({ notice: apiErrorMessage(error) });
            return false;
        }
        finally {
            set({ adsLoading: false });
        }
    },
    register: async (email, password) => {
        try {
            await get().syncProgress();
            if (get().save.operations.length || !get().session || !get().online)
                throw new Error('SYNC_REQUIRED');
            const session = await registerAccount(email, password, get().session);
            await saveSession(session);
            set({ session, notice: '' });
            await get().syncProgress();
        }
        catch (error) {
            throw new Error(apiErrorMessage(error));
        }
    },
    login: async (email, password) => {
        try {
            await get().syncProgress();
            const beforeSession = get().session;
            // A guest must be flushed before its wallet is merged. A registered player
            // may reauthenticate an expired session and then replay its existing outbox.
            if ((!beforeSession || beforeSession.isGuest) && (get().save.operations.length || !beforeSession || !get().online))
                throw new Error('SYNC_REQUIRED');
            await serialize(async () => {
                const previous = get().save;
                const session = await loginAccount(email, password, get().session);
                const remote = await fetchProfile(session);
                await archiveProfile(previous);
                const saved = previous.ownerId === remote.session.uid ? previous : await loadArchivedProfile(remote.session.uid);
                const operations = saved?.operations ?? [];
                const profile = projectProfile(remote.profile, operations);
                await persistNext({ ...emptySave(), ownerId: remote.session.uid, confirmed: remote.profile, profile, operations, active: saved?.active && saved.active.levelId <= highestUnlocked(profile.levels) ? saved.active : null });
                await saveSession(remote.session);
                set({ session: remote.session, online: true, notice: '' });
            });
            await get().syncProgress();
        }
        catch (error) {
            throw new Error(apiErrorMessage(error));
        }
    },
    syncProgress: async () => {
        if (!isApiConfigured())
            return;
        if (syncInFlight)
            return syncInFlight;
        syncInFlight = (async () => {
            try {
                if (!get().bootstrapLoaded) {
                    const bootstrap = await fetchBootstrap();
                    if (bootstrap.contentVersion !== 2)
                        throw new GameApiError('CONTENT_MISMATCH');
                    set({ bootstrapLoaded: true, adsEnabled: bootstrap.rewardedAdsEnabled });
                    if (bootstrap.rewardedAdsEnabled)
                        void initializeRewardedAds().catch(() => undefined);
                }
                let session = get().session;
                if (!session) {
                    session = await createGuest();
                    await saveSession(session);
                    set({ session });
                }
                const ownerId = session.uid;
                if (get().save.ownerId && get().save.ownerId !== ownerId)
                    throw new Error('PROFILE_OWNER_MISMATCH');
                do {
                    const sent = get().save.operations.slice(0, 50);
                    const result = await syncProfile(session, sent);
                    session = result.session;
                    const confirmed = normalizeProfile(result.response.profile);
                    if (!confirmed)
                        throw new Error('INVALID_PROFILE');
                    await serialize(async () => {
                        const current = get().save;
                        if (get().session?.uid !== ownerId)
                            return;
                        const handled = new Set([...result.response.acknowledged, ...result.response.rejected.map(x => x.id)]);
                        if (sent.some(op => !handled.has(op.id)))
                            throw new Error('INVALID_SYNC_ACK');
                        const operations = current.operations.filter(op => !handled.has(op.id));
                        const profile = projectProfile(confirmed, operations);
                        const reward = result.response.rewards?.find(r => r.id === current.lastWin?.runId);
                        const lastWin = current.lastWin && reward ? { ...current.lastWin, ...reward, totalExp: profile.totalExp } : current.lastWin;
                        await persistNext({ ...current, ownerId, confirmed, operations, profile, lastWin });
                        await saveSession(result.session);
                        set({ session: result.session, online: true, notice: result.response.rejected.length ? 'Một giao dịch chưa được chấp nhận. Số dư và trang bị đã được cập nhật.' : '' });
                    });
                } while (get().save.operations.length && get().session?.uid === ownerId);
            }
            catch (error) {
                set({ online: false });
                if (error instanceof GameApiError && error.code === 'INVALID_SESSION') {
                    // Keep the UID and local outbox; a later guest session must not claim this account's wallet.
                    set({ notice: 'Phiên hết hạn. Hãy đăng nhập lại để đồng bộ.' });
                }
            }
        })().finally(() => { syncInFlight = null; });
        return syncInFlight;
    },
    setNotice: notice => set({ notice }),
}));
export function getHighestUnlocked(save: SaveData): number { return highestUnlocked(save.profile.levels); }
export function getLevelStars(save: SaveData, id: number): Stars { return save.profile.levels.find(x => x.levelId === id)?.stars ?? 0; }
export function getLevelCompleted(save: SaveData, id: number): boolean { return isCompleted(save.profile.levels, id); }
