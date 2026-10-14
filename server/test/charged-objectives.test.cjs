const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../lib/domain/game');
const runs = require('../lib/domain/runs');
const content = game.validateContent(require('../../content/game-config.json'));
const source = require('../../content/game-maps.json')[0];

test('server preserves general and exact-tier objectives in documents, summaries and reports', () => {
  const objectives = [undefined, 4, 5].map((chargeTier, index) => ({ id: `goal-${index}`, type: 'Collect',
    tileKind: content.normalTileIds[0], target: index + 1, ...(chargeTier ? { chargeTier } : {}) }));
  const map = game.validateMap({ ...source, objectives }, content);
  assert.deepEqual(game.mapFromDocument(game.mapToDocument(map), content).objectives, objectives);
  assert.deepEqual(game.mapSummary(map).objectives, objectives);
  const report = { outcome: 'won', movesUsed: 2, extraMovesUsed: false,
    objectiveProgress: { 'goal-0': 1, 'goal-1': 2, 'goal-2': 3 } };
  assert.deepEqual(runs.parseRunReport(report, map), report);
  assert.throws(() => runs.parseRunReport({ ...report, objectiveProgress: { ...report.objectiveProgress, 'goal-2': 2 } }, map));
});

test('server rejects invalid tier filters while accepting unchanged legacy objectives', () => {
  assert.doesNotThrow(() => game.validateMap(source, content));
  for (const chargeTier of [0, 3, 6, -1, 4.5, '4', null]) {
    const objectives = [{ id: 'tier', type: 'Collect', tileKind: content.normalTileIds[0], target: 1, chargeTier }];
    assert.throws(() => game.validateMap({ ...source, objectives }, content), /INVALID_MAP/);
  }
});
