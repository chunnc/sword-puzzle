import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retirementChanges, hasRetirementChanges, retirePlayer } from './retired_starters.mjs';

const fixture = () => ({ profileV2: {
  ownedSwords: ['thanh-phong', 'trong-nhac'], ownedSkills: ['nhat-kiem', 'ngu-kiem'],
  loadout: { sword: 'thanh-phong', skills: ['nhat-kiem', 'ngu-kiem'] },
  coins: 876, totalExp: 432, levels: [{ levelId: 99, stars: 3 }], revision: 7,
  rewardCredits: { 99: { exp: 100, starBonus: 50 } }
}, stars: { 99: 3 }, highestUnlocked: 100, mergedInto: 'kept' });
const deleted = Symbol('deleted');
const fields = { increment: n => ({ increment: n }), delete: () => deleted };
function applyPatch(document, patch) {
  for (const [key, value] of Object.entries(patch)) {
    const parts = key.split('.'); let target = document;
    for (const part of parts.slice(0, -1)) target = target[part] ??= {};
    const leaf = parts.at(-1);
    if (value === deleted) delete target[leaf];
    else if (value && typeof value === 'object' && 'increment' in value) target[leaf] = (target[leaf] ?? 0) + value.increment;
    else target[leaf] = structuredClone(value);
  }
}
function database(document, concurrentChange) {
  let state = structuredClone(document), writes = 0;
  return {
    state: () => state, writes: () => writes,
    async runTransaction(fn) {
      let patch;
      const tx = { get: async () => ({ exists: state !== null, data: () => structuredClone(state) }), update: (_ref, update) => { patch = update; } };
      if (concurrentChange) {
        await fn(tx); concurrentChange(state); concurrentChange = null; patch = undefined;
      }
      const result = await fn(tx);
      if (patch) { applyPatch(state, patch); writes++; }
      return result;
    }
  };
}

test('cleanup touches only retired ownership/equipment fields and leaves input unchanged', () => {
  const data = fixture(), before = structuredClone(data);
  const { updates, deletes } = retirementChanges(data);
  assert.deepEqual(updates, {
    'profileV2.ownedSwords': ['trong-nhac'], 'profileV2.ownedSkills': ['ngu-kiem'],
    'profileV2.loadout.sword': null, 'profileV2.loadout.skills': ['ngu-kiem']
  });
  assert.deepEqual(deletes, []); assert.deepEqual(data, before);
});

test('transactions preserve wallet/progress and rerunning is a no-op', async () => {
  const db = database(fixture()), before = fixture();
  assert.equal(await retirePlayer(db, {}, fields, () => 123), true);
  assert.equal(await retirePlayer(db, {}, fields, () => 456), false);
  assert.equal(db.writes(), 1); assert.equal(db.state().profileV2.revision, 8); assert.equal(db.state().updatedAt, 123);
  for (const key of ['coins','totalExp','levels','rewardCredits']) assert.deepEqual(db.state().profileV2[key], before.profileV2[key]);
  assert.deepEqual(db.state().stars, before.stars); assert.equal(db.state().mergedInto, before.mergedInto);
});

test('missing profiles and absent fields need no writes', async () => {
  for (const data of [null, {}, { profileV2: {} }, { profileV2: { ownedSwords: [], ownedSkills: [], loadout: { sword: null, skills: [] } } }]) {
    const db = database(data);
    assert.equal(await retirePlayer(db, {}, fields), false); assert.equal(db.writes(), 0);
  }
});

test('obsolete marker is deleted without adding any replacement marker', async () => {
  const db = database({ profileV2: { startingLoadoutVersion: 1, revision: 4 } });
  assert.equal(await retirePlayer(db, {}, fields, () => 123), true);
  assert.deepEqual(db.state(), { profileV2: { revision: 5 }, updatedAt: 123 });
  assert.equal(hasRetirementChanges(retirementChanges(db.state())), false);
});

test('retry re-reads concurrent purchases and equipment rather than overwriting them', async () => {
  const db = database(fixture(), current => {
    current.profileV2.ownedSwords.push('hoa-van');
    current.profileV2.ownedSkills.push('hoa-lien');
    current.profileV2.loadout = { sword: 'hoa-van', skills: ['hoa-lien', 'ngu-kiem'] };
    current.profileV2.revision++;
  });
  assert.equal(await retirePlayer(db, {}, fields), true);
  assert.deepEqual(db.state().profileV2.ownedSwords, ['trong-nhac','hoa-van']);
  assert.deepEqual(db.state().profileV2.ownedSkills, ['ngu-kiem','hoa-lien']);
  assert.deepEqual(db.state().profileV2.loadout, { sword: 'hoa-van', skills: ['hoa-lien','ngu-kiem'] });
  assert.equal(db.state().profileV2.revision, 9);
});
