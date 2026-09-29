const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeProgress, parseLevelResults, progressResponse } = require('../lib/domain/progress');

test('offline and server progress merge by highest stars', () => {
  const local = parseLevelResults([{ levelId: 1, stars: 3 }, { levelId: 2, stars: 1 }]);
  const remote = parseLevelResults([{ levelId: 1, stars: 1 }, { levelId: 2, stars: 2 }, { levelId: 3, stars: 1 }]);
  const merged = mergeProgress(local, remote);
  assert.deepEqual(progressResponse(merged).levels, [
    { levelId: 1, stars: 3 }, { levelId: 2, stars: 2 }, { levelId: 3, stars: 1 }
  ]);
  assert.equal(merged.highestUnlocked, 4);
});

test('realm derives from contiguous chapter completion', () => {
  const twenty = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [String(i + 1), 1]));
  assert.equal(mergeProgress({}, twenty).realm, 'TrucCo');
  assert.equal(mergeProgress(twenty, {}).highestUnlocked, 21);
});

test('reject duplicate, invalid and skipped levels', () => {
  assert.throws(() => parseLevelResults([{ levelId: 1, stars: 1 }, { levelId: 1, stars: 2 }]));
  assert.throws(() => parseLevelResults([{ levelId: 61, stars: 1 }]));
  assert.throws(() => mergeProgress({}, { '1': 1, '3': 1 }), /PROGRESS_GAP/);
});
