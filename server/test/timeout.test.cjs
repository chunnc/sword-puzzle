const { test } = require('node:test');
const assert = require('node:assert/strict');
const { API_TIMEOUT_MS, isTimeoutError } = require('../lib/timeout');

process.env.GCLOUD_PROJECT = 'demo-kiem-khai';
process.env.ADMOB_REWARDED_AD_UNITS = 'test-unit';
const { app, gameApi } = require('../lib/index');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const admob = require('../lib/domain/admob');
const httpFetch = global.fetch;

async function request(path, options = {}) {
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const response = await httpFetch(`http://127.0.0.1:${server.address().port}${path}`, options);
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('all routes share the 10-second Firebase function deadline', () => {
  assert.equal(API_TIMEOUT_MS, 10_000);
  assert.equal(gameApi.__endpoint.timeoutSeconds, 10);
});

test('recognizes fetch, Firebase Admin and Firestore timeouts without classifying ordinary errors', () => {
  for (const error of [new DOMException('deadline', 'TimeoutError'), { name: 'AbortError' },
    { code: 4 }, { code: 'DEADLINE_EXCEEDED' }, { code: 'deadline-exceeded' },
    { code: 'ETIMEDOUT' }, { code: 'app/network-timeout' }]) assert.equal(isTimeoutError(error), true);
  for (const error of [undefined, null, new Error('timeout'), { code: 'auth/id-token-expired' },
    { code: 'auth/invalid-credential' }, { code: 7 }]) assert.equal(isTimeoutError(error), false);
});

test('returns JSON 504 for a Firestore deadline', async t => {
  t.mock.method(getFirestore(), 'collection', () => ({ doc: () => ({ get: async () => { throw { code: 4 }; } }) }));
  assert.deepEqual(await request('/v2/bootstrap'), { status: 504, body: { error: 'TIMEOUT' } });
});

test('token verification timeouts remain connection errors instead of invalid sessions', async t => {
  t.mock.method(getAuth(), 'verifyIdToken', async () => { throw { code: 'app/network-timeout' }; });
  assert.deepEqual(await request('/v2/profile', { headers: { authorization: 'Bearer test' } }),
    { status: 504, body: { error: 'TIMEOUT' } });
});

test('AdMob key fetch timeouts remain connection errors instead of invalid callbacks', async t => {
  t.mock.method(admob, 'verifyAdmobCallback', async () => { throw new DOMException('deadline', 'TimeoutError'); });
  assert.deepEqual(await request('/v1/ads/admob-ssv'), { status: 504, body: { error: 'TIMEOUT' } });
});

test('Auth REST uses the shared default and maps upstream timeout to JSON 504', async t => {
  const timeout = AbortSignal.timeout;
  const durations = [];
  t.mock.method(AbortSignal, 'timeout', duration => { durations.push(duration); return timeout(duration); });
  t.mock.method(global, 'fetch', async () => { throw new DOMException('deadline', 'TimeoutError'); });
  assert.deepEqual(await request('/v2/auth/refresh', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: 'test' }),
  }), { status: 504, body: { error: 'TIMEOUT' } });
  assert.deepEqual(durations, [10_000]);
});

test('AdMob keeps its shorter five-second key deadline', async t => {
  const timeout = AbortSignal.timeout;
  const durations = [];
  t.mock.method(AbortSignal, 'timeout', duration => { durations.push(duration); return timeout(duration); });
  t.mock.method(global, 'fetch', async () => { throw new DOMException('deadline', 'TimeoutError'); });
  assert.deepEqual(await request('/v1/ads/admob-ssv?ad_unit=test-unit&signature=dummy&key_id=42'),
    { status: 504, body: { error: 'TIMEOUT' } });
  assert.deepEqual(durations, [5000]);
});

test('upstream HTTP 504 responses remain timeouts without requiring a JSON body', async t => {
  t.mock.method(global, 'fetch', async () => ({ status: 504 }));
  assert.deepEqual(await request('/v2/auth/refresh', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: 'test' }),
  }), { status: 504, body: { error: 'TIMEOUT' } });
  assert.deepEqual(await request('/v1/ads/admob-ssv?ad_unit=test-unit&signature=dummy&key_id=42'),
    { status: 504, body: { error: 'TIMEOUT' } });
});

test('an uncertain registration update keeps its reservation and returns JSON 504', async t => {
  const installationId = 'a'.repeat(32), secret = 'b'.repeat(64);
  const operationId = 'register_timeout1';
  const installation = {
    secretHash: require('node:crypto').createHash('sha256').update(secret).digest('hex'),
    playerUid: 'guest', bindingVersion: 1, status: 'active', isGuest: true, authValidAfter: 0,
  };
  const writes = [];
  const tx = {
    get: async ref => ({ data: () => ref.kind === 'installations' ? installation : undefined }),
    set: (ref, value) => writes.push({ kind: ref.kind, value }),
  };
  t.mock.method(getFirestore(), 'collection', kind => ({ doc: () => ({ kind, get: () => tx.get({ kind }) }) }));
  const transactions = t.mock.method(getFirestore(), 'runTransaction', work => work(tx));
  t.mock.method(getAuth(), 'getUser', async () => ({ uid: 'guest' }));
  t.mock.method(getAuth(), 'updateUser', async () => { throw { code: 'app/network-timeout' }; });
  assert.deepEqual(await request('/v2/auth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      installationId, secret, operationId, expectedBindingVersion: 1, email: 'player@example.test', password: 'password-123',
    }),
  }), { status: 504, body: { error: 'TIMEOUT' } });
  assert.equal(transactions.mock.callCount(), 2);
  assert.equal(writes.find(write => write.kind === 'installations').value.registration.id, operationId);
});

test('invalid sessions and callbacks keep their existing HTTP errors', async t => {
  t.mock.method(getAuth(), 'verifyIdToken', async () => { throw { code: 'auth/id-token-expired' }; });
  assert.deepEqual(await request('/v2/profile', { headers: { authorization: 'Bearer test' } }),
    { status: 401, body: { error: 'INVALID_SESSION' } });
  assert.deepEqual(await request('/v1/ads/admob-ssv'), { status: 400, body: { error: 'INVALID_CALLBACK' } });
});
