require('../lib/domain/game').installContent(require('../../content/game-config.json'));
const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeProgress, parseLevelResults, parseStoredStars, progressResponse } = require('../lib/domain/progress');

test('offline and server progress merge by highest stars', () => {
  const local = parseLevelResults([{ levelId: 1, stars: 3 }, { levelId: 2, stars: 1 }]);
  const remote = parseLevelResults([{ levelId: 1, stars: 1 }, { levelId: 2, stars: 2 }]);
  const merged = mergeProgress(local, remote);
  assert.deepEqual(progressResponse(merged).levels, [
    { levelId: 1, stars: 3 }, { levelId: 2, stars: 2 }
  ]);
  assert.equal(merged.highestUnlocked, 3);
});

test('realm derives from EXP rather than the third level', () => {
  const two = { '1': 1, '2': 1 };
  assert.equal(mergeProgress({}, two).realm, 'LuyenKhi');
  assert.equal(mergeProgress(two, {}).highestUnlocked, 3);
  assert.deepEqual(parseStoredStars({ ...two, '3': 2, '60': 3 }), { ...two, '3': 2 });
});

test('reject duplicate, invalid and skipped levels', () => {
  assert.throws(() => parseLevelResults([{ levelId: 1, stars: 1 }, { levelId: 1, stars: 2 }]));
  assert.throws(() => parseLevelResults([{ levelId: 41, stars: 1 }]));
  assert.throws(() => mergeProgress({}, { '1': 1, '3': 1 }), /PROGRESS_GAP/);
});
