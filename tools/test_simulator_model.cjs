const test = require('node:test');
const assert = require('node:assert/strict');
const runtime = require('./game-runtime.cjs');
const OriginalBoardEngine = runtime.BoardEngine;
const observedLoadouts = [];
runtime.BoardEngine = class extends OriginalBoardEngine {
  constructor(level, restore, context) {
    if (!restore && context) observedLoadouts.push(context.loadout);
    super(level, restore, context);
  }
};
const simulator = require('./simulate_maps.cjs');
const { renderBalanceReport } = require('./render_balance_report.cjs');
const balance = require('./generate_map_balance.cjs');
const config = require('../content/game-config.json');

test('five active skills are selected deterministically and validated against the snapshot', () => {
  const selected = balance.selectSkills(config, 123);
  assert.equal(selected.length, 5);
  assert.equal(new Set(selected).size, 5);
  assert.deepEqual(balance.selectSkills(config, 123), selected);
  assert.ok(selected.every(id => config.skills.some(skill => skill.id === id && skill.kind !== 'passive')));
  assert.throws(() => balance.selectSkills({skills: config.skills.filter(s => s.kind === 'passive')}, 123), /five active/);
  assert.deepEqual(balance.ensureSkills({seed: 999, skills: selected}, config), selected);
  assert.throws(() => balance.ensureSkills({skills: [...selected.slice(0, 4), selected[0]]}, config), /Invalid/);
});

test('five skill sets use paired seeds, a single skill per run and repeatable engine results', () => {
  const map = simulator.catalog.find(candidate => candidate.id === 3);
  const request = {seed: 123, totalExp: 120, skills: balance.selectSkills(config, 123)};
  const first = balance.samples(map, 2, 'validation', request);
  assert.deepEqual(balance.samples(map, 2, 'validation', request), first);
  assert.equal(first.length, 10);
  for (const skill of request.skills) assert.equal(first.filter(r => r.skill === skill).length, 2);
  assert.ok(first.every(r => Number.isInteger(r.skillUses)));
  assert.equal(first.reduce((n, r) => n + r.skillUses, 0), simulator.summarize(map, first).skillUses);
});

test('every active skill can be played through the production engine deterministically', () => {
  const map = simulator.catalog.find(candidate => candidate.id === 3);
  for (const {id} of config.skills.filter(skill => skill.kind !== 'passive')) {
    const result = simulator.play(map, 76543, 'normal', 'expected', 0, false, {skill: id});
    assert.deepEqual(simulator.play(map, 76543, 'normal', 'expected', 0, false, {skill: id}), result, id);
    assert.equal(result.skill, id);
    assert.equal(result.stalled, false, id);
  }
});

test('bot casts legal targets through the engine only when qi and turn permit', () => {
  const map = simulator.catalog.find(candidate => candidate.id === 3);
  const installed = runtime.installContent(config);
  for (const {id} of config.skills.filter(skill => skill.kind !== 'passive')) {
    const level = runtime.mapToLevel(map, 76543, 0, installed);
    const start = new OriginalBoardEngine(level, null, {loadout: {sword: null, skills: [id]}, totalExp: 0});
    const snapshot = start.snapshot();
    const indices = snapshot.tiles.flatMap((t, i) => t && !t.locked && t.nodeCharge === undefined ? [i] : []);
    snapshot.tiles[indices[0]].kind = runtime.tileId('sword', installed);
    snapshot.tiles[indices[1]].kind = runtime.tileId('fire', installed);
    snapshot.tiles[indices[0]].chargeTier = 4;
    snapshot.tiles[indices[1]].chargeTier = 4;
    snapshot.tiles[indices[2]].kind = runtime.tileId('rock', installed);
    snapshot.swordQi = 0;
    assert.equal(simulator.useSkill(new OriginalBoardEngine(level, snapshot)), null, id);
    snapshot.swordQi = installed.qiCap;
    const engine = new OriginalBoardEngine(level, snapshot);
    assert.equal(simulator.useSkill(engine), id, id);
    assert.equal(simulator.useSkill(engine), null, id);
  }
});

test('verification reports paired skill results, retries and a separate no-skill control', () => {
  const map = simulator.catalog.find(candidate => candidate.id === 3);
  const request = require('./generate_map.cjs').parseRequest(['--difficulty', 'easy', '--objective', 'collect', '--seed', '123'], 21);
  request.validationSeeds = 2;
  request.retrySeeds = 2;
  request.retryAttempts = 2;
  const report = balance.verify(map, config, request);
  assert.equal(report.validation.summary.samples, 10);
  assert.equal(report.validation.noSkill.samples, 2);
  assert.equal(report.retries.firstWin.samples, 10);
  for (const skill of request.skills) {
    assert.equal(report.validation.bySkill[skill].samples, 2);
    assert.equal(report.retries.bySkill[skill].firstWin.samples, 2);
  }
  assert.deepEqual(report.botModel.skills, request.skills);
});

test('collection scoring respects exact tiers and ignores sealed charged tiles', () => {
  const source = simulator.catalog[0], kind = source.tileRegistry.sword;
  const objectives = [{ id: 'all', type: 'Collect', tileKind: kind, target: 30 },
    { id: 'four', type: 'Collect', tileKind: kind, chargeTier: 4, target: 2 }];
  const base = { level: { board: { width: 3, height: 3 }, objectives }, objectiveProgress: { all: 0, four: 0 } };
  for (const [chargeTier, locked, bonus] of [[0, false, 1], [4, false, 2], [5, false, 1], [4, true, 1]]) {
    const tiles = [{ kind, chargeTier, locked }];
    const snapshot = { ...base, tiles };
    const withoutGoals = { ...snapshot, level: { ...snapshot.level, objectives: [] } };
    assert.equal(Math.round((simulator.clearValue(snapshot, [0]) - simulator.clearValue(withoutGoals, [0])) * 100) / 100, bonus);
  }
});

test('all bot and power profiles use an empty active and passive loadout', () => {
  observedLoadouts.length = 0;
  const map = simulator.catalog.find(candidate => candidate.id === 3);
  for (const bot of ['basic', 'normal', 'strategic']) {
    for (const power of ['minimum', 'expected', 'strong']) {
      simulator.play(map, 123456, bot, power);
    }
  }
  assert.deepEqual(observedLoadouts, Array.from({ length: 9 }, () => ({ sword: null, skills: [] })));
  assert.deepEqual(simulator.BOT_MODEL.loadout, { sword: null, skills: [] });
});

test('move choice is repeatable and only mistakes into the next three lower ranked moves', () => {
  const ranked = [10, 9, 8, 7, 1].map((score, index) => ({ move: [index], score }));
  const roll = values => { let index = 0; return () => values[index++]; };
  assert.deepEqual(simulator.selectRankedMove(ranked, .3, roll([.9])), { move: [0], suboptimal: false });
  assert.deepEqual(simulator.selectRankedMove(ranked, .3, roll([.1, .99])), { move: [3], suboptimal: true });
  assert.deepEqual(simulator.selectRankedMove(ranked, .3, roll([.1, 0])), { move: [1], suboptimal: true });
});

test('single move and tied best moves do not invent a suboptimal alternative', () => {
  const roll = values => { let index = 0; return () => values[index++]; };
  let calls = 0;
  assert.deepEqual(simulator.selectRankedMove([{ move: 'only', score: 2 }], .3, () => { calls++; return 0; }),
    { move: 'only', suboptimal: false });
  assert.equal(calls, 0);
  assert.deepEqual(simulator.selectRankedMove([{ move: 'a', score: 2 }, { move: 'b', score: 2 }], .3, roll([.9, .99])),
    { move: 'b', suboptimal: false });
});

test('actual suboptimal picks are counted in play summaries, and seed results repeat', () => {
  const map = simulator.catalog.find(candidate => candidate.id === 3);
  const first = simulator.play(map, 987654, 'normal');
  assert.deepEqual(simulator.play(map, 987654, 'normal'), first);
  const summary = simulator.summarize(map, [first]);
  assert.equal(summary.suboptimalChoices, first.suboptimalChoices);
  assert.equal(summary.suboptimalChoiceRate, first.suboptimalChoices / first.actions);
});

test('retry reports count suboptimal choices through attempts and assist buckets', () => {
  const map = simulator.catalog.find(candidate => candidate.id === 3);
  const retry = simulator.simulateRetries(map, 1, () => ({ won: true, stars: 3, suboptimalChoices: 2 }));
  assert.equal(retry.suboptimalChoices, 2);
  assert.equal(retry.byAssist[0].suboptimalChoices, 2);
  assert.equal(retry.byAssist[0].suboptimalChoiceRate, 2);
  assert.equal(retry.byAttempt[0].suboptimalChoices, 2);
  assert.equal(retry.botModel.version, simulator.BOT_MODEL.version);
});

test('HTML reports the bot model, empty loadout and observed mistake counts', () => {
  const map = simulator.catalog.find(candidate => candidate.id === 3);
  const result = simulator.play(map, 97531, 'normal');
  const summary = simulator.summarize(map, [result]);
  const report = {
    contentVersion: 11, botModel: simulator.BOT_MODEL, targets: simulator.targets,
    reports: [{ ...summary, bot: 'normal', power: 'expected' }], maps: [map],
    checks: { status: 'not-run', tolerance: 0, results: [], failures: [] },
    run: { status: 'completed', maps: [3], command: 'test' }, seeds: 1, suite: 'validation'
  };
  const html = renderBalanceReport(report);
  assert.match(html, /loadout trống \(mô hình v1/);
  assert.match(html, /30,0% \/ 20,0% \/ 10,0%/);
  assert.ok(html.includes(String(summary.suboptimalChoices)));
  assert.deepEqual(JSON.parse(html.match(/<script id="report-data" type="application\/json">(.*?)<\/script>/s)[1]).botModel,
    simulator.BOT_MODEL);
});
