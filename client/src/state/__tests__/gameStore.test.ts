import type { SessionData } from '../../services/session';
import type { PlayerProfile } from '../../game/domain';
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined)
}));
jest.mock('../../services/ads', () => ({
  initializeRewardedAds: jest.fn(),
  showRewardedForIntent: jest.fn()
}));
jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  isApiConfigured: jest.fn(() => true),
  checkHealth: jest.fn(async () => undefined),
  fetchBootstrap: jest.fn(),
  fetchContent: jest.fn(),
  createGuest: jest.fn(),
  syncProfile: jest.fn(),
  fetchProfile: jest.fn(),
  loginAccount: jest.fn(),
  registerAccount: jest.fn(),
  createAdIntent: jest.fn(),
  checkAdIntent: jest.fn()
}));
const guest: SessionData = {
  uid: 'player',
  idToken: 'token',
  refreshToken: 'refresh',
  expiresIn: 3600,
  isGuest: true
};
let api: typeof import('../../services/api'), session: typeof import('../../services/session'), domain: typeof import('../../game/domain'), saveTools: typeof import('../../game/save'), store: typeof import('../gameStore').useGameStore, storage: typeof import('@react-native-async-storage/async-storage').default;
function ready(profile: PlayerProfile = domain.emptyProfile()) {
  store.setState({
    initialized: true,
    bootstrapLoaded: true,
    online: true,
    foreground: true,
    recovering: false,
    authRequired: false,
    session: guest,
    save: {
      ...saveTools.emptySave(),
      ownerId: guest.uid,
      profile
    }
  });
}
beforeEach(async () => {
  jest.resetModules();
  domain = require('../../game/domain');
  domain.installContent(require('../../../../content/game-content.json'));
  api = require('../../services/api');
  session = require('../../services/session');
  saveTools = require('../../game/save');
  store = require('../gameStore').useGameStore;
  storage = require('@react-native-async-storage/async-storage');
  await storage.clear();
  await session.saveSession(guest);
  (api.fetchBootstrap as jest.Mock).mockResolvedValue({
    contentVersion: 3,
    content: domain.CONTENT,
    levelCount: 40,
    rewardedAdsEnabled: false,
    minClientVersion: '1.2.0'
  });
  (api.fetchProfile as jest.Mock).mockResolvedValue({
    session: guest,
    profile: domain.emptyProfile()
  });
  (api.createGuest as jest.Mock).mockResolvedValue(guest);
  (api.fetchContent as jest.Mock).mockResolvedValue(domain.CONTENT);
});
it('creates a guest once for simultaneous initialization and waits for profile', async () => {
  await session.clearSession();
  const secure = require('expo-secure-store');
  secure.getItemAsync.mockResolvedValue(null);
  const routes = await Promise.all([store.getState().initialize(), store.getState().initialize()]);
  expect(routes).toEqual(['/map', '/map']);
  expect(api.createGuest).toHaveBeenCalledTimes(1);
  expect(store.getState().initialized).toBe(true);
  expect(store.getState().save.ownerId).toBe('player');
});
it('reuses the saved session and ignores offline progress', async () => {
  require('expo-secure-store').getItemAsync.mockResolvedValue(JSON.stringify(guest));
  await storage.setItem('kiemkhai.save.v2', JSON.stringify({
    profile: {
      coins: 9999
    }
  }));
  await store.getState().initialize();
  expect(api.createGuest).not.toHaveBeenCalled();
  expect(store.getState().save.profile.coins).toBe(0);
});
it('blocks boot and every game action while disconnected', async () => {
  (api.checkHealth as jest.Mock).mockRejectedValue(new api.GameApiError('NETWORK_ERROR'));
  await expect(store.getState().initialize()).rejects.toThrow();
  expect(store.getState().initialized).toBe(false);
  expect(api.createGuest).not.toHaveBeenCalled();
  expect(await store.getState().startLevel(1)).toBe(false);
  ready();
  store.setState({
    online: false
  });
  expect(await store.getState().purchase('skill', 'ngu-kiem')).toBe(false);
  expect(await store.getState().equip({
    sword: 'thanh-phong',
    skills: ['nhat-kiem']
  })).toBe(false);
  expect((await store.getState().castSkill('nhat-kiem', [])).changed).toBe(false);
});
it('keeps an unchanged board during network loss and foreground checks', async () => {
  ready();
  await store.getState().startLevel(1);
  const board = store.getState().save.active;
  store.getState().setForeground(false);
  expect(await store.getState().startLevel(1, true)).toBe(false);
  expect(store.getState().save.active).toEqual(board);
  store.getState().setForeground(true);
  expect(store.getState().online).toBe(false);
  await store.getState().checkConnection();
  expect(store.getState().online).toBe(true);
  expect(store.getState().save.active).toEqual(board);
});
it('purchases only after server confirmation and freezes the run loadout', async () => {
  const p = domain.profileFromLegacy(Array.from({
    length: 15
  }, (_, i) => ({
    levelId: i + 1,
    stars: 3 as const
  })));
  ready(p);
  await store.getState().startLevel(1);
  let finish!: (value: unknown) => void;
  (api.syncProfile as jest.Mock).mockImplementation(() => new Promise(resolve => {
    finish = resolve;
  }));
  const buying = store.getState().purchase('skill', 'ngu-kiem');
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(store.getState().save.profile.ownedSkills).not.toContain('ngu-kiem');
  const pending = store.getState().save.pending!,
    result = domain.applyOperation(p, pending.operation).profile;
  finish({
    session: guest,
    response: {
      profile: result,
      acknowledged: [pending.operation.id],
      rejected: []
    }
  });
  expect(await buying).toBe(true);
  expect(store.getState().save.profile.ownedSkills).toContain('ngu-kiem');
  expect(store.getState().save.active!.loadout.skills).toEqual(['nhat-kiem']);
});
it('retries a timed-out committed result with the same run ID without local rewards', async () => {
  ready();
  await store.getState().startLevel(1);
  const snapshot = store.getState().save.active!;
  snapshot.moves = 0;
  snapshot.objectiveProgress.main = 17;
  snapshot.swordQi = 60;
  for (let x = 0; x < 7; x++) snapshot.tiles[x] = {
    kind: 0,
    chargeTier: 0,
    locked: false
  };
  (api.syncProfile as jest.Mock).mockRejectedValueOnce(new api.GameApiError('TIMEOUT'));
  const result = await store.getState().castSkill('nhat-kiem', [{
    x: 0,
    y: 0
  }]);
  expect(result.won).toBe(true);
  expect(result.summary).toBeUndefined();
  expect(store.getState().save.profile.coins).toBe(0);
  expect(await store.getState().startLevel(2)).toBe(false);
  const pending = store.getState().save.pending!,
    canonical = domain.applyOperation(domain.emptyProfile(), pending.operation).profile;
  (api.syncProfile as jest.Mock).mockResolvedValue({
    session: guest,
    response: {
      profile: canonical,
      acknowledged: [pending.operation.id],
      rejected: [],
      rewards: [{
        id: pending.operation.id,
        expGained: 30,
        coinsGained: 100,
        bestStars: 0,
        realmBefore: 0,
        realmAfter: 0
      }]
    }
  });
  await store.getState().syncProgress();
  expect(store.getState().save.pending).toBeNull();
  expect(store.getState().save.lastWin?.coinsGained).toBe(100);
  expect((api.syncProfile as jest.Mock).mock.calls[1][1][0].id).toBe(snapshot.runId);
  expect(await store.getState().startLevel(2)).toBe(true);
});
it('reconciles a rejected purchase without optimistic ownership', async () => {
  ready(domain.profileFromLegacy([{
    levelId: 1,
    stars: 3
  }, {
    levelId: 2,
    stars: 3
  }, {
    levelId: 3,
    stars: 3
  }]));
  (api.syncProfile as jest.Mock).mockImplementation(async (_s, ops) => ({
    session: guest,
    response: {
      profile: store.getState().save.profile,
      acknowledged: [],
      rejected: [{
        id: ops[0].id,
        reason: 'INSUFFICIENT_COINS'
      }]
    }
  }));
  expect(await store.getState().purchase('skill', 'ngu-kiem')).toBe(false);
  expect(store.getState().save.pending).toBeNull();
  expect(store.getState().save.profile.ownedSkills).not.toContain('ngu-kiem');
});
it('does not silently create a guest when refresh is rejected', async () => {
  require('expo-secure-store').getItemAsync.mockResolvedValue(JSON.stringify(guest));
  (api.fetchProfile as jest.Mock).mockRejectedValue(new api.GameApiError('INVALID_SESSION', 401));
  await expect(store.getState().initialize()).rejects.toThrow();
  expect(store.getState().authRequired).toBe(true);
  expect(api.createGuest).not.toHaveBeenCalled();
  expect(session.getCurrentSession()?.uid).toBe('player');
});
it('logout clears session and journal without deleting server profile', async () => {
  ready();
  await store.getState().startLevel(1);
  await store.getState().logout();
  expect(session.getCurrentSession()).toBeNull();
  expect(store.getState().save.ownerId).toBeNull();
  expect((await saveTools.loadSave('player')).active).toBeNull();
  expect(api.syncProfile).not.toHaveBeenCalled();
});

it('reauthenticates the same registered UID without discarding a pending request', async () => {
  const registered = { ...guest, isGuest: false };
  const p = domain.profileFromLegacy([{ levelId: 1, stars: 3 }, { levelId: 2, stars: 3 }, { levelId: 3, stars: 3 }]);
  await session.saveSession(registered);
  ready(p);
  const operation = { id: 'reauth_purchase1', kind: 'purchase' as const, category: 'skill' as const, itemId: 'ngu-kiem' };
  store.setState({ session: registered, authRequired: true, save: { ...store.getState().save, pending: { contentVersion: 3, operation } } });
  (api.loginAccount as jest.Mock).mockResolvedValue(registered);
  (api.fetchProfile as jest.Mock).mockResolvedValue({ session: registered, profile: p });
  const canonical = domain.applyOperation(p, operation).profile;
  (api.syncProfile as jest.Mock).mockResolvedValue({ session: registered, response: { profile: canonical, acknowledged: [operation.id], rejected: [] } });
  await store.getState().login('player@example.test', 'password-123');
  expect(store.getState().save.pending).toBeNull();
  expect(store.getState().save.profile.ownedSkills).toContain('ngu-kiem');
  expect((api.syncProfile as jest.Mock).mock.calls[0][1][0].id).toBe(operation.id);
});

it('restores the pending journal after a cold boot with a revoked registered session', async () => {
  const registered = { ...guest, isGuest: false };
  const p = domain.profileFromLegacy([{ levelId: 1, stars: 3 }, { levelId: 2, stars: 3 }, { levelId: 3, stars: 3 }]);
  const operation = { id: 'cold_reauth_buy1', kind: 'purchase' as const, category: 'skill' as const, itemId: 'ngu-kiem' };
  await saveTools.persistSave({ ...saveTools.emptySave(), ownerId: guest.uid, pending: { contentVersion: 3, operation } });
  require('expo-secure-store').getItemAsync.mockResolvedValue(JSON.stringify(registered));
  (api.fetchProfile as jest.Mock).mockRejectedValueOnce(new api.GameApiError('INVALID_SESSION', 401));
  await expect(store.getState().initialize()).rejects.toThrow();
  expect(store.getState().save.ownerId).toBe(guest.uid);
  (api.loginAccount as jest.Mock).mockResolvedValueOnce({ ...registered, uid: 'other-account' });
  await expect(store.getState().login('other@example.test', 'password-123')).rejects.toThrow('đúng tài khoản');
  expect(session.getCurrentSession()?.uid).toBe(guest.uid);
  expect(store.getState().save.pending?.operation.id).toBe(operation.id);
  (api.loginAccount as jest.Mock).mockResolvedValue(registered);
  (api.fetchProfile as jest.Mock).mockResolvedValue({ session: registered, profile: p });
  const canonical = domain.applyOperation(p, operation).profile;
  (api.syncProfile as jest.Mock).mockResolvedValue({ session: registered, response: { profile: canonical, acknowledged: [operation.id], rejected: [] } });
  await store.getState().login('player@example.test', 'password-123');
  expect(store.getState().save.profile.ownedSkills).toContain('ngu-kiem');
  expect((api.syncProfile as jest.Mock).mock.calls[0][1][0].id).toBe(operation.id);
});
