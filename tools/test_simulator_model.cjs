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

test('all bot and power profiles use an empty active and passive loadout', () => {
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
