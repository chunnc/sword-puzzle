import type { MapSummary } from '../../game/domain';
import type { SessionData } from '../../services/session';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('../../services/ads', () => ({ initializeRewardedAds: jest.fn(), showRewardedForIntent: jest.fn() }));
jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  fetchChapterMaps: jest.fn(), fetchBootstrap: jest.fn(), fetchProfile: jest.fn(),
  isApiConfigured: jest.fn(() => true), checkHealth: jest.fn(async () => undefined), startRun: jest.fn(),
}));

const guest: SessionData = { uid: 'player', idToken: 'token', refreshToken: 'refresh', expiresIn: 3600, isGuest: true,
  installationId: 'a'.repeat(32), bindingVersion: 1 };
let domain: typeof import('../../game/domain'), api: typeof import('../../services/api'),
  session: typeof import('../../services/session'), store: typeof import('../gameStore').useGameStore;
let now: number;
const ttl = 5 * 60 * 1000;
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function response(chapterId = 'chapter-1', revision = 1) {
  const chapter = domain.CONTENT.chapters!.find(ch => ch.id === chapterId)!;
  const source = require('../../../../content/game-maps.json')[0];
  const maps: MapSummary[] = Array.from({ length: chapter.lastLevelId - chapter.firstLevelId + 1 }, (_, i) => ({
    ...domain.mapSummary(structuredClone(source)), id: chapter.firstLevelId + i, chapterId, orderInChapter: i + 1,
    contentVersion: domain.CONTENT.version,
  }));
  return { session: session.getCurrentSession()!, value: { contentVersion: domain.CONTENT.version, chapterId, catalogRevision: revision, maps } };
}
function unlockChapters() {
  const save = store.getState().save;
  store.setState({ save: { ...save, profile: { ...save.profile,
    levels: Array.from({ length: domain.CONTENT.levelCount }, (_, i) => ({ levelId: i + 1, stars: 1 as const })),
  } } });
}

beforeEach(async () => {
  jest.resetModules();
  domain = require('../../game/domain');
  const config = structuredClone(require('../../../../content/game-config.json'));
  const count = config.chapters[0].lastLevelId;
  config.levelCount = count * 2;
  config.levelBaseExp = Array(config.levelCount).fill(100);
  config.chapters = [config.chapters[0], { ...config.chapters[0], id: 'chapter-2', order: 2, firstLevelId: count + 1, lastLevelId: count * 2 }];
  domain.installContent(config);
  api = require('../../services/api');
  session = require('../../services/session');
  await session.saveSession(guest);
  store = require('../gameStore').useGameStore;
  store.setState({ initialized: true, bootstrapLoaded: true, online: true, foreground: true, session: session.getCurrentSession(),
    save: { ...require('../../game/save').emptySave(), ownerId: guest.uid } });
  jest.mocked(api.fetchChapterMaps).mockImplementation(async (_session, chapterId) => response(chapterId));
  now = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => { jest.restoreAllMocks(); });

it('loads once, shows initial loading, and deduplicates simultaneous requests', async () => {
  const pending = deferred<ReturnType<typeof response>>();
  jest.mocked(api.fetchChapterMaps).mockReturnValueOnce(pending.promise);
  const first = store.getState().selectChapter('chapter-1');
  const second = store.getState().selectChapter('chapter-1');
  expect(store.getState().chapterLoading).toBe(true);
  expect(api.fetchChapterMaps).toHaveBeenCalledTimes(1);
  pending.resolve(response());
  await Promise.all([first, second]);
  const maps = store.getState().chapterMaps;
  expect(maps).toHaveLength(domain.CONTENT.chapters![0].lastLevelId);
  now += ttl - 1;
  await store.getState().selectChapter('chapter-1');
  expect(api.fetchChapterMaps).toHaveBeenCalledTimes(1);
  expect(store.getState().chapterMaps).toBe(maps);
  expect(store.getState().chapterLoading).toBe(false);
});

it('keeps separate chapter caches and respects chapter unlocks', async () => {
  await store.getState().selectChapter('chapter-1');
  const firstMaps = store.getState().chapterMaps;
  await store.getState().selectChapter('chapter-2');
  expect(api.fetchChapterMaps).toHaveBeenCalledTimes(1);
  expect(store.getState().chapterId).toBe('chapter-1');
  unlockChapters();
  await store.getState().selectChapter('chapter-2');
  const secondMaps = store.getState().chapterMaps;
  const back = store.getState().selectChapter('chapter-1');
  expect(store.getState().chapterMaps).toBe(firstMaps);
  expect(store.getState().chapterLoading).toBe(false);
  await back;
  await store.getState().selectChapter('chapter-2');
  expect(store.getState().chapterMaps).toBe(secondMaps);
  expect(api.fetchChapterMaps).toHaveBeenCalledTimes(2);
});

it('refreshes at five minutes without clearing maps and keeps references for equal data', async () => {
  await store.getState().selectChapter('chapter-1');
  const maps = store.getState().chapterMaps;
  now += ttl;
  const pending = deferred<ReturnType<typeof response>>();
  jest.mocked(api.fetchChapterMaps).mockReturnValueOnce(pending.promise);
  const first = store.getState().selectChapter('chapter-1');
  const second = store.getState().selectChapter('chapter-1');
  expect(store.getState().chapterMaps).toBe(maps);
  expect(store.getState().chapterLoading).toBe(false);
  expect(api.fetchChapterMaps).toHaveBeenCalledTimes(2);
  const unchanged = response();
  // Object property order is not a data change.
  unchanged.value.maps = unchanged.value.maps.map(map => Object.fromEntries(Object.entries(map).reverse()) as MapSummary);
  pending.resolve(unchanged);
  await Promise.all([first, second]);
  expect(store.getState().chapterMaps).toBe(maps);
  now += ttl - 1;
  await store.getState().selectChapter('chapter-1');
  expect(api.fetchChapterMaps).toHaveBeenCalledTimes(2);
});

it('updates changed map content even when the catalog revision is unchanged', async () => {
  await store.getState().selectChapter('chapter-1');
  const maps = store.getState().chapterMaps;
  const changed = response();
  changed.value.maps[0].objectives[0] = { ...changed.value.maps[0].objectives[0], target: 987 };
  jest.mocked(api.fetchChapterMaps).mockResolvedValueOnce(changed);
  now += ttl;
  await store.getState().selectChapter('chapter-1');
  expect(store.getState().chapterMaps).not.toBe(maps);
  expect(store.getState().chapterMaps[0].objectives[0].target).toBe(987);
});

it('invalidates other chapters when a newer catalog revision is seen', async () => {
  unlockChapters();
  await store.getState().selectChapter('chapter-1');
  const firstMaps = store.getState().chapterMaps;
  await store.getState().selectChapter('chapter-2');
  jest.mocked(api.fetchChapterMaps).mockResolvedValueOnce(response('chapter-2', 2));
  await store.getState().selectChapter('chapter-2', { force: true });
  jest.mocked(api.fetchChapterMaps).mockResolvedValueOnce(response('chapter-1', 2));
  const back = store.getState().selectChapter('chapter-1');
  expect(store.getState().chapterMaps).toBe(firstMaps);
  expect(store.getState().chapterLoading).toBe(false);
  await back;
  expect(api.fetchChapterMaps).toHaveBeenCalledTimes(4);
  expect(store.getState().chapterMaps).toBe(firstMaps);
});

it('invalidates fresh maps when bootstrap announces a newer catalog revision', async () => {
  await store.getState().selectChapter('chapter-1');
  const maps = store.getState().chapterMaps;
  require('expo-secure-store').getItemAsync.mockResolvedValue(JSON.stringify(session.getCurrentSession()));
  jest.mocked(api.fetchBootstrap).mockResolvedValue({ contentVersion: domain.CONTENT.version, catalogRevision: 2,
    content: domain.contentWire(domain.CONTENT), levelCount: domain.CONTENT.levelCount, rewardedAdsEnabled: false, minClientVersion: '1.8.0' });
  jest.mocked(api.fetchProfile).mockResolvedValue({ session: session.getCurrentSession()!, profile: store.getState().save.profile });
  jest.mocked(api.fetchChapterMaps).mockResolvedValueOnce(response('chapter-1', 2));
  store.setState({ online: false, connectionFailed: true });
  await store.getState().checkConnection();
  expect(store.getState().online).toBe(true);
  expect(api.fetchChapterMaps).toHaveBeenCalledTimes(2);
  expect(store.getState().chapterMaps).toBe(maps);
  await store.getState().selectChapter('chapter-1');
  expect(api.fetchChapterMaps).toHaveBeenCalledTimes(2);
});

it('keeps the cache through an ordinary token refresh', async () => {
  await store.getState().selectChapter('chapter-1');
  const maps = store.getState().chapterMaps;
  await session.saveRefreshedSession({ ...guest, idToken: 'refreshed' }, session.getSessionGeneration());
  store.setState({ session: session.getCurrentSession() });
  await store.getState().selectChapter('chapter-1');
  expect(api.fetchChapterMaps).toHaveBeenCalledTimes(1);
  expect(store.getState().chapterMaps).toBe(maps);
});

it('keeps cached maps on refresh failure and supports forced retry', async () => {
  await store.getState().selectChapter('chapter-1');
  const maps = store.getState().chapterMaps;
  jest.mocked(api.fetchChapterMaps).mockRejectedValueOnce(new api.GameApiError('NETWORK_ERROR'));
  await expect(store.getState().selectChapter('chapter-1', { force: true })).rejects.toThrow('NETWORK_ERROR');
  expect(store.getState().chapterMaps).toBe(maps);
  expect(store.getState().chapterLoading).toBe(false);
  expect(store.getState().chapterError).toBeTruthy();
  expect(store.getState().connectionFailed).toBe(true);
  store.setState({ online: true, connectionFailed: false });
  await store.getState().selectChapter('chapter-1', { force: true });
  expect(api.fetchChapterMaps).toHaveBeenCalledTimes(3);
  expect(store.getState().chapterError).toBe('');
  expect(store.getState().chapterMaps).toBe(maps);
});

it('does not renew the cache timestamp after a failed refresh', async () => {
  await store.getState().selectChapter('chapter-1');
  now += ttl;
  jest.mocked(api.fetchChapterMaps).mockRejectedValueOnce(new api.GameApiError('INVALID_RESPONSE'));
  await expect(store.getState().selectChapter('chapter-1')).rejects.toThrow('INVALID_RESPONSE');
  await store.getState().selectChapter('chapter-1');
  expect(api.fetchChapterMaps).toHaveBeenCalledTimes(3);
});

it.each([false, true])('ignores late results and errors from another identity, reject=%s', async reject => {
  await store.getState().selectChapter('chapter-1');
  const oldReply = response();
  const pending = deferred<ReturnType<typeof response>>();
  jest.mocked(api.fetchChapterMaps).mockReturnValueOnce(pending.promise);
  const old = store.getState().selectChapter('chapter-1', { force: true });
  await session.saveSession({ ...guest, uid: 'other' });
  store.setState({ session: session.getCurrentSession(), save: { ...store.getState().save, ownerId: 'other' } });
  expect(store.getState().chapterMaps).toEqual([]);
  await store.getState().selectChapter('chapter-1');
  const maps = store.getState().chapterMaps;
  if (reject) pending.reject(new api.GameApiError('DEVICE_REVOKED', 401));
  else pending.resolve(oldReply);
  await old;
  expect(store.getState().chapterMaps).toBe(maps);
  expect(store.getState().session?.uid).toBe('other');
  expect(store.getState().authRequired).toBe(false);
  expect(store.getState().chapterError).toBe('');
});

it('ignores responses from an old content version', async () => {
  await store.getState().selectChapter('chapter-1');
  const reply = response();
  const pending = deferred<ReturnType<typeof response>>();
  jest.mocked(api.fetchChapterMaps).mockReturnValueOnce(pending.promise);
  const old = store.getState().selectChapter('chapter-1', { force: true });
  domain.installContent({ ...domain.contentWire(domain.CONTENT), version: domain.CONTENT.version + 1 });
  const fresh = store.getState().selectChapter('chapter-1');
  expect(store.getState().chapterMaps).toEqual([]);
  await fresh;
  const maps = store.getState().chapterMaps;
  pending.resolve(reply);
  await old;
  expect(store.getState().chapterMaps).toBe(maps);
  expect(maps[0].contentVersion).toBe(domain.CONTENT.version);
});

it.each([false, true])('does not overwrite the selected chapter with a late response, reject=%s', async reject => {
  unlockChapters();
  const pending = deferred<ReturnType<typeof response>>();
  jest.mocked(api.fetchChapterMaps).mockReturnValueOnce(pending.promise);
  const old = store.getState().selectChapter('chapter-1');
  // Attach a rejection handler before resolving the other chapter.
  const outcome = old.catch(() => undefined);
  await store.getState().selectChapter('chapter-2');
  const maps = store.getState().chapterMaps;
  if (reject) pending.reject(new api.GameApiError('INVALID_RESPONSE'));
  else pending.resolve(response());
  await outcome;
  expect(store.getState().chapterId).toBe('chapter-2');
  expect(store.getState().chapterMaps).toBe(maps);
  expect(store.getState().chapterError).toBe('');
  expect(store.getState().chapterLoading).toBe(false);
});

it('does not block starting a level while maps refresh', async () => {
  await store.getState().selectChapter('chapter-1');
  const pending = deferred<ReturnType<typeof response>>();
  jest.mocked(api.fetchChapterMaps).mockReturnValueOnce(pending.promise);
  const refresh = store.getState().selectChapter('chapter-1', { force: true });
  jest.mocked(api.startRun).mockImplementation(async (_session, input) => {
    const map = structuredClone(require('../../../../content/game-maps.json')[0]);
    return { session: session.getCurrentSession()!, value: { config: domain.contentWire(domain.CONTENT), run: {
      runId: input.runId, configVersion: domain.CONTENT.version, mapVersion: map.mapVersion, map,
      seed: 123456, assistReduction: 0, attempt: 1, totalExp: 0, loadout: store.getState().save.profile.loadout,
    } } };
  });
  // Starting the run must complete before the maps request is resolved.
  expect(await store.getState().startLevel(1)).toBe(true);
  expect(api.startRun).toHaveBeenCalledTimes(1);
  expect(store.getState().save.active?.levelId).toBe(1);
  pending.resolve(response());
  await refresh;
});
