const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, createSign } = require('node:crypto');
const { verifyAdmobCallback } = require('../lib/domain/admob');

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const keys = async () => [{ keyId: 42, pem: publicKey.export({ type: 'spki', format: 'pem' }) }];
const query = `ad_unit=test-unit&custom_data=intent-1&reward_amount=3&reward_item=moves&timestamp=${Date.now()}&transaction_id=txn-1`;
function sign(content) {
  const signer = createSign('SHA256');
  signer.update(content); signer.end();
  return signer.sign(privateKey).toString('base64url');
}

test('valid callback preserves raw query ordering during ECDSA verification', async () => {
  const url = `/v1/ads/admob-ssv?${query}&signature=${sign(query)}&key_id=42`;
  const result = await verifyAdmobCallback(url, ['test-unit'], keys);
  assert.equal(result.intentId, 'intent-1');
  assert.equal(result.transactionId, 'txn-1');
});

test('tampered callback is rejected', async () => {
  const url = `/v1/ads/admob-ssv?${query.replace('moves', 'gems')}&signature=${sign(query)}&key_id=42`;
  await assert.rejects(verifyAdmobCallback(url, ['test-unit'], keys), /BAD_SIGNATURE/);
});

test('unknown key id refreshes cached public keys once', async () => {
  const url = `/v1/ads/admob-ssv?${query}&signature=${sign(query)}&key_id=42`;
  const calls = [];
  const result = await verifyAdmobCallback(url, ['test-unit'], async force => {
    calls.push(Boolean(force));
    return force ? await keys() : [];
  });
  assert.equal(result.intentId, 'intent-1');
  assert.deepEqual(calls, [false, true]);
});
