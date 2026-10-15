const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../lib/domain/game');
const { processOperations, profileFromDocument } = require('../lib/domain/profile');
const { completeRun, emptyMapStats } = require('../lib/domain/runs');
const config = require('../../content/game-config.json');
const rawMap = require('../../content/game-maps.json')[0];

function fixture() {
  const content = game.validateContent({ ...config, levelCount: 10, levelBaseExp: Array(10).fill(100), chapters: [{ ...config.chapters[0], lastLevelId: 10 }] });
  content.levels = Array.from({ length: 10 }, (_, i) => game.mapToLevel(game.validateMap({ ...rawMap, id: i + 1, orderInChapter: i + 1 }, content), 123, 0, content));
  game.installContent(config);
  return content;
}
function win(content, profile, levelId, stars, id = `reward_win_${levelId}_${stars}`) {
  return processOperations(profile, [{ id, kind: 'win', levelId, stars, objectiveProgress: { main: content.levels[levelId - 1].objectives[0].target } }], new Map(), content);
}

test('new profiles start empty, and future reward milestones need no published maps', () => {
  const c = game.installContent(config), p = game.emptyProfile();
  assert.equal(c.levelCount, config.levelCount);
  assert.deepEqual(c.milestoneRewards.map(r => r.levelId), [3, 5, 8, 10]);
  assert.deepEqual(p.ownedSwords, []); assert.deepEqual(p.ownedSkills, []);
  assert.deepEqual(p.loadout, { sword: null, skills: [] });
  assert.ok(game.validLoadout(p.loadout, p, c));
});

test('normalization removes retired starters without a marker and backfills eligible rewards', () => {
  const c = fixture(), now = Date.now();
  const old = { ...game.emptyProfile(), coins: 876, totalExp: 432, levels: Array.from({ length: 8 }, (_, i) => ({ levelId: i + 1, stars: 3 })), ownedSwords: ['thanh-phong', 'trong-nhac'], ownedSkills: ['nhat-kiem', 'ngu-kiem'], loadout: { sword: 'thanh-phong', skills: ['nhat-kiem', 'ngu-kiem'] } };
  const p = profileFromDocument({ profileV2: old }, c, now);
  assert.equal(p.coins, 876); assert.equal(p.totalExp, 432);
  assert.deepEqual(p.ownedSwords, ['trong-nhac', 'co-ban']);
  assert.deepEqual(p.ownedSkills, ['ngu-kiem', 'thu', 'thieu']);
  assert.equal(p.loadout.sword, 'co-ban');
  assert.deepEqual(p.loadout.skills, ['ngu-kiem']);
  assert.equal(Object.hasOwn(p, 'startingLoadoutVersion'), false);
  assert.deepEqual(profileFromDocument({ profileV2: p }, c, now), p);
  const reinjected = { ...p, ownedSwords: [...p.ownedSwords, 'thanh-phong'], ownedSkills: [...p.ownedSkills, 'nhat-kiem'] };
  assert.deepEqual(profileFromDocument({ profileV2: reinjected }, c, now), p);
});

test('three-star milestones award once on improvement, and a receipt retry returns the same reward', () => {
  const c = fixture(); let p = game.emptyProfile();
  for (let id = 1; id <= 10; id++) {
    const low = win(c, p, id, 2); p = low.profile;
    assert.deepEqual(low.rewards[0].itemsGranted, []);
  }
  for (const rule of c.milestoneRewards) {
    const r = win(c, p, rule.levelId, 3); p = r.profile;
    assert.deepEqual(r.rewards[0].itemsGranted, [{ category: rule.category, itemId: rule.itemId }]);
    const retry = processOperations(p, [{ id: `reward_win_${rule.levelId}_3`, kind: 'win', levelId: rule.levelId, stars: 3, objectiveProgress: { main: c.levels[rule.levelId - 1].objectives[0].target } }], r.newReceipts, c);
    assert.deepEqual(retry.profile, p); assert.deepEqual(retry.rewards, r.rewards);
    const replay = win(c, p, rule.levelId, 3, `new_replay_${rule.levelId}`);
    assert.deepEqual(replay.rewards[0].itemsGranted, []);
  }
  assert.deepEqual(p.loadout, { sword: 'co-ban', skills: ['thu'] });
  assert.deepEqual(game.learnedPassives(p, c), ['thieu', 'van']);
});

test('rewards do not replace existing equipment or require preceding milestone rewards', () => {
  const c = fixture(), p = game.emptyProfile();
  p.levels = Array.from({ length: 10 }, (_, i) => ({ levelId: i + 1, stars: i === 9 ? 3 : 1 }));
  p.ownedSwords = ['trong-nhac']; p.ownedSkills = ['ngu-kiem']; p.loadout = { sword: 'trong-nhac', skills: ['ngu-kiem'] };
  game.grantMilestones(p, c);
  assert.deepEqual(p.ownedSkills, ['ngu-kiem', 'van']);
  assert.deepEqual(p.loadout, { sword: 'trong-nhac', skills: ['ngu-kiem'] });
  assert.equal(game.highestUnlocked(p.levels, c), 10);
});

test('milestone and retired items cannot be purchased, and passive forms cannot be equipped', () => {
  const c = fixture(), p = game.emptyProfile();
  p.coins = 9999; p.totalExp = 2000;
  p.levels = Array.from({ length: 10 }, (_, i) => ({ levelId: i + 1, stars: 3 }));
  game.grantMilestones(p, c);
  for (const [category, itemId] of [['sword','co-ban'], ['sword','thanh-phong'], ['skill','nhat-kiem'], ['skill','thu'], ['skill','thieu'], ['skill','van']]) {
    assert.equal(game.applyOperation(p, { kind: 'purchase', id: 'purchase_test', category, itemId }, c).error, 'ITEM_NOT_FOR_SALE');
  }
  assert.equal(game.validLoadout({ sword: null, skills: ['thieu'] }, p, c), null);
  assert.ok(game.parseOperation({ kind: 'equip', id: 'empty_equip', loadout: { sword: null, skills: [] } }, c));
});

test('run completion includes the item reward and computes stars from the pinned map', () => {
  const c = fixture(), p = game.emptyProfile();
  p.levels = [{ levelId: 1, stars: 1 }, { levelId: 2, stars: 1 }];
  const map = c.levels[2].mapDefinition;
  const run = { runId: 'milestone_run_3', map, seed: 123, assistReduction: 0, attempt: 1, loadout: p.loadout, totalExp: 0 };
  const r = completeRun(run, { outcome: 'won', movesUsed: 1, objectiveProgress: { main: map.objectives[0].target }, extraMovesUsed: false }, emptyMapStats(), p, c, c, 10);
  assert.equal(r.receipt.stars, 3);
  assert.deepEqual(r.receipt.reward.itemsGranted, [{ category: 'sword', itemId: 'co-ban' }]);
});

test('profile merging backfills rewards without duplicates or equipping passives', () => {
  const c = fixture(), a = game.emptyProfile(), b = game.emptyProfile();
  a.levels = Array.from({ length: 10 }, (_, i) => ({ levelId: i + 1, stars: 3 }));
  const p = game.mergeProfiles(a, b, c);
  assert.deepEqual(p.ownedSwords, ['co-ban']);
  assert.deepEqual(p.ownedSkills, ['thu', 'thieu', 'van']);
  assert.deepEqual(p.loadout.skills, ['thu']);
  assert.deepEqual(game.grantMilestones(p, c), []);
});
