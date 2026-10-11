// Calibration and verification use the production engine and the existing normal bot.
const { play, summarize, installSnapshot } = require('./simulate_maps.cjs');
const { mapStars, assistForFailures, contentWire } = require('./game-runtime.cjs');
const { hash, engineHash, gameplaySeed, inBand } = require('./map_generation.cjs');

const midpoint = range => (range[0] + range[1]) / 2;
function samples(map, count, suite, request, bot = 'normal', power = 'expected') {
  return Array.from({ length: count }, (_, i) => {
    const result = play(map, gameplaySeed(i, suite, request.seed), bot, power, 0, false,
      power === 'expected' ? { totalExp: request.totalExp } : {});
    if (result.stalled || result.maxChain > 4) throw new Error('ENGINE_PLAYABILITY_FAILURE');
    return result;
  });
}
function chooseStars(map, results, bands) {
  const win = results.filter(result => result.won).length / results.length;
  const rates = Array.from({ length: 101 }, (_, threshold) => results.filter(result => result.won && result.movesUsed * 100 < map.moves * threshold).length / results.length);
  const rate = threshold => rates[threshold];
  let best = null;
  for (let three = 1; three < 100; three++) {
    const threeRate = rate(three);
    const feasible = inBand(threeRate, bands.three, bands.exclusiveThree);
    for (let two = three + 1; two <= 100; two++) {
      const loss = Math.abs(threeRate - midpoint(bands.three)) + .1 * Math.abs(rate(two) - (win + threeRate) / 2);
      if (!best || feasible && !best.feasible || feasible === best.feasible && loss < best.loss) {
        best = { loss, feasible, thresholds: { mode: 'percentage', threeStarBelowPercent: three, twoStarBelowPercent: two } };
      }
    }
  }
  return best.thresholds;
}
function assess(map, results, request, tuneStars = false) {
  if (tuneStars) map.starThresholds = chooseStars(map, results, request.bands);
  const rated = results.map(result => ({ ...result, stars: result.won ? mapStars(map, result.movesUsed) : 0 }));
  const summary = summarize(map, rated), failures = [];
  if (!inBand(summary.winRate, request.bands.win, request.bands.exclusiveWin)) failures.push('First-attempt win rate outside requested band');
  if (!inBand(summary.starRates[3], request.bands.three, request.bands.exclusiveThree)) failures.push('First-attempt three-star rate outside requested band');
  if (rated.some(result => result.stalled) || summary.maxChain > 4) failures.push('Engine playability/cascade gate failed');
  const reshuffleRate = summary.actions ? rated.reduce((sum, result) => sum + result.reshuffles, 0) / summary.actions : 0;
  if (reshuffleRate > .25) failures.push('More than 0.25 reshuffles per action');
  const preferredMoves = map.objectives.every(o => o.type === 'Collect') ? 12 : 16;
  const loss = Math.abs(summary.winRate - midpoint(request.bands.win)) + Math.abs(summary.starRates[3] - midpoint(request.bands.three))
    + .002 * Math.abs(map.moves - preferredMoves) + .05 * reshuffleRate;
  return { passed: !failures.length, failures, loss, summary: { ...summary, bot: 'normal', power: 'expected', totalExp: request.totalExp, reshuffleRate } };
}
function percentile(values, probability) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(probability * sorted.length))];
}
function policyVariants(difficulty) {
  const pressure = { easy: 0, medium: .1, hard: .25, 'very-hard': .4 }[difficulty];
  return [0, 1, 2].map(i => ({ comboChance: [.05, .1, .15][i], setupChance: [.15, .25, .35][i], collectionPressure: pressure }));
}
function calibrate(templates, config, request, progress = console.log) {
  installSnapshot(config, []);
  const shortlist = [], rejected = [];
  const coarseSeeds = Math.min(40, request.trainingSeeds);
  const budgets = [...new Set([...Array.from({ length: Math.floor((request.maxMoves - request.minMoves) / 2) + 1 }, (_, i) => request.minMoves + i * 2), request.maxMoves])];
  for (const [index, template] of templates.entries()) {
    const variants = policyVariants(template.map.difficulty);
    for (const policy of variants) for (const moves of budgets) {
      const probe = structuredClone(template.map);
      probe.moves = moves; Object.assign(probe.spawnPolicy, policy);
      try {
        let targets = [null];
        if (!request.fixedTargets) {
          const collect = probe.objectives.every(o => o.type === 'Collect');
          probe.objectives.forEach(o => { o.target = collect ? 30 : 1_000_000_000; });
          const measured = samples(probe, coarseSeeds, 'training', request);
          const values = measured.map(r => Math.min(...probe.objectives.map(o => r.objectiveProgress[o.id])));
          targets = [...new Set([request.bands.win[0], midpoint(request.bands.win), request.bands.win[1]].flatMap(rate => {
            const target = percentile(values, 1 - rate);
            return [Math.floor(target), Math.floor(target) + 1];
          }).map(target => Math.max(collect ? 3 : 10, Math.min(collect ? 30 : 1_000_000_000, target))))];
        }
        for (const target of targets) {
          const map = structuredClone(probe);
          if (target !== null) map.objectives.forEach(o => { o.target = target; });
          const report = assess(map, samples(map, coarseSeeds, 'training', request), request, true);
          shortlist.push({ map, shape: template.shape, coarse: report });
        }
      } catch (error) { rejected.push({ shape: index + 1, moves, policy, error: error.message }); }
    }
    progress(`Training shape ${index + 1}/${templates.length} (${template.shape.family}): ${shortlist.length} candidates`);
  }
  shortlist.sort((a, b) => a.coarse.loss - b.coarse.loss);
  let selected = null, evaluated = 0;
  // All selection is training-only. Validation never feeds back into this search.
  for (const candidate of shortlist.slice(0, 36)) {
    if (evaluated >= 12 && selected) break;
    evaluated++;
    try {
      const report = assess(candidate.map, samples(candidate.map, request.trainingSeeds, 'training', request), request, true);
      if (report.passed && (!selected || report.loss < selected.training.loss)) selected = { map: candidate.map, shape: candidate.shape, training: report };
    } catch (error) { rejected.push({ stage: 'training-refinement', error: error.message }); }
  }
  if (!selected) {
    const error = new Error('NO_BALANCED_CANDIDATE: training constraints were not relaxed');
    error.details = { candidates: shortlist.length, evaluated, rejected, closest: shortlist.slice(0, 5).map(c => ({ map: c.map, assessment: c.coarse })) };
    throw error;
  }
  return { ...selected, search: { shapes: templates.length, candidates: shortlist.length, refined: evaluated, coarseSeeds, rejected } };
}
function attemptStats(firstAttempts, count, maxAttempts) {
  const completed = firstAttempts.filter(n => n !== null).sort((a, b) => a - b);
  const quantile = p => {
    // Include unfinished sequences as right-censored, not as instant successes.
    const rank = Math.max(0, Math.ceil(count * p) - 1);
    return rank < completed.length ? completed[rank] : null;
  };
  const median = quantile(.5);
  return { samples: count, completed: completed.length, unfinished: count - completed.length, maxAttempts,
    medianAttempts: median, medianRetries: median === null ? null : median - 1, p90Attempts: quantile(.9),
    meanCompletedAttempts: completed.length ? completed.reduce((sum, n) => sum + n, 0) / completed.length : null,
    byAttempt: [1, 2, 3, 5, 10, 20, 30, 50, 100].filter(n => n <= maxAttempts).concat(maxAttempts)
      .filter((n, i, all) => all.indexOf(n) === i).sort((a, b) => a - b)
      .map(attempt => ({ attempt, retries: attempt - 1, cumulativeRate: completed.filter(n => n <= attempt).length / count })) };
}
function simulateToThreeStars(map, request) {
  const firstWins = [], firstThrees = [], assistCounts = {};
  for (let sequence = 0; sequence < request.retrySeeds; sequence++) {
    let consecutiveFailures = 0, firstWin = null, firstThree = null;
    for (let attempt = 0; attempt < request.retryAttempts; attempt++) {
      const assist = assistForFailures(map, consecutiveFailures);
      assistCounts[assist] = (assistCounts[assist] ?? 0) + 1;
      const result = play(map, gameplaySeed(sequence * request.retryAttempts + attempt, 'retry', request.seed),
        'normal', 'expected', assist, false, { totalExp: request.totalExp });
      if (result.stalled || result.maxChain > 4) throw new Error('RETRY_PLAYABILITY_FAILURE');
      if (result.won) {
        firstWin ??= attempt + 1;
        consecutiveFailures = 0; // The server resets failures even after a 1–2-star win.
        if (result.stars === 3) { firstThree = attempt + 1; break; }
      } else consecutiveFailures++;
    }
    firstWins.push(firstWin); firstThrees.push(firstThree);
  }
  return { bot: 'normal', totalExp: request.totalExp, assistance: 'consecutive-losses; reset after any win', assistCounts,
    firstWin: attemptStats(firstWins, request.retrySeeds, request.retryAttempts),
    firstThreeStars: attemptStats(firstThrees, request.retrySeeds, request.retryAttempts) };
}
function verify(map, config, request, training = null, search = null) {
  installSnapshot(config, []);
  const validation = assess(map, samples(map, request.validationSeeds, 'validation', request), request);
  const retries = simulateToThreeStars(map, request), failures = [...validation.failures];
  for (const [key, range] of [['firstWin', request.retryWinMedian], ['firstThreeStars', request.retryThreeMedian]]) {
    if (!range) continue;
    const median = retries[key].medianAttempts;
    if (median === null || !inBand(median, range)) failures.push(`${key}: median attempts outside requested band (or censored)`);
  }
  const diagnostics = ['minimum', 'strong'].map(power => ({ ...summarize(map,
    samples(map, Math.min(100, request.validationSeeds), 'diagnostic', request, 'normal', power)), bot: 'normal', power }));
  return { format: 1, status: failures.length ? 'failed' : 'passed', failures,
    hashes: { map: hash(map), config: hash(contentWire(config)), engine: engineHash() },
    bands: request.bands, powerModel: { expectedTotalExp: request.totalExp, minimumTotalExp: 0, strongTotalExp: (map.id - 1) * 100 + 1500,
      loadout: { sword: 'thanh-phong', skills: ['nhat-kiem'] }, extraMoves: false },
    seedSuites: { generationSeed: request.seed, training: request.trainingSeeds, validation: request.validationSeeds,
      retrySequences: request.retrySeeds, maxRetryAttempts: request.retryAttempts, selection: 'training-only; one frozen validation pass' },
    training, search, validation, retries, diagnostics };
}
module.exports = { samples, assess, calibrate, attemptStats, simulateToThreeStars, verify };
