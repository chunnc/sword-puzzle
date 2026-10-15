const test = require('node:test');
const assert = require('node:assert/strict');
const { validateContent, validateMap, contentWire } = require('./game-runtime.cjs');
const { readJSON, generateLayouts, addRockObstacles, addSealObstacles, shapeKey, hash, engineHash } = require('./map_generation.cjs');
const { parseRequest, prepareCatalog, mapTemplate } = require('./generate_map.cjs');
const { renderGeneratedMap } = require('./render_generated_map.cjs');
const { moveCutoffs, percentile, firstAttemptQuantile, targetChoices, convergeBudget, policyVariants, pressureVariants, pressureSelectable } = require('./generate_map_balance.cjs');

const config = validateContent(readJSON('content/game-config.json'));
const catalog = readJSON('content/game-maps.json').map(map => validateMap(map, config));
const rockId = config.tiles.find(tile => tile.key === 'rock').id;

test('collection CLI supports independent general, tier 4 and tier 5 objectives with fixed targets', () => {
  const request = parseRequest(['--difficulty', 'medium', '--objective', 'collect', '--tiles', 'sword,sword:4,sword:5',
    '--target', '15,2,1'], catalog.length + 1);
  const next = prepareCatalog(config, catalog, request);
  const shape = generateLayouts(24680, 1, catalog)[0];
  const map = mapTemplate(next, catalog, request, shape);
  const sword = config.tiles.find(tile => tile.key === 'sword').id;
  assert.deepEqual(map.objectives, [
    { id: 'collect-sword', type: 'Collect', tileKind: sword, target: 15 },
    { id: 'collect-sword-4', type: 'Collect', tileKind: sword, chargeTier: 4, target: 2 },
    { id: 'collect-sword-5', type: 'Collect', tileKind: sword, chargeTier: 5, target: 1 },
  ]);
  assert.deepEqual(validateMap(map, next), map);
  const shared = parseRequest(['--difficulty', 'easy', '--objective', 'collect', '--tiles', 'fire:4,lightning:5', '--target', '2'], catalog.length + 1);
  assert.deepEqual(mapTemplate(next, catalog, shared, shape).objectives.map(o => o.target), [2, 2]);
});

test('collection CLI rejects malformed tiers, duplicate kind/tier pairs and target mismatches', () => {
  const base = ['--difficulty', 'easy', '--objective', 'collect'];
  for (const value of ['sword:0', 'sword:3', 'sword:6', 'sword:4:5', 'fire:04', 'rock:4', 'sword:4,sword:4', 'sword,']) {
    assert.throws(() => parseRequest([...base, '--tiles', value], catalog.length + 1));
  }
  assert.throws(() => parseRequest([...base, '--tiles', 'sword:4,fire:5', '--target', '1,2,3'], catalog.length + 1));
  assert.throws(() => parseRequest(['--difficulty', 'easy', '--objective', 'boss', '--tiles', 'sword:4'], catalog.length + 1));
});

test('automatic charged targets include one while ordinary targets keep their minimum', () => {
  const request = parseRequest(['--difficulty', 'easy', '--objective', 'collect'], catalog.length + 1);
  const samples = [{ objectiveProgress: { main: 0 } }];
  const ordinary = { map: { objectives: [{ id: 'main', type: 'Collect' }] } };
  const charged = { map: { objectives: [{ id: 'main', type: 'Collect', chargeTier: 5 }] } };
  assert.deepEqual(targetChoices(ordinary, request, samples), [3]);
  assert.deepEqual(targetChoices(charged, request, samples), [1, 2]);
});

test('automatic objective targets invert the target completion rate for easy and hard profiles', () => {
  const template = { map: { objectives: [{ id: 'main', type: 'Collect' }] } };
  const samples = Array.from({ length: 10 }, (_, i) => ({ objectiveProgress: { main: i + 1 } }));
  const easy = parseRequest(['--difficulty', 'easy', '--objective', 'collect'], catalog.length + 1);
  const hard = parseRequest(['--difficulty', 'hard', '--objective', 'collect'], catalog.length + 1);
  assert.deepEqual(targetChoices(template, easy, samples), [3, 4]);
  assert.deepEqual(targetChoices(template, hard, samples), [7, 8, 9, 10, 11]);
});

test('break-rocks builds valid connected rock clusters and selects their quantity from candidates', () => {
  const request = parseRequest(['--difficulty', 'easy', '--objective', 'break-rocks'], catalog.length + 1);
  const nextConfig = prepareCatalog(config, catalog, request);
  const layouts = generateLayouts(24680, 8, catalog);
  const rockLayouts = addRockObstacles(layouts, 24680, rockId);

  assert.deepEqual(rockLayouts.map(shape => shape.rockCount), [2, 3, 4, 5, 6, 2, 3, 4]);
  for (let i = 0; i < layouts.length; i++) {
    const shape = rockLayouts[i];
    assert.equal(shape.rockCells.length, shape.rockCount);
    assert.equal(shapeKey(layouts[i].layout), shapeKey(shape.layout));
    assert.equal(layouts[i].layout.flat().filter(cell => cell === rockId).length, 0);
    const map = validateMap(mapTemplate(nextConfig, catalog, request, shape), nextConfig);
    assert.deepEqual(map.objectives, [{ id: 'break-rocks', type: 'BreakRocks', target: shape.rockCount }]);
    assert.equal(map.layout.flat().filter(cell => cell === rockId).length, shape.rockCount);
  }
});

test('break-rocks honors a fixed target and rejects incompatible CLI options', () => {
  const layouts = generateLayouts(13579, 3, catalog);
  const fixed = addRockObstacles(layouts, 13579, rockId, 3);
  assert.deepEqual(fixed.map(shape => shape.rockCount), [3, 3, 3]);
  assert.throws(() => parseRequest(['--difficulty', 'easy', '--objective', 'break-rocks', '--target', '57'], 4));
  assert.throws(() => parseRequest(['--difficulty', 'easy', '--objective', 'break-rocks', '--enemy-name', 'Wrong'], 4));
});

test('collect maps can include balanced rock blockers without a BreakRocks objective', () => {
  const request = parseRequest(['--difficulty', 'easy', '--objective', 'collect', '--tiles', 'fire,lightning', '--rock-blockers', '2-4'], catalog.length + 1);
  const nextConfig = prepareCatalog(config, catalog, request);
  const layouts = generateLayouts(86420, 4, catalog);
  const variants = [2, 3, 4].flatMap(count => addRockObstacles(layouts, 86420 ^ Math.imul(count, 0x9e3779b1), rockId, count));
  assert.equal(variants.length, layouts.length * 3);
  for (const shape of variants) {
    const map = validateMap(mapTemplate(nextConfig, catalog, request, shape), nextConfig);
    assert.deepEqual(map.objectives.map(objective => objective.type), ['Collect', 'Collect']);
    assert.equal(map.objectives.some(objective => objective.type === 'BreakRocks'), false);
    assert.equal(map.layout.flat().filter(tile => tile === rockId).length, shape.rockCount);
    assert.equal(map.spawnPolicy.obstaclePressure, .15);
  }
  assert.deepEqual(pressureVariants('collect', true), [0, .15, .3]);
  assert.equal(pressureSelectable('collect', 0, true), false);
  assert.equal(pressureSelectable('collect', .15, true), true);
});

test('rock blocker and minimum HP options validate their objective and ranges', () => {
  const collect = ['--difficulty', 'easy', '--objective', 'collect'];
  assert.deepEqual(parseRequest([...collect, '--rock-blockers', '2-4'], 6).rockBlockers, [2, 4]);
  assert.deepEqual(parseRequest([...collect, '--rock-blockers', '3'], 6).rockBlockers, [3, 3]);
  for (const value of ['1-2', '4-2', '2-5', '2.5-3', '2-4-5']) {
    assert.throws(() => parseRequest([...collect, '--rock-blockers', value], 6));
  }
  assert.throws(() => parseRequest(['--difficulty', 'easy', '--objective', 'battle', '--rock-blockers', '2-4'], 6));
  assert.throws(() => parseRequest([...collect, '--min-target', '600'], 6));
  assert.throws(() => parseRequest(['--difficulty', 'medium', '--objective', 'boss', '--target', '600', '--min-target', '601'], 6));
});

test('Battle/Boss target search respects a minimum target while remaining automatic', () => {
  const request = parseRequest(['--difficulty', 'medium', '--objective', 'boss', '--min-target', '801'], catalog.length + 1);
  const nextConfig = prepareCatalog(config, catalog, request);
  const shape = generateLayouts(75319, 1, catalog)[0];
  const map = mapTemplate(nextConfig, catalog, request, shape);
  assert.equal(map.objectives[0].type, 'Boss');
  assert.equal(map.objectives[0].target, 500);
  const choices = targetChoices({ map }, request, [{ objectiveProgress: { main: 900 } }]);
  assert.ok(choices.length > 0 && choices.every(target => target >= 801));
});

test('generated preview labels BreakRocks without expecting enemy metadata', () => {
  const request = parseRequest(['--difficulty', 'easy', '--objective', 'break-rocks'], catalog.length + 1);
  const nextConfig = prepareCatalog(config, catalog, request);
  const shape = addRockObstacles(generateLayouts(11111, 1, catalog), 11111, rockId)[0];
  const map = mapTemplate(nextConfig, catalog, request, shape);
  const retry = { medianAttempts: 1, medianRetries: 0, p90Attempts: 1, completed: 1, samples: 1, unfinished: 0,
    byAttempt: [{ attempt: 1, retries: 0, cumulativeRate: 1 }] };
  const report = { status: 'passed', failures: [], validation: { summary: { samples: 1000, winRate: .99,
    starRates: [.01, 0, 0, .99], medianMoves: 4 } }, retries: { firstWin: retry, firstThreeStars: retry },
    powerModel: { expectedTotalExp: 180 }, hashes: { map: 'test-hash' } };
  const html = renderGeneratedMap(map, nextConfig, { generation: { seed: 11111, shape, request: {} } }, report);
  assert.match(html, /Phá đá chắn: 2/);
  assert.match(html, /Đá chắn/);
});

test('break-seals creates connected seal clusters and a valid BreakSeals objective', () => {
  const request = parseRequest(['--difficulty', 'medium', '--objective', 'break-seals'], catalog.length + 1);
  const nextConfig = prepareCatalog(config, catalog, request);
  const shapes = generateLayouts(97531, 3, catalog);
  const variants = shapes.flatMap((shape, index) => addSealObstacles([shape], 97531 + index, 4));
  assert.equal(variants.length, shapes.length);
  for (const shape of variants) {
    assert.equal(shape.sealCells.length, 4);
    assert.equal(new Set(shape.sealCells.map(cell => `${cell.row}:${cell.column}`)).size, 4);
    const map = validateMap(mapTemplate(nextConfig, catalog, request, shape), nextConfig);
    assert.deepEqual(map.objectives, [{ id: 'break-seals', type: 'BreakSeals', target: 4 }]);
    assert.deepEqual(map.initialSeals, shape.sealCells);
  }
  const shape = variants[0], map = mapTemplate(nextConfig, catalog, request, shape);
  const retry = { medianAttempts: 1, medianRetries: 0, p90Attempts: 1, completed: 1, samples: 1, unfinished: 0,
    byAttempt: [{ attempt: 1, retries: 0, cumulativeRate: 1 }] };
  const report = { status: 'passed', failures: [], validation: { summary: { samples: 1000, winRate: .99,
    starRates: [.01, 0, 0, .99], medianMoves: 4 } }, retries: { firstWin: retry, firstThreeStars: retry },
    powerModel: { expectedTotalExp: 240 }, hashes: { map: 'test-hash' } };
  const preview = renderGeneratedMap(map, nextConfig, { generation: { seed: 97531, shape, request } }, report);
  assert.equal((preview.match(/🔒/g) ?? []).length, 4);
  assert.throws(() => parseRequest(['--difficulty', 'easy', '--objective', 'break-seals', '--enemy-name', 'Wrong'], 4));
});

test('generation caps budgets at 30 and uses rounded inclusive star move cutoffs', () => {
  const request = parseRequest(['--difficulty', 'easy', '--objective', 'collect'], catalog.length + 1);
  assert.equal(request.maxMoves, 30);
  assert.equal(request.starQuantile, .8);
  assert.throws(() => parseRequest(['--difficulty', 'easy', '--objective', 'collect', '--max-moves', '31'], 4));
  assert.deepEqual(moveCutoffs(30), { three: 18, two: 24, thresholds: {
    mode: 'percentage', threeStarBelowPercent: 61, twoStarBelowPercent: 81
  } });
  assert.deepEqual(moveCutoffs(12), { three: 7, two: 10, thresholds: {
    mode: 'percentage', threeStarBelowPercent: 59, twoStarBelowPercent: 84
  } });
  assert.deepEqual(moveCutoffs(3), { three: 1, two: 2, thresholds: {
    mode: 'percentage', threeStarBelowPercent: 34, twoStarBelowPercent: 67
  } });
});

test('nearest-rank quantiles include losses as censored outcomes and targets stay fixed when requested', () => {
  assert.equal(percentile([1, 2, 3, 4, 5], .8), 4);
  assert.equal(firstAttemptQuantile([{ won: true, movesUsed: 2 }, { won: true, movesUsed: 4 },
    { won: false, movesUsed: 8 }, { won: false, movesUsed: 8 }], .75), Infinity);
  const fixed = parseRequest(['--difficulty', 'easy', '--objective', 'collect', '--tiles', 'sword,fire', '--target', '8,6'], catalog.length + 1);
  const template = { map: { objectives: [{ id: 'sword', type: 'Collect' }, { id: 'fire', type: 'Collect' }] } };
  assert.deepEqual(targetChoices(template, fixed, []), [null]);
});

test('budget convergence caps at 30, records censoring, and rejects a cycle', () => {
  const request = { minMoves: 6, maxMoves: 30 };
  assert.equal(convergeBudget(30, request, () => ({ quantile: 19 })).status, 'over-budget');
  assert.equal(convergeBudget(30, request, () => ({ quantile: Infinity })).status, 'censored');
  const cycle = convergeBudget(30, request, moves => ({ quantile: moves === 30 ? 12 : 18 }));
  assert.equal(cycle.status, 'budget-cycle');
  assert.deepEqual(cycle.history.filter(item => item.testedMoves).map(item => item.testedMoves), [30, 20]);
  assert.deepEqual(policyVariants('easy', 'break-rocks').map(policy => [policy.comboChance, policy.setupChance]),
    [[.05, .15], [.1, .25], [.15, .35]]);
  assert.deepEqual(pressureVariants('break-seals'), [0, .15, .3]);
  assert.equal(pressureSelectable('break-seals', 0), false);
  assert.equal(pressureSelectable('break-seals', .15), true);
  assert.equal(pressureSelectable('collect', 0), true);
});

test('publisher keeps legacy win gates and accepts policy-v2 reports with diagnostic win rates', async () => {
  const { assertBalanced } = await import('./publish_generated_map.mjs');
  const map = catalog[2], mapHash = hash(map), configHash = hash(contentWire(config)), engine = engineHash();
  const report = {
    status: 'passed', failures: [], hashes: { map: mapHash, config: configHash, engine },
    validation: { passed: true, summary: { samples: 1000, mapHash, winRate: 0, starRates: [0, 0, 0, .851] } }
  };
  const seed = { format: 1, map, hashes: { map: mapHash, config: configHash, engine, report: hash(report) },
    generation: { request: { policyVersion: 2, winRateEnforced: false, bands: {
      win: [.95, 1], three: [.8, 1], exclusiveWin: true, exclusiveThree: true
    } } } };
  const artifact = { seed, map, config, report };
  assert.doesNotThrow(() => assertBalanced(artifact));
  delete seed.generation.request.policyVersion;
  delete seed.generation.request.winRateEnforced;
  seed.hashes.report = hash(report);
  assert.throws(() => assertBalanced(artifact), /BALANCE_NOT_PASSED/);
});
