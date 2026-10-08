import type { SessionData } from '../session';
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined)
}));
const originalFetch = global.fetch;
const initial: SessionData = {
  uid: 'player',
  idToken: 'old',
  refreshToken: 'refresh-old',
  expiresIn: 3600,
  isGuest: true,
  installationId: "a".repeat(32),
  bindingVersion: 1
};
const updated: SessionData = {
  ...initial,
  idToken: 'new',
  refreshToken: 'refresh-new'
};
const response = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(data)
});
let api: typeof import('../api'), session: typeof import('../session'), fetchMock: jest.Mock;
beforeEach(async () => {
  jest.resetModules();
  process.env.EXPO_PUBLIC_GAME_API_URL = 'http://localhost:5001/game';
  api = require('../api');
  session = require('../session');
  require('expo-secure-store').getItemAsync.mockImplementation(async (key: string) => key === 'kiem-khai-installation' ? JSON.stringify({ installationId: initial.installationId, secret: 'b'.repeat(64) }) : null);
  await session.saveSession(initial);
  fetchMock = jest.fn();
  global.fetch = fetchMock;
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
});
it('refreshes any 401 and persists the rotated token before replay', async () => {
  fetchMock.mockResolvedValueOnce(response({
    error: 'ANY_AUTH_ERROR'
  }, 401)).mockResolvedValueOnce(response(updated)).mockResolvedValueOnce(response({
    coins: 42
  }));
  const result = await api.fetchProfile(initial);
  expect(result.profile).toEqual({
    coins: 42
  });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock.mock.calls[2][1].headers.get('Authorization')).toBe('Bearer new');
  expect(session.getCurrentSession()?.refreshToken).toBe('refresh-new');
});
it('deduplicates concurrent refreshes', async () => {
  let finish!: (r: unknown) => void;
  fetchMock.mockImplementation((url, options) => url.endsWith('/refresh') ? new Promise(resolve => {
    finish = resolve;
  }) : Promise.resolve(response(options.headers.get('Authorization') === 'Bearer old' ? {
    error: 'EXPIRED'
  } : {
    coins: 42
  }, options.headers.get('Authorization') === 'Bearer old' ? 401 : 200)));
  const a = api.fetchProfile(initial),
    b = api.fetchProfile(initial);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/refresh'))).toHaveLength(1);
  finish(response(updated));
  await Promise.all([a, b]);
  expect(session.getCurrentSession()?.idToken).toBe('new');
});
it('keeps the new token even when the replay fails', async () => {
  fetchMock.mockResolvedValueOnce(response({
    error: 'EXPIRED'
  }, 401)).mockResolvedValueOnce(response(updated)).mockResolvedValueOnce(response({
    error: 'SERVER_ERROR'
  }, 500));
  await expect(api.fetchProfile(initial)).rejects.toMatchObject({
    status: 500
  });
  expect(session.getCurrentSession()?.refreshToken).toBe('refresh-new');
  expect(require('expo-secure-store').setItemAsync).toHaveBeenLastCalledWith('kiem-khai-session', expect.stringContaining('refresh-new'));
});
it('does not loop when replay also returns 401', async () => {
  fetchMock.mockResolvedValueOnce(response({
    error: 'EXPIRED'
  }, 401)).mockResolvedValueOnce(response(updated)).mockResolvedValueOnce(response({
    error: 'INVALID_SESSION'
  }, 401));
  await expect(api.fetchProfile(initial)).rejects.toMatchObject({
    status: 401
  });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
it('does not refresh based on an error string without HTTP 401', async () => {
  fetchMock.mockResolvedValue(response({
    error: 'INVALID_SESSION'
  }, 400));
  await expect(api.fetchProfile(initial)).rejects.toMatchObject({
    status: 400
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('preserves the identity during a refresh network failure', async () => {
  fetchMock.mockResolvedValueOnce(response({
    error: 'EXPIRED'
  }, 401)).mockRejectedValueOnce(new Error('network'));
  await expect(api.fetchProfile(initial)).rejects.toMatchObject({
    code: 'NETWORK_ERROR'
  });
  expect(session.getCurrentSession()?.refreshToken).toBe('refresh-old');
});
it('does not resurrect the session after logout during refresh', async () => {
  let finish!: (r: unknown) => void;
  fetchMock.mockResolvedValueOnce(response({
    error: 'EXPIRED'
  }, 401)).mockImplementationOnce(() => new Promise(resolve => {
    finish = resolve;
  }));
  const pending = api.fetchProfile(initial);
  const failure = expect(pending).rejects.toThrow('SESSION_CHANGED');
  await new Promise(resolve => setTimeout(resolve, 0));
  await session.clearSession();
  finish(response(updated));
  await failure;
  expect(session.getCurrentSession()).toBeNull();
  expect(require('expo-secure-store').deleteItemAsync).toHaveBeenCalled();
});
it('rejects a late successful API response after account switch', async () => {
  let finish!: (r: unknown) => void;
  fetchMock.mockImplementation(() => new Promise(resolve => {
    finish = resolve;
  }));
  const pending = api.fetchProfile(initial);
  await session.saveSession({
    ...initial,
    uid: 'another'
  });
  finish(response({
    coins: 999
  }));
  await expect(pending).rejects.toMatchObject({
    code: 'SESSION_CHANGED'
  });
});
it('uses the installation key and an idempotent operation when linking credentials', async () => {
  fetchMock.mockResolvedValue(response({ ...updated, isGuest: false, bindingVersion: 2 }));
  const linked = await api.registerAccount('player@example.test', 'password-123', initial);
  expect(linked.isGuest).toBe(false);
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body.installationId).toBe(initial.installationId);
  expect(body.expectedBindingVersion).toBe(1);
  expect(body.operationId).toHaveLength(32);
  expect(fetchMock.mock.calls[0][1].headers.has('Authorization')).toBe(false);
});
it('recovers the same profile when refresh credentials are rejected', async () => {
  fetchMock.mockResolvedValueOnce(response({ error: 'INVALID_SESSION' }, 401))
    .mockResolvedValueOnce(response({ error: 'INVALID_SESSION' }, 401))
    .mockResolvedValueOnce(response(updated)).mockResolvedValueOnce(response({ coins: 42 }));
  expect((await api.fetchProfile(initial)).profile).toEqual({ coins: 42 });
  expect(fetchMock.mock.calls[2][0]).toContain('/v2/auth/device-session');
  expect(session.getCurrentSession()?.uid).toBe(initial.uid);
});
it('does not replace the session when device recovery is denied', async () => {
  fetchMock.mockResolvedValueOnce(response({ error: 'INVALID_SESSION' }, 401))
    .mockResolvedValueOnce(response({ error: 'INVALID_SESSION' }, 401))
    .mockResolvedValueOnce(response({ error: 'DEVICE_REVOKED' }, 403));
  await expect(api.fetchProfile(initial)).rejects.toMatchObject({ code: 'DEVICE_REVOKED' });
  expect(session.getCurrentSession()?.uid).toBe(initial.uid);
});
it('health timeout retries once before reporting failure', async () => {
  jest.useFakeTimers();
  fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => {
    const e = new Error('timeout');
    e.name = 'AbortError';
    reject(e);
  })));
  const pending = api.checkHealth();
  const result = expect(pending).rejects.toMatchObject({
    code: 'TIMEOUT'
  });
  await jest.advanceTimersByTimeAsync(2000);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(2000);
  await result;
});
it('a successful second health check avoids an error', async () => {
  jest.useFakeTimers();
  fetchMock.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => {
    const e = new Error('timeout');
    e.name = 'AbortError';
    reject(e);
  }))).mockResolvedValueOnce(response({
    ok: true
  }));
  const pending = api.checkHealth();
  await jest.advanceTimersByTimeAsync(2000);
  await pending;
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1][1].cache).toBe('no-store');
});
it('HTTP errors are not retried as timeouts', async () => {
  fetchMock.mockResolvedValue(response({
    error: 'UNAVAILABLE'
  }, 503));
  await expect(api.checkHealth()).rejects.toMatchObject({
    status: 503
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
