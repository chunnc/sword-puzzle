const path = require('node:path');
const { positiveInteger, parseArgs, band, loadArtifact, hash, withAuthoringLock } = require('./map_generation.cjs');
const { verify } = require('./generate_map_balance.cjs');
const { saveArtifacts } = require('./generate_map.cjs');

function main(args = process.argv.slice(2)) {
  const opts = parseArgs(args, ['--validation-seeds', '--retry-seeds', '--retry-attempts', '--win-rate', '--three-rate', '--retry-win-median', '--retry-three-median'], ['--help'], true);
  if (opts['--help']) {
    console.log('Revalidate a frozen local seed without selecting another map.\n  npm run maps:balance -- INDEX [--validation-seeds 1000] [--retry-seeds 100] [--retry-attempts 100]\n  Optional: --win-rate MIN,MAX --three-rate MIN,MAX --retry-win-median MIN,MAX --retry-three-median MIN,MAX');
    return;
  }
  const index = positiveInteger(opts.index, 'map index', 1, 1000);
  return withAuthoringLock(() => {
    const artifact = loadArtifact(index, { checkEngine: false }), request = structuredClone(artifact.seed.verificationRequest ?? artifact.seed.generation.request);
    request.validationSeeds = positiveInteger(opts['--validation-seeds'] ?? request.validationSeeds, '--validation-seeds', 1000, 10000);
    request.retrySeeds = positiveInteger(opts['--retry-seeds'] ?? request.retrySeeds, '--retry-seeds', 20, 1000);
    request.retryAttempts = positiveInteger(opts['--retry-attempts'] ?? request.retryAttempts, '--retry-attempts', 10, 100);
    if (opts['--win-rate']) { request.bands.win = band(opts['--win-rate'], '--win-rate'); request.bands.exclusiveWin = false; }
    if (opts['--three-rate']) { request.bands.three = band(opts['--three-rate'], '--three-rate'); request.bands.exclusiveThree = false; }
    if (request.bands.three[0] > request.bands.win[1]) throw new Error('Three-star rate cannot exceed win rate');
    if (opts['--retry-win-median']) request.retryWinMedian = band(opts['--retry-win-median'], '--retry-win-median', 1, 100);
    if (opts['--retry-three-median']) request.retryThreeMedian = band(opts['--retry-three-median'], '--retry-three-median', 1, 100);
    console.log(`Revalidating saved map ${index}; no training or candidate selection.`);
    const report = verify(artifact.map, artifact.config, request, null, null);
    report.revalidation = { previousReportHash: hash(artifact.report), request };
    const seed = { ...artifact.seed, verificationRequest: request, hashes: { ...report.hashes, report: hash(report) } };
    saveArtifacts(artifact.directory, seed, artifact.config, report);
    console.log(`${report.status}: ${path.relative(process.cwd(), path.join(artifact.directory, 'balance.json'))}`);
    if (report.status !== 'passed') { console.error(report.failures.join('\n')); process.exitCode = 1; }
    return report;
  });
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { main };
