const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { validateContent, validateMap, versionMap, chapterForLevel, contentWire } = require('./game-runtime.cjs');
const { ROOT, PROFILES, hash, readJSON, writeJSON, engineHash, positiveInteger, band, parseArgs,
  generateLayouts, addRockObstacles, addSealObstacles, artifactDir, withAuthoringLock } = require('./map_generation.cjs');
const { calibrate, verify } = require('./generate_map_balance.cjs');
const { renderGeneratedMap } = require('./render_generated_map.cjs');

const HELP = `Generate and balance a local map (no Firestore writes).
  npm run maps:generate -- --difficulty medium --objective collect --tiles sword,fire
  npm run maps:generate -- --difficulty hard --objective boss --index 3 --seed 12345

Required: --difficulty easy|medium|hard|very-hard --objective collect|battle|boss|break-rocks|break-seals
Collect: --tiles sword,fire,lightning,spirit (default sword); optional :4/:5, e.g. sword:4,fire:5
         --target N or N,N; charged targets count activations, not creation
BreakRocks: generates a connected cluster of 2–6 rocks; --target N fixes the rock count
BreakSeals: generates a connected cluster of 2–6 seals; --target N fixes the seal count
Enemy:   --enemy-id ID --enemy-name NAME --enemy-art beast --target HP
Author:  --index N (default next) --name NAME --seed UINT32 --replace
         --chapter ID --chapter-name NAME (new chapter starts at next index)
Budget:  --min-moves 6 --max-moves 30 (set both equal for a fixed budget)
Balance: --win-rate MIN,MAX --three-rate MIN,MAX --total-exp N
         --retry-win-median MIN,MAX --retry-three-median MIN,MAX (total attempts)
Samples: --layouts 8 --training-seeds 150 --validation-seeds 1000
         --retry-seeds 100 --retry-attempts 100

Targets/HP are proposed automatically unless --target is provided. Maps are limited to 30 moves.
3-star move cutoffs target about 60% of the budget; 2-star cutoffs target about 80%.
Star-rate bands: easy >80% (P80), medium 45–55% (P50), hard 5–15% (P10), very-hard 2–6% (P4).
First-attempt win rate is diagnostic and does not gate candidate selection.
Validation uses a single independent holdout; failed maps do not enter the catalog.
Artifacts: content/map-seeds/INDEX/{seed.json,config.json,balance.json,preview.html}
`;
function collectionTile(value) {
  const match = /^(sword|fire|lightning|spirit)(?::([45]))?$/.exec(value);
  if (!match) throw new Error('--tiles must contain tile keys with optional :4 or :5');
  return { key: match[1], ...(match[2] ? { chargeTier: Number(match[2]) } : {}) };
}
function parseRequest(args, nextIndex) {
  const opts = parseArgs(args, ['--difficulty', '--objective', '--tiles', '--target', '--index', '--name', '--seed', '--chapter', '--chapter-name',
    '--enemy-id', '--enemy-name', '--enemy-art', '--min-moves', '--max-moves', '--win-rate', '--three-rate', '--total-exp', '--layouts',
    '--training-seeds', '--validation-seeds', '--retry-seeds', '--retry-attempts', '--retry-win-median', '--retry-three-median'], ['--replace', '--help']);
  if (opts['--help']) return { help: true };
  const difficulty = opts['--difficulty'], objective = opts['--objective'];
  if (!PROFILES[difficulty]) throw new Error('--difficulty must be easy, medium, hard or very-hard');
  if (!['collect', 'battle', 'boss', 'break-rocks', 'break-seals'].includes(objective)) throw new Error('--objective must be collect, battle, boss, break-rocks or break-seals');
  const index = positiveInteger(opts['--index'] ?? nextIndex, '--index', 1, 1000);
  const bands = structuredClone(PROFILES[difficulty]);
  if (opts['--win-rate']) { bands.win = band(opts['--win-rate'], '--win-rate'); bands.exclusiveWin = false; }
  if (opts['--three-rate']) { bands.three = band(opts['--three-rate'], '--three-rate'); bands.exclusiveThree = false; }
  if (bands.three[0] > bands.win[1]) throw new Error('Three-star rate cannot exceed win rate');
  const minMoves = positiveInteger(opts['--min-moves'] ?? 6, '--min-moves', 3, 30);
  const maxMoves = positiveInteger(opts['--max-moves'] ?? 30, '--max-moves', minMoves, 30);
  const tiles = (opts['--tiles'] ?? 'sword').split(',').map(s => s.trim());
  tiles.forEach(collectionTile);
  if (new Set(tiles).size !== tiles.length) throw new Error('--tiles must contain distinct tile kind/tier pairs');
  if (objective !== 'collect' && opts['--tiles']) throw new Error('--tiles applies to collect only');
  const targetMaximum = objective === 'collect' ? 30 : ['break-rocks', 'break-seals'].includes(objective) ? 56 : 1_000_000_000;
  const targets = opts['--target'] === undefined ? null : opts['--target'].split(',').map(n => positiveInteger(n, '--target', 1, targetMaximum));
  if (targets && targets.length !== 1 && (objective !== 'collect' || targets.length !== tiles.length)) throw new Error('--target must have one value or one per collected tile');
  if (!['battle', 'boss'].includes(objective) && ['--enemy-id', '--enemy-name', '--enemy-art'].some(key => opts[key])) throw new Error('Enemy options apply to battle/boss only');
  if (opts['--chapter-name'] && !opts['--chapter']) throw new Error('--chapter-name requires --chapter');
  if (opts['--chapter'] && !/^[a-z0-9-]+$/.test(opts['--chapter'])) throw new Error('--chapter must be a lowercase chapter ID');
  const defaultQuantiles = { easy: .8, medium: .5, hard: .1, 'very-hard': .04 };
  return { policyVersion: 2, difficulty, objective, index, bands,
    starQuantile: opts['--three-rate'] ? (bands.three[0] + bands.three[1]) / 2 : defaultQuantiles[difficulty],
    winRateEnforced: false, minMoves, maxMoves, tiles, targets, fixedTargets: targets !== null,
    seed: positiveInteger(opts['--seed'] ?? (randomBytes(4).readUInt32LE() || 1), '--seed', 1, 0xffffffff),
    totalExp: positiveInteger(opts['--total-exp'] ?? (index - 1) * 60, '--total-exp', 0, 10_000_000),
    layouts: positiveInteger(opts['--layouts'] ?? 8, '--layouts', 1, 24),
    trainingSeeds: positiveInteger(opts['--training-seeds'] ?? 150, '--training-seeds', 40, 1000),
    validationSeeds: positiveInteger(opts['--validation-seeds'] ?? 1000, '--validation-seeds', 1000, 10000),
    retrySeeds: positiveInteger(opts['--retry-seeds'] ?? 100, '--retry-seeds', 20, 1000),
    retryAttempts: positiveInteger(opts['--retry-attempts'] ?? 100, '--retry-attempts', 10, 100),
    retryWinMedian: opts['--retry-win-median'] ? band(opts['--retry-win-median'], '--retry-win-median', 1, 100) : null,
    retryThreeMedian: opts['--retry-three-median'] ? band(opts['--retry-three-median'], '--retry-three-median', 1, 100) : null,
    name: opts['--name'] ?? null, replace: opts['--replace'] === true,
    chapter: opts['--chapter'] ?? null, chapterName: opts['--chapter-name'] ?? null,
    enemy: !['battle', 'boss'].includes(objective) ? null : { id: opts['--enemy-id'] ?? `${objective}-${index}`,
      name: opts['--enemy-name'] ?? (objective === 'boss' ? 'Yêu Vương' : 'Yêu Thú'), artKey: opts['--enemy-art'] ?? 'beast' } };
}
function prepareCatalog(originalConfig, catalog, request) {
  const config = structuredClone(originalConfig), existing = catalog.find(map => map.id === request.index);
  if (request.index > catalog.length + 1) throw new Error(`MAP_INDEX_GAP: next map index is ${catalog.length + 1}`);
  if (existing?.tutorial) throw new Error('TUTORIAL_MAP_PROTECTED: choose a non-tutorial or the next index');
  if (existing && !request.replace) throw new Error('MAP_EXISTS: use --replace to explicitly revise this map');
  if (!existing) {
    config.version++;
    config.levelCount = request.index;
    config.levelBaseExp.push(100);
    const last = config.chapters.at(-1);
    if (!request.chapter || request.chapter === last.id) last.lastLevelId = request.index;
    else {
      if (config.chapters.some(chapter => chapter.id === request.chapter)) throw new Error('Only the last chapter can grow');
      config.chapters.push({ id: request.chapter, name: request.chapterName ?? request.chapter,
        order: config.chapters.length + 1, firstLevelId: request.index, lastLevelId: request.index });
    }
  } else if (request.chapter && request.chapter !== existing.chapterId) throw new Error('MAP_IDENTITY_CHANGED');
  return validateContent(config);
}
function mapTemplate(config, catalog, request, shape) {
  const chapter = chapterForLevel(request.index, config), existing = catalog.find(map => map.id === request.index);
  const objectives = request.objective === 'collect' ? request.tiles.map((value, i) => {
    const { key, chargeTier } = collectionTile(value);
    return { id: `collect-${key}${chargeTier ? `-${chargeTier}` : ''}`, type: 'Collect',
      tileKind: config.tiles.find(tile => tile.key === key).id, ...(chargeTier ? { chargeTier } : {}),
      target: request.targets?.[i] ?? request.targets?.[0] ?? (chargeTier ? 1 : 15) };
  })
    : request.objective === 'break-rocks' ? [{ id: 'break-rocks', type: 'BreakRocks', target: request.targets?.[0] ?? shape.rockCount }]
    : request.objective === 'break-seals' ? [{ id: 'break-seals', type: 'BreakSeals', target: request.targets?.[0] ?? shape.sealCount }]
    : [{ id: 'main', type: request.objective === 'boss' ? 'Boss' : 'Battle', target: request.targets?.[0] ?? 500, enemy: request.enemy }];
  return versionMap({ contentVersion: config.version, id: request.index, chapterId: chapter.id,
    orderInChapter: request.index - chapter.firstLevelId + 1, name: request.name ?? existing?.name ?? `Map ${request.index}`, difficulty: request.difficulty,
    layout: shape.layout, initialSeals: shape.sealCells ?? [], objectives, moves: request.maxMoves, baseExp: config.levelBaseExp[request.index - 1],
    starThresholds: { mode: 'percentage', threeStarBelowPercent: 61, twoStarBelowPercent: 81 },
    spawnPolicy: { weights: Object.fromEntries(config.normalTileIds.map(id => [id, 100])), collectionPressure: 0,
      comboChance: .05, setupChance: .15, obstaclePressure: ['break-rocks', 'break-seals'].includes(request.objective) ? .15 : 0, candidates: 4 },
    retryAssistPolicy: { thresholds: [3, 5, 8], reductions: [.1, .2, .3] } }, config, (existing?.mapVersion ?? 0) + 1);
}
function saveArtifacts(directory, seed, config, report) {
  const revision = path.join(directory, 'revisions', hash(seed));
  const html = renderGeneratedMap(seed.map, config, seed, report);
  for (const target of [revision, directory]) {
    writeJSON(path.join(target, 'config.json'), contentWire(config));
    writeJSON(path.join(target, 'balance.json'), report);
    writeJSON(path.join(target, 'seed.json'), seed);
    fs.writeFileSync(path.join(target, 'preview.html'), html);
  }
}
function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) { console.log(HELP); return; }
  return withAuthoringLock(() => {
    const configFile = path.join(ROOT, 'content', 'game-config.json'), mapsFile = path.join(ROOT, 'content', 'game-maps.json');
    const originalConfig = validateContent(readJSON(configFile));
    const catalog = readJSON(mapsFile).map(map => validateMap(map, originalConfig));
    if (catalog.length !== originalConfig.levelCount || catalog.some((map, i) => map.id !== i + 1)) throw new Error('LOCAL_CATALOG_NOT_CONTIGUOUS');
    const request = parseRequest(args, catalog.length + 1), config = prepareCatalog(originalConfig, catalog, request);
    const directory = artifactDir(request.index);
    if (fs.existsSync(path.join(directory, 'seed.json')) && !request.replace) throw new Error('LOCAL_SEED_EXISTS: use --replace');
    console.log(`Generating map ${request.index}: ${request.difficulty}/${request.objective}; generation seed ${request.seed}`);
    try {
      const layouts = generateLayouts(request.seed, request.layouts, catalog.filter(map => map.id !== request.index));
      if (request.objective === 'break-rocks') {
        const rockId = config.tiles.find(tile => tile.key === 'rock').id;
        const counts = request.fixedTargets ? [request.targets[0]] : [2, 3, 4, 5, 6];
        const variants = [];
        for (const shape of layouts) for (const count of counts) {
          try { variants.push(...addRockObstacles([shape], request.seed, rockId, count)); } catch {}
        }
        layouts.splice(0, layouts.length, ...variants);
      } else if (request.objective === 'break-seals') {
        const counts = request.fixedTargets ? [request.targets[0]] : [2, 3, 4, 5, 6];
        const variants = [];
        for (const shape of layouts) for (const count of counts) {
          try { variants.push(...addSealObstacles([shape], request.seed, count)); } catch {}
        }
        layouts.splice(0, layouts.length, ...variants);
      }
      const templates = layouts.map(shape => ({ shape, map: mapTemplate(config, catalog, request, shape) }));
      const selected = calibrate(templates, config, request);
      const map = validateMap(selected.map, config);
      console.log(`Training selected ${map.moves} moves, targets ${map.objectives.map(o => o.target).join(', ')}. Starting independent validation and retry measurement.`);
      const report = verify(map, config, request, selected.training, selected.search);
      if (report.status !== 'passed') {
        const error = new Error(`VALIDATION_FAILED: ${report.failures.join('; ')}`);
        error.details = { map, config: contentWire(config), report }; throw error;
      }
      const seed = { format: 1, map, generation: { seed: request.seed, request, shape: selected.shape,
        sourceCatalogHash: hash(catalog), authoringConfigVersion: config.version },
        hashes: { map: hash(map), config: hash(contentWire(config)), engine: engineHash(), report: hash(report) } };
      saveArtifacts(directory, seed, config, report);
      const nextCatalog = [...catalog.filter(item => item.id !== map.id), map].sort((a, b) => a.id - b.id);
      writeJSON(mapsFile, nextCatalog); writeJSON(configFile, contentWire(config));
      console.log(`Saved content/map-seeds/${map.id}/seed.json and local catalog. Win ${(report.validation.summary.winRate * 100).toFixed(1)}%, three stars ${(report.validation.summary.starRates[3] * 100).toFixed(1)}%.`);
      console.log(`Publish: npm run maps:publish -- ${map.id}`);
      return seed;
    } catch (error) {
      const failureFile = path.join(directory, `failed-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      writeJSON(failureFile, { status: 'failed', request, error: error.message, details: error.details ?? null });
      console.error(`Failure report: ${path.relative(ROOT, failureFile)}`); throw error;
    }
  });
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { parseRequest, prepareCatalog, mapTemplate, saveArtifacts, main };
