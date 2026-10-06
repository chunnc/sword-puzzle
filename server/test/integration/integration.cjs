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

test('v2 zero-star results, EXP upgrades, purchases and retries survive the real API', {skip:!base},async()=>{
 const guest=await request('/v1/auth/guest','POST',{});assert.equal(guest.status,200);const token=guest.data.idToken;
 const bootstrap=await request('/v2/bootstrap');assert.equal(bootstrap.data.contentVersion,2);assert.equal(bootstrap.data.levelCount,40);
 const ops=[{id:'integration_zero_001',kind:'win',levelId:1,stars:0}];
 let sync=await request('/v2/profile/sync','POST',{contentVersion:2,operations:ops},token);
 assert.equal(sync.status,200);assert.equal(sync.data.profile.totalExp,30);assert.equal(sync.data.profile.coins,100);assert.deepEqual(sync.data.profile.levels,[{levelId:1,stars:0}]);
 const retry=await request('/v2/profile/sync','POST',{contentVersion:2,operations:ops},token);assert.equal(retry.data.profile.coins,100);
 sync=await request('/v2/profile/sync','POST',{contentVersion:2,operations:[{id:'integration_up_001',kind:'win',levelId:1,stars:3},{id:'integration_win002',kind:'win',levelId:2,stars:3},{id:'integration_win003',kind:'win',levelId:3,stars:3},{id:'integration_buy001',kind:'purchase',category:'skill',itemId:'ngu-kiem'}]},token);
 assert.equal(sync.status,200);assert.equal(sync.data.profile.totalExp,300);assert.equal(sync.data.profile.coins,310);assert.ok(sync.data.profile.ownedSkills.includes('ngu-kiem'));
 const double=await request('/v2/profile/sync','POST',{contentVersion:2,operations:[{id:'integration_buy002',kind:'purchase',category:'skill',itemId:'ngu-kiem'}]},token);assert.equal(double.data.profile.coins,310);assert.equal(double.data.rejected[0].reason,'ALREADY_OWNED');
 const invalid=await request('/v2/profile/sync','POST',{contentVersion:2,operations:[{id:'integration_skip01',kind:'win',levelId:6,stars:3}]},token);assert.equal(invalid.data.rejected[0].reason,'LEVEL_LOCKED');
});

test('v2 competing device purchases cannot overdraw the wallet', {skip:!base},async()=>{
 const guest=await request('/v1/auth/guest','POST',{}),token=guest.data.idToken;
 const operations=Array.from({length:8},(_,i)=>({id:`compete_win_${i+1}`,kind:'win',levelId:i+1,stars:0}));
 operations.push({id:'compete_buy_001',kind:'purchase',category:'sword',itemId:'trong-nhac'},{id:'compete_buy_002',kind:'purchase',category:'sword',itemId:'hoa-van'},{id:'compete_buy_003',kind:'purchase',category:'skill',itemId:'ngu-kiem'});
 const initial=await request('/v2/profile/sync','POST',{contentVersion:2,operations},token);assert.equal(initial.data.profile.coins,250);
 const [a,b]=await Promise.all([
  request('/v2/profile/sync','POST',{contentVersion:2,operations:[{id:'compete_device_a',kind:'purchase',category:'skill',itemId:'hoa-lien'}]},token),
  request('/v2/profile/sync','POST',{contentVersion:2,operations:[{id:'compete_device_b',kind:'purchase',category:'skill',itemId:'dan-loi'}]},token)
 ]);
 assert.equal(a.data.acknowledged.length+b.data.acknowledged.length,1);assert.equal(a.data.rejected.length+b.data.rejected.length,1);
 const final=await request('/v2/profile','GET',undefined,token);assert.ok(final.data.coins>=0);assert.ok(final.data.coins<=50);
});

test('v2 guest merge moves the wallet once and merges EXP by highest stars', {skip:!base},async()=>{
 const email=`v2merge-${Date.now()}@example.test`,password='a-long-test-password';
 const account=await request('/v1/auth/register','POST',{email,password});
 await request('/v2/profile/sync','POST',{contentVersion:2,operations:[{id:'merge_account_win',kind:'win',levelId:1,stars:2}]},account.data.idToken);
 const guest=await request('/v1/auth/guest','POST',{});
 await request('/v2/profile/sync','POST',{contentVersion:2,operations:[{id:'merge_guest_win01',kind:'win',levelId:1,stars:3}]},guest.data.idToken);
 const merged=await request('/v1/auth/login','POST',{email,password},guest.data.idToken);assert.equal(merged.status,200);
 const first=await request('/v2/profile','GET',undefined,merged.data.idToken);assert.equal(first.data.totalExp,100);assert.equal(first.data.coins,275);
 await request('/v1/auth/login','POST',{email,password},guest.data.idToken);
 const second=await request('/v2/profile','GET',undefined,merged.data.idToken);assert.equal(second.data.coins,275);
});
