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
it.each([
  ['health', () => api.checkHealth()],
  ['bootstrap', () => api.fetchBootstrap()],
  ['content', () => api.fetchContent(3)],
  ['profile', () => api.fetchProfile(initial)],
  ['sync', () => api.syncProfile(initial, [], 3)],
  ['refresh', () => api.refreshSession(initial.refreshToken)],
  ['device session', () => api.deviceSession(initial)],
  ['create ad intent', () => api.createAdIntent(initial, 1)],
  ['check ad intent', () => api.checkAdIntent(initial, 'intent')],
] as const)('reports %s timeout at 12 seconds without retrying', async (_name, call) => {
  jest.useFakeTimers();
  const handler = jest.fn();
  api.setConnectionErrorHandler(handler);
  fetchMock.mockImplementation(() => new Promise(() => undefined));
  const result = expect(call()).rejects.toMatchObject({ code: 'TIMEOUT' });
  await jest.advanceTimersByTimeAsync(11_999);
  expect(handler).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(1);
  await result;
  expect(handler).toHaveBeenCalledTimes(1);
  expect(handler).toHaveBeenCalledWith(expect.objectContaining({ code: 'TIMEOUT' }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});
it('times out while reading a successful response body', async () => {
  jest.useFakeTimers();
  const handler = jest.fn();
  api.setConnectionErrorHandler(handler);
  fetchMock.mockResolvedValue({ ok: true, status: 200, text: () => new Promise(() => undefined) });
  const result = expect(api.fetchBootstrap()).rejects.toMatchObject({ code: 'TIMEOUT' });
  await jest.advanceTimersByTimeAsync(12_000);
  await result;
  expect(handler).toHaveBeenCalledTimes(1);
});
it.each(['{"error":"TIMEOUT"}', 'Gateway timeout', ''])('normalizes HTTP 504 with body %s', async (body) => {
  const handler = jest.fn();
  api.setConnectionErrorHandler(handler);
  fetchMock.mockResolvedValue({ ok: false, status: 504, text: async () => body });
  await expect(api.fetchBootstrap()).rejects.toMatchObject({ code: 'TIMEOUT', status: 504 });
  expect(handler).toHaveBeenCalledTimes(1);
});
it.each(['login', 'register', 'logout'] as const)('reports %s timeout before identity reconciliation completes', async (kind) => {
  const handler = jest.fn();
  api.setConnectionErrorHandler(handler);
  let finish!: (value: unknown) => void;
  fetchMock.mockResolvedValueOnce(response({ error: 'TIMEOUT' }, 504))
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = kind === 'logout' ? api.logoutAccount(initial)
    : kind === 'login' ? api.loginAccount('player@example.test', 'password-123', initial)
    : api.registerAccount('player@example.test', 'password-123', initial);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(handler).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[1][0]).toContain('/v2/auth/device-session');
  finish(response({ ...updated, bindingVersion: 2, isGuest: kind === 'logout', email: 'player@example.test' }));
  await expect(pending).resolves.toMatchObject({ bindingVersion: 2 });
  expect(handler).toHaveBeenCalledTimes(1);
});
it('notifies network errors but leaves business errors to the caller', async () => {
  const handler = jest.fn();
  api.setConnectionErrorHandler(handler);
  fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'))
    .mockResolvedValueOnce(response({ error: 'INSUFFICIENT_COINS' }, 400));
  await expect(api.fetchBootstrap()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  await expect(api.fetchBootstrap()).rejects.toMatchObject({ code: 'INSUFFICIENT_COINS' });
  expect(handler).toHaveBeenCalledTimes(1);
});
it('clears the deadline after success and does not report a later timeout', async () => {
  jest.useFakeTimers();
  const handler = jest.fn();
  api.setConnectionErrorHandler(handler);
  fetchMock.mockResolvedValue(response({ ok: true }));
  await api.checkHealth();
  expect(fetchMock.mock.calls[0][1].cache).toBe('no-store');
  await jest.advanceTimersByTimeAsync(12_000);
  expect(handler).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
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
