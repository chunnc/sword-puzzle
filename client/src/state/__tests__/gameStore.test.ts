import type { SessionData } from '../../services/session';
import type { BoardSnapshot } from '../../game/types';
import type { PlayerProfile } from '../../game/domain';
import type { BoardActionPhase, BoardActionPresenter } from '../../game/types';
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
  createGuest: jest.fn(),
  deviceSession: jest.fn(),
  logoutAccount: jest.fn(),
  syncProfile: jest.fn(),
  fetchProfile: jest.fn(),
  loginAccount: jest.fn(),
  registerAccount: jest.fn(),
  createAdIntent: jest.fn(),
  checkAdIntent: jest.fn(),
  fetchChapterMaps: jest.fn(), startRun: jest.fn(), finishRun: jest.fn(), consumeRunEnergy: jest.fn()
}));
const guest: SessionData = {
  uid: 'player',
  idToken: 'token',
  refreshToken: 'refresh',
  expiresIn: 3600,
  isGuest: true,
  installationId: "a".repeat(32),
  bindingVersion: 1
};
let api: typeof import('../../services/api'), session: typeof import('../../services/session'), domain: typeof import('../../game/domain'), saveTools: typeof import('../../game/save'), store: typeof import('../gameStore').useGameStore, storage: typeof import('@react-native-async-storage/async-storage').default;
function ready(profile: PlayerProfile = domain.emptyProfile()) {
  store.setState({
    initialized: true,
    bootstrapLoaded: true,
    online: true,
    connectionFailed: false,
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
function currentMapLevel(levelId = 1) {
  const maps = require('../../../../content/game-maps.json');
  return domain.mapToLevel(domain.validateMap(maps[levelId - 1], domain.CONTENT), 24680, 0, domain.CONTENT);
}
function prepareBattleRun(target = 18): BoardSnapshot {
  const prior = store.getState().save.active!;
  const content = domain.getContentVersion(prior.configVersion ?? prior.contentVersion);
  const map = JSON.parse(JSON.stringify(prior.level.mapDefinition));
  delete map.tutorial;
  map.layout = Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (_, x) => content.normalTileIds[(x + 2*y) % 4]));
  map.layout[0][0] = content.normalTileIds[0]; map.layout[0][1] = content.normalTileIds[1]; map.layout[0][2] = content.normalTileIds[0]; map.layout[1][1] = content.normalTileIds[0];
  map.objectives = [{ id: 'main', type: 'Battle', target, enemy: { id: 'fixture', name: 'Fixture', artKey: 'beast' } }];
  const level = domain.mapToLevel(domain.validateMap(map, content), prior.level.seed, prior.level.assistReduction, content);
  const { BoardEngine } = require('../../game/BoardEngine');
  const snapshot: BoardSnapshot = new BoardEngine(level, null, { loadout: prior.loadout, totalExp: prior.totalExpAtStart ?? 0, passiveSkills: prior.passiveSkills }).snapshot();
  snapshot.runId = prior.runId;
  store.setState({ save: { ...store.getState().save, active: snapshot } });
  return snapshot;
}
beforeEach(async () => {
  jest.resetModules();
  process.env.EXPO_PUBLIC_GAME_API_URL = 'http://localhost:5001/game';
  domain = require('../../game/domain');
  domain.installContent(require('../../../../content/game-config.json'));
  api = require('../../services/api');
  session = require('../../services/session');
  saveTools = require('../../game/save');
  store = require('../gameStore').useGameStore;
  storage = require('@react-native-async-storage/async-storage');
  await storage.clear();
  await session.saveSession(guest);
  (api.fetchBootstrap as jest.Mock).mockResolvedValue({
    contentVersion: domain.CONTENT.version,
    content: domain.CONTENT,
    levelCount: domain.CONTENT.levelCount,
    rewardedAdsEnabled: false,
    minClientVersion: '1.2.0'
  });
  (api.fetchProfile as jest.Mock).mockResolvedValue({
    session: guest,
    profile: domain.emptyProfile()
  });
  (api.createGuest as jest.Mock).mockResolvedValue(guest);
  (api.deviceSession as jest.Mock).mockResolvedValue(guest);
  (api.fetchChapterMaps as jest.Mock).mockImplementation(async (_session, chapterId) => ({
    session: guest,
    value: { chapterId, contentVersion: domain.CONTENT.version, maps: require('../../../../content/game-maps.json').filter((map: any) => map.chapterId === chapterId).map(domain.mapSummary) }
  }));
  (api.startRun as jest.Mock).mockImplementation(async (_session, input) => {
    const map = domain.versionMap(require('../../../../content/game-maps.json')[input.levelId - 1], domain.CONTENT);
    return { session: guest, value: { config: domain.contentWire(domain.CONTENT), energy: { current: 5, nextRecoveryAt: null, asOf: Date.now() }, run: {
      runId: input.runId, configVersion: domain.CONTENT.version, mapVersion: map.mapVersion,
      map, seed: 123456, assistReduction: .1, attempt: 1, loadout: store.getState().save.profile.loadout, totalExp: store.getState().save.profile.totalExp
    } } };
  });
  (api.finishRun as jest.Mock).mockImplementation(async (_session, runId, report) => ({ session: guest, value: {
    profile: store.getState().save.profile, stars: report.outcome === 'won' ? 1 : 0,
    ...(report.outcome === 'won' ? { reward: { id: runId, expGained: 0, coinsGained: 0, bestStars: 1, realmBefore: 0, realmAfter: 0 } } : {})
  } }));
  (api.consumeRunEnergy as jest.Mock).mockImplementation(async () => ({ session: guest, value: { energy: store.getState().save.profile.energy } }));
});
it('creates a guest once for simultaneous initialization and waits for profile', async () => {
  await session.clearSession();
  const secure = require('expo-secure-store');
  secure.getItemAsync.mockResolvedValue(null);
  const routes = await Promise.all([store.getState().initialize(), store.getState().initialize()]);
  expect(routes).toEqual(['/map', '/map']);
  expect(api.createGuest).toHaveBeenCalledTimes(1);
  expect(store.getState().initialized).toBe(true);
  expect(store.getState().connectionFailed).toBe(false);
  expect(store.getState().save.ownerId).toBe('player');
});
it('waits for the initial health check without reporting a connection failure', async () => {
  expect(store.getState()).toMatchObject({ online: false, connectionFailed: false, initialized: false });
  let complete!: () => void;
  (api.checkHealth as jest.Mock).mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; }));
  const boot = store.getState().initialize();
  expect(store.getState()).toMatchObject({ online: false, connectionFailed: false, checkingConnection: true });
  expect(await store.getState().startLevel(1)).toBe(false);
  complete();
  expect(await boot).toBe('/map');
  expect(store.getState()).toMatchObject({ online: true, connectionFailed: false, initialized: true });
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
it.each(['unfinished', 'won', 'lost'])('boots to the map while preserving the saved %s journal', async (status) => {
  const { BoardEngine }: typeof import('../../game/BoardEngine') = require('../../game/BoardEngine');
  const level = currentMapLevel(1);
  const active = new BoardEngine(level).snapshot();
  const saved = { ...saveTools.emptySave(), ownerId: guest.uid, active };
  if (status === 'lost') active.moves = 0;
  if (status === 'won') {
    active.objectiveProgress = Object.fromEntries(level.objectives.map(goal => [goal.id, goal.target]));
    saved.lastWin = {
      runId: active.runId, levelId: 1, stars: 3, bestStars: 3,
      expGained: 30, totalExp: 30, coinsGained: 100, realmBefore: 0, realmAfter: 0,
    };
  }
  await saveTools.persistSave(saved);

  expect(await store.getState().initialize()).toBe('/map');
  expect(store.getState().save.active).toEqual(active);
  expect(store.getState().save.lastWin).toEqual(saved.lastWin);
  expect(await saveTools.loadSave(guest.uid)).toMatchObject({ active, lastWin: saved.lastWin });
});
it.each(['unfinished', 'won', 'lost'])('starts a fresh run instead of the previous %s run when restarting', async (status) => {
  ready();
  await store.getState().startLevel(1);
  const active = store.getState().save.active!;
  active.moves = status === 'lost' ? 0 : 1;
  active.score = 123;
  active.extraMovesUsed = true;
  if (status === 'won') {
    active.objectiveProgress = Object.fromEntries(active.level.objectives.map(goal => [goal.id, goal.target]));
    store.setState({ save: { ...store.getState().save, lastWin: {
      runId: active.runId, levelId: 1, stars: 3, bestStars: 3,
      expGained: 30, totalExp: 30, coinsGained: 100, realmBefore: 0, realmAfter: 0,
    } } });
  }
  const profile = store.getState().save.profile;

  expect(await store.getState().startLevel(1, true)).toBe(true);
  const next = store.getState().save.active!;
  expect(next.runId).not.toBe(active.runId);
  expect(next.moves).toBe(next.level.moves);
  expect(next.objectiveProgress).toEqual(Object.fromEntries(next.level.objectives.map(goal => [goal.id, 0])));
  expect(next.score).toBe(0);
  expect(next.extraMovesUsed).toBe(false);
  expect(next.loadout).toEqual(profile.loadout);
  expect(store.getState().save.lastWin).toBeNull();
  expect(store.getState().save.profile.energy.current).toBe(profile.energy.current);
  expect((await saveTools.loadSave(guest.uid)).active?.runId).toBe(next.runId);
});
it('settles a pending win during cold boot to the map without submitting it twice', async () => {
  const { BoardEngine }: typeof import('../../game/BoardEngine') = require('../../game/BoardEngine');
  const level = currentMapLevel(1);
  const active = new BoardEngine(level).snapshot();
  active.objectiveProgress = Object.fromEntries(level.objectives.map(goal => [goal.id, goal.target]));
  const operation = { id: active.runId, kind: 'win' as const, levelId: 1, stars: 3 as const, objectiveProgress: active.objectiveProgress };
  const profile = domain.applyOperation(domain.emptyProfile(), operation, { ...domain.CONTENT, levels: [level] }).profile;
  await saveTools.persistSave({ ...saveTools.emptySave(), ownerId: guest.uid, active, pending: { contentVersion: active.contentVersion, operation } });
  (api.syncProfile as jest.Mock).mockResolvedValue({ session: guest, response: {
    profile, acknowledged: [operation.id], rejected: [],
    rewards: [{ id: operation.id, expGained: 30, coinsGained: 100, bestStars: 3, realmBefore: 0, realmAfter: 0 }],
  } });

  expect(await store.getState().initialize()).toBe('/map');
  expect(api.syncProfile).toHaveBeenCalledWith(expect.anything(), [operation], active.contentVersion);
  expect(store.getState().save.pending).toBeNull();
  expect(store.getState().save.lastWin?.runId).toBe(active.runId);
  expect(store.getState().save.profile).toEqual(profile);
  await store.getState().initialize();
  await store.getState().syncProgress();
  expect(api.syncProfile).toHaveBeenCalledTimes(1);
  expect(store.getState().save.profile).toEqual(profile);
});
it('blocks boot and every game action while disconnected', async () => {
  (api.checkHealth as jest.Mock).mockRejectedValue(new api.GameApiError('NETWORK_ERROR'));
  await expect(store.getState().initialize()).rejects.toThrow();
  expect(store.getState().initialized).toBe(false);
  expect(store.getState().connectionFailed).toBe(true);
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
it.each([true, false])('preserves board and connection state on resume with online=%s', async (online) => {
  ready();
  await store.getState().startLevel(1);
  const board = store.getState().save.active;
  store.setState({ online, connectionFailed: !online });
  store.getState().setForeground(false);
  expect(await store.getState().startLevel(1, true)).toBe(false);
  store.getState().setForeground(true);
  expect(store.getState()).toMatchObject({ online, connectionFailed: !online, foreground: true });
  expect(store.getState().save.active).toEqual(board);
  expect(api.checkHealth).not.toHaveBeenCalled();
});
it.each(['TIMEOUT', 'NETWORK_ERROR'])('reports %s immediately without a supplementary health check', async (code) => {
  ready();
  (api.syncProfile as jest.Mock).mockRejectedValue(new api.GameApiError(code));
  expect(await store.getState().purchase('skill', 'ngu-kiem')).toBe(false);
  expect(api.checkHealth).not.toHaveBeenCalled();
  expect(store.getState()).toMatchObject({ online: false, connectionFailed: true });
  expect(store.getState().save.pending?.operation.kind).toBe('purchase');
});
it.each(['fetchBootstrap', 'fetchProfile'] as const)('keeps the network dialog when %s times out after healthy ping', async (method) => {
  (api[method] as jest.Mock).mockRejectedValue(new api.GameApiError('TIMEOUT'));
  await expect(store.getState().initialize()).rejects.toThrow();
  expect(api.checkHealth).toHaveBeenCalledTimes(1);
  expect(store.getState()).toMatchObject({ online: false, connectionFailed: true });
});
it('keeps the network dialog through profile recovery after a successful ping', async () => {
  ready(); store.setState({ online: false, connectionFailed: true });
  let finish!: (value: unknown) => void;
  (api.fetchProfile as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = store.getState().checkConnection();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(api.fetchProfile).toHaveBeenCalledTimes(1);
  expect(store.getState()).toMatchObject({ online: false, connectionFailed: true, recovering: true });
  finish({ session: guest, profile: domain.emptyProfile() });
  await pending;
  expect(store.getState()).toMatchObject({ online: true, connectionFailed: false, recovering: false });
});
it('keeps the network dialog when profile recovery returns an invalid response', async () => {
  ready(); store.setState({ online: false, connectionFailed: true });
  (api.fetchProfile as jest.Mock).mockRejectedValueOnce(new api.GameApiError('INVALID_RESPONSE'));
  await store.getState().checkConnection();
  expect(store.getState()).toMatchObject({ online: false, connectionFailed: true, recovering: false });
});
it('does not clear a newer request failure when an older retry finishes', async () => {
  ready();
  let finish!: () => void;
  (api.checkHealth as jest.Mock).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  const pending = store.getState().checkConnection();
  const actualApi = jest.requireActual('../../services/api');
  const originalFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({ status: 504 });
  try {
    await expect(actualApi.fetchBootstrap()).rejects.toMatchObject({ code: 'TIMEOUT' });
    finish(); await pending;
    expect(store.getState()).toMatchObject({ online: false, connectionFailed: true });
  } finally { global.fetch = originalFetch; }
});
it('reports a swallowed background ad timeout and stays disconnected after another API succeeds', async () => {
  ready();
  const actualApi = jest.requireActual('../../services/api');
  const originalFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValueOnce({ status: 504 })
    .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '{}' });
  try {
    await actualApi.checkAdIntent(guest, 'intent').catch(() => undefined);
    expect(store.getState()).toMatchObject({ online: false, connectionFailed: true });
    await actualApi.fetchBootstrap();
    expect(store.getState()).toMatchObject({ online: false, connectionFailed: true });
    expect(api.checkHealth).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
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
  expect(store.getState().save.active!.loadout.skills).toEqual(p.loadout.skills);
});
const flushAction = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function finalWinningSwap(target = 18): [number, number, number, number] {
  const snapshot = prepareBattleRun(target);
  snapshot.moves = 1; snapshot.objectiveProgress.main = 17; snapshot.swordQi = 100;
  const content = domain.getContentVersion(snapshot.configVersion ?? snapshot.contentVersion);
  snapshot.tiles = snapshot.tiles.map((tile, i) => tile ? {
    kind: content.normalTileIds[(i % 7 + 2 * Math.floor(i / 7)) % 4], chargeTier: 0 as const, locked: false
  } : null);
  snapshot.tiles[0]!.kind = content.normalTileIds[0]; snapshot.tiles[1]!.kind = content.normalTileIds[0];
  snapshot.tiles[2]!.kind = content.normalTileIds[1]; snapshot.tiles[9]!.kind = content.normalTileIds[0];
  return [2, 1, 2, 0];
}
function livePresenter(lastWave: number) {
  let waves = 0;
  let finish!: () => void;
  const landing = new Promise<void>(resolve => { finish = resolve; });
  const controller = new AbortController();
  const phases: BoardActionPhase[] = [];
  const presenter: BoardActionPresenter = { signal: controller.signal, present(phase) {
    phases.push(phase);
    return { started: Promise.resolve(), finished: phase.kind === 'step' && ++waves === lastWave ? landing : Promise.resolve() };
  } };
  return { presenter, phases, finish, controller };
}
it('starts live animation before storage and keeps the final animation independent of a slow write', async () => {
  ready(); await store.getState().startLevel(1);
  const { BoardEngine } = require('../../game/BoardEngine');
  const snapshot = prepareBattleRun(1000000);
  snapshot.objectiveProgress = { main: 0 };
  const expected = new BoardEngine(snapshot.level, snapshot);
  const move = expected.legalMoves()[0]; expected.trySwap(...move);
  const live = livePresenter(expected.animation.steps.length);
  let releaseRead!: (value: string | null) => void;
  (storage.getItem as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { releaseRead = resolve; }));
  const action = store.getState().swap(...move as [number, number, number, number], live.presenter);
  let done = false; void action.then(() => { done = true; });
  await flushAction();
  expect(live.phases[0].kind).toBe('start');
  expect(live.phases.at(-1)!.kind).toBe('step');
  expect(releaseRead).toBeDefined();
  expect(store.getState().save.active).toBe(snapshot);
  live.finish(); await flushAction();
  expect(live.phases.at(-1)!.kind).toBe('settled');
  expect(done).toBe(false);
  releaseRead(null);
  const result = await action;
  expect(result).toMatchObject({ changed: true, won: false, animation: null });
  expect(store.getState().save.active).toEqual(expected.snapshot());
  expect(api.syncProfile).not.toHaveBeenCalled();
});
it('persists a final-swap loss with enough qi and returns it only after playback settles', async () => {
  ready(); await store.getState().startLevel(1);
  const { BoardEngine } = require('../../game/BoardEngine');
  const move = finalWinningSwap(100000), snapshot = store.getState().save.active!;
  snapshot.objectiveProgress.main = 0;
  const expected = new BoardEngine(snapshot.level, snapshot);
  expect(expected.trySwap(...move)).toBe(true);
  expect(expected.lost).toBe(true);
  const live = livePresenter(expected.animation.steps.length);
  const action = store.getState().swap(...move, live.presenter);
  let done = false; void action.then(() => { done = true; });
  await flushAction();
  expect(live.phases.at(-1)!.kind).toBe('step');
  expect(done).toBe(false);
  live.finish();
  expect(await action).toMatchObject({ changed: true, won: false, lost: true, animation: null });
  expect(live.phases.at(-1)!.kind).toBe('settled');
  expect(store.getState().save.active).toEqual(expected.snapshot());
  const restored = (await saveTools.loadSave(guest.uid)).active!;
  expect(new BoardEngine(restored.level, restored).lost).toBe(true);
  expect(restored.swordQi).toBeGreaterThanOrEqual(expected.cost('nhat-kiem'));
  expect(api.syncProfile).not.toHaveBeenCalled();
  expect((api.consumeRunEnergy as jest.Mock).mock.calls[0][0].uid).toBe(guest.uid);
  expect(api.consumeRunEnergy).toHaveBeenCalledWith(expect.anything(), snapshot.runId, expect.objectContaining({ outcome: 'lost' }));
  expect(store.getState().save.energyConsumedRunId).toBe(snapshot.runId);
});
it('keeps an immediate energy charge request durable and retries it with the same run after reconnecting', async () => {
  ready(); await store.getState().startLevel(1);
  const { BoardEngine } = require('../../game/BoardEngine');
  const move = finalWinningSwap(100000), snapshot = store.getState().save.active!;
  snapshot.objectiveProgress.main = 0;
  const expected = new BoardEngine(snapshot.level, snapshot);
  expect(expected.trySwap(...move)).toBe(true);expect(expected.lost).toBe(true);
  (api.consumeRunEnergy as jest.Mock).mockRejectedValueOnce(new api.GameApiError('TIMEOUT'));
  expect((await store.getState().swap(...move)).lost).toBe(true);
  expect(store.getState().save.pendingEnergyLoss?.runId).toBe(snapshot.runId);
  expect((await saveTools.loadSave(guest.uid)).pendingEnergyLoss?.runId).toBe(snapshot.runId);
  store.setState({ online: true, connectionFailed: false });
  await store.getState().checkConnection();
  expect(api.consumeRunEnergy).toHaveBeenCalledTimes(2);
  expect((api.consumeRunEnergy as jest.Mock).mock.calls.map((call: any[]) => call[1])).toEqual([snapshot.runId, snapshot.runId]);
  expect(store.getState().save.pendingEnergyLoss).toBeUndefined();
  expect(store.getState().save.energyConsumedRunId).toBe(snapshot.runId);
});
it('runs winning animation while server confirmation is pending and never grants rewards early', async () => {
  ready(); await store.getState().startLevel(1);
  const { BoardEngine } = require('../../game/BoardEngine');
  const move = finalWinningSwap();
  const snapshot = store.getState().save.active!;
  const expected = new BoardEngine(snapshot.level, snapshot);
  expect(expected.trySwap(...move)).toBe(true);
  const live = livePresenter(expected.animation.steps.length);
  let confirm!: (value: unknown) => void;
  (api.finishRun as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { confirm = resolve; }));
  const action = store.getState().swap(...move, live.presenter);
  let done = false; void action.then(() => { done = true; });
  await flushAction();
  expect(api.finishRun).toHaveBeenCalledTimes(1);
  expect(live.phases.at(-1)!.kind).toBe('step');
  expect(store.getState().save.profile.coins).toBe(0);
  expect(store.getState().save.lastWin).toBeNull();
  live.finish(); await flushAction();
  expect(live.phases.at(-1)!.kind).toBe('settled');
  expect(done).toBe(false);
  const run = store.getState().save.pendingFinish!;
  const stars = domain.mapStars(snapshot.level.mapDefinition!, expected.movesUsed);
  const reward = { id: run.runId, expGained: 30, coinsGained: 100, bestStars: stars, realmBefore: 0, realmAfter: 0 };
  const operation = { id: run.runId, kind: 'win' as const, levelId: run.levelId, stars, objectiveProgress: run.report.objectiveProgress };
  const canonical = domain.applyOperation(domain.emptyProfile(), operation, { ...domain.getContentVersion(snapshot.contentVersion), levels: [snapshot.level] }).profile;
  confirm({ session: guest, value: { profile: canonical, stars, reward } });
  const result = await action;
  expect(result).toMatchObject({ won: true, lost: false, stars, animation: null, summary: { coinsGained: 100 } });
  expect(store.getState().save.pendingFinish).toBeUndefined();
});
it('retries a timed-out committed result with the same run ID without local rewards', async () => {
  ready();
  await store.getState().startLevel(1);
  const move = finalWinningSwap();
  const snapshot = store.getState().save.active!;
  (api.finishRun as jest.Mock).mockRejectedValueOnce(new api.GameApiError('TIMEOUT'));
  const result = await store.getState().swap(...move);
  expect(result.won).toBe(true);
  expect(result.summary).toBeUndefined();
  expect(store.getState().save.profile.coins).toBe(0);
  expect(await store.getState().startLevel(2)).toBe(false);
  const pending = store.getState().save.pendingFinish!;
  const operation = { id: pending.runId, kind: 'win' as const, levelId: pending.levelId, stars: 3 as const, objectiveProgress: pending.report.objectiveProgress };
  const canonical = domain.applyOperation(domain.emptyProfile(), operation, { ...domain.getContentVersion(snapshot.contentVersion), levels: [snapshot.level] }).profile;
  (api.finishRun as jest.Mock).mockResolvedValue({ session: guest, value: { profile: canonical, stars: 3, reward: {
    id: pending.runId, expGained: 30, coinsGained: 100, bestStars: 3, realmBefore: 0, realmAfter: 0
  } } });
  await store.getState().checkConnection();
  expect(store.getState()).toMatchObject({ online: true, connectionFailed: false });
  expect(store.getState().save.pendingFinish).toBeUndefined();
  expect(store.getState().save.lastWin?.coinsGained).toBe(100);
  expect((api.finishRun as jest.Mock).mock.calls.map(call => call[1])).toEqual([snapshot.runId, snapshot.runId]);
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
it('logout binds a new guest and clears the previous local journal', async () => {
  ready();
  const registered = { ...guest, isGuest: false };
  await session.saveSession(registered);
  store.setState({ session: registered });
  await store.getState().startLevel(1);
  const next = { ...guest, uid: 'new-guest', bindingVersion: 2 };
  (api.logoutAccount as jest.Mock).mockResolvedValue(next);
  (api.fetchProfile as jest.Mock).mockResolvedValue({ session: next, profile: domain.emptyProfile() });
  await store.getState().logout();
  expect(session.getCurrentSession()?.uid).toBe('new-guest');
  expect(store.getState().save.ownerId).toBe('new-guest');
  expect(store.getState().save.active).toBeNull();
  expect(store.getState().initialized).toBe(true);
});

it('reauthenticates the same registered UID without discarding a pending request', async () => {
  const registered = { ...guest, isGuest: false };
  const p = domain.profileFromLegacy([{ levelId: 1, stars: 3 }, { levelId: 2, stars: 3 }, { levelId: 3, stars: 3 }]);
  await session.saveSession(registered);
  ready(p);
  const operation = { id: 'reauth_purchase1', kind: 'purchase' as const, category: 'skill' as const, itemId: 'ngu-kiem' };
  store.setState({ session: registered, authRequired: true, save: { ...store.getState().save, pending: { contentVersion: domain.CONTENT.version, operation } } });
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
  await saveTools.persistSave({ ...saveTools.emptySave(), ownerId: guest.uid, pending: { contentVersion: domain.CONTENT.version, operation } });
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

it('keeps the current guest usable when an optional login targets a disabled account', async () => {
  ready();
  (api.loginAccount as jest.Mock).mockRejectedValue(new api.GameApiError('ACCOUNT_DISABLED', 403));
  await expect(store.getState().login('disabled@example.test', 'password-123', true)).rejects.toThrow();
  expect(store.getState().authRequired).toBe(false);
  expect(session.getCurrentSession()?.uid).toBe(guest.uid);
  expect(await store.getState().startLevel(1)).toBe(true);
});
it('deduplicates simultaneous manual retries of a rejected identity', async () => {
  ready(); store.setState({ authRequired: true });
  require('expo-secure-store').getItemAsync.mockResolvedValue(JSON.stringify(guest));
  let finish!: () => void;
  (api.checkHealth as jest.Mock).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  const first = store.getState().checkConnection();
  const second = store.getState().checkConnection();
  finish(); await Promise.all([first, second]);
  expect(api.checkHealth).toHaveBeenCalledTimes(1);
  expect(api.deviceSession).toHaveBeenCalledTimes(1);
  expect(store.getState()).toMatchObject({ authRequired: false, initialized: true, online: true });
});

function modernReady(profile: PlayerProfile = domain.emptyProfile()) {
  const content = domain.installContent(require('../../../../content/game-config.json'));
  ready(profile);
  const maps = require('../../../../content/game-maps.json');
  (api.fetchChapterMaps as jest.Mock).mockImplementation(async (_session, chapterId) => ({
    session: guest, value: { chapterId, contentVersion: content.version, maps: maps.filter((m: any) => m.chapterId === chapterId).map(domain.mapSummary) }
  }));
  (api.startRun as jest.Mock).mockImplementation(async (_session, input) => ({ session: guest, value: { config:domain.contentWire(content), energy:{current:5,nextRecoveryAt:null,asOf:Date.now()}, run: {
    runId: input.runId, configVersion:content.version,mapVersion:domain.versionMap(maps[input.levelId-1],content).mapVersion,map: domain.versionMap(maps[input.levelId-1],content), seed: 123456, assistReduction: .1, attempt: 1,
    loadout: store.getState().save.profile.loadout, totalExp: store.getState().save.profile.totalExp
  } } }));
  return content;
}

it.each(['won', 'lost', 'abandoned'] as const)('keeps surplus counts while persisting and retrying a capped %s report', async outcome => {
  modernReady();
  const { BoardEngine } = require('../../game/BoardEngine');
  const active: BoardSnapshot = new BoardEngine(domain.mapToLevel(domain.validateMap(require('../../../../content/game-maps.json')[2], domain.CONTENT), 123456, 0, domain.CONTENT)).snapshot();
  active.moves = outcome === 'lost' ? 0 : active.moves;
  active.objectiveProgress = Object.fromEntries(active.level.objectives.map((goal, index) => [goal.id, outcome === 'won' || index === 0 ? goal.target + 8 : 0]));
  store.setState({ save: { ...store.getState().save, active } });
  (api.finishRun as jest.Mock).mockRejectedValue(new api.GameApiError('TIMEOUT'));
  expect(await store.getState().finishLevel(outcome)).toBe(false);
  const expected = Object.fromEntries(active.level.objectives.map(goal => [goal.id, Math.min(active.objectiveProgress[goal.id], goal.target)]));
  expect((api.finishRun as jest.Mock).mock.calls.at(-1)[2].objectiveProgress).toEqual(expected);
  const restored = await saveTools.loadSave(guest.uid);
  expect(restored.active!.objectiveProgress).toEqual(active.objectiveProgress);
  expect(restored.pendingFinish!.report.objectiveProgress).toEqual(expected);
  store.setState({ save: restored, online: true, connectionFailed: false });
  await store.getState().syncProgress();
  expect((api.finishRun as jest.Mock).mock.calls.map(call => call[1])).toEqual([active.runId, active.runId]);
  expect((api.finishRun as jest.Mock).mock.calls.at(-1)[2].objectiveProgress).toEqual(expected);
});

it('caps the automatic winning report while retaining collection surplus from the final swap', async () => {
  modernReady();
  const { BoardEngine } = require('../../game/BoardEngine');
  const active: BoardSnapshot = new BoardEngine(domain.mapToLevel(domain.validateMap(require('../../../../content/game-maps.json')[0], domain.CONTENT), 123456, 0, domain.CONTENT)).snapshot();
  const goal = active.level.objectives[0];
  active.objectiveProgress[goal.id] = goal.target - 1;
  store.setState({ save: { ...store.getState().save, active } });
  (api.finishRun as jest.Mock).mockRejectedValue(new api.GameApiError('TIMEOUT'));
  const step = active.level.mapDefinition!.tutorial!.steps[0];
  await store.getState().swap(step.from.column - 1, active.level.board.height - step.from.row, step.to.column - 1, active.level.board.height - step.to.row);
  expect(store.getState().save.active!.objectiveProgress[goal.id]).toBeGreaterThan(goal.target);
  expect(store.getState().save.pendingFinish!.report.objectiveProgress[goal.id]).toBe(goal.target);
  expect((api.finishRun as jest.Mock).mock.calls.at(-1)[2].objectiveProgress[goal.id]).toBe(goal.target);
});
it('reuses chapter summaries on repeated entries', async () => {
  const content = modernReady();
  const chapterId = content.chapters![0].id;
  await store.getState().selectChapter(chapterId);
  const expected = require('../../../../content/game-maps.json').filter((map: any) => map.chapterId === chapterId);
  expect(store.getState().chapterMaps.map(map => map.id)).toEqual(expected.map((map: any) => map.id));
  const maps = store.getState().chapterMaps;
  await store.getState().selectChapter(chapterId);
  expect(api.fetchChapterMaps).toHaveBeenCalledTimes(1);
  expect(store.getState().chapterMaps).toBe(maps);
});
it('persists a start request before sending and reuses its ID after an uncertain timeout', async () => {
  modernReady();
  const actual = (api.startRun as jest.Mock).getMockImplementation()!;
  (api.startRun as jest.Mock).mockImplementationOnce(async () => { throw new api.GameApiError('TIMEOUT'); });
  expect(await store.getState().startLevel(1)).toBe(false);
  const pending = store.getState().save.pendingStart!;
  expect(pending.runId).toBeTruthy();
  expect((await saveTools.loadSave(guest.uid)).pendingStart?.runId).toBe(pending.runId);
  store.setState({online:true,connectionFailed:false});
  (api.startRun as jest.Mock).mockImplementation(actual);
  expect(await store.getState().startLevel(1)).toBe(true);
  expect((api.startRun as jest.Mock).mock.calls[1][1].runId).toBe(pending.runId);
  expect(store.getState().save.active?.runId).toBe(pending.runId);
  expect(store.getState().save.pendingStart).toBeUndefined();
  await store.getState().startLevel(1);
  expect(api.startRun).toHaveBeenCalledTimes(3); // explicit entry is a new attempt
  expect(store.getState().save.active?.runId).not.toBe(pending.runId);
});
it('defers a loss report until leaving/retrying, and retries a failed finish with the same run', async () => {
  modernReady(); await store.getState().startLevel(1);
  const active = store.getState().save.active!;
  active.moves = 0; active.swordQi = 0;
  store.setState({save:{...store.getState().save,active}});
  expect(api.finishRun).not.toHaveBeenCalled();
  (api.finishRun as jest.Mock).mockRejectedValueOnce(new api.GameApiError('TIMEOUT'));
  expect(await store.getState().finishLevel('lost')).toBe(false);
  expect(store.getState().save.pendingFinish?.runId).toBe(active.runId);
  (api.finishRun as jest.Mock).mockResolvedValue({session:guest,value:{profile:domain.emptyProfile(),stars:0}});
  store.setState({online:true,connectionFailed:false});
  await store.getState().syncProgress();
  expect(api.finishRun).toHaveBeenCalledTimes(2);
  expect((api.finishRun as jest.Mock).mock.calls.map(call=>call[1])).toEqual([active.runId,active.runId]);
  expect(store.getState().save.active).toBeNull();
  expect(store.getState().save.pendingFinish).toBeUndefined();
});
it('grants rewarded extra moves to a lost run even when a skill is affordable', async () => {
  const profile=domain.emptyProfile();profile.ownedSkills=['nhat-kiem'];profile.ownedSwords=['thanh-phong'];profile.loadout={sword:'thanh-phong',skills:['nhat-kiem']};
  modernReady(profile); await store.getState().startLevel(1);
  const { BoardEngine } = require('../../game/BoardEngine');
  const ads = require('../../services/ads');
  const active = store.getState().save.active!;
  active.moves = 0; active.swordQi = 100;
  store.setState({ adsEnabled: true, save: { ...store.getState().save, active } });
  expect((await store.getState().castSkill('nhat-kiem', [{ x: 0, y: 0 }])).changed).toBe(false);
  (api.createAdIntent as jest.Mock).mockResolvedValue({ session: guest, intent: { intentId: 'extra-moves', customData: 'reward' } });
  (api.checkAdIntent as jest.Mock).mockResolvedValue(guest);
  ads.showRewardedForIntent.mockResolvedValue(true);
  expect(await store.getState().requestExtraMoves()).toBe(true);
  const restored = (await saveTools.loadSave(guest.uid)).active!;
  expect(restored).toMatchObject({ runId: active.runId, moves: 3, extraMovesUsed: true, swordQi: 100 });
  const engine = new BoardEngine(restored.level, restored);
  expect(engine.lost).toBe(false);
  expect(engine.availableSkills()).toContain('nhat-kiem');
  expect(await store.getState().requestExtraMoves()).toBe(false);
  expect(api.createAdIntent).toHaveBeenCalledTimes(1);
  expect(ads.showRewardedForIntent).toHaveBeenCalledWith('reward');
  expect(api.finishRun).not.toHaveBeenCalled();
});
it('startup requests one chapter without fetching map definitions or starting a new run', async () => {
  const content = modernReady();
  store.setState({initialized:false,bootstrapLoaded:false,online:false,save:{...saveTools.emptySave(),ownerId:guest.uid}});
  (api.fetchBootstrap as jest.Mock).mockResolvedValue({contentVersion:content.version,content:domain.contentWire(content),levelCount:content.levelCount,rewardedAdsEnabled:false,minClientVersion:'1.8.0'});
  await store.getState().initialize();
  expect(store.getState().chapterId).toBe('chapter-1');
  expect(api.fetchChapterMaps).toHaveBeenCalledTimes(1);
  expect(api.startRun).not.toHaveBeenCalled();
});
it('clears a superseded run receipt rather than blocking recovery forever', async () => {
  modernReady(); await store.getState().startLevel(1);
  const active = store.getState().save.active!; active.moves=0; active.swordQi=0;
  store.setState({save:{...store.getState().save,active}});
  (api.finishRun as jest.Mock).mockRejectedValue(new api.GameApiError('RUN_CONFLICT',409));
  expect(await store.getState().finishLevel('lost')).toBe(false);
  expect(store.getState().save.pendingFinish).toBeUndefined();
  expect(store.getState().save.active).toBeNull();
  expect(store.getState().notice).toContain('bắt đầu ván mới');
});
it('uses server-selected config instead of bootstrap and keeps it when backgrounded',async()=>{
  const config=modernReady();
  const selected={...config,version:config.version+1,qiCap:200};
  (api.startRun as jest.Mock).mockImplementation(async(_session,input)=>({session:guest,value:{config:domain.contentWire(selected),energy:{current:5,nextRecoveryAt:null,asOf:Date.now()},run:{
    runId:input.runId,mapVersion:44,configVersion:selected.version,map:domain.versionMap(require('../../../../content/game-maps.json')[0],selected,44),
    seed:11,assistReduction:0,attempt:1,loadout:domain.emptyProfile().loadout,totalExp:1500
  }}}));
  expect(await store.getState().startLevel(1)).toBe(true);
  const active=store.getState().save.active!;
  expect(active).toMatchObject({mapVersion:44,configVersion:selected.version,totalExpAtStart:1500});
  expect((api.startRun as jest.Mock).mock.calls[0][1]).not.toHaveProperty('contentVersion');
  store.getState().setForeground(false);store.getState().setForeground(true);
  expect(store.getState().save.active).toEqual(active);expect(api.startRun).toHaveBeenCalledTimes(1);
});
it('journals abandonment before leaving and settles it before starting latest',async()=>{
  modernReady();await store.getState().startLevel(1);
  const id=store.getState().save.active!.runId;
  (api.finishRun as jest.Mock).mockRejectedValueOnce(new api.GameApiError('TIMEOUT'));
  expect(await store.getState().leaveLevel()).toBe(true);
  expect(store.getState().save).toMatchObject({retiredRunId:id,pendingFinish:{runId:id,report:{outcome:'abandoned'}}});
  expect((await saveTools.loadSave(guest.uid)).retiredRunId).toBe(id);
  (api.finishRun as jest.Mock).mockResolvedValue({session:guest,value:{profile:domain.emptyProfile(),stars:0}});
  store.setState({online:true,connectionFailed:false});
  expect(await store.getState().startLevel(1)).toBe(true);
  expect(store.getState().save.active!.runId).not.toBe(id);expect(store.getState().save.retiredRunId).toBeUndefined();
  expect((api.finishRun as jest.Mock).mock.calls.map(call=>call[1])).toEqual([id,id]);
});
it('manual healthy recovery drains an uncertain start without creating another attempt',async()=>{
  modernReady();const actual=(api.startRun as jest.Mock).getMockImplementation()!;
  (api.startRun as jest.Mock).mockRejectedValueOnce(new api.GameApiError('TIMEOUT'));
  await store.getState().startLevel(1);const id=store.getState().save.pendingStart!.runId;
  (api.startRun as jest.Mock).mockImplementation(actual);store.setState({online:true,connectionFailed:false});
  await store.getState().checkConnection();expect(store.getState().save.active!.runId).toBe(id);
  expect(api.startRun).toHaveBeenCalledTimes(2);
});
it('installs expanded catalog metadata while keeping an active run pinned and preserving progress',async()=>{
  const config=modernReady();await store.getState().startLevel(1);
  const active=store.getState().save.active!;
  const expanded={...config,version:config.version+1,levelCount:5,levelBaseExp:[...config.levelBaseExp!.slice(0,4),100],chapters:[
    {...config.chapters![0],lastLevelId:4},{id:'chapter-2',name:'Vân Hải Tiên Sơn II',order:2,firstLevelId:5,lastLevelId:5}
  ]};
  const profile={...domain.emptyProfile(),totalExp:300,levels:Array.from({length:5},(_,i)=>({levelId:i+1,stars:1 as const}))};
  store.setState({save:{...store.getState().save,profile:{...profile,levels:profile.levels.slice(0,4)}}});
  (api.finishRun as jest.Mock).mockResolvedValue({session:guest,value:{profile,profileConfig:domain.contentWire(expanded),stars:3,reward:{id:active.runId,expGained:0,coinsGained:0,bestStars:3,realmBefore:0,realmAfter:0}}});
  expect(await store.getState().finishLevel('won')).toBe(true);
  expect(store.getState().save.profile.levels).toHaveLength(5);
  expect(store.getState().save.active).toEqual(active);
  expect(store.getState().save.active!.configVersion).toBe(config.version);
  const map5={...require('../../../../content/game-maps.json')[3],id:5,chapterId:'chapter-2',orderInChapter:1,name:'Màn 5'};
  (api.fetchChapterMaps as jest.Mock).mockResolvedValueOnce({session:guest,value:{contentVersion:expanded.version,chapterId:'chapter-2',maps:[domain.mapSummary(map5)]}});
  await store.getState().selectChapter('chapter-2');
  expect(store.getState().chapterMaps).toHaveLength(1);
  expect(store.getState().chapterMaps[0].id).toBe(5);
  expect(store.getState().save.active).toEqual(active);
});
