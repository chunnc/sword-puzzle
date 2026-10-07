import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGameStore } from '../gameStore';
import { emptySave, loadSave } from '../../game/save';
import { BoardEngine } from '../../game/BoardEngine';
import { getLevel } from '../../game/levels';
import { emptyProfile, profileFromLegacy, type PlayerProfile } from '../../game/domain';
import * as api from '../../services/api';
import type { SessionData } from '../../services/session';
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../services/ads', () => ({ initializeRewardedAds: jest.fn(), showRewardedForIntent: jest.fn() }));
jest.mock('../../services/session', () => ({ loadSession: jest.fn(async () => null), saveSession: jest.fn(async () => undefined), clearSession: jest.fn(async () => undefined) }));
jest.mock('../../services/api', () => ({
    isApiConfigured: jest.fn(() => false), fetchBootstrap: jest.fn(), createGuest: jest.fn(), syncProfile: jest.fn(), fetchProfile: jest.fn(), loginAccount: jest.fn(), registerAccount: jest.fn(), createAdIntent: jest.fn(), checkAdIntent: jest.fn(),
    GameApiError: class extends Error {
        code: string;
        constructor(code: string) { super(code); this.code = code; }
    },
}));
const session: SessionData = { uid: 'test-player', idToken: 'token', refreshToken: 'refresh', expiresIn: 3600, isGuest: true };
function install(profile: PlayerProfile) { const save = emptySave(); save.confirmed = profile; save.profile = profile; useGameStore.setState({ save }); }
describe('game store lifecycle', () => {
    beforeEach(async () => { await useGameStore.getState().syncProgress(); jest.clearAllMocks(); (api.isApiConfigured as jest.Mock).mockReturnValue(false); await AsyncStorage.clear(); useGameStore.setState({ save: emptySave(), session: null, initialized: true, bootstrapLoaded: false, online: false, adsEnabled: false, notice: '' }); });
    it('reopens the same stage with its saved board, moves, qi and run ID intact', async () => {
        await useGameStore.getState().startLevel(1);
        const saved = { ...useGameStore.getState().save.active!, moves: 17, remaining: 7, swordQi: 60 };
        useGameStore.setState({ save: { ...useGameStore.getState().save, active: saved } });
        expect(await useGameStore.getState().startLevel(1)).toBe(true);
        expect(useGameStore.getState().save.active).toEqual(saved);
        expect((await loadSave()).active).toEqual(saved);
        expect(useGameStore.getState().save.operations).toEqual([]);
    });
    it('records a real last-skill zero-star win, saves it and opens stage two', async () => {
        const snapshot = new BoardEngine(getLevel(1)).snapshot();
        snapshot.moves = 0;
        snapshot.remaining = 1;
        snapshot.swordQi = 60;
        for (let x = 0; x < 7; x++)
            snapshot.tiles[x] = { kind: 0, chargeTier: 0, locked: false };
        useGameStore.setState({ save: { ...emptySave(), active: snapshot } });
        const result = await useGameStore.getState().castSkill('nhat-kiem', [{ x: 0, y: 0 }]);
        expect(result.won).toBe(true);
        expect(result.stars).toBe(0);
        expect(result.summary?.expGained).toBe(30);
        expect(result.summary?.coinsGained).toBe(100);
        expect((await loadSave()).profile.levels).toEqual([{ levelId: 1, stars: 0 }]);
        expect(await useGameStore.getState().startLevel(2)).toBe(true);
    });
    it('updates win-screen rewards after another device already improved the stage', async () => {
        const snapshot = new BoardEngine(getLevel(1)).snapshot();
        snapshot.moves = 0; snapshot.remaining = 1; snapshot.swordQi = 60;
        for (let x = 0; x < 7; x++) snapshot.tiles[x] = { kind: 0, chargeTier: 0, locked: false };
        useGameStore.setState({ save: { ...emptySave(), active: snapshot } });
        await useGameStore.getState().castSkill('nhat-kiem', [{ x: 0, y: 0 }]);
        const id = useGameStore.getState().save.lastWin!.runId;
        const canonical = profileFromLegacy([{ levelId: 1, stars: 3 }]); canonical.coins += 10;
        (api.isApiConfigured as jest.Mock).mockReturnValue(true);
        (api.fetchBootstrap as jest.Mock).mockResolvedValue({ contentVersion: 2, rewardedAdsEnabled: false });
        (api.createGuest as jest.Mock).mockResolvedValue(session);
        (api.syncProfile as jest.Mock).mockResolvedValue({ session, response: { profile: canonical, acknowledged: [id], rejected: [], rewards: [{ id, expGained: 0, coinsGained: 10, bestStars: 3, realmBefore: 0, realmAfter: 0 }] } });
        await useGameStore.getState().syncProgress();
        expect(useGameStore.getState().save.lastWin).toMatchObject({ expGained: 0, coinsGained: 10, bestStars: 3, totalExp: 100 });
    });
    it('purchases and equips offline while the current run retains its loadout', async () => {
        install(profileFromLegacy(Array.from({ length: 15 }, (_, i) => ({ levelId: i + 1, stars: 3 }))));
        await useGameStore.getState().startLevel(1);
        const frozen = useGameStore.getState().save.active!;
        expect(await useGameStore.getState().purchase('skill', 'ngu-kiem')).toBe(true);
        expect(await useGameStore.getState().equip({ sword: 'thanh-phong', skills: ['nhat-kiem', 'ngu-kiem'] })).toBe(true);
        expect(useGameStore.getState().save.active!.loadout).toEqual(frozen.loadout);
        await useGameStore.getState().startLevel(2);
        expect(useGameStore.getState().save.active!.loadout.skills).toEqual(['nhat-kiem', 'ngu-kiem']);
        expect((await loadSave()).operations).toHaveLength(2);
    });
    it('reconciles a rejected offline purchase to the server profile', async () => {
        const p = profileFromLegacy([{ levelId: 1, stars: 0 }, { levelId: 2, stars: 0 }, { levelId: 3, stars: 0 }]);
        p.coins = 150;
        install(p);
        await useGameStore.getState().purchase('skill', 'ngu-kiem');
        const op = useGameStore.getState().save.operations[0];
        (api.isApiConfigured as jest.Mock).mockReturnValue(true);
        (api.fetchBootstrap as jest.Mock).mockResolvedValue({ contentVersion: 2, rewardedAdsEnabled: false });
        (api.createGuest as jest.Mock).mockResolvedValue(session);
        const canonical = { ...p, coins: 0 };
        (api.syncProfile as jest.Mock).mockResolvedValue({ session, response: { profile: canonical, acknowledged: [], rejected: [{ id: op.id, reason: 'INSUFFICIENT_COINS' }] } });
        await useGameStore.getState().syncProgress();
        const save = useGameStore.getState().save;
        expect(save.operations).toHaveLength(0);
        expect(save.profile.coins).toBe(0);
        expect(save.profile.ownedSkills).not.toContain('ngu-kiem');
        expect(useGameStore.getState().notice).toContain('chưa được chấp nhận');
    });
    it('keeps stable operation IDs on network failure and reload', async () => {
        install(profileFromLegacy([{ levelId: 1, stars: 3 }, { levelId: 2, stars: 3 }, { levelId: 3, stars: 3 }]));
        await useGameStore.getState().purchase('skill', 'ngu-kiem');
        const id = useGameStore.getState().save.operations[0].id;
        (api.isApiConfigured as jest.Mock).mockReturnValue(true);
        (api.fetchBootstrap as jest.Mock).mockRejectedValue(new Error('offline'));
        await useGameStore.getState().syncProgress();
        expect(useGameStore.getState().save.operations[0].id).toBe(id);
        expect((await loadSave()).operations[0].id).toBe(id);
    });
    it('can reauthenticate a registered player without discarding a pending outbox', async () => {
        const p = profileFromLegacy([{ levelId: 1, stars: 3 }, { levelId: 2, stars: 3 }, { levelId: 3, stars: 3 }]);
        install(p);
        useGameStore.setState({ session: { ...session, isGuest: false }, save: { ...useGameStore.getState().save, ownerId: session.uid } });
        await useGameStore.getState().purchase('skill', 'ngu-kiem');
        (api.loginAccount as jest.Mock).mockResolvedValue({ ...session, isGuest: false });
        (api.fetchProfile as jest.Mock).mockResolvedValue({ profile: p, session: { ...session, isGuest: false } });
        await useGameStore.getState().login('player@example.test', 'password');
        expect(useGameStore.getState().save.operations).toHaveLength(1);
        expect(useGameStore.getState().save.profile.ownedSkills).toContain('ngu-kiem');
    });
});
