const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeProgress, parseLevelResults, parseStoredStars, progressResponse } = require('../lib/domain/progress');

test('offline and server progress merge by highest stars', () => {
  const local = parseLevelResults([{ levelId: 1, stars: 3 }, { levelId: 2, stars: 1 }]);
  const remote = parseLevelResults([{ levelId: 1, stars: 1 }, { levelId: 2, stars: 2 }, { levelId: 3, stars: 1 }]);
  const merged = mergeProgress(local, remote);
  assert.deepEqual(progressResponse(merged).levels, [
    { levelId: 1, stars: 3 }, { levelId: 2, stars: 2 }, { levelId: 3, stars: 1 }
  ]);
  assert.equal(merged.highestUnlocked, 3);
});

test('realm derives from completion of the third test level', () => {
  const three = { '1': 1, '2': 1, '3': 1 };
  assert.equal(mergeProgress({}, three).realm, 'TrucCo');
  assert.equal(mergeProgress(three, {}).highestUnlocked, 3);
  assert.deepEqual(parseStoredStars({ ...three, '4': 2, '60': 3 }), three);
});

test('reject duplicate, invalid and skipped levels', () => {
  assert.throws(() => parseLevelResults([{ levelId: 1, stars: 1 }, { levelId: 1, stars: 2 }]));
  assert.throws(() => parseLevelResults([{ levelId: 4, stars: 1 }]));
  assert.throws(() => mergeProgress({}, { '1': 1, '3': 1 }), /PROGRESS_GAP/);
});
