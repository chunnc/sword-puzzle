// Calibration and verification use the production engine and humanized bots.
const { play, summarize, installSnapshot } = require('./simulate_maps.cjs');
const { mapStars, assistForFailures, contentWire } = require('./game-runtime.cjs');
const { hash, engineHash, gameplaySeed, inBand } = require('./map_generation.cjs');

const CHANCE_POLICIES = [
  { comboChance: .05, setupChance: .15 },
  { comboChance: .1, setupChance: .25 },
  { comboChance: .15, setupChance: .35 }
];
const MAX_BUDGET_REFINEMENTS = 8;
function samples(map, count, suite, request, bot = 'normal', power = 'expected') {
  return Array.from({ length: count }, (_, i) => {
    const result = play(map, gameplaySeed(i, suite, request.seed), bot, power, 0, false,
      power === 'expected' ? { totalExp: request.totalExp } : {});
    if (result.stalled || result.maxChain > 4) throw new Error('ENGINE_PLAYABILITY_FAILURE');
    return result;
  });
}
function moveCutoffs(moves) {
  const three = Math.min(moves - 2, Math.round(.6 * moves));
  const two = Math.min(moves - 1, Math.max(three + 1, Math.round(.8 * moves)));
  if (three < 1 || two <= three) return null;
  const threshold = maxMoves => Math.floor(maxMoves * 100 / moves) + 1;
  const result = { three, two, thresholds: { mode: 'percentage',
    threeStarBelowPercent: threshold(three), twoStarBelowPercent: threshold(two) } };
  return result.thresholds.threeStarBelowPercent < result.thresholds.twoStarBelowPercent
    && result.thresholds.twoStarBelowPercent <= 100 ? result : null;
}
function assess(map, results, request) {
  const rated = results.map(result => ({ ...result, stars: result.won ? mapStars(map, result.movesUsed) : 0 }));
  const summary = summarize(map, rated), failures = [];
  if (request.winRateEnforced !== false && !inBand(summary.winRate, request.bands.win, request.bands.exclusiveWin)) {
    failures.push('First-attempt win rate outside requested band');
  }
  if (!inBand(summary.starRates[3], request.bands.three, request.bands.exclusiveThree)) failures.push('First-attempt three-star rate outside requested band');
  if (rated.some(result => result.stalled) || summary.maxChain > 4) failures.push('Engine playability/cascade gate failed');
  const reshuffleRate = summary.actions ? rated.reduce((sum, result) => sum + result.reshuffles, 0) / summary.actions : 0;
  if (reshuffleRate > .25) failures.push('More than 0.25 reshuffles per action');
  const loss = Math.abs(summary.starRates[3] - request.starQuantile) + .05 * reshuffleRate;
  return { passed: !failures.length, failures, loss, summary: { ...summary, bot: 'normal', power: 'expected', totalExp: request.totalExp, reshuffleRate } };
}
function percentile(values, probability) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(probability * sorted.length) - 1))];
}
function firstAttemptQuantile(results, probability) {
  return percentile(results.map(result => result.won ? result.movesUsed : Infinity), probability);
}
function convergeBudget(startMoves, request, evaluate) {
  const history = [], seenMoves = new Set();
  let moves = startMoves;
  for (let iteration = 0; iteration < MAX_BUDGET_REFINEMENTS; iteration++) {
    const measurement = evaluate(moves);
    const quantileMoves = measurement.quantile;
    const derivedMoves = Number.isFinite(quantileMoves) ? Math.ceil(quantileMoves / .6) : null;
    history.push({ iteration: iteration + 1, testedMoves: moves,
      quantileMoves: Number.isFinite(quantileMoves) ? quantileMoves : null,
      censored: !Number.isFinite(quantileMoves), derivedMoves });
    if (derivedMoves === null) return { status: 'censored', moves, history };
    if (derivedMoves > request.maxMoves) return { status: 'over-budget', moves, history };
    const nextMoves = Math.max(request.minMoves, derivedMoves);
    if (nextMoves === moves) return { status: 'converged', moves, history, measurement };
    if (seenMoves.has(nextMoves)) {
      history.push({ iteration: iteration + 1, cycleAtMoves: nextMoves });
      return { status: 'budget-cycle', moves, history };
    }
    seenMoves.add(moves);
    moves = nextMoves;
  }
  return { status: 'no-convergence', moves, history };
}
function progressQuantile(results, map, probability) {
  const values = results.map(result => Math.min(...map.objectives.map(objective => result.objectiveProgress[objective.id] ?? 0)));
  return percentile(values, probability);
}
function targetChoices(template, request, results) {
  if (request.fixedTargets || ['break-rocks', 'break-seals'].includes(request.objective)) return [null];
  const progress = Math.floor(progressQuantile(results, template.map, request.starQuantile));
  const minimum = template.map.objectives.every(objective => objective.type === 'Collect') ? 3 : 10;
  const maximum = template.map.objectives.every(objective => objective.type === 'Collect') ? 30 : 1_000_000_000;
  return [...new Set([-2, -1, 0, 1, 2].map(offset => Math.max(minimum, Math.min(maximum, progress + offset))))];
}
function policyVariants(difficulty, objective) {
  const pressure = { easy: 0, medium: .1, hard: .25, 'very-hard': .4 }[difficulty];
  return CHANCE_POLICIES.map(policy => ({ ...policy,
    collectionPressure: objective === 'collect' ? pressure : 0 }));
}
function pressureVariants(objective) {
  return ['break-rocks', 'break-seals'].includes(objective) ? [0, .15, .3] : [0];
}
function pressureSelectable(objective, obstaclePressure) {
  return !['break-rocks', 'break-seals'].includes(objective) || obstaclePressure > 0;
}
function calibrate(templates, config, request, progress = console.log) {
  installSnapshot(config, []);
  const shortlist = [], rejected = [], adjustmentHistory = [];
  const coarseSeeds = Math.min(40, request.trainingSeeds);
  for (const [index, template] of templates.entries()) {
    const policies = policyVariants(template.map.difficulty, request.objective);
    for (const obstaclePressure of pressureVariants(request.objective)) for (const policy of policies) {
      try {
        const probe = structuredClone(template.map);
        probe.moves = Math.max(request.minMoves, Math.round(.6 * request.maxMoves));
        Object.assign(probe.spawnPolicy, policy, { obstaclePressure });
        if (!request.fixedTargets && !['break-rocks', 'break-seals'].includes(request.objective)) {
          probe.objectives.forEach(objective => { objective.target = objective.type === 'Collect' ? 30 : 1_000_000_000; });
        }
        const capacity = samples(probe, coarseSeeds, 'training', request);
        for (const target of targetChoices(template, request, capacity)) {
          const map = structuredClone(template.map);
          Object.assign(map.spawnPolicy, policy, { obstaclePressure });
          if (target !== null) map.objectives.forEach(o => { o.target = target; });
          const fit = convergeBudget(request.maxMoves, request, moves => {
            map.moves = moves;
            const results = samples(map, coarseSeeds, 'training', request);
            return { quantile: firstAttemptQuantile(results, request.starQuantile), results };
          });
          if (fit.status === 'converged') {
            map.moves = fit.moves;
            const cutoffs = moveCutoffs(fit.moves);
            if (cutoffs) {
              map.starThresholds = cutoffs.thresholds;
              const report = assess(map, fit.measurement.results, request);
              const selectable = pressureSelectable(request.objective, obstaclePressure);
              if (selectable) shortlist.push({ map: structuredClone(map), shape: template.shape, coarse: report, history: fit.history });
              adjustmentHistory.push({ shape: index + 1, policy, obstaclePressure, target: map.objectives[0].target,
                moves: fit.moves, history: fit.history, status: !selectable ? 'pressure-control-only' : report.passed ? 'candidate' : 'three-star-band-miss' });
            } else rejected.push({ shape: index + 1, policy, obstaclePressure, target: map.objectives[0].target,
              reason: 'invalid-star-cutoffs', history: fit.history });
          } else {
            rejected.push({ shape: index + 1, policy, obstaclePressure, target: map.objectives[0].target,
              reason: fit.status, history: fit.history });
            adjustmentHistory.push({ shape: index + 1, policy, obstaclePressure, target: map.objectives[0].target,
              moves: fit.moves, history: fit.history, status: fit.status });
          }
        }
      } catch (error) { rejected.push({ shape: index + 1, policy, obstaclePressure, error: error.message }); }
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
      const refined = structuredClone(candidate.map);
      const fit = convergeBudget(refined.moves, request, moves => {
        refined.moves = moves;
        const results = samples(refined, request.trainingSeeds, 'training', request);
        return { quantile: firstAttemptQuantile(results, request.starQuantile), results };
      });
      if (fit.status !== 'converged') {
        adjustmentHistory.push({ shape: candidate.shape.family, target: refined.objectives[0].target,
          history: fit.history, status: `refinement-${fit.status}` });
        continue;
      }
      refined.moves = fit.moves;
      const cutoffs = moveCutoffs(fit.moves);
      if (!cutoffs) continue;
      refined.starThresholds = cutoffs.thresholds;
      const report = assess(refined, fit.measurement.results, request);
      if (report.passed && (!selected || report.loss < selected.training.loss)) {
        selected = { map: structuredClone(refined), shape: candidate.shape, training: report,
          history: [...candidate.history, ...fit.history] };
      }
    } catch (error) { rejected.push({ stage: 'training-refinement', error: error.message }); }
  }
  if (!selected) {
    const error = new Error('NO_BALANCED_CANDIDATE: training constraints were not relaxed');
    error.details = { candidates: shortlist.length, evaluated, rejected, closest: shortlist.slice(0, 5).map(c => ({ map: c.map, assessment: c.coarse })) };
    throw error;
  }
  return { ...selected, search: { shapes: templates.length, candidates: shortlist.length, refined: evaluated, coarseSeeds, rejected,
    policyVersion: request.policyVersion, starQuantile: request.starQuantile, selectedHistory: selected.history, adjustmentHistory } };
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
  let suboptimalChoices=0;
  for (let sequence = 0; sequence < request.retrySeeds; sequence++) {
    let consecutiveFailures = 0, firstWin = null, firstThree = null;
    for (let attempt = 0; attempt < request.retryAttempts; attempt++) {
      const assist = assistForFailures(map, consecutiveFailures);
      assistCounts[assist] = (assistCounts[assist] ?? 0) + 1;
      const result = play(map, gameplaySeed(sequence * request.retryAttempts + attempt, 'retry', request.seed),
        'normal', 'expected', assist, false, { totalExp: request.totalExp });
      suboptimalChoices+=result.suboptimalChoices??0;
      if (result.stalled || result.maxChain > 4) throw new Error('RETRY_PLAYABILITY_FAILURE');
      if (result.won) {
        firstWin ??= attempt + 1;
        consecutiveFailures = 0; // The server resets failures even after a 1–2-star win.
        if (result.stars === 3) { firstThree = attempt + 1; break; }
      } else consecutiveFailures++;
    }
    firstWins.push(firstWin); firstThrees.push(firstThree);
  }
  return { bot: 'normal', totalExp: request.totalExp, botModel: require('./simulate_maps.cjs').BOT_MODEL,
    suboptimalChoices, assistance: 'consecutive-losses; reset after any win', assistCounts,
    firstWin: attemptStats(firstWins, request.retrySeeds, request.retryAttempts),
    firstThreeStars: attemptStats(firstThrees, request.retrySeeds, request.retryAttempts) };
}
function verify(map, config, request, training = null, search = null) {
  installSnapshot(config, []);
  const validation = assess(map, samples(map, request.validationSeeds, 'validation', request), request);
  const retries = simulateToThreeStars(map, request), failures = [...validation.failures];
  const cutoffs = moveCutoffs(map.moves);
  for (const [key, range] of [['firstWin', request.retryWinMedian], ['firstThreeStars', request.retryThreeMedian]]) {
    if (!range) continue;
    const median = retries[key].medianAttempts;
    if (median === null || !inBand(median, range)) failures.push(`${key}: median attempts outside requested band (or censored)`);
  }
  const diagnostics = ['minimum', 'strong'].map(power => ({ ...summarize(map,
    samples(map, Math.min(100, request.validationSeeds), 'diagnostic', request, 'normal', power)), bot: 'normal', power }));
  return { format: 1, status: failures.length ? 'failed' : 'passed', failures,
    hashes: { map: hash(map), config: hash(contentWire(config)), engine: engineHash() },
    bands: request.bands, botModel: require('./simulate_maps.cjs').BOT_MODEL,
    authoringPolicy: request.policyVersion === 2 ? {
      version: 2, starQuantile: request.starQuantile, totalMoves: map.moves,
      threeStarMaxMoves: cutoffs?.three ?? null, twoStarMaxMoves: cutoffs?.two ?? null,
      moveRatios: { threeStars: .6, twoStars: .8 }, maxMoves: request.maxMoves,
      winRateEnforced: false, chanceCaps: { comboChance: .15, setupChance: .35 },
      budgetRefinement: search?.selectedHistory ?? []
    } : { version: 1, winRateEnforced: true },
    powerModel: { expectedTotalExp: request.totalExp, minimumTotalExp: 0, strongTotalExp: (map.id - 1) * 100 + 1500,
      loadout: { sword: null, skills: [] }, extraMoves: false },
    seedSuites: { generationSeed: request.seed, training: request.trainingSeeds, validation: request.validationSeeds,
      retrySequences: request.retrySeeds, maxRetryAttempts: request.retryAttempts, selection: 'training-only; one frozen validation pass' },
    training, search, validation, retries, diagnostics };
}
module.exports = { samples, assess, calibrate, attemptStats, simulateToThreeStars, verify,
  moveCutoffs, percentile, firstAttemptQuantile, progressQuantile, targetChoices, convergeBudget,
  policyVariants, pressureVariants, pressureSelectable };
