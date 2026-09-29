const test = require('node:test');
const assert = require('node:assert/strict');

const base = process.env.API_BASE_URL;
if (base && !/^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(base))
  throw new Error('Integration tests only run against local emulators.');

async function request(path, method = 'GET', body, token) {
  const response = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json();
  return { status: response.status, data };
}

test('guest progress survives registration and login across devices', { skip: !base }, async () => {
  const guest = await request('/v1/auth/guest', 'POST', {});
  assert.equal(guest.status, 200);
  const upload = await request('/v1/progress', 'PUT',
    { levels: [{ levelId: 1, stars: 2 }, { levelId: 2, stars: 1 }] }, guest.data.idToken);
  assert.equal(upload.status, 200);
  const email = `player-${Date.now()}@example.test`;
  const password = 'a-long-test-password';
  const registered = await request('/v1/auth/register', 'POST', { email, password }, guest.data.idToken);
  assert.equal(registered.status, 200);
  assert.equal(registered.data.uid, guest.data.uid);
  const login = await request('/v1/auth/login', 'POST', { email, password });
  assert.equal(login.status, 200);
  const refreshed = await request('/v1/auth/refresh', 'POST', { refreshToken: login.data.refreshToken });
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.data.uid, login.data.uid);
  const progress = await request('/v1/progress', 'GET', undefined, login.data.idToken);
  assert.equal(progress.status, 200);
  assert.deepEqual(progress.data.levels, [{ levelId: 1, stars: 2 }, { levelId: 2, stars: 1 }]);
  const direct = await fetch(`http://127.0.0.1:8080/v1/projects/demo-kiem-khai/databases/(default)/documents/players/${login.data.uid}`,
    { headers: { authorization: `Bearer ${login.data.idToken}` } });
  assert.equal(direct.status, 403);
});

test('existing account merges guest stars idempotently', { skip: !base }, async () => {
  const email = `merge-${Date.now()}@example.test`;
  const password = 'a-long-test-password';
  const account = await request('/v1/auth/register', 'POST', { email, password });
  assert.equal(account.status, 200);
  const accountProgress = await request('/v1/progress', 'PUT',
    { levels: [{ levelId: 1, stars: 1 }] }, account.data.idToken);
  assert.equal(accountProgress.status, 200);

  const guest = await request('/v1/auth/guest', 'POST', {});
  assert.equal(guest.status, 200);
  const guestProgress = await request('/v1/progress', 'PUT',
    { levels: [{ levelId: 1, stars: 3 }, { levelId: 2, stars: 2 }] }, guest.data.idToken);
  assert.equal(guestProgress.status, 200);
  const merged = await request('/v1/auth/login', 'POST', { email, password }, guest.data.idToken);
  assert.equal(merged.status, 200);
  const repeated = await request('/v1/auth/login', 'POST', { email, password }, guest.data.idToken);
  assert.equal(repeated.status, 200);
  const lower = await request('/v1/progress', 'PUT',
    { levels: [{ levelId: 1, stars: 1 }] }, merged.data.idToken);
  assert.equal(lower.status, 200);
  assert.deepEqual(lower.data.levels, [{ levelId: 1, stars: 3 }, { levelId: 2, stars: 2 }]);
});
